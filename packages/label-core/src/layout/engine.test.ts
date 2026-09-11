import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import { toSVG } from '../render/toSVG'
import type { UpcALabelData } from '../templates/upcA'
import { DEFAULT_UPC_A_STOCK, UPC_A_ELEMENTS } from '../templates/upcA'
import { LayoutError, layOutUpcALabel } from './engine'

const GTIN = '036000291452'

const layOut = (data: Partial<UpcALabelData> = {}, stock = DEFAULT_UPC_A_STOCK) =>
  layOutUpcALabel(bwip as never, { data: { gtin: GTIN, ...data }, stock })

// Nominal UPC-A on the 60 x 40 default stock, worked from the specification
// figures rather than from a run of the engine: X = 0.330 mm, footprint
// 113 modules = 37.29 mm, bar pattern 95 modules = 31.35 mm, quiet zone 9X =
// 2.97 mm. Centred on 60 mm leaves 11.355 mm either side of the footprint.
const X = 0.33
const FOOTPRINT_MM = 113 * X
const BARS_MM = 95 * X
const QUIET_ZONE_MM = 9 * X
const BARS_LEFT_MM = (60 - FOOTPRINT_MM) / 2 + QUIET_ZONE_MM

describe('layOutUpcALabel', () => {
  it('resolves to the stock dimensions, not the symbol dimensions', () => {
    // The layout is the label. The symbol is one element on it.
    const layout = layOut()
    expect(layout.widthMm).toBe(60)
    expect(layout.heightMm).toBe(40)
  })

  it('centres the symbol footprint on the stock', () => {
    const [symbol] = layOut().symbols
    expect(symbol!.xMm).toBeCloseTo(BARS_LEFT_MM, 6)
  })

  it('records the symbol so a rule can measure what was drawn', () => {
    const [symbol] = layOut().symbols
    expect(symbol).toMatchObject({
      elementId: UPC_A_ELEMENTS.symbol,
      symbology: 'UPC-A',
      value: GTIN,
      xDimensionMm: X,
    })
  })

  it('scales the symbol with magnification', () => {
    const roomy = { widthMm: 90, heightMm: 70, marginMm: 3 }
    const small = layOut({ magnification: 0.8 }, roomy).symbols[0]!
    const large = layOut({ magnification: 2 }, roomy).symbols[0]!
    expect(large.barPatternWidthMm / small.barPatternWidthMm).toBeCloseTo(2.5, 10)
  })

  it('gives every placed element a box, so geometry can be measured and highlighted', () => {
    const layout = layOut()
    const symbol = layout.elements.find((e) => e.elementId === UPC_A_ELEMENTS.symbol)
    // The box is the footprint — bars plus both quiet zones — because the quiet
    // zone is the part that has to stay clear.
    expect(symbol!.box.widthMm).toBeCloseTo(FOOTPRINT_MM, 6)
    expect(symbol!.box.xMm).toBeCloseTo(BARS_LEFT_MM - QUIET_ZONE_MM, 6)
  })
})

describe('measured clear space', () => {
  it('measures to the trim edge when nothing else is on the label', () => {
    const [symbol] = layOut().symbols
    expect(symbol!.clearSpaceLeftMm).toBeCloseTo(BARS_LEFT_MM, 6)
    expect(symbol!.clearSpaceRightMm).toBeCloseTo(60 - BARS_LEFT_MM - BARS_MM, 6)
  })

  it('reports the requirement separately from the measurement', () => {
    // The distinction the whole rule rests on. The requirement is 9X and is true
    // of every UPC-A ever drawn; only the measurement can fail.
    const [symbol] = layOut().symbols
    expect(symbol!.requiredQuietZoneLeftMm).toBeCloseTo(QUIET_ZONE_MM, 10)
    expect(symbol!.clearSpaceLeftMm).not.toBeCloseTo(QUIET_ZONE_MM, 2)
  })

  it('shrinks when artwork is anchored beside the symbol', () => {
    // A 10 mm block hard against the left margin ends at 13 mm; the bars begin
    // at 14.325 mm. That leaves 1.325 mm where the specification wants 2.97.
    const [symbol] = layOut({
      artwork: { text: 'ACME', anchor: 'centre-left', widthMm: 10, heightMm: 8 },
    }).symbols
    expect(symbol!.clearSpaceLeftMm).toBeCloseTo(BARS_LEFT_MM - 13, 6)
    expect(symbol!.clearSpaceLeftMm).toBeLessThan(symbol!.requiredQuietZoneLeftMm)
  })

  it('ignores artwork that does not sit level with the symbol', () => {
    // Same block, anchored clear of the symbol's band. Horizontal proximity
    // alone is not encroachment.
    const [symbol] = layOut({
      artwork: { text: 'ACME', anchor: 'top-left', widthMm: 10, heightMm: 2 },
    }).symbols
    expect(symbol!.clearSpaceLeftMm).toBeCloseTo(BARS_LEFT_MM, 6)
  })

  it('does not count the symbol’s own human-readable digits as encroachment', () => {
    // A UPC-A prints its first digit in the left quiet zone and its check digit
    // in the right. Counting those fails every conformant label.
    const [symbol] = layOut().symbols
    expect(symbol!.clearSpaceLeftMm).toBeGreaterThan(symbol!.requiredQuietZoneLeftMm)
  })

  it('goes negative when the symbol runs off the stock', () => {
    // A 2x UPC-A needs 74.58 mm; a 60 mm stock cannot carry it. The engine draws
    // it anyway — refusing would leave the rules with nothing to measure.
    const [symbol] = layOut({ magnification: 2 }).symbols
    expect(symbol!.clearSpaceLeftMm).toBeLessThan(0)
    expect(symbol!.clearSpaceRightMm).toBeLessThan(0)
  })
})

describe('resolving rather than refusing', () => {
  it('draws a magnification outside the permitted range instead of throwing', () => {
    // 2.5x is non-conformant, but it is a drawing. The rules judge it; the
    // engine's job is to produce the geometry they judge.
    const layout = layOut({ magnification: 2.5 })
    expect(layout.symbols[0]!.xDimensionMm).toBeCloseTo(X * 2.5, 10)
  })

  it('still refuses input that describes no drawing at all', () => {
    expect(() => layOut({ magnification: 0 })).toThrow(LayoutError)
    expect(() => layOut({ magnification: -1 })).toThrow(LayoutError)
    expect(() => layOut({}, { widthMm: 0, heightMm: 40, marginMm: 3 })).toThrow(LayoutError)
  })

  it('refuses numbers that would corrupt the arithmetic rather than propagating them', () => {
    // A cleared form field arrives as `''`. Unchecked, it string-concatenated
    // through every coordinate: the rail printed "the left quiet zone measures
    // NaN mm" under a real GS1 citation, and the renderer threw on a coordinate
    // that was not a number.
    expect(() => layOut({}, { widthMm: 60, heightMm: 40, marginMm: '' as never })).toThrow(
      LayoutError,
    )
    expect(() => layOut({}, { widthMm: 60, heightMm: 40, marginMm: -5 })).toThrow(LayoutError)
    // A negative bar height inverted the band used to detect encroachment, so a
    // real quiet-zone violation came back as two passes.
    expect(() => layOut({ barHeightMm: -50 })).toThrow(LayoutError)
    expect(() => layOut({ barHeightMm: 0 })).toThrow(LayoutError)
    expect(() =>
      layOut({ artwork: { text: 'A', anchor: 'top-left', widthMm: '' as never, heightMm: 4 } }),
    ).toThrow(LayoutError)
  })

  it('refuses a GTIN that is not twelve digits', () => {
    expect(() => layOut({ gtin: '03600029145' })).toThrow(LayoutError)
    expect(() => layOut({ gtin: 'ABCDEFGHIJKL' })).toThrow(LayoutError)
  })
})

describe('an unencodable GTIN', () => {
  // 036000291452 is correct; ...3 is a transposition of the check digit, which
  // is the commonest real defect in a supplied GTIN.
  const BAD = '036000291453'

  it('omits the symbol rather than encoding a corrected one', () => {
    const layout = layOut({ gtin: BAD })
    expect(layout.symbols).toHaveLength(0)
    expect(layout.primitives).toHaveLength(0)
  })

  it('records why, so the omission is never silent', () => {
    const [omission] = layOut({ gtin: BAD }).omissions
    expect(omission!.elementId).toBe(UPC_A_ELEMENTS.symbol)
    expect(omission!.reason).toMatch(/check digit/i)
  })

  it('still resolves the rest of the label', () => {
    const layout = layOut({
      gtin: BAD,
      artwork: { text: 'ACME', anchor: 'top-left', widthMm: 10, heightMm: 4 },
    })
    expect(layout.widthMm).toBe(60)
    expect(layout.elements.map((e) => e.elementId)).toEqual([UPC_A_ELEMENTS.artwork])
  })
})

describe('toSVG', () => {
  it('states millimetres in the attributes and matching bare units in the viewBox', () => {
    // This pairing is what makes one user unit equal one millimetre. Without it
    // the preview is decorative and the print is wrong.
    const svg = toSVG(layOut())
    expect(svg).toContain('width="60mm"')
    expect(svg).toContain('height="40mm"')
    expect(svg).toContain('viewBox="0 0 60 40"')
  })

  it('draws every primitive the layout produced', () => {
    const layout = layOut()
    const svg = toSVG(layout)
    const rects = layout.primitives.filter((p) => p.kind === 'rect').length
    const texts = layout.primitives.filter((p) => p.kind === 'text').length
    expect(svg.match(/<rect /g) ?? []).toHaveLength(rects)
    expect(svg.match(/<text /g) ?? []).toHaveLength(texts)
  })

  it('carries the element id through, so a finding can highlight geometry', () => {
    expect(toSVG(layOut())).toContain(`data-element-id="${UPC_A_ELEMENTS.symbol}"`)
  })

  it('gives the drawing a text equivalent when asked', () => {
    const svg = toSVG(layOut(), { title: `UPC-A label for GTIN ${GTIN}` })
    expect(svg).toContain('role="img"')
    expect(svg).toContain(`<title>UPC-A label for GTIN ${GTIN}</title>`)
  })

  it('escapes text that would otherwise break the document', () => {
    const svg = toSVG(
      {
        widthMm: 10,
        heightMm: 10,
        symbols: [],
        elements: [],
        omissions: [],
        primitives: [
          {
            kind: 'text',
            xMm: 1,
            baselineYMm: 5,
            text: 'Salt & <Pepper>',
            fontSizeMm: 2,
            fontFamily: 'IBM Plex Sans',
            fill: '000000',
            anchor: 'start',
          },
        ],
      },
      {},
    )
    expect(svg).toContain('Salt &amp; &lt;Pepper&gt;')
    expect(svg).not.toContain('<Pepper>')
  })

  it('is stable — the same layout renders byte-identically', () => {
    expect(toSVG(layOut())).toBe(toSVG(layOut()))
  })
})
