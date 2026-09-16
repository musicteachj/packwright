/**
 * A symbol's bars must be at least the specification's height for its size.
 *
 * The failure this catches is quiet in every sense. GenSpec figure 5.12.3.1-1
 * tabulates a minimum symbol height against each X-dimension, and that minimum
 * scales: 22.85 mm at nominal, 45.70 mm at 2x. A symbol drawn at 2x with the
 * nominal height has bars of the right width and quiet zones of the right size,
 * and merely reads as a slightly squat barcode. Nothing about it looks wrong. It
 * is non-conformant at point of sale.
 */

import { nominalBarHeightMm } from '../../geometry/symbol'
import type { Citation, Finding } from '../../types/index'
import { MEASUREMENT_TOLERANCE_MM, finding, mm, passedOnArtwork, xDimensionMm } from '../finding'
import type { Gs1RetailContext, Gs1RetailRule } from '../types'

export const GS1_BAR_HEIGHT_BELOW_MINIMUM = 'GS1_BAR_HEIGHT_BELOW_MINIMUM'
export const GS1_BAR_HEIGHT_SUFFICIENT = 'GS1_BAR_HEIGHT_SUFFICIENT'

const CITATION: Citation = {
  authority: 'GS1',
  reference: 'GS1 General Specifications 25.0, §5.2.3.2 and figure 5.12.3.1-1',
  title: 'EAN/UPC symbol height at nominal size, and the minimum by X-dimension',
}

export const barHeightRule: Gs1RetailRule = {
  id: 'gs1/bar-height',
  title: 'Bar height meets the specification’s minimum for the symbol’s X-dimension.',
  citation: CITATION,
  codes: [GS1_BAR_HEIGHT_BELOW_MINIMUM, GS1_BAR_HEIGHT_SUFFICIENT],
  appliesTo: 'gs1-retail',

  check({ layout }: Gs1RetailContext): Finding[] {
    const findings: Finding[] = []

    for (const symbol of layout.symbols) {
      const requiredMm = nominalBarHeightMm(symbol.symbology, symbol.xDimensionMm)
      // Only the fixed-length EAN/UPC family is tabulated. No figure, no verdict.
      if (requiredMm === undefined) continue

      if (symbol.barHeightMm >= requiredMm - MEASUREMENT_TOLERANCE_MM) {
        findings.push(
          // §5.2.3.2 and figure 5.12.3.1-1 set the height of the printed bars: the artwork.
          passedOnArtwork(
            barHeightRule,
            GS1_BAR_HEIGHT_SUFFICIENT,
            `The bars are ${mm(symbol.barHeightMm)}, meeting the ${mm(requiredMm)} minimum ` +
              'for this X-dimension.',
            symbol.elementId,
          ),
        )
        continue
      }

      findings.push(
        finding(barHeightRule, {
          code: GS1_BAR_HEIGHT_BELOW_MINIMUM,
          severity: 'violation',
          message:
            `The bars are ${mm(symbol.barHeightMm)}; a ${symbol.symbology} at ` +
            `X = ${xDimensionMm(symbol.xDimensionMm)} requires ${mm(requiredMm)}.`,
          measurement: { actual: mm(symbol.barHeightMm), required: mm(requiredMm) },
          elementId: symbol.elementId,
        }),
      )
    }

    return findings
  },
}
