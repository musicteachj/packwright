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
import {
  NUTRIENTS,
  nutrient,
  printedPercentDailyValue,
  roundNutrientAmount,
} from '../fda/nutrients'
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
  const amount = amountOf(facts, id)
  // Which nutrients print a percentage at all is `printedPercentDailyValue`'s
  // question, not this one's — the editor's rail has to give the same answer, and
  // when the rule was spelled here alone it did not.
  return amount === undefined ? undefined : printedPercentDailyValue(id, amount)
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
  const display = nutritionDisplayFor(facts)
  const NUTRITION_PANEL_TYPE = nutritionTypeForDisplay(display)
  /**
   * 101.9(j)(13)(i): "Foods in packages **subject to requirements of paragraphs
   * (j)(13)(ii)(A)(1) and (2)** of this section do not require the information in
   * paragraphs (d)(9) and (f)(5) related to the footnote, however the abbreviated
   * footnote statement '% DV = % Daily Value' may be used."
   *
   * Named paragraphs again, and only two of them. A tabular display reached by
   * (d)(11)(iii) is not subject to either — (d)(11) is a set of space
   * accommodations that permits the arrangement and relieves nothing — so it owes
   * the full (d)(9) footnote.
   */
  const abbreviatedFootnote = display === 'tabularSmallJ13' || display === 'linearSmallJ13'
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

  /**
   * The panel's box, and the result the caller gets back.
   *
   * Every display ends the same way and each one used to end it in its own words
   * — three copies of an eleven-line rect, and they had already drifted: the
   * linear branch `push`ed the panel element where the other two `unshift`ed it,
   * so on a linear label the panel appeared in a different place in the element
   * order `LabelTextView` reads out. Three copies about to become four is the
   * reason to lift it now rather than after.
   *
   * **The rect is unshifted, not pushed.** Its fill is opaque white, so drawn
   * last it would paint over every bar and rule in the panel. First in the list
   * it sits under them.
   */
  const finish = (heightMm: number): NutritionPanelResult => {
    elements.unshift({
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

  // 101.9(j)(13)(ii)(A)(2) — the linear display: "in a tabular or ... linear
  // (i.e., string) fashion rather than in vertical columns". One run of text, so
  // it is built here and returns early rather than threading a mode through
  // every block below. Its footnote is dropped, which (j)(13)(i) permits for the
  // two small-package displays: "do not require the information in paragraphs
  // (d)(9) and (f)(5) related to the footnote, however the abbreviated footnote
  // statement '% DV = % Daily Value' may be used."
  if (format === 'linear') {
    // **Every part of the run answers to a minimum of its own, and the linear
    // display is named in each of those exceptions.** (d)(3)(i) and (ii) put the
    // two servings lines at 9 point "in ... the linear display for small packages
    // as shown in paragraph (j)(13)(ii)(A)(2)"; (d)(1)(iii) puts the Calories word
    // at 10 and its numeral at 14 in the same breath; (d)(7)(iii) puts the
    // nutrients at 8. Drawn as one string at one size the run satisfied none of
    // them — the numeral came out at 8 where 14 is required — and left the
    // type-size rule with nothing it could identify, so a panel at any size at all
    // went unreported. It is a flow of spans now, each set at its own minimum and
    // carrying its own id, which is what makes both the drawing and the check
    // possible.
    interface Span {
      text: string
      sizeMm: number
      bold: boolean
      elementId: string
      label: string
    }
    const spans: Span[] = []
    const span = (text: string, pt: number, bold: boolean, elementId: string, label: string) => {
      spans.push({ text, sizeMm: mm(pt), bold, elementId, label })
    }
    // The separator is appended to the span before it rather than given a run of
    // its own, so it is set in that span's size instead of introducing a third.
    const comma = (): void => {
      const last = spans[spans.length - 1]
      if (last !== undefined) last.text += ', '
    }

    span(
      `Serving size ${facts.servingSize}`,
      NUTRITION_PANEL_TYPE.servingSizePt,
      true,
      US_FOOD_ELEMENTS.nutritionServingSize,
      'Serving size',
    )
    if (facts.servingsPerContainer !== undefined) {
      comma()
      span(
        `${facts.servingsPerContainer} servings per container`,
        NUTRITION_PANEL_TYPE.servingsPerContainerPt,
        false,
        US_FOOD_ELEMENTS.nutritionServings,
        'Servings per container',
      )
    }
    const caloriesValue = amountOf(facts, 'calories')
    if (caloriesValue !== undefined) {
      comma()
      span(
        'Calories ',
        NUTRITION_PANEL_TYPE.caloriesWordPt,
        true,
        US_FOOD_ELEMENTS.nutritionCalories,
        'Calories',
      )
      span(
        String(caloriesValue),
        NUTRITION_PANEL_TYPE.caloriesFigurePt,
        true,
        US_FOOD_ELEMENTS.nutritionCaloriesFigure,
        'Calories',
      )
    }
    for (const id of listedIds(facts)) {
      const entry = nutrient(id)
      if (entry === undefined || entry.id === 'calories') continue
      const amount = amountOf(facts, id)
      if (amount === undefined) continue
      const percent = percentOf(facts, id)
      comma()
      span(
        `${entry.name} ${amount}${entry.unit}${percent === undefined ? '' : ` ${percent}%`}`,
        NUTRITION_PANEL_TYPE.nutrientPt,
        !entry.indented,
        nutritionRowElementId(id),
        entry.name,
      )
    }
    comma()
    span(
      '% DV = % Daily Value.',
      NUTRITION_PANEL_TYPE.footnotePt,
      false,
      US_FOOD_ELEMENTS.nutritionFootnote,
      'Daily Value note',
    )

    // (d)(2) still requires the heading. The reduced displays are excused from
    // setting it "the full width of the information provided under paragraph
    // (d)(7)" — not from carrying it. Drawn as its own primitive so it can be
    // bold and so the type-size rule has something to identify.
    //
    // Its size is taken from the spans rather than stated, because (d)(2) asks
    // for "no smaller than all other print size in the nutrition label except for
    // the numerical information for 'Calories'" — a relative requirement the
    // engine satisfies by construction only if it is actually computed. Once the
    // parts stopped being one size, the serving-size figure it used to borrow was
    // no longer the largest of them.
    const headingMm = Math.max(
      ...spans
        .filter((s) => s.elementId !== US_FOOD_ELEMENTS.nutritionCaloriesFigure)
        .map((s) => s.sizeMm),
    )
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
    // Flowed word by word rather than span by span, so a long nutrient name
    // breaks where a reader would break it instead of the whole span jumping to
    // the next line. Each piece keeps the trailing space that followed it, which
    // is what sets the gap to the next word at the right size.
    const flowed: Array<Span & { xMm: number; line: number }> = []
    const lineHeightsMm: number[] = []
    let line = 0
    let cursorMm = leftMm
    for (const part of spans) {
      for (const piece of part.text.match(/\S+\s*/g) ?? []) {
        const inkMm = measureTextMm(piece.trimEnd(), part.sizeMm, fontFamily)
        if (cursorMm > leftMm && cursorMm + inkMm > rightMm) {
          line += 1
          cursorMm = leftMm
        }
        flowed.push({ ...part, text: piece, xMm: cursorMm, line })
        lineHeightsMm[line] = Math.max(lineHeightsMm[line] ?? 0, part.sizeMm)
        cursorMm += measureTextMm(piece, part.sizeMm, fontFamily)
      }
    }

    // Lines are as tall as the largest span on them, so a 14 point numeral does
    // not overprint the 8 point row beneath it.
    const lineTopMm = (index: number): number => {
      let top = startYMm
      for (let i = 0; i < index; i += 1) top += (lineHeightsMm[i] ?? 0) * 1.3
      return top
    }

    const boxes = new Map<
      string,
      { label: string; x0: number; y0: number; x1: number; y1: number }
    >()
    for (const piece of flowed) {
      const top = lineTopMm(piece.line)
      const tall = lineHeightsMm[piece.line] ?? piece.sizeMm
      primitives.push({
        kind: 'text',
        elementId: piece.elementId,
        xMm: piece.xMm,
        // A common baseline per line, so spans of different sizes sit on it
        // rather than each floating at its own height.
        baselineYMm: top + tall,
        text: piece.text,
        fontSizeMm: piece.sizeMm,
        fontFamily,
        ...(piece.bold ? { fontWeight: emphasisFontWeight } : {}),
        fill: '000000',
        anchor: 'start',
      })
      const seen = boxes.get(piece.elementId)
      boxes.set(piece.elementId, {
        label: seen?.label ?? piece.label,
        x0: Math.min(seen?.x0 ?? Infinity, piece.xMm),
        y0: Math.min(seen?.y0 ?? Infinity, top),
        x1: Math.max(
          seen?.x1 ?? -Infinity,
          piece.xMm + measureTextMm(piece.text, piece.sizeMm, fontFamily),
        ),
        y1: Math.max(seen?.y1 ?? -Infinity, top + tall * 1.3),
      })
    }
    // One element per part, so a finding about Sodium can outline the words that
    // say Sodium. Before this the whole run was a single `nutritionPanel`, and a
    // finding about any one nutrient had nothing of its own to point at.
    for (const [elementId, box] of boxes) {
      elements.push({
        elementId,
        label: box.label,
        box: { xMm: box.x0, yMm: box.y0, widthMm: box.x1 - box.x0, heightMm: box.y1 - box.y0 },
      })
    }

    return finish(lineTopMm(lineHeightsMm.length) - request.yMm + insetMm)
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
      /** Omitted for the subheadings, which the vertical display draws without an
       *  element of their own too — they are labels on the panel, not findings
       *  sites. */
      elementId?: string
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
    // 101.9(d)(4): "A subheading 'Amount per serving' **shall** be separated from
    // the serving size information by a bar ... except this information is not
    // required for the dual column formats shown in paragraphs (e)(5), (e)(6)(i),
    // and (e)(6)(ii)". Those three are the only exception, so every tabular
    // display owes it, and this one was not drawing it at all.
    leftLines.push({
      text: 'Amount per serving',
      bold: true,
      sizeMm: mm(NUTRITION_PANEL_TYPE.nutrientPt),
    })

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
        ...(line.elementId === undefined ? {} : { elementId: line.elementId }),
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
      if (line.elementId !== undefined) {
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
      }
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
    const headingTopMm = beside ? yMm : leftYMm

    // 101.9(d)(6): the column heading "% Daily Value," followed by an asterisk,
    // "**shall** be separated from information on calories by a bar ... The
    // position of this column heading shall allow for a list of nutrient names and
    // amounts ... to be to the left of, and below, this column heading." No
    // exception is stated for any display, and this one was drawing none.
    const dvHeadingMm = mm(NUTRITION_PANEL_TYPE.nutrientPt)
    primitives.push({
      kind: 'text',
      elementId: US_FOOD_ELEMENTS.nutritionPanel,
      xMm: rightMm,
      baselineYMm: headingTopMm + dvHeadingMm,
      text: '% Daily Value*',
      fontSizeMm: dvHeadingMm,
      fontFamily,
      fontWeight: emphasisFontWeight,
      fill: '000000',
      anchor: 'end',
    })
    const nutrientsTopMm = headingTopMm + dvHeadingMm * 1.3
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

    // The footnote (d)(9) requires, or the abbreviation (j)(13)(i) permits in its
    // place — and only the two small-package displays may make that substitution.
    // The comment here used to reason that (d)(11)'s tabular display "is not one
    // of them, so it keeps the abbreviated statement rather than nothing", which
    // inverts the paragraph: not being one of them is precisely what makes the
    // full footnote due. It had been printing the abbreviation on every tabular
    // display, and no rule checks the footnote, so nothing said otherwise.
    const footnoteMm = mm(NUTRITION_PANEL_TYPE.footnotePt)
    const footnoteTopMm = bodyBottomMm + NUTRITION_PANEL_RULES.hairlineLeadingMm
    const footnoteLines = abbreviatedFootnote
      ? ['*% DV = % Daily Value']
      : wrapTextMm(NUTRITION_FOOTNOTE.standard, rightMm - leftMm, footnoteMm, fontFamily)
    footnoteLines.forEach((footnoteLine, index) => {
      primitives.push({
        kind: 'text',
        elementId: US_FOOD_ELEMENTS.nutritionFootnote,
        xMm: leftMm,
        baselineYMm: footnoteTopMm + footnoteMm + index * footnoteMm * 1.3,
        text: footnoteLine,
        fontSizeMm: footnoteMm,
        fontFamily,
        fill: '000000',
        anchor: 'start',
      })
    })
    const footnoteHeightMm = footnoteLines.length * footnoteMm * 1.3
    const heightMm = bodyBottomMm + footnoteHeightMm + insetMm * 2 - request.yMm
    elements.push({
      elementId: US_FOOD_ELEMENTS.nutritionFootnote,
      label: 'Daily Value footnote',
      box: {
        xMm: leftMm,
        yMm: bodyBottomMm,
        widthMm: rightMm - leftMm,
        heightMm: footnoteHeightMm,
      },
    })
    return finish(heightMm)
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
  /**
   * 101.9(e) — the dual-column display, where the panel carries one.
   *
   * (e)(3): "the quantitative information by weight and the percent Daily Value
   * **shall** be presented in two columns and the columns **shall** be separated
   * by vertical lines". So each column carries both figures, and the nutrient
   * name sits to the left of both — which is why the single-column layout's
   * right-aligned percentage is not simply repeated.
   *
   * (e)(1): "Following the serving size information there **shall** be two or more
   * column headings accurately describing the amount per serving size". Their
   * wording is the labeller's — "Per 1/4 cup mix" and "Per prepared portion" are
   * the regulation's own examples — so they are printed as given and never
   * composed here.
   */
  const dual = facts.columns?.mode === 'dual'
  const valueColumnMm = dual ? (rightMm - leftMm) * 0.26 : 0
  const columnRightMm = dual ? [rightMm - valueColumnMm - mm(2), rightMm] : [rightMm]
  const columnLeftMm = columnRightMm.map((right) => right - valueColumnMm)

  if (dual) {
    const headings = facts.columns?.headings
    if (headings !== undefined) {
      headings.forEach((heading, index) => {
        text(heading, NUTRITION_PANEL_TYPE.nutrientPt, {
          bold: true,
          anchor: 'end',
          x: columnRightMm[index]!,
          elementId: US_FOOD_ELEMENTS.nutritionColumnHeading,
        })
      })
      row(
        US_FOOD_ELEMENTS.nutritionColumnHeading,
        'Column headings',
        yMm,
        mm(NUTRITION_PANEL_TYPE.nutrientPt) * 1.3,
      )
      yMm += mm(NUTRITION_PANEL_TYPE.nutrientPt + NUTRITION_PANEL_TYPE.nutrientLeadingPt)
    }
  }

  text('% Daily Value*', NUTRITION_PANEL_TYPE.nutrientPt, {
    bold: true,
    anchor: 'end',
    x: rightMm,
  })
  yMm += mm(NUTRITION_PANEL_TYPE.nutrientPt + NUTRITION_PANEL_TYPE.nutrientLeadingPt)
  const nutrientBlockTopMm = yMm

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

    // In a dual column the weight belongs *in* the column beside the percentage,
    // not appended to the name — (e)(3) presents "the quantitative information by
    // weight and the percent Daily Value" together, per column.
    text(dual ? entry.name : label, NUTRITION_PANEL_TYPE.nutrientPt, {
      bold: !entry.indented,
      x: leftMm + indentMm,
      elementId,
    })
    if (dual) {
      const second = facts.columns?.secondAmounts?.[id]
      const declared = [amount, second === undefined ? undefined : roundNutrientAmount(id, second)]
      declared.forEach((value, column) => {
        if (value === undefined) return
        const percent = printedPercentDailyValue(id, value)
        // (e)'s "equal prominence" is a requirement, so the second column is set
        // at the first's size unless the label asks for something else.
        const columnPt =
          column === 1
            ? NUTRITION_PANEL_TYPE.nutrientPt * (facts.columns?.secondColumnTypeScale ?? 1)
            : NUTRITION_PANEL_TYPE.nutrientPt
        text(`${value}${entry.unit}${percent === undefined ? '' : ` ${percent}%`}`, columnPt, {
          bold: true,
          anchor: 'end',
          x: columnRightMm[column]!,
          elementId,
        })
      })
    } else {
      const percent = percentOf(facts, id)
      if (percent !== undefined) {
        text(`${percent}%`, NUTRITION_PANEL_TYPE.nutrientPt, {
          bold: true,
          anchor: 'end',
          x: rightMm,
          elementId,
        })
      }
    }
    yMm += mm(NUTRITION_PANEL_TYPE.nutrientPt + NUTRITION_PANEL_TYPE.nutrientLeadingPt)
    row(elementId, entry.name, start, yMm - start)
    drawnRows += 1
  })

  if (dual) {
    // The band itself, emitted whenever a second set of values was drawn and
    // **independent of the lines beside it**. A rule asks the layout what the
    // panel carries; conflating "there are two columns" with "they are separated"
    // made a panel drawn without (e)(3)'s lines look like a panel with one
    // column, so the mandate rule reported the column missing and the form rule
    // that should have reported the lines declined.
    elements.push({
      elementId: US_FOOD_ELEMENTS.nutritionSecondColumn,
      label: 'Second column of values',
      box: {
        xMm: columnLeftMm[1]!,
        yMm: nutrientBlockTopMm,
        widthMm: valueColumnMm,
        heightMm: yMm - nutrientBlockTopMm,
      },
    })

    // (e)(3)'s vertical lines, drawn once the block's extent is known. Thin rects
    // rather than strokes, for the reason `bar` gives: a stroke centred on a path
    // would sit half outside the line it is meant to be.
    if (facts.columns?.separated !== false) {
      for (const left of columnLeftMm) {
        primitives.push({
          kind: 'rect',
          elementId: US_FOOD_ELEMENTS.nutritionColumnRule,
          xMm: left - mm(1),
          yMm: nutrientBlockTopMm,
          widthMm: NUTRITION_PANEL_RULES.hairlineMm,
          heightMm: yMm - nutrientBlockTopMm,
          fill: '000000',
        })
      }
      elements.push({
        elementId: US_FOOD_ELEMENTS.nutritionColumnRule,
        label: 'Column rules',
        box: {
          xMm: columnLeftMm[0]! - mm(1),
          yMm: nutrientBlockTopMm,
          widthMm: rightMm - (columnLeftMm[0]! - mm(1)),
          heightMm: yMm - nutrientBlockTopMm,
        },
      })
    }
  }

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
  return finish(heightMm)
}
