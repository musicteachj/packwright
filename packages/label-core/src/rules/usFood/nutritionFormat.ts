/**
 * The panel uses a display the package is entitled to.
 *
 * Source: 21 CFR 101.9(j)(13)(ii)(A), read from the eCFR on 2026-09-12. The
 * thresholds and the reasoning live in `fda/nutritionFormats.ts`; this measures
 * a label against them.
 *
 * **It reports a display used without entitlement, and never demands one.**
 * (j)(13)(ii) opens "may modify the requirements", so a small package is free to
 * carry the full vertical display and a rule insisting otherwise would report a
 * violation that does not exist — the lesson CLP Article 26's "optional" clauses
 * already taught this project.
 *
 * The area it measures is **the total surface available to bear labeling**, not
 * the principal display panel. 101.1 computes the panel for the net quantity and
 * (j)(13) measures the whole package; they are different numbers answering
 * different questions, and a label carries both.
 */

import { formatIsPermitted } from '../../fda/nutritionFormats'
import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnDocument } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_NUTRITION_FORMAT_NOT_PERMITTED = 'FDA_NUTRITION_FORMAT_NOT_PERMITTED'
export const FDA_NUTRITION_FORMAT_MET = 'FDA_NUTRITION_FORMAT_MET'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(j)(13)(ii)(A)',
  title: 'Tabular and linear displays for small packages',
}

const FORMAT_NAME = {
  vertical: 'the standard vertical display',
  tabular: 'a tabular display',
  linear: 'a linear display',
} as const

export const usFoodNutritionFormatRule: UsFoodRule = {
  id: 'us-food/nutrition-format',
  title: 'The nutrition label uses a display the package size entitles it to.',
  citation: CITATION,
  codes: [FDA_NUTRITION_FORMAT_NOT_PERMITTED, FDA_NUTRITION_FORMAT_MET],
  appliesTo: 'us-food',

  check({ data }: UsFoodContext): Finding[] {
    const panel = data.nutritionFacts
    const format = panel?.format ?? 'vertical'
    // The vertical display needs no entitlement and every package may use it, so
    // there is nothing to judge. Saying it passed would be a check that clears
    // every label carrying the default.
    if (panel === undefined || format === 'vertical') return []

    const availableSqInches = panel.availableSurfaceSqInches
    // Without the area the entitlement is unanswerable, and guessing it from the
    // principal display panel would answer a different paragraph's question.
    if (availableSqInches === undefined) return []

    const verdict = formatIsPermitted(format, {
      availableSqInches,
      ...(panel.cannotAccommodateVertical === undefined
        ? {}
        : { cannotAccommodateVertical: panel.cannotAccommodateVertical }),
      ...(panel.cannotAccommodateTabular === undefined
        ? {}
        : { cannotAccommodateTabular: panel.cannotAccommodateTabular }),
      ...(panel.continuousVerticalSpaceInches === undefined
        ? {}
        : { continuousVerticalSpaceInches: panel.continuousVerticalSpaceInches }),
    })

    if (!verdict.permitted) {
      return [
        finding(usFoodNutritionFormatRule, {
          code: FDA_NUTRITION_FORMAT_NOT_PERMITTED,
          severity: 'violation',
          message: `The panel uses ${FORMAT_NAME[format]}, but ${verdict.reason}.`,
          measurement: {
            actual: FORMAT_NAME[format],
            required: 'the standard vertical display',
          },
          elementId: US_FOOD_ELEMENTS.nutritionPanel,
          citation: { ...CITATION, reference: verdict.reference },
        }),
      ]
    }

    return [
      // On the document, not the artwork. This rule never reads the layout —
      // `check({ data })` is its whole signature — because an entitlement is
      // settled by the package's surface area, not by how much of the panel fit.
      // A panel drawn past the edge of its stock is still entitled to the
      // display it chose, and the omission reports the part that did not print.
      passedOnDocument(
        usFoodNutritionFormatRule,
        FDA_NUTRITION_FORMAT_MET,
        `A package of ${availableSqInches.toFixed(1)} in² may present its nutrition information ` +
          `in ${FORMAT_NAME[format]}.`,
        US_FOOD_ELEMENTS.nutritionPanel,
        // The paragraph that actually permitted it, which is not always this
        // rule's own: (d)(11)(iii) entitles a package of any size to the tabular
        // display and never goes through (j)(13) at all. `finding.ts` records
        // this exact mistake being shipped once — a passing GHS signal-word
        // check reporting under the EU regulation on a US label.
        { ...CITATION, reference: verdict.reference },
      ),
    ]
  },
}
