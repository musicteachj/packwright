import { describe, expect, it } from 'vitest'
import { measureTextMm } from '../text/measure'
import { GHS_ELEMENTS, GHS_TYPE_DEFAULT, type GhsLabelData } from '../templates/ghs'
import type { LabelStock } from '../templates/stock'
import { LayoutError } from './engine'
import { layOutGhsLabel } from './ghsEngine'
import type { TextPrimitive } from './types'

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
    // The label itself is always an element, so a finding about its size has a
    // box to outline; everything else appears only when the data carries it.
    expect(ids).toEqual([GHS_ELEMENTS.border, GHS_ELEMENTS.productIdentifier])
    expect(layout.pictograms).toEqual([])
  })
})

describe('statements are wrapped at layout time', () => {
  it('breaks a long statement into several lines that each fit the panel', () => {
    const layout = layOutGhsLabel({
      data: { ...DATA, hazardStatementCodes: [], precautionaryStatementCodes: ['P210'] },
      stock: STOCK,
    })
    const lines = layout.primitives.filter(
      (p) => p.kind === 'text' && p.elementId === GHS_ELEMENTS.precautionaryStatements,
    )
    // P210 is 111 mm of text on a 66 mm panel; unwrapped it ran off the label.
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      if (line.kind !== 'text') continue
      expect(measureTextMm(line.text, line.fontSizeMm, line.fontFamily)).toBeLessThanOrEqual(
        STOCK.widthMm - STOCK.marginMm * 2,
      )
    }
  })

  it('grows the element box to the wrapped height, so a rule measures what is drawn', () => {
    const oneLine = layOutGhsLabel({
      data: { ...DATA, hazardStatementCodes: ['H200'], precautionaryStatementCodes: [] },
      stock: STOCK,
    })
    const manyLines = layOutGhsLabel({
      data: { ...DATA, hazardStatementCodes: ['H373'], precautionaryStatementCodes: [] },
      stock: STOCK,
    })
    const box = (l: typeof oneLine) =>
      l.elements.find((e) => e.elementId === GHS_ELEMENTS.hazardStatements)!.box.heightMm
    expect(box(manyLines)).toBeGreaterThan(box(oneLine))
  })
})

describe('a block drawn off the stock says so', () => {
  // Drawn as asked, and recorded. This engine used to record nothing for a block
  // below the edge, so the rules certified text that never printed.
  const positional = (layout: ReturnType<typeof layOutGhsLabel>, elementId: string) =>
    layout.omissions.filter(
      (omission) => omission.elementId === elementId && !omission.reason.includes('Annex V'),
    )

  it('records a block that begins past the bottom edge as absent', () => {
    // On 40 mm the statements and the supplier start below the label entirely.
    const layout = layOutGhsLabel({ data: DATA, stock: { ...STOCK, heightMm: 40 } })
    const supplier = positional(layout, GHS_ELEMENTS.supplier)
    const box = layout.elements.find((e) => e.elementId === GHS_ELEMENTS.supplier)!.box

    expect(box.yMm, 'the premise: the supplier starts below the label').toBeGreaterThanOrEqual(40)
    expect(supplier.map((omission) => omission.scope)).toEqual(['element'])
  })

  it('records the statements block too, which is drawn by its own loop', () => {
    const layout = layOutGhsLabel({ data: DATA, stock: { ...STOCK, heightMm: 40 } })
    const box = layout.elements.find((e) => e.elementId === GHS_ELEMENTS.hazardStatements)!.box
    expect(box.yMm + box.heightMm, 'the premise: the statements run past 40 mm').toBeGreaterThan(40)
    expect(positional(layout, GHS_ELEMENTS.hazardStatements)).not.toEqual([])
  })

  it('records a block that runs past the bottom edge as a lost detail', () => {
    // Cut through the product identifier's box, so it starts on the label and ends off it.
    const probe = layOutGhsLabel({ data: DATA, stock: STOCK })
    const id = probe.elements.find((e) => e.elementId === GHS_ELEMENTS.productIdentifier)!.box
    const heightMm = id.yMm + id.heightMm / 2
    const layout = layOutGhsLabel({ data: DATA, stock: { ...STOCK, heightMm } })

    expect(positional(layout, GHS_ELEMENTS.productIdentifier).map((o) => o.scope)).toEqual([
      'detail',
    ])
  })

  it('records a pictogram past the right edge of a strip wider than its label', () => {
    // Two 23 mm pictograms set as diamonds are wider together than a 50 mm label,
    // which holds the first of them.
    const layout = layOutGhsLabel({ data: DATA, stock: { ...STOCK, widthMm: 50 } })
    const last = `${GHS_ELEMENTS.pictograms}-GHS07`
    const box = layout.elements.find((e) => e.elementId === last)!.box

    expect(box.xMm + box.widthMm, 'the premise: GHS07 runs past 50 mm').toBeGreaterThan(50)
    expect(positional(layout, last)).not.toEqual([])
    expect(positional(layout, `${GHS_ELEMENTS.pictograms}-GHS02`), 'GHS02 fits').toEqual([])
  })

  it('records a pictogram that begins past the right edge as absent', () => {
    // A third pictogram on the same 50 mm label starts beyond it altogether.
    const data: GhsLabelData = { ...DATA, pictograms: ['GHS02', 'GHS07', 'GHS05'] }
    const layout = layOutGhsLabel({ data, stock: { ...STOCK, widthMm: 50 } })
    const third = `${GHS_ELEMENTS.pictograms}-GHS05`
    const box = layout.elements.find((e) => e.elementId === third)!.box

    expect(box.xMm, 'the premise: GHS05 starts past 50 mm').toBeGreaterThanOrEqual(50)
    expect(positional(layout, third).map((o) => o.scope)).toEqual(['element'])
    expect(
      positional(layout, `${GHS_ELEMENTS.pictograms}-GHS07`).map((o) => o.scope),
      'the one it follows only runs past',
    ).toEqual(['detail'])
  })

  it('records a pictogram past the bottom edge', () => {
    const probe = layOutGhsLabel({ data: DATA, stock: STOCK })
    const strip = probe.elements.find((e) => e.elementId === GHS_ELEMENTS.pictograms)!.box
    const heightMm = strip.yMm + strip.heightMm / 2
    const layout = layOutGhsLabel({ data: DATA, stock: { ...STOCK, heightMm } })

    expect(positional(layout, `${GHS_ELEMENTS.pictograms}-GHS02`).map((o) => o.scope)).toEqual([
      'detail',
    ])
  })

  it('records a word too long to wrap running past the right edge', () => {
    // The wrapper never breaks inside a word. Found by review: a 40-letter
    // chemical name ran past a 30 mm label with nothing recorded.
    const data: GhsLabelData = {
      ...DATA,
      productIdentifier: 'Tetramethylammoniumhydroxidepentahydrate',
    }
    const stock: LabelStock = { ...STOCK, widthMm: 30 }
    const layout = layOutGhsLabel({ data, stock })
    const line = layout.primitives.find(
      (p): p is TextPrimitive =>
        p.kind === 'text' && p.elementId === GHS_ELEMENTS.productIdentifier,
    )!
    const widthMm = measureTextMm(line.text, line.fontSizeMm, line.fontFamily)

    expect(line.xMm + widthMm, 'the premise: the name runs past 30 mm').toBeGreaterThan(30)
    expect(positional(layout, GHS_ELEMENTS.productIdentifier).map((o) => o.scope)).toEqual([
      'detail',
    ])
  })

  it('records a statement word too long for a very narrow label', () => {
    const stock: LabelStock = { widthMm: 12, heightMm: 400, marginMm: 1 }
    const layout = layOutGhsLabel({ data: DATA, stock })
    const widest = Math.max(
      ...layout.primitives
        .filter((p) => p.kind === 'text' && p.elementId === GHS_ELEMENTS.hazardStatements)
        .map((p) =>
          p.kind === 'text' ? p.xMm + measureTextMm(p.text, p.fontSizeMm, p.fontFamily) : 0,
        ),
    )

    expect(widest, 'the premise: a statement word runs past 12 mm').toBeGreaterThan(12)
    expect(positional(layout, GHS_ELEMENTS.hazardStatements)).not.toEqual([])
  })

  it('measures a bold signal word in the face it prints in', () => {
    // A width that holds "Danger Warning" in Regular and not in SemiBold, with a
    // margin small enough that the wrap (still Regular) keeps it on one line.
    const data: GhsLabelData = { ...DATA, signalWords: ['Danger', 'Warning'] }
    const text = 'Danger Warning'
    const sizeMm = GHS_TYPE_DEFAULT.signalWordMm
    const regularMm = measureTextMm(text, sizeMm, GHS_TYPE_DEFAULT.fontFamily)
    const boldMm = measureTextMm(text, sizeMm, `${GHS_TYPE_DEFAULT.fontFamily} SemiBold`)
    const marginMm = 0.5
    const widthMm = marginMm + (regularMm + boldMm) / 2
    const layout = layOutGhsLabel({ data, stock: { widthMm, heightMm: 400, marginMm } })

    expect(marginMm + regularMm, 'the premise: in Regular it fits').toBeLessThanOrEqual(widthMm)
    expect(marginMm + boldMm, 'and in the face it prints in it does not').toBeGreaterThan(widthMm)
    expect(positional(layout, GHS_ELEMENTS.signalWord).map((o) => o.scope)).toEqual(['detail'])
  })

  it('records nothing positional for a label that fits', () => {
    const layout = layOutGhsLabel({ data: DATA, stock: STOCK })
    expect(layout.omissions.every((omission) => omission.reason.includes('Annex V'))).toBe(true)
  })
})
