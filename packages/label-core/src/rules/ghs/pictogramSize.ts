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
 * So the dimension check is the one this rule enforces, and the fraction is not judged
 * as a requirement of its own. **But the pass may say only what it measured.** It said a
 * pictogram clearing Table 1.3 met "the one fifteenth requirement" too, which at the
 * table's own 32 mm is false: 1,024 mm² against 1,036.3. The 2026-10-17 source
 * verification found it (item 13); 1.2.1.3 and Table 1.3 re-read from the 2026-07-01
 * consolidation on 2026-10-18. The pass now says whether the drawn pictogram reaches the
 * fraction, and where it does not, that the difference is not judged.
 * `ghs/labelDimensions.test.ts` pins the arithmetic.
 *
 * `drawnSideMm` is the square's own edge, not the width of the diamond it makes —
 * see `PICTOGRAM_DIMENSION_IS_THE_SQUARES_SIDE`, where that reading is derived
 * from the regulation rather than assumed.
 */

import {
  PICTOGRAM_MIN_AREA_SQ_MM,
  PICTOGRAM_MIN_FRACTION_OF_LABEL,
  dimensionBandFor,
} from '../../ghs/labelDimensions'
import type { Citation, Finding } from '../../types/index'
import { verdictWaitsOnADescribedLabel } from '../described'
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

const judgedAsDrawn: GhsChemicalRule = {
  id: 'ghs/pictogram-size',
  title: 'Each pictogram meets the minimum dimension CLP’s Table 1.3 sets for its capacity band.',
  citation: CITATION,
  codes: {
    [GHS_PICTOGRAM_BELOW_MINIMUM_SIZE]: ['violation'],
    [GHS_PICTOGRAM_SIZE_MET]: ['pass'],
  },
  appliesTo: 'ghs-chemical',

  check({ data, layout }: GhsChemicalContext): Finding[] {
    if (data.regime !== 'eu-clp') return []

    const findings: Finding[] = []
    const band = dimensionBandFor(data.capacityL)
    // 1.2.1.3: "at least one fifteenth of the minimum surface area of the label dedicated to
    // the information required by Article 17", and "not ... less than 1 cm2".
    const fifteenthSqMm = Math.max(
      band.labelWidthMm * band.labelHeightMm * PICTOGRAM_MIN_FRACTION_OF_LABEL,
      PICTOGRAM_MIN_AREA_SQ_MM,
    )
    for (const pictogram of layout.pictograms) {
      const tooSmall = pictogram.drawnSideMm < pictogram.requiredSideMm - MEASUREMENT_TOLERANCE_MM

      if (tooSmall) {
        findings.push(
          finding(ghsPictogramSizeRule, {
            code: GHS_PICTOGRAM_BELOW_MINIMUM_SIZE,
            severity: 'violation',
            message:
              `The ${pictogram.code} pictogram is ${mm(pictogram.drawnSideMm)} square; a package in ` +
              `Table 1.3's "${band.capacityText}" band requires ${mm(pictogram.requiredSideMm)}.`,
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
          // 1.2.1.3 and Table 1.3 size the printed pictogram; a bare frame has not cleared it.
          passedOnArtwork(
            ghsPictogramSizeRule,
            GHS_PICTOGRAM_SIZE_MET,
            `The ${pictogram.code} pictogram is ${mm(pictogram.drawnSideMm)} square, covering ` +
              `${sqMm(pictogram.drawnAreaSqMm)}, which meets Table 1.3` +
              // The first band's label is "If possible, at least 52 × 74", no minimum to take a
              // fifteenth of, so nothing is said of the fraction there, either way. Found by
              // review.
              (band.labelDimensionIsBestEffort
                ? '.'
                : pictogram.drawnAreaSqMm >= fifteenthSqMm
                  ? ` and 1.2.1.3's one fifteenth of the label's minimum area, ${sqMm(fifteenthSqMm)}.`
                  : `. It does not reach 1.2.1.3's one fifteenth of the label's minimum area, ` +
                    `${sqMm(fifteenthSqMm)}, and nor does Table 1.3's own figure for this band; ` +
                    'that difference is not judged here.'),
            pictogram.elementId,
          ),
        )
      }
    }

    return findings
  },
}

/**
 * The rule as drawn, its verdict waiting on a label printed elsewhere: see
 * `rules/described.ts`.
 *
 * With no side stated, the engine draws each pictogram at its band's own minimum
 * (`ghsEngine.ts`) and records that as both the size drawn and the size required, so
 * on a label it did not draw this check could never fail. It said nothing either way,
 * while the answer told the user an undersized pictogram "is still reported".
 * Found by `/code-review max` on 2026-10-27.
 *
 * **The smallest side is asked for**, because a request carries one side and the engine
 * draws every pictogram at it. Asked for "each" pictogram's side, a label printing one
 * at 25 mm and another at 18 could send 25, and the 18 mm one would be cleared by
 * silence; given the smallest, any error falls on the accusing side. Found by the
 * second `/code-review max` that day.
 */
export const ghsPictogramSizeRule: GhsChemicalRule = verdictWaitsOnADescribedLabel(judgedAsDrawn, {
  unstated: ({ data }) =>
    data.pictogramSideMm === undefined ? (['pictogramSideMm'] as const) : [],
  reason: () =>
    'This label is described rather than drawn here, and Packwright cannot see how large its ' +
    'pictograms are printed; its own default, the minimum for the capacity band, would decide ' +
    'the verdict. State the side of the smallest pictogram’s square in millimeters and this ' +
    'check will run.',
})
