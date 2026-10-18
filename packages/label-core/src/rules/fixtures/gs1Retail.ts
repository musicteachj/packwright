/**
 * Known-bad labels, one per rule.
 *
 * A rule without a fixture is a claim, not a check. It is easy to write a
 * validator that reads plausibly, cites a real clause, and never fires — the
 * quiet-zone rule was exactly that until the layout engine could draw a label
 * with a quiet zone to lose. So every rule here ships with a document that
 * provokes it, and the test asserts the code, the severity **and the citation
 * string**, because a finding carrying the wrong clause is worse than no finding
 * at all.
 *
 * The defects are the ordinary ones. A transposed check digit, a symbol scaled
 * past what the specification allows, a brand block that took the quiet zone for
 * artwork — these are what actually goes wrong on a pack, not contrivances
 * chosen to make a test go red.
 */

import type { LabelStock } from '../../templates/stock'
import type { UpcALabelData } from '../../templates/upcA'
import type { Severity } from '../../types/index'
import {
  GS1_BAR_HEIGHT_BELOW_MINIMUM,
  GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS,
  GS1_DIGITAL_LINK_INVALID,
  GS1_GTIN_CHECK_DIGIT_INVALID,
  GS1_HRI_MISSING,
  GS1_MAGNIFICATION_OUT_OF_RANGE,
  GS1_QUIET_ZONE_TOO_NARROW,
} from '../index'

/** 036000291452 — a real, well-formed GTIN-12. Every fixture starts from it. */
export const VALID_GTIN = '036000291452'

const DEFAULT_STOCK: LabelStock = { widthMm: 60, heightMm: 40, marginMm: 3 }
/** Large enough that a 2.5x symbol still fits, so magnification is tested alone. */
const ROOMY_STOCK: LabelStock = { widthMm: 120, heightMm: 90, marginMm: 3 }

export interface RuleFixture {
  name: string
  /** What is wrong with this label, in one sentence. */
  defect: string
  data: UpcALabelData
  stock: LabelStock
  expected: {
    code: string
    severity: Severity
    /** The exact `citation.reference` the finding must carry. */
    citation: string
  }
}

export const GS1_RETAIL_FIXTURES: readonly RuleFixture[] = [
  {
    name: 'transposed check digit',
    defect: 'The twelfth digit is 3 where the algorithm computes 2.',
    data: { gtin: '036000291453' },
    stock: DEFAULT_STOCK,
    expected: {
      code: GS1_GTIN_CHECK_DIGIT_INVALID,
      severity: 'blocking',
      citation: 'GS1 General Specifications 26.0 §7.9.1',
    },
  },
  {
    name: 'magnification above the permitted maximum',
    defect: 'Drawn at 2.5x where the specification permits 0.8x to 2.0x.',
    data: { gtin: VALID_GTIN, magnification: 2.5 },
    stock: ROOMY_STOCK,
    expected: {
      code: GS1_MAGNIFICATION_OUT_OF_RANGE,
      severity: 'violation',
      citation: 'GS1 General Specifications 26.0 §5.12.3.1, table 5-44',
    },
  },
  {
    name: 'bars shorter than the minimum for their X-dimension',
    defect: 'Bars of 10 mm where a nominal UPC-A requires 22.85 mm.',
    data: { gtin: VALID_GTIN, barHeightMm: 10 },
    stock: DEFAULT_STOCK,
    expected: {
      code: GS1_BAR_HEIGHT_BELOW_MINIMUM,
      severity: 'violation',
      citation: 'GS1 General Specifications 26.0 §5.2.3.2 and table 5-44',
    },
  },
  {
    // Table 5-44 footnote (**): the bar height "SHALL NOT be truncated below the minimum
    // as listed", with any method of printing. 17.6 mm is above the 17.59 mm a height
    // scaled to 0.77x would give, which is what passed until 2026-10-18.
    name: 'bars truncated below the listed minimum at an on-demand X-dimension',
    defect: 'Bars of 17.6 mm at 0.77x, where the minimum listed for X = 0.264 is 18.28 mm.',
    data: { gtin: VALID_GTIN, magnification: 0.77, barHeightMm: 17.6 },
    stock: DEFAULT_STOCK,
    expected: {
      code: GS1_BAR_HEIGHT_BELOW_MINIMUM,
      severity: 'violation',
      citation: 'GS1 General Specifications 26.0 §5.2.3.2 and table 5-44',
    },
  },
  {
    name: 'magnification below the on-demand allowance',
    defect: 'Drawn at 0.70x, X = 0.231 mm, below the 0.249 mm footnote (*) allows any process.',
    data: { gtin: VALID_GTIN, magnification: 0.7 },
    stock: DEFAULT_STOCK,
    expected: {
      code: GS1_MAGNIFICATION_OUT_OF_RANGE,
      severity: 'violation',
      citation: 'GS1 General Specifications 26.0 §5.12.3.1, table 5-44',
    },
  },
  {
    name: 'artwork encroaching on the left quiet zone',
    defect:
      'A 10 mm brand block against the left margin ends 1.325 mm from the bars, ' +
      'where a UPC-A requires 2.97 mm.',
    data: {
      gtin: VALID_GTIN,
      artwork: { text: 'ACME', anchor: 'centre-left', widthMm: 10, heightMm: 8 },
    },
    stock: DEFAULT_STOCK,
    expected: {
      code: GS1_QUIET_ZONE_TOO_NARROW,
      severity: 'violation',
      citation: 'GS1 General Specifications 26.0 §5.2.3.4, table 5-11',
    },
  },
  {
    name: 'symbol larger than the stock it is printed on',
    defect: 'A 2x UPC-A needs 74.58 mm; the stock is 60 mm, so the bars run off it.',
    data: { gtin: VALID_GTIN, magnification: 2 },
    stock: DEFAULT_STOCK,
    expected: {
      code: GS1_QUIET_ZONE_TOO_NARROW,
      severity: 'violation',
      citation: 'GS1 General Specifications 26.0 §5.2.3.4, table 5-11',
    },
  },
  {
    name: 'no human-readable digits',
    defect: 'The GTIN is not printed below the bars.',
    data: { gtin: VALID_GTIN, omitHri: true },
    stock: DEFAULT_STOCK,
    expected: {
      code: GS1_HRI_MISSING,
      severity: 'violation',
      citation: 'GS1 General Specifications 26.0 §4.14.2',
    },
  },
  {
    name: 'Digital Link carrying a malformed expiry date',
    defect: 'AI (17) is a six-digit YYMMDD date; this one is four digits.',
    data: {
      gtin: VALID_GTIN,
      digitalLink: { domain: 'https://id.example.com', expiry: '2612' },
    },
    stock: DEFAULT_STOCK,
    expected: {
      code: GS1_DIGITAL_LINK_INVALID,
      severity: 'violation',
      citation: 'GS1 Digital Link URI Syntax 1.7.0 §4',
    },
  },
  {
    name: 'Digital Link using the removed convenience alphas',
    defect: '`/gtin/` was deprecated in URI Syntax 1.2 and removed in 1.3.0.',
    data: {
      gtin: VALID_GTIN,
      digitalLink: { domain: 'https://id.example.com', useConvenienceAlphas: true },
    },
    stock: DEFAULT_STOCK,
    expected: {
      code: GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS,
      severity: 'advisory',
      citation: 'GS1 Digital Link URI Syntax 1.7.0 §4.1',
    },
  },
  {
    name: 'Digital Link whose resolver domain ends in a fragment',
    defect:
      'The domain ends `#x`, so the GS1 path built after it is a fragment no resolver sees; ' +
      'URI Syntax 1.7.0 §4.11 builds the stem from a host name and path segments only.',
    data: {
      gtin: VALID_GTIN,
      digitalLink: { domain: 'https://id.example.com#x' },
    },
    stock: DEFAULT_STOCK,
    expected: {
      code: GS1_DIGITAL_LINK_INVALID,
      severity: 'violation',
      citation: 'GS1 Digital Link URI Syntax 1.7.0 §4',
    },
  },
  // The same two, as a label printed elsewhere carries them: the URI as written, which
  // `check_label` takes in place of the fields above (`digitalLinkAsPrinted`).
  {
    name: 'Digital Link as printed, using the removed convenience alphas',
    defect: 'The printed URI opens its path with `/gtin/`, removed in URI Syntax 1.3.0.',
    data: {
      gtin: VALID_GTIN,
      digitalLinkAsPrinted: 'https://id.example.com/gtin/00036000291452',
    },
    stock: DEFAULT_STOCK,
    expected: {
      code: GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS,
      severity: 'advisory',
      citation: 'GS1 Digital Link URI Syntax 1.7.0 §4.1',
    },
  },
  {
    name: 'Digital Link as printed, with a symbol in its lot unencoded',
    defect: 'The lot prints `A(1)`; URI Syntax 1.7.0 §4.2 writes the brackets `%28` and `%29`.',
    data: {
      gtin: VALID_GTIN,
      digitalLinkAsPrinted: 'https://id.example.com/01/00036000291452/10/A(1)',
    },
    stock: DEFAULT_STOCK,
    expected: {
      code: GS1_DIGITAL_LINK_INVALID,
      severity: 'violation',
      citation: 'GS1 Digital Link URI Syntax 1.7.0 §4',
    },
  },
  {
    name: 'Digital Link as printed, with a query that is no URI query',
    defect:
      'The query carries `x=<script>`; RFC 3986 §3.4 allows no raw `<` in a query, so the link is ' +
      "no web address, and the parameter not being GS1's does not excuse it.",
    data: {
      gtin: VALID_GTIN,
      digitalLinkAsPrinted: 'https://id.example.com/01/00036000291452?17=261231&x=<script>',
    },
    stock: DEFAULT_STOCK,
    expected: {
      code: GS1_DIGITAL_LINK_INVALID,
      severity: 'violation',
      citation: 'GS1 Digital Link URI Syntax 1.7.0 §4',
    },
  },
  {
    name: 'Digital Link as printed, with its key qualifiers out of order',
    defect: 'The serial (21) is printed before the lot (10); URI Syntax 1.7.0 fixes the order.',
    data: {
      gtin: VALID_GTIN,
      digitalLinkAsPrinted: 'https://id.example.com/01/00036000291452/21/S1/10/L1',
    },
    stock: DEFAULT_STOCK,
    expected: {
      code: GS1_DIGITAL_LINK_INVALID,
      severity: 'violation',
      citation: 'GS1 Digital Link URI Syntax 1.7.0 §4',
    },
  },
]

/**
 * The control. Every rule in the registry runs against this and clears.
 *
 * Worth as much as the bad ones: a rule set that fires on a conformant label is
 * as useless as one that never fires, and noticing that takes a document you
 * know to be right.
 */
export const CONFORMANT_FIXTURE: { data: UpcALabelData; stock: LabelStock } = {
  data: {
    gtin: VALID_GTIN,
    digitalLink: { domain: 'https://id.example.com', lot: 'ABC123' },
  },
  stock: DEFAULT_STOCK,
}
