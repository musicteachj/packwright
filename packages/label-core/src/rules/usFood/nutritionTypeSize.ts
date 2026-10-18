/**
 * The Nutrition Facts panel is set no smaller than 21 CFR 101.9 requires.
 *
 * Source: 21 CFR 101.9, read from the eCFR on 2026-09-12. Unlike the rule
 * weights, these are in the regulation and they are binding:
 *
 * **(d)(2) is deliberately not checked.** It asks that "Nutrition Facts" be "no
 * smaller than all other print size in the nutrition label except for the
 * numerical information for 'Calories'" — a relative requirement, which this
 * engine satisfies by construction: the heading is always drawn at the largest
 * size in the panel and a scale applies to every line alike. A rule for it could
 * not fail, which is the same reason 101.7(f)'s "lines generally parallel to the
 * base" gets a comment in `netQuantityPlacement` and not a check. The 22 points
 * FDA's illustrations draw it at is guidance and enforcing *that* as a floor
 * reported a proportionately smaller panel, under a citation saying no such
 * thing.
 * - **(d)(3)(i)** — the servings statement "no smaller than 10 point".
 * - **(d)(3)(ii)** — "Serving size" "highlighted in bold or extra bold and be in
 *   a type size no smaller than 10 point".
 * - **(d)(1)(iii)**: the "Calories" declaration of (d)(5) "no smaller than 16
 *   point", its numeral 22, and the nutrients and vitamins and minerals of (d)(7)
 *   and (8) "no smaller than 8 point". All in (d)(1)(iii), which sets the sizes for
 *   the paragraphs it names. They were cited to (d)(5), which states no size for
 *   Calories, and to "(d)(7)(iii)", which does not exist; the source verification of
 *   2026-10-17 found both (item 7). Re-read from the eCFR on 2026-10-18.
 *
 * **Two bands get no verdict, because the paragraphs give a permission this rule cannot
 * test** (items 9 and B of the 2026-10-17 source verification; read from the eCFR on
 * 2026-10-18):
 * - **(d)(3)(ii)**: "If the 'Serving size' declaration does not fit in the allocated space
 *   a type size of no smaller than 8 point may be used on packages of any size." Whether
 *   it fits is a judgment about the layout this rule does not make, so a serving size at 8
 *   point or more and under its usual 10 or 9 is neither reported nor counted.
 * - **(j)(13)(i)(B)**: on a package with less than 12 in² available to bear labeling,
 *   "all required information shall be in type size no smaller than 6 point". Whether that
 *   replaces (d)'s larger minimums or sits beside them is not settled, so by James's
 *   decision of 2026-10-17 (decision B) type at 6 point or more and under its usual minimum
 *   gets no verdict there. A package with no area declared counts as one that may be that
 *   small whenever its label and panel are, since only the declaration could rule it out.
 *   The same sentence goes on: "individual serving-size packages of food served with meals
 *   in restaurants, institutions, and on board passenger carriers, and not intended for
 *   sale at retail, may comply with § 101.2(c)(2)", which allows 1/32 inch on a package of
 *   3 in² or less. Whether a package is one is not stated, so on one that may be that small
 *   the band reaches down to 1/32 inch, measured on the em, which is never smaller than the
 *   letter. Found by `/code-review medium` on the fix.
 * - **A tabular display whose entitlement waits on its vertical space.** `us-food/
 *   nutrition-format` stands down until the space is stated, and the display's lower
 *   minimums are its only if (d)(11)(iii) permits it. So type at or above the display's
 *   minimum and under the vertical display's gets no verdict until then, rather than a pass
 *   on figures the label may not be entitled to. Found by the same review.
 * Below every floor the usual minimum is reported, since that type fails every reading.
 * The pass names what it did not judge; `docs/WHAT-IS-NOT-CHECKED.md` says why.
 *
 * **Measured in points, not letter heights.** Every other type-size rule in this
 * project converts through `glyphHeightMm`, because 101.7(i) and 101.2(c) state
 * a letter *height* and 101.7(h)(2) says which letter. 101.9 states a *type
 * size* — the em a compositor sets — and never mentions a letter, so converting
 * would be answering a question the paragraph does not ask. It is also why the
 * 101.2(c) floor is not applied to this panel: an 8 point nutrient row is
 * exactly what (d)(1)(iii) asks for and its lowercase "o" is 1.52 mm, under the
 * 1.59 mm floor 101.2(c) sets for everything else.
 */

import { labelingSurfaceFloor } from '../../geometry/pdp'
import { SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES } from '../../fda/nutritionFormats'
import { MM_PER_INCH } from '../../geometry/units'
import { nutritionFormatVerdict } from './nutritionFormat'
import {
  type NutritionDisplay,
  nutritionDisplayFor,
  nutritionTypeForDisplay,
} from '../../fda/nutritionPanel'
import { MM_PER_POINT } from '../../geometry/units'
import type { TextPrimitive } from '../../layout/types'
import { NUTRITION_ROW_PREFIX, US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { MEASUREMENT_TOLERANCE_MM, finding, passedOnArtwork, untitled } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'
import { noVerdictOnADescribedLabel } from '../described'

export const FDA_NUTRITION_TYPE_TOO_SMALL = 'FDA_NUTRITION_TYPE_TOO_SMALL'
export const FDA_NUTRITION_TYPE_SIZE_MET = 'FDA_NUTRITION_TYPE_SIZE_MET'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(d)',
  title: 'Minimum type sizes for the Nutrition Facts label',
}

/**
 * Element, its stated minimum in points, and the paragraph that states it —
 * **for the display this panel is presented under**.
 *
 * Four figures move between displays and **no two of them move together**.
 * (d)(1)(iii) drops the Calories word to 10 point on every display but the
 * vertical, and the numeral to 14 only on the two small-package ones; (d)(3)(i)
 * drops the servings statement to 9 only on that same small-package pair, while
 * (d)(3)(ii) drops "Serving size" to 9 on all four. `NUTRITION_TYPE_BY_DISPLAY`
 * carries the four exception lists verbatim; this measures a panel against
 * whichever row it belongs to.
 *
 * `measureId` and `elementId` differ for the Calories numeral alone. It is drawn
 * under its own id so its 22 point minimum can be seen separately from the
 * word's 16 — measured together the smaller always wins, and an undersized
 * numeral beside a correct word was invisible — but a finding about it should
 * outline the Calories row a reader can see, not a bare numeral.
 */
const minimumsFor = (
  display: NutritionDisplay,
): ReadonlyArray<{
  measureId: string
  elementId: string
  label: string
  pt: number
  reference: string
}> => {
  const type = nutritionTypeForDisplay(display)
  return [
    {
      measureId: US_FOOD_ELEMENTS.nutritionServings,
      elementId: US_FOOD_ELEMENTS.nutritionServings,
      label: 'the servings statement',
      pt: type.servingsPerContainerPt,
      reference: '21 CFR 101.9(d)(3)(i)',
    },
    {
      measureId: US_FOOD_ELEMENTS.nutritionServingSize,
      elementId: US_FOOD_ELEMENTS.nutritionServingSize,
      label: '"Serving size"',
      pt: type.servingSizePt,
      reference: '21 CFR 101.9(d)(3)(ii)',
    },
    {
      measureId: US_FOOD_ELEMENTS.nutritionCalories,
      elementId: US_FOOD_ELEMENTS.nutritionCalories,
      label: '"Calories"',
      pt: type.caloriesWordPt,
      reference: '21 CFR 101.9(d)(1)(iii)',
    },
    {
      measureId: US_FOOD_ELEMENTS.nutritionCaloriesFigure,
      elementId: US_FOOD_ELEMENTS.nutritionCalories,
      label: 'the Calories numeral',
      pt: type.caloriesFigurePt,
      reference: '21 CFR 101.9(d)(1)(iii)',
    },
  ]
}

// Imported rather than written out. It was spelled in three files, and a
// change in one would have this rule reporting every compliant 8 point row.
const pointsOf = (mm: number): number => mm / MM_PER_POINT

/** (d)(3)(ii): "a type size of no smaller than 8 point may be used on packages of any size". */
const SERVING_SIZE_IF_IT_DOES_NOT_FIT_PT = 8
/** (j)(13)(i)(B): "no smaller than 6 point", on a package under 12 in². */
const SMALL_PACKAGE_FLOOR_PT = 6
/** 101.2(c)(2)(i) and (iii), through (j)(13)(i)(B): 1/32 inch, on a package of 3 in² or less. */
const FOOD_SERVICE_PACK_MAX_SQ_INCHES = 3
const FOOD_SERVICE_PACK_FLOOR_PT = MM_PER_INCH / 32 / MM_PER_POINT

/**
 * Every paragraph this rule can cite.
 *
 * Written out rather than derived from `minimumsFor`, because the nutrient rows
 * are judged from the check body and not from that table, and a derivation would
 * have looked tidier and quietly omitted their paragraph. `citations.test.ts` runs every fixture
 * and fails on any provision a finding cites and no rule declares, so the list
 * is enforced rather than trusted.
 *
 * Source: 21 CFR 101.9(d), (d)(1)(iii), (d)(3)(i) and (d)(3)(ii), read from the
 * eCFR on 2026-09-12 for the figures this rule measures, re-read on 2026-09-13 for
 * this list, and on 2026-10-18 when (d)(5) and "(d)(7)(iii)" left it.
 */
const TYPE_SIZE_CITATIONS: readonly Citation[] = [
  CITATION,
  untitled(CITATION, '21 CFR 101.9(d)(1)(iii)'),
  untitled(CITATION, '21 CFR 101.9(d)(3)(i)'),
  untitled(CITATION, '21 CFR 101.9(d)(3)(ii)'),
]

const judgedAsDrawn: UsFoodRule = {
  id: 'us-food/nutrition-type-size',
  title: 'The Nutrition Facts panel meets the minimum type sizes 21 CFR 101.9 sets.',
  citation: CITATION,
  citations: TYPE_SIZE_CITATIONS,
  codes: {
    [FDA_NUTRITION_TYPE_TOO_SMALL]: ['violation'],
    [FDA_NUTRITION_TYPE_SIZE_MET]: ['pass'],
  },
  appliesTo: 'us-food',

  check(context: UsFoodContext): Finding[] {
    const { data, layout, stock } = context
    const facts = data.nutritionFacts
    // The same floor the engine drew the panel with, so the minimums judged are those of
    // the display the package can actually reach.
    const display = nutritionDisplayFor({
      ...(facts ?? {}),
      availableSurfaceFloor: labelingSurfaceFloor(stock, data.container),
    })
    const type = nutritionTypeForDisplay(display)
    const smallestOf = (predicate: (id: string) => boolean): number | undefined => {
      const sizes = layout.primitives
        .filter(
          (primitive): primitive is TextPrimitive =>
            primitive.kind === 'text' &&
            primitive.elementId !== undefined &&
            predicate(primitive.elementId),
        )
        .map((primitive) => primitive.fontSizeMm)
      return sizes.length === 0 ? undefined : Math.min(...sizes)
    }

    // No panel drawn is nothing measured, which the completeness rule reports
    // rather than this one.
    if (smallestOf((id) => id === US_FOOD_ELEMENTS.nutritionHeading) === undefined) return []

    const checks = [
      ...minimumsFor(display).map((entry) => ({
        ...entry,
        drawnMm: smallestOf((id) => id === entry.measureId),
      })),
      {
        measureId: US_FOOD_ELEMENTS.nutritionPanel,
        elementId: US_FOOD_ELEMENTS.nutritionPanel,
        label: 'the nutrient rows',
        pt: type.nutrientPt,
        reference: '21 CFR 101.9(d)(1)(iii)',
        drawnMm: smallestOf((id) => id.startsWith(NUTRITION_ROW_PREFIX)),
      },
    ].filter((entry): entry is typeof entry & { drawnMm: number } => entry.drawnMm !== undefined)

    // A reduced display puts every figure in one run, so there is no servings
    // line, serving size or Calories element to measure — and a pass saying "0
    // parts of the panel meet the type sizes" is a rule declining and reporting
    // that it cleared.
    if (checks.length === 0) return []

    const below = (entry: { drawnMm: number }, pt: number) =>
      entry.drawnMm < pt * MM_PER_POINT - MEASUREMENT_TOLERANCE_MM
    // Under 12 in², or possibly: the declared area where there is one, and never less than
    // the label and panel the package carries.
    const floor = labelingSurfaceFloor(stock, data.container)
    const declared = facts?.availableSurfaceSqInches
    const mayBeUnder12 =
      floor.sqInches < SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES &&
      (declared === undefined || declared < SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES)
    const mayBeFoodServicePack =
      Math.max(floor.sqInches, declared ?? 0) <= FOOD_SERVICE_PACK_MAX_SQ_INCHES
    // The vertical display's minimum for each part, where the display's own lower one is not
    // the label's to use: its entitlement waits on a fact, or the format rule refuses it.
    // Certifying the reduced figures then would pass a panel on minimums the package may not
    // have. The refused case found by `/code-review high` on #105.
    const verdict = nutritionFormatVerdict(context)
    const entitlementWaits = verdict?.undetermined === true
    const entitlementRefused =
      verdict !== undefined && verdict.undetermined !== true && !verdict.permitted
    const verticalPt = new Map([
      ...minimumsFor('verticalD12').map((entry) => [entry.measureId, entry.pt] as const),
      [US_FOOD_ELEMENTS.nutritionPanel, nutritionTypeForDisplay('verticalD12').nutrientPt] as const,
    ])
    /** Why an entry under its usual minimum gets no verdict, or `undefined` where it is judged. */
    const unjudgedBecause = (entry: (typeof checks)[number]): string | undefined => {
      if (
        entry.measureId === US_FOOD_ELEMENTS.nutritionServingSize &&
        !below(entry, SERVING_SIZE_IF_IT_DOES_NOT_FIT_PT)
      ) {
        return (
          '21 CFR 101.9(d)(3)(ii) permits 8 point where the declaration does not fit in its ' +
          'allocated space, which this check does not judge'
        )
      }
      if (mayBeFoodServicePack && !below(entry, FOOD_SERVICE_PACK_FLOOR_PT)) {
        return (
          'the package may have 3 in² or less to bear labeling, where 21 CFR 101.9(j)(13)(i)(B) ' +
          'lets an individual serving-size package served with meals, and not for retail sale, ' +
          'comply with 101.2(c)(2), which this check cannot tell'
        )
      }
      if (mayBeUnder12 && !below(entry, SMALL_PACKAGE_FLOOR_PT)) {
        return (
          'the package may have less than 12 in² available to bear labeling, where 21 CFR ' +
          '101.9(j)(13)(i)(B) sets 6 point, and whether that replaces the usual minimum is ' +
          'not settled'
        )
      }
      return undefined
    }
    const short = checks.filter((entry) => below(entry, entry.pt))
    // Clear of the display's own minimum, but not of the vertical display's, while the
    // display's entitlement waits: no verdict either way.
    const waiting =
      entitlementWaits || entitlementRefused
        ? checks
            .filter((entry) => !below(entry, entry.pt))
            .filter((entry) => below(entry, verticalPt.get(entry.measureId) ?? entry.pt))
            .map((entry) => ({
              entry: { ...entry, pt: verticalPt.get(entry.measureId) ?? entry.pt },
              because: entitlementWaits
                ? 'the tabular display that permits less waits on the continuous vertical space, ' +
                  'which the label does not state (21 CFR 101.9(d)(11)(iii))'
                : 'the display that permits less is one this package may not use, which the ' +
                  'Nutrition Facts display finding reports',
            }))
        : []
    const unjudged = [
      ...short.flatMap((entry) => {
        const because = unjudgedBecause(entry)
        return because === undefined ? [] : [{ entry, because }]
      }),
      ...waiting,
    ]
    const undersized = short.filter((entry) => unjudgedBecause(entry) === undefined)

    if (undersized.length > 0) {
      return undersized.map((entry) =>
        finding(usFoodNutritionTypeSizeRule, {
          code: FDA_NUTRITION_TYPE_TOO_SMALL,
          severity: 'violation',
          message:
            `${entry.label} is set at ${pointsOf(entry.drawnMm).toFixed(1)} point; ` +
            `${entry.reference} requires no smaller than ${entry.pt} point.`,
          measurement: {
            actual: `${pointsOf(entry.drawnMm).toFixed(1)} pt`,
            required: `${entry.pt} pt`,
          },
          elementId: entry.elementId,
          citation: { ...CITATION, reference: entry.reference },
        }),
      )
    }

    // Nothing judged is nothing cleared.
    const judged = checks.length - unjudged.length
    if (judged === 0) return []

    return [
      // 101.9(d) sets the size of the type the panel is printed in: the artwork.
      passedOnArtwork(
        usFoodNutritionTypeSizeRule,
        FDA_NUTRITION_TYPE_SIZE_MET,
        `${judged} part${judged === 1 ? '' : 's'} of the panel ` +
          `meet${judged === 1 ? 's' : ''} the type sizes 101.9(d) sets.` +
          unjudged
            .map(
              ({ entry, because }) =>
                ` Not judged: ${entry.label}, set at ${pointsOf(entry.drawnMm).toFixed(1)} ` +
                `point under the usual ${entry.pt}, because ${because}.`,
            )
            .join(''),
        US_FOOD_ELEMENTS.nutritionPanel,
      ),
    ]
  },
}

/** The rule as drawn, giving no verdict on a label printed elsewhere — see `rules/described.ts`. */
export const usFoodNutritionTypeSizeRule: UsFoodRule = noVerdictOnADescribedLabel(judgedAsDrawn, {
  why:
    'The Nutrition Facts type sizes are Packwright’s own: a request can scale them, but cannot ' +
    'state the sizes your panel is printed at.',
})
