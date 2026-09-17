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
 *
 * **(e)(6) carries a predicate and the table has to honour it**, which the review of PR #40
 * found. Read its opening again: "as required in paragraph (b)(12)(i) ... or ... as required
 * in paragraph (b)(2)(i)(D)". A per-container column on a package *outside* the 200–300%
 * band, or one those provisions excuse, is not a column (e)(6) reaches, and citing it there
 * pointed a user at a paragraph whose condition their label does not meet. So the lookups
 * take the bases actually required and return `undefined` where (e)(6) does not reach —
 * leaving each rule to fall back to the citation it declares.
 *
 * **Nothing here names the paragraph a voluntary column answers to, because (e) has none.**
 * (e)'s opening permits dual labeling for four things — forms, combinations under (h)(4),
 * "different units ... as provided for in paragraph (b)", and RDI groups — and a per-container
 * column is none of them. The one paragraph in 101.9 that contemplates a voluntary second
 * column is **(b)(6)**, read from the eCFR on 2026-09-17: a package "more than 150 percent
 * and less than 200 percent of the applicable reference amount" *may* provide, "to the left
 * of" the per-container column, a column per common household measure approximating the
 * reference amount. That is a different column from the one a label declaring `per-container`
 * is describing — it sits on the other side and counts something else — so (b)(6) is not a
 * substitute citation here, and inventing one would be worse than a general reference. See
 * `docs/BACKLOG.md`.
 */

import type { DualColumnBasis, MandatoryDualColumnBasis } from '../../fda/nutritionFormats'

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

/**
 * (e)(6)'s own predicate, applied to a reference the tables produced.
 *
 * The other two subparagraphs describe the dual labeling they govern and stop.
 * (e)(6) instead points at the provisions that *compel* the column, so a label
 * carrying one voluntarily falls outside it however the column is drawn.
 */
function reaches(
  reference: DualColumnReference,
  basis: DualColumnBasis,
  required: readonly MandatoryDualColumnBasis[],
): boolean {
  if (reference !== DUAL_COLUMN_REFERENCES.servingAndContainer) return true
  return (basis === 'per-container' || basis === 'per-unit') && required.includes(basis)
}

/**
 * The paragraph that requires both columns to carry the information, or
 * `undefined` where no subparagraph of (e) reaches this column.
 *
 * @param required The bases this label is actually obliged to carry, from
 *   `dualColumnDutyFor`. Only (e)(6) consults it.
 */
export function eachColumnReference(
  basis: DualColumnBasis,
  required: readonly MandatoryDualColumnBasis[],
): DualColumnReference | undefined {
  const reference = EACH_COLUMN[basis]
  return reaches(reference, basis, required) ? reference : undefined
}

/**
 * The paragraph that requires the two columns to be separated by vertical lines,
 * or `undefined` where no subparagraph of (e) reaches this column.
 */
export function separatedColumnsReference(
  basis: DualColumnBasis,
  required: readonly MandatoryDualColumnBasis[],
): DualColumnReference | undefined {
  const reference = SEPARATED[basis]
  return reaches(reference, basis, required) ? reference : undefined
}
