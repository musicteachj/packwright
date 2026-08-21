/**
 * bwip-js adapter — turns a barcode into positioned millimetre primitives.
 *
 * bwip-js owns what it should own: which bars a payload produces, and how wide
 * each one is in modules. We own every millimetre, because the physical
 * dimensions are the regulated part and they trace to constants verified against
 * the General Specifications.
 *
 * Two findings shaped this, both established by probing the library rather than
 * assumed:
 *
 * 1. At `scale: 1` one bwip-js unit is exactly one module. A UPC-A bar pattern
 *    comes back spanning exactly 95 units, matching the 95 modules implied by
 *    GenSpec figure 5.2.3.5-1. So `mm = units x xDimensionMm`, and the geometry
 *    traces to `EAN_UPC_NOMINAL_X_DIMENSION_MM` rather than a library default.
 *
 * 2. bwip-js's `height` option is in millimetres but converts at 72 units per
 *    inch — it treats a unit as a point, while horizontally a unit is a module.
 *    Those are two different unit systems in one call, so its vertical output is
 *    never used. Bar heights come from `symbolMetricsFor` instead.
 *
 * The symbol is requested with `includetext: false`. That is not a decision to
 * omit the human-readable digits — we draw those ourselves, in the label's own
 * typeface. It is because bwip-js's text metrics feed back into its bar
 * positions: supplying different metrics moves the bars. With text off, the bar
 * pattern is byte-identical regardless of any font, which is the determinism a
 * print-accurate renderer needs.
 */

import type { SymbolStructure } from '../geometry/symbol'
import {
  GUARD_BAR_EXTENSION_MODULES,
  barPatternWidthMm,
  quietZoneFor,
  nominalBarHeightMm,
  symbolMetricsFor,
  symbolStructureFor,
} from '../geometry/symbol'
import { appendCheckDigit } from '../gs1/checkDigit'
import type { LayoutPrimitive, RectPrimitive, ResolvedSymbol } from '../layout/types'
import type { SymbologyId } from '../types/index'
import { getSymbologyConstraints, validatePayload } from './constraints'

export class SymbolLayoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SymbolLayoutError'
  }
}

export interface SymbolRequest {
  symbology: SymbologyId
  /** The payload as a user types it, excluding any check digit the encoder adds. */
  payload: string
  xDimensionMm: number
  /** Top-left of the whole symbol footprint, quiet zones included. */
  xMm: number
  yMm: number
  elementId: string
  /** Defaults to the specification's nominal height for the symbology. */
  barHeightMm?: number
  /**
   * Draws the human-readable interpretation beneath the symbol.
   *
   * GenSpec §4.14.2 requires it — "For EAN/UPC barcodes the HRI SHALL show the
   * GTIN-8, GTIN-12, or GTIN-13 and SHALL be placed below the barcode" — but the
   * sections verified so far do not tabulate a minimum type size for it; the
   * dimensioned drawings in §5.2.6.6 are images rather than extractable text. So
   * the size is the caller's to supply and is deliberately not defaulted. When a
   * source for the minimum is confirmed, it becomes a rule rather than a guess.
   */
  hri?: HriStyle
}

export interface HriStyle {
  /**
   * Em size, the number a renderer is given — not cap height and not x-height.
   * See the note on `TextPrimitive.fontSizeMm`.
   */
  fontSizeMm: number
  fontFamily: string
  /**
   * Vertical space reserved for the digits, measured from the bottom of the
   * guard bars. The baseline is placed at the *bottom* of that band, so the
   * glyphs grow upward into space that has been set aside for them.
   *
   * It must be at least the font's ascent. That is the caller's to know,
   * because the caller chose the font — we have no metrics for it here. An
   * earlier version positioned the baseline a fixed gap below the bars, which
   * put the digits 1.3 mm *into* the bar pattern, since glyphs rise above their
   * baseline rather than hanging below it.
   */
  bandMm: number
}

export interface LaidOutSymbol {
  primitives: LayoutPrimitive[]
  symbol: ResolvedSymbol
  /** Full footprint including both quiet zones — what a layout must reserve. */
  footprintWidthMm: number
  footprintHeightMm: number
}

/** One bar as bwip-js reports it, in module units. */
interface RawBar {
  centreModule: number
  widthModules: number
}

/**
 * The subset of bwip-js this adapter uses.
 *
 * Declared structurally rather than imported as a type so the dependency stays
 * one-way: the adapter states what it needs, and bwip-js happens to satisfy it.
 */
interface BwipRenderer {
  render<T>(options: Record<string, unknown>, drawing: BwipDrawingContext<T>): T
}

interface BwipDrawingContext<T> {
  scale(sx: number, sy: number): [number, number] | null
  measure(
    str: string,
    font: string,
    fwidth: number,
    fheight: number,
  ): { width: number; ascent: number; descent: number }
  init(width: number, height: number): void
  line(x0: number, y0: number, x1: number, y1: number, lw: number, rgb: string): void
  polygon(pts: Array<[number, number]>): void
  hexagon(pts: unknown): void
  ellipse(x: number, y: number, rx: number, ry: number, ccw: boolean): void
  fill(rgb: string): void
  text(x: number, y: number, str: string, rgb: string, font: unknown): void
  end(): T
}

/**
 * Collects bwip-js drawing calls as bars in module units.
 *
 * Only `line` carries information here: for a linear symbology bwip-js draws
 * each bar as one stroked orthogonal line, so a bar is the stroke width centred
 * on `x0`. The 2D primitives throw rather than no-op — a DataMatrix routed
 * through this adapter would otherwise render as a blank rectangle, which is
 * a far worse failure than an error.
 */
function createBarCollector(): BwipDrawingContext<RawBar[]> & { bars: RawBar[] } {
  const bars: RawBar[] = []
  const reject = (primitive: string) => (): never => {
    throw new SymbolLayoutError(
      `This adapter handles linear symbologies only; bwip-js emitted a ${primitive}. ` +
        'Two-dimensional symbologies need their own module-grid handling.',
    )
  }

  return {
    bars,
    scale: () => null,
    // Never consulted: the symbol is rendered with text off precisely so that
    // font metrics cannot influence bar geometry.
    measure: () => ({ width: 0, ascent: 0, descent: 0 }),
    init: () => {},
    line: (x0, _y0, x1, _y1, lw) => {
      // Bars are vertical. ITF-14 draws horizontal bearer bars through the same
      // callback, and counting one as a bar would corrupt the module span that
      // the whole millimetre calibration is measured against.
      if (x0 !== x1) return
      bars.push({ centreModule: x0, widthModules: lw })
    },
    polygon: reject('polygon'),
    hexagon: reject('hexagon'),
    ellipse: reject('ellipse'),
    fill: () => {},
    text: () => {},
    end: () => bars,
  }
}

/**
 * Positions the human-readable digits beneath an EAN/UPC symbol.
 *
 * The grouping is the printed convention, not an invention: a UPC-A reads
 * `0 36000 29145 2`. The first digit sits in the left quiet zone and the check
 * digit in the right, which is why those zones have to stay clear of artwork —
 * they are carrying type. The two middle groups of five centre beneath their
 * respective data areas, whose module ranges come from `symbolStructureFor`.
 *
 * The digits are emitted as text rather than outlined to paths, so the exported
 * PDF has selectable text and the browser canvas an accessible DOM.
 */
function layOutHri(options: {
  value: string
  structure: SymbolStructure
  hri: HriStyle
  xDimensionMm: number
  barsLeftMm: number
  barPatternMm: number
  baselineYMm: number
  elementId: string
}): LayoutPrimitive[] {
  const { value, structure, hri, xDimensionMm, barsLeftMm, barPatternMm, baselineYMm, elementId } =
    options
  const { leading, groups, trailing } = structure.hri

  const expected = leading + groups.reduce((sum, size) => sum + size, 0) + trailing
  if (expected !== value.length) {
    throw new SymbolLayoutError(
      `The human-readable grouping accounts for ${expected} digits but "${value}" has ${value.length}.`,
    )
  }

  const base = {
    kind: 'text' as const,
    fontSizeMm: hri.fontSizeMm,
    fontFamily: hri.fontFamily,
    fill: '000000',
    baselineYMm,
    elementId,
  }

  // A quarter of the X-dimension of air between the digits and the bars, so a
  // digit sitting in a quiet zone does not touch the symbol.
  const outerGapMm = xDimensionMm / 4
  const primitives: LayoutPrimitive[] = []
  let cursor = 0

  if (leading > 0) {
    primitives.push({
      ...base,
      xMm: barsLeftMm - outerGapMm,
      text: value.slice(0, leading),
      anchor: 'end',
    })
    cursor = leading
  }

  groups.forEach((size, index) => {
    const area = structure.dataGroups[index]
    if (!area) {
      // Returning here would skip the cursor advance and silently mis-slice
      // every later group and the trailing digit — printed digits that do not
      // match the encoded value, which is the one outcome this engine may never
      // produce quietly.
      throw new SymbolLayoutError(
        `${structure.hri.groups.length} human-readable groups were declared but only ` +
          `${structure.dataGroups.length} data areas exist.`,
      )
    }
    primitives.push({
      ...base,
      xMm: barsLeftMm + ((area.startModule + area.endModule) / 2) * xDimensionMm,
      text: value.slice(cursor, cursor + size),
      anchor: 'middle',
    })
    cursor += size
  })

  if (trailing > 0) {
    primitives.push({
      ...base,
      xMm: barsLeftMm + barPatternMm + outerGapMm,
      text: value.slice(cursor),
      anchor: 'start',
    })
  }

  return primitives
}

/**
 * Lays a barcode out in millimetres, ready for either renderer.
 *
 * `bwip` is injected rather than imported so this stays testable without the
 * library and so `label-core` keeps a single, explicit seam to it.
 */
export function layOutSymbol(bwip: BwipRenderer, request: SymbolRequest): LaidOutSymbol {
  const { symbology, payload, xDimensionMm, xMm, yMm, elementId } = request

  if (!(xDimensionMm > 0)) {
    throw new SymbolLayoutError(`X-dimension must be positive, received ${xDimensionMm}`)
  }

  const constraints = getSymbologyConstraints(symbology)
  if (!constraints) throw new SymbolLayoutError(`Unknown symbology "${symbology}"`)

  const reason = validatePayload(symbology, payload)
  if (reason) throw new SymbolLayoutError(reason)

  const metrics = symbolMetricsFor(symbology)
  if (!metrics) {
    throw new SymbolLayoutError(
      `No verified module count or nominal height for ${symbology}. ` +
        'Only the fixed-length EAN/UPC family is tabulated so far.',
    )
  }

  const structure = symbolStructureFor(symbology)
  if (!structure) {
    throw new SymbolLayoutError(
      `${symbology} has verified metrics but no guard/data structure, so its guard bars and ` +
        'human-readable digits cannot be positioned. Add it to SYMBOL_STRUCTURES.',
    )
  }

  // The full key, so the recorded value matches what a scanner reads. Computed
  // with our own check-digit routine and handed to bwip-js complete, which makes
  // bwip-js validate it — if the two disagree about the check digit, it throws
  // rather than silently encoding a different identifier.
  const value = constraints.appendsCheckDigit ? appendCheckDigit(payload) : payload

  const collector = createBarCollector()
  bwip.render({ bcid: constraints.bwipId, text: value, includetext: false, scale: 1 }, collector)
  const bars = collector.bars
  if (bars.length === 0) {
    throw new SymbolLayoutError(`bwip-js produced no bars for ${symbology} "${value}"`)
  }

  // Normalise so the bar pattern starts at module zero. bwip-js applies its own
  // padding, which differs from the specification's quiet zones, so its origin
  // is discarded and ours applied below.
  const leftmostModule = Math.min(...bars.map((bar) => bar.centreModule - bar.widthModules / 2))

  const expectedBarModules = (barPatternWidthMm(symbology, 1) as number) * 1
  const actualBarModules =
    Math.max(...bars.map((bar) => bar.centreModule + bar.widthModules / 2)) - leftmostModule
  if (Math.abs(actualBarModules - expectedBarModules) > 1e-9) {
    throw new SymbolLayoutError(
      `${symbology} bar pattern came back ${actualBarModules} modules wide, ` +
        `but the specification requires ${expectedBarModules}. The unit calibration is wrong.`,
    )
  }

  const quietZone = quietZoneFor(symbology)
  const quietZoneLeftMm = quietZone.leftX * xDimensionMm
  const quietZoneRightMm = quietZone.rightX * xDimensionMm
  const barHeightMm = request.barHeightMm ?? (nominalBarHeightMm(symbology, xDimensionMm) as number)
  const guardHeightMm = barHeightMm + GUARD_BAR_EXTENSION_MODULES * xDimensionMm

  const barsLeftMm = xMm + quietZoneLeftMm
  const isGuard = (startModule: number, endModule: number) =>
    structure.guards.some(
      (guard) => startModule >= guard.startModule - 1e-9 && endModule <= guard.endModule + 1e-9,
    )

  const primitives: LayoutPrimitive[] = bars.map((bar): RectPrimitive => {
    const startModule = bar.centreModule - bar.widthModules / 2 - leftmostModule
    const endModule = startModule + bar.widthModules
    return {
      kind: 'rect',
      xMm: barsLeftMm + startModule * xDimensionMm,
      yMm,
      widthMm: bar.widthModules * xDimensionMm,
      heightMm: isGuard(startModule, endModule) ? guardHeightMm : barHeightMm,
      fill: '000000',
      elementId,
    }
  })

  const barPatternMm = expectedBarModules * xDimensionMm

  const hriBandMm = request.hri?.bandMm ?? 0
  if (request.hri) {
    primitives.push(
      ...layOutHri({
        value,
        structure,
        hri: request.hri,
        xDimensionMm,
        barsLeftMm,
        barPatternMm,
        // Baseline at the bottom of the reserved band, so glyphs grow upward
        // into space set aside for them rather than into the bars.
        baselineYMm: yMm + guardHeightMm + hriBandMm,
        elementId,
      }),
    )
  }

  return {
    primitives,
    symbol: {
      elementId,
      symbology,
      value,
      xDimensionMm,
      barPatternWidthMm: barPatternMm,
      barHeightMm,
      xMm: barsLeftMm,
      yMm,
      quietZoneLeftMm,
      quietZoneRightMm,
    },
    footprintWidthMm: quietZoneLeftMm + barPatternMm + quietZoneRightMm,
    footprintHeightMm: guardHeightMm + hriBandMm,
  }
}
