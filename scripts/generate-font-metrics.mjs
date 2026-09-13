/**
 * Generates `packages/label-core/src/text/metrics.ts` from the embedded fonts.
 *
 * Run with `npm run generate:font-metrics` after changing the font files.
 *
 * **Why a table rather than measuring at run time.** Line breaks are geometry.
 * If the browser measured with canvas and the server measured with PDFKit, the
 * two could break a line in different places and the preview would stop being
 * the print — the one property this architecture exists to protect. A table
 * shipped inside `label-core` is measured once, here, and both consumers read
 * identical numbers by construction.
 *
 * Kerning is deliberately not included. It almost always *narrows* a pair, so
 * ignoring it overestimates width and wraps a little early — the safe direction.
 * Including it would mean shipping a kern-pair table and still only matching the
 * renderers approximately, since each applies features its own way.
 *
 * **Why vertical metrics are here too.** 21 CFR 101.7(i) sets the net quantity
 * minimum type size as a letter *height*, and 101.7(h)(2) names which letter:
 * a capital by default, the lowercase "o" when the declaration is set with any
 * lower case. Neither is the em. Without these two numbers a rule can only
 * compare against `fontSizeMm`, which is roughly 1.85x the "o" — passing type
 * at little over half the legal minimum.
 */
import * as fontkit from 'fontkit'
import { writeFileSync } from 'node:fs'

const FACES = {
  'IBM Plex Sans': 'assets/fonts/ttf/IBMPlexSans-Regular.ttf',
  'IBM Plex Sans SemiBold': 'assets/fonts/ttf/IBMPlexSans-SemiBold.ttf',
  'IBM Plex Mono': 'assets/fonts/ttf/IBMPlexMono-Regular.ttf',
  'IBM Plex Mono SemiBold': 'assets/fonts/ttf/IBMPlexMono-SemiBold.ttf',
}

/**
 * ASCII printable plus Latin-1 letters and the punctuation the regulations and
 * ordinary product names actually use. Anything outside this falls back to a
 * stated default rather than silently measuring as zero.
 */
const CHARS = [
  ...Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i)),
  ...Array.from({ length: 0xff - 0xa0 + 1 }, (_, i) => String.fromCharCode(0xa0 + i)),
  ...'…—–‘’“”×²³°µ',
]

const round = (value) => Math.round(value * 10000) / 10000

const table = {}
for (const [name, path] of Object.entries(FACES)) {
  const font = fontkit.openSync(path)
  const em = font.unitsPerEm
  const widths = {}
  for (const ch of CHARS) {
    const [glyph] = font.glyphsForString(ch)
    if (glyph === undefined) continue
    widths[ch] = round(glyph.advanceWidth / em)
  }

  // The printed height of a glyph is its outline's bounding box, not a table
  // entry. For a round letter the two differ: `o` overshoots the x-height line
  // at the top and the baseline at the bottom, so it prints taller than
  // `OS/2.sxHeight`. The regulation names the letter, so the letter is what is
  // measured. `H` is flat-topped and sits exactly on `OS/2.sCapHeight`, which
  // is the cross-check asserted below.
  const heightOf = (ch) => {
    const [glyph] = font.glyphsForString(ch)
    if (glyph === undefined) throw new Error(`${name} has no glyph for "${ch}"`)
    return (glyph.bbox.maxY - glyph.bbox.minY) / em
  }
  const lowercaseOHeightEm = heightOf('o')
  const capHeightEm = heightOf('H')

  // Two bounds against tables this generator did not produce, so the numbers
  // are checked against something rather than only against themselves.
  const capHeightFromOs2 = font.capHeight / em
  if (Math.abs(capHeightEm - capHeightFromOs2) > 0.001) {
    throw new Error(
      `${name}: cap height from the H outline (${round(capHeightEm)}) disagrees with ` +
        `OS/2.sCapHeight (${round(capHeightFromOs2)})`,
    )
  }
  const xHeightFromOs2 = font.xHeight / em
  if (!(lowercaseOHeightEm > xHeightFromOs2 && lowercaseOHeightEm < xHeightFromOs2 * 1.1)) {
    throw new Error(
      `${name}: the "o" (${round(lowercaseOHeightEm)}) should exceed OS/2.sxHeight ` +
        `(${round(xHeightFromOs2)}) by a small overshoot, and does not`,
    )
  }

  table[name] = {
    fallback: widths['n'],
    lowercaseOHeightEm: round(lowercaseOHeightEm),
    capHeightEm: round(capHeightEm),
    widths,
  }
}

const json = JSON.stringify(table, null, 2)
writeFileSync(
  'packages/label-core/src/text/metrics.ts',
  `/**
 * Metrics for the faces this project embeds, in em units.
 *
 * **Generated — do not edit.** Produced by \`scripts/generate-font-metrics.mjs\`
 * from the TTFs in \`assets/fonts\`; run \`npm run generate:font-metrics\` after
 * changing a font.
 *
 * This table exists so that line breaking is deterministic. Measuring at run
 * time would mean the browser using canvas metrics and the server using
 * PDFKit's, and two measurements that agree today and diverge on one character
 * tomorrow would move a line break in the preview and not in the print. Both
 * read these numbers instead, so they cannot disagree.
 *
 * Kerning is not included; see the generator for why. The effect is to
 * overestimate a string's width slightly, which wraps marginally early rather
 * than marginally late.
 */

export interface FaceMetrics {
  /** Advance for a character the table does not carry, in em. */
  fallback: number
  /**
   * Printed height of the lowercase "o", in em — the glyph's bounding box, so it
   * includes the overshoot a round letter carries above the x-height line and
   * below the baseline. Larger than \`OS/2.sxHeight\` for that reason.
   *
   * 21 CFR 101.7(h)(2) makes this the measured dimension whenever a net quantity
   * declaration is set with any lower case.
   */
  lowercaseOHeightEm: number
  /**
   * Printed height of a capital letter, in em. The default basis under
   * 21 CFR 101.7(h)(2): "Letter heights pertain to upper case or capital
   * letters."
   */
  capHeightEm: number
  /** Advance per character, in em. */
  widths: Readonly<Record<string, number>>
}

export const FONT_METRICS: Readonly<Record<string, FaceMetrics>> = ${json}
`,
)
console.log(
  `  wrote metrics for ${Object.keys(table).length} faces, ${CHARS.length} characters each`,
)
