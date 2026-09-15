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
  compareSeverity,
  layOutGhsLabel,
  LayoutError,
  runRules,
  type Finding,
  type GhsLabelData,
  type LabelStock,
  type ResolvedLayout,
  type Severity,
} from '@packwright/label-core'
import { FIELD_SHAPES, type ReadingKey } from './readingRows'

export interface AuditReport {
  readonly outcome: 'reported'
  readonly layout: ResolvedLayout
  readonly findings: readonly Finding[]
  readonly groups: ReadonlyArray<[Severity, Finding[]]>
  readonly failures: Finding[]
  readonly passes: Finding[]
  /**
   * What the engine could not draw, and why.
   *
   * The layout's own omissions and nothing else. The editor's version also reads
   * `layout.symbols` for overprinting and vertical overflow; a GHS layout
   * returns `symbols: []`, so restating that half here would be code that cannot
   * run — which is the thing this codebase keeps finding in its own validators.
   */
  readonly uncertifiable: ReadonlyArray<{ elementId: string; reasons: string[] }>
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
  let layout: ResolvedLayout
  try {
    layout = layOutGhsLabel({ data, stock })
  } catch (error) {
    // The engine declines input that describes no drawing at all — a capacity of
    // zero, a stock with no area. That is a refusal with a reason, not a crash,
    // and the reason is already written as a sentence for a reader.
    if (error instanceof LayoutError) return { outcome: 'refused', reason: error.message }
    throw error
  }

  const findings = runRules({ labelType: 'ghs-chemical', data, stock, layout })

  const groups = new Map<Severity, Finding[]>()
  for (const finding of findings) {
    const group = groups.get(finding.severity)
    if (group) group.push(finding)
    else groups.set(finding.severity, [finding])
  }

  const byElement = new Map<string, string[]>()
  for (const omission of layout.omissions) {
    const existing = byElement.get(omission.elementId)
    // Passed through rather than restated: the omission type exists so nothing
    // is ever dropped silently, and its reasons are already sentences.
    if (existing === undefined) byElement.set(omission.elementId, [omission.reason])
    else existing.push(omission.reason)
  }

  return {
    outcome: 'reported',
    layout,
    findings,
    groups: [...groups.entries()].sort(([a], [b]) => compareSeverity(a, b)),
    failures: findings.filter((finding) => finding.severity !== 'pass'),
    passes: findings.filter((finding) => finding.severity === 'pass'),
    uncertifiable: [...byElement.entries()].map(([elementId, reasons]) => ({ elementId, reasons })),
    unconfirmed: [...read]
      .filter((key) => !confirmed.has(key))
      .map((key) => FIELD_SHAPES[key].label),
  }
}
