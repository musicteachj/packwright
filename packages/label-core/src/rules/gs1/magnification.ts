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
import { finding, passed, xDimensionMm } from '../finding'
import type { Gs1RetailContext, Gs1RetailRule } from '../types'

export const GS1_MAGNIFICATION_OUT_OF_RANGE = 'GS1_MAGNIFICATION_OUT_OF_RANGE'
export const GS1_MAGNIFICATION_IN_RANGE = 'GS1_MAGNIFICATION_IN_RANGE'

const CITATION: Citation = {
  authority: 'GS1',
  reference: 'GS1 General Specifications 25.0, figure 5.12.3.1-1',
  title: 'Symbol specification table 1 — EAN/UPC X-dimension range',
}

const RANGE = `${MIN_MAGNIFICATION.toFixed(2)}x–${MAX_MAGNIFICATION.toFixed(2)}x`

export const magnificationRule: Gs1RetailRule = {
  id: 'gs1/magnification',
  title: `An EAN/UPC symbol is drawn between ${RANGE} of its nominal size.`,
  citation: CITATION,
  codes: [GS1_MAGNIFICATION_OUT_OF_RANGE, GS1_MAGNIFICATION_IN_RANGE],
  appliesTo: 'gs1-retail',

  check({ layout }: Gs1RetailContext): Finding[] {
    return layout.symbols.map((symbol) => {
      const magnification = xDimensionMmToMagnification(symbol.xDimensionMm)
      const actual = `${magnification.toFixed(2)}x (X = ${xDimensionMm(symbol.xDimensionMm)})`

      if (isMagnificationInRange(magnification)) {
        return passed(
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
