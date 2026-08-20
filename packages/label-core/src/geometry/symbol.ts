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
 * GS1 General Specifications 25.0 §5.2.3.1: "The X-dimension at nominal size is
 * 0.330 millimetre (0.0130 inch)."
 */
export const EAN_UPC_NOMINAL_X_DIMENSION_MM = 0.33

/**
 * GS1 permits scaling the EAN/UPC family between these bounds.
 *
 * Derived from the symbol specification table (GenSpec 25.0 figure 5.12.3.1-1),
 * which gives the EAN/UPC X-dimension as 0.264 mm minimum and 0.660 mm maximum
 * against the 0.330 mm target — 0.8x and 2.0x respectively.
 */
export const MIN_MAGNIFICATION = 0.8
export const MAX_MAGNIFICATION = 2.0

export interface QuietZoneSpec {
  /** Minimum left-hand quiet zone, as a multiple of the X-dimension. */
  leftX: number
  /** Minimum right-hand quiet zone, as a multiple of the X-dimension. */
  rightX: number
}

/**
 * The floor stated in GenSpec 25.0 §5.2.3.4: "The minimum Quiet Zone width
 * required by the main symbol is 7x."
 *
 * It is a floor, not a safe default. Most symbologies require *more* than 7X,
 * so falling back to it understates the requirement rather than overstating it
 * — which yields a confident pass on a label that will not scan. Gate any
 * pass/fail on `hasVerifiedQuietZone` rather than consuming this blind.
 */
export const GENERAL_QUIET_ZONE: QuietZoneSpec = { leftX: 7, rightX: 7 }

/**
 * Symbology-specific quiet zones, verified against the General Specifications.
 *
 * EAN/UPC figures are GenSpec 25.0 figure 5.2.3.4-1, corroborated by symbol
 * specification table 1 (figure 5.12.3.1-1). ITF-14 is §5.3.2.2 ("The minimum
 * width of each Quiet Zone is 10X"); GS1-128 is §5.4.6.3 ("Both Quiet Zones
 * have a minimum width of 10x").
 *
 * The asymmetry is real and load-bearing: EAN-13 needs 11X on the left but only
 * 7X on the right, because the leading digit sits outside the symbol.
 *
 * CODE128, CODE39, MSI and PHARMACODE are absent deliberately — they are not
 * GS1-governed, their quiet zones come from their own ISO/IEC symbology
 * specifications, and none has been confirmed against a source document yet.
 */
const SYMBOLOGY_QUIET_ZONES: Partial<Record<SymbologyId, QuietZoneSpec>> = {
  'UPC-A': { leftX: 9, rightX: 9 },
  'UPC-E': { leftX: 9, rightX: 7 },
  'EAN-13': { leftX: 11, rightX: 7 },
  'EAN-8': { leftX: 7, rightX: 7 },
  'ITF-14': { leftX: 10, rightX: 10 },
  'GS1-128': { leftX: 10, rightX: 10 },
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
