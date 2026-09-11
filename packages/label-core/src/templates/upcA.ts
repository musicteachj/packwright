/**
 * The UPC-A retail label.
 *
 * A template is the shape of a label: which elements exist, and where they
 * anchor. It carries no millimetres of its own beyond the stock it is printed
 * on. Resolving it against data and a stock produces the geometry.
 *
 * Deliberately one label type. Preview == print is the property the rendering
 * spine exists to establish, and proving it on a single well-understood symbol
 * is worth more than three label types that are each plausibly wrong.
 *
 * The stock, panel and anchor kernel this builds on lives in `./stock`, since
 * every label type shares it. What is here is UPC-A's own.
 *
 * The template *owns layout* — a user positions elements by anchor, not by
 * dragging them to arbitrary coordinates. That is what lets compliance be
 * enforced rather than merely suggested. It does not mean the result is
 * compliant by construction: a symbol at 2x on small stock, or a brand block
 * anchored hard against the symbol, produces a real violation from entirely
 * ordinary inputs. Which is the point — the rules have to have something to
 * catch.
 */

import { EAN_UPC_NOMINAL_X_DIMENSION_MM } from '../geometry/symbol'
import { appendCheckDigit } from '../gs1/checkDigit'
import type { Anchor, ArtworkBlock, LabelStock } from './stock'

/** Stable element identifiers, so a finding can point at geometry. */
export const UPC_A_ELEMENTS = {
  symbol: 'upca-symbol',
  artwork: 'artwork-block',
  border: 'label-border',
} as const

/**
 * A GS1 Digital Link to be carried alongside the linear symbol.
 *
 * Held as data rather than as a finished URI so the rule engine can hand it to
 * `buildDigitalLinkUri` and report whatever that rejects, instead of a second
 * implementation of the same syntax rules drifting away from the first.
 */
export interface DigitalLinkData {
  /** Resolver origin, e.g. 'https://id.example.com'. */
  domain: string
  /** AI (10). */
  lot?: string
  /** AI (21). */
  serial?: string
  /** AI (17), YYMMDD. */
  expiry?: string
  /**
   * Emits `/gtin/` in place of `/01/`. Removed from the standard in Digital Link
   * URI Syntax 1.3.0 and reported as such — see `gs1/digitalLink.ts`.
   */
  useConvenienceAlphas?: boolean
}

export interface UpcALabelData {
  /**
   * The GTIN-12 exactly as printed on the pack — twelve digits, check digit
   * included.
   *
   * Deliberately the full key rather than the eleven digits a form used to take
   * with the twelfth computed. Computing it means the check digit is correct by
   * construction, which sounds like a feature and is in fact the removal of a
   * check: the most common real defect in a supplied GTIN is a transposed digit,
   * and an engine that recomputes the check digit silently accepts the wrong
   * product identifier. Take the number as printed and verify it.
   *
   * `completeGtin` is there for the case where a user genuinely is minting a new
   * one and has only eleven digits.
   */
  gtin: string
  /**
   * Symbol size as a multiple of the nominal X-dimension. GenSpec figure
   * 5.12.3.1-1 permits 0.8 to 2.0 for the EAN/UPC family — a value outside that
   * range is drawn as asked and reported by the rules, not refused here.
   */
  magnification?: number
  /** Overrides the specification's nominal bar height when a pack demands it. */
  barHeightMm?: number
  /**
   * Omits the human-readable digits. GenSpec §4.14.2 requires them at point of
   * sale, so this produces a reported violation; it is useful for proofs.
   */
  omitHri?: boolean
  /** Defaults to `centre`. */
  symbolPlacement?: Anchor
  artwork?: ArtworkBlock
  digitalLink?: DigitalLinkData
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

/**
 * Completes an eleven-digit payload into a GTIN-12.
 *
 * For minting a new identifier, not for accepting one off a pack — see the note
 * on `UpcALabelData.gtin`.
 */
export function completeGtin(payload: string): string {
  return appendCheckDigit(payload)
}
