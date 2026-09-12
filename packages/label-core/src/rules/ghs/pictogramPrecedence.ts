/**
 * Pictogram precedence — and why it needs the classification, not the codes.
 *
 * Three of CLP Article 26's five rules are conditional on *why* a pictogram is
 * on the label, not merely that it is. 26(c) suppresses the exclamation mark
 * under the corrosion pictogram only "for skin or eye irritation"; 26(d) only
 * where the health hazard pictogram is there for respiratory sensitisation, and
 * only against skin sensitisation or skin and eye irritation. A rule that fired
 * on "GHS05 and GHS07 are both present" would report a violation on a label
 * where the exclamation mark came from acute toxicity category 4, which Article
 * 26 says nothing about. That is a false verdict under a real citation.
 *
 * So this rule reads `hazards` and **declines when it has none**. Without the
 * classification it cannot tell a conformant label from a non-conformant one,
 * and saying nothing is the honest answer.
 *
 * Two of the five make the second pictogram *optional* rather than forbidden —
 * 26(a) and 26(e) both say "shall be optional". Those are guidance, not
 * violations, and flattening them into violations would misstate the law in the
 * stricter direction.
 *
 * **OSHA's set is different and narrower.** 1910.1200 Appendix C.2.1 has four
 * rules to CLP's five: it has no equivalent of 26(a) or 26(e) at all, and its
 * skull-and-crossbones rule applies only "where it is used for acute toxicity"
 * where CLP's has no qualifier. Each regime is checked against its own text.
 */

import { hazardsRequiring } from '../../ghs/classification'
import type { GhsPictogramCode } from '../../ghs/pictograms'
import type { Citation, Finding } from '../../types/index'
import { finding, passed } from '../finding'
import type { GhsChemicalContext, GhsChemicalRule } from '../types'

export const GHS_PICTOGRAM_PRECEDENCE_VIOLATED = 'GHS_PICTOGRAM_PRECEDENCE_VIOLATED'
export const GHS_PICTOGRAM_PRECEDENCE_OPTIONAL = 'GHS_PICTOGRAM_PRECEDENCE_OPTIONAL'
export const GHS_PICTOGRAM_PRECEDENCE_MET = 'GHS_PICTOGRAM_PRECEDENCE_MET'

const EU: Citation = {
  authority: 'EU',
  reference: 'Regulation (EC) No 1272/2008 (CLP), Article 26(1)',
  title: 'Principles of precedence for hazard pictograms',
}

const US: Citation = {
  authority: 'OSHA',
  reference: '29 CFR 1910.1200, Appendix C, C.2.1',
  title: 'Precedence of hazard information',
}

/**
 * Annex V puts respiratory and skin sensitisation in the same section (3.4), so
 * the section alone cannot tell them apart and the description has to. Both
 * strings are verbatim from the annex.
 */
const isSkinOrEyeIrritation = (description: string) =>
  /skin irritation|eye irritation/i.test(description)
const isSkinSensitisation = (description: string) => /skin sensitisation/i.test(description)
const isRespiratorySensitisation = (description: string) =>
  /respiratory sensitisation/i.test(description)
const isAcuteToxicity = (description: string) => /acute toxicity/i.test(description)

export const ghsPictogramPrecedenceRule: GhsChemicalRule = {
  id: 'ghs/pictogram-precedence',
  title: 'Pictograms are reduced according to the precedence rules for the regime.',
  citation: EU,
  codes: [
    GHS_PICTOGRAM_PRECEDENCE_VIOLATED,
    GHS_PICTOGRAM_PRECEDENCE_OPTIONAL,
    GHS_PICTOGRAM_PRECEDENCE_MET,
  ],
  appliesTo: 'ghs-chemical',

  check({ data, layout }: GhsChemicalContext): Finding[] {
    const hazards = data.hazards ?? []
    // Without a classification there is no "why", and every conditional rule
    // below is unanswerable. Declining is not a pass.
    if (hazards.length === 0) return []

    const drawn = new Set(layout.pictograms.map((p) => p.code as GhsPictogramCode))
    const has = (code: GhsPictogramCode) => drawn.has(code)
    const elementOf = (code: GhsPictogramCode) =>
      layout.pictograms.find((p) => p.code === code)?.elementId

    const citation = data.regime === 'us-osha' ? US : EU
    const findings: Finding[] = []
    const violate = (clause: string, message: string, code: GhsPictogramCode) =>
      findings.push(
        finding(ghsPictogramPrecedenceRule, {
          code: GHS_PICTOGRAM_PRECEDENCE_VIOLATED,
          severity: 'violation',
          message: `${message} (${clause})`,
          ...(elementOf(code) === undefined ? {} : { elementId: elementOf(code)! }),
          citation,
        }),
      )

    const why07 = hazardsRequiring(hazards, 'GHS07')

    // Skull and crossbones over the exclamation mark.
    if (has('GHS06') && has('GHS07')) {
      if (data.regime === 'us-osha') {
        // OSHA narrows this to the exclamation mark used for acute toxicity.
        if (why07.some((entry) => isAcuteToxicity(entry.description))) {
          violate(
            'C.2.1.2',
            'The skull and crossbones pictogram is present, so the exclamation mark may not ' +
              'appear where it is used for acute toxicity.',
            'GHS07',
          )
        }
      } else {
        violate(
          'Article 26(1)(b)',
          'The GHS06 pictogram applies, so GHS07 may not appear on the label.',
          'GHS07',
        )
      }
    }

    // Corrosion over the exclamation mark, for skin or eye irritation only.
    if (has('GHS05') && why07.some((entry) => isSkinOrEyeIrritation(entry.description))) {
      violate(
        data.regime === 'us-osha' ? 'C.2.1.3' : 'Article 26(1)(c)',
        'The corrosion pictogram applies, so the exclamation mark may not appear for skin or ' +
          'eye irritation.',
        'GHS07',
      )
    }

    // Health hazard for respiratory sensitisation, over the exclamation mark
    // used for skin sensitisation or skin and eye irritation.
    const why08 = hazardsRequiring(hazards, 'GHS08')
    if (
      has('GHS08') &&
      why08.some((entry) => isRespiratorySensitisation(entry.description)) &&
      why07.some(
        (entry) =>
          isSkinSensitisation(entry.description) || isSkinOrEyeIrritation(entry.description),
      )
    ) {
      violate(
        data.regime === 'us-osha' ? 'C.2.1.4' : 'Article 26(1)(d)',
        'The health hazard pictogram applies for respiratory sensitisation, so the exclamation ' +
          'mark may not appear for skin sensitisation or skin and eye irritation.',
        'GHS07',
      )
    }

    // The two CLP clauses that make a pictogram optional rather than forbidden.
    // OSHA has no equivalent, so they are not raised under it.
    if (data.regime === 'eu-clp') {
      if (has('GHS01') && (has('GHS02') || has('GHS03'))) {
        findings.push(
          finding(ghsPictogramPrecedenceRule, {
            code: GHS_PICTOGRAM_PRECEDENCE_OPTIONAL,
            // Guidance, not a violation: the regulation says "shall be optional".
            severity: 'guidance',
            message:
              'GHS01 applies, so GHS02 and GHS03 are optional and may be omitted ' +
              '(Article 26(1)(a)).',
            citation: EU,
          }),
        )
      }
      if ((has('GHS02') || has('GHS06')) && has('GHS04')) {
        findings.push(
          finding(ghsPictogramPrecedenceRule, {
            code: GHS_PICTOGRAM_PRECEDENCE_OPTIONAL,
            severity: 'guidance',
            message: 'GHS02 or GHS06 applies, so GHS04 is optional (Article 26(1)(e)).',
            citation: EU,
          }),
        )
      }
    }

    if (!findings.some((f) => f.code === GHS_PICTOGRAM_PRECEDENCE_VIOLATED)) {
      findings.push(
        passed(
          ghsPictogramPrecedenceRule,
          GHS_PICTOGRAM_PRECEDENCE_MET,
          'The pictogram set is consistent with the precedence rules for this regime.',
          undefined,
          citation,
        ),
      )
    }

    return findings
  },
}
