/**
 * The label bears a net quantity of contents declaration at all.
 *
 * Source: 21 CFR 101.7(a), read from the eCFR on 2026-09-12: "The principal
 * display panel of a food in package form shall bear a declaration of the net
 * quantity of contents."
 *
 * **This rule exists because its absence produced a false clearance.** The other
 * three net-quantity rules measure the declaration as drawn, and each declines
 * when nothing is drawn — which is correct on its own and catastrophic in
 * aggregate. A label carrying no declaration came back with three passes and a
 * CFR citation on each, because the engine drew an empty text primitive and the
 * type-size rule dutifully measured it at 4.76 mm "on capital letters". Three
 * rules each honestly reporting "not applicable" add up to "checked and clear"
 * unless one of them owns the case where the element is missing entirely.
 *
 * Reading the document rather than the geometry: whether the label bears a
 * declaration is a fact about what it says, not about where ink lands, and there
 * is by definition no geometry to read.
 */

import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_NET_QUANTITY_MISSING = 'FDA_NET_QUANTITY_MISSING'
export const FDA_NET_QUANTITY_DECLARED_MET = 'FDA_NET_QUANTITY_DECLARED_MET'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.7(a)',
  title: 'The principal display panel shall bear a declaration of net quantity of contents',
}

export const usFoodNetQuantityPresentRule: UsFoodRule = {
  id: 'us-food/net-quantity-present',
  title: 'The principal display panel bears a net quantity of contents declaration.',
  citation: CITATION,
  codes: [FDA_NET_QUANTITY_MISSING, FDA_NET_QUANTITY_DECLARED_MET],
  appliesTo: 'us-food',

  check({ data }: UsFoodContext): Finding[] {
    const declared = data.netQuantity.inchPound.trim() !== ''

    if (!declared) {
      return [
        finding(usFoodNetQuantityPresentRule, {
          code: FDA_NET_QUANTITY_MISSING,
          // Non-compliant as drawn, and not by a margin that could be argued:
          // a mandatory element of the principal display panel is absent.
          severity: 'blocking',
          message:
            'The label bears no net quantity of contents declaration. A food in package form ' +
            'must carry one on its principal display panel.',
          measurement: { actual: 'no declaration', required: 'a declaration of net quantity' },
          elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
        }),
      ]
    }

    return [
      passedOnArtwork(
        usFoodNetQuantityPresentRule,
        FDA_NET_QUANTITY_DECLARED_MET,
        `The panel bears a net quantity declaration, "${data.netQuantity.inchPound.trim()}".`,
        US_FOOD_ELEMENTS.netQuantity,
      ),
    ]
  },
}
