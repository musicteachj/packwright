import { describe, expect, it } from 'vitest'
import {
  DigitalLinkError,
  buildDigitalLinkUri,
  judgeCustomUriStem,
  parseDigitalLinkUri,
} from './digitalLink'

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

  it.each([
    ['https://', 'https:///01/09506000134352'],
    ['https:///', 'https:///01/09506000134352'],
    ['https://id.example.com//', 'https://id.example.com/01/09506000134352'],
  ])('strips the trailing slashes of %o, short of the scheme’s', (domain, uri) => {
    // `https://` lost its "//" and built `https:/01/…` (found by review, 2026-10-17).
    expect(buildDigitalLinkUri({ domain, primary: { ai: '01', value: GTIN } })).toBe(uri)
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

  it('percent-encodes the symbols encodeURIComponent leaves alone, as §4.2 writes them', () => {
    // URI Syntax 1.7.0 §4.2, read 2026-10-16: LeftBracket = "%28", RightBracket = "%29",
    // Asterisk = "%2A", Exclamation = "%21", Apostrophe = "%27". `/10/A(1)` passed before.
    expect(
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: GTIN },
        qualifiers: [{ ai: '10', value: "A(1)*!'" }],
        attributes: [{ ai: '240', value: 'B(2)' }],
      }),
    ).toBe('https://id.example.com/01/09506000134352/10/A%281%29%2A%21%27?240=B%282%29')
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
    [
      'a primary key with no value',
      'https://id.example.com/01',
      /"01" ends the path with no value/,
    ],
    [
      'a stem word spelled like a key, last',
      'https://example.com/products/00',
      // Either reading, a key with no value or no key at all, is said.
      /"00" ends the path with no value after it, and no GS1 primary key with a value/,
    ],
    [
      'an empty segment from the key on',
      'https://id.example.com/01//09520123456788',
      /empty segment/,
    ],
    [
      'user information in the host',
      'https://u:p@id.example.com/01/09520123456788',
      /user information/,
    ],
    [
      'a port that is not a number',
      'https://id.example.com:abc/01/09520123456788',
      /"abc" is not a port number/,
    ],
    [
      'a bad host before a missing key, naming the host',
      'https://u:p@id.example.com/products/123',
      /user information/,
    ],
    ['a host with a space', 'https://id example.com/01/09520123456788', /not an http or https/],
    ['an IPv6 literal that is not one', 'https://[2001:db8::g]/01/09520123456788', /IP address/],
    ['a stem character a URI must encode', `https://example.com/a{b/01/${STANDARD_GTIN}`, /a\{b/],
  ])('refuses %s', (_what, uri, reason) => {
    expect(() => parseDigitalLinkUri(uri)).toThrow(DigitalLinkError)
    expect(() => parseDigitalLinkUri(uri)).toThrow(reason)
  })

  /*
   * §4.11 of URI Syntax 1.7.0, re-read 2026-10-16: `host = IP-literal / IPv4address /
   * reg-name`, `reg-name = *( unreserved / pct-encoded / sub-delims )`, `hostname = host
   * [ ":" port]` and `segment = *pchar`. Each of these was refused under §4 before the
   * medium review of 2026-10-16.
   */
  it.each([
    ['an underscore in the host', `https://id_example.com/01/${STANDARD_GTIN}`],
    ['an IPv6 literal', `https://[2001:db8::1]/01/${STANDARD_GTIN}`],
    ['an IPvFuture literal', `https://[v1.fe80::a+en1]/01/${STANDARD_GTIN}`],
    ['an IPv6 literal ending in IPv4', `https://[::ffff:192.0.2.1]:8443/01/${STANDARD_GTIN}`],
    ['a percent-encoded host', `https://id%2Dexample.com/01/${STANDARD_GTIN}`],
    ['a port', `https://id.example.com:8443/01/${STANDARD_GTIN}`],
    ['an empty stem segment', `https://id.example.com//01/${STANDARD_GTIN}`],
  ])('accepts %s, which the grammar permits', (_what, uri) => {
    expect(parseDigitalLinkUri(uri).primary).toEqual({ ai: '01', value: STANDARD_GTIN })
  })

  it('places an empty host, which the grammar allows and no resolver can serve', () => {
    expect(parseDigitalLinkUri(`https:///01/${STANDARD_GTIN}`).unplaced).toEqual([
      'no host name, which no resolver can serve',
    ])
  })

  it('takes a short GTIN for the key, not a stem segment spelled "gtin", when neither is sound', () => {
    // Found by the medium review of 2026-10-16: the first candidate was taken, so
    // `gtin` was reported as a convenience alpha and "catalog" as the bad GTIN.
    const parsed = parseDigitalLinkUri('https://example.com/gtin/catalog/01/12345')
    expect(parsed.stem).toBe('https://example.com/gtin/catalog')
    expect(parsed.primary).toEqual({ ai: '01', value: '12345' })
    expect(parsed.convenienceAlphas).toEqual([])
    expect(parsed.unplaced).toEqual([])
  })

  it('takes a sound GTIN past a stem segment spelled like a key this build does not hold', () => {
    // Found by the same review: "414" opened the path as a GLN, and the link was
    // declined as one this build cannot judge.
    const parsed = parseDigitalLinkUri(`https://brand.com/414/01/${STANDARD_GTIN}`)
    expect(parsed.stem).toBe('https://brand.com/414')
    expect(parsed.primary).toEqual({ ai: '01', value: STANDARD_GTIN })
    expect(parsed.unplaced).toEqual([])
  })

  it('takes a malformed GTIN past a key this build does not hold whose value names a key', () => {
    // Found by the per-commit review of the fix above: "414" took the path whenever the
    // GTIN after it was malformed, and the link stood down instead of being faulted.
    const parsed = parseDigitalLinkUri('https://brand.com/414/01/12345')
    expect(parsed.stem).toBe('https://brand.com/414')
    expect(parsed.primary).toEqual({ ai: '01', value: '12345' })
  })

  it('places a plausible key and value in the stem, before the key it takes', () => {
    const parsed = parseDigitalLinkUri(`https://x.com/414/1234567890128/01/${STANDARD_GTIN}`)
    expect(parsed.primary).toEqual({ ai: '01', value: STANDARD_GTIN })
    expect(parsed.unplaced).toEqual([
      '"414/1234567890128" in its stem, which reads as a GS1 key and value too',
    ])
  })

  /*
   * §4.5 of URI Syntax 1.7.0, read 2026-10-17, worked by hand: for each primary key, a
   * value its format takes and one just outside it. Before a GTIN path, the first makes
   * the stem ambiguous, and the second leaves it a plain stem.
   */
  it.each([
    ['8006', '095201234567880102', '09520123456788010'], // 14DIGIT 2DIGIT 2DIGIT
    ['8013', 'ABC', 'A'.repeat(26)], // 1*25 XCHAR
    ['8010', 'AB-12', 'ab'], // 1*30 YCHAR, no lower case
    ['414', '1234567890123', '123456789012'], // 13DIGIT
    ['415', '1234567890123', '123456789012'],
    ['417', '1234567890123', '123456789012'],
    ['8017', '123456789012345678', '12345678901234567'], // 18DIGIT
    ['8018', '123456789012345678', '12345678901234567'],
    ['255', '1234567890123', '123456789012'], // 13DIGIT [1*12DIGIT]
    ['00', '123456789012345678', '12345678901234567'], // 18DIGIT
    ['253', '1234567890123ABC', '123456789012'], // 13DIGIT [1*17XCHAR]
    ['401', 'GINC1', 'G'.repeat(31)], // 1*30XCHAR
    ['402', '12345678901234567', '1234567890123456'], // 17DIGIT
    ['8003', '1234567890123', '12345678901'], // 13DIGIT [1*16XCHAR]
    ['8004', 'thing', 't'.repeat(31)], // 1*30 XCHAR
  ])('reads (%s) in a stem by its §4.5 format', (code, fits, misses) => {
    const plain = (value: string) => {
      const parsed = parseDigitalLinkUri(`https://x.com/${code}/${value}/01/${STANDARD_GTIN}`)
      return parsed.primary?.ai === '01' && parsed.unplaced.length === 0
    }
    expect(plain(fits)).toBe(false)
    expect(plain(misses)).toBe(true)
  })

  it('takes a GTIN path past a GIAI, which only (7040) may follow', () => {
    // `mid-path = giai-comp uic-ext-comp` (URI Syntax 1.7.0): read as a GIAI, this path
    // is not conformant, and read as a stem and a GTIN it is.
    const parsed = parseDigitalLinkUri(`https://brand.com/8004/01/${STANDARD_GTIN}`)
    expect(parsed.stem).toBe('https://brand.com/8004')
    expect(parsed.primary).toEqual({ ai: '01', value: STANDARD_GTIN })
  })
})

describe('parseDigitalLinkUri on a value as printed, by §4.2', () => {
  const GTIN_PATH = 'https://id.example.com/01/09520123456788'

  it.each([
    ['"<" in a lot', `${GTIN_PATH}/10/A<B`, /AI \(10\), "A<B", has "<" unencoded.*"%3C"/],
    ['"(" in a serial', `${GTIN_PATH}/21/S(1)`, /AI \(21\), "S\(1\)", has "\(" unencoded.*"%28"/],
    [
      '"*" in a query attribute',
      `${GTIN_PATH}?240=X*1`,
      /AI \(240\), "X\*1", has "\*" unencoded.*"%2A"/,
    ],
    ['"=" in a query attribute', `${GTIN_PATH}?240=X=1`, /has "=" unencoded.*"%3D"/],
  ])('refuses %s, which §4.2 writes encoded', (_what, uri, reason) => {
    expect(() => parseDigitalLinkUri(uri)).toThrow(DigitalLinkError)
    expect(() => parseDigitalLinkUri(uri)).toThrow(reason)
  })

  it('says a character outside §4.2 is not allowed, not how §4.2 writes it', () => {
    // It read `has "~" unencoded, which … §4.2 writes "~"` (found by review).
    expect(() => parseDigitalLinkUri(`${GTIN_PATH}/10/A~B`)).toThrow(
      /"~" unencoded, which is not among the characters Digital Link URI Syntax 1\.7\.0 §4\.2 allows/,
    )
  })

  it('refuses a value that is not UTF-8, while a stem segment may be any octet', () => {
    expect(() => parseDigitalLinkUri(`${GTIN_PATH}/10/A%E9`)).toThrow(/not validly percent-encoded/)
    expect(parseDigitalLinkUri('https://x.com/caf%E9/01/09520123456788').stem).toBe(
      'https://x.com/caf%E9',
    )
  })

  it('takes the same symbols encoded, and decodes them', () => {
    const parsed = parseDigitalLinkUri(`${GTIN_PATH}/10/A%3CB/21/S%281%29?240=X%2A1`)
    expect(parsed.qualifiers).toEqual([
      { ai: '10', value: 'A<B' },
      { ai: '21', value: 'S(1)' },
    ])
    expect(parsed.attributes).toEqual([{ ai: '240', value: 'X*1' }])
  })

  it('takes a letter encoded needlessly, which RFC 3986 §2.3 calls the same resource', () => {
    expect(parseDigitalLinkUri(`${GTIN_PATH}/10/%41BC`).qualifiers).toEqual([
      { ai: '10', value: 'ABC' },
    ])
  })

  it.each([`${GTIN_PATH}/10/A"B`, `${GTIN_PATH}/10/A%22B`])(
    'places a double quote in %s, which §4.2 and RFC 3986 write differently',
    (uri) => {
      expect(parseDigitalLinkUri(uri).unplaced).toEqual([
        'a double quote in the value of AI (10), which Digital Link URI Syntax 1.7.0 §4.2 ' +
          'writes unencoded and RFC 3986 allows only encoded',
      ])
    },
  )
})

describe('judgeCustomUriStem', () => {
  it.each([
    ['https://id.example.com#x', /"#x", a query or fragment/],
    ['https://id.example.com?q=1', /"\?q=1", a query or fragment/],
    ['https://id.example.com/a b', /"a b" holds a character/],
    ['https://u:p@id.example.com', /user information/],
    ['https://id.example.com:abc', /"abc" is not a port number/],
    ['javascript:alert(1)', /not an http or https web address/],
  ])('faults %o', (stem, reason) => {
    const judged = judgeCustomUriStem(stem)
    expect('fault' in judged && judged.fault).toMatch(reason)
  })

  it.each([
    ['https://id.example.com', 'id.example.com'],
    ['HTTPS://id.example.com:8443/products/en', 'id.example.com'],
    ['https://[2001:db8::1]:443', '[2001:db8::1]'],
    ['https://:443', ''],
  ])('takes %o, naming its host', (stem, host) => {
    expect(judgeCustomUriStem(stem)).toEqual({ host })
  })
})
