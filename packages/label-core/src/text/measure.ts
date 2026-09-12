/**
 * Measuring and wrapping text, deterministically.
 *
 * Line breaks are geometry, and geometry belongs in the resolved layout rather
 * than in a renderer. If the browser wrapped with canvas metrics and the server
 * wrapped with PDFKit's, the two could break a line in different places and the
 * preview would stop being the print. Both call this, over the table in
 * `./metrics`, so they cannot disagree.
 *
 * This is the same reasoning that discards bwip-js's vertical output and draws
 * the human-readable digits separately: where two independent implementations
 * could agree by luck, compute the number once instead.
 */

import { FONT_METRICS } from './metrics'

/** Faces this build carries metrics for. */
export function hasMetrics(fontFamily: string): boolean {
  return fontFamily in FONT_METRICS
}

/**
 * Width of a string in millimetres, at the given em size.
 *
 * A face with no metrics falls back to `IBM Plex Sans`, and a character the face
 * does not carry falls back to that face's stated default. Both are
 * approximations, and both are for *layout* — the text itself is never altered,
 * only where it breaks.
 */
export function measureTextMm(text: string, fontSizeMm: number, fontFamily: string): number {
  const face = FONT_METRICS[fontFamily] ?? FONT_METRICS['IBM Plex Sans']!
  let em = 0
  for (const character of text) {
    em += face.widths[character] ?? face.fallback
  }
  return em * fontSizeMm
}

/**
 * Greedy word wrap to a millimetre width.
 *
 * Breaks on spaces only. A single word wider than the line is left to overflow
 * rather than broken: hyphenation is language-specific and getting it wrong in a
 * hazard statement would be worse than a line that runs long, which at least
 * looks wrong rather than reading wrong.
 *
 * Returns at least one line, so a caller can always draw something.
 */
export function wrapTextMm(
  text: string,
  widthMm: number,
  fontSizeMm: number,
  fontFamily: string,
): string[] {
  if (!Number.isFinite(widthMm) || widthMm <= 0) return [text]

  const lines: string[] = []
  let line = ''

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line === '' ? word : `${line} ${word}`
    if (line !== '' && measureTextMm(candidate, fontSizeMm, fontFamily) > widthMm) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }

  if (line !== '') lines.push(line)
  return lines.length > 0 ? lines : [text]
}
