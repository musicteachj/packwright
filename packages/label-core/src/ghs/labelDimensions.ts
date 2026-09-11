/**
 * CLP minimum label and pictogram dimensions.
 *
 * **Source.** Regulation (EC) No 1272/2008 (CLP), consolidated text
 * `02008R1272 — EN — 01.09.2025 — 029.003`, Annex I section 1.2.1, retrieved
 * 2026-09-11 from EUR-Lex `CELEX:02008R1272-20250901`. Every figure below was
 * read off Table 1.3 on pages 65–66 of that document.
 *
 * **The consolidated text, not the 2008 original.** This matters more than the
 * usual caution about currency: the original Annex I 1.2.1 has no pictogram
 * dimensions at all — the third column of Table 1.3 was added by amendment
 * (marked ▼M2 in the consolidated text), and the original's wording for the
 * area rule refers to "the surface area of the harmonised label" where the
 * current text refers to "the minimum surface area of the label dedicated to
 * the information required by Article 17". Encoding the 2008 text would have
 * produced a rule that was both incomplete and measuring the wrong surface.
 *
 * The EU only. OSHA's Hazard Communication Standard sets no minimum label or
 * pictogram size — 29 CFR 1910.1200 requires legibility, not millimetres — so
 * every dimensional rule this project can cite comes from CLP.
 */

/**
 * Table 1.3, "Minimum dimensions of labels and pictograms".
 *
 * Keyed on the capacity of the *package*, which is not the same thing as the
 * size of the label stock. A 100 ml bottle and a 2 litre drum both sit in the
 * first band however large a label is wrapped around them, so capacity has to
 * be carried on the label data; it cannot be derived from the geometry.
 */
export interface GhsLabelDimensionBand {
  /** Upper bound of the capacity band in litres. `null` is the unbounded top band. */
  maxCapacityL: number | null
  /** Verbatim from the table's first column. */
  capacityText: string
  labelWidthMm: number
  labelHeightMm: number
  /**
   * The side of the pictogram square — see `PICTOGRAM_DIMENSION_IS_THE_SQUARES_SIDE`.
   */
  pictogramSideMm: number
  /**
   * Whether the row's label dimension is qualified by "If possible".
   *
   * Only the first band is, and the qualifier is in the legal text rather than
   * in guidance. It is the difference between a requirement and a strong
   * recommendation, so a rule that reports a hard violation for a 50 × 70 mm
   * label on a 500 ml bottle would be overstating the regulation. Carried as
   * data so the rule can pick its severity from the source rather than from an
   * assumption.
   */
  labelDimensionIsBestEffort: boolean
  /** Likewise for the pictogram column, which carries both a floor and a target. */
  pictogramPreferredSideMm?: number
}

export const GHS_LABEL_DIMENSION_BANDS: readonly GhsLabelDimensionBand[] = [
  {
    maxCapacityL: 3,
    capacityText: 'Not exceeding 3 litres',
    labelWidthMm: 52,
    labelHeightMm: 74,
    labelDimensionIsBestEffort: true,
    // "Not smaller than 10 × 10. If possible, at least 16 × 16" — a hard floor
    // and a target, which is why this band carries two figures and no other does.
    pictogramSideMm: 10,
    pictogramPreferredSideMm: 16,
  },
  {
    maxCapacityL: 50,
    capacityText: 'Greater than 3 litres but not exceeding 50 litres',
    labelWidthMm: 74,
    labelHeightMm: 105,
    labelDimensionIsBestEffort: false,
    pictogramSideMm: 23,
  },
  {
    maxCapacityL: 500,
    capacityText: 'Greater than 50 litres but not exceeding 500 litres',
    labelWidthMm: 105,
    labelHeightMm: 148,
    labelDimensionIsBestEffort: false,
    pictogramSideMm: 32,
  },
  {
    maxCapacityL: null,
    capacityText: 'Greater than 500 litres',
    labelWidthMm: 148,
    labelHeightMm: 210,
    labelDimensionIsBestEffort: false,
    pictogramSideMm: 46,
  },
]

/**
 * Which band a package capacity falls in.
 *
 * The bands are half-open upward — "not exceeding 3 litres" includes exactly
 * 3 — so the comparison is `<=` and not `<`. A capacity of 3.0 belongs to the
 * first band, and the boundary is where a rule is most likely to be wrong.
 */
export function dimensionBandFor(capacityL: number): GhsLabelDimensionBand {
  const band = GHS_LABEL_DIMENSION_BANDS.find(
    (candidate) => candidate.maxCapacityL === null || capacityL <= candidate.maxCapacityL,
  )
  // The last band is unbounded, so this is unreachable for any finite input.
  if (!band) throw new Error(`No CLP dimension band covers a capacity of ${capacityL} litres`)
  return band
}

/**
 * CLP 1.2.1.3, verbatim: "Each hazard pictogram shall cover at least one
 * fifteenth of the minimum surface area of the label dedicated to the
 * information required by Article 17."
 */
export const PICTOGRAM_MIN_FRACTION_OF_LABEL = 1 / 15

/**
 * CLP 1.2.1.3: "The minimum area of each hazard pictogram shall not be less
 * than 1 cm2." Held in square millimetres, the unit everything else here uses.
 */
export const PICTOGRAM_MIN_AREA_SQ_MM = 100

/**
 * **A reading of the table that was derived, not assumed.**
 *
 * CLP 1.2.1.1 says a pictogram is "a square set at a point" — a diamond. Table
 * 1.3 then gives "Dimensions of each pictogram (in millimetres)" as, for the
 * smallest band, "Not smaller than 10 × 10". That is ambiguous on its face: it
 * could mean the square's own edge, or the bounding box of the rotated square.
 * The two differ by a factor of two in area, so a sizing rule built on the
 * wrong one is wrong by 100%.
 *
 * Section 1.2.1.3 of the same annex settles it. A pictogram's area may not be
 * less than 1 cm². Read as the square's edge, 10 × 10 mm is 100 mm² — exactly
 * 1 cm², the floor, to the square millimetre. Read as the bounding box, the
 * square inscribed in it has an area of 50 mm², which is half the floor the
 * same section sets. Only the first reading leaves the regulation consistent
 * with itself, and the exact coincidence at the boundary is how the table was
 * built.
 *
 * So `pictogramSideMm` is the edge, and a pictogram drawn as a diamond occupies
 * a bounding box of `side * sqrt(2)`.
 */
export const PICTOGRAM_DIMENSION_IS_THE_SQUARES_SIDE = true

/** The bounding box a diamond of the given square-edge occupies. */
export function pictogramBoundingBoxMm(sideMm: number): number {
  return sideMm * Math.SQRT2
}

/** The area of a pictogram, which is the area of the square, not its bounding box. */
export function pictogramAreaSqMm(sideMm: number): number {
  return sideMm * sideMm
}
