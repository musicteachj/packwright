/**
 * The Nutrition Facts panel, as content: what is declared, in what order,
 * rounded how, and against which Daily Value.
 *
 * Source: **21 CFR 101.9**, read from the eCFR on 2026-09-12. The figures live
 * in `fda/nutrients.ts`, each quoting the paragraph it came from; these four
 * rules measure a label against them.
 *
 * **They read the document, not the layout — as a means.** The declared figures
 * are held on the document, so that is where rounding is checked. But 101.9(c)
 * says the nutrients "shall be presented" in its order and each amount is
 * "expressed" to its increment: requirements on what the panel prints, so every
 * pass here rests on the artwork. A check digit is different in kind: it belongs
 * to the number whether or not anything was printed, and a rounding does not.
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
 *   size, units sold and what the food is — and, for several, on what the label
 *   bears. (j)(13)(i)(A) puts "an address or telephone number" on the label of a
 *   small package using its exemption, and (j)(15) holds only where each unit
 *   "is labeled with the statement 'This Unit Not Labeled For Retail Sale'".
 *   Declared, never inferred, and which one is claimed is not recorded. Read from
 *   the eCFR on 2026-09-16.
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
  permittedNutrientAmounts,
  roundNutrientAmount,
  roundingIsCheckable,
} from '../../fda/nutrients'
import type { NutrientId } from '../../fda/nutrients'
import { wasFullyDrawn } from '../../layout/omissions'
import { US_FOOD_ELEMENTS, nutritionRowElementId } from '../../templates/usFood'
import type { UsFoodNutritionFacts } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork, untitled } from '../finding'
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
export const FDA_SERVING_SIZE_MISSING = 'FDA_SERVING_SIZE_MISSING'
export const FDA_SERVING_SIZE_MET = 'FDA_SERVING_SIZE_MET'

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

const SERVING_SIZE: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(d)(3)(ii)',
  title: 'The serving size declaration',
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
  citations: [CONTENT, EXEMPTION],
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
        // (j)(13)(i)(A) and (j)(15)(iii) turn on what the label bears, so the artwork.
        passedOnArtwork(
          usFoodNutritionCompletenessRule,
          FDA_NUTRITION_EXEMPT,
          'The label claims an exemption from nutrition labelling, so no panel is required. ' +
            'Which exemption applies, and whether the label bears what that exemption requires of ' +
            'it, are not checked here.',
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
      // 101.9(c): the declaration "on the label" shall contain these nutrients: the artwork.
      passedOnArtwork(
        usFoodNutritionCompletenessRule,
        FDA_NUTRITION_COMPLETE,
        `All ${NUTRIENTS.length} mandatory nutrients are declared.`,
        US_FOOD_ELEMENTS.nutritionPanel,
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
    // Walked over the *listed* entries, not the expected ones. `expected` is the
    // regulation's order narrowed to what appears, so a panel naming a nutrient
    // twice makes it shorter — and walking only that far left everything past
    // the end uninspected, so a duplicated trailing row passed.
    const firstWrong = listed.findIndex((id, index) => expected[index] !== id)

    if (firstWrong >= 0) {
      const shouldBe = nutrient(expected[firstWrong] ?? '')
      const isThere = nutrient(listed[firstWrong]!)
      return [
        finding(usFoodNutritionOrderRule, {
          code: FDA_NUTRITION_OUT_OF_ORDER,
          severity: 'violation',
          message:
            `The panel lists ${isThere?.name ?? listed[firstWrong]} where ` +
            `${shouldBe?.name ?? 'nothing'} should be. 101.9(c) fixes the order of the ` +
            'nutrients, and the label may not choose its own.',
          measurement: {
            actual: listed.map((id) => nutrient(id)?.name ?? id).join(', '),
            required: expected.map((id) => nutrient(id)?.name ?? id).join(', '),
          },
          elementId: US_FOOD_ELEMENTS.nutritionPanel,
        }),
      ]
    }

    return [
      // 101.9(c): nutrients "shall be presented" in this order — printed, so the artwork.
      passedOnArtwork(
        usFoodNutritionOrderRule,
        FDA_NUTRITION_ORDER_MET,
        `${listed.length} nutrients run in the order 101.9(c) sets.`,
        US_FOOD_ELEMENTS.nutritionPanel,
      ),
    ]
  },
}

/**
 * Every paragraph the rounding rule can cite, taken from the table it judges
 * against rather than restated. `NUTRIENTS` carries a reference per nutrient and
 * the finding overrides `CONTENT` with it, so listing them by hand here would be
 * a second copy to keep in step with the first.
 *
 * Filtered through `roundingIsCheckable`, which is the predicate the check itself
 * uses. Deriving from the whole table instead added 101.9(c)(8)(iv) — a paragraph
 * this rule has no path to cite, so the catalogue would have advertised a check
 * that never runs. Exactly the over-declaration the dual-column list was fixed
 * for, made again two files away and caught by review rather than by this
 * comment.
 */
const ROUNDING_CITATIONS: readonly Citation[] = [
  CONTENT,
  ...[
    ...new Set(
      NUTRIENTS.filter((entry) => roundingIsCheckable(entry.id)).map((entry) => entry.reference),
    ),
  ]
    .filter((reference) => reference !== CONTENT.reference)
    .map((reference) => untitled(CONTENT, reference)),
]

export const usFoodNutritionRoundingRule: UsFoodRule = {
  id: 'us-food/nutrition-rounding',
  title: 'Declared amounts are rounded as 21 CFR 101.9(c) requires.',
  citation: CONTENT,
  citations: ROUNDING_CITATIONS,
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

    // Permitted amounts, plural. 101.9(c)(1) lets an amount under five calories
    // be "expressed as zero" — *may*, not *shall* — so 3 calories is lawfully
    // declared as the nearest 5-calorie increment or as 0, and a rule comparing
    // against one of them reported the other. `roundNutrientAmount` has to pick a
    // single number because the renderer has to draw one; this does not.
    const wrong = checked.flatMap((entry) => {
      const permitted = permittedNutrientAmounts(entry.id, panel.amounts[entry.id]!)
      const declared = panel.declaredAmounts![entry.id]!
      return permitted.includes(declared) ? [] : [{ entry, permitted, declared }]
    })

    if (wrong.length > 0) {
      return wrong.map(({ entry, permitted, declared }) =>
        finding(usFoodNutritionRoundingRule, {
          code: FDA_NUTRITION_ROUNDING_WRONG,
          severity: 'violation',
          message:
            `${entry.name} is ${panel.amounts[entry.id]} and the panel declares ${declared}. ` +
            `${entry.reference} rounds it to ${permitted.join(' or ')}.`,
          measurement: { actual: String(declared), required: permitted.join(' or ') },
          // The row, not the whole panel. Stage 5 gave every nutrient an element
          // for exactly this; a defect on one line should outline that line.
          elementId: nutritionRowElementId(entry.id),
          citation: { ...CONTENT, reference: entry.reference },
        }),
      )
    }

    return [
      // Each amount is "expressed" to its increment on the panel: the artwork.
      passedOnArtwork(
        usFoodNutritionRoundingRule,
        FDA_NUTRITION_ROUNDING_MET,
        `${checked.length} declared amount${checked.length === 1 ? '' : 's'} round as 101.9(c) ` +
          'requires.',
        US_FOOD_ELEMENTS.nutritionPanel,
      ),
    ]
  },
}

export const usFoodNutritionPercentDvRule: UsFoodRule = {
  id: 'us-food/nutrition-percent-dv',
  title: 'The percent Daily Value column is computed and rounded as 21 CFR 101.9 requires.',
  citation: PERCENT,
  citations: [PERCENT, VITAMIN_PERCENT],
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

    // A declared percentage with no amount behind it could not be recomputed, so
    // it was neither reported nor checked — and the pass counted it anyway.
    // "11 percentages match the Daily Values" about ten is a rule declining and
    // reporting that it cleared.
    const measured = checked.filter(
      (entry) =>
        declaredAmount(panel, entry.id) !== undefined || panel.amounts[entry.id] !== undefined,
    )
    if (measured.length === 0 && wrong.length === 0) return []

    if (wrong.length > 0) {
      return wrong.map(({ entry, declared, permitted }) =>
        finding(usFoodNutritionPercentDvRule, {
          code: FDA_NUTRITION_PERCENT_DV_WRONG,
          severity: 'violation',
          message:
            `${entry.name} shows ${declared}% of the Daily Value; ` +
            `${[...new Set(permitted)].sort((a, b) => a - b).join('% or ')}% is what ` +
            `${declaredAmount(panel, entry.id) ?? panel.amounts[entry.id]}${entry.unit} of a ` +
            `${entry.dailyValue!.amount}${entry.unit} Daily Value gives.`,
          measurement: {
            actual: `${declared}%`,
            required: [...new Set(permitted)]
              .sort((a, b) => a - b)
              .map((p) => `${p}%`)
              .join(' or '),
          },
          elementId: nutritionRowElementId(entry.id),
          citation: entry.dailyValue!.kind === 'rdi' ? VITAMIN_PERCENT : PERCENT,
        }),
      )
    }

    return [
      // (d)(7)(ii) governs the percentages the panel shows: the artwork.
      passedOnArtwork(
        usFoodNutritionPercentDvRule,
        FDA_NUTRITION_PERCENT_DV_MET,
        `${measured.length} percentage${measured.length === 1 ? '' : 's'} match the Daily Values, ` +
          'rounded as each nutrient’s own paragraph requires.',
        US_FOOD_ELEMENTS.nutritionPanel,
      ),
    ]
  },
}

/**
 * The panel declares its serving size.
 *
 * Source: 21 CFR 101.9(d)(3), read from the eCFR on 2026-09-13. The paragraph
 * opens "Information on servings per container and serving size **shall**
 * immediately follow the heading ... Such information **shall** include:", and
 * (ii) is "'Serving size': A statement of the serving size as specified in
 * paragraph (b)(7) of this section which shall immediately follow the
 * '____servings per container' declaration".
 *
 * **Only (ii) is mandatory of the two, and that asymmetry is the point.** (d)(3)(i)
 * carries its own exception — the servings-per-container statement "is not
 * required on single serving containers as defined in paragraph (b)(6) ... or on
 * other food containers when this information is stated in the net quantity of
 * contents declaration" — while (ii) states none. So a panel with no servings
 * count may be perfectly compliant and a panel with no serving size never is,
 * and a rule demanding both would report labels the paragraph allows.
 *
 * What the serving size *says* is (b)(7)'s question, and (b)(2)'s before it: the
 * amount is derived from the Reference Amount Customarily Consumed in §101.12(b),
 * a table this engine does not carry. So this checks that a serving size is
 * declared, and does not check that it is the right one. An unverifiable check is
 * worse than an absent one, and saying which of the two this is belongs in the
 * finding rather than in a commit message.
 */
export const usFoodServingSizeRule: UsFoodRule = {
  id: 'us-food/serving-size',
  title: 'The nutrition label declares a serving size.',
  citation: SERVING_SIZE,
  codes: [FDA_SERVING_SIZE_MISSING, FDA_SERVING_SIZE_MET],
  appliesTo: 'us-food',

  check({ data, layout }: UsFoodContext): Finding[] {
    const panel = panelOf(data)
    // No panel at all is the completeness rule's finding, not this one's. Two
    // rules reporting one absence under two citations is the mistake the
    // net-quantity family was untangled to avoid.
    if (panel === undefined) return []

    if (panel.servingSize.trim() === '') {
      return [
        finding(usFoodServingSizeRule, {
          code: FDA_SERVING_SIZE_MISSING,
          severity: 'violation',
          message:
            'The nutrition label declares no serving size. 101.9(d)(3)(ii) requires one ' +
            'immediately after the servings per container, and states no exception.',
          measurement: { actual: 'no serving size', required: 'a serving size declaration' },
          elementId: US_FOOD_ELEMENTS.nutritionServingSize,
        }),
      ]
    }

    // **Declared means printed, and the engine records the panel, not its rows.**
    // The pass names the serving-size row so the canvas can outline it, but a panel
    // running past the bottom of its stock is recorded against the panel alone —
    // so on a 25 mm label this reported a serving size declared while the row sat
    // wholly below the edge, and the guard in `runRules` never matched. Unable to
    // tell a row that printed from one that did not, it declines whenever anything
    // is recorded as omitted from the panel or the row — not only an overrun, since
    // `wasFullyDrawn` counts every omission — as every other pass on the panel is
    // withheld.
    const printed = [US_FOOD_ELEMENTS.nutritionPanel, US_FOOD_ELEMENTS.nutritionServingSize]
    if (!printed.every((elementId) => wasFullyDrawn(layout, elementId))) return []

    return [
      // (d)(3): the panel's servings information "shall include" it — printed, so the artwork.
      passedOnArtwork(
        usFoodServingSizeRule,
        FDA_SERVING_SIZE_MET,
        `The panel declares a serving size of ${panel.servingSize.trim()}. Whether that amount ` +
          'follows the reference amount in §101.12(b) is not checked — that table is not carried ' +
          'here.',
        US_FOOD_ELEMENTS.nutritionServingSize,
      ),
    ]
  },
}
