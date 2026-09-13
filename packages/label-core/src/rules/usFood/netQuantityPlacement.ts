/**
 * The net quantity declaration sits in the bottom 30% of the panel.
 *
 * Source: 21 CFR 101.7(f), read from the eCFR on 2026-09-12: "It shall be placed
 * on the principal display panel within the bottom 30 percent of the area of the
 * label panel in lines generally parallel to the base on which the package rests
 * as it is designed to be displayed: Provided, That on packages having a
 * principal display panel of 5 square inches or less, the requirement for
 * placement within the bottom 30 percent of the area of the label panel shall
 * not apply when the declaration of net quantity of contents meets the other
 * requirements of this part."
 *
 * Two things that proviso settles. It is an exemption, not a relaxation, so a
 * small package placed anywhere on its panel is compliant and must not be
 * reported. And the threshold is the area of the *package's* panel — which for a
 * cylinder is 40% of height × circumference, not the size of the label stock —
 * so the exemption is tested against `pdpAreaSqInches(container)` while the zone
 * itself is measured on the drawn panel.
 *
 * The "lines generally parallel to the base" clause needs no rule: this engine
 * draws no rotated text, so it is satisfied by construction rather than checked.
 */

import {
  isNetQuantityZoneRequired,
  netQuantityZoneTopMm,
  pdpAreaSqInches,
} from '../../geometry/pdp'
import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { MEASUREMENT_TOLERANCE_MM, finding, mm, passed } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_NET_QUANTITY_OUTSIDE_ZONE = 'FDA_NET_QUANTITY_OUTSIDE_ZONE'
export const FDA_NET_QUANTITY_PLACEMENT_MET = 'FDA_NET_QUANTITY_PLACEMENT_MET'
export const FDA_NET_QUANTITY_ZONE_NOT_REQUIRED = 'FDA_NET_QUANTITY_ZONE_NOT_REQUIRED'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.7(f)',
  title: 'Net quantity of contents — placement within the bottom 30 percent of the panel',
}

export const usFoodNetQuantityPlacementRule: UsFoodRule = {
  id: 'us-food/net-quantity-placement',
  title: 'The net quantity declaration sits within the bottom 30 percent of the panel.',
  citation: CITATION,
  codes: [
    FDA_NET_QUANTITY_OUTSIDE_ZONE,
    FDA_NET_QUANTITY_PLACEMENT_MET,
    FDA_NET_QUANTITY_ZONE_NOT_REQUIRED,
  ],
  appliesTo: 'us-food',

  check({ data, layout }: UsFoodContext): Finding[] {
    const declaration = layout.elements.find(
      (element) => element.elementId === US_FOOD_ELEMENTS.netQuantity,
    )
    const panel = layout.elements.find(
      (element) => element.elementId === US_FOOD_ELEMENTS.principalDisplayPanel,
    )
    if (declaration === undefined || panel === undefined) return []

    const pdpSqInches = pdpAreaSqInches(data.container)

    if (!isNetQuantityZoneRequired(pdpSqInches)) {
      return [
        passed(
          usFoodNetQuantityPlacementRule,
          FDA_NET_QUANTITY_ZONE_NOT_REQUIRED,
          `The panel is ${pdpSqInches.toFixed(1)} in², so the bottom-30 percent placement ` +
            'requirement does not apply to this package.',
          US_FOOD_ELEMENTS.netQuantity,
        ),
      ]
    }

    // `netQuantityZoneTopMm` returns an offset from the panel top, and the panel
    // is inset from the stock by its margin, so the two are added rather than
    // one being used as the other.
    const zoneTopMm = panel.box.yMm + netQuantityZoneTopMm(panel.box.heightMm)
    const measurement = {
      actual: mm(declaration.box.yMm),
      required: `at or below ${mm(zoneTopMm)}`,
    }

    if (declaration.box.yMm >= zoneTopMm - MEASUREMENT_TOLERANCE_MM) {
      return [
        passed(
          usFoodNetQuantityPlacementRule,
          FDA_NET_QUANTITY_PLACEMENT_MET,
          `The declaration starts ${measurement.actual} from the top of the label, inside the ` +
            `bottom 30 percent of the panel, which begins at ${mm(zoneTopMm)}.`,
          US_FOOD_ELEMENTS.netQuantity,
        ),
      ]
    }

    return [
      finding(usFoodNetQuantityPlacementRule, {
        code: FDA_NET_QUANTITY_OUTSIDE_ZONE,
        severity: 'violation',
        message:
          `The declaration starts ${measurement.actual} from the top of the label; the bottom ` +
          `30 percent of a ${pdpSqInches.toFixed(1)} in² panel begins at ${mm(zoneTopMm)}.`,
        measurement,
        elementId: US_FOOD_ELEMENTS.netQuantity,
      }),
    ]
  },
}
