/**
 * Each hazard pictogram must be at least the size its capacity band requires.
 *
 * **One check, not two — and that was derived rather than assumed.** CLP states
 * the requirement twice: a dimension per band in Table 1.3, and in 1.2.1.3 a
 * floor of one fifteenth of the label's information area, never below 1 cm².
 * Checking both independently looked obviously right and is wrong, because the
 * two are the same requirement written twice:
 *
 *     sqrt(74 x 105 / 15) = 22.76 -> 23    Table 1.3 says 23
 *     sqrt(105 x 148 / 15) = 32.19 -> 32   Table 1.3 says 32
 *     sqrt(148 x 210 / 15) = 45.52 -> 46   Table 1.3 says 46
 *     sqrt(52 x 74 / 15)  = 16.02 -> 16    Table 1.3 says "if possible, 16 x 16"
 *
 * The pictogram column is the fraction, rounded to whole millimetres. Two of
 * those roundings go down, so applying the fraction *as well* reports the
 * regulator's own tabulated minimum as non-compliant — a 32 mm pictogram on a
 * 200 litre drum misses one fifteenth by 12 mm², which is 1.2% and entirely an
 * artefact of rounding. The smallest band's 10 x 10 is the separate 1 cm²
 * absolute floor, and 10 x 10 is exactly 1 cm².
 *
 * So the dimension check enforces both provisions, and a pictogram that clears
 * Table 1.3 clears 1.2.1.3 by construction. `ghs/labelDimensions.test.ts` pins
 * the arithmetic so this cannot quietly stop being true.
 *
 * `drawnSideMm` is the square's own edge, not the width of the diamond it makes —
 * see `PICTOGRAM_DIMENSION_IS_THE_SQUARES_SIDE`, where that reading is derived
 * from the regulation rather than assumed.
 */

import { dimensionBandFor } from '../../ghs/labelDimensions'
import type { Citation, Finding } from '../../types/index'
import { MEASUREMENT_TOLERANCE_MM, finding, mm, passedOnArtwork } from '../finding'
import type { GhsChemicalContext, GhsChemicalRule } from '../types'

export const GHS_PICTOGRAM_BELOW_MINIMUM_SIZE = 'GHS_PICTOGRAM_BELOW_MINIMUM_SIZE'
export const GHS_PICTOGRAM_SIZE_MET = 'GHS_PICTOGRAM_SIZE_MET'

const CITATION: Citation = {
  authority: 'EU',
  reference: 'Regulation (EC) No 1272/2008 (CLP), Annex I, 1.2.1.3 and Table 1.3',
  title: 'Minimum pictogram area and dimensions',
}

const sqMm = (value: number) => `${value.toFixed(1)} mm²`

export const ghsPictogramSizeRule: GhsChemicalRule = {
  id: 'ghs/pictogram-size',
  title: 'Each pictogram meets CLP’s minimum dimension, area and share of the label.',
  citation: CITATION,
  codes: [GHS_PICTOGRAM_BELOW_MINIMUM_SIZE, GHS_PICTOGRAM_SIZE_MET],
  appliesTo: 'ghs-chemical',

  check({ data, layout }: GhsChemicalContext): Finding[] {
    if (data.regime !== 'eu-clp') return []

    const findings: Finding[] = []
    const band = dimensionBandFor(data.capacityL)
    for (const pictogram of layout.pictograms) {
      const tooSmall = pictogram.drawnSideMm < pictogram.requiredSideMm - MEASUREMENT_TOLERANCE_MM

      if (tooSmall) {
        findings.push(
          finding(ghsPictogramSizeRule, {
            code: GHS_PICTOGRAM_BELOW_MINIMUM_SIZE,
            severity: 'violation',
            message:
              `The ${pictogram.code} pictogram is ${mm(pictogram.drawnSideMm)} square; a package ` +
              `of ${band.capacityText.toLowerCase()} requires ${mm(pictogram.requiredSideMm)}.`,
            measurement: {
              actual: mm(pictogram.drawnSideMm),
              required: mm(pictogram.requiredSideMm),
            },
            elementId: pictogram.elementId,
          }),
        )
      }

      if (!tooSmall) {
        findings.push(
          passedOnArtwork(
            ghsPictogramSizeRule,
            GHS_PICTOGRAM_SIZE_MET,
            `The ${pictogram.code} pictogram is ${mm(pictogram.drawnSideMm)} square, covering ` +
              `${sqMm(pictogram.drawnAreaSqMm)} — meeting Table 1.3 and, with it, the one ` +
              'fifteenth requirement.',
            pictogram.elementId,
          ),
        )
      }
    }

    return findings
  },
}
