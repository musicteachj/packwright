import { describe, expect, it } from 'vitest'
import {
  REDUCED_FORMAT_MAX_SQ_INCHES,
  SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES,
  formatIsPermitted,
} from './nutritionFormats'

describe('which display a package may use', () => {
  it('carries the two thresholds 101.9(j)(13) states', () => {
    expect(SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES).toBe(12)
    expect(REDUCED_FORMAT_MAX_SQ_INCHES).toBe(40)
  })

  it('always permits the vertical display, whatever the package', () => {
    // It is the one (d) describes; everything else modifies it.
    for (const area of [1, 12, 40, 400]) {
      expect(formatIsPermitted('vertical', { availableSqInches: area }).permitted).toBe(true)
    }
  })

  it('permits a tabular display under 12 in² with nothing else declared', () => {
    expect(formatIsPermitted('tabular', { availableSqInches: 11.9 }).permitted).toBe(true)
  })

  it('refuses one at 12 in² unless the shape cannot take a vertical column', () => {
    // "less than 12 square inches" — 12 itself is not less than 12, and falls to
    // the second limb, which needs the declaration.
    expect(formatIsPermitted('tabular', { availableSqInches: 12 }).permitted).toBe(false)
    expect(
      formatIsPermitted('tabular', { availableSqInches: 12, cannotAccommodateVertical: true })
        .permitted,
    ).toBe(true)
  })

  it('refuses one above 40 in² however the package is shaped', () => {
    // The second limb is capped at 40, so the declaration cannot rescue a
    // larger package.
    const verdict = formatIsPermitted('tabular', {
      availableSqInches: 40.1,
      cannotAccommodateVertical: true,
    })
    expect(verdict.permitted).toBe(false)
    expect(verdict.reason).toContain('40 in² or less')
  })

  it('permits one at exactly 40 in² with the declaration', () => {
    // "40 or less square inches" — inclusive, unlike the 12.
    expect(
      formatIsPermitted('tabular', { availableSqInches: 40, cannotAccommodateVertical: true })
        .permitted,
    ).toBe(true)
  })

  it('gates the linear display behind the tabular one', () => {
    // "Nutrition information may be given in a linear fashion only if the label
    // will not accommodate a tabular display." A small package is entitled to
    // tabular and still not to linear.
    expect(formatIsPermitted('linear', { availableSqInches: 8 }).permitted).toBe(false)
    expect(
      formatIsPermitted('linear', { availableSqInches: 8, cannotAccommodateTabular: true })
        .permitted,
    ).toBe(true)
  })

  it('does not let the linear gate rescue a package too large for either', () => {
    expect(
      formatIsPermitted('linear', {
        availableSqInches: 60,
        cannotAccommodateTabular: true,
      }).permitted,
    ).toBe(false)
  })

  it('cites the paragraph the refusal comes from', () => {
    expect(formatIsPermitted('tabular', { availableSqInches: 60 }).reference).toBe(
      '21 CFR 101.9(j)(13)(ii)(A)',
    )
  })
})
