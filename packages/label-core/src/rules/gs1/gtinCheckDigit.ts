/**
 * The GTIN's check digit must be the one the GS1 algorithm computes.
 *
 * One of two rules in the set that read the label document rather than the
 * resolved geometry — the Digital Link is the other — and deliberately so: a
 * check digit is a fact about a number, not about ink. It is also the only rule
 * whose failure means there is no geometry to read — no encoder will produce a
 * UPC-A with a wrong check digit, because the twelfth digit *is* the check digit.
 * The engine records the omission; this says why it happened, and cites the
 * algorithm.
 *
 * Source: GS1 General Specifications Standard, Release 26.0 (Ratified Jan 26),
 * §7.9.1 and table 7-8, read from https://ref.gs1.org/standards/genspecs/ on
 * 2026-09-17. The citation carried no release, section or reading date until
 * then, which made it unverifiable rather than wrong — a distinction this
 * project does not draw. `gs1/checkDigit.ts` records what table 7-8 says.
 */

import { calculateCheckDigit, isValidCheckDigit } from '../../gs1/checkDigit'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnDocument } from '../finding'
import type { Gs1RetailContext, Gs1RetailRule } from '../types'

export const GS1_GTIN_CHECK_DIGIT_INVALID = 'GS1_GTIN_CHECK_DIGIT_INVALID'
export const GS1_GTIN_CHECK_DIGIT_VALID = 'GS1_GTIN_CHECK_DIGIT_VALID'

const CITATION: Citation = {
  authority: 'GS1',
  reference: 'GS1 General Specifications 26.0 §7.9.1',
  title: 'Standard check digit calculations for GS1 data structures',
}

const GTIN_12 = /^[0-9]{12}$/

export const gtinCheckDigitRule: Gs1RetailRule = {
  id: 'gs1/gtin-check-digit',
  title: 'A GTIN-12 ends in the check digit computed from its first eleven digits.',
  citation: CITATION,
  codes: [GS1_GTIN_CHECK_DIGIT_INVALID, GS1_GTIN_CHECK_DIGIT_VALID],
  appliesTo: 'gs1-retail',

  check({ data, layout }: Gs1RetailContext): Finding[] {
    // A half-typed GTIN is a form-validation matter, not a compliance verdict.
    // Reporting it as non-compliant would fire on every keystroke.
    if (!GTIN_12.test(data.gtin)) return []

    const elementId = layout.omissions[0]?.elementId ?? layout.symbols[0]?.elementId

    if (isValidCheckDigit(data.gtin)) {
      return [
        // Computed from the GTIN's own digits: true of the number whether or not a symbol printed.
        passedOnDocument(
          gtinCheckDigitRule,
          GS1_GTIN_CHECK_DIGIT_VALID,
          `The check digit for ${data.gtin} is correct.`,
          elementId,
        ),
      ]
    }

    const stated = data.gtin.slice(-1)
    const expected = String(calculateCheckDigit(data.gtin.slice(0, -1)))

    return [
      finding(gtinCheckDigitRule, {
        code: GS1_GTIN_CHECK_DIGIT_INVALID,
        severity: 'blocking',
        message:
          `The check digit for ${data.gtin} should be ${expected}, not ${stated}. ` +
          'No UPC-A symbol can encode this GTIN, so none was drawn.',
        measurement: { actual: stated, required: expected },
        ...(elementId === undefined ? {} : { elementId }),
      }),
    ]
  },
}
