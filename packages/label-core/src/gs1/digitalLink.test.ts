import { describe, expect, it } from 'vitest'
import { DigitalLinkError, buildDigitalLinkUri } from './digitalLink'

const DOMAIN = 'https://id.example.com'

describe('buildDigitalLinkUri', () => {
  it('builds the canonical GTIN link using convenience alphas', () => {
    expect(
      buildDigitalLinkUri({ domain: DOMAIN, primary: { ai: '01', value: '09506000134352' } }),
    ).toBe('https://id.example.com/gtin/09506000134352')
  })

  it('builds the numeric-AI form when alphas are switched off', () => {
    expect(
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: '09506000134352' },
        useConvenienceAlphas: false,
      }),
    ).toBe('https://id.example.com/01/09506000134352')
  })

  it('widens a UPC-A to GTIN-14 so one product yields one URI', () => {
    // Otherwise the same product on two pack sizes resolves to two addresses.
    expect(
      buildDigitalLinkUri({ domain: DOMAIN, primary: { ai: '01', value: '036000291452' } }),
    ).toBe('https://id.example.com/gtin/00036000291452')
  })

  it('orders qualifiers canonically regardless of input order', () => {
    // Serial supplied before lot; the spec's sequence for GTIN is cpv, lot, ser.
    expect(
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: '09506000134352' },
        qualifiers: [
          { ai: '21', value: '12345' },
          { ai: '10', value: 'ABC123' },
        ],
      }),
    ).toBe('https://id.example.com/gtin/09506000134352/lot/ABC123/ser/12345')
  })

  it('puts attributes in the query string, still numeric', () => {
    expect(
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: '09506000134352' },
        attributes: [{ ai: '17', value: '261231' }],
      }),
    ).toBe('https://id.example.com/gtin/09506000134352?17=261231')
  })

  it('tolerates a trailing slash on the domain', () => {
    expect(
      buildDigitalLinkUri({
        domain: 'https://id.example.com/',
        primary: { ai: '01', value: '09506000134352' },
      }),
    ).toBe('https://id.example.com/gtin/09506000134352')
  })

  it('percent-encodes qualifier values', () => {
    expect(
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: '09506000134352' },
        qualifiers: [{ ai: '10', value: 'LOT/01' }],
      }),
    ).toBe('https://id.example.com/gtin/09506000134352/lot/LOT%2F01')
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

  it('refuses a qualifier that does not qualify this key', () => {
    expect(() =>
      buildDigitalLinkUri({
        domain: DOMAIN,
        primary: { ai: '01', value: '09506000134352' },
        qualifiers: [{ ai: '17', value: '261231' }],
      }),
    ).toThrow(DigitalLinkError)
  })
})
