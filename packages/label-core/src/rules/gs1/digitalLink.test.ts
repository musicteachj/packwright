import { describe, expect, it } from 'vitest'
import { VALID_GTIN } from '../fixtures/gs1Retail'
import type { Gs1RetailContext } from '../types'
import {
  GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS,
  GS1_DIGITAL_LINK_INVALID,
  GS1_DIGITAL_LINK_VALID,
  digitalLinkRule,
} from './digitalLink'

/** The rule reads nothing but the label's data. */
const printed = (uri: string, gtin = VALID_GTIN): Gs1RetailContext =>
  ({ data: { gtin, digitalLinkAsPrinted: uri }, subject: 'described' }) as Gs1RetailContext

const judged = (context: Gs1RetailContext) => ({
  findings: digitalLinkRule.check(context),
  declined: digitalLinkRule.declines!(context),
})

/**
 * A Digital Link as printed, judged as written. The re-checks of 2026-10-16 found Haiku
 * 4.5 sending `useConvenienceAlphas` false or not at all for a label printing `/gtin/`,
 * and the rule, rebuilding the link, passed a `/01/` URI the label does not carry.
 */
describe('gs1/digital-link on a Digital Link as printed', () => {
  it('reports the convenience alphas case 07 prints, with nothing to infer', () => {
    const { findings, declined } = judged(printed('https://id.example.com/gtin/00036000291452'))
    expect(findings.map((f) => [f.code, f.severity, f.citation.reference])).toEqual([
      [GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS, 'advisory', 'GS1 Digital Link URI Syntax 1.7.0 §4.1'],
    ])
    expect(findings[0]!.message).toContain('`gtin`')
    expect(declined).toBeUndefined()
  })

  it('passes a conformant link as printed, saying which', () => {
    const { findings, declined } = judged(
      printed('https://id.example.com/01/00036000291452/10/LOT1?17=271231'),
    )
    expect(findings.map((f) => [f.code, f.severity])).toEqual([[GS1_DIGITAL_LINK_VALID, 'pass']])
    expect(findings[0]!.message).toContain('https://id.example.com/01/00036000291452/10/LOT1')
    expect(declined).toBeUndefined()
  })

  it.each([
    [
      'qualifiers out of their defined order',
      'https://id.example.com/01/00036000291452/21/S1/10/L1',
      /not in their defined order/,
    ],
    ['a host name with no scheme', 'id.example.com/01/00036000291452', /not an http or https/],
    ['no GTIN in the path', 'https://id.example.com/products/123', /no GS1 primary key/],
    ['a malformed expiry in the query', 'https://id.example.com/01/00036000291452?17=2612', /.+/],
  ])('reports %s as not conformant, and passes nothing', (_what, uri, reason) => {
    const { findings } = judged(printed(uri))
    expect(findings.map((f) => [f.code, f.severity, f.citation.reference])).toEqual([
      [GS1_DIGITAL_LINK_INVALID, 'violation', 'GS1 Digital Link URI Syntax 1.7.0 §4'],
    ])
    expect(findings[0]!.message).toMatch(reason)
    // Said once, in the measurement, rather than twice in the message.
    expect(findings[0]!.measurement?.actual).toBe(uri)
  })

  it.each([
    [
      'a GTIN other than the barcode’s',
      'https://id.example.com/01/09506000134352',
      /09506000134352.*not the barcode's 036000291452/,
    ],
    [
      'an AI this build cannot validate',
      'https://id.example.com/01/00036000291452?3103=000189',
      /AI \(3103\)/,
    ],
  ])('withholds the pass for %s, and says so as a limit of the tool', (_what, uri, reason) => {
    const { findings, declined } = judged(printed(uri))
    expect(findings.filter((f) => f.severity === 'pass')).toEqual([])
    expect(declined).toMatchObject({ limit: true, wants: [] })
    expect(declined!.reason).toMatch(reason)
  })

  it('says a limit inside the finding beside it, since a rule that reports may not also stand down', () => {
    // `Rule.declines` must be silent whenever `check` returned anything, and the
    // registry drops a decline beside a finding: the first draft lost this one.
    const { findings, declined } = judged(printed('https://id.example.com/gtin/09506000134352'))
    expect(findings.map((f) => f.code)).toEqual([GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS])
    expect(findings[0]!.message).toMatch(/09506000134352, not the barcode's 036000291452/)
    expect(findings[0]!.message).toContain('a limit of this tool')
    expect(declined).toBeUndefined()
  })

  it('stands down, not faults, on a path the standard permits and this build cannot place', () => {
    // `upui-path = gtin-comp tpx-comp` (URI Syntax 1.7.0): a GTIN then (235).
    const { findings, declined } = judged(
      printed('https://id.example.com/01/00036000291452/235/XYZ'),
    )
    expect(findings).toEqual([])
    expect(declined?.reason).toContain('(235) after the GTIN')
  })

  it.each([
    ['a GTIN of 15 digits', 'https://id.example.com/01/000360002914520'],
    ['a letter in the GTIN', 'https://id.example.com/01/00O36000291452'],
    ['no GS1 key at all', 'https://example.com/2024/promo'],
  ])('reports %s as not conformant, without throwing or standing down', (_what, uri) => {
    // A 15-digit GTIN threw out of the rule, and `check_label` with it; the others were
    // declined as keys this build does not hold. Found by `/code-review high` on #96.
    const { findings, declined } = judged(printed(uri))
    expect(findings.map((f) => f.code)).toEqual([GS1_DIGITAL_LINK_INVALID])
    expect(declined).toBeUndefined()
  })

  it('faults the barcode’s GTIN in fewer than 14 digits under §4, whose §4.5 says it shall be 14', () => {
    // A limit until James's decision of 2026-10-17: §4.5's gtin-value = 14DIGIT is in the
    // grammar §4 cites, so no new citation was needed (found by `/code-review high` on #97).
    const { findings, declined } = judged(printed('https://id.example.com/01/036000291452'))
    expect(findings.map((f) => [f.code, f.citation.reference])).toEqual([
      [GS1_DIGITAL_LINK_INVALID, 'GS1 Digital Link URI Syntax 1.7.0 §4'],
    ])
    expect(findings[0]!.message).toContain(
      'its GTIN "036000291452" is 12 digits, where Digital Link URI Syntax 1.7.0 §4.5',
    )
    expect(declined).toBeUndefined()
  })

  it('says another GTIN beside a short one, as a limit inside the finding', () => {
    const { findings, declined } = judged(printed('https://id.example.com/01/012345678905'))
    expect(findings.map((f) => [f.code, f.citation.reference])).toEqual([
      [GS1_DIGITAL_LINK_INVALID, 'GS1 Digital Link URI Syntax 1.7.0 §4'],
    ])
    expect(findings[0]!.message).toContain('its GTIN "012345678905" is 12 digits')
    expect(findings[0]!.message).toContain("not the barcode's 036000291452")
    expect(declined).toBeUndefined()
  })

  it('says a short GTIN beside a check digit the builder refuses', () => {
    // The length went unsaid until the check digit was fixed (found by review).
    const { findings } = judged(printed('https://id.example.com/01/036000291453'))
    expect(findings.map((f) => f.code)).toEqual([
      GS1_DIGITAL_LINK_INVALID,
      GS1_DIGITAL_LINK_INVALID,
    ])
    expect(findings[0]!.message).toContain('is 12 digits')
    expect(findings[1]!.message).toMatch(/[Cc]heck digit/)
  })

  it('judges again when the GTIN changes under the same link', () => {
    const data = {
      gtin: VALID_GTIN,
      digitalLinkAsPrinted: 'https://id.example.com/01/00036000291452',
    }
    const context = { data, subject: 'described' } as Gs1RetailContext
    expect(digitalLinkRule.check(context).map((f) => f.code)).toEqual([GS1_DIGITAL_LINK_VALID])
    data.gtin = '012345678905'
    expect(digitalLinkRule.check(context)).toEqual([])
    expect(digitalLinkRule.declines!(context)?.reason).toContain("not the barcode's 012345678905")
  })

  it('judges the link as printed where the configured fields are given too', () => {
    const context = {
      data: {
        gtin: VALID_GTIN,
        digitalLink: { domain: 'https://id.example.com' },
        digitalLinkAsPrinted: 'https://id.example.com/gtin/00036000291452',
      },
      subject: 'described',
    } as Gs1RetailContext
    expect(digitalLinkRule.check(context).map((f) => f.code)).toEqual([
      GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS,
    ])
  })

  it('leaves a barcode GTIN with a wrong check digit to the check-digit rule', () => {
    const context = printed('https://id.example.com/gtin/00036000291453', '036000291453')
    expect(judged(context)).toEqual({ findings: [], declined: undefined })
  })
})

/**
 * Found by the medium review of dev on 2026-10-16, each against the productions of
 * URI Syntax 1.7.0 §4.11, re-read that day.
 */
describe('gs1/digital-link judges the stem by §4.11, as printed and as configured', () => {
  const configured = (domain: string): Gs1RetailContext =>
    ({
      data: { gtin: VALID_GTIN, digitalLink: { domain } },
      subject: 'described',
    }) as Gs1RetailContext

  it.each([
    ['a fragment, which swallows the GS1 path', 'https://id.example.com#x', /"#x"/],
    ['a query, which swallows the GS1 path', 'https://id.example.com?q=1', /"\?q=1"/],
    ['a space in its path', 'https://id.example.com/a b', /"a b"/],
    ['user information', 'https://u:p@id.example.com', /user information/],
    ['a port that is not a number', 'https://id.example.com:abc', /"abc" is not a port/],
  ])('faults a configured domain with %s, and passes nothing', (_what, domain, reason) => {
    // Each came back GS1_DIGITAL_LINK_VALID: the domain was tested by a prefix only.
    const findings = digitalLinkRule.check(configured(domain))
    expect(findings.map((f) => [f.code, f.severity, f.citation.reference])).toEqual([
      [GS1_DIGITAL_LINK_INVALID, 'violation', 'GS1 Digital Link URI Syntax 1.7.0 §4'],
    ])
    expect(findings[0]!.message).toMatch(reason)
  })

  it.each([
    'https://id_example.com',
    'https://id.example.com:8443',
    'https://id.example.com/products/en/',
    'https://[2001:db8::1]',
  ])('passes a configured domain the grammar permits, %o', (domain) => {
    expect(digitalLinkRule.check(configured(domain)).map((f) => f.code)).toEqual([
      GS1_DIGITAL_LINK_VALID,
    ])
  })

  it.each([
    'https://id_example.com/01/00036000291452',
    'https://[2001:db8::1]/01/00036000291452',
    'https://id.example.com//01/00036000291452',
    'https://brand.com/414/01/00036000291452',
  ])('passes %o as printed, which it faulted or declined', (uri) => {
    const { findings, declined } = judged(printed(uri))
    expect(findings.map((f) => f.code)).toEqual([GS1_DIGITAL_LINK_VALID])
    expect(declined).toBeUndefined()
  })

  it('stands down on an empty host configured, as it does printed', () => {
    // A §4 violation cited the grammar against an empty host it allows (found by the
    // per-commit review): it is a limit, as on the printed path.
    const context = configured('https://:443')
    expect(digitalLinkRule.check(context)).toEqual([])
    expect(digitalLinkRule.declines!(context)).toMatchObject({ limit: true, wants: [] })
    expect(digitalLinkRule.declines!(context)!.reason).toContain('no host name')
  })

  it('faults a malformed GTIN past a stem segment spelled like a key this build does not hold', () => {
    const { findings, declined } = judged(printed('https://brand.com/414/01/12345'))
    expect(findings.map((f) => f.code)).toEqual([GS1_DIGITAL_LINK_INVALID])
    expect(declined).toBeUndefined()
  })

  it('names what a faulted domain must look like, not just its scheme', () => {
    const [finding] = digitalLinkRule.check(configured('https://id.example.com#x'))
    expect(finding!.measurement?.required).toBe('http(s)://host[:port][/path]')
  })

  it('stands down on an empty host as printed, which the grammar allows and nothing serves', () => {
    const { findings, declined } = judged(printed('https:///01/00036000291452'))
    expect(findings).toEqual([])
    expect(declined?.reason).toContain('no host name')
  })

  it('names the GTIN printed, and reports no convenience alpha, past a stem segment spelled "gtin"', () => {
    const { findings } = judged(printed('https://example.com/gtin/catalog/01/12345'))
    expect(findings.map((f) => f.code)).toEqual([GS1_DIGITAL_LINK_INVALID])
    expect(findings[0]!.message).toContain('"12345" is not a GTIN of 8, 12, 13 or 14 digits')
    expect(findings.map((f) => f.code)).not.toContain(GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS)
  })

  it('says a primary key at the end of the path has no value, not that there is no key', () => {
    const { findings } = judged(printed('https://id.example.com/01'))
    expect(findings.map((f) => f.code)).toEqual([GS1_DIGITAL_LINK_INVALID])
    expect(findings[0]!.message).toContain('"01" ends the path with no value after it')
  })
})

/**
 * URI Syntax 1.7.0 §4.2 writes every symbol in a GS1 value encoded but "-", "." and "_"
 * and the double quote; RFC 3986 allows a double quote only encoded. Both read 2026-10-16.
 * Each pass below was a false clearance until then.
 */
describe('gs1/digital-link judges a value by §4.2, as printed and as configured', () => {
  const configured = (link: Record<string, unknown>): Gs1RetailContext =>
    ({
      data: { gtin: VALID_GTIN, digitalLink: { domain: 'https://id.example.com', ...link } },
      subject: 'described',
    }) as Gs1RetailContext

  it.each([
    'https://id.example.com/01/00036000291452/10/A<B',
    'https://id.example.com/01/00036000291452/10/A(1)',
  ])('faults %o as printed, a symbol §4.2 writes encoded', (uri) => {
    const { findings, declined } = judged(printed(uri))
    expect(findings.map((f) => [f.code, f.citation.reference])).toEqual([
      [GS1_DIGITAL_LINK_INVALID, 'GS1 Digital Link URI Syntax 1.7.0 §4'],
    ])
    expect(findings[0]!.message).toMatch(/unencoded, which Digital Link URI Syntax 1\.7\.0 §4\.2/)
    expect(declined).toBeUndefined()
  })

  it('passes the same lot encoded as printed', () => {
    const { findings } = judged(printed('https://id.example.com/01/00036000291452/10/A%281%29'))
    expect(findings.map((f) => f.code)).toEqual([GS1_DIGITAL_LINK_VALID])
  })

  it('builds a configured lot with its symbols encoded, and passes that', () => {
    const findings = digitalLinkRule.check(configured({ lot: 'A(1)' }))
    expect(findings.map((f) => f.code)).toEqual([GS1_DIGITAL_LINK_VALID])
    expect(findings[0]!.message).toContain('/10/A%281%29')
  })

  it('stands down on a double quote in a lot, as printed and as configured', () => {
    const asPrinted = judged(printed('https://id.example.com/01/00036000291452/10/A%22B'))
    expect(asPrinted.findings).toEqual([])
    expect(asPrinted.declined?.reason).toContain('a double quote in the value of AI (10)')

    const context = configured({ lot: 'A"B' })
    expect(digitalLinkRule.check(context)).toEqual([])
    expect(digitalLinkRule.declines!(context)).toMatchObject({ limit: true, wants: [] })
    expect(digitalLinkRule.declines!(context)!.reason).toContain('a double quote in')
  })

  it('says the double quote inside the convenience-alpha advisory, since it may not also stand down', () => {
    const context = configured({ lot: 'A"B', useConvenienceAlphas: true })
    const findings = digitalLinkRule.check(context)
    expect(findings.map((f) => f.code)).toEqual([GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS])
    expect(findings[0]!.message).toContain('a double quote in')
    expect(digitalLinkRule.declines!(context)).toBeUndefined()
  })

  it.each([
    [
      'the convenience-alpha advisory beside an empty host',
      { domain: 'https://:443', useConvenienceAlphas: true },
      GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS,
      'no host name',
    ],
    [
      'a lot the builder refuses beside an empty host',
      { domain: 'https://:443', lot: 'x'.repeat(30) },
      GS1_DIGITAL_LINK_INVALID,
      'no host name',
    ],
    [
      'a serial the builder refuses beside a quoted lot',
      { lot: 'A"B', serial: '' },
      GS1_DIGITAL_LINK_INVALID,
      'a double quote in',
    ],
  ])('reports %s, and says the limit in its message', (_what, link, code, limit) => {
    // An empty host returned nothing, hiding both findings; the quote's limit was said
    // beside the advisory only. Found by the per-commit review of 2026-10-16.
    const context = configured(link)
    const findings = digitalLinkRule.check(context)
    expect(findings.map((f) => f.code)).toEqual([code])
    expect(findings[0]!.message).toContain(limit)
    expect(digitalLinkRule.declines!(context)).toBeUndefined()
  })

  it.each([['an empty host written https://', { domain: 'https://' }, 'no host name']])(
    'stands down on %s, as the printed path does on the link it builds',
    (_what, link, reason) => {
      // Found by the per-commit review of 2026-10-17: it was faulted under §4 as no web address.
      const context = configured(link)
      expect(digitalLinkRule.check(context)).toEqual([])
      expect(digitalLinkRule.declines!(context)!.reason).toContain(reason)
    },
  )

  it('passes a stem segment that is percent-encoded but not UTF-8, on both paths', () => {
    // `pct-encoded` allows any octet in a stem; the printed path decoded it and refused it.
    expect(
      judged(printed('https://x.com/caf%E9/01/00036000291452')).findings.map((f) => f.code),
    ).toEqual([GS1_DIGITAL_LINK_VALID])
    expect(
      digitalLinkRule.check(configured({ domain: 'https://x.com/caf%E9' })).map((f) => f.code),
    ).toEqual([GS1_DIGITAL_LINK_VALID])
  })
})

/**
 * Found by `/code-review high` on #97: the configured path kept its own copies of the
 * printed path's checks, and passed what the parser refuses in a resolver domain. It now
 * builds the link and judges it with the printed path's code.
 */
describe('gs1/digital-link judges a configured link as built, by the printed path', () => {
  const configured = (domain: string): Gs1RetailContext =>
    ({
      data: { gtin: VALID_GTIN, digitalLink: { domain } },
      subject: 'described',
    }) as Gs1RetailContext

  it.each([
    'https://x.com/01/09506000134352',
    'https://x.com/01/09506000134352/10/A(1)',
    'https://x.com/01/09506000134352/21/S/10/L',
    'https://x.com/414/1234567890128',
    'https://x.com/8004/thing',
  ])('passes %o as a stem, as printed and as configured, the one reading §4 allows', (domain) => {
    // Each reads as a GS1 path only up to the GTIN built after it, which no path lets
    // follow (§4.9, read 2026-10-17), so its one conforming reading is a stem and that
    // GTIN. Two reviews on #97 asked for these to be faulted or stood down; the
    // grammar answers instead, and both paths give the same answer.
    expect(digitalLinkRule.check(configured(domain)).map((f) => f.code)).toEqual([
      GS1_DIGITAL_LINK_VALID,
    ])
    expect(judged(printed(`${domain}/01/00036000291452`)).findings.map((f) => f.code)).toEqual([
      GS1_DIGITAL_LINK_VALID,
    ])
  })

  it('judges again when the link changes in place under the same label', () => {
    // One cached verdict serves both paths, keyed on every input it reads.
    const data = { gtin: VALID_GTIN, digitalLink: { domain: 'https://id.example.com' } }
    const context = { data, subject: 'described' } as Gs1RetailContext
    expect(digitalLinkRule.check(context).map((f) => f.code)).toEqual([GS1_DIGITAL_LINK_VALID])
    data.digitalLink.domain = 'https://id.example.com#x'
    expect(digitalLinkRule.check(context).map((f) => f.code)).toEqual([GS1_DIGITAL_LINK_INVALID])
  })

  it.each([
    ['a GSIN code before a word', 'https://x.com/shop/402/en/01/00036000291452'],
    ['an SSCC code before a word', 'https://x.com/00/abc/01/00036000291452'],
    ['a GLN code before a word', 'https://x.com/414/abc/01/00036000291452'],
  ])('passes a stem with %s, which §4.5 says is no key', (_what, uri) => {
    // `/shop/402/en` stood down as an ambiguous GSIN, and `/414/abc` stood down while
    // `/00/abc` passed: any value counted after a key the table did not hold. Found by
    // the per-commit review of 2026-10-17; §4.5 gives gsin-value = 17DIGIT.
    expect(judged(printed(uri)).findings.map((f) => f.code)).toEqual([GS1_DIGITAL_LINK_VALID])
  })

  it('names every convenience alpha the fields would print, beside a field the builder refuses', () => {
    // It named `gtin` alone, and said "as built" of a link nothing built (found by
    // `/code-review high` on #97).
    const context = {
      data: {
        gtin: VALID_GTIN,
        digitalLink: {
          domain: 'https://id.example.com',
          lot: 'x'.repeat(30),
          serial: 'S',
          useConvenienceAlphas: true,
        },
      },
      subject: 'described',
    } as Gs1RetailContext
    const findings = digitalLinkRule.check(context)
    expect(findings.map((f) => f.code)).toEqual([
      GS1_DIGITAL_LINK_INVALID,
      GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS,
    ])
    expect(findings[1]!.message).toContain(
      'as configured uses the convenience alphas `gtin`, `lot`, `ser`',
    )
  })

  it('says a limit beside a builder refusal on the refusal, not the advisory after it', () => {
    // It went on whichever finding came last, the alphas advisory (found by review).
    const context = {
      data: {
        gtin: VALID_GTIN,
        digitalLink: { domain: 'https://:443', lot: 'x'.repeat(30), useConvenienceAlphas: true },
      },
      subject: 'described',
    } as Gs1RetailContext
    const findings = digitalLinkRule.check(context)
    expect(findings.map((f) => f.code)).toEqual([
      GS1_DIGITAL_LINK_INVALID,
      GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS,
    ])
    expect(findings[0]!.message).toContain('no host name')
    expect(findings[1]!.message).not.toContain('no host name')
  })

  it('faults an encoded AI code in the query, whose value went unjudged as printed', () => {
    // `?%31%37=999999` passed: an expiry no calendar has (found by `/code-review high` on #97).
    const { findings } = judged(printed('https://id.example.com/01/00036000291452?%31%37=999999'))
    expect(findings.map((f) => [f.code, f.citation.reference])).toEqual([
      [GS1_DIGITAL_LINK_INVALID, 'GS1 Digital Link URI Syntax 1.7.0 §4'],
    ])
  })

  it('stands down on a fragment, and says a limit as one neither passed nor faulted', () => {
    // A fragment passed unjudged (found by `/code-review high` on #97). The limit's words
    // say only that the tool judges it neither way, where "does not yet judge" read as
    // the tool's fault for an empty host, and a sentence blaming the standard misplaced
    // the gap for a key this build does not hold (both found by review).
    const { findings, declined } = judged(printed('https://id.example.com/01/00036000291452#top'))
    expect(findings).toEqual([])
    expect(declined?.reason).toContain('a fragment, "#top"')
    expect(declined?.reason).toContain('Packwright does not judge that either way')
  })

  it("faults a query RFC 3986 refuses, though its parameter is not GS1's", () => {
    // "is conformant" was said of it (found by `/code-review high` on #97).
    const { findings } = judged(
      printed('https://id.example.com/01/00036000291452?17=261231&x=<script>'),
    )
    expect(findings.map((f) => [f.code, f.citation.reference])).toEqual([
      [GS1_DIGITAL_LINK_INVALID, 'GS1 Digital Link URI Syntax 1.7.0 §4'],
    ])
  })

  it('says in a pass which query parameters it judged as URI text only', () => {
    // A pass said "conformant" with nothing about them (found by review on #97).
    const { findings } = judged(
      printed('https://id.example.com/01/00036000291452?linkType=gs1:pip'),
    )
    expect(findings.map((f) => f.code)).toEqual([GS1_DIGITAL_LINK_VALID])
    expect(findings[0]!.message).toContain(
      "Its query parameters `linkType` are not GS1's, and are judged as URI text only.",
    )
  })
})
