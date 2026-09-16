/**
 * The net quantity declaration stands clear of the rest of the label.
 *
 * Source: 21 CFR 101.7(f), read from the eCFR on 2026-09-12: "The declaration
 * shall appear as a distinct item on the principal display panel, shall be
 * separated (by at least a space equal to the height of the lettering used in
 * the declaration) from other printed label information appearing above or below
 * the declaration and (by at least a space equal to twice the width of the
 * letter 'N' of the style of type used in the quantity of contents statement)
 * from other printed label information appearing to the left or right".
 *
 * Two readings this rule commits to, both recorded because neither is the only
 * possible one:
 *
 * - **"the height of the lettering" is the regulated letter height**, the same
 *   dimension 101.7(h)(2) has been defining for the preceding paragraph, rather
 *   than the em. The em is a typesetting number the regulation never uses, and
 *   reading it here would demand roughly 1.85 times the gap on a declaration set
 *   with lower case and 1.43 times on one set in capitals.
 * - **The two distances are alternatives, not both.** The text attaches each to
 *   a direction — one for information above or below, the other for information
 *   to the left or right — so a neighbour beside the declaration is judged on the
 *   horizontal gap and one stacked over it on the vertical. Requiring both of
 *   every neighbour would report a violation against a label that satisfies the
 *   clause that actually governs it.
 */

import { glyphHeightMm, measureTextMm } from '../../text/measure'
import { regulatedGlyphBasis } from '../../geometry/pdp'
import type { BoundingBox, Citation, Finding } from '../../types/index'
import type { TextPrimitive } from '../../layout/types'
import { NUTRITION_ELEMENT_PREFIX, US_FOOD_ELEMENTS } from '../../templates/usFood'
import { MEASUREMENT_TOLERANCE_MM, finding, mm, passedOnArtwork } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_NET_QUANTITY_CROWDED = 'FDA_NET_QUANTITY_CROWDED'
export const FDA_NET_QUANTITY_SEPARATION_MET = 'FDA_NET_QUANTITY_SEPARATION_MET'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.7(f)',
  title: 'Net quantity of contents — separation from other printed label information',
}

/**
 * Elements that are not "other printed label information": the substrate and the
 * panel are containers the declaration sits inside, so measuring a gap to them
 * would report every label as crowded by its own edge.
 */
const NOT_PRINTED_INFORMATION = new Set<string>([
  US_FOOD_ELEMENTS.border,
  US_FOOD_ELEMENTS.principalDisplayPanel,
  US_FOOD_ELEMENTS.netQuantity,
])

/**
 * The Nutrition Facts panel's own parts, which the panel box already stands for.
 *
 * Counting the box *and* its fifteen rows measures one block of ink sixteen
 * times: the pass read "stands clear of the 24 other elements on the panel" on a
 * label carrying five, and a single crowding could have produced a finding per
 * row. One defect, one finding — so the box is the neighbour and its contents
 * are not.
 */
const INSIDE_THE_NUTRITION_PANEL = (elementId: string): boolean =>
  // Imported rather than spelled out. The literal `'food-nutrition-'` was a
  // fourth copy of a prefix the sibling rules already take from `templates`, and
  // a rename would have quietly re-admitted every nutrient row as a neighbour —
  // turning one crowding back into a finding per row, which is the defect the
  // note above records fixing.
  elementId.startsWith(NUTRITION_ELEMENT_PREFIX) && elementId !== US_FOOD_ELEMENTS.nutritionPanel

/** Gap along one axis. Negative where the two boxes overlap on that axis. */
function gap(aStart: number, aSize: number, bStart: number, bSize: number): number {
  return Math.max(bStart - (aStart + aSize), aStart - (bStart + bSize))
}

export const usFoodNetQuantitySeparationRule: UsFoodRule = {
  id: 'us-food/net-quantity-separation',
  title: 'The net quantity declaration is separated from other printed label information.',
  citation: CITATION,
  codes: [FDA_NET_QUANTITY_CROWDED, FDA_NET_QUANTITY_SEPARATION_MET],
  appliesTo: 'us-food',

  check({ layout }: UsFoodContext): Finding[] {
    const declaration = layout.elements.find(
      (element) => element.elementId === US_FOOD_ELEMENTS.netQuantity,
    )
    const drawn = layout.primitives.find(
      (primitive): primitive is TextPrimitive =>
        primitive.kind === 'text' && primitive.elementId === US_FOOD_ELEMENTS.netQuantity,
    )
    if (declaration === undefined || drawn === undefined) return []

    const neighbours = layout.elements.filter(
      (element) =>
        !NOT_PRINTED_INFORMATION.has(element.elementId) &&
        !INSIDE_THE_NUTRITION_PANEL(element.elementId),
    )
    // Nothing else is printed on this panel, so there is nothing the declaration
    // could be crowded by. A rule with nothing to measure has not cleared the
    // label; it has declined.
    if (neighbours.length === 0) return []

    const basis = regulatedGlyphBasis(drawn.text)
    const requiredVerticalMm = glyphHeightMm(drawn.fontSizeMm, drawn.fontFamily, basis)
    const requiredHorizontalMm = 2 * measureTextMm('N', drawn.fontSizeMm, drawn.fontFamily)

    const box: BoundingBox = declaration.box
    const crowded = neighbours
      .map((neighbour) => ({
        neighbour,
        verticalMm: gap(box.yMm, box.heightMm, neighbour.box.yMm, neighbour.box.heightMm),
        horizontalMm: gap(box.xMm, box.widthMm, neighbour.box.xMm, neighbour.box.widthMm),
      }))
      .filter(
        ({ verticalMm, horizontalMm }) =>
          verticalMm < requiredVerticalMm - MEASUREMENT_TOLERANCE_MM &&
          horizontalMm < requiredHorizontalMm - MEASUREMENT_TOLERANCE_MM,
      )

    const required = `${mm(requiredVerticalMm)} above or below, ${mm(requiredHorizontalMm)} either side`

    if (crowded.length === 0) {
      return [
        passedOnArtwork(
          usFoodNetQuantitySeparationRule,
          FDA_NET_QUANTITY_SEPARATION_MET,
          `The declaration stands clear of the ${neighbours.length === 1 ? 'one other element' : `${neighbours.length} other elements`} ` +
            `on the panel, which requires ${required}.`,
          US_FOOD_ELEMENTS.netQuantity,
        ),
      ]
    }

    return crowded.map(({ neighbour, verticalMm, horizontalMm }) =>
      finding(usFoodNetQuantitySeparationRule, {
        code: FDA_NET_QUANTITY_CROWDED,
        severity: 'violation',
        message:
          `The declaration is ${mm(Math.max(verticalMm, 0))} from "${neighbour.label}" vertically ` +
          `and ${mm(Math.max(horizontalMm, 0))} horizontally; 101.7(f) requires ${required}.`,
        measurement: {
          actual: `${mm(Math.max(verticalMm, 0))} vertically, ${mm(Math.max(horizontalMm, 0))} horizontally`,
          required,
        },
        elementId: US_FOOD_ELEMENTS.netQuantity,
      }),
    )
  },
}
