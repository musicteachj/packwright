/**
 * An EAN/UPC symbol at point of sale carries its digits beneath the bars.
 *
 * GenSpec §4.14.2: "For EAN/UPC barcodes the HRI SHALL show the GTIN-8,
 * GTIN-12, or GTIN-13 and SHALL be placed below the barcode."
 *
 * Judged from the drawn label — are there digits with the symbol's element id —
 * rather than from the `omitHri` flag that asked for them to be left off. The
 * flag states an intention; the primitives are what goes to press, and a
 * template that dropped the digits for its own reasons would satisfy the flag
 * and fail the pack.
 *
 * Note what this rule does **not** check: the size of the type. GenSpec §4.14.2
 * requires the HRI to be present, but the sections verified so far do not
 * tabulate a minimum type size — the dimensioned drawings in §5.2.6.6 are images
 * rather than extractable text. Judging size from `fontSizeMm` would also be
 * wrong twice over, since that field is the em rather than a letter height. No
 * source, no rule.
 */

import type { Citation, Finding } from '../../types/index'
import { finding, passed } from '../finding'
import type { Gs1RetailContext, Gs1RetailRule } from '../types'

export const GS1_HRI_MISSING = 'GS1_HRI_MISSING'
export const GS1_HRI_PRESENT = 'GS1_HRI_PRESENT'

const CITATION: Citation = {
  authority: 'GS1',
  reference: 'GS1 General Specifications §4.14.2',
  title: 'Human readable interpretation for EAN/UPC barcodes',
}

export const humanReadableRule: Gs1RetailRule = {
  id: 'gs1/human-readable',
  title: 'An EAN/UPC symbol prints its GTIN in human-readable digits below the bars.',
  citation: CITATION,
  codes: [GS1_HRI_MISSING, GS1_HRI_PRESENT],
  appliesTo: 'gs1-retail',

  check({ layout }: Gs1RetailContext): Finding[] {
    return layout.symbols.map((symbol) => {
      const hasDigits = layout.primitives.some(
        (primitive) => primitive.kind === 'text' && primitive.elementId === symbol.elementId,
      )

      if (hasDigits) {
        return passed(
          humanReadableRule,
          GS1_HRI_PRESENT,
          `The symbol prints ${symbol.value} beneath the bars.`,
          symbol.elementId,
        )
      }

      return finding(humanReadableRule, {
        code: GS1_HRI_MISSING,
        severity: 'violation',
        message:
          `The symbol has no human-readable digits. ${symbol.symbology} requires the GTIN ` +
          'to be printed below the bars.',
        measurement: { actual: 'no digits drawn', required: `${symbol.value} below the bars` },
        elementId: symbol.elementId,
      })
    })
  },
}
