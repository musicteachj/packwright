/**
 * The statement a unit container bears in place of a nutrition label.
 *
 * Source: **21 CFR 101.9(j)(15)(iii)**, read from the eCFR on 2026-09-17: "Each unit
 * container is labeled with the statement “This Unit Not Labeled For Retail Sale” in
 * type size not less than 1/16-inch in height, except that this statement shall not
 * be required when the inner unit containers bear no labeling at all. The word
 * “individual” may be used in lieu of or immediately preceding the word “Retail” in
 * the statement."
 *
 * Three wordings, then, and no fourth: the statement as written, "individual" in lieu
 * of "Retail", and "individual" immediately preceding it. They are looked up here and
 * never composed — a unit that says "Not for retail sale" is not bearing the statement
 * — and the engine prints whichever the label claims. The exception for units that
 * "bear no labeling at all" is not one this project can reach, since it exists to draw
 * the label being judged.
 *
 * **The height, and how it is measured.** (iii) sets 1/16 inch and names no letter to
 * measure. 101.2(c) sets the same figure for everything on the information panel and
 * incorporates 101.7(h)(2), which measures a capital, or the lowercase "o" where lower
 * case is used. The statement sits on that panel and is set in mixed case, so the rule
 * that judges it borrows that basis (`regulatedGlyphBasis`) rather than inventing one,
 * and cites (iii) for the figure.
 */

import { MM_PER_INCH } from '../geometry/units'

export const UNIT_CONTAINER_WORDINGS = ['retail', 'individual', 'individual-retail'] as const
export type UnitContainerWording = (typeof UNIT_CONTAINER_WORDINGS)[number]

/** The statement, in each form (iii) permits. */
export const UNIT_CONTAINER_STATEMENTS: Record<UnitContainerWording, string> = {
  retail: 'This Unit Not Labeled For Retail Sale',
  individual: 'This Unit Not Labeled For Individual Sale',
  'individual-retail': 'This Unit Not Labeled For Individual Retail Sale',
}

/** (iii): "in type size not less than 1/16-inch in height". */
export const UNIT_CONTAINER_STATEMENT_MIN_TYPE_HEIGHT_INCHES = 1 / 16

/** The same floor in millimetres: 1.5875 mm. */
export const UNIT_CONTAINER_STATEMENT_MIN_TYPE_HEIGHT_MM =
  UNIT_CONTAINER_STATEMENT_MIN_TYPE_HEIGHT_INCHES * MM_PER_INCH
