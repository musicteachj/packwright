/**
 * Reduced labelling for small containers.
 *
 * **Sources, both read rather than recalled.** 29 CFR 1910.1200(f)(12), from the
 * eCFR on 2026-09-12 (title 29 issued 2026-09-09). CLP Annex I sections 1.5.1
 * and 1.5.2, from the consolidated text `02008R1272 — EN — 01.09.2025 —
 * 029.003`.
 *
 * **The two regimes are not the same rule with a different number on it**, and
 * the design document's one-line summary of this was wrong in four ways. OSHA
 * sets a *requirement*: at 100 ml or less, a reduced but mandatory minimum set.
 * CLP grants a *permission*: at 125 ml or less, statements may be omitted for
 * listed hazard categories. The thresholds differ, the contents differ, and only
 * one of them mentions a statement pointing at the outer package.
 *
 * **Neither applies on capacity alone.** OSHA (f)(12)(i) applies only where the
 * manufacturer "can demonstrate that it is not feasible to use pull-out labels,
 * fold-back labels, or tags containing the full label information", and CLP's
 * hangs on Article 29. Both are determinations about packaging and process that
 * no amount of inspecting a label can settle, so the supplier declares the path
 * and this rule checks what that declaration then obliges them to carry. A rule
 * that switched on capacity alone would be enforcing a provision nobody invoked.
 *
 * The 3 ml tier in (f)(12)(iii) is deliberately not encoded: it applies "where
 * the chemical manufacturer... can demonstrate that any label interferes with
 * the normal use of the container", which is a further determination this engine
 * has no way to represent, and encoding the relaxation without the condition
 * would let a label drop its pictograms on a capacity check alone.
 */

import { GHS_ELEMENTS } from '../../templates/ghs'
import type { GhsRegime } from '../../ghs/statements'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork } from '../finding'
import type { GhsChemicalContext, GhsChemicalRule } from '../types'

export const GHS_SMALL_CONTAINER_INCOMPLETE = 'GHS_SMALL_CONTAINER_INCOMPLETE'
export const GHS_SMALL_CONTAINER_NOT_ELIGIBLE = 'GHS_SMALL_CONTAINER_NOT_ELIGIBLE'
export const GHS_SMALL_CONTAINER_AVAILABLE = 'GHS_SMALL_CONTAINER_AVAILABLE'
export const GHS_SMALL_CONTAINER_COMPLETE = 'GHS_SMALL_CONTAINER_COMPLETE'

const US: Citation = {
  authority: 'OSHA',
  reference: '29 CFR 1910.1200(f)(12)',
  title: 'Small container labelling',
}

const EU: Citation = {
  authority: 'EU',
  reference: 'Regulation (EC) No 1272/2008 (CLP), Annex I, 1.5',
  title: 'Exemptions from labelling and packaging requirements',
}

/** OSHA (f)(12)(ii): "a container less than or equal to 100 ml capacity". */
export const OSHA_SMALL_CONTAINER_MAX_L = 0.1
/** CLP 1.5.2.1.1(a): "the contents of the package do not exceed 125 ml". */
export const CLP_SMALL_PACKAGE_MAX_L = 0.125

/** The threshold for a regime, so a form cannot state a different number than the rule applies. */
export function smallContainerThresholdL(regime: GhsRegime): number {
  return regime === 'us-osha' ? OSHA_SMALL_CONTAINER_MAX_L : CLP_SMALL_PACKAGE_MAX_L
}

export const ghsSmallContainerRule: GhsChemicalRule = {
  id: 'ghs/small-container',
  title: 'A label relying on the small-container provision carries what that provision requires.',
  citation: US,
  citations: [US, EU],
  codes: [
    GHS_SMALL_CONTAINER_INCOMPLETE,
    GHS_SMALL_CONTAINER_NOT_ELIGIBLE,
    GHS_SMALL_CONTAINER_AVAILABLE,
    GHS_SMALL_CONTAINER_COMPLETE,
  ],
  appliesTo: 'ghs-chemical',

  check({ data, layout }: GhsChemicalContext): Finding[] {
    const isUs = data.regime === 'us-osha'
    const citation = isUs ? US : EU
    const maxL = smallContainerThresholdL(data.regime)
    const eligible = data.capacityL <= maxL

    if (!data.smallContainerLabelling) {
      // Not on this path. Say the provision exists where it could be used, and
      // say nothing at all where it could not.
      if (!eligible) return []
      return [
        finding(ghsSmallContainerRule, {
          code: GHS_SMALL_CONTAINER_AVAILABLE,
          severity: 'guidance',
          message:
            `At ${data.capacityL} litres this container is within the ${maxL} litre threshold for ` +
            (isUs
              ? 'reduced labelling, which applies where full-information pull-out, fold-back or tag ' +
                'labelling is not feasible.'
              : 'the small-package exemptions, under which some statements may be omitted for ' +
                'certain hazard categories.'),
          citation,
        }),
      ]
    }

    if (!eligible) {
      return [
        finding(ghsSmallContainerRule, {
          code: GHS_SMALL_CONTAINER_NOT_ELIGIBLE,
          severity: 'violation',
          message:
            `This label relies on the small-container provision, but at ${data.capacityL} litres ` +
            `the container exceeds the ${maxL} litre threshold the provision sets.`,
          measurement: { actual: `${data.capacityL} L`, required: `${maxL} L or less` },
          citation,
        }),
      ]
    }

    // The minimum set each regime demands on the container itself.
    const missing: string[] = []
    if (!data.productIdentifier.trim()) missing.push('the product identifier')
    if (layout.pictograms.length === 0) missing.push('at least one hazard pictogram')
    // OSHA lists the signal word; CLP 1.5.1.2 does not.
    if (isUs && !data.signalWords?.length) missing.push('the signal word')
    if (!data.supplier?.name?.trim()) {
      missing.push(isUs ? 'the manufacturer’s name' : 'the supplier’s name')
    }
    // Both regimes name a telephone number explicitly, and it is the element
    // most easily left off since it is optional everywhere else.
    if (!data.supplier?.telephone?.trim()) {
      missing.push(isUs ? 'the manufacturer’s phone number' : 'the supplier’s telephone number')
    }
    if (isUs && !data.outerPackageStatement?.trim()) {
      missing.push('a statement that the full label information is on the immediate outer package')
    }

    if (missing.length > 0) {
      const list =
        missing.length === 1
          ? missing[0]
          : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
      return [
        finding(ghsSmallContainerRule, {
          code: GHS_SMALL_CONTAINER_INCOMPLETE,
          severity: 'violation',
          message: `A small container relying on this provision must still carry ${list}.`,
          elementId: GHS_ELEMENTS.supplier,
          citation,
        }),
      ]
    }

    return [
      passedOnArtwork(
        ghsSmallContainerRule,
        GHS_SMALL_CONTAINER_COMPLETE,
        'The container carries everything the small-container provision requires of it.',
        undefined,
        citation,
      ),
    ]
  },
}
