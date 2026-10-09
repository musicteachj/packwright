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

  it('works out no environment pictogram for a US label, because OSHA recognises eight', () => {
    // 29 CFR 1910.1200 Appendix C.2.3.2: "One of eight standard hazard symbols", and GHS09 is
    // not one of them. The engine drew it from CLP's table and `ghs/pictogram-integrity` then
    // reported it — the tool's own drawing, blamed on the label.
    const hazards = [
      '2.6/flammable-liquids-1-2-3',
      '4.1/hazardous-to-the-aquatic-environment-acute-acute-1-long',
    ]
    const drawn = (regime: GhsLabelData['regime']) =>
      layOutGhsLabel({
        // No `pictograms`, so the engine works them out from the classification.
        data: { regime, productIdentifier: 'Acetone', capacityL: 5, hazards },
        stock: STOCK,
      }).pictograms.map((p) => p.code)
    expect(drawn('us-osha')).toEqual(['GHS02'])
    expect(drawn('eu-clp'), 'CLP still requires it').toEqual(['GHS02', 'GHS09'])
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

  it('says what each missing symbol is apart from why, so the why can be said once', () => {
    // Two pictograms printed the same forty-word explanation twice, differing
    // only in the code and the symbol's name, and five would print it five
    // times. The rail could only shorten that by taking the engine's sentence
    // apart, which this project does not do to its own report. So the engine
    // states the two halves itself: what is missing here, and why — the second
    // identical across every pictogram, so a reader can group on it whole.
    const layout = layOutGhsLabel({ data: DATA, stock: STOCK })
    const explained = ['GHS02', 'GHS07'].map(
      (code) => layout.omissions.find((o) => o.elementId.endsWith(code))!.explanation,
    )

    expect(explained.every((e) => e !== undefined)).toBe(true)
    expect(explained[0]!.what).toBe('The GHS02 symbol (flame) is not drawn.')
    expect(explained[1]!.what).toBe('The GHS07 symbol (exclamation mark) is not drawn.')
    expect(explained[0]!.why, 'one explanation, word for word').toBe(explained[1]!.why)
    expect(explained[0]!.why).toContain('Annex V')
  })

  it('keeps the whole sentence exactly the two halves, so nothing reads one and misses the other', () => {
    // `reason` is what the export gate, the API and every existing reader use.
    // It must stay the sentence it was, or the split changed what the engine
    // says rather than only how it can be grouped.
    const layout = layOutGhsLabel({
      data: { ...DATA, hazardStatementCodes: ['H225', 'H999' as never] },
      stock: STOCK,
    })
    const explainedOmissions = layout.omissions.filter((o) => o.explanation !== undefined)
    expect(explainedOmissions.length, 'two pictograms and one unknown statement').toBe(3)
    for (const omission of explainedOmissions) {
      expect(omission.reason).toBe(`${omission.explanation!.what} ${omission.explanation!.why}`)
    }
  })

  it('says which regulation the missing symbol answers to, by the label’s regime', () => {
    // It said "CLP Annex V requires…" on every label, so a US label was told
    // its pictograms answered to an EU regulation that does not reach it.
    // Found by `/code-review high` on PR #60; it predates that PR. The US
    // wording quotes 29 CFR 1910.1200 Appendix C.2.3.2, read from the eCFR on
    // 2026-10-07.
    const why = (regime: GhsLabelData['regime']) =>
      layOutGhsLabel({ data: { ...DATA, regime }, stock: STOCK }).omissions.find((o) =>
        o.elementId.endsWith('GHS02'),
      )!.explanation!.why

    expect(why('us-osha')).toContain('29 CFR 1910.1200 Appendix C.2.3.2')
    expect(why('us-osha')).toContain('one of the eight standard hazard symbols')
    expect(why('us-osha'), 'no EU regulation on a US label').not.toMatch(/CLP|Annex V|1272\/2008/)
    expect(why('eu-clp')).toContain('CLP Annex V')
    expect(why('eu-clp'), 'and no US one on an EU label').not.toContain('1910.1200')
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
    // On a 1 mm margin, because the identifier begins at the margin and the 4 mm one
    // would put the cut at 6.7 mm — stock too short to leave any panel between its
    // margins, which the engine refuses.
    const stock: LabelStock = { ...STOCK, marginMm: 1 }
    const probe = layOutGhsLabel({ data: DATA, stock })
    const id = probe.elements.find((e) => e.elementId === GHS_ELEMENTS.productIdentifier)!.box
    const heightMm = id.yMm + id.heightMm / 2
    const layout = layOutGhsLabel({ data: DATA, stock: { ...stock, heightMm } })

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

  it('does not also measure across a block already recorded as absent', () => {
    // Below a 40 mm label, with a supplier name too long to wrap on 30 mm.
    const data: GhsLabelData = {
      ...DATA,
      supplier: { name: 'Tetramethylammoniumhydroxidepentahydrate', address: 'X' },
    }
    const layout = layOutGhsLabel({ data, stock: { ...STOCK, widthMm: 30, heightMm: 40 } })
    expect(positional(layout, GHS_ELEMENTS.supplier).map((o) => o.scope)).toEqual(['element'])
  })

  it('gives an absent statements block and pictogram one omission each', () => {
    // A 12 mm high label drops the pictograms and the statements below it, and at
    // 12 mm and 50 mm wide respectively each would also overrun across.
    const narrow = layOutGhsLabel({ data: DATA, stock: { widthMm: 12, heightMm: 12, marginMm: 1 } })
    expect(positional(narrow, GHS_ELEMENTS.hazardStatements).map((o) => o.scope)).toEqual([
      'element',
    ])
    const wide = layOutGhsLabel({ data: DATA, stock: { widthMm: 50, heightMm: 12, marginMm: 1 } })
    expect(positional(wide, `${GHS_ELEMENTS.pictograms}-GHS07`).map((o) => o.scope)).toEqual([
      'element',
    ])
  })

  it('records nothing positional for a label that fits', () => {
    const layout = layOutGhsLabel({ data: DATA, stock: STOCK })
    expect(layout.omissions.every((omission) => omission.reason.includes('Annex V'))).toBe(true)
  })
})
