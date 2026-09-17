/**
 * Which paragraph of 21 CFR 101.9(e) governs a dual-column panel's columns, by what the
 * second column counts.
 *
 * Source: 21 CFR 101.9(e), read from the eCFR on 2026-09-17. Three subparagraphs set the
 * columns out, and each names the dual labeling it reaches:
 *
 * - **(e)(2)**: the quantitative information by weight and the (d)(7)(ii) information
 *   "shall be presented for the form of the product as packaged and for any other form of
 *   the product (e.g., 'as prepared' or combined with another ingredient ...)" — forms and
 *   combinations.
 * - **(e)(3)**: "When the dual labeling is presented for two or more forms of the same food,
 *   for combinations of food, for different units, or for two or more groups for which RDIs
 *   are established, the quantitative information by weight and the percent Daily Value
 *   shall be presented in two columns and the columns shall be separated by vertical lines."
 *   Popcorn's cup popped is one of (e)'s "different units ... as provided for in paragraph
 *   (b)".
 * - **(e)(6)**: "When dual labeling is presented for a food on a per serving basis and per
 *   container basis as required in paragraph (b)(12)(i) ... or on a per serving basis and
 *   per unit basis as required in paragraph (b)(2)(i)(D) ... the quantitative information by
 *   weight as required in paragraph (d)(7)(i) and the percent Daily Value as required in
 *   paragraph (d)(7)(ii) shall be presented in two columns, and the columns shall be
 *   separated by vertical lines."
 *
 * **Two questions, two tables.** What each column must carry is (e)(2) for forms and
 * combinations, where it is said most directly, (e)(3) for units and groups, and (e)(6) for
 * the per-container and per-unit columns. The vertical lines are (e)(3) for everything but
 * those two, and (e)(6) for them. Every finding here once cited (e)(2) or (e)(3) whatever the
 * column counted, which was wrong for the one column the engine most often draws: per
 * container, mandatory under (b)(12)(i). The review of PR #39 found it.
 */

import type { DualColumnBasis } from '../../fda/nutritionFormats'

/** The three subparagraphs, by the dual labeling each reaches. */
export const DUAL_COLUMN_REFERENCES = {
  forms: '21 CFR 101.9(e)(2)',
  unitsAndGroups: '21 CFR 101.9(e)(3)',
  servingAndContainer: '21 CFR 101.9(e)(6)',
} as const

/** One of the three, so a rule's table of titles has to cover all of them. */
export type DualColumnReference =
  (typeof DUAL_COLUMN_REFERENCES)[keyof typeof DUAL_COLUMN_REFERENCES]

/**
 * References rather than citations, because the title belongs to the rule.
 *
 * Merging two rules' tables into one set of `Citation` objects gave
 * `us-food/protein-percent` titles about columns "separated by vertical lines", which it
 * does not check — and a title is what the `/rules` catalogue and the findings rail show.
 * The review of PR #40 found it. Each rule writes its own titles over these references.
 */
const EACH_COLUMN: Record<DualColumnBasis, DualColumnReference> = {
  'as-prepared': DUAL_COLUMN_REFERENCES.forms,
  combination: DUAL_COLUMN_REFERENCES.forms,
  'per-unit-measure': DUAL_COLUMN_REFERENCES.unitsAndGroups,
  'rdi-groups': DUAL_COLUMN_REFERENCES.unitsAndGroups,
  'per-cup-popped': DUAL_COLUMN_REFERENCES.unitsAndGroups,
  'per-container': DUAL_COLUMN_REFERENCES.servingAndContainer,
  'per-unit': DUAL_COLUMN_REFERENCES.servingAndContainer,
}

const SEPARATED: Record<DualColumnBasis, DualColumnReference> = {
  'as-prepared': DUAL_COLUMN_REFERENCES.unitsAndGroups,
  combination: DUAL_COLUMN_REFERENCES.unitsAndGroups,
  'per-unit-measure': DUAL_COLUMN_REFERENCES.unitsAndGroups,
  'rdi-groups': DUAL_COLUMN_REFERENCES.unitsAndGroups,
  'per-cup-popped': DUAL_COLUMN_REFERENCES.unitsAndGroups,
  'per-container': DUAL_COLUMN_REFERENCES.servingAndContainer,
  'per-unit': DUAL_COLUMN_REFERENCES.servingAndContainer,
}

/** The paragraph that requires both columns to carry the information. */
export function eachColumnReference(basis: DualColumnBasis): DualColumnReference {
  return EACH_COLUMN[basis]
}

/** The paragraph that requires the two columns to be separated by vertical lines. */
export function separatedColumnsReference(basis: DualColumnBasis): DualColumnReference {
  return SEPARATED[basis]
}
