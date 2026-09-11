/**
 * What a compliance rule is.
 *
 * A rule is a pure function from a resolved label to a list of findings, and it
 * is the only place in this system permitted to say that something is
 * non-compliant. Nothing else — not the layout engine, not the API, and above
 * all not a language model — authors a verdict or a citation. That restriction
 * is the product: a user has no way to tell a real CFR reference from an
 * invented one, so every reference here traces to a source document that was
 * read.
 *
 * Rules run against the **resolved layout**, not against the label document that
 * asked for it. A symbol is judged at the size and position it was actually
 * drawn, so a rule and the printed artefact cannot drift apart. Where a property
 * is inherently data rather than geometry — a check digit is a fact about a
 * number, not about ink — the rule reads the document, and says so.
 */

import type { ResolvedLayout } from '../layout/types'
import type { LabelStock, UpcALabelData } from '../templates/upcA'
import type { Citation, Finding, Severity } from '../types/index'

export interface RuleContext {
  /** The label as specified. */
  data: UpcALabelData
  stock: LabelStock
  /** The label as drawn. Most rules measure this one. */
  layout: ResolvedLayout
}

export interface Rule {
  /** Stable identifier for the rule itself, e.g. `gs1/quiet-zone`. */
  id: string
  /** One sentence stating what the rule requires, for the rule catalogue. */
  title: string
  /**
   * The provision this rule enforces. Findings inherit it, so a finding cannot
   * carry a citation that belongs to a different rule.
   */
  citation: Citation
  /** Every code this rule can emit. The catalogue is generated from these. */
  codes: readonly string[]
  /**
   * Returns one finding per thing the rule had something to say about.
   *
   * An **empty array means the rule did not apply** — there was no symbol to
   * measure because the GTIN could not be encoded, or no Digital Link was
   * configured, or the symbology has no quiet-zone figure verified against a
   * source. That is deliberately distinct from a `pass`: a rule that could not
   * run has not cleared anything, and reporting it as a pass would be the exact
   * false reassurance this project exists to avoid.
   */
  check(context: RuleContext): Finding[]
}

/**
 * Most-severe first, matching the ANSI Z535.4 signal-word scale the findings
 * rail is grouped by. `pass` sorts last so the checks that cleared collapse to
 * the bottom.
 */
export const SEVERITY_ORDER: readonly Severity[] = [
  'blocking',
  'violation',
  'advisory',
  'guidance',
  'pass',
]

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b)
}
