/**
 * The EAN/UPC family may be scaled between 0.8x and 2.0x of nominal, and down to
 * X = 0.249 mm where it is printed on demand.
 *
 * Measured from the drawn symbol's X-dimension rather than read back off the
 * request. The two agree today, and the moment anything in the engine scales a
 * symbol to fit, they stop agreeing — and the drawn one is the one that goes to
 * press.
 *
 * **The on-demand band is a limit of this tool, not a verdict.** Table 5-44 footnote (*)
 * allows X-dimensions from 0.249 to 0.264 mm "only applicable to on demand (e.g.,
 * thermal, laser) print processes"; for every other process 0.264 "is the minimum
 * allowable size". A label says nothing about how it is printed, so a symbol drawn in
 * that band is neither passed nor reported: the rule declines and says why (James's
 * decision of 2026-10-18; `docs/WHAT-IS-NOT-CHECKED.md`). Reporting it as below the
 * range, as this rule did until then, reported a label for using the allowance
 * (verification record of 2026-10-17, item 12). Below 0.249 mm no process is allowed,
 * and the violation stands.
 *
 * Footnote (*)'s second bullet, that the area for a minimum symbol and its Quiet Zone
 * "SHOULD never be less than" that of X = 0.264, is a recommendation and is not judged.
 */

import {
  EAN_UPC_MIN_X_DIMENSION_MM,
  MAX_MAGNIFICATION,
  MIN_MAGNIFICATION,
  ON_DEMAND_MIN_X_DIMENSION_MM,
  xDimensionBand,
  xDimensionMmToMagnification,
} from '../../geometry/symbol'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork, xDimensionMm } from '../finding'
import type { Decline, Gs1RetailContext, Gs1RetailRule } from '../types'
import { verdictWaitsOnADescribedLabel } from '../described'

export const GS1_MAGNIFICATION_OUT_OF_RANGE = 'GS1_MAGNIFICATION_OUT_OF_RANGE'
export const GS1_MAGNIFICATION_IN_RANGE = 'GS1_MAGNIFICATION_IN_RANGE'

// GS1 General Specifications Release 26.0 (Ratified Jan 26), read from the rendered
// pages at https://ref.gs1.org/standards/genspecs/ on 2026-10-12; table 5-44 and its
// footnotes (pages 410 and 411) re-read from the rendered pages on 2026-10-18. 25.0's
// "figure 5.x-1" identifiers do not exist in 26.0, which numbers the tables; the figures
// themselves are unchanged (`geometry/symbol.ts`).
const CITATION: Citation = {
  authority: 'GS1',
  reference: 'GS1 General Specifications 26.0 §5.12.3.1, table 5-44',
  // Table 5-44's own caption: "GS1 symbol specification table 1".
  title: 'GS1 symbol specification table 1 — EAN/UPC X-dimension range',
}

const RANGE = `${MIN_MAGNIFICATION.toFixed(2)}x–${MAX_MAGNIFICATION.toFixed(2)}x`
const ON_DEMAND_FLOOR = `X = ${xDimensionMm(ON_DEMAND_MIN_X_DIMENSION_MM)}`

const judgedAsDrawn: Gs1RetailRule = {
  id: 'gs1/magnification',
  title: `An EAN/UPC symbol is drawn between ${RANGE} of its nominal size.`,
  citation: CITATION,
  codes: {
    [GS1_MAGNIFICATION_OUT_OF_RANGE]: ['violation'],
    [GS1_MAGNIFICATION_IN_RANGE]: ['pass'],
  },
  appliesTo: 'gs1-retail',

  // One test, `standsDown`, decides for both, so `check` and this cannot disagree.
  declines({ layout }: Gs1RetailContext): Decline | undefined {
    if (!standsDown(layout.symbols)) return undefined
    const inBand = layout.symbols.find((one) => xDimensionBand(one.xDimensionMm) === 'on-demand')!
    const magnification = xDimensionMmToMagnification(inBand.xDimensionMm)
    return {
      reason:
        `The symbol is drawn at ${magnification.toFixed(2)}x (X = ` +
        `${xDimensionMm(inBand.xDimensionMm)}), below ${RANGE} but within the allowance ` +
        'of GS1 General Specifications table 5-44 footnote (*), which permits X-dimensions ' +
        `from ${xDimensionMm(ON_DEMAND_MIN_X_DIMENSION_MM)} to ` +
        `${xDimensionMm(EAN_UPC_MIN_X_DIMENSION_MM)} only for on demand (e.g., thermal, ` +
        'laser) print processes. Packwright cannot tell how the label is printed, so it ' +
        'gives no verdict on the magnification here. That is a limit of this tool, not a ' +
        'fault found in your label.',
      wants: [],
      limit: true,
    }
  },

  check({ layout }: Gs1RetailContext): Finding[] {
    if (standsDown(layout.symbols)) return []
    // A symbol in footnote (*)'s band beside one that is reported: the report stands, and
    // no other symbol's pass is said beside a symbol nobody judged.
    const unjudged = layout.symbols.some((one) => xDimensionBand(one.xDimensionMm) === 'on-demand')

    return layout.symbols.flatMap((symbol) => {
      const band = xDimensionBand(symbol.xDimensionMm)
      if (band === 'on-demand') return []

      const magnification = xDimensionMmToMagnification(symbol.xDimensionMm)
      const actual = `${magnification.toFixed(2)}x (X = ${xDimensionMm(symbol.xDimensionMm)})`

      if (band === 'in-range') {
        if (unjudged) return []
        // Table 5-44 bounds the X-dimension the bars are printed at: the artwork.
        return [
          passedOnArtwork(
            magnificationRule,
            GS1_MAGNIFICATION_IN_RANGE,
            `The symbol is drawn at ${actual}, within the permitted ${RANGE}.`,
            symbol.elementId,
          ),
        ]
      }

      const below = band === 'below'
      return [
        finding(magnificationRule, {
          code: GS1_MAGNIFICATION_OUT_OF_RANGE,
          severity: 'violation',
          message: below
            ? `The symbol is drawn at ${actual}; the specification permits ${RANGE}, and ` +
              `on demand print processes down to ${ON_DEMAND_FLOOR}, but nothing smaller.`
            : `The symbol is drawn at ${actual}; the specification permits ${RANGE}.`,
          measurement: {
            actual,
            required: below ? `${RANGE}, or down to ${ON_DEMAND_FLOOR} printed on demand` : RANGE,
          },
          elementId: symbol.elementId,
        }),
      ]
    })
  },
}

/**
 * Whether the rule stands down: a symbol sits in footnote (*)'s band and none is out of
 * range either side. Where one is, the rule has a violation to report and does not also
 * stand down (`Rule.declines`).
 */
function standsDown(symbols: readonly { xDimensionMm: number }[]): boolean {
  const bands = symbols.map((one) => xDimensionBand(one.xDimensionMm))
  return bands.includes('on-demand') && !bands.some((band) => band === 'below' || band === 'above')
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
