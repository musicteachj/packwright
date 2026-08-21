import { describe, expect, it } from 'vitest'
import { DigitalLinkError, buildDigitalLinkUri } from './digitalLink'

const DOMAIN = 'https://id.example.com'
const GTIN = '09506000134352'

describe('buildDigitalLinkUri', () => {
  it('builds the canonical GTIN link with numeric AIs', () => {
    // Numeric AIs are the only conformant path form. Convenience alphas were
    // removed in Digital Link URI Syntax 1.3.0, so they cannot be the default.
    expect(buildDigitalLinkUri({ domain: DOMAIN, primary: { ai: '01', value: GTIN } })).toBe(
      'https://id.example.com/01/09506000134352',
    )
  })

  it('still emits convenience alphas when a caller explicitly opts in', () => {
    // Retained only to round-trip URIs generated before the 1.3.0 removal.
    expect(
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: GTIN },
        useConvenienceAlphas: true,
      }),
    ).toBe('https://id.example.com/gtin/09506000134352')
  })

  it('widens a UPC-A to GTIN-14 so one product yields one URI', () => {
    // Otherwise the same product on two pack sizes resolves to two addresses.
    expect(
      buildDigitalLinkUri({ domain: DOMAIN, primary: { ai: '01', value: '036000291452' } }),
    ).toBe('https://id.example.com/01/00036000291452')
  })

  it('orders qualifiers canonically regardless of input order', () => {
    // Serial supplied before lot; the spec's sequence for GTIN is cpv, lot, ser.
    expect(
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: GTIN },
        qualifiers: [
          { ai: '21', value: '12345' },
          { ai: '10', value: 'ABC123' },
        ],
      }),
    ).toBe('https://id.example.com/01/09506000134352/10/ABC123/21/12345')
  })

  it('puts attributes in the query string', () => {
    expect(
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: GTIN },
        attributes: [{ ai: '17', value: '261231' }],
      }),
    ).toBe('https://id.example.com/01/09506000134352?17=261231')
  })

  it('tolerates a trailing slash on the domain', () => {
    expect(
      buildDigitalLinkUri({
        domain: 'https://id.example.com/',
        primary: { ai: '01', value: GTIN },
      }),
    ).toBe('https://id.example.com/01/09506000134352')
  })

  it('percent-encodes qualifier values', () => {
    expect(
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: GTIN },
        qualifiers: [{ ai: '10', value: 'LOT/01' }],
      }),
    ).toBe('https://id.example.com/01/09506000134352/10/LOT%2F01')
  })

  it('refuses an AI that cannot open a path', () => {
    expect(() =>
      buildDigitalLinkUri({ domain: DOMAIN, primary: { ai: '10', value: 'ABC123' } }),
    ).toThrow(DigitalLinkError)
  })

  it('refuses a GTIN whose check digit is wrong', () => {
    // A resolvable URI carrying an invalid identifier is worse than an error:
    // it looks correct everywhere until something tries to scan the product.
    expect(() =>
      buildDigitalLinkUri({ domain: DOMAIN, primary: { ai: '01', value: '09506000134353' } }),
    ).toThrow(DigitalLinkError)
  })

  it('refuses a non-numeric GTIN with this module’s own error type', () => {
    // 'ABCDEFGH' is a valid GTIN *length*, so it passed the length check and
    // reached normaliseToGtin14, which raises Gs1FormatError — a type a caller
    // of this module has no reason to catch.
    expect(() =>
      buildDigitalLinkUri({ domain: DOMAIN, primary: { ai: '01', value: 'ABCDEFGH' } }),
    ).toThrow(DigitalLinkError)
  })

  it('refuses a GTIN that is not a valid key length', () => {
    // '12348' carries a mathematically correct check digit and pads to the
    // well-formed GTIN-14 00000000012348, because left-padding zeros cannot
    // change a right-anchored 3/1 weighted sum. Length has to be checked on the
    // key as printed, or this resolves to a plausible URI for a product that
    // does not exist.
    expect(() =>
      buildDigitalLinkUri({ domain: DOMAIN, primary: { ai: '01', value: '12348' } }),
    ).toThrow(DigitalLinkError)
  })

  // GTIN-8, -12, -13 and -14 are all legitimate on a pack. Each check digit here
  // is computed by hand from the 3/1 weighting, not read off the implementation:
  // 1234567 weights to 60, so its check digit is 0.
  it.each(['12345670', '036000291452', '9506000134352', '09506000134352'])(
    'accepts the valid GTIN key length %s',
    (gtin) => {
      expect(() =>
        buildDigitalLinkUri({ domain: DOMAIN, primary: { ai: '01', value: gtin } }),
      ).not.toThrow()
    },
  )

  it('refuses an SSCC of the wrong length', () => {
    expect(() =>
      buildDigitalLinkUri({ domain: DOMAIN, primary: { ai: '00', value: '12348' } }),
    ).toThrow(DigitalLinkError)
  })

  it('refuses a duplicated qualifier', () => {
    // /10/A/10/B names two lots at once, and which one survives depends on sort
    // stability rather than on anything the caller asked for.
    expect(() =>
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: GTIN },
        qualifiers: [
          { ai: '10', value: 'A' },
          { ai: '10', value: 'B' },
        ],
      }),
    ).toThrow(DigitalLinkError)
  })

  it('refuses an empty qualifier value, and says it is missing', () => {
    // Previously produced a dangling '/10/' segment. The reason matters as much
    // as the rejection: an empty value is missing, not a character-set problem.
    expect(() =>
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: GTIN },
        qualifiers: [{ ai: '10', value: '' }],
      }),
    ).toThrow(/accepts 1–20 characters, received 0/)
    expect(() =>
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: GTIN },
        qualifiers: [{ ai: '10', value: '' }],
      }),
    ).toThrow(DigitalLinkError)
  })

  it('refuses a malformed attribute value', () => {
    // AI 17 is a fixed six-digit date. The element-string path already rejected
    // this; the query string accepted anything at all.
    expect(() =>
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: GTIN },
        attributes: [{ ai: '17', value: 'not-a-date' }],
      }),
    ).toThrow(DigitalLinkError)
  })

  it('refuses a qualifier that does not qualify this key', () => {
    expect(() =>
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: GTIN },
        qualifiers: [{ ai: '17', value: '261231' }],
      }),
    ).toThrow(DigitalLinkError)
  })
})
