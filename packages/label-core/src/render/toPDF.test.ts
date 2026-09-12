import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import { MM_PER_POINT } from '../geometry/units'
import { layOutUpcALabel } from '../layout/engine'
import { DEFAULT_UPC_A_STOCK } from '../templates/upcA'
import type { PathCommand, ResolvedLayout } from '../layout/types'
import type { PdfCanvas } from './toPDF'
import { pageSizePoints, toPDF } from './toPDF'
import { toSVG } from './toSVG'

/**
 * A canvas that records instead of drawing.
 *
 * The renderer's correctness is entirely about which coordinates it emits, and
 * those can be checked without producing a PDF at all. Recording also makes the
 * comparison against the SVG renderer possible: two outputs in different formats
 * can be reduced to the same list of millimetre positions and compared directly.
 */
function recordingCanvas() {
  const calls: Array<{ op: string; args: unknown[] }> = []
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args })
    }

  const canvas: PdfCanvas & { calls: typeof calls } = {
    calls,
    save: record('save'),
    restore: record('restore'),
    rect: record('rect'),
    fill: record('fill'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    bezierCurveTo: record('bezierCurveTo'),
    closePath: record('closePath'),
    fillAndStroke: record('fillAndStroke'),
    lineWidth: record('lineWidth'),
    stroke: record('stroke'),
    dash: record('dash'),
    undash: record('undash'),
    font: record('font'),
    fontSize: record('fontSize'),
    fillColor: record('fillColor'),
    text: record('text'),
    // A fixed advance per character, so anchor arithmetic is checkable without
    // depending on a real font's metrics.
    widthOfString: (text: string) => text.length * 2,
  }
  return canvas
}

const layout = () =>
  layOutUpcALabel(bwip as never, {
    data: { gtin: '036000291452' },
    stock: DEFAULT_UPC_A_STOCK,
  })

describe('pageSizePoints', () => {
  it('converts the stock to points at 72 per inch', () => {
    // 60 x 40 mm is 170.079 x 113.386 pt. The MediaBox is the one dimension a
    // printer cannot be talked out of, so it has to come from the layout.
    const [width, height] = pageSizePoints(layout())
    expect(width).toBeCloseTo(60 / MM_PER_POINT, 6)
    expect(height).toBeCloseTo(40 / MM_PER_POINT, 6)
    expect(width).toBeCloseTo(170.0787, 3)
    expect(height).toBeCloseTo(113.3858, 3)
  })
})

describe('toPDF', () => {
  it('draws every bar as a filled rectangle', () => {
    const resolved = layout()
    const canvas = recordingCanvas()
    toPDF(resolved, canvas)

    const rects = canvas.calls.filter((c) => c.op === 'rect')
    expect(rects).toHaveLength(resolved.primitives.filter((p) => p.kind === 'rect').length)
  })

  it('places every rectangle at the millimetre the layout resolved', () => {
    // Converted back from points, so a scale error shows up rather than
    // cancelling out.
    const resolved = layout()
    const canvas = recordingCanvas()
    toPDF(resolved, canvas)

    const expected = resolved.primitives
      .filter((p) => p.kind === 'rect')
      .map((p) => {
        const rect = p as { xMm: number; yMm: number; widthMm: number; heightMm: number }
        return [rect.xMm, rect.yMm, rect.widthMm, rect.heightMm].map((v) => v.toFixed(4)).join()
      })

    const actual = canvas.calls
      .filter((c) => c.op === 'rect')
      .map((c) => (c.args as number[]).map((v) => (v * MM_PER_POINT).toFixed(4)).join())

    expect(actual).toEqual(expected)
  })

  it('puts text on its baseline rather than PDFKit’s default line top', () => {
    // The default would drop every string by its ascent — which reads as a minor
    // styling difference and is a measurable position error.
    const canvas = recordingCanvas()
    toPDF(layout(), canvas)
    const text = canvas.calls.find((c) => c.op === 'text')
    expect(text?.args[3]).toMatchObject({ baseline: 'alphabetic', lineBreak: false })
  })

  it('offsets text horizontally to honour the anchor', () => {
    // PDFKit draws from the left edge and has no text-anchor, so the renderer
    // has to do what SVG gets for free.
    const canvas = recordingCanvas()
    toPDF(
      {
        widthMm: 50,
        heightMm: 20,
        symbols: [],
        pictograms: [],
        elements: [],
        omissions: [],
        primitives: (['start', 'middle', 'end'] as const).map((anchor) => ({
          kind: 'text' as const,
          xMm: 10,
          baselineYMm: 10,
          text: 'ABCD',
          fontSizeMm: 2,
          fontFamily: 'IBM Plex Mono',
          fill: '000000',
          anchor,
        })),
      },
      canvas,
    )

    // widthOfString gives 8 pt for 'ABCD'; x is 10 mm = 28.3465 pt.
    const xs = canvas.calls.filter((c) => c.op === 'text').map((c) => c.args[1] as number)
    expect(xs[0]).toBeCloseTo(28.3465, 3)
    expect(xs[1]).toBeCloseTo(28.3465 - 4, 3)
    expect(xs[2]).toBeCloseTo(28.3465 - 8, 3)
  })

  it('maps font families through the caller’s registry when given one', () => {
    const canvas = recordingCanvas()
    toPDF(layout(), canvas, { fontFor: (family) => `registered:${family}` })
    expect(canvas.calls.find((c) => c.op === 'font')?.args[0]).toBe('registered:IBM Plex Mono')
  })
})

describe('preview == print', () => {
  /**
   * The property the whole architecture exists to guarantee.
   *
   * Both renderers are reduced to the geometry they were handed, in millimetres.
   * If they ever disagree, one of them is doing arithmetic it should not be.
   */
  it('renders the same rectangles to SVG and to PDF', () => {
    const resolved = layout()

    const canvas = recordingCanvas()
    toPDF(resolved, canvas)
    const fromPdf = canvas.calls
      .filter((c) => c.op === 'rect')
      .map((c) => (c.args as number[]).map((v) => +(v * MM_PER_POINT).toFixed(4)))

    const svg = toSVG(resolved)
    const fromSvg = [
      ...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/g),
    ].map((m) => [+m[1]!, +m[2]!, +m[3]!, +m[4]!])

    expect(fromPdf).toHaveLength(fromSvg.length)
    fromPdf.forEach((rect, index) => {
      rect.forEach((value, axis) => {
        expect(value).toBeCloseTo(fromSvg[index]![axis]!, 3)
      })
    })
  })

  /**
   * The same property, for the primitive that made it worth restating.
   *
   * A GHS pictogram is the first thing on a label that rectangles and lines
   * cannot draw, and it is also the first primitive where the two renderers
   * could plausibly have been handed a string and asked to agree about it. They
   * are handed numbers instead, so this reduces both back to those numbers.
   */
  it('renders the same path geometry to SVG and to PDF', () => {
    const commands: PathCommand[] = [
      { op: 'move', xMm: 10, yMm: 5 },
      { op: 'line', xMm: 20, yMm: 15 },
      { op: 'cubic', c1xMm: 22, c1yMm: 17, c2xMm: 24, c2yMm: 19, xMm: 26, yMm: 21 },
      { op: 'close' },
    ]
    const resolved: ResolvedLayout = {
      widthMm: 60,
      heightMm: 40,
      primitives: [
        { kind: 'path', commands, fill: 'ff0000', stroke: '000000', strokeWidthMm: 0.5 },
      ],
      elements: [],
      symbols: [],
      pictograms: [],
      omissions: [],
    }

    const canvas = recordingCanvas()
    toPDF(resolved, canvas)
    const fromPdf = canvas.calls
      .filter((c) => ['moveTo', 'lineTo', 'bezierCurveTo'].includes(c.op))
      .flatMap((c) => (c.args as number[]).map((v) => +(v * MM_PER_POINT).toFixed(4)))

    const svg = toSVG(resolved)
    const d = /<path d="([^"]+)"/.exec(svg)![1]!
    const fromSvg = d.match(/-?[\d.]+/g)!.map(Number)

    expect(fromPdf).toEqual(fromSvg)
    // And the close command reached the PDF side as a real operation.
    expect(canvas.calls.some((c) => c.op === 'closePath')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
  })

  it('fills and strokes a path the same way in both', () => {
    const resolved: ResolvedLayout = {
      widthMm: 10,
      heightMm: 10,
      primitives: [
        {
          kind: 'path',
          commands: [{ op: 'move', xMm: 1, yMm: 1 }],
          fill: '00ff00',
          fillRule: 'evenodd',
        },
      ],
      elements: [],
      symbols: [],
      pictograms: [],
      omissions: [],
    }

    const canvas = recordingCanvas()
    toPDF(resolved, canvas)
    const fill = canvas.calls.find((c) => c.op === 'fill')!
    expect(fill.args).toEqual(['#00ff00', 'evenodd'])

    const svg = toSVG(resolved)
    expect(svg).toContain('fill="#00ff00"')
    expect(svg).toContain('fill-rule="evenodd"')
    // An unfilled path must say so rather than defaulting to black.
    expect(svg).not.toContain('stroke=')
  })

  it('places text at the same millimetre in both', () => {
    const resolved = layout()
    const canvas = recordingCanvas()
    toPDF(resolved, canvas)

    // 'start'-anchored text takes no offset, so it compares directly.
    const expected = resolved.primitives.filter(
      (p) => p.kind === 'text' && (p as { anchor: string }).anchor === 'start',
    )
    const drawn = canvas.calls.filter((c) => c.op === 'text')

    expected.forEach((primitive) => {
      const text = primitive as { text: string; xMm: number; baselineYMm: number }
      const call = drawn.find((c) => c.args[0] === text.text)
      expect((call!.args[1] as number) * MM_PER_POINT).toBeCloseTo(text.xMm, 4)
      expect((call!.args[2] as number) * MM_PER_POINT).toBeCloseTo(text.baselineYMm, 4)
    })
  })
})
