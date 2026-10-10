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
import { SymbolLayoutError, type BarcodeEncoder } from '../symbology/layOutSymbol'
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

/**
 * A judged label, in the order and the words the editor shows.
 *
 * Read-only throughout: the editor, the audit screen and the server hand these
 * arrays out by reference, and a caller sorting one in place would reorder it under
 * every other view.
 */
export interface Judgement {
  readonly outcome: 'judged'
  /** What was drawn, which every finding and omission is about. */
  readonly layout: ResolvedLayout
  /** Every finding, in registry order. */
  readonly findings: readonly Finding[]
  /** Checks that did not run, and what each would need. */
  readonly declined: readonly DeclinedCheck[]
  /** The findings grouped by severity, most severe first and passes last. */
  readonly groups: ReadonlyArray<readonly [Severity, readonly Finding[]]>
  readonly failures: readonly Finding[]
  readonly passes: readonly Finding[]
  /** Whether any finding is blocking — the label is non-compliant as drawn. */
  readonly blocking: boolean
  /** What the engine could not draw or no rule can judge, element by element. */
  readonly uncheckable: readonly Uncheckable[]
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
 * Lays a label out — the one dispatch from label type to engine.
 *
 * The editor, the judge and the experiment harness each kept their own switch from
 * label type to layout function before this; a fourth label type, or a new layout
 * input, would have had to be added three times, and a miss would have had the
 * editor and the server judging different drawings of one document. Throws what
 * the engines throw: `LayoutError` for a document that describes no drawing,
 * `SymbolLayoutError` for a symbol the encoder could not produce.
 */
export function layOutLabel(request: JudgeRequest): ResolvedLayout {
  switch (request.labelType) {
    case 'gs1-retail':
      return layOutUpcALabel(request.barcode, { data: request.data, stock: request.stock })
    case 'ghs-chemical':
      return layOutGhsLabel({ data: request.data, stock: request.stock })
    case 'us-food':
      return layOutUsFoodLabel({ data: request.data, stock: request.stock })
  }
}

/** The rules' view of a request and its layout — the request without its encoder. */
function contextOf(request: JudgeRequest, layout: ResolvedLayout): RuleContext {
  switch (request.labelType) {
    case 'gs1-retail':
      return { labelType: 'gs1-retail', data: request.data, stock: request.stock, layout }
    case 'ghs-chemical':
      return { labelType: 'ghs-chemical', data: request.data, stock: request.stock, layout }
    case 'us-food':
      return { labelType: 'us-food', data: request.data, stock: request.stock, layout }
  }
}

/**
 * Lays a label out and judges it, or says why it cannot.
 *
 * **What it refuses, and what it expects already done.** It refuses what its own
 * type cannot rule out once a request has crossed a boundary untyped: a label type
 * it does not know, and a UPC-A request without a usable encoder — a label judged
 * with no symbol drawn could pass the barcode rules on a barcode never printed. It
 * refuses a document the engines decline to draw, with their own sentence. It does
 * **not** re-validate the document's shape: a request from outside is checked
 * against the label schema first (stage 17 of `docs/plans/2026-10-10-mcp.md`), and
 * a document missing its `data` or `stock` is that check's to refuse.
 *
 * **It trusts the encoder it is handed.** The server attaches bwip-js itself; a
 * request from JSON cannot carry a function. A caller that passed a stand-in — the
 * editor's placeholder draws one span and no bars — would get a judgement of that
 * stand-in's drawing, which is why the editor judges only once the real encoder has
 * loaded and never hands its placeholder here.
 */
export function judgeLabel(request: JudgeRequest): LabelJudgement {
  if (!(LABEL_TYPES as readonly string[]).includes(request.labelType)) {
    return {
      outcome: 'refused',
      reason:
        `There is no label type "${String(request.labelType)}". ` +
        `The types are ${LABEL_TYPES.join(', ')}.`,
    }
  }
  if (
    request.labelType === 'gs1-retail' &&
    // Not just undefined: parsed JSON can carry null, or an object with no
    // `render`, and either would crash inside the engine rather than refuse.
    typeof (request.barcode as Partial<BarcodeEncoder> | null | undefined)?.render !== 'function'
  ) {
    return {
      outcome: 'refused',
      reason:
        'A UPC-A label cannot be judged without a barcode encoder: its symbol would not be ' +
        'drawn, and the barcode checks would have nothing printed to measure.',
    }
  }
  let layout: ResolvedLayout
  try {
    layout = layOutLabel(request)
  } catch (error) {
    // A document that describes no drawing — a stock with no panel, a capacity of
    // zero — or a symbol the encoder could not produce is a refusal with the
    // engine's own sentence, not a crash. The two are separate classes.
    if (error instanceof LayoutError || error instanceof SymbolLayoutError) {
      return { outcome: 'refused', reason: error.message }
    }
    throw error
  }
  return judgeLayout(contextOf(request, layout))
}
