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
 * `02008R1272 — EN — 01.09.2025 — 029.003`, and re-read on 2026-10-10 from the
 * 2026-07-01 consolidation (02008R1272-20260701, EU Publications Office), unchanged.
 * 29 CFR 1910.1200 Appendix C.2.1, read from the eCFR on 2026-09-12 and re-read on
 * 2026-10-10 (the 2026-10-01 version), unchanged. The 2026-10-10 reading is what
 * the "every use barred" logic below rests on: (c) and (d) bar the exclamation mark
 * "for" the hazards they name, and C.2.1.2 to C.2.1.4 "where it is used for" them.
 * The two differ in ways that matter: OSHA has
 * four clauses to CLP's five, its skull-and-crossbones rule is narrowed to the
 * exclamation mark "used for acute toxicity", and it has no equivalent of the
 * two CLP clauses that make a pictogram optional rather than forbidden.
 *
 * **Why each pictogram is present is read from CLP's table on a US label too,** and
 * that is sound for the four classes OSHA's clauses turn on. Read from the eCFR on
 * 2026-10-09, Figure C.1 as the image the eCFR serves for it (Federal Register
 * `ER08JA26.012`), since it is published as no text; C.2.3.2 incorporates it ("depicted
 * in Figure C.1"). It assigns the exclamation mark to "Irritant", "Dermal Sensitizer"
 * and "Acute Toxicity(harmful)", the skull and crossbones to "Acute Toxicity
 * (severe)", the health hazard to "Respiratory Sensitizer" and corrosion to
 * "Corrosives"; and C.4.1
 * gives oral acute toxicity categories 1 to 3 the skull and category 4 the exclamation
 * mark. CLP Annex V makes the same assignments. The wider class-to-pictogram mapping
 * is not verified against C.4, which is why `ghs/pictogram-set` stands down on US
 * labels.
 */

import { hazardsRequiring, requiredPictograms } from './classification'
import { isPictogramRecognised, type GhsPictogramCode } from './pictograms'
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

  // **The exclamation mark goes only when every reason for it is barred.**
  // Article 26(1)(c) and (d) remove GHS07 "for" the hazards they name, and C.2.1.2
  // to C.2.1.4 "where it is used for" them — both read from the primary texts on
  // 2026-10-10. Only 26(1)(b), the skull and crossbones, removes it outright.
  //
  // So the question is asked of the reasons, not of each clause alone. Asked per
  // clause with `some`, a label needing GHS07 for acute toxicity 4 as well as skin
  // irritation lost it beside corrosion: the derivation left it out and a label
  // missing it drew no finding. Asked per clause with `every`, an OSHA label
  // needing it for acute toxicity *and* irritation, beside both the skull and
  // crossbones and corrosion, kept it — though C.2.1.2 bars the one use and C.2.1.3
  // the other. It goes when each reason is barred by some clause that applies, and
  // each such clause is reported with its own reason.
  //
  // `has('GHS07')` is load-bearing and was missing when this logic lived inside
  // the rule: without it a clause fired whenever a *classification* would have
  // required the exclamation mark, even on a label that correctly left it off.
  const respiratory = why08.some((entry) => isRespiratorySensitisation(entry.description))
  const sensitisationOrIrritation = (description: string) =>
    isSkinSensitisation(description) || isSkinOrEyeIrritation(description)
  const ghs07Clauses: Array<{
    applies: boolean
    /** Which uses of GHS07 the clause bars. */
    bars: (description: string) => boolean
    /** True for 26(1)(b) alone, which bars GHS07 whatever its use — and so speaks even with none. */
    outright: boolean
    clause: string
    reason: string
  }> = [
    isUs
      ? {
          applies: has('GHS06'),
          bars: isAcuteToxicity,
          outright: false,
          clause: 'C.2.1.2',
          reason:
            'The skull and crossbones pictogram is present, so the exclamation mark may not ' +
            'appear where it is used for acute toxicity.',
        }
      : {
          applies: has('GHS06'),
          bars: () => true,
          outright: true,
          clause: 'Article 26(1)(b)',
          reason: 'The GHS06 pictogram applies, so GHS07 may not appear on the label.',
        },
    {
      applies: has('GHS05'),
      bars: isSkinOrEyeIrritation,
      outright: false,
      clause: isUs ? 'C.2.1.3' : 'Article 26(1)(c)',
      reason:
        'The corrosion pictogram applies, so the exclamation mark may not appear for skin or ' +
        'eye irritation.',
    },
    {
      applies: has('GHS08') && respiratory,
      bars: sensitisationOrIrritation,
      outright: false,
      clause: isUs ? 'C.2.1.4' : 'Article 26(1)(d)',
      reason:
        'The health hazard pictogram applies for respiratory sensitisation, so the exclamation ' +
        'mark may not appear for skin sensitisation or skin and eye irritation.',
    },
  ]
  if (has('GHS07')) {
    const applicable = ghs07Clauses.filter((clause) => clause.applies)
    const barredBy = (description: string) =>
      applicable.filter((clause) => clause.bars(description))
    const everyUseBarred = why07.every((entry) => barredBy(entry.description).length > 0)
    if (everyUseBarred) {
      for (const clause of applicable) {
        // A clause is reported where it bars a use the label has, or bars every use.
        // With no reason for GHS07 at all, only 26(1)(b) can speak — the others
        // would name a use the label does not have.
        const speaks = clause.outright || why07.some((entry) => clause.bars(entry.description))
        if (speaks) {
          out.push({
            code: 'GHS07',
            kind: 'mandatory',
            clause: clause.clause,
            reason: clause.reason,
          })
        }
      }
    }
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

/**
 * The pictograms a classification puts on a label under a regime: what Annex V
 * requires, reduced by the regime's precedence, **keeping only the symbols the
 * regime recognises**.
 *
 * The last step is the US one. 29 CFR 1910.1200 Appendix C.2.3.2, read from the
 * eCFR on 2026-10-09: "One of eight standard hazard symbols shall be used in each
 * pictogram" — and the environment symbol, GHS09, is not among the eight. The
 * classification list is CLP's, so a US label could declare an aquatic hazard
 * and the engine drew GHS09 for it, which `ghs/pictogram-integrity` then reported
 * as not recognised: the tool's own drawing, blamed on the label.
 *
 * One function for the engine, the editor's preview and `ghs/pictogram-set`, so
 * what is drawn, what is shown and what is judged cannot disagree.
 */
export function derivedPictograms(
  hazardIds: readonly string[],
  regime: GhsRegime,
): readonly GhsPictogramCode[] {
  return applyPrecedence(requiredPictograms(hazardIds), hazardIds, regime).filter((code) =>
    isPictogramRecognised(regime, code),
  )
}
