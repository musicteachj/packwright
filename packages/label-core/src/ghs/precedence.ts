/**
 * Article 26 and its OSHA counterpart, in one place.
 *
 * **Why this is not inside the rule.** Two things need to know the precedence
 * rules: the rule that reports a label breaking them, and the derivation that
 * builds a compliant pictogram set in the first place. Implementing them twice
 * is how a form comes to produce a set that its own rule then flags — which is
 * exactly what happened before this module existed. The derivation returned the
 * corrosion pictogram alongside the exclamation mark and the rule immediately
 * called it a violation, so the editor's own default output was non-compliant.
 *
 * One implementation, two consumers, and they cannot drift apart.
 *
 * **Sources.** CLP Article 26(1), read from the consolidated text
 * `02008R1272 — EN — 01.09.2025 — 029.003`. 29 CFR 1910.1200 Appendix C.2.1,
 * read from the eCFR on 2026-09-12. The two differ in ways that matter: OSHA has
 * four clauses to CLP's five, its skull-and-crossbones rule is narrowed to the
 * exclamation mark "used for acute toxicity", and it has no equivalent of the
 * two CLP clauses that make a pictogram optional rather than forbidden.
 */

import { hazardsRequiring } from './classification'
import type { GhsPictogramCode } from './pictograms'
import type { GhsRegime } from './statements'

/**
 * Annex V places respiratory and skin sensitisation in the same section (3.4),
 * so the section alone cannot tell them apart and the description must. Each
 * pattern matches wording taken verbatim from the annex.
 */
const isSkinOrEyeIrritation = (description: string) =>
  /skin irritation|eye irritation/i.test(description)
const isSkinSensitisation = (description: string) => /skin sensitisation/i.test(description)
const isRespiratorySensitisation = (description: string) =>
  /respiratory sensitisation/i.test(description)
const isAcuteToxicity = (description: string) => /acute toxicity/i.test(description)

export interface PrecedenceSuppression {
  /** The pictogram the clause removes, or permits removing. */
  code: GhsPictogramCode
  /**
   * `mandatory` where the text says a pictogram "shall not appear";
   * `optional` where it says its use "shall be optional". Collapsing the two
   * would misstate the regulation in the stricter direction.
   */
  kind: 'mandatory' | 'optional'
  /** The clause, e.g. `Article 26(1)(c)` or `C.2.1.3`. */
  clause: string
  /** One sentence stating what the clause requires. */
  reason: string
}

/**
 * Which clauses apply to a drawn pictogram set, given why each is present.
 *
 * Returns nothing when there is no classification: every conditional clause is
 * unanswerable without knowing what put a pictogram on the label, and guessing
 * would report violations on conformant labels.
 */
export function precedenceSuppressions(
  pictograms: readonly GhsPictogramCode[],
  hazardIds: readonly string[],
  regime: GhsRegime,
): readonly PrecedenceSuppression[] {
  if (hazardIds.length === 0) return []

  const present = new Set(pictograms)
  const has = (code: GhsPictogramCode) => present.has(code)
  const why07 = hazardsRequiring(hazardIds, 'GHS07')
  const why08 = hazardsRequiring(hazardIds, 'GHS08')
  const isUs = regime === 'us-osha'
  const out: PrecedenceSuppression[] = []

  // Skull and crossbones over the exclamation mark.
  if (has('GHS06') && has('GHS07')) {
    if (isUs) {
      if (why07.some((entry) => isAcuteToxicity(entry.description))) {
        out.push({
          code: 'GHS07',
          kind: 'mandatory',
          clause: 'C.2.1.2',
          reason:
            'The skull and crossbones pictogram is present, so the exclamation mark may not ' +
            'appear where it is used for acute toxicity.',
        })
      }
    } else {
      out.push({
        code: 'GHS07',
        kind: 'mandatory',
        clause: 'Article 26(1)(b)',
        reason: 'The GHS06 pictogram applies, so GHS07 may not appear on the label.',
      })
    }
  }

  // Corrosion over the exclamation mark, for skin or eye irritation only.
  //
  // `has('GHS07')` is load-bearing and was missing when this logic lived inside
  // the rule: without it the clause fired whenever a *classification* would have
  // required the exclamation mark, even on a label that correctly left it off —
  // telling a user the exclamation mark may not appear on a label where it does
  // not appear.
  if (
    has('GHS05') &&
    has('GHS07') &&
    why07.some((entry) => isSkinOrEyeIrritation(entry.description))
  ) {
    out.push({
      code: 'GHS07',
      kind: 'mandatory',
      clause: isUs ? 'C.2.1.3' : 'Article 26(1)(c)',
      reason:
        'The corrosion pictogram applies, so the exclamation mark may not appear for skin or ' +
        'eye irritation.',
    })
  }

  // Health hazard for respiratory sensitisation, over the exclamation mark used
  // for skin sensitisation or skin and eye irritation.
  if (
    has('GHS08') &&
    has('GHS07') &&
    why08.some((entry) => isRespiratorySensitisation(entry.description)) &&
    why07.some(
      (entry) => isSkinSensitisation(entry.description) || isSkinOrEyeIrritation(entry.description),
    )
  ) {
    out.push({
      code: 'GHS07',
      kind: 'mandatory',
      clause: isUs ? 'C.2.1.4' : 'Article 26(1)(d)',
      reason:
        'The health hazard pictogram applies for respiratory sensitisation, so the exclamation ' +
        'mark may not appear for skin sensitisation or skin and eye irritation.',
    })
  }

  // The two CLP clauses with no OSHA equivalent, which permit rather than forbid.
  if (!isUs) {
    if (has('GHS01') && (has('GHS02') || has('GHS03'))) {
      for (const code of ['GHS02', 'GHS03'] as const) {
        if (has(code)) {
          out.push({
            code,
            kind: 'optional',
            clause: 'Article 26(1)(a)',
            reason: `GHS01 applies, so ${code} is optional and may be omitted.`,
          })
        }
      }
    }
    if ((has('GHS02') || has('GHS06')) && has('GHS04')) {
      out.push({
        code: 'GHS04',
        kind: 'optional',
        clause: 'Article 26(1)(e)',
        reason: 'GHS02 or GHS06 applies, so GHS04 is optional.',
      })
    }
  }

  return out
}

/**
 * The set after the clauses that *forbid* a pictogram are applied.
 *
 * Optional suppressions are left in place deliberately. "Shall be optional"
 * means a supplier may omit the pictogram, not that they must, and a tool that
 * silently removed it would be making a labelling decision on their behalf —
 * and hiding a hazard symbol while doing it. The rule surfaces those as guidance
 * so the choice stays with the person who is accountable for the label.
 */
export function applyPrecedence(
  pictograms: readonly GhsPictogramCode[],
  hazardIds: readonly string[],
  regime: GhsRegime,
): readonly GhsPictogramCode[] {
  const forbidden = new Set(
    precedenceSuppressions(pictograms, hazardIds, regime)
      .filter((suppression) => suppression.kind === 'mandatory')
      .map((suppression) => suppression.code),
  )
  return pictograms.filter((code) => !forbidden.has(code))
}
