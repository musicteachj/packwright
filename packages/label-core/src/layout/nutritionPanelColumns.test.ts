/**
 * The second column is drawn where there is a second column to draw.
 *
 * Both cases here were found by looking at the panel in a browser for the first
 * time, in phase 6 stage 2a. Neither was visible to the suite: every assertion
 * about this panel was about the resolved layout the engine returned, and the
 * engine was returning exactly what it had been asked to return.
 *
 * Source: 21 CFR 101.9(e), (e)(1), (e)(2) and (e)(3), read from the eCFR on
 * 2026-09-13.
 */

import { describe, expect, it } from 'vitest'
import { layOutUsFoodLabel } from './usFoodEngine'
import { US_FOOD_CONFORMANT } from '../rules/fixtures/usFood'
import { US_FOOD_ELEMENTS, nutritionRowElementId } from '../templates/usFood'
import type { TextPrimitive } from './types'
import type { UsFoodLabelData, UsFoodNutritionFacts } from '../templates/usFood'

const withColumns = (
  columns: UsFoodNutritionFacts['columns'],
  extra: Partial<UsFoodNutritionFacts> = {},
): UsFoodLabelData => ({
  ...US_FOOD_CONFORMANT.data,
  nutritionFacts: {
    ...US_FOOD_CONFORMANT.data.nutritionFacts!,
    ...extra,
    ...(columns === undefined ? {} : { columns }),
  },
})

const layOut = (data: UsFoodLabelData) =>
  layOutUsFoodLabel({ data, stock: US_FOOD_CONFORMANT.stock })

/** The value cells of one nutrient row — the end-anchored runs, in column order. */
const valueCells = (layout: ReturnType<typeof layOut>, id: string) =>
  layout.primitives
    .filter(
      (primitive): primitive is TextPrimitive =>
        primitive.kind === 'text' &&
        primitive.elementId === nutritionRowElementId(id as never) &&
        primitive.anchor === 'end',
    )
    .sort((a, b) => a.xMm - b.xMm)
    .map((primitive) => primitive.text)

const headings = (layout: ReturnType<typeof layOut>) =>
  layout.primitives
    .filter(
      (primitive): primitive is TextPrimitive =>
        primitive.kind === 'text' &&
        primitive.elementId === US_FOOD_ELEMENTS.nutritionColumnHeading,
    )
    .map((primitive) => primitive.text)

const HEADINGS = ['Per serving', 'Per container'] as const

describe('a second column asked for with nothing to put in it', () => {
  // Reachable and ordinary: ticking the editor's checkbox seeds `headings` and
  // `basis` and reveals an empty box beside every nutrient. The figures cannot be
  // derived — deriving them would mean this tool authoring part of a regulated
  // statement — so every dual-column panel passes through this state on its way
  // to being filled in.
  const data = withColumns({ mode: 'dual', basis: 'per-container', headings: [...HEADINGS] })

  it('draws no column headings', () => {
    // (e)(1) requires headings "accurately describing the amount per serving size
    // ... that are being declared". A heading over a column that does not exist
    // describes nothing that is being declared — and the panel that resulted
    // carried "Per serving" and "Per container" above one column of numbers.
    expect(headings(layOut(data))).toEqual([])
  })

  it('draws the panel as the single-column panel it is', () => {
    // The single-column layout puts the weight on the nutrient name and the
    // percentage alone on the right; the dual layout moves the weight into the
    // column. One value cell is the single-column shape.
    expect(valueCells(layOut(data), 'iron')).toEqual(['45%'])
  })

  it('is sized as a single-column panel, not at the width of two', () => {
    // The engine sizes the panel and this module decides how many columns to
    // draw, and they keyed on different questions: the engine on
    // `columns.mode === 'dual'`, the request, and the drawing on the figures. So
    // an unfilled dual request was drawn as one column at the full information-
    // panel width instead of the illustrations' 2.5 inches. Both now ask
    // `willDrawSecondColumn`.
    const panel = layOut(data).elements.find(
      (element) => element.elementId === US_FOOD_ELEMENTS.nutritionPanel,
    )
    const single = layOut(withColumns(undefined)).elements.find(
      (element) => element.elementId === US_FOOD_ELEMENTS.nutritionPanel,
    )
    expect(panel, 'the panel must be drawn').toBeDefined()
    expect(panel!.box.widthMm).toBeCloseTo(single!.box.widthMm, 5)
  })

  it('records that a second column was asked for and not drawn', () => {
    const layout = layOut(data)
    expect(
      layout.elements.some(
        (element) => element.elementId === US_FOOD_ELEMENTS.nutritionSecondColumn,
      ),
    ).toBe(false)
    expect(layout.omissions.map((omission) => omission.elementId)).toContain(
      US_FOOD_ELEMENTS.nutritionPanel,
    )
  })
})

describe('a second column with figures in it', () => {
  const data = withColumns({
    mode: 'dual',
    basis: 'per-container',
    headings: [...HEADINGS],
    secondAmounts: { iron: 16 },
  })

  it('draws both headings and both columns', () => {
    const layout = layOut(data)
    expect(headings(layout)).toEqual([...HEADINGS])
    expect(valueCells(layout, 'iron')).toEqual(['8mg 45%', '16mg 90%'])
    expect(layout.omissions).toEqual([])
  })

  it('prints the declared percentage in the first column, not a recomputed one', () => {
    // The dual branch called `printedPercentDailyValue` for both columns, which
    // ignores `declaredPercentDv`. So the panel printed the *correct* percentage
    // while `us-food/nutrition-percent-dv` read the document and reported the
    // wrong one: the artefact and the finding contradicting each other, and the
    // mis-declared-percentage defect undrawable on any dual-column label.
    const misdeclared = withColumns(
      {
        mode: 'dual',
        basis: 'per-container',
        headings: [...HEADINGS],
        secondAmounts: { iron: 16 },
      },
      {
        declaredPercentDv: {
          ...US_FOOD_CONFORMANT.data.nutritionFacts!.declaredPercentDv,
          iron: 44,
        },
      },
    )

    const cells = valueCells(layOut(misdeclared), 'iron')
    expect(cells[0], 'the first column states what the label declares').toBe('8mg 44%')
    // The second column has no declared equivalent in `UsFoodNutritionFacts`, so
    // it derives one. The asymmetry is real rather than an oversight.
    expect(cells[1], 'the second column derives its own').toBe('16mg 90%')
  })
})

describe('figures the dual panel cannot draw', () => {
  it('says so when a second-column Calories figure is given', () => {
    // The dual branch draws Calories in its own block above the rows rather than
    // as one of them, and that block carries one figure. The rail offers a box
    // for it because it lists every nutrient, so the number is accepted, stored
    // and silently dropped — and `us-food/dual-column-form` scans nutrient rows,
    // so it cleared the panel as complete.
    //
    // Whether a dual panel *should* carry two Calories figures is a question for
    // 101.9(e)(6)(i)'s display, which is an illustration rather than a paragraph
    // and has not been read. This does not invent the drawing; it refuses to lose
    // the number quietly.
    const layout = layOut(
      withColumns({
        mode: 'dual',
        basis: 'per-container',
        headings: [...HEADINGS],
        secondAmounts: { iron: 16, calories: 375 },
      }),
    )

    expect(layout.omissions.map((omission) => omission.elementId)).toContain(
      US_FOOD_ELEMENTS.nutritionCalories,
    )
  })

  it('explains an unfilled second column without blaming the tabular display', () => {
    // Two different causes reach the same omission, and one reason was written
    // for both: "101.9(e)(6)(ii)'s dual-column tabular display is not yet built"
    // is true of a tabular panel and simply wrong about a vertical one that was
    // given no figures. An omission exists to explain itself, so the wrong
    // explanation is worse than a vague one.
    const layout = layOut(
      withColumns({ mode: 'dual', basis: 'per-container', headings: [...HEADINGS] }),
    )
    const omission = layout.omissions.find(
      (candidate) => candidate.elementId === US_FOOD_ELEMENTS.nutritionPanel,
    )

    expect(omission, 'the unfilled column must be reported').toBeDefined()
    expect(omission!.reason).toMatch(/states no amounts/i)
    expect(omission!.reason, 'the tabular display is not why this one is undrawn').not.toMatch(
      /tabular/i,
    )
  })
})
