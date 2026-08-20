/**
 * Unit conversion.
 *
 * Everything internal is millimetres. US regulation is written in inches and
 * PDF geometry is in points, so conversions happen at the edges — never in the
 * middle of a calculation, where a stray round-trip quietly loses precision.
 */

export const MM_PER_INCH = 25.4
export const POINTS_PER_INCH = 72
export const MM_PER_POINT = MM_PER_INCH / POINTS_PER_INCH

export const inchesToMm = (inches: number): number => inches * MM_PER_INCH
export const mmToInches = (mm: number): number => mm / MM_PER_INCH

export const pointsToMm = (points: number): number => points * MM_PER_POINT
export const mmToPoints = (mm: number): number => mm / MM_PER_POINT

export const inchesToPoints = (inches: number): number => inches * POINTS_PER_INCH
export const pointsToInches = (points: number): number => points / POINTS_PER_INCH

export const squareInchesToSquareMm = (sqIn: number): number => sqIn * MM_PER_INCH ** 2
export const squareMmToSquareInches = (sqMm: number): number => sqMm / MM_PER_INCH ** 2

/**
 * Rounds for display only. Never round before a comparison — a bar width that
 * rounds up to the minimum is still under it, and the symbol still fails to
 * scan.
 */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
