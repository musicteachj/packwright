/**
 * Barcode symbol geometry — GS1 General Specifications.
 *
 * Two numbers govern whether a printed symbol scans:
 *
 *   X-dimension   the width of the narrowest bar
 *   quiet zone    the blank margin either side, measured in multiples of X
 *
 * The quiet zone is the most frequently violated rule in the whole
 * specification. It is blank space, so designers reclaim it for artwork without
 * realising it is load-bearing, and the symbol then fails at the till rather
 * than in proof.
 */

import type { SymbologyId } from '../types/index'

/**
 * Nominal X-dimension at 100% magnification for the EAN/UPC family, in mm.
 *
 * TODO(verify): confirm against the General Specifications directly before any
 * rule reports a pass/fail that depends on this constant.
 */
export const EAN_UPC_NOMINAL_X_DIMENSION_MM = 0.33

/** GS1 permits scaling the EAN/UPC family between these bounds. */
export const MIN_MAGNIFICATION = 0.8
export const MAX_MAGNIFICATION = 2.0

export interface QuietZoneSpec {
  /** Minimum left-hand quiet zone, as a multiple of the X-dimension. */
  leftX: number
  /** Minimum right-hand quiet zone, as a multiple of the X-dimension. */
  rightX: number
}

/**
 * The general minimum required by the specification. Applied to any symbology
 * without a documented, verified rule of its own — the specification's own
 * fallback, rather than a guess.
 */
export const GENERAL_QUIET_ZONE: QuietZoneSpec = { leftX: 7, rightX: 7 }

/**
 * Symbology-specific quiet zones, where the asymmetry is documented.
 *
 * Deliberately sparse. EAN-13, EAN-8, ITF-14 and GS1-128 each have their own
 * documented figures, but they are not recorded here until confirmed against
 * the General Specifications — an unverified quiet-zone number produces a
 * confident pass on a label that will not scan, which is worse than falling
 * back to the general 7X minimum.
 */
const SYMBOLOGY_QUIET_ZONES: Partial<Record<SymbologyId, QuietZoneSpec>> = {
  'UPC-A': { leftX: 9, rightX: 9 },
  'UPC-E': { leftX: 9, rightX: 7 },
}

export function quietZoneFor(symbology: SymbologyId): QuietZoneSpec {
  return SYMBOLOGY_QUIET_ZONES[symbology] ?? GENERAL_QUIET_ZONE
}

/** True when this symbology has a verified rule rather than the general fallback. */
export function hasVerifiedQuietZone(symbology: SymbologyId): boolean {
  return symbology in SYMBOLOGY_QUIET_ZONES
}

/** Minimum quiet-zone widths in millimetres for a given X-dimension. */
export function quietZoneMm(
  symbology: SymbologyId,
  xDimensionMm: number,
): { leftMm: number; rightMm: number } {
  const spec = quietZoneFor(symbology)
  return { leftMm: spec.leftX * xDimensionMm, rightMm: spec.rightX * xDimensionMm }
}

/** X-dimension produced by a given magnification of the EAN/UPC nominal size. */
export function magnificationToXDimensionMm(magnification: number): number {
  return EAN_UPC_NOMINAL_X_DIMENSION_MM * magnification
}

/** The inverse — what magnification an as-drawn X-dimension corresponds to. */
export function xDimensionMmToMagnification(xDimensionMm: number): number {
  return xDimensionMm / EAN_UPC_NOMINAL_X_DIMENSION_MM
}

export function isMagnificationInRange(magnification: number): boolean {
  return magnification >= MIN_MAGNIFICATION && magnification <= MAX_MAGNIFICATION
}

/**
 * Total horizontal space a symbol needs including both quiet zones.
 *
 * Worth computing explicitly: the quiet zone is invisible, so a layout that
 * looks like it fits routinely does not.
 */
export function totalSymbolWidthMm(
  symbology: SymbologyId,
  symbolWidthMm: number,
  xDimensionMm: number,
): number {
  const { leftMm, rightMm } = quietZoneMm(symbology, xDimensionMm)
  return leftMm + symbolWidthMm + rightMm
}
