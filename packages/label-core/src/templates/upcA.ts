/**
 * The UPC-A retail label — the one label type phase 2 builds.
 *
 * A template is the shape of a label: which elements exist, and where they
 * anchor. It carries no millimetres of its own beyond the stock it is printed
 * on. Resolving it against data and a stock produces the geometry.
 *
 * Deliberately one type. Preview == print is the property this phase exists to
 * establish, and proving it on a single well-understood symbol is worth more
 * than three label types that are each plausibly wrong.
 */

import { EAN_UPC_NOMINAL_X_DIMENSION_MM } from '../geometry/symbol'

/** Stable element identifiers, so a finding can point at geometry. */
export const UPC_A_ELEMENTS = {
  symbol: 'upca-symbol',
  border: 'label-border',
} as const

/**
 * The physical substrate. Every label is printed on something, and its
 * dimensions bound everything placed on it.
 */
export interface LabelStock {
  widthMm: number
  heightMm: number
  /** Keep-clear margin at every edge. */
  marginMm: number
}

export interface UpcALabelData {
  /** Eleven digits; the twelfth is computed. */
  gtinPayload: string
  /**
   * Symbol size as a multiple of the nominal X-dimension. GenSpec figure
   * 5.12.3.1-1 permits 0.8 to 2.0 for the EAN/UPC family.
   */
  magnification?: number
  /** Overrides the specification's nominal bar height when a pack demands it. */
  barHeightMm?: number
}

/**
 * A usable starting point for the human-readable digits — **not a standard.**
 *
 * GenSpec §4.14.2 requires the HRI to be present but the sections verified so
 * far do not tabulate a minimum type size, so these millimetres are a legible
 * default rather than a regulated one. An earlier version of this file claimed
 * the size was "deliberately not defaulted" and then defaulted it anyway, with
 * no way for a caller to override; the honest position is to default it, say
 * plainly that it is unverified, and let it be replaced.
 *
 * `bandMm` exceeds `fontSizeMm` so the digits have room to rise above their
 * baseline without reaching into the bars.
 */
export const UPC_A_HRI_DEFAULT = {
  fontFamily: 'IBM Plex Mono',
  fontSizeMm: 2.75,
  bandMm: 3.2,
} as const

/**
 * The default digit styling scaled to a magnification.
 *
 * A real EAN/UPC human-readable interpretation grows with its symbol. Holding
 * the type size fixed leaves a 2x symbol wearing digits sized for the nominal
 * one — which misrepresents what a printed pack carries, and previously differed
 * between the print-test sheet and the API export because only the sheet scaled
 * them.
 */
export function upcAHriFor(magnification: number) {
  return {
    fontFamily: UPC_A_HRI_DEFAULT.fontFamily,
    fontSizeMm: UPC_A_HRI_DEFAULT.fontSizeMm * magnification,
    bandMm: UPC_A_HRI_DEFAULT.bandMm * magnification,
  }
}

/** A 60 x 40 mm stock, comfortably larger than a nominal UPC-A's 37.29 mm. */
export const DEFAULT_UPC_A_STOCK: LabelStock = {
  widthMm: 60,
  heightMm: 40,
  marginMm: 3,
}

export const NOMINAL_X_DIMENSION_MM = EAN_UPC_NOMINAL_X_DIMENSION_MM
