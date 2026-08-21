import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import { EAN_UPC_NOMINAL_X_DIMENSION_MM, magnificationToXDimensionMm } from '../geometry/symbol'
import { SymbolLayoutError, layOutSymbol } from './layOutSymbol'

/**
 * The calibration these tests exist for.
 *
 * Every expected millimetre below comes from the General Specifications, not
 * from running the adapter: a UPC-A is 113 modules including both 9X quiet
 * zones (figure 5.2.3.5-1), so 95 modules of bars, and the nominal X-dimension
 * is 0.330 mm (§5.2.3.1). 95 x 0.33 = 31.35 mm of bars, 113 x 0.33 = 37.29 mm
 * of footprint. Bar height is the nominal 22.85 mm from §5.2.3.2.
 *
 * If bwip-js's unit space were ever misread, everything downstream would be
 * proportionally wrong and still look entirely plausible on screen. These
 * numbers are the only thing standing between that and a printed label.
 */

const UPC_A_PAYLOAD = '03600029145'
const UPC_A_GTIN = '036000291452'
const X = EAN_UPC_NOMINAL_X_DIMENSION_MM

const layOut = (overrides: Record<string, unknown> = {}) =>
  layOutSymbol(bwip as never, {
    symbology: 'UPC-A',
    payload: UPC_A_PAYLOAD,
    xDimensionMm: X,
    xMm: 0,
    yMm: 0,
    elementId: 'primary-symbol',
    ...overrides,
  })

describe('layOutSymbol calibration', () => {
  it('produces a bar pattern 31.35 mm wide at the nominal X-dimension', () => {
    const { symbol } = layOut()
    expect(symbol.barPatternWidthMm).toBeCloseTo(95 * X, 10)
    expect(symbol.barPatternWidthMm).toBeCloseTo(31.35, 10)
  })

  it('reserves a 37.29 mm footprint, matching the tabulated 113 modules', () => {
    const { footprintWidthMm } = layOut()
    expect(footprintWidthMm).toBeCloseTo(113 * X, 10)
    expect(footprintWidthMm).toBeCloseTo(37.29, 10)
  })

  it('measures the drawn bars, not just the recorded figure', () => {
    // The number above could be right while the primitives were wrong. This
    // measures the rectangles actually emitted.
    const { primitives, symbol } = layOut()
    const left = Math.min(...primitives.map((p) => (p as { xMm: number }).xMm))
    const right = Math.max(
      ...primitives.map(
        (p) => (p as { xMm: number; widthMm: number }).xMm + (p as { widthMm: number }).widthMm,
      ),
    )
    expect(left).toBeCloseTo(symbol.xMm, 10)
    expect(right - left).toBeCloseTo(31.35, 10)
  })

  it('scales linearly with magnification', () => {
    // 0.8x and 2.0x are the bounds GenSpec figure 5.12.3.1-1 permits.
    for (const magnification of [0.8, 1, 2]) {
      const xDimensionMm = magnificationToXDimensionMm(magnification)
      const { symbol, footprintWidthMm } = layOut({ xDimensionMm })
      expect(symbol.barPatternWidthMm).toBeCloseTo(95 * xDimensionMm, 10)
      expect(footprintWidthMm).toBeCloseTo(113 * xDimensionMm, 10)
    }
  })

  it('is deterministic — the same request twice gives identical primitives', () => {
    expect(JSON.stringify(layOut().primitives)).toBe(JSON.stringify(layOut().primitives))
  })
})

describe('layOutSymbol geometry', () => {
  it('places the bars after the left quiet zone', () => {
    const { symbol } = layOut({ xMm: 10 })
    // 9X at nominal is 2.97 mm, so bars start at 12.97 mm.
    expect(symbol.quietZoneLeftMm).toBeCloseTo(2.97, 10)
    expect(symbol.xMm).toBeCloseTo(12.97, 10)
  })

  it('uses the specification nominal bar height by default', () => {
    const { symbol } = layOut()
    expect(symbol.barHeightMm).toBe(22.85)
  })

  it('extends the guard bars exactly 5 modules below the data bars', () => {
    const { primitives, footprintHeightMm } = layOut()
    const heights = [...new Set(primitives.map((p) => (p as { heightMm: number }).heightMm))].sort(
      (a, b) => a - b,
    )
    expect(heights).toHaveLength(2)
    expect(heights[1]! - heights[0]!).toBeCloseTo(5 * X, 10)
    expect(footprintHeightMm).toBeCloseTo(heights[1]!, 10)
  })

  it('extends exactly six guard bars — three guard patterns of two bars each', () => {
    // Start 101, centre 01010, end 101: two dark bars per guard pattern.
    const { primitives } = layOut()
    const tallest = Math.max(...primitives.map((p) => (p as { heightMm: number }).heightMm))
    const guards = primitives.filter((p) => (p as { heightMm: number }).heightMm === tallest)
    expect(guards).toHaveLength(6)
  })

  it('records the full GTIN including the check digit it computed', () => {
    // The payload is eleven digits; the twelfth is ours, and bwip-js validates
    // it rather than computing its own.
    expect(layOut().symbol.value).toBe(UPC_A_GTIN)
  })

  it('tags every primitive with the element that produced it', () => {
    const { primitives } = layOut({ elementId: 'pdp-barcode' })
    expect(primitives.every((p) => p.elementId === 'pdp-barcode')).toBe(true)
  })
})

describe('layOutSymbol rejections', () => {
  it('rejects a payload of the wrong length before rendering anything', () => {
    expect(() => layOut({ payload: '123' })).toThrow(SymbolLayoutError)
  })

  it('rejects a non-numeric payload', () => {
    expect(() => layOut({ payload: 'ABCDEFGHIJK' })).toThrow(SymbolLayoutError)
  })

  it('rejects a non-positive X-dimension', () => {
    expect(() => layOut({ xDimensionMm: 0 })).toThrow(SymbolLayoutError)
  })

  it('refuses a symbology with no tabulated metrics', () => {
    // CODE128 has no tabulated module count and no verified quiet zone, so it
    // cannot be laid out to a guaranteed physical size yet.
    expect(() => layOut({ symbology: 'CODE128', payload: 'ABC' })).toThrow(
      /no verified module count/i,
    )
  })

  it('says which piece is missing when metrics exist but structure does not', () => {
    // UPC-E is tabulated in SYMBOL_METRICS but has no entry in SYMBOL_STRUCTURES,
    // so it cannot position guard bars or digits. The old message blamed missing
    // metrics, which sent you looking in the wrong table.
    expect(() => layOut({ symbology: 'UPC-E', payload: '0123456' })).toThrow(
      /verified metrics but no guard\/data structure/i,
    )
  })
})

describe('human-readable interpretation', () => {
  const HRI = { fontSizeMm: 2.75, fontFamily: 'IBM Plex Mono', bandMm: 3.2 }
  const withHri = () => layOut({ hri: HRI })
  const texts = () => withHri().primitives.filter((p) => p.kind === 'text')

  it('is omitted unless asked for', () => {
    expect(layOut().primitives.every((p) => p.kind === 'rect')).toBe(true)
  })

  it('prints the GTIN grouped the way a pack prints it', () => {
    // 036000291452 reads as "0 36000 29145 2".
    expect(texts().map((t) => (t as { text: string }).text)).toEqual(['0', '36000', '29145', '2'])
  })

  it('puts the outer digits in the quiet zones, where they belong', () => {
    const { symbol } = withHri()
    const [first, , , last] = texts() as Array<{ xMm: number; anchor: string }>
    expect(first!.xMm).toBeLessThan(symbol.xMm)
    expect(first!.anchor).toBe('end')
    expect(last!.xMm).toBeGreaterThan(symbol.xMm + symbol.barPatternWidthMm)
    expect(last!.anchor).toBe('start')
  })

  it('centres each group of five beneath its own data area', () => {
    const { symbol } = withHri()
    const [, left, right] = texts() as Array<{ xMm: number }>
    // Data areas are modules 3..45 and 50..92, so centres at 24 and 71.
    expect(left!.xMm).toBeCloseTo(symbol.xMm + 24 * X, 10)
    expect(right!.xMm).toBeCloseTo(symbol.xMm + 71 * X, 10)
  })

  it('puts the baseline at the bottom of the reserved band', () => {
    // The footprint now includes the band, so the baseline lands exactly on its
    // lower edge and the glyphs grow upward into space set aside for them.
    const { footprintHeightMm } = withHri()
    expect((texts()[0] as { baselineYMm: number }).baselineYMm).toBeCloseTo(footprintHeightMm, 10)
  })

  it('keeps the digits clear of the bars for any plausible ascent', () => {
    // The bug this replaces: the baseline sat a fixed 0.6 mm below the bars, so
    // glyphs rising above it printed 1.3 mm *into* the bar pattern. Reserving a
    // band taller than the em size means even a font whose ascent equals its
    // full em stays clear of the symbol.
    const { primitives } = withHri()
    const barBottom = Math.max(
      ...primitives
        .filter((p) => p.kind === 'rect')
        .map((p) => {
          const rect = p as { yMm: number; heightMm: number }
          return rect.yMm + rect.heightMm
        }),
    )
    const baseline = (texts()[0] as { baselineYMm: number }).baselineYMm
    expect(baseline - HRI.fontSizeMm).toBeGreaterThanOrEqual(barBottom)
  })

  it('leaves the bar geometry untouched', () => {
    // The digits must not shift the symbol - the failure mode that made us turn
    // bwip-js's own text off in the first place.
    const bars = (r: ReturnType<typeof layOut>) =>
      JSON.stringify(r.primitives.filter((p) => p.kind === 'rect'))
    expect(bars(withHri())).toBe(bars(layOut()))
  })
})

describe('EAN-13 prints its digits by its own convention', () => {
  // The bug this guards: EAN-13 originally inherited UPC-A's grouping, giving
  // "5 | 90123 | 412345 | 7" and pushing the check digit into the 7X right quiet
  // zone. An EAN-13 prints 1 + 6 + 6 with nothing to the right of the symbol.
  const HRI = { fontSizeMm: 2.75, fontFamily: 'IBM Plex Mono', bandMm: 3.2 }
  const ean13 = () =>
    layOutSymbol(bwip as never, {
      symbology: 'EAN-13',
      payload: '590123412345',
      xDimensionMm: X,
      xMm: 0,
      yMm: 0,
      elementId: 'ean',
      hri: HRI,
    })

  it('groups as 1 + 6 + 6 with nothing trailing', () => {
    const texts = ean13().primitives.filter((p) => p.kind === 'text')
    expect(texts.map((t) => (t as { text: string }).text)).toEqual(['5', '901234', '123457'])
  })

  it('leaves the right quiet zone empty', () => {
    const { primitives, symbol } = ean13()
    const barsRight = symbol.xMm + symbol.barPatternWidthMm
    const beyond = primitives
      .filter((p) => p.kind === 'text')
      .filter((p) => (p as { xMm: number }).xMm > barsRight)
    expect(beyond).toEqual([])
  })

  it('shares UPC-A bar geometry but not its quiet zones', () => {
    // Both are 95 modules of bars; EAN-13 needs 11X on the left, UPC-A 9X.
    const { symbol } = ean13()
    expect(symbol.barPatternWidthMm).toBeCloseTo(95 * X, 10)
    expect(symbol.quietZoneLeftMm).toBeCloseTo(11 * X, 10)
    expect(symbol.quietZoneRightMm).toBeCloseTo(7 * X, 10)
  })
})

describe('bar height scales with the symbol', () => {
  // The defect this guards: the height was fixed at its nominal 22.85 mm no
  // matter the magnification, so a 2x symbol was drawn half as tall as the
  // specification requires. Nothing about that looks wrong on screen.
  it.each([
    [0.8, 18.28],
    [1, 22.85],
    [2, 45.7],
  ])('%fx draws bars %f mm tall', (magnification, expected) => {
    const { symbol } = layOut({ xDimensionMm: magnificationToXDimensionMm(magnification) })
    expect(symbol.barHeightMm).toBeCloseTo(expected, 2)
  })

  it('keeps the guard-to-data ratio constant across magnifications', () => {
    // Both the height and the 5-module guard extension scale, so their ratio
    // must not drift — it did when only the extension scaled.
    const ratios = [0.8, 1, 2].map((m) => {
      const { primitives } = layOut({ xDimensionMm: magnificationToXDimensionMm(m) })
      const heights = [...new Set(primitives.map((p) => (p as { heightMm: number }).heightMm))]
      return Math.max(...heights) / Math.min(...heights)
    })
    expect(ratios[1]).toBeCloseTo(ratios[0]!, 10)
    expect(ratios[2]).toBeCloseTo(ratios[0]!, 10)
  })

  it('still honours an explicit bar height', () => {
    expect(layOut({ barHeightMm: 12 }).symbol.barHeightMm).toBe(12)
  })
})
