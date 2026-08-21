import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import { toSVG } from '../render/toSVG'
import { DEFAULT_UPC_A_STOCK, UPC_A_ELEMENTS } from '../templates/upcA'
import { LayoutError, layOutUpcALabel } from './engine'

const PAYLOAD = '03600029145'

const layOut = (data: Record<string, unknown> = {}, stock = DEFAULT_UPC_A_STOCK) =>
  layOutUpcALabel(bwip as never, { data: { gtinPayload: PAYLOAD, ...data }, stock })

describe('layOutUpcALabel', () => {
  it('resolves to the stock dimensions, not the symbol dimensions', () => {
    // The layout is the label. The symbol is one element on it.
    const layout = layOut()
    expect(layout.widthMm).toBe(60)
    expect(layout.heightMm).toBe(40)
  })

  it('centres the symbol footprint on the stock', () => {
    const layout = layOut()
    const [symbol] = layout.symbols
    // 37.29 mm footprint on 60 mm stock leaves 11.355 mm either side, and the
    // bars begin one 9X quiet zone further in.
    expect(symbol!.xMm - symbol!.quietZoneLeftMm).toBeCloseTo((60 - 37.29) / 2, 6)
  })

  it('keeps the whole footprint inside the stock margins', () => {
    const layout = layOut()
    const [symbol] = layout.symbols
    const left = symbol!.xMm - symbol!.quietZoneLeftMm
    const right = symbol!.xMm + symbol!.barPatternWidthMm + symbol!.quietZoneRightMm
    expect(left).toBeGreaterThanOrEqual(DEFAULT_UPC_A_STOCK.marginMm)
    expect(right).toBeLessThanOrEqual(60 - DEFAULT_UPC_A_STOCK.marginMm)
  })

  it('records the symbol so a rule can measure what was drawn', () => {
    const [symbol] = layOut().symbols
    expect(symbol).toMatchObject({
      elementId: UPC_A_ELEMENTS.symbol,
      symbology: 'UPC-A',
      value: '036000291452',
      xDimensionMm: 0.33,
    })
  })

  it('scales the symbol with magnification', () => {
    // Stock large enough for both, so this measures scaling rather than fit.
    const roomy = { widthMm: 90, heightMm: 70, marginMm: 3 }
    const small = layOut({ magnification: 0.8 }, roomy).symbols[0]!
    const large = layOut({ magnification: 2 }, roomy).symbols[0]!
    expect(large.barPatternWidthMm / small.barPatternWidthMm).toBeCloseTo(2.5, 10)
  })

  it('refuses a magnification the specification does not permit', () => {
    expect(() => layOut({ magnification: 2.5 })).toThrow(LayoutError)
    expect(() => layOut({ magnification: 0.5 })).toThrow(LayoutError)
  })

  it('refuses to shrink a symbol that does not fit rather than breaking its quiet zone', () => {
    // A 2x UPC-A needs 74.58 mm of width; a 60 mm stock cannot carry it. The
    // tempting behaviour is to scale it down to fit, which produces a label that
    // looks right and does not scan.
    expect(() => layOut({ magnification: 2 })).toThrow(/quiet zone/i)
  })

  it('fits a 2x symbol on stock actually large enough for it', () => {
    const layout = layOut({ magnification: 2 }, { widthMm: 90, heightMm: 70, marginMm: 3 })
    expect(layout.symbols[0]!.barPatternWidthMm).toBeCloseTo(95 * 0.66, 10)
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
    const svg = toSVG(layOut(), { title: 'UPC-A label for GTIN 036000291452' })
    expect(svg).toContain('role="img"')
    expect(svg).toContain('<title>UPC-A label for GTIN 036000291452</title>')
  })

  it('escapes text that would otherwise break the document', () => {
    const svg = toSVG(
      {
        widthMm: 10,
        heightMm: 10,
        symbols: [],
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
