import { describe, expect, it } from 'vitest'
import { GHS_ELEMENTS, type GhsLabelData } from '../templates/ghs'
import type { LabelStock } from '../templates/stock'
import { LayoutError } from './engine'
import { layOutGhsLabel } from './ghsEngine'

const STOCK: LabelStock = { widthMm: 74, heightMm: 105, marginMm: 4 }

const DATA: GhsLabelData = {
  regime: 'eu-clp',
  productIdentifier: 'Acetone',
  capacityL: 5,
  signalWords: ['Danger'],
  pictograms: ['GHS02', 'GHS07'],
  hazardStatementCodes: ['H225'],
  precautionaryStatementCodes: ['P210'],
  supplier: { name: 'Example Chemicals Ltd', address: '1 Example Way, Leeds' },
}

describe('layOutGhsLabel', () => {
  it('resolves the six elements to millimetre boxes', () => {
    const layout = layOutGhsLabel({ data: DATA, stock: STOCK })
    const ids = layout.elements.map((e) => e.elementId)

    expect(ids).toContain(GHS_ELEMENTS.productIdentifier)
    expect(ids).toContain(GHS_ELEMENTS.signalWord)
    expect(ids).toContain(GHS_ELEMENTS.pictograms)
    expect(ids).toContain(GHS_ELEMENTS.hazardStatements)
    expect(ids).toContain(GHS_ELEMENTS.precautionaryStatements)
    expect(ids).toContain(GHS_ELEMENTS.supplier)

    expect(layout.widthMm).toBe(74)
    expect(layout.heightMm).toBe(105)
    // No barcode on a chemical label — the mirror of a UPC-A carrying no pictograms.
    expect(layout.symbols).toEqual([])
  })

  it('sizes pictograms from the CLP band the capacity falls in', () => {
    // 5 litres is the "greater than 3 but not exceeding 50" band: 23 mm.
    const layout = layOutGhsLabel({ data: DATA, stock: STOCK })
    expect(layout.pictograms).toHaveLength(2)
    for (const pictogram of layout.pictograms) {
      expect(pictogram.requiredSideMm).toBe(23)
      expect(pictogram.drawnSideMm).toBe(23)
      expect(pictogram.drawnAreaSqMm).toBe(529)
      // Set at a point, so the box it occupies is the diagonal, not the edge.
      expect(pictogram.box.widthMm).toBeCloseTo(23 * Math.SQRT2, 6)
    }
  })

  it('records the requirement separately from what was drawn, so a rule can fail', () => {
    // An undersized pictogram is drawn as asked. Refusing would leave the sizing
    // rule with nothing to catch — the lesson the UPC-A engine learned in phase 3.
    const layout = layOutGhsLabel({
      data: { ...DATA, pictogramSideMm: 8 },
      stock: STOCK,
    })
    const [pictogram] = layout.pictograms
    expect(pictogram!.drawnSideMm).toBe(8)
    expect(pictogram!.requiredSideMm).toBe(23)
    expect(pictogram!.drawnAreaSqMm).toBeLessThan(100)
  })

  it('draws every pictogram frame and records every missing glyph', () => {
    const layout = layOutGhsLabel({ data: DATA, stock: STOCK })
    const frames = layout.primitives.filter((p) => p.kind === 'path')
    expect(frames).toHaveLength(2)

    // Four corners and a close: a square set at a point.
    for (const frame of frames) {
      expect(frame.kind === 'path' && frame.commands).toHaveLength(5)
    }

    expect(layout.pictograms.every((p) => !p.glyphDrawn)).toBe(true)
    for (const code of ['GHS02', 'GHS07']) {
      const omission = layout.omissions.find((o) => o.elementId.endsWith(code))
      expect(omission, `no omission recorded for ${code}`).toBeDefined()
      expect(omission!.reason).toContain('Annex V')
    }
  })

  it('carries the Annex V symbol name for the accessible title', () => {
    const layout = layOutGhsLabel({ data: DATA, stock: STOCK })
    expect(layout.pictograms.map((p) => p.symbolName)).toEqual(['flame', 'exclamation mark'])
  })

  it('draws a label smaller than CLP demands rather than refusing it', () => {
    // 40 x 60 mm is under the 52 x 74 of even the smallest band.
    const layout = layOutGhsLabel({
      data: { ...DATA, capacityL: 0.5 },
      stock: { widthMm: 40, heightMm: 60, marginMm: 2 },
    })
    expect(layout.widthMm).toBe(40)
    expect(layout.elements.length).toBeGreaterThan(0)
  })

  it('refuses only input that describes no drawing at all', () => {
    expect(() => layOutGhsLabel({ data: DATA, stock: { ...STOCK, widthMm: 0 } })).toThrow(
      LayoutError,
    )
    expect(() => layOutGhsLabel({ data: { ...DATA, capacityL: 0 }, stock: STOCK })).toThrow(
      LayoutError,
    )
    expect(() => layOutGhsLabel({ data: { ...DATA, pictogramSideMm: -5 }, stock: STOCK })).toThrow(
      LayoutError,
    )
    // A blank margin arriving as '' from a cleared form field must not
    // string-concatenate through every coordinate.
    expect(() =>
      layOutGhsLabel({ data: DATA, stock: { ...STOCK, marginMm: '' as unknown as number } }),
    ).toThrow(LayoutError)
  })

  it('omits blocks the data does not carry, rather than drawing empty ones', () => {
    const layout = layOutGhsLabel({
      data: { regime: 'eu-clp', productIdentifier: 'Water', capacityL: 1 },
      stock: STOCK,
    })
    const ids = layout.elements.map((e) => e.elementId)
    expect(ids).toEqual([GHS_ELEMENTS.productIdentifier])
    expect(layout.pictograms).toEqual([])
  })
})
