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

const table = {}
for (const [name, path] of Object.entries(FACES)) {
  const font = fontkit.openSync(path)
  const em = font.unitsPerEm
  const widths = {}
  for (const ch of CHARS) {
    const [glyph] = font.glyphsForString(ch)
    if (glyph === undefined) continue
    widths[ch] = Math.round((glyph.advanceWidth / em) * 10000) / 10000
  }
  // The fallback for anything outside the set: the advance of a lowercase n,
  // which is close to the average for both families.
  table[name] = { fallback: widths['n'], widths }
}

const json = JSON.stringify(table, null, 2)
writeFileSync(
  'packages/label-core/src/text/metrics.ts',
  `/**
 * Advance widths for the faces this project embeds, in em units.
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
  /** Advance per character, in em. */
  widths: Readonly<Record<string, number>>
}

export const FONT_METRICS: Readonly<Record<string, FaceMetrics>> = ${json}
`,
)
console.log(
  `  wrote metrics for ${Object.keys(table).length} faces, ${CHARS.length} characters each`,
)
