import { describe, expect, it } from 'vitest'
import { DigitalLinkError, buildDigitalLinkUri, parseDigitalLinkUri } from './digitalLink'

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

/**
 * The vectors are the standard's own: GS1 Digital Link URI Syntax 1.7.0, read from
 * https://ref.gs1.org/standards/digital-link/uri-syntax/ on 2026-10-16, lists
 * `/01/09520123456788/22/2A/10/ABC123/21/12345XYZ` and `/01/09520123456788/10/ABC123/`
 * among the paths its gtin-path permits, and `/01/09520123456788/21/12345XYZ/10/ABC123`
 * as one it does not, "in which the sequential ordering of the key qualifier
 * components is not preserved". The custom stem follows its `customURIstem` production.
 */
describe('parseDigitalLinkUri', () => {
  const STANDARD_GTIN = '09520123456788'

  it('takes apart a path the standard permits, every qualifier in order', () => {
    expect(
      parseDigitalLinkUri(`https://id.example.com/01/${STANDARD_GTIN}/22/2A/10/ABC123/21/12345XYZ`),
    ).toEqual({
      stem: 'https://id.example.com',
      primary: { ai: '01', value: STANDARD_GTIN },
      qualifiers: [
        { ai: '22', value: '2A' },
        { ai: '10', value: 'ABC123' },
        { ai: '21', value: '12345XYZ' },
      ],
      attributes: [],
      convenienceAlphas: [],
      unplaced: [],
    })
  })

  it('accepts the trailing slash the standard’s own example ends with', () => {
    expect(
      parseDigitalLinkUri(`https://id.example.com/01/${STANDARD_GTIN}/10/ABC123/`).qualifiers,
    ).toEqual([{ ai: '10', value: 'ABC123' }])
  })

  it('refuses qualifiers out of their defined order, as the standard does', () => {
    expect(() =>
      parseDigitalLinkUri(`https://id.example.com/01/${STANDARD_GTIN}/21/12345XYZ/10/ABC123`),
    ).toThrow(/not in their defined order/)
  })

  it('keeps custom path segments before the primary key as part of the stem', () => {
    const parsed = parseDigitalLinkUri(`https://example.com/products/en/01/${STANDARD_GTIN}`)
    expect(parsed.stem).toBe('https://example.com/products/en')
    expect(parsed.primary).toEqual({ ai: '01', value: STANDARD_GTIN })
  })

  it('records the convenience alphas a printed path uses, rather than refusing them', () => {
    // Case 07's QR code: the rule, not the parser, says what /gtin/ means.
    const parsed = parseDigitalLinkUri('https://id.example.com/gtin/00036000291452/lot/A1')
    expect(parsed.primary).toEqual({ ai: '01', value: '00036000291452' })
    expect(parsed.qualifiers).toEqual([{ ai: '10', value: 'A1' }])
    expect(parsed.convenienceAlphas).toEqual(['gtin', 'lot'])
  })

  it('reads GS1 attributes from the query, leaves other parameters alone, and names AIs it does not know', () => {
    const parsed = parseDigitalLinkUri(
      `https://id.example.com/01/${STANDARD_GTIN}?17=261231&linkType=gs1:pip;3103=000189`,
    )
    expect(parsed.attributes).toEqual([{ ai: '17', value: '261231' }])
    // 3103, net weight, is a GS1 AI this build's table does not hold.
    expect(parsed.unplaced).toEqual(['AI (3103) in its query, which this build does not hold'])
  })

  it('places what the standard may permit and this build does not hold, rather than refusing it', () => {
    // `upui-path = gtin-comp tpx-comp`: (235) after a GTIN is a UPUI path in 1.7.0.
    expect(
      parseDigitalLinkUri(`https://id.example.com/01/${STANDARD_GTIN}/235/XYZ`).unplaced,
    ).toEqual(['(235) after the GTIN'])
    // (414), a GLN, opens a gln-path; this build's table holds no such primary key.
    const gln = parseDigitalLinkUri('https://id.example.com/414/9520123456788/254/A1')
    expect(gln.primary).toBeUndefined()
    expect(gln.unplaced).toEqual(['(414) as its primary key, which this build does not hold'])
    // An attribute's AI in the path is placed too, not refused: this build cannot rule
    // out every path production after a GTIN.
    expect(
      parseDigitalLinkUri(`https://id.example.com/01/${STANDARD_GTIN}/17/261231`).unplaced,
    ).toEqual(['(17) after the GTIN'])
  })

  it('takes the key whose value could be one, past a stem segment named like a key', () => {
    // "sscc" in a custom stem, followed by "01": (00) cannot have "01" as an SSCC.
    const parsed = parseDigitalLinkUri(`https://example.com/sscc/01/${STANDARD_GTIN}`)
    expect(parsed.stem).toBe('https://example.com/sscc')
    expect(parsed.primary).toEqual({ ai: '01', value: STANDARD_GTIN })
  })

  it('keeps a malformed GTIN as the key, so the builder reports it, rather than calling (01) unknown', () => {
    const parsed = parseDigitalLinkUri('https://id.example.com/01/00O36000291452')
    expect(parsed.primary).toEqual({ ai: '01', value: '00O36000291452' })
    expect(parsed.unplaced).toEqual([])
  })

  it('places a key the standard defines and this build does not hold, and nothing else', () => {
    // (2024) is not one of the standard's primary keys: no GS1 key at all.
    expect(() => parseDigitalLinkUri('https://example.com/2024/promo')).toThrow(
      /no GS1 primary key/,
    )
  })

  it('names a repeated qualifier as repeated, not as out of order', () => {
    expect(() =>
      parseDigitalLinkUri(`https://id.example.com/01/${STANDARD_GTIN}/10/A/10/B`),
    ).toThrow(/AI \(10\) appears more than once in the path/)
  })

  it('does not take a stem segment spelled like a key for the key', () => {
    const parsed = parseDigitalLinkUri(`https://example.com/gtin/catalog/01/${STANDARD_GTIN}`)
    expect(parsed.stem).toBe('https://example.com/gtin/catalog')
    expect(parsed.primary).toEqual({ ai: '01', value: STANDARD_GTIN })
    expect(parsed.convenienceAlphas).toEqual([])
  })

  it('does not take a key, a qualifier or a repeat in the query for an attribute', () => {
    expect(
      parseDigitalLinkUri(
        `https://id.example.com/01/${STANDARD_GTIN}?17=261231&17=270101&01=09506000134352&21=S1`,
      ).unplaced,
    ).toEqual([
      'AI (17) more than once in its query',
      'AI (01) in its query, where it is a key or qualifier',
      'AI (21) in its query, where it is a key or qualifier',
    ])
  })

  it('does not widen a short GTIN, which the rule judges against the barcode', () => {
    expect(parseDigitalLinkUri('https://id.example.com/01/036000291452').primary?.value).toBe(
      '036000291452',
    )
  })

  it.each([
    ['no scheme', 'id.example.com/01/09520123456788', /not an http or https web address/],
    ['another scheme', 'ftp://id.example.com/01/09520123456788', /not an http or https/],
    ['a space inside', 'https://id.example.com/01/0952 0123456788', /not an http or https/],
    ['no primary key', 'https://id.example.com/products/123', /no GS1 primary key/],
    ['a key with no value', 'https://id.example.com/01/09520123456788/10', /has no value/],
    ['an empty segment', 'https://id.example.com//01/09520123456788', /empty segment/],
    [
      'user information in the host',
      'https://u:p@id.example.com/01/09520123456788',
      /not a host name/,
    ],
    [
      'a port that is not a number',
      'https://id.example.com:abc/01/09520123456788',
      /not a host name/,
    ],
    ['no host at all', 'https:///01/09520123456788', /not a host name/],
  ])('refuses %s', (_what, uri, reason) => {
    expect(() => parseDigitalLinkUri(uri)).toThrow(DigitalLinkError)
    expect(() => parseDigitalLinkUri(uri)).toThrow(reason)
  })
})
