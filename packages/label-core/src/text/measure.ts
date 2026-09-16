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

import { FONT_METRICS, type FaceMetrics } from './metrics'

/** Faces this build carries metrics for. */
export function hasMetrics(fontFamily: string): boolean {
  // `in` walks the prototype chain, so `hasMetrics('toString')` answered true
  // and the lookup below then resolved to a function.
  return Object.hasOwn(FONT_METRICS, fontFamily)
}

/** A face with no metrics falls back to `IBM Plex Sans`. */
function faceFor(fontFamily: string): FaceMetrics {
  return (
    (hasMetrics(fontFamily) ? FONT_METRICS[fontFamily] : undefined) ??
    FONT_METRICS['IBM Plex Sans']!
  )
}

/** The weight from which a face is set in SemiBold, as `renderPdf` embeds it. */
const SEMIBOLD_FROM_WEIGHT = 600

/**
 * The family a string should be measured in: the face it prints in.
 *
 * `measureTextMm` takes a family and no weight, so bold text measured under its
 * own family reads 3–5% narrow — narrow enough for a bold line to print past the
 * edge of its stock while a bounds check says it fits. Resolved the way
 * `renderPdf`'s `embeddedFontFor` resolves the face it embeds, so the width
 * checked and the width printed come from the same face.
 *
 * Only the bounds checks use it so far. Wrapping still measures in the family's
 * Regular widths, which `docs/BACKLOG.md` keeps as a stage of its own; a line it
 * wraps too long is at least recorded by the check rather than lost.
 */
export function measuredFamilyFor(fontFamily: string, fontWeight?: number): string {
  if (fontWeight === undefined || fontWeight < SEMIBOLD_FROM_WEIGHT) return fontFamily
  const semibold = `${fontFamily} SemiBold`
  return hasMetrics(semibold) ? semibold : fontFamily
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
  const face = faceFor(fontFamily)
  let em = 0
  for (const character of text) {
    em += face.widths[character] ?? face.fallback
  }
  return em * fontSizeMm
}

/**
 * Which letter a regulated type-size minimum is measured by.
 *
 * Both are printed heights, and neither is the em. Choosing between them is a
 * reading of the regulation, not a property of the font, so callers decide —
 * see `rules/usFood/netQuantityTypeSize.ts` for 21 CFR 101.7(h)(2)'s.
 */
export type GlyphBasis = 'cap-height' | 'lowercase-o'

/**
 * Printed height, in millimetres, of the letter a type-size rule measures.
 *
 * `fontSizeMm` is the em — the number a renderer is handed. It is roughly 1.85
 * times the lowercase "o" and 1.43 times a capital, so a rule that compares a
 * regulated minimum against it directly passes type at little over half the
 * requirement. This converts, so that comparison can be made honestly.
 */
export function glyphHeightMm(fontSizeMm: number, fontFamily: string, basis: GlyphBasis): number {
  const face = faceFor(fontFamily)
  const ratio = basis === 'cap-height' ? face.capHeightEm : face.lowercaseOHeightEm
  return ratio * fontSizeMm
}

/**
 * The em size at which the given letter prints at least `heightMm` tall — the
 * inverse of `glyphHeightMm`, for stating what a label would need rather than
 * only that what it has is too small.
 */
export function fontSizeMmForGlyphHeight(
  heightMm: number,
  fontFamily: string,
  basis: GlyphBasis,
): number {
  const face = faceFor(fontFamily)
  const ratio = basis === 'cap-height' ? face.capHeightEm : face.lowercaseOHeightEm
  return heightMm / ratio
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
