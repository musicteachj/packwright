/**
 * Known-bad US food labels, one per rule.
 *
 * Same contract as `gs1Retail.ts` and `ghs.ts`: a rule without a fixture is a
 * claim, not a check. Each entry asserts the code, the severity **and the exact
 * citation string** — which matters more here than anywhere else so far, because
 * one of these four rules is enforced under a statute rather than under 21 CFR
 * 101, and two of its three outcomes cite different paragraphs of that statute.
 *
 * **Every figure below was worked from the regulation, not from the engine.**
 * The arithmetic, once, so the fixtures can be read rather than trusted:
 *
 * - A 120 × 170 mm panel is 20,400 mm². One square inch is 25.4² = 645.16 mm²,
 *   so the panel is 31.62 in². 21 CFR 101.7(i)(3) covers "more than 25 but not
 *   more than 100" and demands 3/16 inch, which is 0.1875 × 25.4 = 4.7625 mm.
 * - That 4.7625 mm is a *letter* height, and 101.7(h)(2) says which letter.
 *   Capitals stand 0.698 em in IBM Plex Sans and the lowercase "o" 0.540, so the
 *   same requirement needs an em of 4.7625 / 0.698 = 6.823 mm set in capitals
 *   and 4.7625 / 0.540 = 8.819 mm set with any lower case.
 * - Molded rather than printed, 101.7(i)'s closing sentence adds 1/16 inch:
 *   3/16 + 1/16 = 1/4 inch = 6.35 mm, needing 6.35 / 0.698 = 9.097 mm of em.
 * - A cylinder 200 mm tall and 300 mm round has a panel of 0.4 × 200 × 300 =
 *   24,000 mm² = 37.20 in² under 101.1(b) — also the 3/16 inch band, and more
 *   than four times the 60 × 90 mm label wrapped around it.
 * - A 50 × 60 mm panel is 3,000 mm² = 4.65 in², at or under the 5 in² at which
 *   101.7(f) stops requiring the bottom-30 percent placement altogether.
 */

import type { LabelStock } from '../../templates/stock'
import type { UsFoodLabelData } from '../../templates/usFood'
import type { Severity } from '../../types/index'
import {
  FDA_NET_QUANTITY_CROWDED,
  FDA_NET_QUANTITY_METRIC_MISSING,
  FDA_NET_QUANTITY_MISSING,
  FDA_NET_QUANTITY_OUTSIDE_ZONE,
  FDA_NET_QUANTITY_TYPE_TOO_SMALL,
} from '../index'

/** 120 × 170 mm — a front panel of 31.62 in², in 101.7(i)'s 3/16 inch band. */
const CONFORMING_STOCK: LabelStock = { widthMm: 120, heightMm: 170, marginMm: 6 }

const BASE = {
  statementOfIdentity: 'Rolled oats',
  container: { shape: 'rectangular', widthMm: 120, heightMm: 170 },
  netQuantity: { inchPound: 'NET WT 12 OZ', metric: '(340 g)' },
} as const

export interface UsFoodRuleFixture {
  name: string
  /** What is wrong with this label, in one sentence. */
  defect: string
  data: UsFoodLabelData
  stock: LabelStock
  expected: {
    code: string
    severity: Severity
    /** The exact `citation.reference` the finding must carry. */
    citation: string
  }
}

export const US_FOOD_FIXTURES: readonly UsFoodRuleFixture[] = [
  {
    name: 'type sized as though the em were the letter height',
    defect:
      'The declaration is set at an em of 4.7625 mm — numerically the 3/16 inch this panel ' +
      'requires — so a rule comparing the requirement against `fontSizeMm` would pass it. Set ' +
      'with lower case, its "o" actually prints 2.57 mm, 54% of the minimum.',
    data: {
      ...BASE,
      netQuantity: { inchPound: 'Net wt 12 oz', metric: '(340 g)' },
      netQuantityFontSizeMm: 4.7625,
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NET_QUANTITY_TYPE_TOO_SMALL,
      severity: 'violation',
      citation: '21 CFR 101.7(i)',
    },
  },
  {
    name: 'type sized for the printed band on a declaration molded into the bottle',
    defect:
      'An em of 8.82 mm puts the "o" at 4.763 mm, a hair over the printed 3/16 inch this panel ' +
      'demands — and this same label passes with `markingMethod: printed`. Molded into a ' +
      'plastic surface, 101.7(i) adds a sixteenth of an inch and the requirement becomes ' +
      '6.35 mm, so nothing but the marking method separates the two verdicts.',
    data: {
      ...BASE,
      markingMethod: 'blown-embossed-or-molded',
      netQuantityFontSizeMm: 8.82,
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NET_QUANTITY_TYPE_TOO_SMALL,
      severity: 'violation',
      citation: '21 CFR 101.7(i)',
    },
  },
  {
    name: 'type sized for the label rather than for the cylinder it wraps',
    defect:
      'A 60 × 90 mm label is 8.37 in², whose band is 1/8 inch. The bottle it wraps has a ' +
      'principal display panel of 37.20 in² under 101.1(b), whose band is 3/16. Sizing type to ' +
      'the label understates the requirement by a third — the panel belongs to the package.',
    data: {
      ...BASE,
      container: { shape: 'cylindrical', heightMm: 200, circumferenceMm: 300 },
      // 3.175 / 0.540 — the em that puts the "o" at the 1/8 inch the *label*
      // area would demand, which is the mistake this fixture is made of.
      netQuantityFontSizeMm: 5.879,
    },
    stock: { widthMm: 60, heightMm: 90, marginMm: 4 },
    expected: {
      code: FDA_NET_QUANTITY_TYPE_TOO_SMALL,
      severity: 'violation',
      citation: '21 CFR 101.7(i)',
    },
  },
  {
    name: 'declaration set halfway up the panel',
    defect:
      'The bottom 30 percent of a 158 mm panel inset 6 mm begins 116.6 mm down. A centred ' +
      'declaration starts around 80 mm and is nowhere near it, while sitting far enough from ' +
      'everything else that only the placement rule should fire.',
    data: { ...BASE, netQuantityAnchor: 'centre' },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NET_QUANTITY_OUTSIDE_ZONE,
      severity: 'violation',
      citation: '21 CFR 101.7(f)',
    },
  },
  {
    name: 'declaration printed on top of the statement of identity',
    defect:
      'Anchored to the panel top, the declaration lands in the same space as the statement of ' +
      'identity — no gap either way, where 101.7(f) wants a letter height above or below and ' +
      'two "N" widths to the side.',
    data: { ...BASE, netQuantityAnchor: 'top-centre' },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NET_QUANTITY_CROWDED,
      severity: 'violation',
      citation: '21 CFR 101.7(f)',
    },
  },
  {
    name: 'no net quantity declaration at all',
    defect:
      'A panel with a statement of identity and nothing else. Every rule that measures the ' +
      'declaration correctly declines, which collectively read as a clean bill of health until ' +
      'one rule owned the case — this is the label that produced three passes and no findings.',
    data: { ...BASE, netQuantity: { inchPound: '' } },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NET_QUANTITY_MISSING,
      severity: 'blocking',
      citation: '21 CFR 101.7(a)',
    },
  },
  {
    name: 'net weight in ounces only',
    defect:
      'An ordinary packaged food carrying the inch/pound declaration alone. The Fair Packaging ' +
      'and Labeling Act has required both measurement systems since 1992; 21 CFR 101.7 was ' +
      'never amended to say so, which is why this rule cites the statute.',
    data: { ...BASE, netQuantity: { inchPound: 'NET WT 12 OZ' } },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NET_QUANTITY_METRIC_MISSING,
      severity: 'violation',
      citation: '15 U.S.C. 1453(a)(2)',
    },
  },
]

/**
 * A label that should raise nothing.
 *
 * Unlike its GHS counterpart this one is genuinely clean, because nothing on a
 * net quantity declaration depends on artwork this project could not verify. It
 * states no type size, so the engine derives the em that meets 101.7(i) for this
 * panel and this casing — which is what makes "the default label complies" a
 * property the suite checks rather than a claim in a comment.
 */
export const US_FOOD_CONFORMANT: { data: UsFoodLabelData; stock: LabelStock } = {
  data: { ...BASE },
  stock: CONFORMING_STOCK,
}

/**
 * A panel small enough that 101.7(f) stops asking where the declaration sits.
 *
 * It is *not* otherwise clean: the declaration still sits on top of the
 * statement of identity, and the separation requirement in the same paragraph
 * still bites. The exemption covers placement within the bottom 30 percent and
 * nothing else, and the suite asserts both halves of that.
 */
export const US_FOOD_SMALL_PANEL: { data: UsFoodLabelData; stock: LabelStock } = {
  data: {
    ...BASE,
    container: { shape: 'rectangular', widthMm: 50, heightMm: 60 },
    netQuantityAnchor: 'top-centre',
  },
  stock: { widthMm: 50, heightMm: 60, marginMm: 4 },
}
