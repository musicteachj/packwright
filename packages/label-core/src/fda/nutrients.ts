/**
 * The Nutrition Facts nutrients: what is declared, in what order, rounded how,
 * and against which Daily Value.
 *
 * Source: **21 CFR 101.9**, read from the eCFR on 2026-09-12. Every figure below
 * is quoted in the entry that carries it, because this table is the one place a
 * wrong number would be invisible: a Daily Value off by a little produces a
 * percentage that looks entirely plausible.
 *
 * **Order comes from the regulation, not from the sample label.** 101.9(c):
 * "nutrient information shall be presented using the nutrient names specified
 * and in the following order", so the order is the order of (c)(1) through
 * (c)(8) and their subparagraphs. The four vitamins and minerals are fixed
 * separately by (c)(8)(ii) — "shall include vitamin D, calcium, iron, and
 * potassium **in that order**".
 *
 * **Two different rounding rules share one column**, which is the trap here:
 *
 * - **101.9(d)(7)(ii)** — nutrients with a DRV are shown "to the nearest whole
 *   percent".
 * - **101.9(c)(8)(iii)** — vitamins and minerals are shown "to the nearest
 *   2-percent increment up to and including the 10-percent level, the nearest
 *   5-percent increment above 10 percent and up to and including the 50-percent
 *   level, and the nearest 10-percent increment above the 50-percent level".
 *
 * Applying either to both is wrong, and wrong in a way nobody notices: the two
 * agree often enough to look correct.
 *
 * DESIGN.md calls these "13 mandatory nutrients". The regulation produces
 * **fifteen** declared lines, and fifteen is what ships — the count in the plan
 * was a recollection and this is the section.
 */

/** How a declared amount is rounded, quoted from the paragraph that sets it. */
export type NutrientRounding =
  | { kind: 'calories' }
  | { kind: 'fat-grams' }
  | { kind: 'nearest'; increment: number }
  /**
   * 21 CFR 101.9(c)(8)(ii): vitamin and mineral weights use "the units of
   * measurement and the levels of significance given in paragraph (c)(8)(iv)
   * ... except that zeros following decimal points may be dropped, and
   * **additional levels of significance may be used**".
   *
   * That last clause is why this is its own kind rather than an increment. The
   * (c)(8)(iv) table gives all four mandatory figures as whole units, so whole
   * units is the baseline — but a label may legitimately be *more* precise, so
   * no single value can be demanded and a rounding rule has nothing to fail on.
   */
  | { kind: 'levels-of-significance' }
  | { kind: 'sodium' }
  | { kind: 'whole-grams' }

/** Which table the Daily Value comes from, and therefore how %DV is rounded. */
export type DailyValueKind = 'drv' | 'rdi'

/**
 * The populations whose Daily Values this table carries, named for the columns of the
 * (c)(8)(iv) and (c)(9) tables that give them.
 *
 * Source: 21 CFR 101.9(c)(8)(i), (c)(8)(iv) and (c)(9), read from the eCFR on
 * 2026-09-17, and the two tables checked against the versioner XML of the section,
 * whose markup keeps footnote markers apart from figures. (c)(8)(i): foods "represented
 * or purported to be specifically for infants through 12 months, children 1 through 3
 * years, pregnant women, and lactating women shall use the RDIs that are specified for
 * the intended group ... All other foods shall use the RDI for adults and children 4 or
 * more years of age."
 *
 * Two of the four columns, because those are the two this engine can label. Infants
 * through 12 months also change which percentages may be declared at all and drop the
 * footnote under (j)(5)(ii), and a food for both infants and toddlers needs the separate
 * declarations (c)(8)(i) describes; neither is drawn, so neither column is carried.
 * Pregnant and lactating women are a further column with no label here that uses it.
 */
export const DAILY_VALUE_POPULATIONS = [
  'adults-and-children-4-plus',
  'children-1-through-3',
] as const
export type DailyValuePopulation = (typeof DAILY_VALUE_POPULATIONS)[number]

export const NUTRIENT_IDS = [
  'calories',
  'total-fat',
  'saturated-fat',
  'trans-fat',
  'cholesterol',
  'sodium',
  'total-carbohydrate',
  'dietary-fiber',
  'total-sugars',
  'added-sugars',
  'protein',
  'vitamin-d',
  'calcium',
  'iron',
  'potassium',
] as const
export type NutrientId = (typeof NUTRIENT_IDS)[number]

export interface Nutrient {
  id: NutrientId
  /** The name 101.9 specifies. Looked up, never composed. */
  name: string
  /** `g`, `mg` or `mcg`, as the paragraph declaring it requires. */
  unit: 'g' | 'mg' | 'mcg'
  /** Indented under its parent on the label — 101.9(d)(7). */
  indented: boolean
  /** The paragraph this entry is read from, for the rule that cites it. */
  reference: string
  rounding: NutrientRounding
  /**
   * The Daily Value for each population carried, and which table it came from — the
   * same table for both, since the columns sit side by side. Absent where the regulation
   * sets none — trans fat and total sugars have no Daily Value and their %DV column is
   * blank, which is a fact about the label rather than a gap in this table.
   */
  dailyValue?: { kind: DailyValueKind; amounts: Record<DailyValuePopulation, number> }
}

/**
 * In declaration order. A `readonly` array rather than a record, because the
 * order *is* part of the regulation and a record would leave it to whoever
 * iterated.
 */
export const NUTRIENTS: readonly Nutrient[] = [
  {
    id: 'calories',
    name: 'Calories',
    unit: 'g', // not declared by weight; the unit is unused for calories
    indented: false,
    reference: '21 CFR 101.9(c)(1)',
    rounding: { kind: 'calories' },
  },
  {
    id: 'total-fat',
    name: 'Total Fat',
    unit: 'g',
    indented: false,
    reference: '21 CFR 101.9(c)(2)',
    rounding: { kind: 'fat-grams' },
    // "Fat ... 78" — 101.9(c)(9), adults and children >= 4 years.
    dailyValue: {
      kind: 'drv',
      amounts: { 'adults-and-children-4-plus': 78, 'children-1-through-3': 39 },
    },
  },
  {
    id: 'saturated-fat',
    name: 'Saturated Fat',
    unit: 'g',
    indented: true,
    reference: '21 CFR 101.9(c)(2)(i)',
    rounding: { kind: 'fat-grams' },
    dailyValue: {
      kind: 'drv',
      amounts: { 'adults-and-children-4-plus': 20, 'children-1-through-3': 10 },
    },
  },
  {
    id: 'trans-fat',
    name: 'Trans Fat',
    unit: 'g',
    indented: true,
    reference: '21 CFR 101.9(c)(2)(ii)',
    rounding: { kind: 'fat-grams' },
    // No DRV in (c)(9). The %DV cell is blank on the printed label.
  },
  {
    id: 'cholesterol',
    name: 'Cholesterol',
    unit: 'mg',
    indented: false,
    reference: '21 CFR 101.9(c)(3)',
    // "expressed in milligrams to the nearest 5-milligram increment"
    rounding: { kind: 'nearest', increment: 5 },
    dailyValue: {
      kind: 'drv',
      amounts: { 'adults-and-children-4-plus': 300, 'children-1-through-3': 300 },
    },
  },
  {
    id: 'sodium',
    name: 'Sodium',
    unit: 'mg',
    indented: false,
    reference: '21 CFR 101.9(c)(4)',
    rounding: { kind: 'sodium' },
    dailyValue: {
      kind: 'drv',
      amounts: { 'adults-and-children-4-plus': 2300, 'children-1-through-3': 1500 },
    },
  },
  {
    id: 'total-carbohydrate',
    name: 'Total Carbohydrate',
    unit: 'g',
    indented: false,
    reference: '21 CFR 101.9(c)(6)',
    rounding: { kind: 'whole-grams' },
    dailyValue: {
      kind: 'drv',
      amounts: { 'adults-and-children-4-plus': 275, 'children-1-through-3': 150 },
    },
  },
  {
    id: 'dietary-fiber',
    name: 'Dietary Fiber',
    unit: 'g',
    indented: true,
    reference: '21 CFR 101.9(c)(6)(i)',
    rounding: { kind: 'whole-grams' },
    dailyValue: {
      kind: 'drv',
      amounts: { 'adults-and-children-4-plus': 28, 'children-1-through-3': 14 },
    },
  },
  {
    id: 'total-sugars',
    name: 'Total Sugars',
    unit: 'g',
    indented: true,
    reference: '21 CFR 101.9(c)(6)(ii)',
    rounding: { kind: 'whole-grams' },
    // No DRV. Total sugars is declared by weight and carries no percentage.
  },
  {
    id: 'added-sugars',
    name: 'Added Sugars',
    unit: 'g',
    indented: true,
    reference: '21 CFR 101.9(c)(6)(iii)',
    rounding: { kind: 'whole-grams' },
    dailyValue: {
      kind: 'drv',
      amounts: { 'adults-and-children-4-plus': 50, 'children-1-through-3': 25 },
    },
  },
  {
    id: 'protein',
    name: 'Protein',
    unit: 'g',
    indented: false,
    reference: '21 CFR 101.9(c)(7)',
    rounding: { kind: 'whole-grams' },
    // 101.9(c)(7)(iii): "a value of 50 grams of protein shall be the DRV for
    // adults and children 4 or more years of age".
    //
    // Its percentage is optional — 101.9(d)(7)(ii): "the percent for protein may
    // be omitted as provided in paragraph (c)(7)". And where it *is* declared it
    // is not computed the way every other nutrient's is: the same paragraph
    // sends it to (c)(7)(ii), which corrects the amount by a digestibility score
    // this engine has no way to know. So a declared protein percentage is not
    // checked, and that is recorded rather than quietly skipped.
    dailyValue: {
      kind: 'drv',
      amounts: { 'adults-and-children-4-plus': 50, 'children-1-through-3': 13 },
    },
  },
  {
    id: 'vitamin-d',
    name: 'Vitamin D',
    unit: 'mcg',
    indented: false,
    reference: '21 CFR 101.9(c)(8)(iv)',
    rounding: { kind: 'levels-of-significance' },
    dailyValue: {
      kind: 'rdi',
      amounts: { 'adults-and-children-4-plus': 20, 'children-1-through-3': 15 },
    },
  },
  {
    id: 'calcium',
    name: 'Calcium',
    unit: 'mg',
    indented: false,
    reference: '21 CFR 101.9(c)(8)(iv)',
    rounding: { kind: 'levels-of-significance' },
    dailyValue: {
      kind: 'rdi',
      amounts: { 'adults-and-children-4-plus': 1300, 'children-1-through-3': 700 },
    },
  },
  {
    id: 'iron',
    name: 'Iron',
    unit: 'mg',
    indented: false,
    reference: '21 CFR 101.9(c)(8)(iv)',
    rounding: { kind: 'levels-of-significance' },
    dailyValue: {
      kind: 'rdi',
      amounts: { 'adults-and-children-4-plus': 18, 'children-1-through-3': 7 },
    },
  },
  {
    id: 'potassium',
    name: 'Potassium',
    unit: 'mg',
    indented: false,
    reference: '21 CFR 101.9(c)(8)(iv)',
    rounding: { kind: 'levels-of-significance' },
    dailyValue: {
      kind: 'rdi',
      amounts: { 'adults-and-children-4-plus': 4700, 'children-1-through-3': 3000 },
    },
  },
]

const BY_ID = new Map(NUTRIENTS.map((nutrient) => [nutrient.id, nutrient]))

/**
 * Whether a declared amount can be checked against a single required value.
 *
 * False for the vitamins and minerals, because 101.9(c)(8)(ii) permits
 * "additional levels of significance" — 235 mg of potassium and 235.4 mg are
 * both proper declarations, so there is no one answer to compare against. A rule
 * that rounded them to a chosen increment would report a violation against a
 * label the regulation allows, which is how this was caught: an invented 10 mg
 * increment turned 101.9(d)(8)'s own worked example, "Potassium 235 mg 6%", into
 * 240 mg.
 */
export function roundingIsCheckable(id: NutrientId): boolean {
  return BY_ID.get(id)?.rounding.kind !== 'levels-of-significance'
}

/**
 * Every amount a label may lawfully declare for this nutrient — usually one, and
 * for calories under five, two.
 *
 * `roundNutrientAmount` has to return a single number, because the renderer has
 * to draw something. A rule has no such excuse, and where the regulation offers
 * a choice it must accept either answer.
 *
 * **101.9(c)(1) is the case.** Calories are "expressed to the nearest 5-calorie
 * increment up to and including 50 calories ... except that amounts less than 5
 * calories **may** be expressed as zero." *May*, not *shall* — so an analysed 3
 * calories is lawfully declared as 5 by the main clause **or** as 0 by the
 * exception, and both appear on real labels. The rounding rule compared against
 * the single permitted value and reported the other as a violation.
 *
 * The divergence is narrower than it looks and that is why it survived: below
 * 2.5 the nearest 5-calorie increment is already zero, so the two answers differ
 * only across `[2.5, 5)`.
 *
 * No other nutrient needs this. Fat's floor at (c)(2) says "**shall** be
 * expressed as zero" and sodium's at (c)(4) states the zero as part of the
 * declaration itself, so neither offers a choice; and the gram nutrients at
 * (c)(6) round to zero and permit zero at the same threshold, which is one
 * answer arrived at twice. Their *textual* alternative — "the statement 'Contains
 * less than 1 gram' ... may be used" — is a string rather than a number and is
 * not something this comparison can express.
 */
export function permittedNutrientAmounts(id: NutrientId, value: number): readonly number[] {
  const entry = BY_ID.get(id)
  if (entry === undefined || !Number.isFinite(value)) return [value]

  const rounded = roundNutrientAmount(id, value)
  if (entry.rounding.kind !== 'calories' || value >= 5) return [rounded]

  const nearest = toNearest(value, 5)
  return nearest === rounded ? [rounded] : [rounded, nearest]
}

export function nutrient(id: string): Nutrient | undefined {
  return BY_ID.get(id as NutrientId)
}

/** Rounds half away from zero, which is what "to the nearest" means here. */
function toNearest(value: number, increment: number): number {
  const scaled = Math.abs(value) / increment
  const rounded = Math.floor(scaled + 0.5) * increment
  return Math.sign(value) * Number(rounded.toFixed(6))
}

/**
 * The amount 101.9 requires be declared for this nutrient, given the analysed
 * value.
 *
 * Each branch quotes the paragraph it implements. Where the regulation offers a
 * *permission* rather than a requirement — "amounts less than 5 calories **may**
 * be expressed as zero" — this returns the permitted value, because that is what
 * a label that takes the permission declares and a rule has to accept both.
 */
export function roundNutrientAmount(id: NutrientId, value: number): number {
  const entry = BY_ID.get(id)
  if (entry === undefined || !Number.isFinite(value)) return value

  switch (entry.rounding.kind) {
    case 'calories':
      // "to the nearest 5-calorie increment up to and including 50 calories, and
      // 10-calorie increment above 50 calories, except that amounts less than 5
      // calories may be expressed as zero."
      if (value < 5) return 0
      return value <= 50 ? toNearest(value, 5) : toNearest(value, 10)

    case 'fat-grams':
      // "Amounts shall be expressed to the nearest 0.5 (1/2) gram increment
      // below 5 grams and to the nearest gram increment above 5 grams. **If the
      // serving contains less than 0.5 gram, the content shall be expressed as
      // zero.**"
      //
      // That last sentence says *shall*, where the gram nutrients at (c)(6) and
      // (c)(7) say *may*. Treating the two alike rounded 0.4 g of fat up to 0.5
      // and reported a compliant "Total Fat 0g" as a violation — while a derived
      // panel printed the 0.5 g the regulation forbids.
      if (value < 0.5) return 0
      return value < 5 ? toNearest(value, 0.5) : toNearest(value, 1)

    case 'sodium':
      // "expressed as zero when the serving contains less than 5 milligrams,
      // to the nearest 5-milligram increment when the serving contains 5 to 140
      // milligrams, and to the nearest 10-milligram increment when the serving
      // contains greater than 140 milligrams."
      if (value < 5) return 0
      return value <= 140 ? toNearest(value, 5) : toNearest(value, 10)

    case 'whole-grams':
      // "expressed to the nearest gram, except that ... if the serving contains
      // less than 0.5 gram, the content may be expressed as zero."
      return value < 0.5 ? 0 : toNearest(value, 1)

    case 'nearest':
      return toNearest(value, entry.rounding.increment)

    case 'levels-of-significance':
      // Whole units, because that is the precision (c)(8)(iv) gives all four
      // mandatory figures at. It is a baseline and not a requirement: the same
      // paragraph permits additional significance, so `roundingIsCheckable`
      // says this value may not be enforced.
      return toNearest(value, 1)
  }
}

/**
 * The Daily Value a food for this population is labelled against, and the table it
 * comes from. Undefined where the regulation sets none.
 *
 * **The population is required, not defaulted.** Every caller must say whom the food is
 * for, because a default would let a new caller label a toddler food against adult
 * values without anything noticing — the percentages look entirely plausible either way.
 */
export function dailyValueFor(
  id: NutrientId,
  population: DailyValuePopulation,
): { amount: number; kind: DailyValueKind } | undefined {
  const dailyValue = BY_ID.get(id)?.dailyValue
  return dailyValue === undefined
    ? undefined
    : { amount: dailyValue.amounts[population], kind: dailyValue.kind }
}

/**
 * The percentage of the Daily Value, rounded as the nutrient's own table
 * requires, against the Daily Value for the population the food is for.
 * Undefined where the regulation sets no Daily Value.
 *
 * **Which amount goes in is the caller's choice, and the regulation's.**
 * 101.9(d)(7)(ii): "The percent shall be calculated by dividing **either** the
 * amount declared on the label for each nutrient **or** the actual amount of
 * each nutrient (i.e., before rounding) by the DRV for the nutrient". Two
 * permitted answers, often different — 8.7 g of fat declared as 9 g is 11
 * percent one way and 12 the other — so a rule that computed only one of them
 * would report a violation against a label that took the other.
 *
 * The two rules are 101.9(d)(7)(ii) for DRV nutrients and 101.9(c)(8)(iii) for
 * vitamins and minerals, and the difference is load-bearing. 101.9(d)(8) works
 * four examples that pin it exactly — "Vitamin D 2 mcg 10%, Calcium 260 mg 20%,
 * Iron 8 mg 45%, Potassium 235 mg 6%" — and the last of those is the only thing
 * anywhere that settles which way a tie goes: 235 of 4,700 is 5.0 percent, which
 * sits halfway between the 4 and 6 the 2-percent banding allows, and the
 * regulation prints 6.
 */
export function percentDailyValue(
  id: NutrientId,
  amount: number,
  population: DailyValuePopulation,
): number | undefined {
  const dailyValue = dailyValueFor(id, population)
  if (dailyValue === undefined || !Number.isFinite(amount)) return undefined

  const raw = (amount / dailyValue.amount) * 100
  if (dailyValue.kind === 'drv') return toNearest(raw, 1)

  if (raw <= 10) return toNearest(raw, 2)
  if (raw <= 50) return toNearest(raw, 5)
  return toNearest(raw, 10)
}

/**
 * The percentage a panel actually prints, which is not the same question.
 *
 * `percentDailyValue` answers the arithmetic — protein has a DRV of 50 grams and
 * the division works. Whether the figure may be *printed* is 101.9(d)(7)(ii),
 * which says "the percent for protein may be omitted as provided in paragraph
 * (c)(7)" and sends it to (c)(7)(ii), where the amount is corrected by a
 * digestibility score no label carries. So the panel omits it, and printing an
 * uncheckable figure would be worse than omitting a permitted one.
 *
 * It lives here because two callers need the same answer: the renderer, which
 * decides what to draw, and the editor's rail, which tells a user what the panel
 * *will* draw. Spelled twice, the rail showed a Protein percentage of 10% beside
 * a panel that printed none — a readout contradicting the preview beside it.
 */
export function printedPercentDailyValue(
  id: NutrientId,
  amount: number,
  population: DailyValuePopulation,
): number | undefined {
  if (id === 'protein') return undefined
  return percentDailyValue(id, amount, population)
}
