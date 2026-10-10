/**
 * What the engine says about a label rebuilt from a photograph.
 *
 * **Every finding here comes from `rules/`.** Nothing on this path authors a
 * verdict, a citation or a severity; this module lays the confirmed document out
 * and hands it to `runRules`, which is the same call the editor makes. That is
 * the boundary the whole phase exists to hold — the model reads, the engine
 * judges — and the way to keep it is for there to be no second source of
 * findings, not for there to be a rule about it.
 *
 * Out of the view for the reason `readingRows.ts` is: this is the part with
 * decisions in it, and a decision inside a template is a decision nothing tests.
 *
 * The one thing it adds to what the editor computes is `unconfirmed`, and that
 * is the honest half of the report. A rule that cleared because its field was
 * never confirmed has not cleared — decline to confirm the signal words and
 * `ghs/signal-word-precedence` passes, because there is nothing left to
 * conflict. That is a false clearance produced by the interface rather than by a
 * rule, which is the shape this project keeps finding, so the report names every
 * field that was read and not confirmed and says what it means.
 */

import {
  judgeLabel,
  type DeclinedCheck,
  type Finding,
  type GhsLabelData,
  type LabelStock,
  type ResolvedLayout,
  type Severity,
  type Uncheckable,
} from '@packwright/label-core'
import { FIELD_SHAPES, type ReadingKey } from './readingRows'

export interface AuditReport {
  readonly outcome: 'reported'
  readonly layout: ResolvedLayout
  readonly findings: readonly Finding[]
  readonly groups: ReadonlyArray<readonly [Severity, readonly Finding[]]>
  readonly failures: readonly Finding[]
  readonly passes: readonly Finding[]
  /**
   * What the engine could not draw, and why.
   *
   * Assembled by `uncheckableIn`, the builder the editor uses. This file used to
   * keep its own copy without the half that reads `layout.symbols` for
   * overprinting, deliberately: an audit layout is GHS and has no symbols, so
   * that half could not run here. One builder now serves both, and on an audit
   * layout the symbol half finds nothing — it is shared, not newly needed.
   */
  readonly uncertifiable: ReadonlyArray<Uncheckable>
  /** Checks that stood down for want of a fact the reading never produced. */
  readonly declined: readonly DeclinedCheck[]
  /** Fields read off the photograph that nobody confirmed. */
  readonly unconfirmed: readonly string[]
}

export interface AuditRefusal {
  readonly outcome: 'refused'
  readonly reason: string
}

export function auditReport(
  data: GhsLabelData,
  stock: LabelStock,
  read: ReadonlySet<ReadingKey>,
  confirmed: ReadonlySet<ReadingKey>,
): AuditReport | AuditRefusal {
  // The judge the editor and the MCP server share, so an audited label is told
  // exactly what the editor would tell the same document.
  const judged = judgeLabel({ labelType: 'ghs-chemical', data, stock })
  // The engine declines input that describes no drawing at all — a capacity of
  // zero, a stock with no area. That is a refusal with a reason, not a crash,
  // and the reason is already written as a sentence for a reader.
  if (judged.outcome === 'refused') return judged

  return {
    outcome: 'reported',
    layout: judged.layout,
    findings: judged.findings,
    groups: judged.groups,
    failures: judged.failures,
    passes: judged.passes,
    uncertifiable: judged.uncheckable,
    // The audit path is where this matters most. A photograph yields H-codes and
    // pictograms, never a hazard classification, so the two rules that read one
    // stand down on almost every reading — and until now they did it in silence,
    // beside a report that looked complete.
    declined: judged.declined,
    unconfirmed: [...read]
      .filter((key) => !confirmed.has(key))
      .map((key) => FIELD_SHAPES[key].label),
  }
}
