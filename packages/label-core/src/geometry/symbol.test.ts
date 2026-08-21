import { describe, expect, it } from 'vitest'
import {
  EAN_UPC_NOMINAL_X_DIMENSION_MM,
  barPatternWidthMm,
  nominalBarHeightMm,
  symbolMetricsFor,
  GENERAL_QUIET_ZONE,
  hasVerifiedQuietZone,
  isMagnificationInRange,
  magnificationToXDimensionMm,
  quietZoneFor,
  quietZoneMm,
  totalSymbolWidthMm,
  xDimensionMmToMagnification,
} from './symbol'

describe('quietZoneFor', () => {
  it('requires 9X on both sides of a UPC-A', () => {
    expect(quietZoneFor('UPC-A')).toEqual({ leftX: 9, rightX: 9 })
  })

  it('requires an asymmetric zone for UPC-E', () => {
    // 9X left, 7X right — the asymmetry is real and easy to miss when a layout
    // is centred by eye.
    expect(quietZoneFor('UPC-E')).toEqual({ leftX: 9, rightX: 7 })
  })

  it('requires 11X on the left of an EAN-13', () => {
    // GenSpec figure 5.2.3.4-1. The general 7X floor is 4X short here, and the
    // shortfall is invisible: the symbol looks correctly margined and fails at
    // the till. This is the case that makes the floor unsafe as a default.
    expect(quietZoneFor('EAN-13')).toEqual({ leftX: 11, rightX: 7 })
  })

  it('requires 7X on both sides of an EAN-8', () => {
    expect(quietZoneFor('EAN-8')).toEqual({ leftX: 7, rightX: 7 })
  })

  it.each(['ITF-14', 'GS1-128'] as const)('requires 10X on both sides of %s', (symbology) => {
    // ITF-14 GenSpec §5.3.2.2, GS1-128 §5.4.6.3 — both 10X, not the 7X floor.
    expect(quietZoneFor(symbology)).toEqual({ leftX: 10, rightX: 10 })
  })

  it('falls back to the general 7X floor for symbologies without a verified rule', () => {
    // CODE128 is not GS1-governed; its quiet zone comes from ISO/IEC 15417 and
    // has not been confirmed against a source document, so it stays unverified
    // rather than being guessed at.
    expect(quietZoneFor('CODE128')).toEqual(GENERAL_QUIET_ZONE)
    expect(hasVerifiedQuietZone('CODE128')).toBe(false)
  })

  it.each(['UPC-A', 'UPC-E', 'EAN-13', 'EAN-8', 'ITF-14', 'GS1-128'] as const)(
    'marks %s as verified against the General Specifications',
    (symbology) => {
      expect(hasVerifiedQuietZone(symbology)).toBe(true)
    },
  )

  it('never reports a verified requirement below the specification floor', () => {
    // Guards the direction of the bug this table was written to fix: every
    // verified entry must be at least the 7X general minimum, never under it.
    for (const symbology of ['UPC-A', 'UPC-E', 'EAN-13', 'EAN-8', 'ITF-14', 'GS1-128'] as const) {
      const { leftX, rightX } = quietZoneFor(symbology)
      expect(leftX).toBeGreaterThanOrEqual(GENERAL_QUIET_ZONE.leftX)
      expect(rightX).toBeGreaterThanOrEqual(GENERAL_QUIET_ZONE.rightX)
    }
  })
})

describe('quietZoneMm', () => {
  it('scales the quiet zone with the X-dimension', () => {
    // At nominal 0.33 mm, a UPC-A needs 2.97 mm clear on each side.
    const { leftMm, rightMm } = quietZoneMm('UPC-A', EAN_UPC_NOMINAL_X_DIMENSION_MM)
    expect(leftMm).toBeCloseTo(2.97, 6)
    expect(rightMm).toBeCloseTo(2.97, 6)
  })

  it('shrinks the quiet zone when the symbol is scaled down', () => {
    const { leftMm } = quietZoneMm('UPC-A', magnificationToXDimensionMm(0.8))
    expect(leftMm).toBeCloseTo(2.376, 6)
  })
})

describe('magnification', () => {
  it('round-trips X-dimension and magnification', () => {
    const x = magnificationToXDimensionMm(1.5)
    expect(xDimensionMmToMagnification(x)).toBeCloseTo(1.5, 10)
  })

  it('treats nominal as 100%', () => {
    expect(xDimensionMmToMagnification(EAN_UPC_NOMINAL_X_DIMENSION_MM)).toBeCloseTo(1, 10)
  })

  it.each([
    [0.79, false],
    [0.8, true],
    [1, true],
    [2, true],
    [2.01, false],
  ])('magnification %f in range: %s', (magnification, expected) => {
    expect(isMagnificationInRange(magnification)).toBe(expected)
  })
})

describe('barPatternWidthMm', () => {
  it.each([
    ['UPC-A', 95],
    ['EAN-13', 95],
    ['EAN-8', 67],
    ['UPC-E', 51],
  ] as const)('%s bar pattern is %i modules', (symbology, modules) => {
    // GenSpec figure 5.2.3.5-1 tabulates the total *including* quiet zones, so
    // the bar pattern is that total minus both zones. UPC-A: 113 − 9 − 9 = 95.
    // EAN-13 lands on the same 95 from a different split, 113 − 11 − 7, which is
    // a useful coincidence: both carry twelve data digits plus guards.
    const x = EAN_UPC_NOMINAL_X_DIMENSION_MM
    expect(barPatternWidthMm(symbology, x)).toBeCloseTo(modules * x, 10)
  })

  it('is undefined for a symbology whose length varies with its payload', () => {
    // GS1-128 grows with the data, so there is no figure to look up.
    expect(barPatternWidthMm('GS1-128', 0.33)).toBeUndefined()
  })
})

describe('totalSymbolWidthMm', () => {
  it('reconstructs the tabulated total from the bar pattern and quiet zones', () => {
    // The round trip that pins the relationship: bars + both quiet zones must
    // equal GenSpec's tabulated 113 modules, 37.29 mm at nominal.
    //
    // This test previously passed 37.29 as the bar-pattern width — but 37.29 mm
    // *is* the 113-module total, so it added quiet zones a second time and
    // asserted a symbol 43.23 mm wide. It passed only because it was
    // tautological, and the layout engine is about to consume these numbers.
    const x = EAN_UPC_NOMINAL_X_DIMENSION_MM
    const bars = barPatternWidthMm('UPC-A', x) as number

    expect(bars).toBeCloseTo(31.35, 10)
    expect(totalSymbolWidthMm('UPC-A', bars, x)).toBeCloseTo(37.29, 10)
    expect(totalSymbolWidthMm('UPC-A', bars, x)).toBeCloseTo(113 * x, 10)
  })

  it('accounts for both quiet zones, not just the bars', () => {
    // A layout sized to the bars alone looks like it fits and does not.
    const x = EAN_UPC_NOMINAL_X_DIMENSION_MM
    expect(totalSymbolWidthMm('UPC-A', 10, x)).toBeCloseTo(10 + 2.97 * 2, 6)
  })
})

describe('symbolMetricsFor', () => {
  it('gives the nominal height for the EAN/UPC family', () => {
    // GenSpec §5.2.3.2 — 22.85 mm for EAN-13, UPC-A and UPC-E; EAN-8 is shorter.
    expect(symbolMetricsFor('UPC-A')?.nominalHeightMm).toBe(22.85)
    expect(symbolMetricsFor('EAN-8')?.nominalHeightMm).toBe(18.23)
  })

  it('has no entry for variable-length symbologies', () => {
    expect(symbolMetricsFor('ITF-14')).toBeUndefined()
  })
})

describe('nominalBarHeightMm', () => {
  it.each([
    [0.8, 18.28],
    [1, 22.85],
    [2, 45.7],
  ])('a UPC-A at %fx is %f mm tall', (magnification, expected) => {
    // GenSpec figure 5.12.3.1-1 tabulates minimum symbol height against each
    // X-dimension: 18.28 mm at X = 0.264, 22.85 at 0.330, 45.70 at 0.660. Those
    // are the specification's own numbers, and they are exactly 22.85 x the
    // magnification — so height scales with the symbol rather than being fixed.
    const x = EAN_UPC_NOMINAL_X_DIMENSION_MM * magnification
    expect(nominalBarHeightMm('UPC-A', x)).toBeCloseTo(expected, 2)
  })

  it('is shorter for EAN-8, which the specification sizes separately', () => {
    expect(nominalBarHeightMm('EAN-8', EAN_UPC_NOMINAL_X_DIMENSION_MM)).toBeCloseTo(18.23, 10)
  })

  it('is undefined for a symbology with no tabulated height', () => {
    expect(nominalBarHeightMm('GS1-128', 0.33)).toBeUndefined()
  })
})
