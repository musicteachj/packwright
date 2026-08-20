import { describe, expect, it } from 'vitest'
import { getSymbologyConstraints, listSymbologies, validatePayload } from './constraints'

describe('validatePayload', () => {
  it('accepts an EAN-13 payload of twelve digits', () => {
    // Twelve, not thirteen — the encoder appends the check digit.
    expect(validatePayload('EAN-13', '950600013435')).toBeNull()
  })

  it('explains that the check digit is added rather than just rejecting', () => {
    // Typing all thirteen digits off the pack is the obvious thing to do and
    // the wrong thing to do, so the message has to say why.
    const reason = validatePayload('EAN-13', '9506000134352')
    expect(reason).toContain('12 characters')
    expect(reason).toContain('check digit is added for you')
  })

  it('rejects letters in a numeric-only symbology', () => {
    expect(validatePayload('EAN-13', '95060001343X')).toContain('digits only')
  })

  it('accepts alphanumeric input for Code 128', () => {
    expect(validatePayload('CODE128', 'PACKWRIGHT-01')).toBeNull()
  })

  it('reports an unknown symbology rather than silently passing', () => {
    // @ts-expect-error deliberately outside the union, as untrusted input would be
    expect(validatePayload('NOT-A-SYMBOLOGY', '123')).toContain('Unknown symbology')
  })
})

describe('pharmacode value range', () => {
  it.each([
    ['3', null],
    ['131070', null],
  ])('accepts %s', (payload, expected) => {
    expect(validatePayload('PHARMACODE', payload)).toBe(expected)
  })

  it('rejects a value below the encodable minimum', () => {
    expect(validatePayload('PHARMACODE', '2')).toContain('3 to 131070')
  })

  it('rejects a value that passes the length check but exceeds the range', () => {
    // 999999 is six digits, so length alone accepts it. Pharmacode encodes a
    // number rather than a digit string, and this one is not encodable — the
    // case a length-only check waves through.
    expect(validatePayload('PHARMACODE', '999999')).toContain('3 to 131070')
  })
})

describe('the symbology table', () => {
  it('lists every symbology exactly once', () => {
    const ids = listSymbologies().map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every entry a bwip-js encoder name', () => {
    // A missing name fails at render time, which is late but loud. Cheap to pin.
    for (const spec of listSymbologies()) {
      expect(spec.bwipId, `${spec.id} has no bwipId`).toBeTruthy()
    }
  })

  it('keeps min no greater than max for every payload length', () => {
    for (const spec of listSymbologies()) {
      expect(spec.payloadLength.min, spec.id).toBeLessThanOrEqual(spec.payloadLength.max)
    }
  })

  it('returns undefined for an unknown id', () => {
    // @ts-expect-error deliberately outside the union
    expect(getSymbologyConstraints('NOPE')).toBeUndefined()
  })
})
