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
import type { GhsLabelData } from '../templates/ghs'
import type { LabelStock } from '../templates/stock'
import type { UpcALabelData } from '../templates/upcA'
import type { UsFoodLabelData } from '../templates/usFood'
import type { Citation, Finding, Severity } from '../types/index'

/**
 * The label types this engine knows about.
 *
 * Matches the discriminated union `docs/DESIGN.md` sketches for the persisted
 * `LabelDocument`, so phase 6's storage is additive rather than a refactor.
 */
export const LABEL_TYPES = ['gs1-retail', 'ghs-chemical', 'us-food'] as const
export type LabelType = (typeof LABEL_TYPES)[number]

interface RuleContextBase {
  stock: LabelStock
  /** The label as drawn. Most rules measure this one. */
  layout: ResolvedLayout
}

export interface Gs1RetailContext extends RuleContextBase {
  labelType: 'gs1-retail'
  /** The label as specified. */
  data: UpcALabelData
}

export interface GhsChemicalContext extends RuleContextBase {
  labelType: 'ghs-chemical'
  data: GhsLabelData
}

export interface UsFoodContext extends RuleContextBase {
  labelType: 'us-food'
  /**
   * Carries the `container` as well as the drawn stock. The two are different
   * geometries and both are needed: 21 CFR 101.7(i) sizes type by the area of
   * the *package's* principal display panel, while 101.7(f) places the
   * declaration within the *drawn* panel.
   */
  data: UsFoodLabelData
}

/**
 * Discriminated rather than generic, so a rule cannot be handed the wrong
 * document.
 *
 * The alternative — one context with a widened `data` — puts the narrowing at
 * every `check` and makes the dispatch a cast. This project has been bitten by
 * exactly that once already: the export route's `as never` switched off the only
 * check that the request schema and `UpcALabelData` still described the same
 * thing. `runRules` narrows on `labelType` and hands each rule set a context it
 * already matches, with no assertion anywhere.
 */
export type RuleContext = Gs1RetailContext | GhsChemicalContext | UsFoodContext

export interface Rule<TContext extends RuleContext = RuleContext> {
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
   * Which label type this rule judges.
   *
   * A GS1 quiet-zone rule run against a chemical label would measure an empty
   * `symbols` array, find nothing, and report nothing — which reads as "checked
   * and clear" to everything downstream. Rules are selected by type rather than
   * left to no-op on documents they were never written for.
   */
  appliesTo: TContext['labelType']
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
  check(context: TContext): Finding[]
}

export type Gs1RetailRule = Rule<Gs1RetailContext>
export type GhsChemicalRule = Rule<GhsChemicalContext>
export type UsFoodRule = Rule<UsFoodContext>

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
