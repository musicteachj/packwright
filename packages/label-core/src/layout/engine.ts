/**
 * The layout engine — template + data + stock in, `ResolvedLayout` out.
 *
 * This is the only place in the system that decides where anything sits. Both
 * renderers consume what it produces and neither computes a position of its
 * own, which is what makes preview == print structural rather than a property
 * two code paths have to keep agreeing on.
 *
 * It is also what the rule engine will measure in phase 3. A rule asks the
 * resolved geometry where the symbol ended up, not the template where it was
 * asked to go — so a symbol that had to shrink to fit is judged as printed
 * rather than as intended.
 */

import {
  GUARD_BAR_EXTENSION_MODULES,
  MAX_MAGNIFICATION,
  MIN_MAGNIFICATION,
  barPatternWidthMm,
  isMagnificationInRange,
  magnificationToXDimensionMm,
  nominalBarHeightMm,
  quietZoneFor,
} from '../geometry/symbol'
import type { HriStyle } from '../symbology/layOutSymbol'
import { layOutSymbol } from '../symbology/layOutSymbol'
import type { LabelStock, UpcALabelData } from '../templates/upcA'
import { UPC_A_ELEMENTS, upcAHriFor } from '../templates/upcA'
import type { ResolvedLayout } from './types'

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
   * Human-readable digit styling. Defaults to `UPC_A_HRI_DEFAULT`, whose type
   * size is a legible choice rather than a regulated minimum — pass your own to
   * override it. `false` omits the digits entirely, which GS1 does not permit
   * at point of sale but which is useful for proofs.
   */
  hri?: HriStyle | false
}

export function layOutUpcALabel(bwip: BwipRenderer, request: UpcALayoutRequest): ResolvedLayout {
  const { data, stock } = request
  const magnification = data.magnification ?? 1
  const hri = request.hri === false ? undefined : (request.hri ?? upcAHriFor(magnification))

  if (!isMagnificationInRange(magnification)) {
    throw new LayoutError(
      `Magnification ${magnification} is outside the ${MIN_MAGNIFICATION}–${MAX_MAGNIFICATION} ` +
        'range the specification permits for the EAN/UPC family.',
    )
  }

  const xDimensionMm = magnificationToXDimensionMm(magnification)

  // Sized before placing, from the tabulated metrics rather than from a trial
  // render. The symbol used to be encoded twice — once to measure and once to
  // position — but every figure needed for the footprint is already known from
  // the specification, so measuring cost an encode and told us nothing new.
  const bars = barPatternWidthMm('UPC-A', xDimensionMm)
  const nominalHeight = nominalBarHeightMm('UPC-A', xDimensionMm)
  if (bars === undefined || nominalHeight === undefined) {
    throw new LayoutError('UPC-A has no verified metrics, so it cannot be laid out.')
  }

  const quietZone = quietZoneFor('UPC-A')
  const footprintWidthMm = bars + (quietZone.leftX + quietZone.rightX) * xDimensionMm
  // Height scales with the symbol; see `nominalBarHeightMm`. Taking the nominal
  // figure unscaled drew a 2x symbol at half the required height.
  const barHeightMm = data.barHeightMm ?? nominalHeight
  const drawnHeightMm =
    barHeightMm + GUARD_BAR_EXTENSION_MODULES * xDimensionMm + (hri?.bandMm ?? 0)

  const availableWidthMm = stock.widthMm - stock.marginMm * 2
  const availableHeightMm = stock.heightMm - stock.marginMm * 2

  if (footprintWidthMm > availableWidthMm || drawnHeightMm > availableHeightMm) {
    throw new LayoutError(
      `A UPC-A at ${magnification}x needs ${footprintWidthMm.toFixed(2)} x ` +
        `${drawnHeightMm.toFixed(2)} mm including quiet zones, but the stock leaves only ` +
        `${availableWidthMm.toFixed(2)} x ${availableHeightMm.toFixed(2)} mm inside its margins. ` +
        'Shrinking the symbol to fit would silently break the quiet zone, so it is refused instead.',
    )
  }

  const placed = layOutSymbol(bwip as never, {
    symbology: 'UPC-A',
    payload: data.gtinPayload,
    xDimensionMm,
    xMm: (stock.widthMm - footprintWidthMm) / 2,
    yMm: (stock.heightMm - drawnHeightMm) / 2,
    elementId: UPC_A_ELEMENTS.symbol,
    ...(data.barHeightMm === undefined ? {} : { barHeightMm: data.barHeightMm }),
    ...(hri ? { hri } : {}),
  })

  return {
    widthMm: stock.widthMm,
    heightMm: stock.heightMm,
    primitives: placed.primitives,
    symbols: [placed.symbol],
  }
}
