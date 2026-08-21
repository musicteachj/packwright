/**
 * SVG renderer — one of the two consumers of a `ResolvedLayout`.
 *
 * It does no arithmetic. Every position and size in the output is a number the
 * layout engine already computed in millimetres, which is what makes the browser
 * preview and the exported PDF the same artefact rather than two drawings that
 * happen to agree.
 *
 * The `width`/`height` attributes carry explicit `mm` units while the `viewBox`
 * is expressed in the same bare numbers. That pairing is what makes one user
 * unit equal one millimetre, so a symbol the engine placed at 12.97 mm prints at
 * 12.97 mm — and a browser asked to print the SVG at 100% produces a scannable
 * symbol rather than a decorative one.
 *
 * Pure string building, no DOM: it runs in the browser for live preview, on the
 * server for snapshot tests, and in Vitest unchanged.
 */

import type { LayoutPrimitive, ResolvedLayout } from '../layout/types'

/** Trims float noise without rounding away real precision. */
function mm(value: number): string {
  return Number.parseFloat(value.toFixed(4)).toString()
}

/**
 * Escapes the five characters XML cannot carry literally.
 *
 * Label text is user-supplied — a product name is free-form — so this is the
 * difference between rendering an ampersand and emitting a broken document.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function attr(name: string, value: string | undefined): string {
  return value === undefined ? '' : ` ${name}="${escapeXml(value)}"`
}

function renderPrimitive(primitive: LayoutPrimitive): string {
  const id = attr('data-element-id', primitive.elementId)

  switch (primitive.kind) {
    case 'rect':
      return (
        `<rect x="${mm(primitive.xMm)}" y="${mm(primitive.yMm)}" ` +
        `width="${mm(primitive.widthMm)}" height="${mm(primitive.heightMm)}" ` +
        `fill="#${primitive.fill}"${id}/>`
      )

    case 'line':
      return (
        `<line x1="${mm(primitive.x1Mm)}" y1="${mm(primitive.y1Mm)}" ` +
        `x2="${mm(primitive.x2Mm)}" y2="${mm(primitive.y2Mm)}" ` +
        `stroke="#${primitive.stroke}" stroke-width="${mm(primitive.strokeWidthMm)}"` +
        (primitive.dashMm ? ` stroke-dasharray="${primitive.dashMm.map(mm).join(' ')}"` : '') +
        `${id}/>`
      )

    case 'text':
      return (
        `<text x="${mm(primitive.xMm)}" y="${mm(primitive.baselineYMm)}" ` +
        `font-family="${escapeXml(primitive.fontFamily)}" ` +
        `font-size="${mm(primitive.fontSizeMm)}" ` +
        `fill="#${primitive.fill}" text-anchor="${primitive.anchor}"${id}>` +
        `${escapeXml(primitive.text)}</text>`
      )
  }
}

export interface SvgOptions {
  /**
   * Accessible name for the drawing.
   *
   * The canvas is an image to a screen reader, so it needs a text equivalent.
   * Omitting it produces a valid SVG and an inaccessible one.
   */
  title?: string
}

export function toSVG(layout: ResolvedLayout, options: SvgOptions = {}): string {
  const { widthMm, heightMm } = layout
  const title = options.title ? `<title>${escapeXml(options.title)}</title>` : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${mm(widthMm)}mm" height="${mm(heightMm)}mm" ` +
    `viewBox="0 0 ${mm(widthMm)} ${mm(heightMm)}"` +
    `${options.title ? ' role="img"' : ''}>` +
    title +
    layout.primitives.map(renderPrimitive).join('') +
    `</svg>`
  )
}
