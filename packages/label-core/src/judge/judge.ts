/**
 * The report on a label: drawn, judged, and assembled once.
 *
 * Before this module the assembly lived in the browser, twice — the editor's store
 * and the audit report each laid the label out, ran the rules, collected the
 * declined checks, built the cannot-be-checked list and grouped the findings by
 * severity. An MCP server answering the same question would have been a third
 * copy, and three copies are three chances to tell the same label two different
 * things. Every caller now asks here. `judge.test.ts` holds the report as the
 * browser built it at `fe0112f` and checks this reproduces it exactly.
 *
 * Two entry points, because the editor already holds a layout: it draws a
 * placeholder while the barcode encoder loads, and judges only once the real one
 * is drawn. `judgeLayout` judges a layout in hand; `judgeLabel` lays out first,
 * and is what a caller with only a document — the audit screen, the server — uses.
 *
 * What stays with the caller is presentation: the rail's sentences and counts,
 * the ANSI words and icons, which form field a declined check points at, and an
 * audit's list of fields nobody confirmed, which is a fact about a photograph
 * rather than about a label.
 */

import { LayoutError, layOutUpcALabel } from '../layout/engine'
import { layOutGhsLabel } from '../layout/ghsEngine'
import { layOutUsFoodLabel } from '../layout/usFoodEngine'
import type { ResolvedLayout } from '../layout/types'
import { declinedChecks, runRules } from '../rules/registry'
import { LABEL_TYPES, compareSeverity, type DeclinedCheck, type RuleContext } from '../rules/types'
import type { BarcodeEncoder } from '../symbology/layOutSymbol'
import type { GhsLabelData } from '../templates/ghs'
import type { LabelStock } from '../templates/stock'
import type { UpcALabelData } from '../templates/upcA'
import type { UsFoodLabelData } from '../templates/usFood'
import type { Finding, Severity } from '../types/index'
import { uncheckableIn, type Uncheckable } from './uncheckable'

/**
 * A label to judge.
 *
 * **A UPC-A label carries its barcode encoder**, required by the type so a caller
 * cannot forget it. `label-core` does not import bwip-js; the caller hands one in.
 */
export type JudgeRequest =
  | { labelType: 'gs1-retail'; data: UpcALabelData; stock: LabelStock; barcode: BarcodeEncoder }
  | { labelType: 'ghs-chemical'; data: GhsLabelData; stock: LabelStock }
  | { labelType: 'us-food'; data: UsFoodLabelData; stock: LabelStock }

/** A judged label, in the order and the words the editor shows. */
export interface Judgement {
  outcome: 'judged'
  /** What was drawn, which every finding and omission is about. */
  layout: ResolvedLayout
  /** Every finding, in registry order. */
  findings: Finding[]
  /** Checks that did not run, and what each would need. */
  declined: DeclinedCheck[]
  /** The findings grouped by severity, most severe first and passes last. */
  groups: [Severity, Finding[]][]
  failures: Finding[]
  passes: Finding[]
  /** Whether any finding is blocking — the label is non-compliant as drawn. */
  blocking: boolean
  /** What the engine could not draw or no rule can judge, element by element. */
  uncheckable: Uncheckable[]
}

/** A label the engine declined to draw, with its reason as a sentence for a reader. */
export interface Refusal {
  outcome: 'refused'
  reason: string
}

export type LabelJudgement = Judgement | Refusal

/** Judges a label already laid out. */
export function judgeLayout(context: RuleContext): Judgement {
  // Built once and read twice, so the findings and the declines describe one label.
  const findings = runRules(context)
  const groups = new Map<Severity, Finding[]>()
  for (const finding of findings) {
    const group = groups.get(finding.severity)
    if (group) group.push(finding)
    else groups.set(finding.severity, [finding])
  }
  return {
    outcome: 'judged',
    layout: context.layout,
    findings,
    declined: declinedChecks(context),
    groups: [...groups.entries()].sort(([a], [b]) => compareSeverity(a, b)),
    failures: findings.filter((finding) => finding.severity !== 'pass'),
    passes: findings.filter((finding) => finding.severity === 'pass'),
    blocking: findings.some((finding) => finding.severity === 'blocking'),
    uncheckable: uncheckableIn(context.layout),
  }
}

/**
 * Lays a label out and judges it, or says why it cannot.
 *
 * A UPC-A request without an encoder is refused even though the type forbids it:
 * a request can arrive untyped — from a server, parsed from JSON — and a label
 * judged with no symbol drawn could pass the barcode rules on a barcode that was
 * never printed.
 */
export function judgeLabel(request: JudgeRequest): LabelJudgement {
  let context: RuleContext
  try {
    switch (request.labelType) {
      case 'gs1-retail': {
        const { data, stock, barcode } = request
        // Not just undefined: parsed JSON can carry null, or an object with no
        // `render`, and either would crash inside the engine rather than refuse.
        if (typeof (barcode as Partial<BarcodeEncoder> | null | undefined)?.render !== 'function') {
          return {
            outcome: 'refused',
            reason:
              'A UPC-A label cannot be judged without a barcode encoder: its symbol would not be ' +
              'drawn, and the barcode checks would have nothing printed to measure.',
          }
        }
        const layout = layOutUpcALabel(barcode, { data, stock })
        context = { labelType: 'gs1-retail', data, stock, layout }
        break
      }
      case 'ghs-chemical': {
        const { data, stock } = request
        context = {
          labelType: 'ghs-chemical',
          data,
          stock,
          layout: layOutGhsLabel({ data, stock }),
        }
        break
      }
      case 'us-food': {
        const { data, stock } = request
        context = { labelType: 'us-food', data, stock, layout: layOutUsFoodLabel({ data, stock }) }
        break
      }
      default: {
        // Unreachable by the type; reachable from parsed JSON, where it would
        // otherwise reach the rules with nothing to judge.
        const unknown: never = request
        return {
          outcome: 'refused',
          reason:
            `There is no label type "${String((unknown as { labelType?: unknown }).labelType)}". ` +
            `The types are ${LABEL_TYPES.join(', ')}.`,
        }
      }
    }
  } catch (error) {
    // A document that describes no drawing — a stock with no panel, a capacity of
    // zero — is a refusal with the engine's own sentence, not a crash.
    if (error instanceof LayoutError) return { outcome: 'refused', reason: error.message }
    throw error
  }
  return judgeLayout(context)
}
