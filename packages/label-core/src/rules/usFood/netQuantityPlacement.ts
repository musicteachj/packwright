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
 * Three things that proviso settles. It is an exemption, not a relaxation, so a
 * small package placed anywhere on its panel is compliant and must not be
 * reported. The threshold is the area of the *package's* panel — which for a
 * cylinder is 40% of height × circumference, not the size of the label stock —
 * so the exemption is tested against `pdpAreaSqInches(container)` while the zone
 * itself is measured on the drawn panel.
 *
 * **And it is conditional.** The requirement "shall not apply *when* the
 * declaration … meets the other requirements of this part", so where the
 * declaration does not, the requirement applies and placement is judged as for
 * any package. Keyed on area alone, this rule issued the exemption beside
 * `FDA_NET_QUANTITY_TYPE_TOO_SMALL` for the same declaration — a pass resting on a
 * condition the report had just said was unmet.
 *
 * "This part" is 21 CFR part 101, re-read from the eCFR on 2026-09-16, and three of
 * its requirements on the declaration are checked here: that the panel bears one,
 * under 101.7(a); its type size, under 101.7(i); and its separation from other
 * printed information, under 101.7(f). The exemption is granted only when all three
 * cleared the same declaration. The dual declaration is **not** one of them: the
 * metric mandate is the Fair Packaging and Labeling Act's, which
 * `netQuantityDualDeclaration.ts` cites, and 101.7(p) says only that a metric
 * statement "may also appear". The rest of 101.7 — a distinct item, no qualifying
 * term, boldface and contrast, (h)(1)'s 3:1, the unit forms of (j) and (k) — is not
 * modelled, and the pass says it rests on the three alone.
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
import { MEASUREMENT_TOLERANCE_MM, finding, mm, passedOnArtwork } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'
import { FDA_NET_QUANTITY_DECLARED_MET, usFoodNetQuantityPresentRule } from './netQuantityPresent'
import { FDA_NET_QUANTITY_CROWDED, usFoodNetQuantitySeparationRule } from './netQuantitySeparation'
import {
  FDA_NET_QUANTITY_TYPE_SIZE_MET,
  usFoodNetQuantityTypeSizeRule,
} from './netQuantityTypeSize'

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

  check(context: UsFoodContext): Finding[] {
    const { data, layout } = context
    const declaration = layout.elements.find(
      (element) => element.elementId === US_FOOD_ELEMENTS.netQuantity,
    )
    const panel = layout.elements.find(
      (element) => element.elementId === US_FOOD_ELEMENTS.principalDisplayPanel,
    )
    if (declaration === undefined || panel === undefined) return []

    const pdpSqInches = pdpAreaSqInches(data.container)
    const small = !isNetQuantityZoneRequired(pdpSqInches)
    const unmet = small ? otherRequirementsUnmet(context) : []

    if (small && unmet.length === 0) {
      return [
        // (f)'s proviso turns on the printed declaration meeting the other requirements: artwork.
        passedOnArtwork(
          usFoodNetQuantityPlacementRule,
          FDA_NET_QUANTITY_ZONE_NOT_REQUIRED,
          `The panel is ${pdpSqInches.toFixed(1)} in² and the declaration meets 101.7(a), (i) and ` +
            "(f)'s separation, so the bottom-30 percent placement requirement does not apply to " +
            'this package. The rest of 101.7 is not checked, and the exemption rests on those three.',
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
        // 101.7(f) places the printed declaration in the bottom 30 percent: the artwork.
        passedOnArtwork(
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
          `30 percent of a ${pdpSqInches.toFixed(1)} in² panel begins at ${mm(zoneTopMm)}.` +
          // Said, because a package this small is exempt when the rest is met, and a
          // user who knows that deserves to hear why it was not.
          (small
            ? ` The small-package exemption does not apply, because the declaration does not ` +
              `meet ${unmet.join(' or ')}.`
            : ''),
        measurement,
        elementId: US_FOOD_ELEMENTS.netQuantity,
      }),
    ]
  },
}

/**
 * Which of the other part 101 requirements this project checks the declaration
 * does not meet, in words — empty when all three cleared it.
 *
 * Asked of the rules themselves rather than re-derived, so the exemption can never
 * disagree with the findings printed beside it. A rule that declined has not
 * cleared anything, with one exception: separation declines when nothing else is
 * printed on the panel, and a declaration with nothing to be crowded by is not
 * crowded. Type size declines only when no declaration was drawn, which has not
 * met a size requirement.
 */
function otherRequirementsUnmet(context: UsFoodContext): string[] {
  const codes = (rule: UsFoodRule) => rule.check(context).map((result) => result.code)
  const unmet: string[] = []
  if (!codes(usFoodNetQuantityPresentRule).includes(FDA_NET_QUANTITY_DECLARED_MET)) {
    unmet.push('101.7(a)')
  }
  if (!codes(usFoodNetQuantityTypeSizeRule).includes(FDA_NET_QUANTITY_TYPE_SIZE_MET)) {
    unmet.push("101.7(i)'s type size")
  }
  if (codes(usFoodNetQuantitySeparationRule).includes(FDA_NET_QUANTITY_CROWDED)) {
    unmet.push("101.7(f)'s separation")
  }
  return unmet
}
