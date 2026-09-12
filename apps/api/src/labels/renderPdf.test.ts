import {
  DEFAULT_GHS_STOCK,
  layOutGhsLabel,
  layOutUpcALabel,
  mmToPoints,
  type ResolvedLayout,
} from '@packwright/label-core'
import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import { EMBEDDED_FONT_FAMILIES, embeddedFontFor, renderLayoutToPdf } from './renderPdf'

/**
 * The test the whole phase exists for.
 *
 * Everything else checks that the layout engine computes the right millimetres.
 * This checks that those millimetres survive into the exported file — it renders
 * a real PDF, reads the drawing operators back out of the content stream, and
 * asserts they land where the layout said. A renderer that quietly rescaled, or
 * a page box that did not match the stock, would pass every other test in the
 * suite and produce a label that does not scan.
 *
 * The PDF is parsed by regex rather than with a library. The content stream is
 * plain text when uncompressed, the two operators that matter are `re` and the
 * `/MediaBox` entry, and adding a PDF parser to assert two shapes of number
 * would be more machinery than the thing being verified.
 */

const STOCK = { widthMm: 60, heightMm: 40, marginMm: 3 }

const layoutFor = (data: Record<string, unknown> = {}, stock = STOCK): ResolvedLayout =>
  layOutUpcALabel(bwip as never, { data: { gtin: '036000291452', ...data }, stock })

async function renderAndParse(layout: ResolvedLayout) {
  const pdf = await renderLayoutToPdf(layout, { uncompressed: true })
  const source = pdf.toString('latin1')

  const mediaBox = (source.match(/\/MediaBox\s*\[([^\]]+)\]/)?.[1] ?? '')
    .trim()
    .split(/\s+/)
    .map(Number)

  // `x y w h re` — one per filled rectangle, in points from the top-left.
  const rects = [...source.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re/g)].map((match) =>
    match.slice(1, 5).map(Number),
  )

  return { pdf, source, mediaBox, rects }
}

describe('the exported PDF matches the requested millimetres', () => {
  it('sets a MediaBox equal to the stock', async () => {
    // The one dimension a printer cannot be talked out of.
    const { mediaBox } = await renderAndParse(layoutFor())
    expect(mediaBox[0]).toBe(0)
    expect(mediaBox[1]).toBe(0)
    expect(mediaBox[2]).toBeCloseTo(mmToPoints(60), 3)
    expect(mediaBox[3]).toBeCloseTo(mmToPoints(40), 3)
  })

  it('sizes the MediaBox from the stock, not from a default page', async () => {
    // A4 would be 595 x 842 pt. Asserting a *different* stock rules out the
    // possibility that the numbers above matched by coincidence.
    const { mediaBox } = await renderAndParse(
      layoutFor({ magnification: 2 }, { widthMm: 90, heightMm: 70, marginMm: 3 }),
    )
    expect(mediaBox[2]).toBeCloseTo(mmToPoints(90), 3)
    expect(mediaBox[3]).toBeCloseTo(mmToPoints(70), 3)
  })

  it('draws one rectangle per bar', async () => {
    const layout = layoutFor()
    const { rects } = await renderAndParse(layout)
    expect(rects).toHaveLength(layout.primitives.filter((p) => p.kind === 'rect').length)
  })

  it('places every bar within a micrometre of the resolved position', async () => {
    // Converted from points back to millimetres, so a scaling error surfaces
    // rather than cancelling itself out on the round trip.
    const layout = layoutFor()
    const { rects } = await renderAndParse(layout)

    const expected = layout.primitives
      .filter((p) => p.kind === 'rect')
      .map((p) => p as { xMm: number; yMm: number; widthMm: number; heightMm: number })

    rects.forEach((rect, index) => {
      const target = expected[index]!
      const [xPt, yPt, widthPt, heightPt] = rect as [number, number, number, number]
      expect(xPt).toBeCloseTo(mmToPoints(target.xMm), 4)
      expect(yPt).toBeCloseTo(mmToPoints(target.yMm), 4)
      expect(widthPt).toBeCloseTo(mmToPoints(target.widthMm), 4)
      expect(heightPt).toBeCloseTo(mmToPoints(target.heightMm), 4)
    })
  })

  it('keeps the symbol bounding box inside the page', async () => {
    const layout = layoutFor()
    const { rects, mediaBox } = await renderAndParse(layout)
    const right = Math.max(...rects.map((r) => r[0]! + r[2]!))
    const bottom = Math.max(...rects.map((r) => r[1]! + r[3]!))
    expect(right).toBeLessThanOrEqual(mediaBox[2]!)
    expect(bottom).toBeLessThanOrEqual(mediaBox[3]!)
  })

  it('measures the bar pattern at 31.35 mm in the file itself', async () => {
    // The GenSpec figure, asserted against the exported artefact rather than
    // against the layout that produced it.
    const { rects } = await renderAndParse(layoutFor())
    const left = Math.min(...rects.map((r) => r[0]!))
    const right = Math.max(...rects.map((r) => r[0]! + r[2]!))
    expect((right - left) * (25.4 / 72)).toBeCloseTo(31.35, 3)
  })

  it('scales the exported symbol with magnification', async () => {
    const big = await renderAndParse(
      layoutFor({ magnification: 2 }, { widthMm: 90, heightMm: 70, marginMm: 3 }),
    )
    const left = Math.min(...big.rects.map((r) => r[0]!))
    const right = Math.max(...big.rects.map((r) => r[0]! + r[2]!))
    expect((right - left) * (25.4 / 72)).toBeCloseTo(31.35 * 2, 3)
  })

  it('embeds IBM Plex rather than substituting a standard font', async () => {
    // The browser draws the label in Plex. Until this landed the PDF drew it in
    // Courier, so the digits had different advance widths from the preview —
    // "preview == print" held for the bars and not quite for the type.
    const { source } = await renderAndParse(layoutFor())
    expect(source).toMatch(/IBMPlexMono/)
    expect(source).not.toMatch(/Courier/)
  })

  it('embeds the font file itself, not just a reference to it', async () => {
    // /FontFile2 is the embedded TrueType program. Without it the reader
    // substitutes whatever it has, and the metrics stop matching.
    const { source } = await renderAndParse(layoutFor())
    expect(source).toMatch(/\/FontFile2/)
  })

  it('keeps the digits selectable by shipping a ToUnicode map', async () => {
    // An embedded subset is addressed by glyph id, not by character code — so
    // the show operators carry ids like <0001> rather than ASCII. ToUnicode is
    // what maps them back, and therefore what makes the text selectable and
    // searchable. Asserting the operator bytes instead, as this test first did,
    // was really asserting that the font had *not* been embedded.
    const { source } = await renderAndParse(layoutFor())
    expect(source).toMatch(/\/ToUnicode/)
  })

  it('produces a valid PDF header and trailer', async () => {
    const { pdf } = await renderAndParse(layoutFor())
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.subarray(-6).toString().trim()).toBe('%%EOF')
  })

  it('compresses by default', async () => {
    // The uncompressed stream is a testing affordance, not what ships.
    const compressed = await renderLayoutToPdf(layoutFor())
    const plain = await renderLayoutToPdf(layoutFor(), { uncompressed: true })
    expect(compressed.length).toBeLessThan(plain.length)
  })
})

describe('the GHS label only asks for faces this build embeds', () => {
  /**
   * A family the exporter does not recognise falls back to the body face rather
   * than reaching the filesystem, which is the right behaviour and a silent one.
   * The signal word is the place it would hurt most: the browser would render
   * "Danger" semibold and the PDF would render it regular, and preview == print
   * is the property this whole architecture exists to guarantee.
   */
  it('emits no font family outside EMBEDDED_FONT_FAMILIES', () => {
    const layout = layOutGhsLabel({
      data: {
        productIdentifier: 'Acetone',
        capacityL: 5,
        signalWords: ['Danger'],
        pictograms: ['GHS02'],
        hazardStatements: ['Highly flammable liquid and vapour.'],
        supplier: { name: 'Example Chemicals Ltd', address: '1 Example Way' },
      },
      stock: DEFAULT_GHS_STOCK,
    })

    const faces = layout.primitives.flatMap((p) =>
      p.kind === 'text' ? [{ family: p.fontFamily, weight: p.fontWeight ?? 400 }] : [],
    )
    expect(faces.length).toBeGreaterThan(0)
    // At least one emphasised face, or the weight path below asserts nothing.
    expect(faces.some((face) => face.weight >= 600)).toBe(true)

    for (const { family, weight } of faces) {
      const resolved = embeddedFontFor(family, weight)
      expect(EMBEDDED_FONT_FAMILIES, `"${family}" resolved to an unregistered face`).toContain(
        resolved,
      )
      // A weight of 600 must actually reach the SemiBold face. Falling back to
      // the regular weight here is the silent half of the divergence this pair
      // of tests exists to close.
      if (weight >= 600) expect(resolved).toContain('SemiBold')
    }
  })
})
