/**
 * PDF renderer — the second consumer of a `ResolvedLayout`.
 *
 * Like the SVG renderer it does no arithmetic beyond one unit conversion. Every
 * position comes from the layout engine already resolved in millimetres, so the
 * exported PDF and the browser preview are the same drawing rather than two that
 * have to be kept in agreement.
 *
 * `label-core` must not depend on PDFKit — it runs in the browser too — so the
 * canvas is described structurally here and injected by the caller. A real
 * `PDFDocument` satisfies `PdfCanvas` without knowing this interface exists, and
 * a recording stub satisfies it in tests, which is what lets the renderer be
 * verified without a PDF at all.
 *
 * PDF geometry is in points, and PDFKit's origin is the top-left with y
 * increasing downward — the same orientation the layout engine uses, so the
 * conversion is a scale and never a flip.
 */

import { mmToPoints } from '../geometry/units'
import type { LayoutPrimitive, ResolvedLayout, TextAnchor } from '../layout/types'

/**
 * The slice of PDFKit this renderer uses.
 *
 * Methods return `unknown` because PDFKit returns `this` for chaining and we
 * neither need nor want that coupling — declaring the shape we depend on keeps
 * the dependency pointing one way.
 */
export interface PdfCanvas {
  save(): unknown
  restore(): unknown
  rect(x: number, y: number, width: number, height: number): unknown
  fill(color?: string, rule?: string): unknown
  moveTo(x: number, y: number): unknown
  lineTo(x: number, y: number): unknown
  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number,
  ): unknown
  closePath(): unknown
  fillAndStroke(fillColor?: string, strokeColor?: string, rule?: string): unknown
  lineWidth(width: number): unknown
  stroke(color?: string): unknown
  dash(length: number, options?: { space?: number }): unknown
  undash(): unknown
  font(source: string): unknown
  fontSize(size: number): unknown
  fillColor(color: string): unknown
  text(text: string, x: number, y: number, options?: Record<string, unknown>): unknown
  widthOfString(text: string, options?: Record<string, unknown>): number
}

export interface PdfOptions {
  /**
   * Maps a layout font family onto a font the document has registered.
   *
   * PDFKit needs a registered name or a file path; the layout only knows the
   * family it asked for. Without a mapping the renderer falls back to the family
   * name itself, which works for the standard 14 and fails loudly otherwise —
   * better than silently substituting a face and changing every measurement.
   */
  fontFor?: (family: string, weight?: number) => string
}

/** Millimetres are the layout's unit; points are the page's. */
const pt = mmToPoints

/**
 * Converts an anchor into the x offset PDFKit needs.
 *
 * PDFKit has no notion of text-anchor: it draws from the left edge. SVG does,
 * so the layout expresses intent and each renderer satisfies it its own way —
 * which is exactly the division of labour that keeps the two outputs identical.
 */
function anchorOffset(canvas: PdfCanvas, text: string, anchor: TextAnchor): number {
  if (anchor === 'start') return 0
  const width = canvas.widthOfString(text)
  return anchor === 'middle' ? -width / 2 : -width
}

/**
 * The most spaces and tabs one `text()` call is given.
 *
 * PDFKit lays a string out in runs that end at each space or tab, and appends every run
 * to everything laid out before it by copying (`EmbeddedFont.layout`, PDFKit 0.19.1), so
 * one call costs its spaces times its length. A line of artwork 120 KB long blocked the
 * server for 9 s (`docs/security-review-2026-10-18.md`, finding 1). Measured on
 * 2026-10-18 with embedded IBM Plex Sans, 256 KB of text drawn in lines of 256 spaces
 * took 81 ms, of 1,000 spaces 185 ms, and of 8,000 spaces 950 ms; the schema's bounds
 * on stock width and type size still allow about 42,000 spaces in a wrapped line, which
 * is why this is not left to them. No line of a real label comes near 256, so every real
 * label is drawn in one call per line, as before.
 */
export const PDF_TEXT_SPACES_PER_CALL = 256

/**
 * The text cut after every `PDF_TEXT_SPACES_PER_CALL`th space or tab, so the pieces
 * joined are the text.
 *
 * Cut after a space because PDFKit ends a run there anyway in the embedded faces the
 * exporter registers (`EmbeddedFont.layout`): no kerning or shaping spans it, so drawing
 * each piece at the width of those before it places every glyph where one call would
 * have. PDFKit's standard fonts, used only where no `fontFor` maps a family, do kern
 * across a space, so a cut line there can sit up to a twentieth of an em off; the export
 * always maps (`renderPdf.ts`), and only a line of more than 256 spaces is cut.
 */
export function spaceBoundedChunks(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  let spaces = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ' ' && text[i] !== '\t') continue
    spaces++
    if (spaces === PDF_TEXT_SPACES_PER_CALL) {
      chunks.push(text.slice(start, i + 1))
      start = i + 1
      spaces = 0
    }
  }
  if (start < text.length || chunks.length === 0) chunks.push(text.slice(start))
  return chunks
}

function drawPrimitive(canvas: PdfCanvas, primitive: LayoutPrimitive, options: PdfOptions): void {
  switch (primitive.kind) {
    case 'rect':
      canvas.save()
      canvas.rect(
        pt(primitive.xMm),
        pt(primitive.yMm),
        pt(primitive.widthMm),
        pt(primitive.heightMm),
      )
      if (primitive.stroke === undefined) {
        canvas.fill(`#${primitive.fill}`)
      } else {
        if (primitive.strokeWidthMm !== undefined) canvas.lineWidth(pt(primitive.strokeWidthMm))
        canvas.fillAndStroke(`#${primitive.fill}`, `#${primitive.stroke}`)
      }
      canvas.restore()
      return

    case 'line':
      canvas.save()
      canvas.lineWidth(pt(primitive.strokeWidthMm))
      if (primitive.dashMm?.length) {
        const [length, space] = primitive.dashMm
        canvas.dash(pt(length as number), { space: pt((space ?? length) as number) })
      }
      canvas.moveTo(pt(primitive.x1Mm), pt(primitive.y1Mm))
      canvas.lineTo(pt(primitive.x2Mm), pt(primitive.y2Mm))
      canvas.stroke(`#${primitive.stroke}`)
      if (primitive.dashMm?.length) canvas.undash()
      canvas.restore()
      return

    case 'path': {
      canvas.save()
      for (const command of primitive.commands) {
        switch (command.op) {
          case 'move':
            canvas.moveTo(pt(command.xMm), pt(command.yMm))
            break
          case 'line':
            canvas.lineTo(pt(command.xMm), pt(command.yMm))
            break
          case 'cubic':
            canvas.bezierCurveTo(
              pt(command.c1xMm),
              pt(command.c1yMm),
              pt(command.c2xMm),
              pt(command.c2yMm),
              pt(command.xMm),
              pt(command.yMm),
            )
            break
          case 'close':
            canvas.closePath()
            break
        }
      }
      if (primitive.strokeWidthMm !== undefined) canvas.lineWidth(pt(primitive.strokeWidthMm))
      if (primitive.fill !== undefined && primitive.stroke !== undefined) {
        canvas.fillAndStroke(`#${primitive.fill}`, `#${primitive.stroke}`, primitive.fillRule)
      } else if (primitive.fill !== undefined) {
        canvas.fill(`#${primitive.fill}`, primitive.fillRule)
      } else if (primitive.stroke !== undefined) {
        canvas.stroke(`#${primitive.stroke}`)
      }
      canvas.restore()
      return
    }

    case 'text': {
      const family =
        options.fontFor?.(primitive.fontFamily, primitive.fontWeight) ?? primitive.fontFamily
      canvas.save()
      canvas.font(family)
      canvas.fontSize(pt(primitive.fontSizeMm))
      canvas.fillColor(`#${primitive.fill}`)
      const chunks = spaceBoundedChunks(primitive.text)
      let x = pt(primitive.xMm) + anchorOffset(canvas, primitive.text, primitive.anchor)
      for (const [i, chunk] of chunks.entries()) {
        if (i > 0) x += canvas.widthOfString(chunks[i - 1]!)
        canvas.text(
          chunk,
          x,
          pt(primitive.baselineYMm),
          // `alphabetic` puts the given y on the baseline. PDFKit's default is the
          // top of the line box, which would drop every string by its ascent: a
          // shift that looks like a small styling difference and is not.
          { baseline: 'alphabetic', lineBreak: false },
        )
      }
      canvas.restore()
      return
    }
  }
}

/** Page size in points, for constructing the document the layout will be drawn into. */
export function pageSizePoints(layout: ResolvedLayout): [width: number, height: number] {
  return [pt(layout.widthMm), pt(layout.heightMm)]
}

export function toPDF(layout: ResolvedLayout, canvas: PdfCanvas, options: PdfOptions = {}): void {
  for (const primitive of layout.primitives) {
    drawPrimitive(canvas, primitive, options)
  }
}
