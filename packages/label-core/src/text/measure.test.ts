import { describe, expect, it } from 'vitest'
import { EU_CLP_HAZARD_STATEMENTS, EU_CLP_PRECAUTIONARY_STATEMENTS } from '../ghs/statements'
import { FONT_METRICS } from './metrics'
import {
  fontSizeMmForGlyphHeight,
  glyphHeightMm,
  hasMetrics,
  measureTextMm,
  wrapTextMm,
} from './measure'

describe('measuring', () => {
  it('carries metrics for every face the exporter embeds', () => {
    // If these fall out of step, a label asks for a face the table cannot
    // measure and silently wraps against the fallback instead.
    for (const face of [
      'IBM Plex Sans',
      'IBM Plex Sans SemiBold',
      'IBM Plex Mono',
      'IBM Plex Mono SemiBold',
    ]) {
      expect(hasMetrics(face), `no metrics for ${face}`).toBe(true)
    }
  })

  it('scales linearly with the em size', () => {
    const at2 = measureTextMm('Keep away from heat', 2, 'IBM Plex Sans')
    const at4 = measureTextMm('Keep away from heat', 4, 'IBM Plex Sans')
    expect(at4).toBeCloseTo(at2 * 2, 9)
  })

  it('measures the monospace face as monospaced', () => {
    // A direct check that the table is really per-face rather than one set of
    // numbers reused, which would be invisible in any width comparison.
    const mono = FONT_METRICS['IBM Plex Mono']!.widths
    const advances = new Set(['i', 'm', 'W', '.'].map((c) => mono[c]))
    expect(advances.size).toBe(1)
    expect(
      new Set(['i', 'm', 'W', '.'].map((c) => FONT_METRICS['IBM Plex Sans']!.widths[c])).size,
    ).toBeGreaterThan(1)
  })

  it('falls back rather than measuring an unknown character as nothing', () => {
    // A zero-width fallback would make a line of unusual characters look like it
    // fits, which is the failure mode worth guarding.
    const known = measureTextMm('nn', 3, 'IBM Plex Sans')
    const unknown = measureTextMm('中文', 3, 'IBM Plex Sans')
    expect(unknown).toBeGreaterThan(0)
    expect(unknown).toBeCloseTo(known, 9)
  })
})

describe('wrapping', () => {
  const PANEL = 66
  const SIZE = 2.6
  const FACE = 'IBM Plex Sans'

  it('breaks every statement in the tables to fit the panel', () => {
    // The defect this was written for: 58 of 199 statements ran off the label.
    const all = { ...EU_CLP_HAZARD_STATEMENTS, ...EU_CLP_PRECAUTIONARY_STATEMENTS }
    for (const [code, text] of Object.entries(all)) {
      for (const line of wrapTextMm(text, PANEL, SIZE, FACE)) {
        expect(measureTextMm(line, SIZE, FACE), `${code} overflows: ${line}`).toBeLessThanOrEqual(
          PANEL,
        )
      }
    }
  })

  it('preserves every word, in order', () => {
    const text = EU_CLP_PRECAUTIONARY_STATEMENTS['P210']!
    const lines = wrapTextMm(text, PANEL, SIZE, FACE)
    expect(lines.length).toBeGreaterThan(1)
    // Wrapping may not alter the statement — only where it breaks.
    expect(lines.join(' ')).toBe(text.split(/\s+/).join(' '))
  })

  it('lets a single over-long word overflow rather than hyphenating it', () => {
    const lines = wrapTextMm('Trinitrotoluenesulphonamidopropanoate', 10, SIZE, FACE)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('Trinitrotoluenesulphonamidopropanoate')
  })

  it('always returns at least one line', () => {
    expect(wrapTextMm('', PANEL, SIZE, FACE)).toHaveLength(1)
    expect(wrapTextMm('word', 0, SIZE, FACE)).toEqual(['word'])
  })

  it('is deterministic, which is the whole reason the table exists', () => {
    // Both renderers call this. If it ever depended on anything ambient, the
    // preview and the print could break a line in different places.
    const text = EU_CLP_HAZARD_STATEMENTS['H373']!
    const once = wrapTextMm(text, PANEL, SIZE, FACE)
    const twice = wrapTextMm(text, PANEL, SIZE, FACE)
    expect(once).toEqual(twice)
    expect(once.length).toBeGreaterThan(1)
  })
})

describe('glyph heights', () => {
  const FACE = 'IBM Plex Sans'

  // 21 CFR 101.7(h)(2) measures a regulated type size by a printed letter, not
  // by the em. These tests pin the gap between the two, because closing the gap
  // by assumption is the defect the whole net-quantity rule set turns on.

  it('reports a capital as taller than a lowercase "o", and both as well under the em', () => {
    const em = 10
    const cap = glyphHeightMm(em, FACE, 'cap-height')
    const o = glyphHeightMm(em, FACE, 'lowercase-o')
    expect(cap).toBeGreaterThan(o)
    expect(cap).toBeLessThan(em)
    // The number that matters: an em is 1.85 "o"s, so comparing a 4.7625 mm
    // minimum against `fontSizeMm` directly would clear type at 54% of it.
    expect(em / o).toBeCloseTo(1.852, 2)
    expect(em / cap).toBeCloseTo(1.433, 2)
  })

  it('does not read the "o" as the x-height', () => {
    // The rejected reading, kept so the decision stays visible. `OS/2.sxHeight`
    // for IBM Plex Sans is 0.516 em, but a round letter overshoots the x-height
    // line top and bottom, so the "o" actually prints at 0.540. The regulation
    // names the letter, so the letter's outline is what is measured.
    expect(FONT_METRICS[FACE]!.lowercaseOHeightEm).toBeCloseTo(0.54, 4)
    expect(FONT_METRICS[FACE]!.lowercaseOHeightEm).toBeGreaterThan(0.516)
  })

  it('scales linearly with the em size', () => {
    expect(glyphHeightMm(20, FACE, 'lowercase-o')).toBeCloseTo(
      2 * glyphHeightMm(10, FACE, 'lowercase-o'),
      10,
    )
  })

  it('falls back to IBM Plex Sans for a face it has no metrics for', () => {
    expect(glyphHeightMm(10, 'Comic Sans MS', 'cap-height')).toBe(
      glyphHeightMm(10, 'IBM Plex Sans', 'cap-height'),
    )
  })

  it('inverts, so a rule can state the em a compliant label would need', () => {
    // 3/16 inch — the 21 CFR 101.7(i) minimum for a panel of more than 25 and
    // not more than 100 square inches. 0.1875 x 25.4 = 4.7625 mm.
    const requiredMm = 4.7625
    const em = fontSizeMmForGlyphHeight(requiredMm, FACE, 'lowercase-o')
    expect(em).toBeCloseTo(8.8194, 3)
    expect(glyphHeightMm(em, FACE, 'lowercase-o')).toBeCloseTo(requiredMm, 10)
    expect(fontSizeMmForGlyphHeight(requiredMm, FACE, 'cap-height')).toBeCloseTo(6.823, 3)
  })
})
