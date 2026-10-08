/**
 * The two measurements `generate-font-metrics.mjs` takes of a face, apart from the
 * script that writes them, so the suite can hold them to what they claim.
 *
 * **A face that lacks a character answers with `.notdef`, not with nothing.**
 * fontkit maps an unmapped code point to glyph 0, whose advance is a real number —
 * 0.472 em in Plex Sans — and the guards here once tested for `undefined`, which
 * never arrives. A missing character would have been recorded at `.notdef`'s width
 * instead of being left out for `measureTextMm` to fall back on, and a missing "o"
 * or "H" would have been measured from the box `.notdef` draws.
 */

/** Four decimal places of an em — the precision `metrics.ts` is written to. */
export const round = (value) => Math.round(value * 10000) / 10000

/** Whether the face really draws this character, rather than its `.notdef` box. */
export const hasGlyph = (font, ch) => font.hasGlyphForCodePoint(ch.codePointAt(0))

/** Advance widths in em, for the characters the face actually has. */
export function widthsOf(font, chars) {
  const widths = {}
  for (const ch of chars) {
    if (!hasGlyph(font, ch)) continue
    const [glyph] = font.glyphsForString(ch)
    widths[ch] = round(glyph.advanceWidth / font.unitsPerEm)
  }
  return widths
}

/** The printed height of a character's outline, in em; a face lacking it is an error. */
export function heightOf(font, ch, name) {
  if (!hasGlyph(font, ch)) throw new Error(`${name} has no glyph for "${ch}"`)
  const [glyph] = font.glyphsForString(ch)
  return (glyph.bbox.maxY - glyph.bbox.minY) / font.unitsPerEm
}
