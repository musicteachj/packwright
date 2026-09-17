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
import type { Citation } from '../../types/index'

const FORMS: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(e)(2)',
  title: 'Dual labeling presents the information for the form as packaged and for any other form',
}

const UNITS_AND_GROUPS: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(e)(3)',
  title:
    'Dual labeling for forms, combinations, units or RDI groups is set in two columns separated by vertical lines',
}

const SERVING_AND_CONTAINER: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(e)(6)',
  title:
    'Per-serving and per-container or per-unit information is set in two columns separated by vertical lines',
}

/** Every citation either table can give, for a rule's `citations`. */
export const DUAL_COLUMN_PARAGRAPHS: readonly Citation[] = [
  FORMS,
  UNITS_AND_GROUPS,
  SERVING_AND_CONTAINER,
]

const EACH_COLUMN: Record<DualColumnBasis, Citation> = {
  'as-prepared': FORMS,
  combination: FORMS,
  'per-unit-measure': UNITS_AND_GROUPS,
  'rdi-groups': UNITS_AND_GROUPS,
  'per-cup-popped': UNITS_AND_GROUPS,
  'per-container': SERVING_AND_CONTAINER,
  'per-unit': SERVING_AND_CONTAINER,
}

const SEPARATED: Record<DualColumnBasis, Citation> = {
  'as-prepared': UNITS_AND_GROUPS,
  combination: UNITS_AND_GROUPS,
  'per-unit-measure': UNITS_AND_GROUPS,
  'rdi-groups': UNITS_AND_GROUPS,
  'per-cup-popped': UNITS_AND_GROUPS,
  'per-container': SERVING_AND_CONTAINER,
  'per-unit': SERVING_AND_CONTAINER,
}

/** The paragraph that requires both columns to carry the information. */
export function eachColumnParagraph(basis: DualColumnBasis): Citation {
  return EACH_COLUMN[basis]
}

/** The paragraph that requires the two columns to be separated by vertical lines. */
export function separatedColumnsParagraph(basis: DualColumnBasis): Citation {
  return SEPARATED[basis]
}
