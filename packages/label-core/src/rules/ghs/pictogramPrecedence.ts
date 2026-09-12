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

import { precedenceSuppressions } from '../../ghs/precedence'
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
    // Without a classification there is no "why", and every conditional clause
    // is unanswerable. Declining is not a pass.
    if (hazards.length === 0) return []

    const drawn = layout.pictograms.map((p) => p.code as GhsPictogramCode)
    const elementOf = (code: GhsPictogramCode) =>
      layout.pictograms.find((p) => p.code === code)?.elementId

    const citation = data.regime === 'us-osha' ? US : EU
    // The same function the derivation uses, so a set the form produced cannot
    // be one this rule rejects.
    const suppressions = precedenceSuppressions(drawn, hazards, data.regime)
    const findings: Finding[] = []

    for (const suppression of suppressions) {
      const elementId = elementOf(suppression.code)
      findings.push(
        finding(ghsPictogramPrecedenceRule, {
          code:
            suppression.kind === 'mandatory'
              ? GHS_PICTOGRAM_PRECEDENCE_VIOLATED
              : GHS_PICTOGRAM_PRECEDENCE_OPTIONAL,
          // "Shall be optional" is not "shall not appear". Reporting the second
          // as a violation would misstate the regulation in the stricter
          // direction, which is no more correct than missing it.
          severity: suppression.kind === 'mandatory' ? 'violation' : 'guidance',
          message: `${suppression.reason} (${suppression.clause})`,
          ...(elementId === undefined ? {} : { elementId }),
          citation,
        }),
      )
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
