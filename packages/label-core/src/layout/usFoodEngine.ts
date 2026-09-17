/**
 * Resolves a US food label to millimetre geometry.
 *
 * The third engine, and the first whose geometry has to answer a regulated
 * question rather than only a legible one. 21 CFR 101.7(i) sets a minimum letter
 * height per principal-display-panel area and 101.7(f) confines the declaration
 * to the bottom 30% of that panel, so where and how large the net quantity is
 * drawn is the compliance question — not a styling default.
 *
 * **It resolves; it does not refuse**, like its two siblings. An undersized
 * declaration at the top of the panel is drawn exactly there, at exactly that
 * size, because a label that cannot be resolved cannot be measured and a rule
 * with nothing to run against can never fail. `LayoutError` stays reserved for
 * input that describes no drawing at all.
 *
 * **The compliant size is derived, the wrong one is stated.** With no
 * `netQuantityFontSizeMm`, the engine computes the em that makes the declaration
 * meet 101.7(i) for this panel, this marking method and this casing — so the
 * default label passes. Supplying the field draws that size instead, which is
 * the only way an undersized declaration reaches the rule that reports it. Same
 * shape as the GHS engine deriving a pictogram set unless one is stated.
 */

import {
  labelingSurfaceFloor,
  minNetQuantityTypeHeightMm,
  regulatedGlyphBasis,
  pdpAreaSqInches,
} from '../geometry/pdp'
import {
  fontSizeMmForGlyphHeight,
  measuredFamilyFor,
  measureTextMm,
  wrapTextMm,
} from '../text/measure'
import { roundTo } from '../geometry/units'
import { foodSourceName, majorFoodAllergen } from '../fda/allergens'
import { layOutNutritionPanel, willDrawSecondColumn } from './nutritionPanel'
import type { UsFoodLabelData } from '../templates/usFood'
import {
  US_FOOD_EGG_CARTON_PRESENTED,
  US_FOOD_ELEMENTS,
  US_FOOD_TYPE_DEFAULT,
} from '../templates/usFood'
import type { LabelStock } from '../templates/stock'
import { anchorBox, panelFor } from '../templates/stock'
import { LayoutError, assertMarginLeavesPanel } from './engine'
import type { LayoutOmission, LayoutPrimitive, ResolvedElement, ResolvedLayout } from './types'
import { UNIT_CONTAINER_STATEMENTS } from '../fda/unitContainerStatement'

/** Millimetres for an omission's prose. `rules/finding` owns the same format for
 *  findings, and `label-core`'s layout layer must not import from `rules`. */
const mmText = (value: number): string => `${roundTo(value, 2).toFixed(2)} mm`

/**
 * An omission for a block whose widest line runs past the right edge of the stock.
 *
 * The bottom-edge checks below have recorded a block drawn off the stock since
 * phase 5, but nothing looked across: `wrapTextMm` never breaks inside a word, so
 * a statement of identity reading "Supercalifragilisticexpialidociousgranola" was
 * set as one line ending 114.8 mm across a 60 mm label, recorded nowhere, and
 * cleared by `us-food/statement-of-identity`. A block that begins past the edge is
 * absent, exactly as the bottom-edge checks treat one below the label; a review of
 * this check caught it filing that case as a detail, which left export open. Every
 * block begins at the panel's left edge, so that case needs a margin as wide as
 * the stock, which `assertMarginLeavesPanel` now refuses. The branch stays so that
 * loosening the check cannot reopen an empty export.
 */
function rightOverrun(
  elementId: string,
  label: string,
  leftMm: number,
  rightMm: number,
  stockWidthMm: number,
): LayoutOmission[] {
  if (leftMm >= stockWidthMm) {
    return [
      {
        elementId,
        reason:
          `${label} begins ${mmText(leftMm)} across a ${mmText(stockWidthMm)} label, past its ` +
          'right edge, so none of it is printed.',
        scope: 'element',
      },
    ]
  }
  if (rightMm <= stockWidthMm) return []
  return [
    {
      elementId,
      reason:
        `${label} runs ${mmText(rightMm - stockWidthMm)} past the right edge of a ` +
        `${mmText(stockWidthMm)} label, so part of it is not printed.`,
      scope: 'detail',
    },
  ]
}

/** The widest of a block's lines, measured in the face they print in. */
const widestLineMm = (
  lines: readonly string[],
  fontSizeMm: number,
  fontFamily: string,
  fontWeight?: number,
): number =>
  Math.max(
    0,
    ...lines.map((line) =>
      measureTextMm(line, fontSizeMm, measuredFamilyFor(fontFamily, fontWeight)),
    ),
  )

/**
 * Width of the Nutrition Facts box. FDA's illustrations draw the standard
 * vertical display around 2.5 inches wide, and 101.9 sets no width anywhere —
 * so this is a legible default and no rule judges it, the same standing as the
 * bar weights it is drawn with.
 *
 * **The reduced displays take the whole panel.** A tabular display exists for a
 * package without "sufficient continuous vertical space" under (d)(11)(iii), so
 * being wide and short is the entire point of it — held to the vertical
 * display's 2.5 inches it had no room for a second column and stacked into one,
 * which is the shape it was chosen to avoid.
 */
const NUTRITION_PANEL_WIDTH_MM = 64

export interface UsFoodLayoutRequest {
  data: UsFoodLabelData
  stock: LabelStock
}

/**
 * Characters that make a declaration contain a fraction, which 21 CFR 101.7(h)(3)
 * measures differently: "When fractions are used, each component numeral shall
 * meet one-half the minimum height standards." This engine draws the declaration
 * as one text run and does not set numerator and denominator as separate glyphs,
 * so there is nothing for a rule to measure — hence an omission rather than a
 * silent pass. 101.7(d) limits common fractions to halves, quarters, eighths,
 * sixteenths and thirty-seconds, so the vulgar-fraction block plus a digit-slash-
 * digit pattern covers what may legitimately appear.
 */
const FRACTION = /[¼-¾⅐-⅞]|\d\s*\/\s*\d/u

function assertFinitePositive(value: number, what: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new LayoutError(`${what} must be a positive finite number, received ${value}.`)
  }
}

/** The container dimensions 21 CFR 101.1 needs to produce a panel area at all. */
function assertContainerDrawable(container: UsFoodLabelData['container']): void {
  switch (container.shape) {
    case 'rectangular':
      assertFinitePositive(container.widthMm, 'Container panel width')
      assertFinitePositive(container.heightMm, 'Container panel height')
      return
    case 'cylindrical':
      assertFinitePositive(container.heightMm, 'Container height')
      assertFinitePositive(container.circumferenceMm, 'Container circumference')
      return
    case 'other':
      assertFinitePositive(container.totalSurfaceAreaSqMm, 'Container total surface area')
      if (container.obviousPanelAreaSqMm !== undefined) {
        assertFinitePositive(container.obviousPanelAreaSqMm, 'Obvious panel area')
      }
  }
}

export function layOutUsFoodLabel(request: UsFoodLayoutRequest): ResolvedLayout {
  const { data, stock } = request

  assertFinitePositive(stock.widthMm, 'Stock width')
  assertFinitePositive(stock.heightMm, 'Stock height')
  assertMarginLeavesPanel(stock)
  // The container selects the type-size band every net-quantity rule is measured
  // against, so a nonsensical one is input that describes no drawing rather than
  // a drawing that fails. Defaulting it would fabricate a requirement.
  assertContainerDrawable(data.container)
  if (data.netQuantityFontSizeMm !== undefined) {
    assertFinitePositive(data.netQuantityFontSizeMm, 'Net quantity type size')
  }
  if (data.informationPanelFontSizeMm !== undefined) {
    assertFinitePositive(data.informationPanelFontSizeMm, 'Information panel type size')
  }
  if (data.containsStatementFontSizeMm !== undefined) {
    assertFinitePositive(data.containsStatementFontSizeMm, 'Contains statement type size')
  }

  const panel = panelFor(stock)
  const type = US_FOOD_TYPE_DEFAULT

  const primitives: LayoutPrimitive[] = []
  const elements: ResolvedElement[] = []
  const omissions: LayoutOmission[] = []
  // Top-to-bottom stack for everything but the net quantity, which is anchored.
  let cursorYMm = panel.yMm

  // The panel the placement rule measures against. It is the drawn stock's
  // panel, not a face of the container: 101.7(f) confines the declaration within
  // "the area of the label panel", and the label panel is this one. The
  // container's job is to set the type-size band, which is 101.7(i)'s question.
  elements.push({
    elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
    label: 'Principal display panel',
    box: { xMm: panel.xMm, yMm: panel.yMm, widthMm: panel.widthMm, heightMm: panel.heightMm },
  })

  // 21 CFR 101.3 — the statement of identity, stacked from the panel top. It is
  // drawn here for its own sake and because 101.7(f) requires the declaration to
  // be separated from other printed label information by a stated distance, and
  // a rule measuring that needs something to measure against.
  //
  // **Blank text draws nothing at all.** `wrapTextMm('')` returns one empty line,
  // so an absent statement of identity used to produce an invisible primitive and
  // a 7.8 mm element box — which the separation rule then measured the
  // declaration against and reported as crowded by nothing. An element that is
  // not on the label must not be in `elements`, or every rule that reads the
  // resolved layout is measuring ink that will never be printed.
  const identityLines =
    data.statementOfIdentity.trim() === ''
      ? []
      : wrapTextMm(
          data.statementOfIdentity,
          panel.widthMm,
          type.statementOfIdentityMm,
          type.fontFamily,
        )
  identityLines.forEach((line, index) => {
    primitives.push({
      kind: 'text',
      elementId: US_FOOD_ELEMENTS.statementOfIdentity,
      xMm: panel.xMm,
      // The baseline sits at the lower edge of each reserved band, so glyphs
      // grow upward into space set aside for them rather than into the line
      // above.
      baselineYMm:
        panel.yMm +
        type.statementOfIdentityMm +
        index * type.statementOfIdentityMm * type.lineHeight,
      text: line,
      fontSizeMm: type.statementOfIdentityMm,
      fontFamily: type.fontFamily,
      fontWeight: type.emphasisFontWeight,
      fill: '000000',
      anchor: 'start',
    })
  })
  if (identityLines.length > 0) {
    cursorYMm =
      panel.yMm +
      identityLines.length * type.statementOfIdentityMm * type.lineHeight +
      type.blockGapMm
    const identityHeightMm = identityLines.length * type.statementOfIdentityMm * type.lineHeight
    elements.push({
      elementId: US_FOOD_ELEMENTS.statementOfIdentity,
      label: 'Statement of identity',
      box: {
        xMm: panel.xMm,
        yMm: panel.yMm,
        widthMm: panel.widthMm,
        heightMm: identityHeightMm,
      },
    })

    // The same bounds check `stackText` performs, and for the same reason. This
    // block is drawn by its own loop rather than through that helper, so it did
    // not inherit the check — and the statement of identity was the one mandatory
    // element that could run off the substrate with nothing recording it. 21 CFR
    // 101.3(a) puts it on the principal display panel; a label whose identity is
    // printed past the bottom edge has not satisfied that, and until this said so
    // `us-food/statement-of-identity` read the document and cleared it anyway.
    const identityBottomMm = panel.yMm + identityHeightMm
    if (panel.yMm >= stock.heightMm) {
      omissions.push({
        elementId: US_FOOD_ELEMENTS.statementOfIdentity,
        reason:
          `The statement of identity begins ${mmText(panel.yMm)} down a ` +
          `${mmText(stock.heightMm)} label, past its bottom edge, so none of it is printed.`,
        scope: 'element',
      })
    } else if (identityBottomMm > stock.heightMm) {
      omissions.push({
        elementId: US_FOOD_ELEMENTS.statementOfIdentity,
        reason:
          `The statement of identity runs ${mmText(identityBottomMm - stock.heightMm)} past the ` +
          `bottom of a ${mmText(stock.heightMm)} label, so part of it is not printed.`,
        scope: 'detail',
      })
    }
    // Across as well, in the face it prints in: the statement is bold. Not when it
    // is absent already — "none of it" beside "part of it" contradicts itself.
    if (panel.yMm < stock.heightMm) {
      omissions.push(
        ...rightOverrun(
          US_FOOD_ELEMENTS.statementOfIdentity,
          'The statement of identity',
          panel.xMm,
          panel.xMm +
            widestLineMm(
              identityLines,
              type.statementOfIdentityMm,
              type.fontFamily,
              type.emphasisFontWeight,
            ),
          stock.widthMm,
        ),
      )
    }
  }

  // Drawn as one run. 15 U.S.C. 1453(a)(2) wants both systems on the panel and
  // the customary way to set them is side by side — `NET WT 12 OZ (340 g)`.
  // Whether the metric half is *present* is a question about the document, so
  // the rule that asks it reads the data rather than this string.
  const declaration = [data.netQuantity.inchPound, data.netQuantity.metric]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' ')

  const basis = regulatedGlyphBasis(declaration)
  const requiredHeightMm = minNetQuantityTypeHeightMm(
    pdpAreaSqInches(data.container),
    data.markingMethod ?? 'printed',
  )
  const fontSizeMm =
    data.netQuantityFontSizeMm ?? fontSizeMmForGlyphHeight(requiredHeightMm, type.fontFamily, basis)

  const panelTypeMm = data.informationPanelFontSizeMm ?? type.informationPanelMm

  // Both of the blocks below stack under the statement of identity in the order
  // 21 CFR 101.2(b) lists them. They share this, rather than each repeating the
  // loop above: three copies of a wrap-and-stack would be three places for the
  // baseline arithmetic to drift, and the baseline formula is the one thing in
  // this engine that a renderer cannot second-guess.
  function stackText(elementId: string, label: string, text: string, fontSizeMm: number): void {
    if (text.trim() === '') return
    const lines = wrapTextMm(text, panel.widthMm, fontSizeMm, type.fontFamily)
    const startYMm = cursorYMm
    lines.forEach((line, index) => {
      primitives.push({
        kind: 'text',
        elementId,
        xMm: panel.xMm,
        baselineYMm: startYMm + fontSizeMm + index * fontSizeMm * type.lineHeight,
        text: line,
        fontSizeMm,
        fontFamily: type.fontFamily,
        fill: '000000',
        anchor: 'start',
      })
    })
    const boxHeightMm = lines.length * fontSizeMm * type.lineHeight
    elements.push({
      elementId,
      label,
      box: { xMm: panel.xMm, yMm: startYMm, widthMm: panel.widthMm, heightMm: boxHeightMm },
    })
    cursorYMm = startYMm + boxHeightMm + type.blockGapMm

    // Nothing is clamped — a block too long for the stock is drawn running off
    // it, because moving it would hide the defect. But it must *say* so. Phase 4
    // shipped this exact hole once: a product identifier set 88.9 mm on a 74 mm
    // label, ran off the substrate, and nothing recorded it, so the label
    // reported clean while a mandatory element was missing from the artifact.
    const bottomMm = startYMm + boxHeightMm
    if (startYMm >= stock.heightMm) {
      omissions.push({
        elementId,
        reason:
          `${label} begins ${mmText(startYMm)} down a ${mmText(stock.heightMm)} label, past its ` +
          'bottom edge, so none of it is printed.',
        scope: 'element',
      })
    } else if (bottomMm > stock.heightMm) {
      omissions.push({
        elementId,
        reason:
          `${label} runs ${mmText(bottomMm - stock.heightMm)} past the bottom of a ` +
          `${mmText(stock.heightMm)} label, so part of it is not printed.`,
        scope: 'detail',
      })
    }
    if (startYMm < stock.heightMm) {
      omissions.push(
        ...rightOverrun(
          elementId,
          label,
          panel.xMm,
          panel.xMm + widestLineMm(lines, fontSizeMm, type.fontFamily),
          stock.widthMm,
        ),
      )
    }
  }

  // 21 CFR 101.9(j)(14) — an egg carton presents its nutrition information "immediately
  // beneath the carton lid or in an insert", exempt from outer carton label requirements.
  // This engine draws the outer carton and neither of those, so the panel is not drawn,
  // and says so. A detail, not an element: the carton without its panel is the whole of
  // what this label should carry, and an export of it is worth having. The omission is
  // what keeps every pass about the panel's printed figures from being issued on it.
  const relocated =
    data.nutritionExemption?.kind === 'egg-carton' ? data.nutritionExemption : undefined
  if (data.nutritionFacts !== undefined && relocated !== undefined) {
    omissions.push({
      elementId: US_FOOD_ELEMENTS.nutritionPanel,
      reason:
        'The nutrition information is presented ' +
        `${US_FOOD_EGG_CARTON_PRESENTED[relocated.presentedIn]}, as the label claims under 21 CFR ` +
        '101.9(j)(14). This engine draws neither the underside of a lid nor an insert, so the ' +
        'information is not on this label, and how it is laid out where it is presented is not ' +
        'judged.',
      scope: 'detail',
    })
  }

  // 21 CFR 101.9(d) — the Nutrition Facts panel, above the ingredient statement,
  // which is the order an information panel runs in. It is boxed and narrower
  // than the label, so it takes a width of its own rather than the panel's.
  else if (data.nutritionFacts !== undefined) {
    // The 2.5 inch figure is the illustrations' width for a panel carrying **one**
    // column of values, and no paragraph sets a panel width at all. A second
    // column has to come from somewhere, and taking it out of the nutrient names
    // is how the tabular display once ended up stacked into a single column — so a
    // dual-column panel takes the width the information panel gives it, as the
    // reduced displays do.
    // Keyed on what will be *drawn*, not on what was asked for. Reading
    // `columns.mode` here while `nutritionPanel` reads the figures left an
    // unfilled dual request drawn as a single column at the width of two.
    const singleColumnVertical =
      (data.nutritionFacts.format ?? 'vertical') === 'vertical' &&
      !willDrawSecondColumn(data.nutritionFacts)
    const panelWidthMm = singleColumnVertical
      ? Math.min(NUTRITION_PANEL_WIDTH_MM, panel.widthMm)
      : panel.widthMm
    const drawn = layOutNutritionPanel({
      facts: data.nutritionFacts,
      xMm: panel.xMm,
      yMm: cursorYMm,
      widthMm: panelWidthMm,
      fontFamily: type.fontFamily,
      emphasisFontWeight: type.emphasisFontWeight,
      availableSurfaceFloor: labelingSurfaceFloor(stock, data.container),
    })
    primitives.push(...drawn.primitives)
    elements.push(...drawn.elements)

    // The same overflow check `stackText` makes, for the same reason: a panel
    // running off the substrate is content that will not be printed, and it has
    // to say so rather than be silently absent from the artefact.
    const bottomMm = cursorYMm + drawn.heightMm
    if (cursorYMm >= stock.heightMm) {
      omissions.push({
        elementId: US_FOOD_ELEMENTS.nutritionPanel,
        reason:
          `The Nutrition Facts panel begins ${mmText(cursorYMm)} down a ` +
          `${mmText(stock.heightMm)} label, past its bottom edge, so none of it is printed.`,
        scope: 'element',
      })
    } else if (bottomMm > stock.heightMm) {
      omissions.push({
        elementId: US_FOOD_ELEMENTS.nutritionPanel,
        reason:
          `The Nutrition Facts panel runs ${mmText(bottomMm - stock.heightMm)} past the bottom ` +
          `of a ${mmText(stock.heightMm)} label, so part of it is not printed.`,
        scope: 'detail',
      })
    }

    // A second column asked for and not drawn, said out loud.
    //
    // 101.9(e)(6)(ii) illustrates a dual-column *tabular* panel and the type table
    // carries its figures, but the tabular branch draws one column. Silence there
    // would be the worst of the three outcomes: the label would look finished, and
    // the rule that judges it reads the layout, so it would report the column
    // missing without anything saying *why* it is missing. Every GHS label omits
    // its pictogram glyphs and says so; this is the same admission.
    if (
      data.nutritionFacts.columns?.mode === 'dual' &&
      !drawn.elements.some(
        (element) => element.elementId === US_FOOD_ELEMENTS.nutritionSecondColumn,
      )
    ) {
      // Two different reasons reach here and they are not interchangeable. One
      // said "101.9(e)(6)(ii)'s dual-column tabular display is not yet built" for
      // both, which is true of a tabular panel and simply wrong about a vertical
      // one that was given no figures — and an omission exists to explain itself,
      // so the wrong explanation is worse than a vague one.
      const noFiguresGiven = !willDrawSecondColumn(data.nutritionFacts)
      omissions.push({
        elementId: US_FOOD_ELEMENTS.nutritionPanel,
        reason: noFiguresGiven
          ? 'The label asks for a second column of nutrition information and states no amounts ' +
            'for it, so the panel is drawn with the one column it has figures for. The second ' +
            'column’s amounts have to be entered; they cannot be derived from the first.'
          : 'The label asks for a second column of nutrition information, which this engine draws ' +
            'only on the standard vertical display. The panel is drawn with one column, and 21 CFR ' +
            '101.9(e)(6)(ii)’s dual-column tabular display is not yet built.',
        scope: 'detail',
      })
    }

    /**
     * A Calories figure for the second column is never drawn, and says so.
     *
     * The dual branch draws Calories in its own block above the nutrient rows
     * rather than as one of them, and that block carries a single figure. So
     * `secondAmounts.calories` — which the rail offers a box for, since it lists
     * every nutrient — is accepted, stored, and silently dropped.
     *
     * Whether a dual panel should carry two Calories figures is a question for
     * 101.9(e)(6)(i)'s display, which is an illustration rather than a paragraph
     * and has not been read. So this does not invent the drawing; it refuses to
     * lose the number without saying so, which is the whole reason `LayoutOmission`
     * exists.
     */
    if (data.nutritionFacts.columns?.secondAmounts?.calories !== undefined) {
      omissions.push({
        elementId: US_FOOD_ELEMENTS.nutritionCalories,
        reason:
          'The label states a second-column Calories figure, and this engine draws Calories as a ' +
          'single figure above the nutrient rows. It is not printed.',
        scope: 'detail',
      })
    }

    // And the same check across the label, which the vertical one alone did not
    // make. The reduced displays are the ones wide enough to need it: a tabular
    // panel whose serving block crowded out its nutrient columns drew them off the
    // right-hand edge, and nothing said so, because overflow was only ever
    // measured downward. Taken from the elements rather than the primitives so it
    // reads the space the panel claimed, in the units the boxes are already in.
    const rightEdgeMm = Math.max(
      ...drawn.elements.map((element) => element.box.xMm + element.box.widthMm),
    )
    if (rightEdgeMm > stock.widthMm) {
      omissions.push({
        elementId: US_FOOD_ELEMENTS.nutritionPanel,
        reason:
          `The Nutrition Facts panel runs ${mmText(rightEdgeMm - stock.widthMm)} past the right ` +
          `edge of a ${mmText(stock.widthMm)} label, so part of it is not printed.`,
        scope: 'detail',
      })
    }

    cursorYMm = bottomMm + type.blockGapMm
  }

  // 21 CFR 101.9(j)(13)(i)(A) — a small package using its exemption bears "an address
  // or telephone number that a consumer can use to obtain the required nutrition
  // information". Drawn in the panel's place, and only where that exemption is claimed
  // and no panel is carried: a label printing a panel is not using it. Typed and never
  // composed, because "For nutrition information, call 1-800-123-4567" is the
  // regulation's example of such a line rather than a form of words it prescribes.
  //
  // Its element id sits outside the nutrition panel's prefix on purpose. 101.9 sets no
  // type size for this line, so 101.2(c)'s floor governs it like the rest of the
  // information panel — and the rules that defer to 101.9 recognise the panel by that
  // prefix.
  if (data.nutritionFacts === undefined && data.nutritionExemption?.kind === 'small-package') {
    stackText(
      US_FOOD_ELEMENTS.smallPackageContact,
      'Nutrition information contact',
      data.nutritionExemption.contactLine,
      panelTypeMm,
    )
  }

  // 21 CFR 101.9(j)(15)(iii) — a unit container in a multiunit package, using that
  // exemption, "is labeled with the statement 'This Unit Not Labeled For Retail Sale'".
  // Looked up by the wording the label claims and never typed: the words are the
  // regulation's, and a paraphrase is not the statement. Drawn in the panel's place and
  // only where no panel is carried, as the contact line is, and outside the
  // `food-nutrition-` prefix for the same reason — though its size answers to (iii)
  // rather than 101.2(c), which the rule that grants the exemption measures.
  if (data.nutritionFacts === undefined && data.nutritionExemption?.kind === 'unit-container') {
    stackText(
      US_FOOD_ELEMENTS.unitContainerStatement,
      'Unit container statement',
      UNIT_CONTAINER_STATEMENTS[data.nutritionExemption.wording],
      panelTypeMm,
    )
  }

  // 21 CFR 101.4(a)(1) — the list is drawn in the order it was given. Sorting it
  // here would make a list out of descending order impossible to draw, and that
  // list is precisely what the order rule exists to report.
  if (data.ingredients?.length) {
    // §403(w)(1)(B)'s parenthetical is drawn *inside* the list, which is why it
    // is composed here rather than by the rule that judges it: the rule reads
    // what was printed, and something has to print it. The source name comes
    // from the §201(qq) table — the one string on this label the engine is not
    // permitted to invent — and an allergen with no specific type where one is
    // required contributes no parenthetical at all, so the omission is visible
    // on the artwork rather than silently patched with a category name.
    //
    // Only where the document says to print it. Appending it wherever an
    // allergen was known would make an undeclared allergen undrawable, and the
    // rule reporting one would then be a check that clears every label.
    const names = data.ingredients.map((ingredient) => {
      if (ingredient.allergen === undefined || ingredient.declareInline !== true) {
        return ingredient.name
      }
      const source = foodSourceName(ingredient.allergen, ingredient.allergenSpecificType)
      return source === undefined ? ingredient.name : `${ingredient.name} (${source})`
    })
    const threshold = data.ingredientThreshold
    // 101.4(a)(2)'s quantifying statement sits between the ordered part of the
    // list and the grouped remainder, so it is built here rather than left to a
    // caller to type — its wording is the regulation's own example.
    // Clamped to the list. A count past its end produced
    // "INGREDIENTS: . Contains 2 percent or less of ..." — a leading empty
    // sentence — and left the order rule with nothing to examine, which it then
    // reported as a pass.
    const groupedCount = Math.min(Math.max(0, threshold?.count ?? 0), names.length)
    const ordered = names.slice(0, names.length - groupedCount)
    const grouped = names.slice(names.length - groupedCount)
    const text =
      threshold === undefined || groupedCount === 0
        ? `INGREDIENTS: ${names.join(', ')}.`
        : [
            ordered.length > 0 ? `INGREDIENTS: ${ordered.join(', ')}.` : 'INGREDIENTS:',
            `Contains ${threshold.percent} percent or less of ${grouped.join(', ')}.`,
          ].join(' ')
    stackText(US_FOOD_ELEMENTS.ingredients, 'Ingredient statement', text, panelTypeMm)
  }

  // §403(w)(1)(A) — "the word 'Contains', followed by the name of the food
  // source", printed "immediately after or [...] adjacent to the list of
  // ingredients". Drawn straight after it for that reason, and at the ingredient
  // list's own size, since the same clause requires no smaller.
  if (data.containsStatement?.length) {
    // Composed from **every** ingredient bearing the allergen, not the first.
    // Taking one meant two tree nuts could never both be named — a label with
    // almonds and walnuts drew "Contains: almonds." and the rule then reported
    // walnuts undeclared, with no route through (w)(1)(A) that could fix it.
    //
    // And an id no ingredient bears contributes nothing at all. Falling back to
    // the category name for it printed "Contains: milk." on a food containing
    // no milk — the engine composing a regulated allergen declaration the recipe
    // does not support, which is the one thing this layer must never do. It is
    // recorded as an omission so the gap is visible rather than silent.
    const sources: string[] = []
    for (const id of data.containsStatement) {
      const bearing = (data.ingredients ?? []).filter((entry) => entry.allergen === id)
      if (bearing.length === 0) {
        omissions.push({
          elementId: US_FOOD_ELEMENTS.containsStatement,
          reason:
            `The "Contains" statement names an allergen no ingredient carries, so it was not ` +
            "drawn. A declaration for an allergen that is not in the food is not this engine's " +
            'to compose.',
          scope: 'detail',
        })
        continue
      }
      for (const entry of bearing) {
        const source = foodSourceName(id, entry.allergenSpecificType)
        if (source !== undefined) {
          if (!sources.includes(source)) sources.push(source)
          continue
        }
        // §403(w)(2): tree nuts, fish and crustacean shellfish are named by their
        // specific type, and an ingredient stating none gives this statement nothing
        // to print for it. Inventing one is not this engine's to do, and saying nothing
        // let a declared statement vanish from the label with no trace — so it is
        // recorded, once for each ingredient it could not name.
        omissions.push({
          elementId: US_FOOD_ELEMENTS.containsStatement,
          reason:
            `The "Contains" statement names nothing for "${entry.name}", which contains ` +
            `${majorFoodAllergen(id)?.name ?? id} and states no specific type, and a food source ` +
            "name for it is not this engine's to invent.",
          scope: 'detail',
        })
      }
    }
    if (sources.length > 0) {
      // §403(w)(1)(A) puts the statement "immediately after or [...] adjacent to
      // the list of ingredients", so these two are not two unrelated blocks with
      // the generic gap between them. `stackText` has already advanced the cursor
      // by `blockGapMm`; where one line of the list is tighter than that, the gap
      // comes down to it.
      //
      // The adjacency rule's allowance is exactly that line advance, so below an
      // ingredient em of about 2.3 mm the fixed 3 mm exceeded it and the engine's
      // own tightest layout reported itself non-adjacent — which the project's
      // 2 mm information-panel fixture did, alongside the type-size findings it
      // was actually written for. `containsStatementGapMm` is still how a label
      // is drawn adrift on purpose.
      const listAdvanceMm = panelTypeMm * type.lineHeight
      cursorYMm -= Math.max(0, type.blockGapMm - listAdvanceMm)
      cursorYMm += data.containsStatementGapMm ?? 0
      stackText(
        US_FOOD_ELEMENTS.containsStatement,
        'Contains statement',
        `Contains: ${sources.join(', ')}.`,
        data.containsStatementFontSizeMm ?? panelTypeMm,
      )
    }
  }

  // § 101.100(a)(1) — an assortment bears, "in conjunction with the names of such
  // ingredients as are common to all packages, a statement … indicating by name other
  // ingredients which may be present". Typed and printed as given: the regulation asks
  // that it be "as informative as practicable" and not misleading, and prescribes no
  // words. Drawn after the list and any "Contains" statement rather than between them,
  // which would part the two §403(w)(1)(A) wants adjacent; "in conjunction with" names
  // no distance to keep.
  if (data.ingredientsExemption?.kind === 'assortment') {
    stackText(
      US_FOOD_ELEMENTS.assortmentStatement,
      'Assortment statement',
      data.ingredientsExemption.statement,
      panelTypeMm,
    )
  }

  // 21 CFR 101.5 — name and place of business. The qualifying phrase is printed
  // where the document carries one and omitted where it does not, so a label
  // that owes one and lacks it is drawn exactly as specified.
  if (data.responsibleFirm !== undefined) {
    const firm = data.responsibleFirm
    const named = [firm.qualifyingPhrase?.trim(), firm.name.trim()].filter(Boolean).join(' ')
    const place = [
      firm.streetAddress?.trim(),
      firm.city.trim(),
      firm.state.trim(),
      firm.zip?.trim(),
    ]
      .filter(Boolean)
      .join(', ')
    stackText(
      US_FOOD_ELEMENTS.responsibleFirm,
      'Name and place of business',
      [named, place].filter(Boolean).join(' · '),
      panelTypeMm,
    )
  }

  // A label with nothing declared draws nothing, for the reason above and for a
  // sharper one: an empty primitive measured 4.76 mm "on capital letters" and
  // passed the type-size rule, so a label carrying no net quantity at all came
  // back with three passes and a CFR citation on each. Drawing nothing lets all
  // three rules decline, and `netQuantityPresent` reports what is actually
  // wrong — that 21 CFR 101.7(a) requires a declaration and there is none.
  if (declaration !== '') {
    const declarationWidthMm = measureTextMm(declaration, fontSizeMm, type.fontFamily)
    const declarationHeightMm = fontSizeMm * type.lineHeight
    const { xMm, yMm } = anchorBox(
      data.netQuantityAnchor ?? 'bottom-centre',
      panel,
      declarationWidthMm,
      declarationHeightMm,
    )

    // **The declaration was the only drawn element with no overflow check.**
    // 101.7(i) sizes it from the *package*, not from the label, so a large
    // container on a small piece of stock derives type wider than the substrate:
    // a 1800 mm carton on the default 120 mm label put it at x −57.5 mm, entirely
    // off the artwork, while all five net-quantity rules reported it compliant.
    // A mandatory 101.7(a) element absent from the printed label and clean in the
    // findings is the same hole every other block here already plugs.
    if (xMm < 0 || xMm + declarationWidthMm > stock.widthMm) {
      omissions.push({
        elementId: US_FOOD_ELEMENTS.netQuantity,
        reason:
          `The net quantity declaration is ${mmText(declarationWidthMm)} wide on a ` +
          `${mmText(stock.widthMm)} label, so part of it is not printed. 21 CFR 101.7(i) sizes it ` +
          'from the package rather than from the label, and this package is larger than the ' +
          'artwork it is being drawn on.',
        scope: 'detail',
      })
    }

    primitives.push({
      kind: 'text',
      elementId: US_FOOD_ELEMENTS.netQuantity,
      xMm,
      baselineYMm: yMm + fontSizeMm,
      text: declaration,
      fontSizeMm,
      fontFamily: type.fontFamily,
      fill: '000000',
      anchor: 'start',
    })
    elements.push({
      elementId: US_FOOD_ELEMENTS.netQuantity,
      label: 'Net quantity of contents',
      box: { xMm, yMm, widthMm: declarationWidthMm, heightMm: declarationHeightMm },
    })
  }

  if (FRACTION.test(declaration)) {
    omissions.push({
      elementId: US_FOOD_ELEMENTS.netQuantity,
      reason:
        'The declaration contains a fraction. 21 CFR 101.7(h)(3) measures each component numeral ' +
        'against half the minimum height, and this engine sets the declaration as a single run ' +
        'rather than as separate numerator and denominator glyphs, so that half-height allowance ' +
        'is not modelled and the type-size check does not cover the fraction.',
      scope: 'detail',
    })
  }

  // The label itself is an element, so a finding about the whole panel has a box
  // to outline, the way the GHS engine records for its size rule.
  elements.unshift({
    elementId: US_FOOD_ELEMENTS.border,
    label: 'Label',
    box: { xMm: 0, yMm: 0, widthMm: stock.widthMm, heightMm: stock.heightMm },
  })

  return {
    widthMm: stock.widthMm,
    heightMm: stock.heightMm,
    primitives,
    elements,
    symbols: [],
    pictograms: [],
    omissions,
  }
}
