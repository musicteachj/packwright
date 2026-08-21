import { describe, expect, it } from 'vitest'
import { buildPrintTestSheet, PRINT_TEST_EXPECTED_GTIN } from './printTestSheet'

describe('print test sheet', () => {
  const sheet = buildPrintTestSheet()

  it('is A4, so it prints on what is already in the tray', () => {
    expect([sheet.widthMm, sheet.heightMm]).toEqual([210, 297])
  })

  it('carries four symbols — three magnifications and a control', () => {
    expect(sheet.symbols).toHaveLength(4)
    expect(sheet.symbols.map((s) => s.xDimensionMm)).toEqual([0.264, 0.33, 0.66, 0.33])
  })

  it('encodes the same GTIN in every symbol', () => {
    // The whole sheet is one identifier at different sizes. If they differed, a
    // failed scan would be ambiguous.
    for (const symbol of sheet.symbols) {
      expect(symbol.value).toBe(PRINT_TEST_EXPECTED_GTIN)
    }
  })

  it('obstructs the control’s quiet zone on both sides', () => {
    // Without this the sheet cannot distinguish "our geometry is right" from
    // "this phone decodes anything".
    const sabotage = sheet.primitives.filter((p) => p.elementId?.startsWith('sabotage-'))
    expect(sabotage.map((p) => p.elementId)).toEqual(['sabotage-left', 'sabotage-right'])
  })

  it('leaves the other three quiet zones clear', () => {
    const control = sheet.symbols[3]!
    const obstructions = sheet.primitives.filter((p) => p.elementId?.startsWith('sabotage-'))
    for (const rect of obstructions) {
      const r = rect as { yMm: number }
      // Every obstruction belongs to the control block, which is the lowest on
      // the page — so none of them can be sitting over a good symbol.
      expect(r.yMm).toBeCloseTo(control.yMm, 6)
    }
  })

  it('scales the digits with the symbol', () => {
    const sizes = sheet.primitives
      .filter(
        (p) => p.kind === 'text' && (p as { fontFamily: string }).fontFamily === 'IBM Plex Mono',
      )
      .map((p) => (p as { fontSizeMm: number }).fontSizeMm)
    // Four blocks x four digit groups, at 0.8x, 1x, 2x, 1x.
    expect([...new Set(sizes)].sort((a, b) => a - b)).toEqual([2.2, 2.75, 5.5])
  })

  it('fits inside the page margins', () => {
    // buildPrintTestSheet throws rather than overflowing, so reaching here is
    // the assertion; this pins the bottom edge too.
    const lowest = Math.max(
      ...sheet.primitives.map((p) =>
        p.kind === 'rect'
          ? (p as { yMm: number; heightMm: number }).yMm + (p as { heightMm: number }).heightMm
          : (p as { baselineYMm: number }).baselineYMm,
      ),
    )
    expect(lowest).toBeLessThan(297 - 18)
  })
})
