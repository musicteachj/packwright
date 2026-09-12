/**
 * The Nutrition Facts panel, as content: what is declared, in what order,
 * rounded how, and against which Daily Value.
 *
 * Source: **21 CFR 101.9**, read from the eCFR on 2026-09-12. The figures live
 * in `fda/nutrients.ts`, each quoting the paragraph it came from; these four
 * rules measure a label against them.
 *
 * **They read the document, not the layout.** Whether 8.7 grams of fat was
 * rounded to 9 is a fact about a number, not about where ink lands — the same
 * distinction that has the GTIN check-digit rule read the document. The panel's
 * geometry is a later stage, and these rules will not change when it arrives.
 *
 * **Not modelled, and recorded rather than left unsaid:**
 *
 * - The conditional exemptions inside (c)(2)(i), (c)(3), (c)(6)(ii) and
 *   (c)(6)(iii) — saturated fat, cholesterol and the two sugars need not be
 *   declared below a threshold "if no claims are made" about them. Claims are
 *   21 CFR 101.13 and this label does not carry any, so the condition cannot be
 *   evaluated and the relaxation is not applied.
 * - Protein's percentage. 101.9(d)(7)(ii) says it "may be omitted", and where it
 *   is given, (c)(7)(ii) corrects the amount by a digestibility score no label
 *   carries. A declared protein percentage is therefore not checked.
 * - The (j) exemptions, which run to eighteen subparagraphs turning on business
 *   size, units sold and what the food is. Declared, never inferred.
 * - The *weights* of the four vitamins and minerals. 101.9(c)(8)(ii) permits
 *   "additional levels of significance" beyond the whole units (c)(8)(iv) gives,
 *   so 235 mg of potassium and 235.4 mg are both proper declarations and no
 *   single value can be demanded. Their *percentages* are checked, under
 *   (c)(8)(iii); only the weights are not.
 */

import {
  NUTRIENTS,
  NUTRIENT_IDS,
  nutrient,
  percentDailyValue,
  roundNutrientAmount,
  roundingIsCheckable,
} from '../../fda/nutrients'
import type { NutrientId } from '../../fda/nutrients'
import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { UsFoodNutritionFacts } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { finding, passed } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_NUTRITION_MISSING = 'FDA_NUTRITION_MISSING'
export const FDA_NUTRITION_NUTRIENT_MISSING = 'FDA_NUTRITION_NUTRIENT_MISSING'
export const FDA_NUTRITION_COMPLETE = 'FDA_NUTRITION_COMPLETE'
export const FDA_NUTRITION_EXEMPT = 'FDA_NUTRITION_EXEMPT'
export const FDA_NUTRITION_OUT_OF_ORDER = 'FDA_NUTRITION_OUT_OF_ORDER'
export const FDA_NUTRITION_ORDER_MET = 'FDA_NUTRITION_ORDER_MET'
export const FDA_NUTRITION_ROUNDING_WRONG = 'FDA_NUTRITION_ROUNDING_WRONG'
export const FDA_NUTRITION_ROUNDING_MET = 'FDA_NUTRITION_ROUNDING_MET'
export const FDA_NUTRITION_PERCENT_DV_WRONG = 'FDA_NUTRITION_PERCENT_DV_WRONG'
export const FDA_NUTRITION_PERCENT_DV_MET = 'FDA_NUTRITION_PERCENT_DV_MET'

const CONTENT: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(c)',
  title: 'The nutrients a nutrition label declares, and the order they run in',
}

const EXEMPTION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(j)',
  title: 'Foods exempt from nutrition labeling',
}

const PERCENT: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(d)(7)(ii)',
  title: 'The percent Daily Value column',
}

const VITAMIN_PERCENT: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(c)(8)(iii)',
  title: 'Percentages for vitamins and minerals, in 2, 5 and 10 percent increments',
}

/** The panel, where the label carries one worth measuring. */
function panelOf(data: UsFoodContext['data']): UsFoodNutritionFacts | undefined {
  return data.nutritionFacts
}

/** What the panel prints for a nutrient: stated, or derived from the analysis. */
function declaredAmount(panel: UsFoodNutritionFacts, id: NutrientId): number | undefined {
  const stated = panel.declaredAmounts?.[id]
  if (stated !== undefined) return stated
  const analysed = panel.amounts[id]
  return analysed === undefined ? undefined : roundNutrientAmount(id, analysed)
}

export const usFoodNutritionCompletenessRule: UsFoodRule = {
  id: 'us-food/nutrition-completeness',
  title: 'The nutrition label declares every nutrient 21 CFR 101.9(c) makes mandatory.',
  citation: CONTENT,
  codes: [
    FDA_NUTRITION_MISSING,
    FDA_NUTRITION_NUTRIENT_MISSING,
    FDA_NUTRITION_COMPLETE,
    FDA_NUTRITION_EXEMPT,
  ],
  appliesTo: 'us-food',

  check({ data }: UsFoodContext): Finding[] {
    const panel = panelOf(data)

    if (data.nutritionFactsExempt === true && panel === undefined) {
      return [
        passed(
          usFoodNutritionCompletenessRule,
          FDA_NUTRITION_EXEMPT,
          'The label claims an exemption from nutrition labelling, so no panel is required. ' +
            'Whether the exemption applies is a fact about the firm and the food, not about the ' +
            'label, and is not checked here.',
          US_FOOD_ELEMENTS.principalDisplayPanel,
          EXEMPTION,
        ),
      ]
    }

    if (panel === undefined) {
      return [
        finding(usFoodNutritionCompletenessRule, {
          code: FDA_NUTRITION_MISSING,
          severity: 'blocking',
          message:
            'The label bears no nutrition label. A packaged food must carry one unless § 101.9(j) ' +
            'exempts it, which this label does not claim.',
          measurement: { actual: 'no nutrition label', required: 'a nutrition label' },
          elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
        }),
      ]
    }

    // Declared *and printed*. Where the panel states an `order`, that order is
    // the printed panel — a nutrient held in `amounts` but left out of it is not
    // on the label. Reading `amounts` alone gave "All 15 mandatory nutrients are
    // declared" beside "14 nutrients run in the order 101.9(c) sets", with
    // nobody owning the line that had been dropped: the order rule narrows its
    // expectation to what is listed and delegates omissions here, and here was
    // looking somewhere else.
    const printed = (id: (typeof NUTRIENTS)[number]['id']) =>
      declaredAmount(panel, id) !== undefined && (panel.order?.includes(id) ?? true)
    const missing = NUTRIENTS.filter((entry) => !printed(entry.id))
    if (missing.length > 0) {
      return missing.map((entry) =>
        finding(usFoodNutritionCompletenessRule, {
          code: FDA_NUTRITION_NUTRIENT_MISSING,
          severity: 'violation',
          message: `The panel declares no ${entry.name}, which ${entry.reference} makes mandatory.`,
          measurement: { actual: 'not declared', required: entry.name },
          elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
        }),
      )
    }

    return [
      passed(
        usFoodNutritionCompletenessRule,
        FDA_NUTRITION_COMPLETE,
        `All ${NUTRIENTS.length} mandatory nutrients are declared.`,
        US_FOOD_ELEMENTS.principalDisplayPanel,
      ),
    ]
  },
}

export const usFoodNutritionOrderRule: UsFoodRule = {
  id: 'us-food/nutrition-order',
  title: 'The nutrition label lists its nutrients in the order 21 CFR 101.9(c) sets.',
  citation: CONTENT,
  codes: [FDA_NUTRITION_OUT_OF_ORDER, FDA_NUTRITION_ORDER_MET],
  appliesTo: 'us-food',

  check({ data }: UsFoodContext): Finding[] {
    const panel = panelOf(data)
    if (panel?.order === undefined) return []

    // 101.9(c): "nutrient information shall be presented using the nutrient
    // names specified and in the following order". Compared against the
    // regulation's order narrowed to what this panel lists, so a label that
    // omits a nutrient is reported by the completeness rule and not by this one
    // — one defect, one finding.
    const listed = panel.order
    const expected = NUTRIENT_IDS.filter((id) => listed.includes(id))
    const firstWrong = expected.findIndex((id, index) => listed[index] !== id)

    if (firstWrong >= 0) {
      const shouldBe = nutrient(expected[firstWrong]!)
      const isThere = nutrient(listed[firstWrong]!)
      return [
        finding(usFoodNutritionOrderRule, {
          code: FDA_NUTRITION_OUT_OF_ORDER,
          severity: 'violation',
          message:
            `The panel lists ${isThere?.name ?? listed[firstWrong]} where ` +
            `${shouldBe?.name ?? expected[firstWrong]} should be. 101.9(c) fixes the order of ` +
            'the nutrients, and the label may not choose its own.',
          measurement: {
            actual: listed.map((id) => nutrient(id)?.name ?? id).join(', '),
            required: expected.map((id) => nutrient(id)?.name ?? id).join(', '),
          },
          elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
        }),
      ]
    }

    return [
      passed(
        usFoodNutritionOrderRule,
        FDA_NUTRITION_ORDER_MET,
        `${listed.length} nutrients run in the order 101.9(c) sets.`,
        US_FOOD_ELEMENTS.principalDisplayPanel,
      ),
    ]
  },
}

export const usFoodNutritionRoundingRule: UsFoodRule = {
  id: 'us-food/nutrition-rounding',
  title: 'Declared amounts are rounded as 21 CFR 101.9(c) requires.',
  citation: CONTENT,
  codes: [FDA_NUTRITION_ROUNDING_WRONG, FDA_NUTRITION_ROUNDING_MET],
  appliesTo: 'us-food',

  check({ data }: UsFoodContext): Finding[] {
    const panel = panelOf(data)
    if (panel === undefined) return []

    // Only where an analysed amount exists to round. A declared figure with no
    // analysis behind it cannot be checked, and guessing that it was meant to be
    // its own unrounded value would clear every one of them.
    const checked = NUTRIENTS.filter(
      (entry) =>
        panel.amounts[entry.id] !== undefined &&
        panel.declaredAmounts?.[entry.id] !== undefined &&
        // 101.9(c)(8)(ii) permits "additional levels of significance" for the
        // vitamins and minerals, so there is no single required value to compare
        // a declaration against and this rule has nothing to say about them.
        roundingIsCheckable(entry.id),
    )
    if (checked.length === 0) return []

    const wrong = checked.flatMap((entry) => {
      const required = roundNutrientAmount(entry.id, panel.amounts[entry.id]!)
      const declared = panel.declaredAmounts![entry.id]!
      return declared === required ? [] : [{ entry, required, declared }]
    })

    if (wrong.length > 0) {
      return wrong.map(({ entry, required, declared }) =>
        finding(usFoodNutritionRoundingRule, {
          code: FDA_NUTRITION_ROUNDING_WRONG,
          severity: 'violation',
          message:
            `${entry.name} is ${panel.amounts[entry.id]} and the panel declares ${declared}. ` +
            `${entry.reference} rounds it to ${required}.`,
          measurement: { actual: String(declared), required: String(required) },
          elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
          citation: { ...CONTENT, reference: entry.reference },
        }),
      )
    }

    return [
      passed(
        usFoodNutritionRoundingRule,
        FDA_NUTRITION_ROUNDING_MET,
        `${checked.length} declared amount${checked.length === 1 ? '' : 's'} round as 101.9(c) ` +
          'requires.',
        US_FOOD_ELEMENTS.principalDisplayPanel,
      ),
    ]
  },
}

export const usFoodNutritionPercentDvRule: UsFoodRule = {
  id: 'us-food/nutrition-percent-dv',
  title: 'The percent Daily Value column is computed and rounded as 21 CFR 101.9 requires.',
  citation: PERCENT,
  codes: [FDA_NUTRITION_PERCENT_DV_WRONG, FDA_NUTRITION_PERCENT_DV_MET],
  appliesTo: 'us-food',

  check({ data }: UsFoodContext): Finding[] {
    const panel = panelOf(data)
    const stated = panel?.declaredPercentDv
    if (panel === undefined || stated === undefined) return []

    const checked = NUTRIENTS.filter(
      (entry) =>
        stated[entry.id] !== undefined &&
        entry.dailyValue !== undefined &&
        // Protein's percentage is corrected by a digestibility score no label
        // carries, so it cannot be recomputed from what is here.
        entry.id !== 'protein',
    )
    if (checked.length === 0) return []

    const wrong = checked.flatMap((entry) => {
      // 101.9(d)(7)(ii) permits **either** basis — the declared amount or the
      // actual one before rounding — and they often differ. Accepting only one
      // would report a violation against a label that took the other.
      const fromDeclared = declaredAmount(panel, entry.id)
      const fromActual = panel.amounts[entry.id]
      const permitted = [
        fromDeclared === undefined ? undefined : percentDailyValue(entry.id, fromDeclared),
        fromActual === undefined ? undefined : percentDailyValue(entry.id, fromActual),
      ].filter((value): value is number => value !== undefined)
      if (permitted.length === 0) return []

      const declared = stated[entry.id]!
      return permitted.includes(declared) ? [] : [{ entry, declared, permitted }]
    })

    if (wrong.length > 0) {
      return wrong.map(({ entry, declared, permitted }) =>
        finding(usFoodNutritionPercentDvRule, {
          code: FDA_NUTRITION_PERCENT_DV_WRONG,
          severity: 'violation',
          message:
            `${entry.name} shows ${declared}% of the Daily Value; ` +
            `${[...new Set(permitted)].sort((a, b) => a - b).join('% or ')}% is what ` +
            `${entry.dailyValue!.amount} ${entry.unit} gives.`,
          measurement: {
            actual: `${declared}%`,
            required: [...new Set(permitted)]
              .sort((a, b) => a - b)
              .map((p) => `${p}%`)
              .join(' or '),
          },
          elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
          citation: entry.dailyValue!.kind === 'rdi' ? VITAMIN_PERCENT : PERCENT,
        }),
      )
    }

    return [
      passed(
        usFoodNutritionPercentDvRule,
        FDA_NUTRITION_PERCENT_DV_MET,
        `${checked.length} percentage${checked.length === 1 ? '' : 's'} match the Daily Values, ` +
          'rounded as each nutrient’s own paragraph requires.',
        US_FOOD_ELEMENTS.principalDisplayPanel,
      ),
    ]
  },
}
