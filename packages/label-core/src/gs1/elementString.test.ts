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

  it('does not separate a GLN, whose 41-prefix is predefined-length', () => {
    // The predefined-length table is keyed on the AI's first two digits, so 410
    // and 414 are fixed at 13 digits and carry no separator. Getting this wrong
    // emits an FNC1 the decoder has no room for: it has already consumed
    // exactly 13 digits and reads the separator as the start of the next AI.
    const encoded = encodeElementString([
      { ai: '410', value: '9506000134352' },
      { ai: '01', value: '09506000134352' },
    ])
    expect(encoded).toBe('41095060001343520109506000134352')
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

describe('character set 82', () => {
  it('accepts punctuation that is inside the set', () => {
    // '-' and '/' are in CSET 82 and are common in real lot codes.
    expect(encodeElementString([{ ai: '10', value: 'AB-12/C' }])).toBe('10AB-12/C')
  })

  it.each([
    ['a space', 'AB CD'],
    ['a hash', 'AB#CD'],
    ['a dollar sign', 'AB$CD'],
    ['an at sign', 'AB@CD'],
    ['a backtick', 'AB`CD'],
    ['a pipe', 'AB|CD'],
    ['a tilde', 'AB~CD'],
  ])('rejects a lot value containing %s', (_label, value) => {
    // Printable, but outside the 82 characters GS1 can encode.
    expect(() => encodeElementString([{ ai: '10', value }])).toThrow(Gs1ElementStringError)
  })

  it('rejects a value carrying an embedded separator', () => {
    // The dangerous one. This encoded happily and the decoder read the lot as
    // 'AB', silently truncating the field with no error anywhere.
    expect(() => encodeElementString([{ ai: '10', value: `AB${GS}CD` }])).toThrow(
      Gs1ElementStringError,
    )
  })
})

describe('parseHumanReadable', () => {
  it('rejects data before the first AI', () => {
    // The regex is unanchored and only trailing data was checked, so anything
    // ahead of the first bracket was skipped over silently and the result
    // looked like a clean parse.
    expect(() => parseHumanReadable('junk(01)09506000134352')).toThrow(Gs1ElementStringError)
  })

  it('rejects data between two elements', () => {
    expect(() => parseHumanReadable('(01)09506000134352 junk (10)ABC123')).toThrow(
      Gs1ElementStringError,
    )
  })

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
