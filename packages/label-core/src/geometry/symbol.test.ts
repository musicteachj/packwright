import { describe, expect, it } from 'vitest'
import {
  EAN_UPC_NOMINAL_X_DIMENSION_MM,
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

  it('falls back to the general 7X minimum for symbologies without a verified rule', () => {
    expect(quietZoneFor('CODE128')).toEqual(GENERAL_QUIET_ZONE)
    expect(hasVerifiedQuietZone('CODE128')).toBe(false)
  })

  it('marks the symbologies whose rules have been verified', () => {
    expect(hasVerifiedQuietZone('UPC-A')).toBe(true)
    expect(hasVerifiedQuietZone('UPC-E')).toBe(true)
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

describe('totalSymbolWidthMm', () => {
  it('accounts for both quiet zones, not just the bars', () => {
    // A layout sized to the symbol alone looks like it fits and does not.
    const x = EAN_UPC_NOMINAL_X_DIMENSION_MM
    expect(totalSymbolWidthMm('UPC-A', 37.29, x)).toBeCloseTo(37.29 + 2.97 * 2, 6)
  })
})
