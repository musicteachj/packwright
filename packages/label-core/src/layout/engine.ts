/**
 * The layout engine — template + data + stock in, `ResolvedLayout` out.
 *
 * This is the only place in the system that decides where anything sits. Both
 * renderers consume what it produces and neither computes a position of its
 * own, which is what makes preview == print structural rather than a property
 * two code paths have to keep agreeing on.
 *
 * It is also what the rules measure. A rule asks the resolved geometry where the
 * symbol ended up, not the template where it was asked to go.
 *
 * **It resolves; it does not judge.** An earlier version refused to lay out a
 * symbol whose quiet zone would not fit, on the reasoning that silently
 * shrinking it would be worse. Refusing is worse still, for a reason that only
 * shows up one layer up: a label that cannot be resolved cannot be measured, so
 * the quiet-zone rule had nothing to run against and could never fail. Every
 * rule in this project ships with a known-bad fixture, and there were no
 * known-bad labels to write one from. So the engine now draws what it was asked
 * for — off the edge of the stock if that is what the inputs describe — and
 * `rules/` says what is wrong with it, with a citation.
 *
 * What survives as a `LayoutError` is input that describes no drawing at all: a
 * magnification of zero, a stock with no area, a GTIN that is not a GTIN.
 */

import {
  GUARD_BAR_EXTENSION_MODULES,
  barPatternWidthMm,
  magnificationToXDimensionMm,
  nominalBarHeightMm,
  quietZoneFor,
} from '../geometry/symbol'
import { isValidCheckDigit } from '../gs1/checkDigit'
import type { HriStyle } from '../symbology/layOutSymbol'
import { layOutSymbol } from '../symbology/layOutSymbol'
import type { LabelStock, UpcALabelData } from '../templates/upcA'
import { ARTWORK_DEFAULT, UPC_A_ELEMENTS, anchorBox, panelFor, upcAHriFor } from '../templates/upcA'
import { measureClearSpace } from './clearSpace'
import type {
  LayoutOmission,
  LayoutPrimitive,
  ResolvedElement,
  ResolvedLayout,
  ResolvedSymbol,
} from './types'

export class LayoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LayoutError'
  }
}

/** The slice of bwip-js the engine passes through to the symbol adapter. */
interface BwipRenderer {
  render<T>(options: Record<string, unknown>, drawing: T): unknown
}

export interface UpcALayoutRequest {
  data: UpcALabelData
  stock: LabelStock
  /**
   * Human-readable digit styling. Defaults to `upcAHriFor(magnification)`, whose
   * type size is a legible choice rather than a regulated minimum — pass your
   * own to override it. To omit the digits entirely, set `data.omitHri`, which
   * the rules then report against GenSpec §4.14.2.
   */
  hri?: HriStyle
}

const GTIN_12 = /^[0-9]{12}$/

export function layOutUpcALabel(bwip: BwipRenderer, request: UpcALayoutRequest): ResolvedLayout {
  const { data, stock } = request
  const magnification = data.magnification ?? 1

  if (!Number.isFinite(magnification) || magnification <= 0) {
    throw new LayoutError(
      `Magnification must be a positive number, received ${magnification}. ` +
        'A magnification outside the specification’s 0.8–2.0 range is drawn as asked and ' +
        'reported by the rules; one that is zero or negative describes no symbol at all.',
    )
  }

  if (
    !Number.isFinite(stock.widthMm) ||
    !Number.isFinite(stock.heightMm) ||
    stock.widthMm <= 0 ||
    stock.heightMm <= 0
  ) {
    throw new LayoutError(
      `Stock must have positive finite dimensions, received ${stock.widthMm} x ${stock.heightMm} mm.`,
    )
  }

  // The margin is as load-bearing as the dimensions — `panelFor` and `anchorBox`
  // derive every coordinate from it. Left unchecked, a cleared form field
  // arrives as `''`, string-concatenates through the arithmetic, and the rail
  // prints "the left quiet zone measures NaN mm" under a real GS1 citation while
  // the renderer throws on a coordinate that is not a number.
  if (!Number.isFinite(stock.marginMm) || stock.marginMm < 0) {
    throw new LayoutError(
      `Stock margin must be a finite, non-negative number, received ${stock.marginMm}.`,
    )
  }

  if (
    data.barHeightMm !== undefined &&
    (!Number.isFinite(data.barHeightMm) || data.barHeightMm <= 0)
  ) {
    // A negative bar height inverted the band handed to `measureClearSpace`, so
    // no element ever overlapped it and a genuine quiet-zone violation came back
    // as two passes.
    throw new LayoutError(
      `Bar height must be a positive finite number, received ${data.barHeightMm}.`,
    )
  }

  if (data.artwork) {
    const { widthMm, heightMm } = data.artwork
    if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
      throw new LayoutError(
        `Artwork must have positive finite dimensions, received ${widthMm} x ${heightMm} mm.`,
      )
    }
  }

  if (!GTIN_12.test(data.gtin)) {
    throw new LayoutError(
      `A GTIN-12 is exactly twelve digits, received "${data.gtin}". ` +
        'Use `completeGtin` to derive the check digit from eleven.',
    )
  }

  const xDimensionMm = magnificationToXDimensionMm(magnification)
  const panel = panelFor(stock)

  const primitives: LayoutPrimitive[] = []
  const elements: ResolvedElement[] = []
  const omissions: LayoutOmission[] = []

  // Placed before the symbol because the symbol's clear space is measured
  // against it — and because a brand block crowding a barcode is the ordinary
  // way a real quiet zone gets lost.
  if (data.artwork) {
    const { text, anchor, widthMm, heightMm } = data.artwork
    const fontSizeMm = data.artwork.fontSizeMm ?? ARTWORK_DEFAULT.fontSizeMm
    const fontFamily = data.artwork.fontFamily ?? ARTWORK_DEFAULT.fontFamily
    const { xMm, yMm } = anchorBox(anchor, panel, widthMm, heightMm)

    elements.push({
      elementId: UPC_A_ELEMENTS.artwork,
      label: 'Artwork block',
      box: { xMm, yMm, widthMm, heightMm },
    })

    primitives.push({
      kind: 'text',
      xMm,
      // Glyphs rise above their baseline rather than hanging below it, so the
      // baseline sits one em down from the top of the box. That over-reserves
      // slightly for most faces, which is the safe direction: type stays inside
      // the box the element was allocated.
      baselineYMm: yMm + fontSizeMm,
      text,
      fontSizeMm,
      fontFamily,
      fill: '000000',
      anchor: 'start',
      elementId: UPC_A_ELEMENTS.artwork,
    })
  }

  const symbols: ResolvedSymbol[] = []

  if (!isValidCheckDigit(data.gtin)) {
    // No encoder will produce this symbol — bwip-js rejects it outright with
    // `upcAbadCheckDigit`, and it is right to. A UPC-A's twelfth digit *is* the
    // check digit, so a GTIN whose digit is wrong describes a barcode that
    // cannot exist. Recording the omission keeps the rest of the label
    // resolvable and hands the verdict, and the citation, to `rules/`.
    omissions.push({
      elementId: UPC_A_ELEMENTS.symbol,
      reason: `The GTIN ${data.gtin} has an invalid check digit, so no UPC-A symbol can encode it.`,
    })
  } else {
    const bars = barPatternWidthMm('UPC-A', xDimensionMm)
    const nominalHeight = nominalBarHeightMm('UPC-A', xDimensionMm)
    if (bars === undefined || nominalHeight === undefined) {
      throw new LayoutError('UPC-A has no verified metrics, so it cannot be laid out.')
    }

    const hri = data.omitHri ? undefined : (request.hri ?? upcAHriFor(magnification))
    const quietZone = quietZoneFor('UPC-A')
    const footprintWidthMm = bars + (quietZone.leftX + quietZone.rightX) * xDimensionMm
    // Height scales with the symbol; see `nominalBarHeightMm`. Taking the
    // nominal figure unscaled drew a 2x symbol at half the required height.
    const barHeightMm = data.barHeightMm ?? nominalHeight
    const drawnHeightMm =
      barHeightMm + GUARD_BAR_EXTENSION_MODULES * xDimensionMm + (hri?.bandMm ?? 0)

    const placement = anchorBox(
      data.symbolPlacement ?? 'centre',
      panel,
      footprintWidthMm,
      drawnHeightMm,
    )

    // The eleven data digits. The encoder appends the twelfth itself, and it
    // recomputes to the same digit we just verified — so the symbol encodes the
    // GTIN as supplied rather than a corrected version of it.
    const placed = layOutSymbol(bwip as never, {
      symbology: 'UPC-A',
      payload: data.gtin.slice(0, -1),
      xDimensionMm,
      xMm: placement.xMm,
      yMm: placement.yMm,
      elementId: UPC_A_ELEMENTS.symbol,
      ...(data.barHeightMm === undefined ? {} : { barHeightMm: data.barHeightMm }),
      ...(hri ? { hri } : {}),
    })

    primitives.push(...placed.primitives)
    elements.push(placed.element)

    // Vertical containment is measured here rather than in `measureClearSpace`,
    // which only ever knew the label's width. Nothing checked it, so a symbol
    // drawn off the top and bottom of its stock reported every check passing.
    const topOverflowMm = Math.max(0, -placed.symbol.yMm)
    const bottomOverflowMm = Math.max(
      0,
      placed.symbol.yMm + placed.symbol.drawnHeightMm - stock.heightMm,
    )

    symbols.push({
      ...placed.symbol,
      ...measureClearSpace({
        symbol: placed.symbol,
        elements,
        labelWidthMm: stock.widthMm,
      }),
      verticalOverflowMm: Math.max(topOverflowMm, bottomOverflowMm),
    })
  }

  return {
    widthMm: stock.widthMm,
    heightMm: stock.heightMm,
    primitives,
    elements,
    symbols,
    omissions,
  }
}
