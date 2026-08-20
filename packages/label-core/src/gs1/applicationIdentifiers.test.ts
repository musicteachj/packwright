import { describe, expect, it } from 'vitest'
import { listAiSpecs, validateAiValue } from './applicationIdentifiers'

/**
 * Check-digit-bearing AIs, with a valid and an invalid value for each.
 *
 * Every valid value is check-digit correct by hand from the GenSpec §7.9.1
 * weighting, not by running the implementation. `09506000134352` weights to 78,
 * so its check digit is 2; `9506000134352` is the same key without its leading
 * zero, which cannot change the sum because the weighting is anchored to the
 * right. `006141411234567890` weights to 140, so its check digit is 0.
 */
const CHECK_DIGIT_AIS: ReadonlyArray<[ai: string, valid: string, invalid: string]> = [
  ['00', '006141411234567890', '006141411234567891'],
  ['01', '09506000134352', '09506000134353'],
  ['02', '09506000134352', '09506000134353'],
  ['410', '9506000134352', '9506000134353'],
  ['414', '9506000134352', '9506000134353'],
]

describe('validateAiValue check digits', () => {
  it.each(CHECK_DIGIT_AIS)('accepts a valid check digit for AI %s', (ai, valid) => {
    expect(validateAiValue(ai, valid)).toBeNull()
  })

  it.each(CHECK_DIGIT_AIS)('rejects a wrong check digit for AI %s', (ai, _valid, invalid) => {
    // Correct length, all digits — every format rule passes. Without this check
    // the value encodes into a symbol that prints and scans and resolves to an
    // identifier that does not exist.
    expect(validateAiValue(ai, invalid)).toMatch(/invalid check digit/)
  })

  it('names the offending value in the message', () => {
    expect(validateAiValue('01', '09506000134353')).toBe(
      'AI (01) GTIN "09506000134353" has an invalid check digit',
    )
  })

  it('reports length before check digit, so a short key is called short', () => {
    // isValidCheckDigit throws on malformed input rather than returning false,
    // so this ordering is load-bearing, not cosmetic.
    expect(validateAiValue('01', '123')).toMatch(/fixed at 14 characters/)
  })

  it('reports charset before check digit', () => {
    expect(validateAiValue('01', 'abcdefghijklmn')).toMatch(/digits only/)
  })

  it('flags exactly the AIs the GS1 syntax dictionary marks csum', () => {
    // The dictionary carries `csum` on 00, 01, 02, 410 and 414 and on no other
    // AI in this table. Pinning the whole set means adding an AI without its
    // flag fails here rather than silently skipping validation.
    const flagged = listAiSpecs()
      .filter((spec) => spec.checkDigit)
      .map((spec) => spec.ai)
    expect(flagged).toEqual(['00', '01', '02', '410', '414'])
  })

  it('leaves AIs without a check digit alone', () => {
    // A lot number is free-form; there is no digit to verify.
    expect(validateAiValue('10', 'ABC123')).toBeNull()
    expect(validateAiValue('17', '261231')).toBeNull()
  })
})
