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
  NUTRITION_PANEL_TYPE,
} from '../fda/nutritionPanel'
import { NUTRIENTS, nutrient, percentDailyValue, roundNutrientAmount } from '../fda/nutrients'
import type { NutrientId } from '../fda/nutrients'
import { MM_PER_POINT } from '../geometry/units'
import { measureTextMm } from '../text/measure'
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
      elementId: US_FOOD_ELEMENTS.nutritionCalories,
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
  const listed = facts.order ?? NUTRIENTS.map((entry) => entry.id)
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
