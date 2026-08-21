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

export interface SymbolMetrics {
  /**
   * Total symbol length in modules **including** both minimum quiet zones.
   * This is the figure the specification tabulates, and the one most easily
   * mistaken for the bar-pattern width.
   */
  totalModules: number
  /** Nominal height of the bars, in mm, at the nominal X-dimension. */
  nominalHeightMm: number
}

/**
 * Per-symbology module counts and nominal heights, from the General
 * Specifications.
 *
 * Module counts are GenSpec 25.0 figure 5.2.3.5-1, whose preamble is the part
 * that catches people out: "The symbol length in modules, **including the
 * minimum Quiet Zones**, SHALL be as indicated." So UPC-A's 113 is the whole
 * footprint, not the bars — the bar pattern is 113 − 9 − 9 = 95 modules. Read
 * the wrong way, every symbol comes out 18 modules too wide.
 *
 * Heights are §5.2.3.2: "For EAN-13, UPC-A and UPC-E barcodes the height of the
 * symbol at the nominal size is 22.85 millimetres (0.900 inch). For EAN-8
 * barcodes the height of the symbol at the nominal size is 18.23 millimetres
 * (0.718 inch)."
 *
 * Only the EAN/UPC family is tabulated here, because it is the only family whose
 * length is fixed. ITF-14 and GS1-128 grow with their payload, so their width is
 * computed from the encoded data rather than looked up.
 */
const SYMBOL_METRICS: Partial<Record<SymbologyId, SymbolMetrics>> = {
  'UPC-A': { totalModules: 113, nominalHeightMm: 22.85 },
  'EAN-13': { totalModules: 113, nominalHeightMm: 22.85 },
  'UPC-E': { totalModules: 67, nominalHeightMm: 22.85 },
  'EAN-8': { totalModules: 81, nominalHeightMm: 18.23 },
}

export function symbolMetricsFor(symbology: SymbologyId): SymbolMetrics | undefined {
  return SYMBOL_METRICS[symbology]
}

/**
 * Bar height for a given X-dimension.
 *
 * The height scales with the symbol; it is not a fixed figure. GenSpec figure
 * 5.12.3.1-1 tabulates a minimum symbol height against each X-dimension, and for
 * UPC-A those are 18.28 mm at X = 0.264, 22.85 mm at X = 0.330, and 45.70 mm at
 * X = 0.660 — exactly 22.85 multiplied by the magnification.
 *
 * Holding the height at its nominal value instead draws a 2x symbol half as tall
 * as the specification requires. Nothing about that looks wrong: the bars are the
 * right width, the quiet zones are right, the proportions merely read as a
 * slightly squat barcode. It is non-conformant at point of sale, and it is the
 * exact shape of error this whole engine exists to make impossible.
 */
export function nominalBarHeightMm(
  symbology: SymbologyId,
  xDimensionMm: number,
): number | undefined {
  const metrics = SYMBOL_METRICS[symbology]
  if (!metrics) return undefined
  return metrics.nominalHeightMm * (xDimensionMm / EAN_UPC_NOMINAL_X_DIMENSION_MM)
}

/**
 * Width of the bar pattern alone, excluding quiet zones.
 *
 * This is the number a layout engine wants when it asks "how wide are the
 * bars" — the tabulated total is what it wants when asking "how much room does
 * this symbol need". Conflating them is a 5.94 mm error on a UPC-A, which is
 * wide enough to push a symbol off a small panel and narrow enough to look
 * plausible on screen.
 */
export function barPatternWidthMm(
  symbology: SymbologyId,
  xDimensionMm: number,
): number | undefined {
  const metrics = SYMBOL_METRICS[symbology]
  if (!metrics) return undefined
  const { leftX, rightX } = quietZoneFor(symbology)
  return (metrics.totalModules - leftX - rightX) * xDimensionMm
}

/**
 * How far the guard bars extend below the data bars, in modules.
 *
 * EAN/UPC guard patterns run longer than the data bars so the human-readable
 * digits can sit between them without crowding the symbol.
 *
 * **Not yet verified against a source.** Taken from the bwip-js reference
 * rendering, which is measuring an implementation rather than reading the
 * specification — the figure belongs in the §5.2.6.6 dimensioned drawings, and
 * those are images rather than extractable text. It is recorded here so the
 * provenance is visible rather than implied, and no rule may report a pass or
 * fail against it until a source is confirmed. Getting it wrong is cosmetic:
 * the bars still scan.
 */
export const GUARD_BAR_EXTENSION_MODULES = 5

/** A half-open module range, `[startModule, endModule)`. */
export interface ModuleRange {
  startModule: number
  endModule: number
}

export interface SymbolStructure {
  /** Guard patterns, which run longer than the data bars. */
  guards: readonly ModuleRange[]
  /** Data areas the human-readable digit groups sit beneath. */
  dataGroups: readonly ModuleRange[]
  /**
   * How the human-readable digits are split across the symbol.
   *
   * The conventions differ and are not interchangeable. A UPC-A prints
   * `0 36000 29145 2` — one digit in each quiet zone and five under each half.
   * An EAN-13 prints `5 901234 123457` — one digit in the left quiet zone, six
   * under each half, and **nothing to the right of the symbol**. Applying
   * UPC-A's shape to an EAN-13 pushes its check digit into the right quiet
   * zone, which is the one place a digit must never go.
   */
  hri: {
    /** Digits printed in the left quiet zone, before the bars. */
    leading: number
    /** Digits under each data area, in order. */
    groups: readonly number[]
    /** Digits printed in the right quiet zone, after the bars. */
    trailing: number
  }
}

/**
 * Where the guard patterns and data areas fall within the bar pattern.
 *
 * Derived from the symbol's own composition rather than measured off a
 * rendering. A UPC-A is start guard `101` (3 modules) + six characters of 7
 * modules + centre guard `01010` (5) + six more characters + end guard `101`
 * (3). That totals 3 + 42 + 5 + 42 + 3 = 95, which is exactly the bar pattern
 * width implied by GenSpec figure 5.2.3.5-1's 113-module total less the two 9X
 * quiet zones — so the arithmetic closes against the specification rather than
 * against an implementation.
 *
 * EAN-13 shares the composition; only its quiet zones differ.
 */
const TWELVE_CHARACTER_GUARDS: readonly ModuleRange[] = [
  { startModule: 0, endModule: 3 },
  { startModule: 45, endModule: 50 },
  { startModule: 92, endModule: 95 },
]

const TWELVE_CHARACTER_DATA: readonly ModuleRange[] = [
  { startModule: 3, endModule: 45 },
  { startModule: 50, endModule: 92 },
]

const SYMBOL_STRUCTURES: Partial<Record<SymbologyId, SymbolStructure>> = {
  // Twelve encoded characters either side of the centre guard. EAN-13 and UPC-A
  // share the bar layout exactly and differ only in quiet zones and in how the
  // digits are printed beneath.
  'UPC-A': {
    guards: TWELVE_CHARACTER_GUARDS,
    dataGroups: TWELVE_CHARACTER_DATA,
    hri: { leading: 1, groups: [5, 5], trailing: 1 },
  },
  'EAN-13': {
    guards: TWELVE_CHARACTER_GUARDS,
    dataGroups: TWELVE_CHARACTER_DATA,
    hri: { leading: 1, groups: [6, 6], trailing: 0 },
  },
}

export function symbolStructureFor(symbology: SymbologyId): SymbolStructure | undefined {
  return SYMBOL_STRUCTURES[symbology]
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
