import { describe, expect, it } from 'vitest'
import {
  Gs1FormatError,
  appendCheckDigit,
  calculateCheckDigit,
  isKnownKeyLength,
  isValidCheckDigit,
  normaliseToGtin14,
} from './checkDigit'

/**
 * Provenance of these vectors matters more than their quantity.
 *
 * Every expected value below was worked through by hand from the published
 * algorithm BEFORE the implementation existed — none was produced by running
 * the code and pasting the result. A check-digit test whose expectation came
 * out of the function under test proves only that the function is
 * deterministic.
 *
 * TODO(verify): `09506000134352` and the SSCC are taken from GS1's published
 * Digital Link and logistics-label examples as reproduced in secondary
 * documentation, not from the General Specifications PDF directly. Re-confirm
 * against the GenSpec itself and delete this note.
 */

describe('calculateCheckDigit', () => {
  it('computes the GS1 Digital Link reference GTIN-14', () => {
    // 09506000134352 — the GTIN used throughout GS1's Digital Link examples.
    expect(calculateCheckDigit('0950600013435')).toBe(2)
  })

  it('computes a GTIN-12 / UPC-A', () => {
    // 036000291452 — long-standing published UPC-A example.
    expect(calculateCheckDigit('03600029145')).toBe(2)
  })

  it('computes an SSCC-18', () => {
    // 006141411234567890 — GS1 logistics-label example form.
    expect(calculateCheckDigit('00614141123456789')).toBe(0)
  })

  it('yields zero when the weighted sum is already a multiple of ten', () => {
    // Guards the (10 - 0) % 10 branch, which naive implementations return as 10.
    expect(calculateCheckDigit('00000000000')).toBe(0)
  })

  it('rejects non-numeric input', () => {
    expect(() => calculateCheckDigit('0360002914X')).toThrow(Gs1FormatError)
  })
})

describe('isValidCheckDigit', () => {
  it.each([
    ['09506000134352', true],
    ['036000291452', true],
    ['006141411234567890', true],
  ])('accepts %s', (key, expected) => {
    expect(isValidCheckDigit(key)).toBe(expected)
  })

  it('rejects a transcription error in the final digit', () => {
    expect(isValidCheckDigit('09506000134353')).toBe(false)
  })

  it('rejects a transposition in the middle of the key', () => {
    // Adjacent transpositions are exactly what the alternating 3/1 weighting
    // is designed to catch, so this is the case worth pinning.
    expect(isValidCheckDigit('09506000134532')).toBe(false)
  })

  it('throws on input that could not be a key at all', () => {
    expect(() => isValidCheckDigit('7')).toThrow(Gs1FormatError)
  })
})

describe('appendCheckDigit', () => {
  it('produces a complete, self-consistent key', () => {
    const key = appendCheckDigit('0950600013435')
    expect(key).toBe('09506000134352')
    expect(isValidCheckDigit(key)).toBe(true)
  })
})

describe('normaliseToGtin14', () => {
  it('widens a UPC-A to GTIN-14 without changing identity', () => {
    expect(normaliseToGtin14('036000291452')).toBe('00036000291452')
  })

  it('leaves a GTIN-14 untouched', () => {
    expect(normaliseToGtin14('09506000134352')).toBe('09506000134352')
  })

  it('preserves check-digit validity across normalisation', () => {
    // Zero-padding must not disturb the weighting, or the same product would
    // validate in one form and fail in another.
    expect(isValidCheckDigit(normaliseToGtin14('036000291452'))).toBe(true)
  })

  it('refuses anything longer than a GTIN-14', () => {
    expect(() => normaliseToGtin14('006141411234567890')).toThrow(Gs1FormatError)
  })
})

describe('isKnownKeyLength', () => {
  it.each([
    ['12345678', true],
    ['036000291452', true],
    ['09506000134352', true],
    ['006141411234567890', true],
    ['1234567', false],
  ])('%s → %s', (key, expected) => {
    expect(isKnownKeyLength(key)).toBe(expected)
  })
})
