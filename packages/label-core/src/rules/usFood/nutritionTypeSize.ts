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
 * - **(d)(5)** and (d)(7)(iii) — Calories "no smaller than 16 point", the
 *   nutrient block "no smaller than 8 point".
 *
 * **Measured in points, not letter heights.** Every other type-size rule in this
 * project converts through `glyphHeightMm`, because 101.7(i) and 101.2(c) state
 * a letter *height* and 101.7(h)(2) says which letter. 101.9 states a *type
 * size* — the em a compositor sets — and never mentions a letter, so converting
 * would be answering a question the paragraph does not ask. It is also why the
 * 101.2(c) floor is not applied to this panel: an 8 point nutrient row is
 * exactly what (d)(7)(iii) asks for and its lowercase "o" is 1.52 mm, under the
 * 1.59 mm floor 101.2(c) sets for everything else.
 */

import { nutritionTypeFor } from '../../fda/nutritionPanel'
import { MM_PER_POINT } from '../../geometry/units'
import type { TextPrimitive } from '../../layout/types'
import { NUTRITION_ROW_PREFIX, US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { MEASUREMENT_TOLERANCE_MM, finding, passed } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_NUTRITION_TYPE_TOO_SMALL = 'FDA_NUTRITION_TYPE_TOO_SMALL'
export const FDA_NUTRITION_TYPE_SIZE_MET = 'FDA_NUTRITION_TYPE_SIZE_MET'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(d)',
  title: 'Minimum type sizes for the Nutrition Facts label',
}

/**
 * Element, its stated minimum in points, and the paragraph that states it —
 * **for the display this panel actually uses**.
 *
 * The reduced displays lower four of the figures, and not by the same amounts:
 * (d)(1)(iii) drops the Calories *word* to 10 point in every tabular display and
 * the *numeral* to 14 only on the small-package ones, while (d)(3) drops both
 * servings lines to 9. Checking a tabular panel against the vertical minimums
 * would report a label the paragraph explicitly allows.
 */
const minimumsFor = (
  format: 'vertical' | 'tabular' | 'linear',
): ReadonlyArray<{ elementId: string; label: string; pt: number; reference: string }> => {
  const type = nutritionTypeFor(format)
  return [
    {
      elementId: US_FOOD_ELEMENTS.nutritionServings,
      label: 'the servings statement',
      pt: type.servingsPerContainerPt,
      reference: '21 CFR 101.9(d)(3)(i)',
    },
    {
      elementId: US_FOOD_ELEMENTS.nutritionServingSize,
      label: '"Serving size"',
      pt: type.servingSizePt,
      reference: '21 CFR 101.9(d)(3)(ii)',
    },
    {
      elementId: US_FOOD_ELEMENTS.nutritionCalories,
      label: '"Calories"',
      pt: type.caloriesWordPt,
      reference: '21 CFR 101.9(d)(5)',
    },
  ]
}

// Imported rather than written out. It was spelled in three files, and a
// change in one would have this rule reporting every compliant 8 point row.
const pointsOf = (mm: number): number => mm / MM_PER_POINT

export const usFoodNutritionTypeSizeRule: UsFoodRule = {
  id: 'us-food/nutrition-type-size',
  title: 'The Nutrition Facts panel meets the minimum type sizes 21 CFR 101.9 sets.',
  citation: CITATION,
  codes: [FDA_NUTRITION_TYPE_TOO_SMALL, FDA_NUTRITION_TYPE_SIZE_MET],
  appliesTo: 'us-food',

  check({ data, layout }: UsFoodContext): Finding[] {
    const format = data.nutritionFacts?.format ?? 'vertical'
    const type = nutritionTypeFor(format)
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
      ...minimumsFor(format).map((entry) => ({
        ...entry,
        drawnMm: smallestOf((id) => id === entry.elementId),
      })),
      {
        elementId: US_FOOD_ELEMENTS.nutritionPanel,
        label: 'the nutrient rows',
        pt: type.nutrientPt,
        reference: '21 CFR 101.9(d)(7)(iii)',
        drawnMm: smallestOf((id) => id.startsWith(NUTRITION_ROW_PREFIX)),
      },
    ].filter((entry): entry is typeof entry & { drawnMm: number } => entry.drawnMm !== undefined)

    // A reduced display puts every figure in one run, so there is no servings
    // line, serving size or Calories element to measure — and a pass saying "0
    // parts of the panel meet the type sizes" is a rule declining and reporting
    // that it cleared.
    if (checks.length === 0) return []

    const undersized = checks.filter(
      (entry) => entry.drawnMm < entry.pt * MM_PER_POINT - MEASUREMENT_TOLERANCE_MM,
    )

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

    return [
      passed(
        usFoodNutritionTypeSizeRule,
        FDA_NUTRITION_TYPE_SIZE_MET,
        `${checks.length} parts of the panel meet the type sizes 101.9(d) sets.`,
        US_FOOD_ELEMENTS.nutritionPanel,
      ),
    ]
  },
}
