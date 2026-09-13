/**
 * The standard vertical Nutrition Facts display, resolved to millimetres.
 *
 * One variant, deliberately. Phase 2 built one label type before building three
 * for the same reason: if the first display is wrong, the other five are built
 * on it. 21 CFR 101.9(d) describes this one and (d)(11), (e) and (j)(13) the
 * rest.
 *
 * **Two sources with different force, and the panel keeps them apart.** Type
 * sizes come from 101.9 and are binding, so rules check them. Rule weights come
 * from FDA's illustrations and are guidance, so the renderer follows them and no
 * rule judges them — see `fda/nutritionPanel.ts` for the quotations.
 *
 * **Every row is its own element.** A finding about Added Sugars outlines the
 * Added Sugars line, not the whole panel. The GHS engine learned this the
 * expensive way: a finding pointing at an id nothing resolved set the selection
 * and silently drew nothing, so the one interaction this editor exists for
 * failed in exactly the place a user would try it.
 */

import {
  NUTRITION_FOOTNOTE,
  NUTRITION_PANEL_RULES,
  nutritionDisplayFor,
  nutritionTypeForDisplay,
} from '../fda/nutritionPanel'
import { NUTRIENTS, nutrient, percentDailyValue, roundNutrientAmount } from '../fda/nutrients'
import type { NutrientId } from '../fda/nutrients'
import { MM_PER_POINT } from '../geometry/units'
import { measureTextMm, wrapTextMm } from '../text/measure'
import { US_FOOD_ELEMENTS, nutritionRowElementId } from '../templates/usFood'
import type { UsFoodNutritionFacts } from '../templates/usFood'
import type { LayoutPrimitive, ResolvedElement } from './types'

const mmAt = (points: number, scale: number): number => points * MM_PER_POINT * scale

export interface NutritionPanelRequest {
  facts: UsFoodNutritionFacts
  xMm: number
  yMm: number
  widthMm: number
  fontFamily: string
  /** A weight, never a second family name — see `GHS_TYPE_DEFAULT`. */
  emphasisFontWeight: number
}

export interface NutritionPanelResult {
  primitives: LayoutPrimitive[]
  elements: ResolvedElement[]
  /** Total height, so the caller can stack whatever comes next. */
  heightMm: number
}

/** The nutrients this panel lists, in the order it lists them. */
function listedIds(facts: UsFoodNutritionFacts): readonly NutrientId[] {
  return facts.order ?? NUTRIENTS.map((entry) => entry.id)
}

/** What the panel prints for a nutrient: stated, or derived from the analysis. */
function amountOf(facts: UsFoodNutritionFacts, id: NutrientId): number | undefined {
  const stated = facts.declaredAmounts?.[id]
  if (stated !== undefined) return stated
  const analysed = facts.amounts[id]
  return analysed === undefined ? undefined : roundNutrientAmount(id, analysed)
}

function percentOf(facts: UsFoodNutritionFacts, id: NutrientId): number | undefined {
  const stated = facts.declaredPercentDv?.[id]
  if (stated !== undefined) return stated
  // Protein's percentage is derived from a digestibility-corrected amount under
  // 101.9(c)(7)(ii), which no label carries — so the rule declines to check it
  // and the panel must not print one either. 101.9(d)(7)(ii) says it "may be
  // omitted", and printing an uncheckable figure is worse than omitting a
  // permitted one.
  if (id === 'protein') return undefined
  const amount = amountOf(facts, id)
  return amount === undefined ? undefined : percentDailyValue(id, amount)
}

export function layOutNutritionPanel(request: NutritionPanelRequest): NutritionPanelResult {
  const { facts, xMm, widthMm, fontFamily, emphasisFontWeight } = request
  // Drawn as asked. A scale below 1 puts the panel under the minimums 101.9
  // sets, which is what the type-size rule is there to report.
  const scale = facts.typeScale ?? 1
  const mm = (points: number): number => mmAt(points, scale)
  // The display decides four of the minimums — 101.9(d)(1)(iii) and (d)(3) — so
  // the panel is drawn to the ones its own display answers to rather than to the
  // vertical set with the others bolted on afterwards. Which display it *is*
  // turns on the paragraph the package reaches it by, not on tabular-or-linear:
  // (d)(11)'s tabular display and (j)(13)(ii)(A)(1)'s are the same arrangement
  // with different figures.
  const format = facts.format ?? 'vertical'
  const NUTRITION_PANEL_TYPE = nutritionTypeForDisplay(
    nutritionDisplayFor({
      format,
      ...(facts.availableSurfaceSqInches === undefined
        ? {}
        : { availableSqInches: facts.availableSurfaceSqInches }),
      ...(facts.cannotAccommodateVertical === undefined
        ? {}
        : { cannotAccommodateVertical: facts.cannotAccommodateVertical }),
    }),
  )
  const primitives: LayoutPrimitive[] = []
  const elements: ResolvedElement[] = []

  const insetMm = NUTRITION_PANEL_RULES.boxInsetMm
  const leftMm = xMm + insetMm
  const rightMm = xMm + widthMm - insetMm
  let yMm = request.yMm + insetMm

  const text = (
    value: string,
    sizePt: number,
    options: { bold?: boolean; anchor?: 'start' | 'end'; x?: number; elementId?: string } = {},
  ): void => {
    primitives.push({
      kind: 'text',
      ...(options.elementId === undefined ? {} : { elementId: options.elementId }),
      xMm: options.x ?? leftMm,
      baselineYMm: yMm + mm(sizePt),
      text: value,
      fontSizeMm: mm(sizePt),
      fontFamily,
      ...(options.bold === true ? { fontWeight: emphasisFontWeight } : {}),
      fill: '000000',
      anchor: options.anchor ?? 'start',
    })
  }

  /** A bar. Drawn as a filled rect rather than a line, because its weight is the
   *  point of it and a stroke centred on a path would sit half outside the row. */
  const bar = (weightMm: number): void => {
    primitives.push({
      kind: 'rect',
      elementId: US_FOOD_ELEMENTS.nutritionPanel,
      xMm: leftMm,
      yMm,
      widthMm: rightMm - leftMm,
      heightMm: weightMm,
      fill: '000000',
    })
    yMm += weightMm
  }

  const row = (elementId: string, label: string, startYMm: number, heightMm: number): void => {
    elements.push({
      elementId,
      label,
      box: { xMm: leftMm, yMm: startYMm, widthMm: rightMm - leftMm, heightMm },
    })
  }

  // 101.9(j)(13)(ii)(A)(2) — the linear display: "in a tabular or ... linear
  // (i.e., string) fashion rather than in vertical columns". One run of text, so
  // it is built here and returns early rather than threading a mode through
  // every block below. Its footnote is dropped, which (j)(13)(i) permits for the
  // two small-package displays: "do not require the information in paragraphs
  // (d)(9) and (f)(5) related to the footnote, however the abbreviated footnote
  // statement '% DV = % Daily Value' may be used."
  if (format === 'linear') {
    const parts: string[] = [
      `Serving size ${facts.servingSize}`,
      ...(facts.servingsPerContainer === undefined
        ? []
        : [`${facts.servingsPerContainer} servings per container`]),
    ]
    const caloriesValue = amountOf(facts, 'calories')
    if (caloriesValue !== undefined) parts.push(`Calories ${caloriesValue}`)
    for (const id of listedIds(facts)) {
      const entry = nutrient(id)
      if (entry === undefined || entry.id === 'calories') continue
      const amount = amountOf(facts, id)
      if (amount === undefined) continue
      const percent = percentOf(facts, id)
      parts.push(
        `${entry.name} ${amount}${entry.unit}${percent === undefined ? '' : ` ${percent}%`}`,
      )
    }
    parts.push('% DV = % Daily Value')

    // (d)(2) still requires the heading. The reduced displays are excused from
    // setting it "the full width of the information provided under paragraph
    // (d)(7)" — not from carrying it. Drawn as its own primitive so it can be
    // bold and so the type-size rule has something to identify in a display
    // whose every other figure sits in one undifferentiated run.
    const headingMm = mm(NUTRITION_PANEL_TYPE.servingSizePt)
    primitives.push({
      kind: 'text',
      elementId: US_FOOD_ELEMENTS.nutritionHeading,
      xMm: leftMm,
      baselineYMm: yMm + headingMm,
      text: 'Nutrition Facts',
      fontSizeMm: headingMm,
      fontFamily,
      fontWeight: emphasisFontWeight,
      fill: '000000',
      anchor: 'start',
    })
    elements.push({
      elementId: US_FOOD_ELEMENTS.nutritionHeading,
      label: 'Nutrition Facts heading',
      box: { xMm: leftMm, yMm, widthMm: rightMm - leftMm, heightMm: headingMm * 1.3 },
    })
    yMm += headingMm * 1.3

    const startYMm = yMm
    const sizeMm = mm(NUTRITION_PANEL_TYPE.nutrientPt)
    const lines = wrapTextMm(parts.join(', ') + '.', rightMm - leftMm, sizeMm, fontFamily)
    lines.forEach((line, index) => {
      primitives.push({
        kind: 'text',
        elementId: US_FOOD_ELEMENTS.nutritionPanel,
        xMm: leftMm,
        baselineYMm: startYMm + sizeMm + index * sizeMm * 1.3,
        text: line,
        fontSizeMm: sizeMm,
        fontFamily,
        fill: '000000',
        anchor: 'start',
      })
    })
    const heightMm = startYMm - request.yMm + lines.length * sizeMm * 1.3 + insetMm
    elements.push({
      elementId: US_FOOD_ELEMENTS.nutritionPanel,
      label: 'Nutrition Facts',
      box: { xMm, yMm: request.yMm, widthMm, heightMm },
    })
    primitives.unshift({
      kind: 'rect',
      elementId: US_FOOD_ELEMENTS.nutritionPanel,
      xMm,
      yMm: request.yMm,
      widthMm,
      heightMm,
      fill: 'ffffff',
      stroke: '000000',
      strokeWidthMm: NUTRITION_PANEL_RULES.boxMm,
    })
    return { primitives, elements, heightMm }
  }

  // 101.9(d)(11) — the tabular display: the same information, arranged across
  // the label instead of down it. It exists for a package with "not sufficient
  // continuous vertical space (i.e., approximately 3 in)" under (d)(11)(iii),
  // and for a small one under (j)(13)(ii)(A)(1), so the point of it is height:
  // the serving information sits in a left-hand block and the nutrients run in
  // columns beside it rather than stacking.
  if (format === 'tabular') {
    const sizeMm = mm(NUTRITION_PANEL_TYPE.nutrientPt)
    const headingMm = mm(NUTRITION_PANEL_TYPE.caloriesWordPt)
    const lineMm = sizeMm * 1.45
    const gutterMm = measureTextMm('  ', sizeMm, fontFamily)

    // The left block: heading, servings, serving size, Calories. (d)(3) keeps
    // them together and immediately after the heading whatever the display.
    const leftLines: Array<{
      text: string
      bold: boolean
      sizeMm: number
      elementId: string
      /** Set beside the line at its own size — the Calories numeral, which
       *  (d)(1)(iii) gives a minimum the word does not share. */
      figure?: { text: string; sizeMm: number; elementId: string }
    }> = [
      {
        text: 'Nutrition Facts',
        bold: true,
        sizeMm: headingMm,
        elementId: US_FOOD_ELEMENTS.nutritionHeading,
      },
      ...(facts.servingsPerContainer === undefined
        ? []
        : [
            {
              text: `${facts.servingsPerContainer} servings per container`,
              bold: false,
              sizeMm: mm(NUTRITION_PANEL_TYPE.servingsPerContainerPt),
              elementId: US_FOOD_ELEMENTS.nutritionServings,
            },
          ]),
      {
        text: `Serving size ${facts.servingSize}`,
        bold: true,
        sizeMm: mm(NUTRITION_PANEL_TYPE.servingSizePt),
        elementId: US_FOOD_ELEMENTS.nutritionServingSize,
      },
    ]
    const calories = amountOf(facts, 'calories')
    if (calories !== undefined) {
      // The word and the numeral are two primitives on one line, not one string.
      // (d)(1)(iii) gives them separate minimums — 10 point and, on this display,
      // 22 — and a single run at one size both misdraws the line and leaves a
      // rule measuring them together able to see only the smaller.
      leftLines.push({
        text: 'Calories',
        bold: true,
        sizeMm: mm(NUTRITION_PANEL_TYPE.caloriesWordPt),
        elementId: US_FOOD_ELEMENTS.nutritionCalories,
        figure: {
          text: String(calories),
          sizeMm: mm(NUTRITION_PANEL_TYPE.caloriesFigurePt),
          elementId: US_FOOD_ELEMENTS.nutritionCaloriesFigure,
        },
      })
    }

    let leftYMm = yMm
    let leftWidthMm = 0
    for (const line of leftLines) {
      // The taller of the word and the numeral sets the baseline and the leading,
      // so a 22 point figure beside a 10 point word neither clips nor overlaps
      // the line beneath it.
      const lineHeightMm = Math.max(line.sizeMm, line.figure?.sizeMm ?? 0)
      const wordWidthMm = measureTextMm(line.text, line.sizeMm, fontFamily)
      primitives.push({
        kind: 'text',
        elementId: line.elementId,
        xMm: leftMm,
        baselineYMm: leftYMm + lineHeightMm,
        text: line.text,
        fontSizeMm: line.sizeMm,
        fontFamily,
        ...(line.bold ? { fontWeight: emphasisFontWeight } : {}),
        fill: '000000',
        anchor: 'start',
      })
      let widthMm = wordWidthMm
      if (line.figure !== undefined) {
        const gapMm = measureTextMm(' ', line.sizeMm, fontFamily)
        primitives.push({
          kind: 'text',
          elementId: line.figure.elementId,
          xMm: leftMm + wordWidthMm + gapMm,
          baselineYMm: leftYMm + lineHeightMm,
          text: line.figure.text,
          fontSizeMm: line.figure.sizeMm,
          fontFamily,
          ...(line.bold ? { fontWeight: emphasisFontWeight } : {}),
          fill: '000000',
          anchor: 'start',
        })
        widthMm += gapMm + measureTextMm(line.figure.text, line.figure.sizeMm, fontFamily)
      }
      elements.push({
        elementId: line.elementId,
        label: line.text,
        box: {
          xMm: leftMm,
          yMm: leftYMm,
          widthMm,
          heightMm: lineHeightMm * 1.3,
        },
      })
      leftWidthMm = Math.max(leftWidthMm, widthMm)
      leftYMm += lineHeightMm * 1.3
    }

    // The nutrients, in as many columns as the remaining width takes. This is
    // the arrangement (d)(11) is for; the regulation shows a sample and states
    // no column count, so the count follows the space rather than a figure this
    // engine would be inventing.
    const rows = listedIds(facts).flatMap((id) => {
      const entry = nutrient(id)
      if (entry === undefined || entry.id === 'calories') return []
      const amount = amountOf(facts, id)
      if (amount === undefined) return []
      const percent = percentOf(facts, id)
      return [
        {
          id,
          entry,
          text: `${entry.name} ${amount}${entry.unit}${percent === undefined ? '' : ` ${percent}%`}`,
        },
      ]
    })
    const columnMm =
      rows.length === 0
        ? 0
        : Math.max(...rows.map((r) => measureTextMm(r.text, sizeMm, fontFamily)))
    // The nutrients go beside the serving block where there is room for at least
    // one column of them, and beneath it where there is not.
    //
    // They used to go beside it unconditionally. On a 60 mm label whose serving
    // block takes 42 of them the remaining width is negative, the column count
    // clamped to one, and the rows were still drawn from the right-hand edge of
    // the block outward — past the panel, past the substrate, and with no
    // omission recorded, so every mandatory nutrient was absent from the artefact
    // while the completeness rule reported the panel complete. Content that will
    // not be printed has to either move or say so.
    const besideMm = rightMm - (leftMm + leftWidthMm + gutterMm)
    const beside = rows.length === 0 || besideMm >= columnMm
    const nutrientsXMm = beside ? leftMm + leftWidthMm + gutterMm : leftMm
    const nutrientsTopMm = beside ? yMm : leftYMm
    // n columns occupy n widths and n-1 gutters, so the gutter is added to both
    // sides of the division rather than to the column alone.
    const availableMm = rightMm - nutrientsXMm
    const columns = Math.max(1, Math.floor((availableMm + gutterMm) / (columnMm + gutterMm)))
    const perColumn = Math.ceil(rows.length / columns)

    rows.forEach((row, index) => {
      const column = Math.floor(index / perColumn)
      const rowInColumn = index % perColumn
      const xRowMm = nutrientsXMm + column * (columnMm + gutterMm)
      const yRowMm = nutrientsTopMm + rowInColumn * lineMm
      const elementId = nutritionRowElementId(row.id)
      primitives.push({
        kind: 'text',
        elementId,
        xMm: xRowMm,
        baselineYMm: yRowMm + sizeMm,
        text: row.text,
        fontSizeMm: sizeMm,
        fontFamily,
        ...(row.entry.indented ? {} : { fontWeight: emphasisFontWeight }),
        fill: '000000',
        anchor: 'start',
      })
      elements.push({
        elementId,
        label: row.entry.name,
        box: { xMm: xRowMm, yMm: yRowMm, widthMm: columnMm, heightMm: lineMm },
      })
    })

    const columnsHeightMm = perColumn * lineMm
    // Measured from wherever the columns actually start, which is no longer always
    // the top of the block: below it, the panel is as tall as both stacked.
    const bodyBottomMm = Math.max(leftYMm, nutrientsTopMm + columnsHeightMm)

    // (j)(13)(i) drops the footnote for the small-package displays; (d)(11)'s
    // tabular display is not one of them, so it keeps the abbreviated statement
    // rather than nothing.
    const footnoteMm = mm(NUTRITION_PANEL_TYPE.footnotePt)
    primitives.push({
      kind: 'text',
      elementId: US_FOOD_ELEMENTS.nutritionFootnote,
      xMm: leftMm,
      baselineYMm: bodyBottomMm + footnoteMm + NUTRITION_PANEL_RULES.hairlineLeadingMm,
      text: '*% DV = % Daily Value',
      fontSizeMm: footnoteMm,
      fontFamily,
      fill: '000000',
      anchor: 'start',
    })
    const heightMm = bodyBottomMm + footnoteMm * 1.3 + insetMm * 2 - request.yMm
    elements.push({
      elementId: US_FOOD_ELEMENTS.nutritionFootnote,
      label: 'Daily Value footnote',
      box: {
        xMm: leftMm,
        yMm: bodyBottomMm,
        widthMm: rightMm - leftMm,
        heightMm: footnoteMm * 1.3,
      },
    })
    primitives.unshift({
      kind: 'rect',
      elementId: US_FOOD_ELEMENTS.nutritionPanel,
      xMm,
      yMm: request.yMm,
      widthMm,
      heightMm,
      fill: 'ffffff',
      stroke: '000000',
      strokeWidthMm: NUTRITION_PANEL_RULES.boxMm,
    })
    elements.unshift({
      elementId: US_FOOD_ELEMENTS.nutritionPanel,
      label: 'Nutrition Facts',
      box: { xMm, yMm: request.yMm, widthMm, heightMm },
    })
    return { primitives, elements, heightMm }
  }

  // 101.9(d)(2) — the heading, no smaller than all other print bar the Calories
  // figure.
  const headingStart = yMm
  text('Nutrition Facts', NUTRITION_PANEL_TYPE.headingPt, {
    bold: true,
    elementId: US_FOOD_ELEMENTS.nutritionHeading,
  })
  yMm += mm(NUTRITION_PANEL_TYPE.headingPt) * 1.15
  row(
    US_FOOD_ELEMENTS.nutritionHeading,
    'Nutrition Facts heading',
    headingStart,
    yMm - headingStart,
  )

  // 101.9(d)(1)(v): "A hairline rule that is centered between the lines of text
  // **shall** separate 'Nutrition Facts' from the servings per container
  // statement". A requirement, and the panel was drawing nothing there — the
  // same hairline it draws between nutrient rows, in the one other place the
  // same sentence puts it.
  yMm += NUTRITION_PANEL_RULES.hairlineLeadingMm
  primitives.push({
    kind: 'rect',
    elementId: US_FOOD_ELEMENTS.nutritionPanel,
    xMm: leftMm,
    yMm,
    widthMm: rightMm - leftMm,
    heightMm: NUTRITION_PANEL_RULES.hairlineMm,
    fill: '000000',
  })
  yMm += NUTRITION_PANEL_RULES.hairlineMm + NUTRITION_PANEL_RULES.hairlineLeadingMm

  // 101.9(d)(3)(i) and (ii).
  if (facts.servingsPerContainer !== undefined) {
    const start = yMm
    text(
      `${facts.servingsPerContainer} servings per container`,
      NUTRITION_PANEL_TYPE.servingsPerContainerPt,
      {
        elementId: US_FOOD_ELEMENTS.nutritionServings,
      },
    )
    yMm += mm(NUTRITION_PANEL_TYPE.servingsPerContainerPt + 1)
    row(US_FOOD_ELEMENTS.nutritionServings, 'Servings per container', start, yMm - start)
  }

  const servingStart = yMm
  text('Serving size', NUTRITION_PANEL_TYPE.servingSizePt, {
    bold: true,
    elementId: US_FOOD_ELEMENTS.nutritionServingSize,
  })
  text(facts.servingSize, NUTRITION_PANEL_TYPE.servingSizePt, {
    bold: true,
    anchor: 'end',
    x: rightMm,
    elementId: US_FOOD_ELEMENTS.nutritionServingSize,
  })
  yMm += mm(NUTRITION_PANEL_TYPE.servingSizePt + 1)
  row(US_FOOD_ELEMENTS.nutritionServingSize, 'Serving size', servingStart, yMm - servingStart)

  bar(NUTRITION_PANEL_RULES.thickMm)

  // 101.9(d)(4) and (d)(5).
  text('Amount per serving', NUTRITION_PANEL_TYPE.nutrientPt, { bold: true })
  yMm += mm(NUTRITION_PANEL_TYPE.nutrientPt + 1)

  const caloriesStart = yMm
  const calories = amountOf(facts, 'calories')
  text('Calories', NUTRITION_PANEL_TYPE.caloriesWordPt, {
    bold: true,
    elementId: US_FOOD_ELEMENTS.nutritionCalories,
  })
  if (calories !== undefined) {
    text(String(calories), NUTRITION_PANEL_TYPE.caloriesFigurePt, {
      bold: true,
      anchor: 'end',
      x: rightMm,
      // Its own id: (d)(1)(iii)'s 22 point minimum is the numeral's alone, and a
      // rule measuring it under the word's id would only ever see the word.
      elementId: US_FOOD_ELEMENTS.nutritionCaloriesFigure,
    })
  }
  yMm += mm(NUTRITION_PANEL_TYPE.caloriesFigurePt) * 1.1
  row(US_FOOD_ELEMENTS.nutritionCalories, 'Calories', caloriesStart, yMm - caloriesStart)

  bar(NUTRITION_PANEL_RULES.mediumMm)

  // 101.9(d)(6) — the column heading, right of the nutrient names.
  text('% Daily Value*', NUTRITION_PANEL_TYPE.nutrientPt, {
    bold: true,
    anchor: 'end',
    x: rightMm,
  })
  yMm += mm(NUTRITION_PANEL_TYPE.nutrientPt + NUTRITION_PANEL_TYPE.nutrientLeadingPt)

  // 101.9(d)(7) — the nutrient rows, in the order the panel states or the order
  // 101.9(c) sets. Drawn in the stated order rather than sorted, because a panel
  // listing them wrongly is what the order rule exists to report.
  const listed = listedIds(facts)
  const vitaminsStart = listed.findIndex((id) => nutrient(id)?.dailyValue?.kind === 'rdi')

  let drawnRows = 0
  listed.forEach((id, index) => {
    const entry = nutrient(id)
    if (entry === undefined || entry.id === 'calories') return

    // 101.9(c)(8) separates the vitamins and minerals from the rest by a bar.
    //
    // The hairline is "centered between nutrients", so it goes between rows that
    // were drawn and not above the first of them. Keying it off the loop index
    // put one under the "% Daily Value" heading, because Calories occupies index
    // 0 and is drawn in its own block further up — a rule where no printed
    // Nutrition Facts label has one.
    if (index === vitaminsStart) bar(NUTRITION_PANEL_RULES.thickMm)
    else if (drawnRows > 0) {
      // "¼ pt rule centered between nutrients (2 pt leading above and below)".
      yMm += NUTRITION_PANEL_RULES.hairlineLeadingMm
      primitives.push({
        kind: 'rect',
        elementId: US_FOOD_ELEMENTS.nutritionPanel,
        xMm: leftMm,
        yMm,
        widthMm: rightMm - leftMm,
        heightMm: NUTRITION_PANEL_RULES.hairlineMm,
        fill: '000000',
      })
      yMm += NUTRITION_PANEL_RULES.hairlineMm + NUTRITION_PANEL_RULES.hairlineLeadingMm
    }

    const start = yMm
    const elementId = nutritionRowElementId(id)
    const amount = amountOf(facts, id)
    const label = amount === undefined ? entry.name : `${entry.name} ${amount}${entry.unit}`
    const indentMm = entry.indented
      ? measureTextMm('  ', mm(NUTRITION_PANEL_TYPE.nutrientPt), fontFamily)
      : 0

    text(label, NUTRITION_PANEL_TYPE.nutrientPt, {
      bold: !entry.indented,
      x: leftMm + indentMm,
      elementId,
    })
    const percent = percentOf(facts, id)
    if (percent !== undefined) {
      text(`${percent}%`, NUTRITION_PANEL_TYPE.nutrientPt, {
        bold: true,
        anchor: 'end',
        x: rightMm,
        elementId,
      })
    }
    yMm += mm(NUTRITION_PANEL_TYPE.nutrientPt + NUTRITION_PANEL_TYPE.nutrientLeadingPt)
    row(elementId, entry.name, start, yMm - start)
    drawnRows += 1
  })

  // 101.9(d)(9) — the footnote, beneath the vitamins and separated by a bar. Its
  // wording is codified and is looked up, never composed.
  bar(NUTRITION_PANEL_RULES.thickMm)
  const footnoteStart = yMm
  const footnoteSizeMm = mm(NUTRITION_PANEL_TYPE.footnotePt)
  const words = NUTRITION_FOOTNOTE.standard.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`
    if (line !== '' && measureTextMm(candidate, footnoteSizeMm, fontFamily) > rightMm - leftMm) {
      lines.push(line)
      line = word
    } else line = candidate
  }
  if (line !== '') lines.push(line)
  for (const footnoteLine of lines) {
    text(footnoteLine, NUTRITION_PANEL_TYPE.footnotePt, {
      elementId: US_FOOD_ELEMENTS.nutritionFootnote,
    })
    yMm += mm(NUTRITION_PANEL_TYPE.footnotePt + NUTRITION_PANEL_TYPE.footnoteLeadingPt)
  }
  row(
    US_FOOD_ELEMENTS.nutritionFootnote,
    'Daily Value footnote',
    footnoteStart,
    yMm - footnoteStart,
  )

  yMm += insetMm
  const heightMm = yMm - request.yMm

  // "All labels enclosed by ½ point box rule." Drawn **first** — `unshift` puts
  // it at the head of the list — so its opaque white fill sits under everything
  // rather than painting over the bars.
  primitives.unshift({
    kind: 'rect',
    elementId: US_FOOD_ELEMENTS.nutritionPanel,
    xMm,
    yMm: request.yMm,
    widthMm,
    heightMm,
    fill: 'ffffff',
    stroke: '000000',
    strokeWidthMm: NUTRITION_PANEL_RULES.boxMm,
  })
  elements.unshift({
    elementId: US_FOOD_ELEMENTS.nutritionPanel,
    label: 'Nutrition Facts',
    box: { xMm, yMm: request.yMm, widthMm, heightMm },
  })

  return { primitives, elements, heightMm }
}
