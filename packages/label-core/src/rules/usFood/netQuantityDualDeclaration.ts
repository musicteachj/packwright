/**
 * The net quantity is declared in both inch/pound and SI metric units.
 *
 * **This requirement is not in 21 CFR 101.** FDA proposed SI declarations in
 * 1993 and never took final action on them; 81 FR 59129 (29 Aug 2016) says so
 * explicitly while renumbering the section. The obligation is statutory, from
 * the Fair Packaging and Labeling Act as amended in 1992 — 15 U.S.C. 1453(a)(2),
 * read from the US Code on 2026-09-12:
 *
 * > "The net quantity of contents […] shall be separately and accurately stated
 * > in a uniform location upon the principal display panel of that label, using
 * > the most appropriate units of both the customary inch/pound system of
 * > measure, as provided in paragraph (3) of this subsection, and, except as
 * > provided in paragraph (3)(A)(ii) or paragraph (6) of this subsection, the SI
 * > metric system"
 *
 * Both named exceptions are modelled, and each is cited to its own paragraph
 * rather than to (a)(2): a random package "is not required to, but may, include
 * a statement in terms of the SI metric system", and under (a)(6) the SI
 * requirement "shall not apply to foods that are packaged at the retail store
 * level." Citing the general clause on a finding about a specific exemption is
 * the mistake `finding.ts` records having shipped once already.
 *
 * Reading the document rather than the geometry is a means, not what is judged.
 * (a)(2) governs what is stated upon the panel, so the pass for both systems rests
 * on the artwork. Only the two exemptions rest on the document, because whether a
 * package is random or packaged at retail is a fact about the package.
 */

import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { UsFoodPackaging } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork, passedOnDocument } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_NET_QUANTITY_METRIC_MISSING = 'FDA_NET_QUANTITY_METRIC_MISSING'
export const FDA_NET_QUANTITY_DUAL_MET = 'FDA_NET_QUANTITY_DUAL_MET'
export const FDA_NET_QUANTITY_METRIC_NOT_REQUIRED = 'FDA_NET_QUANTITY_METRIC_NOT_REQUIRED'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '15 U.S.C. 1453(a)(2)',
  title: 'Net quantity of contents in both inch/pound and SI metric units',
}

/** Each exemption cites the paragraph that grants it, not the general rule. */
const EXEMPTION: Record<
  Exclude<UsFoodPackaging, 'standard'>,
  { citation: Citation; why: string }
> = {
  random: {
    citation: {
      authority: 'FDA',
      reference: '15 U.S.C. 1453(a)(3)(A)(ii)',
      title: 'Random packages — SI declaration permitted, not required',
    },
    why: 'this is a random package',
  },
  'packaged-at-retail': {
    citation: {
      authority: 'FDA',
      reference: '15 U.S.C. 1453(a)(6)',
      title: 'Foods packaged at the retail store level — SI requirement does not apply',
    },
    why: 'this food is packaged at the retail store level',
  },
}

export const usFoodNetQuantityDualDeclarationRule: UsFoodRule = {
  id: 'us-food/net-quantity-dual-declaration',
  title: 'The net quantity is declared in both inch/pound and SI metric units.',
  citation: CITATION,
  // The two exemptions live in the table above, so the list is built from it
  // rather than restated beside it.
  citations: [CITATION, ...Object.values(EXEMPTION).map((entry) => entry.citation)],
  codes: [
    FDA_NET_QUANTITY_METRIC_MISSING,
    FDA_NET_QUANTITY_DUAL_MET,
    FDA_NET_QUANTITY_METRIC_NOT_REQUIRED,
  ],
  appliesTo: 'us-food',

  check({ data }: UsFoodContext): Finding[] {
    const { inchPound, metric, packaging = 'standard' } = data.netQuantity

    // No declaration at all is a different defect from a declaration missing one
    // of its two halves, and this rule is not the one that reports it.
    if (inchPound.trim() === '') return []

    if (packaging !== 'standard') {
      const { citation, why } = EXEMPTION[packaging]
      // Both exemptions are permissions, so a label may carry the SI declaration
      // anyway — 1453(a)(3)(A)(ii) says a random package "is not required to, but
      // may, include" one. Saying "stands alone" of a label that plainly carries
      // both is a finding a user can see is wrong, and a finding a user can see
      // is wrong costs more than the one it replaces.
      //
      // Worded as the entitlement, not as what the panel shows. This pass rests on
      // the document and survives a declaration drawn off the stock, and "the label
      // carries an SI declaration" is false of one that never printed.
      const carriesMetric = metric !== undefined && metric.trim() !== ''
      return [
        // An exemption for this kind of package, true whether or not either declaration printed.
        passedOnDocument(
          usFoodNetQuantityDualDeclarationRule,
          FDA_NET_QUANTITY_METRIC_NOT_REQUIRED,
          carriesMetric
            ? `No SI declaration is required, because ${why}; "${metric.trim()}" is permitted ` +
                'all the same.'
            : `No SI declaration is required, because ${why}.`,
          US_FOOD_ELEMENTS.netQuantity,
          citation,
        ),
      ]
    }

    if (metric === undefined || metric.trim() === '') {
      return [
        finding(usFoodNetQuantityDualDeclarationRule, {
          code: FDA_NET_QUANTITY_METRIC_MISSING,
          severity: 'violation',
          message:
            `The label declares "${inchPound}" and no SI metric equivalent. The Fair Packaging ` +
            'and Labeling Act requires both systems on the principal display panel.',
          measurement: { actual: inchPound, required: `${inchPound} and an SI metric declaration` },
          elementId: US_FOOD_ELEMENTS.netQuantity,
        }),
      ]
    }

    return [
      // 1453(a)(2): both are "stated ... upon the principal display panel" — so the artwork.
      passedOnArtwork(
        usFoodNetQuantityDualDeclarationRule,
        FDA_NET_QUANTITY_DUAL_MET,
        `The label declares "${inchPound}" and "${metric}", covering both measurement systems.`,
        US_FOOD_ELEMENTS.netQuantity,
      ),
    ]
  },
}
