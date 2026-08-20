import { describe, expect, it } from 'vitest'
import { FNC1_SEPARATOR } from './applicationIdentifiers'
import {
  Gs1ElementStringError,
  encodeElementString,
  formatHumanReadable,
  parseHumanReadable,
} from './elementString'

const GS = FNC1_SEPARATOR

describe('formatHumanReadable', () => {
  it('brackets each AI for the printed interpretation', () => {
    expect(
      formatHumanReadable([
        { ai: '01', value: '09506000134352' },
        { ai: '10', value: 'ABC123' },
      ]),
    ).toBe('(01)09506000134352(10)ABC123')
  })
})

describe('encodeElementString', () => {
  it('never encodes the brackets', () => {
    // The single most common way to build a symbol that scans but decodes wrong.
    const encoded = encodeElementString([{ ai: '01', value: '09506000134352' }])
    expect(encoded).not.toContain('(')
    expect(encoded).not.toContain(')')
    expect(encoded).toBe('0109506000134352')
  })

  it('does not separate a predefined-length field', () => {
    // AI 01 is fixed at 14 digits, so its length comes from the specification
    // and a separator would be wasted symbol capacity.
    const encoded = encodeElementString([
      { ai: '01', value: '09506000134352' },
      { ai: '17', value: '261231' },
    ])
    expect(encoded).toBe('010950600013435217261231')
    expect(encoded).not.toContain(GS)
  })

  it('separates a variable-length field that is followed by another', () => {
    const encoded = encodeElementString([
      { ai: '10', value: 'ABC123' },
      { ai: '01', value: '09506000134352' },
    ])
    expect(encoded).toBe(`10ABC123${GS}0109506000134352`)
  })

  it('omits the separator when the variable-length field is last', () => {
    // The rule that catches people out: a trailing FNC1 is not just wasteful,
    // some decoders surface it as a stray character in the payload.
    const encoded = encodeElementString([
      { ai: '01', value: '09506000134352' },
      { ai: '10', value: 'ABC123' },
    ])
    expect(encoded).toBe('010950600013435210ABC123')
    expect(encoded.endsWith(GS)).toBe(false)
  })

  it('rejects a value that violates its AI format', () => {
    expect(() => encodeElementString([{ ai: '01', value: '12345' }])).toThrow(Gs1ElementStringError)
  })

  it('rejects letters in a numeric field', () => {
    expect(() => encodeElementString([{ ai: '17', value: '26123X' }])).toThrow(
      Gs1ElementStringError,
    )
  })

  it('rejects an empty element list', () => {
    expect(() => encodeElementString([])).toThrow(Gs1ElementStringError)
  })
})

describe('parseHumanReadable', () => {
  it('round-trips the human-readable form', () => {
    const elements = [
      { ai: '01', value: '09506000134352' },
      { ai: '10', value: 'ABC123' },
    ]
    expect(parseHumanReadable(formatHumanReadable(elements))).toEqual(elements)
  })

  it('rejects an unknown Application Identifier', () => {
    expect(() => parseHumanReadable('(99)ABC')).toThrow(Gs1ElementStringError)
  })

  it('rejects a value that is the wrong length for its AI', () => {
    expect(() => parseHumanReadable('(01)123')).toThrow(Gs1ElementStringError)
  })

  it('rejects trailing data after the last element', () => {
    expect(() => parseHumanReadable('(01)09506000134352junk')).toThrow(Gs1ElementStringError)
  })

  it('rejects input with no Application Identifiers at all', () => {
    expect(() => parseHumanReadable('09506000134352')).toThrow(Gs1ElementStringError)
  })
})
