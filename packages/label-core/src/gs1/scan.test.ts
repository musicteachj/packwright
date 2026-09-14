/**
 * What a scanner read, and what it must refuse to turn into.
 *
 * **The refusals are the point of this file**, and the reason is not the obvious
 * one. Slicing a digit off a European EAN-13 does not produce a plausible wrong
 * product: the mod-10 check digit catches it, because the dropped digit sits at
 * an odd index counted from the right and so contributes with weight 1 — the
 * check digit survives truncation if and only if that digit is zero, which is
 * precisely the lossless case. Measured below across all ten leading digits.
 *
 * What a naive `slice(1)` would produce is the right refusal for the wrong
 * reason: "the check digit is wrong", about a barcode with nothing wrong with it.
 * These assert the shape is refused on its own terms.
 *
 * Sources, read 2026-09-13: GS1 defines the GTIN-12 as the GTIN-13 with a leading
 * zero, which is what makes that one narrowing lossless. Zero suppression is a
 * separate mechanism — a GTIN-12 compressed to eight digits — permitted by the
 * General Specifications only in a UPC-E symbol.
 */

import { describe, expect, it } from 'vitest'
import { normaliseScannedGtin } from './scan'
import { appendCheckDigit, isValidCheckDigit } from './checkDigit'

/** A real UPC-A, the one the editor opens on. */
const UPC_A = '036000291452'
/** The same article as a 13-digit read, which is what a camera often reports. */
const AS_EAN_13 = `0${UPC_A}`

describe('a scan that is a GTIN-12', () => {
  it('takes twelve digits as they are', () => {
    const result = normaliseScannedGtin(UPC_A)
    expect(result.ok).toBe(true)
    expect(result.ok && result.gtin).toBe(UPC_A)
  })

  it('narrows a 13-digit read that begins with a zero, and says it did', () => {
    // The one lossless narrowing. GS1 defines the GTIN-12 as the GTIN-13 with a
    // leading zero, so this is the same article rather than a near miss.
    const result = normaliseScannedGtin(AS_EAN_13)
    expect(result.ok).toBe(true)
    expect(result.ok && result.gtin).toBe(UPC_A)
    expect(result.ok && result.note, 'a changed value has to say so').toMatch(/leading zero/i)
  })

  it('strips the padding a scanner adds, and nothing else', () => {
    // A trailing carriage return is the classic. Characters inside the payload are
    // reported rather than removed — discarding them is how one product's number
    // becomes another's.
    expect(normaliseScannedGtin(` ${UPC_A}\r\n`).ok).toBe(true)
    expect(normaliseScannedGtin(`036000-291452`).ok, 'a dash inside is not padding').toBe(false)
  })
})

describe('a scan that is not a GTIN-12, and must not be made into one', () => {
  it('refuses a GTIN-13 that is a GTIN-13', () => {
    const european = '4006381333931'
    const result = normaliseScannedGtin(european)

    expect(result.ok, 'a GTIN-13 is not a GTIN-12 with a spare digit').toBe(false)
    expect(!result.ok && result.reason).toMatch(/different product|GTIN-13/i)

    // It is refused for what it is, not for failing a check it was never meant to
    // sit. The truncation would fail the check digit — which is the point of the
    // test below — and reporting *that* would blame the barcode for the form's
    // expectations.
    expect(!result.ok && result.reason, 'the reason must not be about a check digit').not.toMatch(
      /check digit/i,
    )
  })

  it('the check digit already catches naive truncation, and only for a leading zero', () => {
    // Derived and then measured. The dropped digit occupies an odd index counted
    // from the right of the payload, so it contributes with weight 1: the check
    // digit is unchanged if and only if that digit is zero. Which is exactly the
    // one case where truncation is the correct thing to do.
    //
    // It is recorded because a later reader will reasonably wonder why this is a
    // function rather than a `slice`, and the answer is about the error message
    // rather than about safety.
    // **Every leading digit, deliberately.** The first version of this built its
    // payloads with `String(seed).padStart(12, '7')`, so every code it generated
    // began with a 7 and the `lead === '0'` branch — the only interesting one —
    // never ran once. Mutating the expectation to a nonsense number still passed.
    // A measurement test that measures a tenth of the space is worse than none,
    // because the docblock above cites it.
    const survived = new Map<string, { total: number; survived: number }>()

    for (let lead = 0; lead <= 9; lead += 1) {
      for (let seed = 0; seed < 200; seed += 1) {
        const payload = `${lead}${String(seed).padStart(11, '0')}`
        const ean13 = appendCheckDigit(payload)
        const bucket = survived.get(String(lead)) ?? { total: 0, survived: 0 }
        bucket.total += 1
        if (isValidCheckDigit(ean13.slice(1))) bucket.survived += 1
        survived.set(String(lead), bucket)
      }
    }

    expect(survived.size, 'all ten leading digits must be covered').toBe(10)
    for (const [lead, counts] of survived) {
      expect(counts.total, `leading ${lead}`).toBe(200)
      // Survives for a leading zero and for nothing else: the dropped digit sits
      // at an odd index from the right, so it carries weight 1.
      expect(counts.survived, `leading ${lead}`).toBe(lead === '0' ? 200 : 0)
    }
  })

  it('refuses eight digits rather than guessing which kind they are', () => {
    // Either a GTIN-8 or a zero-suppressed GTIN-12, told apart by an expansion
    // this package does not carry — and GS1 permits a zero-suppressed GTIN-12
    // only in a UPC-E symbol, so it is not a UPC-A payload either way.
    const result = normaliseScannedGtin('96385074')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/UPC-E|GTIN-8/)
  })

  it('refuses a case code', () => {
    const result = normaliseScannedGtin('10036000291459')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/case or pallet/i)
  })

  it('refuses a wrong check digit rather than repairing it', () => {
    // `UpcALabelData.gtin` takes the full twelve digits because the most common
    // real defect in a supplied GTIN is a transposed digit, and an engine that
    // recomputes silently accepts the wrong product.
    const transposed = '036000291453'
    const result = normaliseScannedGtin(transposed)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/check digit/i)
    expect(!result.ok && result.reason, 'it must not offer a corrected value').not.toMatch(/291452/)
  })

  it('refuses a payload that is not digits at all', () => {
    // A QR code, a Data Matrix carrying an element string, a driver that prefixed
    // an AIM identifier. None of them is a GTIN-12 and none should be coerced.
    for (const raw of ['https://example.com/01/036000291452', ']E0036000291452', 'ABC123']) {
      const result = normaliseScannedGtin(raw)
      expect(result.ok, raw).toBe(false)
    }
  })

  it('refuses an empty read', () => {
    expect(normaliseScannedGtin('').ok).toBe(false)
    expect(normaliseScannedGtin('   ').ok).toBe(false)
  })
})

describe('what it hands back either way', () => {
  it('always reports what was actually scanned', () => {
    // So a caller can show the symbol value beside the reason, rather than making
    // the reader guess what the camera saw.
    expect(normaliseScannedGtin(` ${AS_EAN_13} `).scanned).toBe(AS_EAN_13)
    expect(normaliseScannedGtin('4006381333931').scanned).toBe('4006381333931')
  })

  it('never returns a GTIN it has not verified', () => {
    // The invariant across the whole surface: every accepted value passes the
    // check digit it was printed with.
    const accepted = ['036000291452', '0036000291452', '  036000291452  ']
      .map((raw) => normaliseScannedGtin(raw))
      .filter((result) => result.ok)

    expect(accepted.length).toBeGreaterThan(0)
    for (const result of accepted) {
      expect(result.ok && isValidCheckDigit(result.gtin)).toBe(true)
      expect(result.ok && result.gtin).toHaveLength(12)
    }
  })
})
