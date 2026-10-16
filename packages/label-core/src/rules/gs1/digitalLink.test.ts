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
      'the barcode’s GTIN in fewer than 14 digits',
      'https://id.example.com/01/036000291452',
      /in 12 digits.*§4\.1 expects 14/,
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
