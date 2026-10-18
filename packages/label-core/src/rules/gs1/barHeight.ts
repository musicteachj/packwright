/**
 * A symbol's bars must be at least the specification's height for its size.
 *
 * The failure this catches is quiet in every sense. GenSpec 26.0 table 5-44
 * tabulates a minimum symbol height against each X-dimension, and that minimum
 * scales: 22.85 mm at nominal, 45.70 mm at 2x. A symbol drawn at 2x with the
 * nominal height has bars of the right width and quiet zones of the right size,
 * and merely reads as a slightly squat barcode. Nothing about it looks wrong. It
 * is non-conformant at point of sale.
 *
 * **It stops scaling at the minimum X-dimension.** Table 5-44 footnote (**): "When
 * printing a minimum symbol with any method of printing, the bar height SHALL NOT be
 * truncated below the minimum as listed in the table above." Below X = 0.264 the floor is
 * the height listed for 0.264, whatever the print process (`nominalBarHeightMm`). Until
 * 2026-10-18 it went on scaling, and passed a truncated bar in footnote (*)'s on-demand
 * band (verification record of 2026-10-17, item 12).
 */

import {
  EAN_UPC_MIN_X_DIMENSION_MM,
  isAtTheListedHeightFloor,
  nominalBarHeightMm,
} from '../../geometry/symbol'
import type { Citation, Finding } from '../../types/index'
import { MEASUREMENT_TOLERANCE_MM, finding, mm, passedOnArtwork, xDimensionMm } from '../finding'
import type { Gs1RetailContext, Gs1RetailRule } from '../types'
import { verdictWaitsOnADescribedLabel } from '../described'

export const GS1_BAR_HEIGHT_BELOW_MINIMUM = 'GS1_BAR_HEIGHT_BELOW_MINIMUM'
export const GS1_BAR_HEIGHT_SUFFICIENT = 'GS1_BAR_HEIGHT_SUFFICIENT'

// GS1 General Specifications Release 26.0 (Ratified Jan 26), read from the rendered
// pages at https://ref.gs1.org/standards/genspecs/ on 2026-10-12; table 5-44 and its
// footnotes (pages 410 and 411) re-read from the rendered pages on 2026-10-18. 25.0's "figure
// 5.x-1" identifiers do not exist in 26.0, which numbers the tables; the figures
// themselves are unchanged (`geometry/symbol.ts`).
const CITATION: Citation = {
  authority: 'GS1',
  reference: 'GS1 General Specifications 26.0 §5.2.3.2 and table 5-44',
  title: 'EAN/UPC symbol height at nominal size, and the minimum by X-dimension',
}

// The footnote quoted, not paraphrased: it sets a floor on the height, and says nothing of
// an X-dimension below which it starts. Found by `/code-review medium` on #107's follow-up.
const LISTED_FLOOR =
  `table 5-44 lists for its minimum X-dimension, ${xDimensionMm(EAN_UPC_MIN_X_DIMENSION_MM)}; ` +
  'its footnote (**) says "When printing a minimum symbol with any method of printing, the ' +
  'bar height SHALL NOT be truncated below the minimum as listed in the table above."'

const judgedAsDrawn: Gs1RetailRule = {
  id: 'gs1/bar-height',
  title: 'Bar height meets the specification’s minimum for the symbol’s X-dimension.',
  citation: CITATION,
  codes: {
    [GS1_BAR_HEIGHT_BELOW_MINIMUM]: ['violation'],
    [GS1_BAR_HEIGHT_SUFFICIENT]: ['pass'],
  },
  appliesTo: 'gs1-retail',

  check({ layout }: Gs1RetailContext): Finding[] {
    const findings: Finding[] = []

    for (const symbol of layout.symbols) {
      const requiredMm = nominalBarHeightMm(symbol.symbology, symbol.xDimensionMm)
      // Only the fixed-length EAN/UPC family is tabulated. No figure, no verdict.
      if (requiredMm === undefined) continue
      // Below the minimum X the table lists no height of its own, so the figure is said as
      // the one it is: 18.28 mm is 0.264's, owed by footnote (**), not this X-dimension's.
      // "Minimum for this X-dimension" claimed a figure the table does not give. Found by
      // `/code-review high` on #107.
      const atTheFloor = isAtTheListedHeightFloor(symbol.xDimensionMm)

      if (symbol.barHeightMm >= requiredMm - MEASUREMENT_TOLERANCE_MM) {
        findings.push(
          // §5.2.3.2 and table 5-44 set the height of the printed bars: the artwork.
          passedOnArtwork(
            barHeightRule,
            GS1_BAR_HEIGHT_SUFFICIENT,
            `The bars are ${mm(symbol.barHeightMm)}, meeting the ${mm(requiredMm)} ` +
              (atTheFloor ? LISTED_FLOOR : 'minimum for this X-dimension.'),
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
            `X = ${xDimensionMm(symbol.xDimensionMm)} requires ${mm(requiredMm)}` +
            (atTheFloor ? `, the height ${LISTED_FLOOR}` : '.'),
          measurement: { actual: mm(symbol.barHeightMm), required: mm(requiredMm) },
          elementId: symbol.elementId,
        }),
      )
    }

    return findings
  },
}

/** The rule as drawn, its verdict waiting on a label printed elsewhere — see `rules/described.ts`. */
export const barHeightRule: Gs1RetailRule = verdictWaitsOnADescribedLabel(judgedAsDrawn, {
  // The minimum is set by the X-dimension, so the magnification is waited for too.
  unstated: ({ data }) => [
    ...(data.barHeightMm === undefined ? (['barHeightMm'] as const) : []),
    ...(data.magnification === undefined ? (['magnification'] as const) : []),
  ],
  // Names only what is missing: a request that gave its magnification was told
  // Packwright could not see it. Found by `/code-review high` on #87.
  reason: (wants) => {
    const missing = [
      ...(wants.includes('barHeightMm') ? ['how tall its bars are printed'] : []),
      ...(wants.includes('magnification')
        ? ['the magnification the minimum is set by, as a factor such as 1 or 0.8']
        : []),
    ].join(', or ')
    return (
      `This label is described rather than drawn here, and Packwright cannot see ${missing}; ` +
      `its own ${wants.length > 1 ? 'defaults' : 'default'} would decide the verdict. State ` +
      `${wants.length > 1 ? 'them' : 'it'} and this check will run.`
    )
  },
})
