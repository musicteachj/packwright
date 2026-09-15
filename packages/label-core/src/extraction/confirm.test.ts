import { describe, expect, it } from 'vitest'
import { confirmed } from './confirm'
import type { ExtractionResult } from '../types/index'

interface ALabel {
  productIdentifier: string
  signalWords?: readonly string[]
  capacityL: number
}

const READING: ExtractionResult<ALabel> = {
  fields: {
    productIdentifier: { value: 'Acetone', confidence: 0.99 },
    signalWords: { value: ['Danger'], confidence: 0.95 },
  },
  warnings: [],
}

describe('confirming a reading', () => {
  it('takes the field that was accepted', () => {
    expect(confirmed(READING, new Set(['productIdentifier'] as const))).toEqual({
      productIdentifier: 'Acetone',
    })
  })

  it('leaves behind a field that was read and not accepted', () => {
    // The premise first, so this cannot pass because nothing was read — the
    // trap `certification.test.ts` records and `the-scanner.spec.ts` records
    // again. A test asserting only the absence would go green against a
    // reading that was empty for some entirely different reason.
    expect(READING.fields.signalWords?.value).toEqual(['Danger'])

    const document = confirmed(READING, new Set(['productIdentifier'] as const))
    expect('signalWords' in document).toBe(false)
  })

  it('produces nothing at all from an empty set', () => {
    // The direction that matters. Losing the set has to produce an empty
    // document, never a full one — which is why the set is iterated rather
    // than consulted.
    expect(confirmed(READING, new Set())).toEqual({})
  })

  it('ignores a key the reading has no field for', () => {
    // Unreachable from a screen that offers only what was read, so treating it
    // as an error would make every caller handle a case it cannot produce.
    expect(confirmed(READING, new Set(['capacityL'] as const))).toEqual({})
  })

  it('takes the value the reading carries, which is where an edit lands', () => {
    // The caller edits its own copy of the reading and then confirms it, so
    // there is one place a value can come from. A second channel for edits
    // would be a second way for something to become label data.
    const edited: ExtractionResult<ALabel> = {
      fields: { productIdentifier: { value: 'Propan-2-one', confidence: 0.99 } },
      warnings: [],
    }
    expect(confirmed(edited, new Set(['productIdentifier'] as const))).toEqual({
      productIdentifier: 'Propan-2-one',
    })
  })

  it('carries every accepted field, not merely the first', () => {
    expect(confirmed(READING, new Set(['productIdentifier', 'signalWords'] as const))).toEqual({
      productIdentifier: 'Acetone',
      signalWords: ['Danger'],
    })
  })
})
