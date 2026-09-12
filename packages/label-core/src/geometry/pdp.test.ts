import { describe, expect, it } from 'vitest'
import {
  isNetQuantityZoneRequired,
  minNetQuantityTypeHeightInches,
  minNetQuantityTypeHeightMm,
  netQuantityZoneTopMm,
  pdpAreaSqInches,
  pdpAreaSqMm,
} from './pdp'
import { inchesToMm } from './units'

describe('pdpAreaSqMm', () => {
  it('uses the full face of a rectangular panel', () => {
    expect(pdpAreaSqMm({ shape: 'rectangular', widthMm: 100, heightMm: 150 })).toBe(15_000)
  })

  it('takes 40% of height x circumference for a cylinder', () => {
    // 21 CFR 101.1 — a cylinder has no flat front, so the regulation fixes the
    // share rather than asking anyone to measure a curve.
    expect(pdpAreaSqMm({ shape: 'cylindrical', heightMm: 100, circumferenceMm: 200 })).toBe(8_000)
  })

  it('takes 40% of total surface for any other shape', () => {
    expect(pdpAreaSqMm({ shape: 'other', totalSurfaceAreaSqMm: 10_000 })).toBe(4_000)
  })

  it('does not apply the 40% fraction to rectangular panels', () => {
    // The mistake worth pinning: applying the non-rectangular fraction across
    // the board understates every rectangular panel by 60%, which quietly
    // relaxes every type-size minimum that depends on it.
    const rect = pdpAreaSqMm({ shape: 'rectangular', widthMm: 100, heightMm: 100 })
    const other = pdpAreaSqMm({ shape: 'other', totalSurfaceAreaSqMm: 10_000 })
    expect(rect).toBe(10_000)
    expect(other).toBe(4_000)
  })
})

describe('pdpAreaSqInches', () => {
  it('converts a one-inch-square panel to 1 in²', () => {
    const oneInch = inchesToMm(1)
    expect(
      pdpAreaSqInches({ shape: 'rectangular', widthMm: oneInch, heightMm: oneInch }),
    ).toBeCloseTo(1, 10)
  })
})

describe('minNetQuantityTypeHeightInches', () => {
  it.each([
    [3, 1 / 16],
    [12, 1 / 8],
    [30, 3 / 16],
    [200, 1 / 4],
    [500, 1 / 2],
  ])('a %i in² panel requires %f inch type', (area, expected) => {
    expect(minNetQuantityTypeHeightInches(area)).toBe(expected)
  })

  it.each([
    [5, 1 / 16],
    [25, 1 / 8],
    [100, 3 / 16],
    [400, 1 / 4],
  ])('places exactly %i in² in the lower band', (area, expected) => {
    // 21 CFR 101.7(i) reads "more than 5 but not more than 25", so the boundary
    // value belongs to the band below. Off-by-one here silently under-sizes
    // type on every package that lands exactly on a threshold.
    expect(minNetQuantityTypeHeightInches(area)).toBe(expected)
  })

  it('moves to the next band just above a threshold', () => {
    expect(minNetQuantityTypeHeightInches(5.01)).toBe(1 / 8)
    expect(minNetQuantityTypeHeightInches(400.01)).toBe(1 / 2)
  })
})

describe('minNetQuantityTypeHeightMm', () => {
  it('converts the 3/16 inch band to millimetres', () => {
    expect(minNetQuantityTypeHeightMm(30)).toBeCloseTo(4.7625, 4)
  })
})

describe('a declaration formed in the surface rather than printed', () => {
  // 21 CFR 101.7(i), closing sentence: "Where the declaration is blown,
  // embossed, or molded on a glass or plastic surface rather than by printing,
  // typing, or coloring, the lettering sizes specified [...] shall be increased
  // by one-sixteenth of an inch."
  it.each([
    [3, 1 / 16 + 1 / 16],
    [12, 1 / 8 + 1 / 16],
    [30, 3 / 16 + 1 / 16],
    [200, 1 / 4 + 1 / 16],
    [500, 1 / 2 + 1 / 16],
  ])('adds 1/16 inch to the %i in² band', (area, expected) => {
    expect(minNetQuantityTypeHeightInches(area, 'blown-embossed-or-molded')).toBeCloseTo(
      expected,
      10,
    )
  })

  it('defaults to printed, so the increase is opt-in rather than assumed', () => {
    expect(minNetQuantityTypeHeightInches(30)).toBe(minNetQuantityTypeHeightInches(30, 'printed'))
    expect(minNetQuantityTypeHeightInches(30)).toBe(3 / 16)
  })

  it('moves a molded 30 in² panel from 3/16 to 1/4 inch', () => {
    // The practical consequence, in the units the label is drawn in: a molded
    // HDPE bottle needs a third more type than the table alone would suggest.
    expect(minNetQuantityTypeHeightMm(30, 'blown-embossed-or-molded')).toBeCloseTo(6.35, 4)
  })
})

describe('netQuantityZoneTopMm', () => {
  it('starts the permitted zone 70% down the panel', () => {
    // The declaration must sit within the bottom 30% of the PDP.
    expect(netQuantityZoneTopMm(150)).toBeCloseTo(105, 10)
  })
})

describe('the obvious-panel exception for otherwise shaped containers', () => {
  it('uses 40% of total surface when there is no obvious panel', () => {
    expect(pdpAreaSqMm({ shape: 'other', totalSurfaceAreaSqMm: 1000 })).toBeCloseTo(400, 10)
  })

  it('uses the entire top surface when the container presents an obvious panel', () => {
    // 21 CFR 101.1(c): "where such container presents an obvious 'principal
    // display panel' such as the top of a triangular or circular package of
    // cheese, the area shall consist of the entire top surface." Applying the
    // 40% rule here understates the panel, which understates every type-size
    // minimum that keys off it.
    expect(
      pdpAreaSqMm({ shape: 'other', totalSurfaceAreaSqMm: 1000, obviousPanelAreaSqMm: 620 }),
    ).toBeCloseTo(620, 10)
  })
})

describe('isNetQuantityZoneRequired', () => {
  it.each([
    [1, false],
    [5, false],
    [5.1, true],
    [30, true],
  ])('a %f sq in panel requires the bottom-30%% zone: %s', (sqIn, expected) => {
    // 21 CFR 101.7(f) exempts a panel of 5 square inches or less. A placement
    // rule that skips this check reports a violation against a small package
    // that is fully compliant.
    expect(isNetQuantityZoneRequired(sqIn)).toBe(expected)
  })
})
