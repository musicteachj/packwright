/**
 * GS1 standard check digit calculation.
 *
 * One algorithm covers GTIN-8, GTIN-12 (UPC-A), GTIN-13 (EAN-13), GTIN-14
 * (ITF-14) and SSCC-18: weight the data digits alternately 3 and 1 starting
 * from the rightmost, sum, and take the difference to the next multiple of ten.
 *
 * Reference: GS1 General Specifications, "Check digit calculation".
 */

/** Structures that use the GS1 mod-10 check digit, with their total length. */
export const GS1_KEY_LENGTHS = {
  'GTIN-8': 8,
  'GTIN-12': 12,
  'GTIN-13': 13,
  'GTIN-14': 14,
  SSCC: 18,
} as const

export type Gs1KeyKind = keyof typeof GS1_KEY_LENGTHS

const DIGITS_ONLY = /^[0-9]+$/

export class Gs1FormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Gs1FormatError'
  }
}

/**
 * Calculates the check digit for a payload that does *not* already include one.
 *
 * @param payload The data digits, check digit omitted.
 * @returns A single digit, 0–9.
 */
export function calculateCheckDigit(payload: string): number {
  if (!DIGITS_ONLY.test(payload)) {
    throw new Gs1FormatError(`Expected digits only, received "${payload}"`)
  }

  let sum = 0
  // Weighting is anchored to the right, not the left, so that the same routine
  // works for every key length without special-casing.
  for (let i = 0; i < payload.length; i++) {
    const digit = Number(payload[payload.length - 1 - i])
    sum += i % 2 === 0 ? digit * 3 : digit
  }

  return (10 - (sum % 10)) % 10
}

/** Appends the correct check digit to a payload that omits one. */
export function appendCheckDigit(payload: string): string {
  return `${payload}${calculateCheckDigit(payload)}`
}

/**
 * Verifies a complete key whose final character is its check digit.
 * Returns false rather than throwing for a wrong digit; throws only when the
 * input could not be a GS1 key at all.
 */
export function isValidCheckDigit(key: string): boolean {
  if (!DIGITS_ONLY.test(key) || key.length < 2) {
    throw new Gs1FormatError(`Expected at least two digits, received "${key}"`)
  }

  const payload = key.slice(0, -1)
  const stated = Number(key[key.length - 1])
  return calculateCheckDigit(payload) === stated
}

/** True when the key's length matches a known GS1 key structure. */
export function isKnownKeyLength(key: string): boolean {
  return Object.values(GS1_KEY_LENGTHS).some((length) => length === key.length)
}

/**
 * Widens any GTIN to its 14-digit form by left-padding with zeros.
 *
 * GTIN-8, -12 and -13 are all valid on packaging, but a GTIN-14 is the
 * canonical form for storage and comparison — so `036000291452` and
 * `00036000291452` are recognised as the same product rather than two.
 */
export function normaliseToGtin14(gtin: string): string {
  if (!DIGITS_ONLY.test(gtin)) {
    throw new Gs1FormatError(`Expected digits only, received "${gtin}"`)
  }
  if (gtin.length > 14) {
    throw new Gs1FormatError(`A GTIN cannot exceed 14 digits, received ${gtin.length}`)
  }
  return gtin.padStart(14, '0')
}
