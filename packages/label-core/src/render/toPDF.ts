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
      canvas.text(
        primitive.text,
        pt(primitive.xMm) + anchorOffset(canvas, primitive.text, primitive.anchor),
        pt(primitive.baselineYMm),
        // `alphabetic` puts the given y on the baseline. PDFKit's default is the
        // top of the line box, which would drop every string by its ascent —
        // a shift that looks like a small styling difference and is not.
        { baseline: 'alphabetic', lineBreak: false },
      )
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
