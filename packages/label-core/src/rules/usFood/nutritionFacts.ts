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
 *   printed on the package, and is checked below, as is (j)(15)'s statement.
 *   (j)(14)'s egg carton moves its information beneath the lid rather than going
 *   without, so the information is still required and judged, and what goes unchecked
 *   is only where and how it is presented. Read from the eCFR on 2026-09-16, and
 *   (j)(14) and (j)(15) again on 2026-09-17.
 * - The *weights* of the four vitamins and minerals. 101.9(c)(8)(ii) permits
 *   "additional levels of significance" beyond the whole units (c)(8)(iv) gives,
 *   so 235 mg of potassium and 235.4 mg are both proper declarations and no
 *   single value can be demanded. Their *percentages* are checked, under
 *   (c)(8)(iii); only the weights are not.
 */

import {
  NUTRIENTS,
  NUTRIENT_IDS,
  dailyValueFor,
  nutrient,
  percentDailyValue,
  permittedNutrientAmounts,
  roundNutrientAmount,
  roundingIsCheckable,
} from '../../fda/nutrients'
import type { NutrientId } from '../../fda/nutrients'
import { wasFullyDrawn } from '../../layout/omissions'
import type { TextPrimitive } from '../../layout/types'
import {
  US_FOOD_EGG_CARTON_PRESENTED,
  US_FOOD_ELEMENTS,
  dailyValuePopulationOf,
  nutritionRowElementId,
} from '../../templates/usFood'
import type {
  US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE,
  UsFoodEggCartonExemption,
  UsFoodNutritionFacts,
  UsFoodSmallPackageExemption,
  UsFoodUnitContainerExemption,
} from '../../templates/usFood'
import { SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES } from '../../fda/nutritionFormats'
import {
  UNIT_CONTAINER_STATEMENTS,
  UNIT_CONTAINER_STATEMENT_MIN_TYPE_HEIGHT_MM,
} from '../../fda/unitContainerStatement'
import { labelingSurfaceFloor, regulatedGlyphBasis } from '../../geometry/pdp'
import { glyphHeightMm } from '../../text/measure'
import type { Citation, Finding } from '../../types/index'
import { MEASUREMENT_TOLERANCE_MM, finding, mm, passedOnArtwork, untitled } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'
import { smallestOf } from './printedText'

export const FDA_NUTRITION_MISSING = 'FDA_NUTRITION_MISSING'
export const FDA_NUTRITION_NUTRIENT_MISSING = 'FDA_NUTRITION_NUTRIENT_MISSING'
export const FDA_NUTRITION_COMPLETE = 'FDA_NUTRITION_COMPLETE'
export const FDA_NUTRITION_EXEMPT = 'FDA_NUTRITION_EXEMPT'
export const FDA_NUTRITION_EXEMPTION_UNSTATED = 'FDA_NUTRITION_EXEMPTION_UNSTATED'
export const FDA_NUTRITION_CONTACT_MISSING = 'FDA_NUTRITION_CONTACT_MISSING'
export const FDA_UNIT_CONTAINER_STATEMENT_TOO_SMALL = 'FDA_UNIT_CONTAINER_STATEMENT_TOO_SMALL'
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
  (typeof US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE)[number],
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

/**
 * 101.9(j)(15), the unit container — declared with the wording it bears, and checked
 * because (iii) puts the condition on the label: "each unit container is labeled with
 * the statement 'This Unit Not Labeled For Retail Sale' in type size not less than
 * 1/16-inch in height". Read from the eCFR on 2026-09-17. (i) and (ii) are about the
 * outer package and are not checked.
 */
const UNIT_CONTAINER = untitled(EXEMPTION, '21 CFR 101.9(j)(15)')

/**
 * 101.9(j)(14), the egg carton. Read from the eCFR on 2026-09-17: "Shell eggs packaged in
 * a carton that has a top lid designed to conform to the shape of the eggs are exempt
 * from outer carton label requirements where the required nutrition information is
 * clearly presented immediately beneath the carton lid or in an insert that can be
 * clearly seen when the carton is opened." The information is relocated, not excused.
 */
const EGG_CARTON = untitled(EXEMPTION, '21 CFR 101.9(j)(14)')
const UNIT_CONTAINER_STATEMENT = untitled(EXEMPTION, '21 CFR 101.9(j)(15)(iii)')

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
    UNIT_CONTAINER,
    UNIT_CONTAINER_STATEMENT,
    EGG_CARTON,
  ],
  codes: [
    FDA_NUTRITION_MISSING,
    FDA_NUTRITION_NUTRIENT_MISSING,
    FDA_NUTRITION_COMPLETE,
    FDA_NUTRITION_EXEMPT,
    FDA_NUTRITION_EXEMPTION_UNSTATED,
    FDA_NUTRITION_CONTACT_MISSING,
    FDA_UNIT_CONTAINER_STATEMENT_TOO_SMALL,
  ],
  appliesTo: 'us-food',

  check(context: UsFoodContext): Finding[] {
    const { data } = context
    const panel = panelOf(data)

    const claimed = data.nutritionExemption
    // The egg carton first, and whether or not it carries a panel: (j)(14) moves the
    // information rather than excusing it, so the panel is expected rather than absent.
    if (claimed?.kind === 'egg-carton') return eggCarton(claimed, context)

    // Every other kind: a label printing a panel is not using its exemption, and the
    // panel is judged below. Dispatched by kind, so a kind declared with particulars is
    // one more case here and the rest reach `EXEMPTIONS` with no list to keep in step.
    if (claimed !== undefined && panel === undefined) {
      switch (claimed.kind) {
        case 'small-package':
          return smallPackage(claimed, context)
        case 'unit-container':
          return unitContainer(claimed, context)
        default: {
          const exemption = EXEMPTIONS[claimed.kind]
          return [
            // Most (j) exemptions hold only while the label bears no nutrition claims: the
            // artwork. (j)(8), (9) and (11)(ii) turn on facts about the food alone and are
            // stamped with them — stricter than they need, never looser, since a pass
            // withheld reports nothing false.
            passedOnArtwork(
              usFoodNutritionCompletenessRule,
              FDA_NUTRITION_EXEMPT,
              `The label claims the ${exemption.citation.reference} exemption for ` +
                `${exemption.grants}, so no panel is required. Not checked here: ` +
                `${exemption.unchecked}.`,
              US_FOOD_ELEMENTS.principalDisplayPanel,
              exemption.citation,
            ),
          ]
        }
      }
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

    const missing = missingNutrients(panel)
    if (missing.length > 0) return missing

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
 * A finding for each mandatory nutrient the panel does not declare.
 *
 * Declared *and printed*. Where the panel states an `order`, that order is the printed
 * panel — a nutrient held in `amounts` but left out of it is not on the label. Reading
 * `amounts` alone gave "All 15 mandatory nutrients are declared" beside "14 nutrients run
 * in the order 101.9(c) sets", with nobody owning the line that had been dropped: the
 * order rule narrows its expectation to what is listed and delegates omissions here, and
 * here was looking somewhere else.
 */
function missingNutrients(panel: UsFoodNutritionFacts): Finding[] {
  const printed = (id: (typeof NUTRIENTS)[number]['id']) =>
    declaredAmount(panel, id) !== undefined && (panel.order?.includes(id) ?? true)
  return NUTRIENTS.filter((entry) => !printed(entry.id)).map((entry) =>
    finding(usFoodNutritionCompletenessRule, {
      code: FDA_NUTRITION_NUTRIENT_MISSING,
      severity: 'violation',
      message: `The panel declares no ${entry.name}, which ${entry.reference} makes mandatory.`,
      measurement: { actual: 'not declared', required: entry.name },
      elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
    }),
  )
}

/**
 * 101.9(j)(14), judged: the carton is excused a panel on its outer label only because
 * the information is presented beneath the lid or in an insert instead.
 *
 * **The information is declared, and judged as any panel's.** A carton declaring none
 * has nothing to present, and is refused. One declaring the information is held to
 * 101.9(c)'s nutrients here, and to its order, rounding and percentages by the rules
 * that judge those — every one of which still reports a wrong figure. Their passes are
 * a different matter: each says the panel *prints* its figures correctly, and nothing
 * here prints them, so the engine records the panel as not drawn and those passes are
 * withheld.
 *
 * **Where the information goes is declared, and not checked.** Whether it is clearly
 * presented beneath the lid, whether an insert can be clearly seen, whether the lid
 * conforms to the eggs, and the format the information takes there, are all off this
 * label. The pass says so, and names the principal display panel rather than the
 * panel, since it is the outer carton being excused.
 */
function eggCarton(claimed: UsFoodEggCartonExemption, { data }: UsFoodContext): Finding[] {
  const presented = US_FOOD_EGG_CARTON_PRESENTED[claimed.presentedIn]
  const panel = panelOf(data)
  if (panel === undefined) {
    return [
      finding(usFoodNutritionCompletenessRule, {
        code: FDA_NUTRITION_MISSING,
        severity: 'blocking',
        message:
          'The carton claims the 101.9(j)(14) exemption, which moves the required nutrition ' +
          `information to be presented ${presented} rather than excusing it, and declares no ` +
          'nutrition information to present there.',
        measurement: {
          actual: 'no nutrition information',
          required: `the nutrition information, presented ${presented}`,
        },
        elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
        citation: EGG_CARTON,
      }),
    ]
  }

  const missing = missingNutrients(panel)
  if (missing.length > 0) return missing

  return [
    // (j)(14) excuses the outer carton on a condition about what is printed elsewhere
    // on the package: the artwork, and stricter than it needs, never looser.
    passedOnArtwork(
      usFoodNutritionCompletenessRule,
      FDA_NUTRITION_EXEMPT,
      `The carton claims the ${EGG_CARTON.reference} exemption for shell eggs, with its nutrition ` +
        `information presented ${presented}, so no panel is required on the outer carton. All ` +
        `${NUTRIENTS.length} mandatory nutrients are declared for it, its figures are held to ` +
        '101.9’s order, rounding and percentages, and it must declare any second column the ' +
        'package owes. Not checked here: that the lid is designed to conform to the shape of the ' +
        'eggs, that the information is clearly presented where it is declared to be, and how it ' +
        'is laid out there — its type sizes, a second column’s headings and separation, and ' +
        'whether a second column states every figure the first does — none of which this engine ' +
        'draws.',
      US_FOOD_ELEMENTS.principalDisplayPanel,
      EGG_CARTON,
    ),
  ]
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
  // One floor, computed as the display route computes it, so the exemption and the
  // reduced displays cannot come to disagree about how big a package is.
  const floor = labelingSurfaceFloor(stock, data.container)
  if (floor.sqInches >= SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES) {
    const ruledOut = floor
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

/**
 * 101.9(j)(15), judged: the exemption holds only where the unit bears the statement
 * (iii) prescribes, at the height it sets.
 *
 * **Read from the artwork, not the claim.** The engine prints the statement whenever
 * the kind is claimed, so a rule reading the claim could never be wrong about the
 * words — and would clear a unit whose statement never printed. This one finds the
 * element the engine drew and reads its text and its size from the primitives, so a
 * statement the engine did not draw is reported missing, and the pass names the
 * element so one that ran off the label withholds it.
 *
 * **One dimension, one finding.** (iii)'s 1/16 inch is the figure 101.2(c) sets for
 * the whole panel, measured here on the basis 101.2(c) incorporates from 101.7(h)(2)
 * because (iii) names none of its own; the panel-wide rule leaves this element to the
 * specific provision, as it leaves the net quantity to 101.7(i). A shortfall is
 * blocking, as a missing contact line is: it is the condition the exemption stands
 * on, and without it the unit owes a panel.
 */
function unitContainer(
  claimed: UsFoodUnitContainerExemption,
  { layout }: UsFoodContext,
): Finding[] {
  const statement = UNIT_CONTAINER_STATEMENTS[claimed.wording]
  const printed = smallestOf(layout, US_FOOD_ELEMENTS.unitContainerStatement)
  if (printed?.text !== statement) {
    return [
      finding(usFoodNutritionCompletenessRule, {
        code: FDA_NUTRITION_MISSING,
        severity: 'blocking',
        message:
          'The label bears no nutrition label and claims the 101.9(j)(15) unit container ' +
          `exemption, which holds only where the unit is labeled "${statement}" under (iii). ` +
          (printed === undefined
            ? 'No such statement is printed.'
            : `It prints "${printed.text}".`),
        measurement: {
          actual: printed?.text ?? 'no statement',
          required: `"${statement}"`,
        },
        // The statement where one printed in the wrong words, since those are what is wrong;
        // the panel it would sit on where nothing printed at all.
        elementId:
          printed === undefined
            ? US_FOOD_ELEMENTS.principalDisplayPanel
            : US_FOOD_ELEMENTS.unitContainerStatement,
        citation: UNIT_CONTAINER_STATEMENT,
      }),
    ]
  }

  const actualMm = glyphHeightMm(
    printed.fontSizeMm,
    printed.fontFamily,
    regulatedGlyphBasis(printed.text),
  )
  const requiredMm = UNIT_CONTAINER_STATEMENT_MIN_TYPE_HEIGHT_MM
  if (actualMm < requiredMm - MEASUREMENT_TOLERANCE_MM) {
    return [
      finding(usFoodNutritionCompletenessRule, {
        code: FDA_UNIT_CONTAINER_STATEMENT_TOO_SMALL,
        severity: 'blocking',
        message:
          `The unit container statement is set at ${mm(actualMm)}; 101.9(j)(15)(iii) requires ` +
          `"type size not less than 1/16-inch in height", ${mm(requiredMm)}, and the exemption ` +
          'holds only where the statement meets it.',
        measurement: { actual: mm(actualMm), required: mm(requiredMm) },
        elementId: US_FOOD_ELEMENTS.unitContainerStatement,
        citation: UNIT_CONTAINER_STATEMENT,
      }),
    ]
  }

  return [
    // (iii) puts the statement on the unit, and the pass names it: the artwork.
    passedOnArtwork(
      usFoodNutritionCompletenessRule,
      FDA_NUTRITION_EXEMPT,
      `The label claims the ${UNIT_CONTAINER.reference} exemption for a unit container in a ` +
        `multiunit retail package, and bears the statement "${statement}" at ${mm(actualMm)}, ` +
        'as (iii) requires, so no panel is required. Not checked here: that the multiunit ' +
        'package’s labeling contains all the nutrition information (i), and that the units are ' +
        'securely enclosed within it and not intended to be separated from it under conditions ' +
        'of retail sale (ii).',
      US_FOOD_ELEMENTS.unitContainerStatement,
      UNIT_CONTAINER,
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

  check({ data, layout }: UsFoodContext): Finding[] {
    const panel = panelOf(data)
    if (panel === undefined) return []

    // **Asked of the layout, row by row.** A panel whose mode went back to single keeps its
    // second column's figures, and reading them from the document judged a column nothing
    // drew — clearing a correct one into the pass. Per row, because a nutrient left out of
    // `order` draws neither column while the panel around it draws two. The dual-column
    // rules learned this with `columns.mode`; the percentages are the same question.
    // **Asked of the layout: the band first, then the row's own cells.** Reading these
    // figures from the document judged a column nothing drew, and counting the cells alone
    // then read a single-column panel's lone cell as a second column's. A panel draws the
    // band only where a second column was actually drawn, and each column that declares an
    // amount adds a cell to the row — so a row carries a second cell where the band is on
    // the label, the second column declares an amount for it, and the row drew more cells
    // than the first column alone would give it. More, not exactly two: `order` may list a
    // nutrient twice, which draws its row twice over.
    const bandDrawn = layout.elements.some(
      (element) => element.elementId === US_FOOD_ELEMENTS.nutritionSecondColumn,
    )
    const cellsDrawn = (id: NutrientId): number =>
      layout.primitives.filter(
        (primitive): primitive is TextPrimitive =>
          primitive.kind === 'text' &&
          primitive.elementId === nutritionRowElementId(id) &&
          primitive.anchor === 'end',
      ).length
    // The first column prints its percentage in the row's own cell on a single-column panel
    // and in the first of two on a dual one, so a row with no cell drew neither. This was
    // hard-coded true while the second column was being gated, which left a nutrient the
    // panel's `order` leaves out counted into the pass — the same defect, a column over.
    const firstColumnDrawn = (id: NutrientId): boolean => cellsDrawn(id) > 0
    const secondColumnDrawn = (id: NutrientId): boolean => {
      if (!bandDrawn || panel.columns?.secondAmounts?.[id] === undefined) return false
      return cellsDrawn(id) >= (declaredAmount(panel, id) === undefined ? 1 : 2)
    }

    // **Both columns, each against its own figures.** (e)(2), (e)(3) and (e)(6) present the
    // (d)(7)(ii) percentages in every column a panel declares, and a second column may state
    // its own. Judging only the first left a stated second-column figure unchecked while the
    // pass beside it counted the first column's and said the percentages matched.
    const columns = [
      {
        second: false,
        stated: panel.declaredPercentDv,
        bases: (id: NutrientId) => [declaredAmount(panel, id), panel.amounts[id]],
        drawn: firstColumnDrawn,
      },
      {
        second: true,
        stated: panel.columns?.secondPercentDv,
        drawn: secondColumnDrawn,
        bases: (id: NutrientId) => {
          const amount = panel.columns?.secondAmounts?.[id]
          return [amount === undefined ? undefined : roundNutrientAmount(id, amount), amount]
        },
      },
    ] as const
    if (columns.every((column) => column.stated === undefined)) return []

    // (c)(8)(i): a food for children 1 through 3 "shall use the RDIs that are specified
    // for the intended group", and the DRVs follow it. Taken from the panel, as the
    // engine takes it, so the figures printed and the figures judged share one column.
    const population = dailyValuePopulationOf(panel)
    const checked = columns.flatMap((column) =>
      column.stated === undefined
        ? []
        : NUTRIENTS.filter(
            (entry) =>
              column.stated![entry.id] !== undefined &&
              entry.dailyValue !== undefined &&
              // Protein's percentage is corrected by a digestibility score no label
              // carries, so it cannot be recomputed from what is here.
              entry.id !== 'protein',
          )
            .filter((entry) => column.drawn(entry.id))
            .map((entry) => ({ entry, column })),
    )
    if (checked.length === 0) return []

    const wrong = checked.flatMap(({ entry, column }) => {
      // 101.9(d)(7)(ii) permits **either** basis — the declared amount or the
      // actual one before rounding — and they often differ. Accepting only one
      // would report a violation against a label that took the other.
      const [fromDeclared, fromActual] = column.bases(entry.id)
      const permitted = [
        fromDeclared === undefined
          ? undefined
          : percentDailyValue(entry.id, fromDeclared, population),
        fromActual === undefined ? undefined : percentDailyValue(entry.id, fromActual, population),
      ].filter((value): value is number => value !== undefined)
      if (permitted.length === 0) return []

      const declared = column.stated![entry.id]!
      return permitted.includes(declared)
        ? []
        : [
            {
              entry,
              declared,
              permitted,
              second: column.second,
              amount: fromDeclared ?? fromActual,
            },
          ]
    })

    // A declared percentage with no amount behind it could not be recomputed, so
    // it was neither reported nor checked — and the pass counted it anyway.
    // "11 percentages match the Daily Values" about ten is a rule declining and
    // reporting that it cleared.
    const measured = checked.filter(({ entry, column }) =>
      column.bases(entry.id).some((amount) => amount !== undefined),
    )
    if (measured.length === 0 && wrong.length === 0) return []

    if (wrong.length > 0) {
      return wrong.map(({ entry, declared, permitted, second, amount }) =>
        finding(usFoodNutritionPercentDvRule, {
          code: FDA_NUTRITION_PERCENT_DV_WRONG,
          severity: 'violation',
          message:
            `${entry.name} shows ${declared}% of the Daily Value` +
            `${second ? ' in the second column' : ''}; ` +
            `${[...new Set(permitted)].sort((a, b) => a - b).join('% or ')}% is what ` +
            `${amount}${entry.unit} of a ` +
            `${dailyValueFor(entry.id, population)!.amount}${entry.unit} Daily Value` +
            `${population === 'children-1-through-3' ? ' for children 1 through 3' : ''} gives.`,
          measurement: {
            actual: `${declared}%`,
            required: [...new Set(permitted)]
              .sort((a, b) => a - b)
              .map((p) => `${p}%`)
              .join(' or '),
          },
          // The row, not the whole panel. Stage 5 gave every nutrient an element
          // for exactly this; a defect on one line should outline that line.
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
