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
 * - The facts the (j) exemptions turn on — business size, units sold, what the
 *   food is and where it is served. The paragraph claimed is recorded and cited,
 *   and each pass says what of it goes unchecked; most share one condition this
 *   project cannot evaluate, that the food "bears no nutrition claims or other
 *   nutrition information in any context on the label or in labeling or
 *   advertising", because it models no claims. (j)(13)(i) holds only on a line
 *   printed on the package, and is checked below. (j)(14) and (j)(15) hold only on
 *   something printed that nothing here checks, and are not offered until it is.
 *   Read from the eCFR on 2026-09-16.
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
import type {
  UsFoodNutritionExemptionKind,
  UsFoodNutritionFacts,
  UsFoodSmallPackageExemption,
} from '../../templates/usFood'
import { SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES } from '../../fda/nutritionFormats'
import { MM_PER_INCH } from '../../geometry/units'
import { pdpAreaSqInches } from '../../geometry/pdp'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork, untitled } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_NUTRITION_MISSING = 'FDA_NUTRITION_MISSING'
export const FDA_NUTRITION_NUTRIENT_MISSING = 'FDA_NUTRITION_NUTRIENT_MISSING'
export const FDA_NUTRITION_COMPLETE = 'FDA_NUTRITION_COMPLETE'
export const FDA_NUTRITION_EXEMPT = 'FDA_NUTRITION_EXEMPT'
export const FDA_NUTRITION_EXEMPTION_UNSTATED = 'FDA_NUTRITION_EXEMPTION_UNSTATED'
export const FDA_NUTRITION_CONTACT_MISSING = 'FDA_NUTRITION_CONTACT_MISSING'
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

/** The condition most (j) exemptions share, which this project cannot evaluate. */
const NO_CLAIMS =
  'that the food bears no nutrition claims or other nutrition information on its label or in ' +
  'labeling or advertising'

/**
 * Each exemption cites its own paragraph and says what of it is not checked.
 * Untitled, because the subparagraphs carry no heading of their own to quote.
 * Worded from 101.9(j) as read from the eCFR on 2026-09-16.
 */
const EXEMPTIONS: Record<
  Exclude<UsFoodNutritionExemptionKind, 'small-package'>,
  { citation: Citation; grants: string; unchecked: string }
> = {
  'small-business': {
    citation: untitled(EXEMPTION, '21 CFR 101.9(j)(1)'),
    grants: 'food offered for sale by a person who makes direct sales to consumers',
    unchecked: `that person’s annual sales, and ${NO_CLAIMS}`,
  },
  'food-service': {
    citation: untitled(EXEMPTION, '21 CFR 101.9(j)(2)'),
    grants:
      'food served, sold or used in establishments that serve food for immediate human ' +
      'consumption, or sold by a distributor who principally sells to them',
    unchecked:
      `which of (j)(2)’s five cases applies and the conditions each attaches — for the first ` +
      `three, ${NO_CLAIMS}`,
  },
  'retail-prepared': {
    citation: untitled(EXEMPTION, '21 CFR 101.9(j)(3)'),
    grants:
      'ready-to-eat food processed and prepared primarily in a retail establishment and not ' +
      'offered for sale outside it',
    unchecked: `where the food is prepared and sold, and ${NO_CLAIMS}`,
  },
  'insignificant-nutrients': {
    citation: untitled(EXEMPTION, '21 CFR 101.9(j)(4)'),
    grants:
      'food containing insignificant amounts of all the nutrients and food components (c) ' +
      'requires to be declared',
    unchecked: `the amounts themselves, and ${NO_CLAIMS}`,
  },
  'medical-food': {
    citation: untitled(EXEMPTION, '21 CFR 101.9(j)(8)'),
    grants: 'a medical food as defined in section 5(b) of the Orphan Drug Act',
    unchecked:
      'the five conditions (j)(8) sets on how the food is formulated and processed, the ' +
      'patients it is intended for, and the medical supervision it is used under',
  },
  'bulk-for-manufacture': {
    citation: untitled(EXEMPTION, '21 CFR 101.9(j)(9)'),
    grants:
      'food shipped in bulk form, not for distribution to consumers in that form, for use in ' +
      'manufacturing other foods or to be processed, labeled or repacked elsewhere',
    unchecked: 'the facts of the shipment',
  },
  'raw-produce-or-fish': {
    citation: untitled(EXEMPTION, '21 CFR 101.9(j)(10)'),
    grants: 'raw fruits, vegetables or fish subject to section 403(q)(4) of the act',
    unchecked: `what the food is, and ${NO_CLAIMS}`,
  },
  'custom-processed-fish-or-game': {
    citation: untitled(EXEMPTION, '21 CFR 101.9(j)(11)(ii)'),
    grants: 'custom processed fish or game meats',
    unchecked: 'that the product is custom processed',
  },
  'bulk-at-retail': {
    citation: untitled(EXEMPTION, '21 CFR 101.9(j)(16)'),
    grants: 'food sold from bulk containers',
    unchecked:
      'that the nutrition information is displayed to consumers on the bulk container’s ' +
      'labeling plainly in view, or as (a)(2) provides — a condition on the display, not on ' +
      'this label',
  },
  'low-volume': {
    citation: untitled(EXEMPTION, '21 CFR 101.9(j)(18)'),
    grants: 'a low-volume food product',
    unchecked:
      'the units sold, the employees, the notice (j)(18)(iv) requires to be filed, and that ' +
      'the labels, labeling and advertising provide no nutrition information and make no ' +
      'nutrient content or health claim',
  },
}

/**
 * 101.9(j)(13)(i), the one exemption declared with particulars — and the one whose
 * condition this rule checks, because (A) puts it on the label: the manufacturer,
 * packer or distributor "shall provide on the label of packages that qualify for and
 * use this exemption an address or telephone number that a consumer can use to obtain
 * the required nutrition information (e.g., 'For nutrition information, call
 * 1-800-123-4567')". Read from the eCFR on 2026-09-16.
 */
const SMALL_PACKAGE = untitled(EXEMPTION, '21 CFR 101.9(j)(13)(i)')
const SMALL_PACKAGE_CONTACT = untitled(EXEMPTION, '21 CFR 101.9(j)(13)(i)(A)')

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
  citations: [
    CONTENT,
    EXEMPTION,
    ...Object.values(EXEMPTIONS).map((exemption) => exemption.citation),
    SMALL_PACKAGE,
    SMALL_PACKAGE_CONTACT,
  ],
  codes: [
    FDA_NUTRITION_MISSING,
    FDA_NUTRITION_NUTRIENT_MISSING,
    FDA_NUTRITION_COMPLETE,
    FDA_NUTRITION_EXEMPT,
    FDA_NUTRITION_EXEMPTION_UNSTATED,
    FDA_NUTRITION_CONTACT_MISSING,
  ],
  appliesTo: 'us-food',

  check(context: UsFoodContext): Finding[] {
    const { data } = context
    const panel = panelOf(data)

    const claimed = data.nutritionExemption
    if (claimed?.kind === 'small-package' && panel === undefined) {
      return smallPackage(claimed, context)
    }
    if (claimed !== undefined && claimed.kind !== 'small-package' && panel === undefined) {
      const exemption = EXEMPTIONS[claimed.kind]
      return [
        // Most (j) exemptions hold only while the label bears no nutrition claims: the artwork.
        // (j)(8), (9) and (11)(ii) turn on facts about the food alone and are stamped with them —
        // stricter than they need, never looser, since a pass withheld reports nothing false.
        passedOnArtwork(
          usFoodNutritionCompletenessRule,
          FDA_NUTRITION_EXEMPT,
          `The label claims the ${exemption.citation.reference} exemption for ${exemption.grants}, ` +
            `so no panel is required. Not checked here: ${exemption.unchecked}.`,
          US_FOOD_ELEMENTS.principalDisplayPanel,
          exemption.citation,
        ),
      ]
    }

    // A label saved before the paragraph was recorded: the panel stays excused, but
    // the claim is no longer cleared, because it names no paragraph to check.
    if (data.nutritionFactsExempt === true && panel === undefined) {
      return [
        finding(usFoodNutritionCompletenessRule, {
          code: FDA_NUTRITION_EXEMPTION_UNSTATED,
          severity: 'advisory',
          message:
            'The label is marked exempt from nutrition labelling without saying which § 101.9(j) ' +
            'exemption it claims. Each carries its own conditions, so the claim cannot be judged ' +
            'until the paragraph is stated.',
          measurement: {
            actual: 'exempt, paragraph not stated',
            required: 'the paragraph claimed',
          },
          elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
          citation: EXEMPTION,
        }),
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

/**
 * 101.9(j)(13)(i), judged: the exemption holds only for a package under 12 in², and
 * only where the label bears the line (A) requires.
 *
 * **The area is declared, and what is drawn is a floor under it.** It is the package's
 * surface available to bear labeling, which nothing here measures, so the user states
 * it — and a missing figure reads as not shown to be under 12 rather than as zero, which
 * would grant the exemption to a package nobody measured. But two figures the engine
 * does have bound it from below: the label, since a package bears at least the labeling
 * on it, and the principal display panel, which is part of that surface. Either at 12 in²
 * or more rules the package out whatever is typed. Where it does not qualify, the panel
 * is missing and says why: the claim is the reason there is none.
 *
 * **The pass names the printed line**, not the panel, so a line that ran off the label
 * withholds it. What the line says is not judged: whether it gives an address or
 * telephone number a consumer can use is a question about the words, and the
 * regulation prescribes none.
 */
function smallPackage(
  claimed: UsFoodSmallPackageExemption,
  { data, stock }: UsFoodContext,
): Finding[] {
  // The PR review found the first fixtures declaring 11.5 in² on a 120 × 240 mm label of
  // 44.6 in², and its follow-up the same figure on a container whose panel alone was 44.6
  // — each exempt from the panel it had room for four times over.
  const floors = [
    {
      what: 'label',
      sqInches: (stock.widthMm * stock.heightMm) / MM_PER_INCH ** 2,
      why: 'a package bears at least the labeling on it',
    },
    {
      what: 'principal display panel',
      sqInches: pdpAreaSqInches(data.container),
      why: 'that panel is part of the surface available to bear labeling',
    },
  ]
  const ruledOut = floors.find((floor) => floor.sqInches >= SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES)
  if (ruledOut !== undefined) {
    return [
      finding(usFoodNutritionCompletenessRule, {
        code: FDA_NUTRITION_MISSING,
        severity: 'blocking',
        message:
          'The label bears no nutrition label and claims the 101.9(j)(13)(i) exemption, which ' +
          `covers only packages with less than ${SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES} in² available ` +
          `to bear labeling. The ${ruledOut.what} is itself ${ruledOut.sqInches.toFixed(1)} in², ` +
          `and ${ruledOut.why}, so it cannot qualify.`,
        measurement: {
          actual: `a ${ruledOut.sqInches.toFixed(1)} in² ${ruledOut.what}`,
          required: `less than ${SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES} in² for the exemption`,
        },
        elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
        citation: SMALL_PACKAGE,
      }),
    ]
  }

  const area = claimed.availableSurfaceSqInches
  // Above zero as well as under 12. A package with no surface cannot bear the label
  // being judged, and reading 0 as qualifying would grant the exemption to exactly the
  // unmeasured package a blank area is kept from reaching — a review caught it.
  const declared = Number.isFinite(area) && area > 0
  if (!(declared && area < SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES)) {
    return [
      finding(usFoodNutritionCompletenessRule, {
        code: FDA_NUTRITION_MISSING,
        severity: 'blocking',
        message:
          'The label bears no nutrition label and claims the 101.9(j)(13)(i) exemption, which ' +
          `covers only packages with less than ${SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES} in² available ` +
          'to bear labeling. ' +
          (declared
            ? `This package declares ${area} in², so it must carry one.`
            : 'This package declares no area above zero, so it has not been shown to qualify.'),
        measurement: {
          actual: declared ? `${area} in² available` : 'no area declared',
          required: `less than ${SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES} in² for the exemption`,
        },
        elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
        citation: SMALL_PACKAGE,
      }),
    ]
  }

  if (claimed.contactLine.trim() === '') {
    return [
      finding(usFoodNutritionCompletenessRule, {
        code: FDA_NUTRITION_CONTACT_MISSING,
        severity: 'blocking',
        message:
          'The label claims the 101.9(j)(13)(i) small-package exemption but bears no address or ' +
          'telephone number a consumer can use to obtain the nutrition information, which ' +
          '(j)(13)(i)(A) requires of a package using it.',
        measurement: { actual: 'no contact line', required: 'an address or telephone number' },
        elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
        citation: SMALL_PACKAGE_CONTACT,
      }),
    ]
  }

  return [
    // (A) puts the line on the label, and the pass names it: the artwork.
    passedOnArtwork(
      usFoodNutritionCompletenessRule,
      FDA_NUTRITION_EXEMPT,
      `The label claims the ${SMALL_PACKAGE.reference} exemption for a package with ${area} in² ` +
        `available to bear labeling, and bears the contact line (j)(13)(i)(A) requires, so no ` +
        'panel is required. Not checked here: the declared area, beyond its being under 12 in² ' +
        'and not ruled out by the label or its principal display panel, whether the line gives an address ' +
        `or telephone number a consumer can use to obtain the nutrition information, and ${NO_CLAIMS}.`,
      US_FOOD_ELEMENTS.smallPackageContact,
      SMALL_PACKAGE,
    ),
  ]
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
