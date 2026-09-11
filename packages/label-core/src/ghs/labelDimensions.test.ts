import { describe, expect, it } from 'vitest'
import {
  GHS_LABEL_DIMENSION_BANDS,
  PICTOGRAM_MIN_AREA_SQ_MM,
  dimensionBandFor,
  pictogramAreaSqMm,
  pictogramBoundingBoxMm,
} from './labelDimensions'

/**
 * Vectors read off CLP Annex I Table 1.3 in the consolidated text, not produced
 * by running the code above and pasting the result.
 */
describe('CLP Table 1.3 — minimum dimensions of labels and pictograms', () => {
  it.each([
    [0.5, 52, 74, 10],
    [3, 52, 74, 10],
    [3.1, 74, 105, 23],
    [50, 74, 105, 23],
    [50.1, 105, 148, 32],
    [500, 105, 148, 32],
    [500.1, 148, 210, 46],
    [1000, 148, 210, 46],
  ])(
    '%s litres requires a %s x %s mm label and a %s mm pictogram',
    (capacityL, widthMm, heightMm, sideMm) => {
      const band = dimensionBandFor(capacityL)
      expect(band.labelWidthMm).toBe(widthMm)
      expect(band.labelHeightMm).toBe(heightMm)
      expect(band.pictogramSideMm).toBe(sideMm)
    },
  )

  it('treats the band boundaries as inclusive upward, as the table words them', () => {
    // "Not exceeding 3 litres" includes exactly 3; the next band starts above it.
    expect(dimensionBandFor(3).labelWidthMm).toBe(52)
    expect(dimensionBandFor(3.000001).labelWidthMm).toBe(74)
  })

  it('qualifies only the smallest band with "If possible", as the source does', () => {
    const [smallest, ...rest] = GHS_LABEL_DIMENSION_BANDS
    expect(smallest!.labelDimensionIsBestEffort).toBe(true)
    expect(rest.every((band) => !band.labelDimensionIsBestEffort)).toBe(true)
    // It is also the only band carrying both a floor and a preferred size.
    expect(smallest!.pictogramPreferredSideMm).toBe(16)
    expect(rest.every((band) => band.pictogramPreferredSideMm === undefined)).toBe(true)
  })
})

describe('the pictogram dimension is the square’s edge', () => {
  /**
   * The derivation, pinned. CLP 1.2.1.3 sets a floor of 1 cm2 and Table 1.3
   * sets a floor of 10 x 10 mm for the same packages. Those agree exactly — and
   * only — if the table's figure is the square's own edge.
   */
  it('makes the smallest permitted pictogram exactly the minimum permitted area', () => {
    expect(pictogramAreaSqMm(10)).toBe(PICTOGRAM_MIN_AREA_SQ_MM)
  })

  it('would halve the minimum area if read as the bounding box instead', () => {
    // The reading this project rejected, kept as a test so the rejection is
    // visible rather than buried in a comment.
    const inscribedSquareArea = (10 * 10) / 2
    expect(inscribedSquareArea).toBeLessThan(PICTOGRAM_MIN_AREA_SQ_MM)
  })

  it('occupies a bounding box larger than its edge, since it is set at a point', () => {
    expect(pictogramBoundingBoxMm(10)).toBeCloseTo(14.142135, 5)
  })

  it('meets the 1 cm2 floor in every band of the table', () => {
    for (const band of GHS_LABEL_DIMENSION_BANDS) {
      expect(pictogramAreaSqMm(band.pictogramSideMm)).toBeGreaterThanOrEqual(
        PICTOGRAM_MIN_AREA_SQ_MM,
      )
    }
  })
})
