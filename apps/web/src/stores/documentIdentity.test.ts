import { describe, expect, it } from 'vitest'
import { canonicalise, sameDocument } from './documentIdentity'

const base = {
  name: 'Granola',
  labelType: 'gs1-retail',
  stock: { widthMm: 60, heightMm: 40, marginMm: 2 },
  data: { gtin: '036000291452' },
}

describe('sameDocument', () => {
  it('ignores the order the keys happen to be in', () => {
    // The editor builds its document field by field; a loaded one comes back
    // through JSON. Compared as strings, every freshly-opened label reads as
    // modified — and an indicator that is always on is one nobody reads.
    const reordered = {
      data: { gtin: '036000291452' },
      stock: { marginMm: 2, widthMm: 60, heightMm: 40 },
      labelType: 'gs1-retail',
      name: 'Granola',
    }
    expect(sameDocument(base, reordered)).toBe(true)
  })

  it('treats an absent optional and an undefined one as the same document', () => {
    expect(
      sameDocument(base, { ...base, data: { gtin: '036000291452', magnification: undefined } }),
    ).toBe(true)
  })

  it('notices a changed value', () => {
    expect(sameDocument(base, { ...base, data: { gtin: '012000161155' } })).toBe(false)
  })

  it('notices a changed stock, which is the field the round trip turns on', () => {
    expect(sameDocument(base, { ...base, stock: { widthMm: 90, heightMm: 40, marginMm: 2 } })).toBe(
      false,
    )
  })

  it('keeps array order, which is meaningful in an ingredient list', () => {
    // 21 CFR 101.4 orders ingredients by predominance. Sorting them would make
    // two different labels compare equal.
    const one = { ...base, data: { ingredients: [{ name: 'oats' }, { name: 'sugar' }] } }
    const other = { ...base, data: { ingredients: [{ name: 'sugar' }, { name: 'oats' }] } }
    expect(sameDocument(one, other)).toBe(false)
  })

  it('sorts nested keys, not just the top level', () => {
    expect(canonicalise({ a: { z: 1, y: 2 } })).toBe(canonicalise({ a: { y: 2, z: 1 } }))
  })
})
