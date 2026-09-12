/**
 * The net quantity declaration is set at least as large as the panel demands.
 *
 * Source: 21 CFR 101.7, read from the eCFR on 2026-09-12. Two paragraphs, and
 * conflating them is the defect this rule exists to avoid:
 *
 * - **(i)** is the table — 1/16 inch at 5 in² or less, 1/8 above that to 25,
 *   3/16 to 100, 1/4 to 400, 1/2 beyond. Bands close at the upper bound. Its
 *   closing sentence adds 1/16 inch where the declaration is blown, embossed or
 *   molded into the surface rather than printed on it.
 * - **(h)(2)** says which letter is measured, and it is not always the same one:
 *   capitals by default, the lowercase "o" only where the declaration carries
 *   some lower case.
 *
 * Neither letter is the em. `TextPrimitive.fontSizeMm` is the em, which for
 * IBM Plex Sans runs 1.852 times the "o" and 1.433 times a capital — so a rule
 * comparing the requirement against that field directly would clear type at 54%
 * of the legal minimum. This measures the drawn primitive through
 * `glyphHeightMm`, whose per-face ratios are generated from the embedded TTFs.
 *
 * **21 CFR 101.105 is not cited anywhere.** That was this section's number until
 * 81 FR 59129 redesignated it on 29 Aug 2016; the section it names no longer
 * exists, though much of the secondary literature still points at it.
 */

import {
  minNetQuantityTypeHeightMm,
  regulatedGlyphBasis,
  pdpAreaSqInches,
} from '../../geometry/pdp'
import { glyphHeightMm } from '../../text/measure'
import type { TextPrimitive } from '../../layout/types'
import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { MEASUREMENT_TOLERANCE_MM, finding, mm, passed } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_NET_QUANTITY_TYPE_TOO_SMALL = 'FDA_NET_QUANTITY_TYPE_TOO_SMALL'
export const FDA_NET_QUANTITY_TYPE_SIZE_MET = 'FDA_NET_QUANTITY_TYPE_SIZE_MET'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.7(i)',
  title: 'Net quantity of contents — type size by area of the principal display panel',
}

const BASIS_NAME = {
  'cap-height': 'capital letters',
  'lowercase-o': 'the lowercase "o"',
} as const

export const usFoodNetQuantityTypeSizeRule: UsFoodRule = {
  id: 'us-food/net-quantity-type-size',
  title: 'The net quantity declaration meets the minimum type size for the panel area.',
  citation: CITATION,
  codes: [FDA_NET_QUANTITY_TYPE_TOO_SMALL, FDA_NET_QUANTITY_TYPE_SIZE_MET],
  appliesTo: 'us-food',

  check({ data, layout }: UsFoodContext): Finding[] {
    const drawn = layout.primitives.find(
      (primitive): primitive is TextPrimitive =>
        primitive.kind === 'text' && primitive.elementId === US_FOOD_ELEMENTS.netQuantity,
    )
    // No declaration drawn is nothing measured, which is not the same as a
    // declaration that clears the minimum.
    if (drawn === undefined) return []

    const pdpSqInches = pdpAreaSqInches(data.container)
    const markingMethod = data.markingMethod ?? 'printed'
    const requiredMm = minNetQuantityTypeHeightMm(pdpSqInches, markingMethod)

    const basis = regulatedGlyphBasis(drawn.text)
    const actualMm = glyphHeightMm(drawn.fontSizeMm, drawn.fontFamily, basis)

    const panelText = `${pdpSqInches.toFixed(1)} in² panel`
    const formedNote =
      markingMethod === 'printed'
        ? ''
        : ', including the 1/16 inch 101.7(i) adds for a declaration formed in the surface'
    const measurement = { actual: mm(actualMm), required: mm(requiredMm) }

    if (actualMm >= requiredMm - MEASUREMENT_TOLERANCE_MM) {
      return [
        passed(
          usFoodNetQuantityTypeSizeRule,
          FDA_NET_QUANTITY_TYPE_SIZE_MET,
          `The declaration measures ${measurement.actual} on ${BASIS_NAME[basis]}, meeting the ` +
            `${measurement.required} a ${panelText} requires${formedNote}.`,
          US_FOOD_ELEMENTS.netQuantity,
        ),
      ]
    }

    return [
      finding(usFoodNetQuantityTypeSizeRule, {
        code: FDA_NET_QUANTITY_TYPE_TOO_SMALL,
        severity: 'violation',
        message:
          `The declaration measures ${measurement.actual} on ${BASIS_NAME[basis]}; a ${panelText} ` +
          `requires ${measurement.required}${formedNote}.`,
        measurement,
        elementId: US_FOOD_ELEMENTS.netQuantity,
      }),
    ]
  },
}
