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

import { minNetQuantityTypeHeightMm, regulatedGlyphBasis, pdpAreaSqInches } from '../geometry/pdp'
import { fontSizeMmForGlyphHeight, measureTextMm, wrapTextMm } from '../text/measure'
import { roundTo } from '../geometry/units'
import type { UsFoodLabelData } from '../templates/usFood'
import { US_FOOD_ELEMENTS, US_FOOD_TYPE_DEFAULT } from '../templates/usFood'
import type { LabelStock } from '../templates/stock'
import { anchorBox, panelFor } from '../templates/stock'
import { LayoutError } from './engine'
import type { LayoutOmission, LayoutPrimitive, ResolvedElement, ResolvedLayout } from './types'

/** Millimetres for an omission's prose. `rules/finding` owns the same format for
 *  findings, and `label-core`'s layout layer must not import from `rules`. */
const mmText = (value: number): string => `${roundTo(value, 2).toFixed(2)} mm`

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
  if (!Number.isFinite(stock.marginMm) || stock.marginMm < 0) {
    throw new LayoutError(
      `Stock margin must be a finite, non-negative number, received ${stock.marginMm}.`,
    )
  }
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
    elements.push({
      elementId: US_FOOD_ELEMENTS.statementOfIdentity,
      label: 'Statement of identity',
      box: {
        xMm: panel.xMm,
        yMm: panel.yMm,
        widthMm: panel.widthMm,
        heightMm: identityLines.length * type.statementOfIdentityMm * type.lineHeight,
      },
    })
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
  }

  // 21 CFR 101.4(a)(1) — the list is drawn in the order it was given. Sorting it
  // here would make a list out of descending order impossible to draw, and that
  // list is precisely what the order rule exists to report.
  if (data.ingredients?.length) {
    const names = data.ingredients.map((ingredient) => ingredient.name)
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
