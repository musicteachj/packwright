import { describe, expect, it } from 'vitest'
import {
  NUTRIENTS,
  NUTRIENT_IDS,
  dailyValueFor,
  nutrient,
  percentDailyValue,
  permittedNutrientAmounts,
  roundNutrientAmount,
} from './nutrients'

describe('the declared nutrients', () => {
  it('runs in the order 101.9(c) sets, not the order of the sample label', () => {
    // 101.9(c): "nutrient information shall be presented using the nutrient
    // names specified and in the following order", so the order is (c)(1)
    // through (c)(8) and their subparagraphs.
    expect(NUTRIENTS.map((n) => n.id)).toEqual([...NUTRIENT_IDS])
  })

  it('puts vitamin D, calcium, iron and potassium in that order', () => {
    // 101.9(c)(8)(ii) fixes these four explicitly and separately.
    expect(NUTRIENT_IDS.slice(-4)).toEqual(['vitamin-d', 'calcium', 'iron', 'potassium'])
  })

  it('indents exactly the nutrients that sit under a parent', () => {
    expect(NUTRIENTS.filter((n) => n.indented).map((n) => n.id)).toEqual([
      'saturated-fat',
      'trans-fat',
      'dietary-fiber',
      'total-sugars',
      'added-sugars',
    ])
  })

  it('sets no Daily Value where the regulation sets none', () => {
    // Trans fat is absent from the (c)(9) DRV table and total sugars from both
    // tables, so their %DV cell is blank on the printed label. An invented
    // figure here would fill a cell the regulation leaves empty.
    expect(NUTRIENTS.filter((n) => n.dailyValue === undefined).map((n) => n.id)).toEqual([
      'calories',
      'trans-fat',
      'total-sugars',
    ])
  })

  const adults = 'adults-and-children-4-plus' as const
  const toddlers = 'children-1-through-3' as const

  it('carries the DRVs from 101.9(c)(9) for adults and children 4 or more years', () => {
    const dv = (id: string) => dailyValueFor(id as never, adults)
    expect(dv('total-fat')).toEqual({ amount: 78, kind: 'drv' })
    expect(dv('saturated-fat')).toEqual({ amount: 20, kind: 'drv' })
    expect(dv('cholesterol')).toEqual({ amount: 300, kind: 'drv' })
    expect(dv('sodium')).toEqual({ amount: 2300, kind: 'drv' })
    expect(dv('total-carbohydrate')).toEqual({ amount: 275, kind: 'drv' })
    expect(dv('dietary-fiber')).toEqual({ amount: 28, kind: 'drv' })
    expect(dv('added-sugars')).toEqual({ amount: 50, kind: 'drv' })
    expect(dv('protein')).toEqual({ amount: 50, kind: 'drv' })
  })

  it('carries the RDIs from 101.9(c)(8)(iv)', () => {
    const dv = (id: string) => dailyValueFor(id as never, adults)
    expect(dv('vitamin-d')).toEqual({ amount: 20, kind: 'rdi' })
    expect(dv('calcium')).toEqual({ amount: 1300, kind: 'rdi' })
    expect(dv('iron')).toEqual({ amount: 18, kind: 'rdi' })
    expect(dv('potassium')).toEqual({ amount: 4700, kind: 'rdi' })
  })

  it('carries the children 1 through 3 column of both tables', () => {
    // Written out from the eCFR on 2026-09-17, where each table has a column headed
    // "Children 1 through 3 years", and checked against the versioner XML of the same
    // section, whose markup keeps the footnote markers apart from the figures. The HTML
    // text runs them together — "2 39" for fat — which is how a marker becomes a digit.
    const dv = (id: string) => dailyValueFor(id as never, toddlers)
    // (c)(9), the DRVs, based on "the reference caloric intake of 1,000 calories".
    expect(dv('total-fat')).toEqual({ amount: 39, kind: 'drv' })
    expect(dv('saturated-fat')).toEqual({ amount: 10, kind: 'drv' })
    expect(dv('cholesterol')).toEqual({ amount: 300, kind: 'drv' })
    expect(dv('sodium')).toEqual({ amount: 1500, kind: 'drv' })
    expect(dv('total-carbohydrate')).toEqual({ amount: 150, kind: 'drv' })
    expect(dv('dietary-fiber')).toEqual({ amount: 14, kind: 'drv' })
    expect(dv('added-sugars')).toEqual({ amount: 25, kind: 'drv' })
    expect(dv('protein')).toEqual({ amount: 13, kind: 'drv' })
    // (c)(8)(iv), the RDIs.
    expect(dv('vitamin-d')).toEqual({ amount: 15, kind: 'rdi' })
    expect(dv('calcium')).toEqual({ amount: 700, kind: 'rdi' })
    expect(dv('iron')).toEqual({ amount: 7, kind: 'rdi' })
    expect(dv('potassium')).toEqual({ amount: 3000, kind: 'rdi' })
  })

  it('sets no Daily Value for either population where the regulation sets none', () => {
    for (const population of [adults, toddlers]) {
      expect(dailyValueFor('trans-fat', population), population).toBeUndefined()
      expect(dailyValueFor('total-sugars', population), population).toBeUndefined()
      expect(dailyValueFor('calories', population), population).toBeUndefined()
    }
  })

  it('returns nothing for an id it does not carry', () => {
    expect(nutrient('vitamin-b12')).toBeUndefined()
    expect(nutrient('toString')).toBeUndefined()
  })
})

describe('rounding a declared amount', () => {
  // Every expectation below was worked from the quoted paragraph, not from the
  // implementation. Running the function and pasting what it said would prove
  // only that it is deterministic.

  it('rounds calories in two bands, with a zero floor — 101.9(c)(1)', () => {
    // "to the nearest 5-calorie increment up to and including 50 calories, and
    // 10-calorie increment above 50 calories, except that amounts less than 5
    // calories may be expressed as zero."
    expect(roundNutrientAmount('calories', 3)).toBe(0)
    expect(roundNutrientAmount('calories', 47)).toBe(45)
    expect(roundNutrientAmount('calories', 50)).toBe(50)
    // 52 is above 50, so the band is 10 and not 5: 50, not 55.
    expect(roundNutrientAmount('calories', 52)).toBe(50)
    expect(roundNutrientAmount('calories', 236)).toBe(240)
  })

  it('offers both lawful answers below five calories — 101.9(c)(1)', () => {
    // "may be expressed as zero", not "shall". So 3 calories is lawfully declared
    // as the nearest 5-calorie increment the main clause gives, or as the 0 the
    // exception permits, and a rule that accepted only one reported the other as a
    // violation against a compliant label.
    expect([...permittedNutrientAmounts('calories', 3)].sort((a, b) => a - b)).toEqual([0, 5])
    expect([...permittedNutrientAmounts('calories', 4.9)].sort((a, b) => a - b)).toEqual([0, 5])

    // Below 2.5 the nearest 5-calorie increment is already zero, so there is one
    // answer arrived at twice rather than a choice. This narrowness is why the
    // defect survived: the obvious small values do not show it.
    expect(permittedNutrientAmounts('calories', 2)).toEqual([0])
    expect(permittedNutrientAmounts('calories', 47)).toEqual([45])
  })

  it('offers one answer wherever the regulation states a shall — 101.9(c)(2), (c)(4)', () => {
    // Fat's floor says "shall be expressed as zero" and sodium's states the zero
    // as part of the declaration, so neither is a choice the label gets to make.
    expect(permittedNutrientAmounts('total-fat', 0.4)).toEqual([0])
    expect(permittedNutrientAmounts('sodium', 3)).toEqual([0])
  })

  it('rounds fat to half grams below 5 and whole grams above — 101.9(c)(2)', () => {
    expect(roundNutrientAmount('total-fat', 4.3)).toBe(4.5)
    expect(roundNutrientAmount('total-fat', 4.9)).toBe(5)
    expect(roundNutrientAmount('total-fat', 7.4)).toBe(7)
    expect(roundNutrientAmount('saturated-fat', 1.2)).toBe(1)
    // "If the serving contains less than 0.5 gram, the content **shall** be
    // expressed as zero" — a requirement for the fats, where the gram nutrients
    // at (c)(6) and (c)(7) get a *may*. This vector asserted 0.5 and was wrong.
    expect(roundNutrientAmount('trans-fat', 0.3)).toBe(0)
    expect(roundNutrientAmount('total-fat', 0.4)).toBe(0)
    expect(roundNutrientAmount('total-fat', 0.5)).toBe(0.5)
  })

  it('rounds cholesterol to 5 mg — 101.9(c)(3)', () => {
    expect(roundNutrientAmount('cholesterol', 12)).toBe(10)
    expect(roundNutrientAmount('cholesterol', 13)).toBe(15)
  })

  it('rounds sodium in three bands — 101.9(c)(4)', () => {
    // "zero when ... less than 5 milligrams, to the nearest 5-milligram
    // increment when the serving contains 5 to 140 milligrams, and to the
    // nearest 10-milligram increment when ... greater than 140."
    expect(roundNutrientAmount('sodium', 3)).toBe(0)
    expect(roundNutrientAmount('sodium', 137)).toBe(135)
    expect(roundNutrientAmount('sodium', 140)).toBe(140)
    // Above 140 the band is 10, and these are the values that prove it rather
    // than agreeing with the 5 mg band by luck. 148 rounds to 150 either way and
    // is therefore worth nothing as a vector; 163 does not.
    expect(roundNutrientAmount('sodium', 163)).toBe(160)
    expect(roundNutrientAmount('sodium', 145)).toBe(150)
  })

  it('rounds carbohydrate, fibre, sugars and protein to whole grams — 101.9(c)(6), (c)(7)', () => {
    expect(roundNutrientAmount('total-carbohydrate', 12.4)).toBe(12)
    expect(roundNutrientAmount('dietary-fiber', 3.6)).toBe(4)
    expect(roundNutrientAmount('total-sugars', 0.4)).toBe(0)
    expect(roundNutrientAmount('added-sugars', 0.6)).toBe(1)
    expect(roundNutrientAmount('protein', 5.5)).toBe(6)
  })
})

describe('the percent Daily Value column carries two rounding rules', () => {
  // 101.9(d)(7)(ii) for nutrients with a DRV, 101.9(c)(8)(iii) for vitamins and
  // minerals. Applying either to both is wrong in a way nobody notices, because
  // the two agree often enough to look correct.

  it('rounds a DRV nutrient to the nearest whole percent', () => {
    // 9 g of 78 is 11.538 percent.
    expect(percentDailyValue('total-fat', 9, 'adults-and-children-4-plus')).toBe(12)
    // 160 mg of 2,300 is 6.956 percent.
    expect(percentDailyValue('sodium', 160, 'adults-and-children-4-plus')).toBe(7)
    // 12 g of 50 is exactly 24.
    expect(percentDailyValue('added-sugars', 12, 'adults-and-children-4-plus')).toBe(24)
  })

  it('reproduces the four examples 101.9(d)(8) prints', () => {
    // "(e.g., Vitamin D 2 mcg 10%, Calcium 260 mg 20%, Iron 8 mg 45%, Potassium
    // 235 mg 6%)" — the regulation's own worked answers, which is the strongest
    // golden vector available for this table.
    expect(percentDailyValue('vitamin-d', 2, 'adults-and-children-4-plus')).toBe(10)
    expect(percentDailyValue('calcium', 260, 'adults-and-children-4-plus')).toBe(20)
    expect(percentDailyValue('iron', 8, 'adults-and-children-4-plus')).toBe(45)
    expect(percentDailyValue('potassium', 235, 'adults-and-children-4-plus')).toBe(6)
  })

  it('settles a tie upward, which only the potassium example proves', () => {
    // 235 of 4,700 is exactly 5.0 percent, which sits halfway between the 4 and
    // the 6 that the 2-percent banding allows. Nothing in the text says which
    // way a tie goes; the printed 6 does. Round half down and this example
    // breaks, which is the point of keeping it.
    expect((235 / 4700) * 100).toBe(5)
    expect(percentDailyValue('potassium', 235, 'adults-and-children-4-plus')).toBe(6)
  })

  it('applies the 5-percent band above 10 and the 10-percent band above 50', () => {
    // 8 of 18 is 44.4 percent, in the 5-percent band: 45.
    expect(percentDailyValue('iron', 8, 'adults-and-children-4-plus')).toBe(45)
    // 12 of 18 is 66.7 percent, in the 10-percent band: 70.
    expect(percentDailyValue('iron', 12, 'adults-and-children-4-plus')).toBe(70)
    // 1 of 20 is 5 percent, in the 2-percent band: 6, by the same tie as above.
    expect(percentDailyValue('vitamin-d', 1, 'adults-and-children-4-plus')).toBe(6)
  })

  it('would give different answers under the wrong rule, which is why both exist', () => {
    // Iron at 44.4 percent: 44 under the whole-percent rule, 45 under the
    // banded one. A single rule applied to both columns is wrong here.
    expect(percentDailyValue('iron', 8, 'adults-and-children-4-plus')).toBe(45)
    expect(Math.round((8 / 18) * 100)).toBe(44)
  })

  it('computes a food for children 1 through 3 against that column', () => {
    // 101.9(c)(8)(i): foods "represented or purported to be specifically for ...
    // children 1 through 3 years ... shall use the RDIs that are specified for the
    // intended group". Worked by hand from the column above, avoiding ties.
    const toddlers = 'children-1-through-3' as const
    // 9 g of 39 is 23.08 percent, to the whole percent: 23. For an adult, 12.
    expect(percentDailyValue('total-fat', 9, toddlers)).toBe(23)
    // 160 mg of 1,500 is 10.67 percent: 11.
    expect(percentDailyValue('sodium', 160, toddlers)).toBe(11)
    // 3 g of 14 is 21.43 percent: 21.
    expect(percentDailyValue('dietary-fiber', 3, toddlers)).toBe(21)
    // 260 mg of 700 is 37.14 percent, in the 5-percent band: 35. For an adult, 20.
    expect(percentDailyValue('calcium', 260, toddlers)).toBe(35)
    // 8 mg of 7 is 114.29 percent, in the 10-percent band: 110.
    expect(percentDailyValue('iron', 8, toddlers)).toBe(110)
    // 235 mg of 3,000 is 7.83 percent, in the 2-percent band: 8.
    expect(percentDailyValue('potassium', 235, toddlers)).toBe(8)
  })

  it('gives nothing where the regulation sets no Daily Value', () => {
    expect(percentDailyValue('trans-fat', 3, 'adults-and-children-4-plus')).toBeUndefined()
    expect(percentDailyValue('total-sugars', 12, 'adults-and-children-4-plus')).toBeUndefined()
    expect(percentDailyValue('calories', 200, 'adults-and-children-4-plus')).toBeUndefined()
  })
})
