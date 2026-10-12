/**
 * The EAN/UPC family may be scaled between 0.8x and 2.0x of nominal.
 *
 * Measured from the drawn symbol's X-dimension rather than read back off the
 * request. The two agree today, and the moment anything in the engine scales a
 * symbol to fit, they stop agreeing — and the drawn one is the one that goes to
 * press.
 */

import {
  MAX_MAGNIFICATION,
  MIN_MAGNIFICATION,
  isMagnificationInRange,
  xDimensionMmToMagnification,
} from '../../geometry/symbol'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork, xDimensionMm } from '../finding'
import type { Gs1RetailContext, Gs1RetailRule } from '../types'
import { verdictWaitsOnADescribedLabel } from '../described'

export const GS1_MAGNIFICATION_OUT_OF_RANGE = 'GS1_MAGNIFICATION_OUT_OF_RANGE'
export const GS1_MAGNIFICATION_IN_RANGE = 'GS1_MAGNIFICATION_IN_RANGE'

// GS1 General Specifications Release 26.0 (Ratified Jan 26), read from the rendered
// pages at https://ref.gs1.org/standards/genspecs/ on 2026-10-12. 25.0's "figure
// 5.x-1" identifiers do not exist in 26.0, which numbers the tables; the figures
// themselves are unchanged (`geometry/symbol.ts`).
const CITATION: Citation = {
  authority: 'GS1',
  reference: 'GS1 General Specifications 26.0 §5.12.3.1, table 5-44',
  // Table 5-44's own caption: "GS1 symbol specification table 1".
  title: 'GS1 symbol specification table 1 — EAN/UPC X-dimension range',
}

const RANGE = `${MIN_MAGNIFICATION.toFixed(2)}x–${MAX_MAGNIFICATION.toFixed(2)}x`

const judgedAsDrawn: Gs1RetailRule = {
  id: 'gs1/magnification',
  title: `An EAN/UPC symbol is drawn between ${RANGE} of its nominal size.`,
  citation: CITATION,
  codes: {
    [GS1_MAGNIFICATION_OUT_OF_RANGE]: ['violation'],
    [GS1_MAGNIFICATION_IN_RANGE]: ['pass'],
  },
  appliesTo: 'gs1-retail',

  check({ layout }: Gs1RetailContext): Finding[] {
    return layout.symbols.map((symbol) => {
      const magnification = xDimensionMmToMagnification(symbol.xDimensionMm)
      const actual = `${magnification.toFixed(2)}x (X = ${xDimensionMm(symbol.xDimensionMm)})`

      if (isMagnificationInRange(magnification)) {
        // Table 5-44 bounds the X-dimension the bars are printed at: the artwork.
        return passedOnArtwork(
          magnificationRule,
          GS1_MAGNIFICATION_IN_RANGE,
          `The symbol is drawn at ${actual}, within the permitted ${RANGE}.`,
          symbol.elementId,
        )
      }

      return finding(magnificationRule, {
        code: GS1_MAGNIFICATION_OUT_OF_RANGE,
        severity: 'violation',
        message: `The symbol is drawn at ${actual}; the specification permits ${RANGE}.`,
        measurement: { actual, required: RANGE },
        elementId: symbol.elementId,
      })
    })
  },
}

/** The rule as drawn, its verdict waiting on a label printed elsewhere — see `rules/described.ts`. */
export const magnificationRule: Gs1RetailRule = verdictWaitsOnADescribedLabel(judgedAsDrawn, {
  unstated: ({ data }) => (data.magnification === undefined ? ['magnification'] : []),
  // A factor, said as one: "100%" invited `magnification: 100`, a hundredfold symbol.
  // Found by `/code-review high` on #87.
  reason: () =>
    'This label is described rather than drawn here, and Packwright cannot see the ' +
    'magnification its barcode is printed at; its own default of 1 (100%) would pass by ' +
    'construction. State the magnification, as a factor such as 1 or 0.8, and this check ' +
    'will run.',
})
