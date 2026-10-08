import * as fontkit from 'fontkit'
import { describe, expect, it } from 'vitest'
import { heightOf, widthsOf } from './fontMetrics.mjs'

// Run from the repository root, as the generator is.
const sans = fontkit.openSync('assets/fonts/ttf/IBMPlexSans-Regular.ttf')

// Two characters Plex Sans does not carry. The premise is checked rather than
// assumed: fontkit hands back glyph 0 for each, a box with a real advance.
const MISSING = ['一', '☃']

describe('measuring a face', () => {
  it('leaves out a character the face does not have, rather than recording .notdef', () => {
    for (const ch of MISSING) expect(sans.glyphsForString(ch)[0].name).toBe('.notdef')

    const widths = widthsOf(sans, ['n', ...MISSING])
    expect(Object.keys(widths)).toEqual(['n'])
    expect(widths.n).toBeCloseTo(568 / 1000, 4)
  })

  it('refuses to measure the height of a character the face does not have', () => {
    expect(() => heightOf(sans, MISSING[0], 'IBM Plex Sans')).toThrow(/has no glyph/)
    expect(heightOf(sans, 'H', 'IBM Plex Sans')).toBeCloseTo(sans.capHeight / sans.unitsPerEm, 3)
  })
})
