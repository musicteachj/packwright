/**
 * How much blank space a symbol actually has, as opposed to how much it needs.
 *
 * The quiet zone is the most frequently violated rule in the General
 * Specifications, and it is violated precisely because it is invisible: it is
 * blank space, so artwork reclaims it without anyone realising it was
 * load-bearing. The symbol then fails at the till rather than in proof.
 *
 * Catching that requires measuring the drawn label rather than restating the
 * specification. `requiredQuietZoneLeftMm` is `9 * X` and is true of every
 * UPC-A ever drawn; what this module computes is what *this* label leaves blank,
 * which is the only figure that can fail.
 */

import type { ElementId, PlacedSymbol, ResolvedElement } from './types'

export interface ClearSpace {
  clearSpaceLeftMm: number
  clearSpaceRightMm: number
  /**
   * Elements drawn over the bar pattern itself.
   *
   * A separate fact from clear space, and it has to be, because the two are
   * independent: a block of artwork in the middle of a symbol destroys it while
   * leaving both quiet zones untouched. Measuring only left and right reported
   * that label as fully compliant — six passes and no findings — on a barcode
   * with ink through the middle of it, which is the exact false pass this engine
   * exists to prevent.
   */
  overprintedBy: ElementId[]
}

/** Half-open interval overlap. Two boxes that merely touch do not overlap. */
function overlapsVertically(
  aTopMm: number,
  aBottomMm: number,
  bTopMm: number,
  bBottomMm: number,
): boolean {
  return aTopMm < bBottomMm && bTopMm < aBottomMm
}

/**
 * Measures the blank space either side of a symbol's bar pattern.
 *
 * Two decisions are worth stating, because both are easy to get subtly wrong and
 * neither announces itself in a passing test:
 *
 * **The symbol's own boxes are excluded.** An EAN/UPC prints its first digit in
 * the left quiet zone and its check digit in the right — that is the printed
 * convention, and it is why those zones must stay clear of *other* artwork. Count
 * the symbol's own human-readable digits as encroachment and every conformant
 * UPC-A fails.
 *
 * **The band is the full drawn height, not the bars alone.** The digits sitting
 * in the quiet zone need the same clearance the bars do, so artwork level with
 * them intrudes just as surely.
 *
 * A negative result means the bars themselves are being drawn over or run off
 * the label; it is deliberately not clamped to zero, because "the quiet zone is
 * 0 mm" and "the symbol is 4 mm off the edge of the stock" are different
 * problems and the caller should be able to tell them apart.
 */
export function measureClearSpace(options: {
  symbol: PlacedSymbol
  elements: readonly ResolvedElement[]
  labelWidthMm: number
}): ClearSpace {
  const { symbol, elements, labelWidthMm } = options

  const barsLeftMm = symbol.xMm
  const barsRightMm = symbol.xMm + symbol.barPatternWidthMm
  // Two bands, deliberately. Clear space is measured against everything the
  // symbol draws, because the human-readable digits sit inside the quiet zone
  // and need the same clearance the bars do. Overprinting is measured against
  // the bar ink alone, because artwork level with the digits does not destroy
  // the symbol — and treating it as though it did suppressed real violations.
  const bandTopMm = symbol.yMm
  const bandBottomMm = symbol.yMm + symbol.drawnHeightMm
  const barsBottomMm = symbol.yMm + symbol.guardBarHeightMm

  // The trim edges are the outermost obstruction: past them there is no label.
  let leftBoundaryMm = 0
  let rightBoundaryMm = labelWidthMm
  const overprintedBy: ElementId[] = []

  for (const element of elements) {
    if (element.elementId === symbol.elementId) continue

    const { xMm, yMm, widthMm, heightMm } = element.box
    if (!overlapsVertically(bandTopMm, bandBottomMm, yMm, yMm + heightMm)) continue
    if (!Number.isFinite(xMm) || !Number.isFinite(widthMm)) continue

    const elementRightMm = xMm + widthMm

    // Any horizontal overlap with the bar pattern at all. Not a quiet-zone
    // matter — the quiet zones either side may be perfectly clear — so it is
    // recorded rather than folded into the measurement.
    if (
      xMm < barsRightMm &&
      elementRightMm > barsLeftMm &&
      overlapsVertically(bandTopMm, barsBottomMm, yMm, yMm + heightMm)
    ) {
      overprintedBy.push(element.elementId)
    }

    // Clamped to the bar pattern's own edges, so an element drawn *across* the
    // bars reports a quiet zone of zero rather than a negative width that would
    // be indistinguishable from the symbol hanging off the stock.
    // Ink that falls entirely outside the trim is deliberately ignored: it is
    // not printed, so it obstructs nothing. A review flagged this as a dropped
    // obstruction; it is the correct answer for artwork the press never puts on
    // the label. Artwork that straddles the edge still counts, via its right
    // edge landing inside.
    if (xMm < barsLeftMm) {
      leftBoundaryMm = Math.max(leftBoundaryMm, Math.min(elementRightMm, barsLeftMm))
    }
    if (elementRightMm > barsRightMm) {
      rightBoundaryMm = Math.min(rightBoundaryMm, Math.max(xMm, barsRightMm))
    }
  }

  return {
    clearSpaceLeftMm: barsLeftMm - leftBoundaryMm,
    clearSpaceRightMm: rightBoundaryMm - barsRightMm,
    overprintedBy,
  }
}
