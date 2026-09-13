/**
 * Everything on the panel clears the 1/16 inch floor.
 *
 * Source: 21 CFR 101.2(c), read from the eCFR on 2026-09-12: "All information
 * appearing on the principal display panel or the information panel pursuant to
 * this section shall appear prominently and conspicuously, but **in no case may
 * the letters and/or numbers be less than one-sixteenth inch in height** unless
 * an exemption pursuant to paragraph (f) of this section is established. The
 * requirements for conspicuousness and legibility shall include the
 * specifications of §§ 101.7(h)(1) and (2) and 101.15."
 *
 * That last sentence is why this rule can exist at all. 101.2(c) sets a height
 * and says nothing about how to measure it, then incorporates 101.7(h)(2) by
 * reference — so the letter a height refers to is the same one the net quantity
 * is judged on: a capital by default, the lowercase "o" where any lower case
 * appears. `regulatedGlyphBasis` reads that once for both.
 *
 * **A floor, not a requirement in its own right.** The net quantity answers to
 * 101.7(i), which demands more on all but the smallest panels, and is excluded
 * here rather than judged twice — two findings about one dimension, under two
 * citations, would read as two defects.
 *
 * 101.7(h)(1)'s 3:1 ratio comes in through the same sentence and is not enforced,
 * for the reason recorded in `registry.ts`: `TextPrimitive` has no horizontal
 * scale, so a rule about condensed type could never fail.
 */

import { INFORMATION_PANEL_MIN_TYPE_HEIGHT_MM, regulatedGlyphBasis } from '../../geometry/pdp'
import type { TextPrimitive } from '../../layout/types'
import { NUTRITION_ROW_PREFIX, US_FOOD_ELEMENTS } from '../../templates/usFood'
import { glyphHeightMm } from '../../text/measure'
import type { Citation, Finding } from '../../types/index'
import { MEASUREMENT_TOLERANCE_MM, finding, mm, passed } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_PANEL_TYPE_TOO_SMALL = 'FDA_PANEL_TYPE_TOO_SMALL'
export const FDA_PANEL_TYPE_SIZE_MET = 'FDA_PANEL_TYPE_SIZE_MET'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.2(c)',
  title: 'No letter or numeral on the panel may be less than one-sixteenth inch in height',
}

/**
 * Elements whose type size a different paragraph governs.
 *
 * The net quantity answers to 101.7(i), which demands more on all but the
 * smallest panels; measuring it here too would report one dimension as two
 * defects under two citations.
 *
 * **The Nutrition Facts panel answers to 101.9, and that is not a nicety.**
 * 101.2(b) does list 101.9 among the sections whose information belongs on these
 * panels, so a literal reading of (c) would put the 1/16 inch floor over the
 * nutrition label too. It cannot be the reading: 101.9(d)(7)(iii) sets the
 * nutrient rows at "no smaller than 8 point" and (d)(9) the footnote at 6, and
 * neither clears 1/16 inch measured the way 101.7(h)(2) measures — 8 point of
 * IBM Plex puts the lowercase "o" at 1.52 mm against a 1.59 mm floor. Applying
 * it here would report every compliant Nutrition Facts label in the country.
 * The specific provision governs, 101.2(d)(1) already defers to 101.9 by name
 * elsewhere, and stage 5's own rules check the sizes 101.9 does set.
 */
const JUDGED_ELSEWHERE = new Set<string>([
  US_FOOD_ELEMENTS.netQuantity,
  US_FOOD_ELEMENTS.nutritionPanel,
  US_FOOD_ELEMENTS.nutritionHeading,
  US_FOOD_ELEMENTS.nutritionServings,
  US_FOOD_ELEMENTS.nutritionServingSize,
  US_FOOD_ELEMENTS.nutritionCalories,
  // The numeral beside the word, which 101.9(d)(1)(iii) sizes separately and
  // which therefore carries an id of its own. Without it here the one part of the
  // panel most clearly governed by 101.9 was judged against 101.2(c) as well,
  // and — having no `ResolvedElement` — reported under a raw element id that
  // highlighted nothing on the canvas.
  US_FOOD_ELEMENTS.nutritionCaloriesFigure,
  US_FOOD_ELEMENTS.nutritionFootnote,
])

/**
 * Rows carry a generated id per nutrient, so they are matched by prefix — and
 * the prefix names the rows and only the rows. A bare `food-nutrition-` also
 * matched the heading, the servings lines and the footnote, which is harmless
 * here (they are listed above anyway) and was not harmless in the rule that
 * checks 101.9's own sizes: it picked up the 6 point footnote and reported it
 * against the 8 point minimum for nutrient rows.
 */
// Imported rather than written out, for the reason `nutritionTypeSize` gives.

export const usFoodInformationPanelTypeSizeRule: UsFoodRule = {
  id: 'us-food/information-panel-type-size',
  title: 'Every letter on the panel is at least one-sixteenth of an inch high.',
  citation: CITATION,
  codes: [FDA_PANEL_TYPE_TOO_SMALL, FDA_PANEL_TYPE_SIZE_MET],
  appliesTo: 'us-food',

  check({ layout }: UsFoodContext): Finding[] {
    const drawn = layout.primitives.filter(
      (primitive): primitive is TextPrimitive =>
        primitive.kind === 'text' &&
        primitive.elementId !== undefined &&
        !JUDGED_ELSEWHERE.has(primitive.elementId) &&
        !primitive.elementId.startsWith(NUTRITION_ROW_PREFIX),
    )
    // Nothing else on the panel is nothing to measure, which is not a pass.
    if (drawn.length === 0) return []

    const required = mm(INFORMATION_PANEL_MIN_TYPE_HEIGHT_MM)

    // One finding per element rather than per line — a wrapped ingredient
    // statement is one undersized thing, not nine — and **the basis comes from
    // the whole element**, not from whichever line happens to be first.
    //
    // Sampling one line got this wrong in a way that looked right: an ingredient
    // statement wrapping to "INGREDIENTS: WHOLE GRAIN ROLLED OATS AND MANY..." /
    // "...NOW, natural flavor." was judged on its all-caps first line and cleared
    // at 2.5 mm of em, while the responsible firm at the identical size failed at
    // 1.35 mm. Same rule, same size, two verdicts. 101.7(h)(2) asks whether upper
    // and lower case "are used" — of the text, not of a line of it.
    const byElement = new Map<string, { fontSizeMm: number; fontFamily: string; text: string }>()
    for (const primitive of drawn) {
      const seen = byElement.get(primitive.elementId!)
      byElement.set(primitive.elementId!, {
        fontSizeMm: Math.min(primitive.fontSizeMm, seen?.fontSizeMm ?? Infinity),
        fontFamily: seen?.fontFamily ?? primitive.fontFamily,
        text: `${seen?.text ?? ''}${primitive.text}`,
      })
    }

    const labels = new Map(layout.elements.map((element) => [element.elementId, element.label]))
    const undersized = [...byElement.entries()].flatMap(([elementId, element]) => {
      const actualMm = glyphHeightMm(
        element.fontSizeMm,
        element.fontFamily,
        regulatedGlyphBasis(element.text),
      )
      return actualMm < INFORMATION_PANEL_MIN_TYPE_HEIGHT_MM - MEASUREMENT_TOLERANCE_MM
        ? [{ elementId, actualMm }]
        : []
    })

    if (undersized.length > 0) {
      return undersized.map(({ elementId, actualMm }) =>
        finding(usFoodInformationPanelTypeSizeRule, {
          code: FDA_PANEL_TYPE_TOO_SMALL,
          severity: 'violation',
          message:
            `"${labels.get(elementId) ?? elementId}" is set at ${mm(actualMm)}; nothing on the ` +
            `panel may be smaller than ${required}.`,
          measurement: { actual: mm(actualMm), required },
          elementId,
        }),
      )
    }

    return [
      passed(
        usFoodInformationPanelTypeSizeRule,
        FDA_PANEL_TYPE_SIZE_MET,
        `${byElement.size} element${byElement.size === 1 ? '' : 's'} on the panel clear the ` +
          `${required} floor.`,
        US_FOOD_ELEMENTS.principalDisplayPanel,
      ),
    ]
  },
}
