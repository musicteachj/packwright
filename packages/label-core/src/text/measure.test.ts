import { describe, expect, it } from 'vitest'
import { EU_CLP_HAZARD_STATEMENTS, EU_CLP_PRECAUTIONARY_STATEMENTS } from '../ghs/statements'
import { FONT_METRICS } from './metrics'
import { hasMetrics, measureTextMm, wrapTextMm } from './measure'

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
