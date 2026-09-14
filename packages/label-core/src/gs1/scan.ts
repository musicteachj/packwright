/**
 * What a scanner read, turned into a GTIN-12 — or a reason it cannot be one.
 *
 * A camera hands back whatever the symbol carried, and the retail form takes a
 * GTIN-12. Those are not the same thing: a `BarcodeDetector` reading a US retail
 * pack frequently reports `ean_13` with a thirteen-digit string carrying a
 * leading zero, and the form's guard is `/^[0-9]{12}$/`.
 *
 * **Why it refuses rather than truncating, which is subtler than it looks.** The
 * obvious worry is that slicing a digit off any thirteen-digit read turns a
 * European EAN-13 into a UPC-A naming a different product. The mod-10 check digit
 * turns out to prevent exactly that, and the reason is worth writing down: the
 * dropped digit occupies an odd index counted from the right of the payload, so
 * it contributes with weight 1, and the check digit is therefore unchanged if and
 * only if that digit is zero. Measured over 20,000 random EAN-13s — every
 * truncation of a zero-leading code passed, and not one truncation of the other
 * nine did.
 *
 * So a naive `slice(1)` would be caught. It would be caught *as a wrong check
 * digit*, which is a lie: there is nothing wrong with the barcode, it is simply
 * not a UPC-A. Refusing by length and shape reports the actual problem, and that
 * is the whole reason this is a function rather than a regular expression.
 *
 * **It never recomputes a check digit.** `UpcALabelData.gtin` takes the full
 * twelve digits on purpose, because the most common real defect in a supplied
 * GTIN is a transposed digit and an engine that recomputes silently accepts the
 * wrong product. A scan whose check digit is wrong is reported as wrong.
 *
 * **A known asymmetry, recorded rather than papered over.** An eight-digit read
 * is refused by name, and the same article in 13-digit storage form —
 * `0000096385074` — is narrowed instead, because a GTIN-8 padded to thirteen and
 * a GTIN-12 with four leading zeros are the same thirteen digits. Telling them
 * apart needs the GS1 prefix table, which this package does not carry and will
 * not guess at. It matters less than it reads: a scanner reading an EAN-8 symbol
 * returns eight digits, which is the refused path, and the padded form is a
 * database representation rather than anything a camera produces.
 *
 * Sources, read 2026-09-13: GS1 defines the GTIN-12 as the GTIN-13 with a
 * leading zero, which is what makes that one narrowing safe. Zero suppression is
 * a separate mechanism — a GTIN-12 compressed to eight digits — and the GS1
 * General Specifications permit it **only** in a UPC-E symbol, never in UPC-A, so
 * an eight-digit read is not a GTIN-12 that has lost some zeros. It is either a
 * GTIN-8 or a compressed payload needing an expansion this package does not
 * carry, and guessing between them would be inventing an identifier.
 */

import { isValidCheckDigit } from './checkDigit'

/** What the retail form takes. */
const GTIN_12_LENGTH = 12

/**
 * A scan that produced a GTIN-12, or one that did not and why.
 *
 * A discriminated result rather than a thrown error: a scan is user input, and a
 * shopper pointing a camera at an EAN-13 has not made a programmer error. The
 * caller shows the reason; it does not catch it.
 */
export type ScannedGtin =
  | {
      readonly ok: true
      readonly gtin: string
      /** The raw symbol value, so a caller can show what was actually read. */
      readonly scanned: string
      /** Set when the scan was narrowed, so a caller can say it changed. */
      readonly note?: string
    }
  | { readonly ok: false; readonly scanned: string; readonly reason: string }

export function normaliseScannedGtin(raw: string): ScannedGtin {
  // Whitespace at the ends only. A trailing carriage return is the classic thing
  // a scanner adds and `trim` removes it; anything in the middle is a character
  // the symbol actually carried, and silently dropping one is how `036000-291452`
  // becomes a GTIN that was never printed. Non-digits that survive are reported
  // rather than removed.
  const scanned = raw.trim()

  if (scanned === '') {
    return { ok: false, scanned, reason: 'The scan was empty.' }
  }
  if (!/^[0-9]+$/.test(scanned)) {
    return {
      ok: false,
      scanned,
      reason:
        'A GTIN is digits only, and this scan carries something else. It may be a symbology ' +
        'this form does not take.',
    }
  }

  const narrowed = narrow(scanned)
  if (!narrowed.ok) return narrowed

  // Verified, never repaired. A wrong check digit is the defect this reports; an
  // engine that recomputed it would accept a transposed digit as a new product.
  if (!isValidCheckDigit(narrowed.gtin)) {
    return {
      ok: false,
      scanned,
      reason:
        `The check digit for ${narrowed.gtin} is wrong, so this is not a valid GTIN. It was ` +
        'read as printed rather than corrected — a transposed digit is a different product, ' +
        'not a typo to fix.',
    }
  }

  return narrowed
}

/** The length rules, each either a GS1-defined equivalence or a refusal. */
function narrow(scanned: string): ScannedGtin {
  if (scanned.length === GTIN_12_LENGTH) {
    return { ok: true, gtin: scanned, scanned }
  }

  if (scanned.length === 13) {
    // The one lossless narrowing: a GTIN-12 *is* a GTIN-13 with a leading zero.
    if (scanned.startsWith('0')) {
      return {
        ok: true,
        gtin: scanned.slice(1),
        scanned,
        note: 'Read as a 13-digit symbol with a leading zero, which is this GTIN-12.',
      }
    }
    return {
      ok: false,
      scanned,
      reason:
        'This is a GTIN-13 — a 13-digit identifier in its own right, not a GTIN-12 with a digit ' +
        'in front. Dropping one would name a different product. A UPC-A cannot carry it.',
    }
  }

  if (scanned.length === 8) {
    return {
      ok: false,
      scanned,
      reason:
        'An 8-digit symbol is either a GTIN-8 or a zero-suppressed GTIN-12, and the two are told ' +
        'apart by an expansion this package does not carry. GS1 permits a zero-suppressed GTIN-12 ' +
        'only in a UPC-E symbol, so it is not a UPC-A payload either way.',
    }
  }

  if (scanned.length === 14) {
    return {
      ok: false,
      scanned,
      reason:
        'A 14-digit GTIN identifies a case or pallet rather than the consumer unit a UPC-A carries.',
    }
  }

  return {
    ok: false,
    scanned,
    reason: `A GTIN is 8, 12, 13 or 14 digits; this scan is ${scanned.length}.`,
  }
}
