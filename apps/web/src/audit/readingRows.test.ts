import { describe, expect, it } from 'vitest'
import {
  FIELD_SHAPES,
  READING_KEYS,
  entryIsUsable,
  unusableReason,
  formatValue,
  parseValue,
  partitionEntries,
  type ReadingKey,
} from './readingRows'

describe('the text a field is shown and edited as', () => {
  it('round-trips every shape it has an editor for', () => {
    // The property the single text representation exists to give. Written as a
    // sweep rather than a case each, so a field added to `FIELD_SHAPES` without
    // a parser fails here instead of silently editing to nothing.
    const samples: Record<ReadingKey, unknown> = {
      productIdentifier: 'Acetone',
      signalWords: ['Danger', 'Warning'],
      pictograms: ['GHS02', 'GHS07'],
      hazardStatementCodes: ['H225', 'H319'],
      precautionaryStatementCodes: ['P210', 'P337 + P313'],
      supplier: {
        name: 'Northgate Solvents Ltd',
        address: 'Lincoln LN6 7DQ',
        telephone: '+44 1522 880 114',
      },
      outerPackageStatement: 'Full label information is on the outer package.',
    }

    for (const key of READING_KEYS) {
      expect(parseValue(key, formatValue(key, samples[key])), key).toEqual(samples[key])
    }
  })

  it('keeps a combination code whole rather than splitting it on its plus', () => {
    // `P337 + P313` is one code. Splitting on anything but the comma would turn
    // it into two that the tables have no text for.
    expect(parseValue('precautionaryStatementCodes', 'P210, P337 + P313')).toEqual([
      'P210',
      'P337 + P313',
    ])
  })

  it('reads a supplier with no telephone without inventing an empty one', () => {
    expect(parseValue('supplier', 'Northgate Solvents Ltd\nLincoln LN6 7DQ')).toEqual({
      name: 'Northgate Solvents Ltd',
      address: 'Lincoln LN6 7DQ',
    })
  })

  it('keeps every line of an address rather than the first', () => {
    // Positional indexing read line two as the address and line three as the
    // telephone, so a four-line supplier lost half its address and gained a
    // telephone number that was a street.
    expect(
      parseValue(
        'supplier',
        'Northgate Solvents Ltd\nUnit 14, Brayford Industrial Estate\nLincoln LN6 7DQ\n+44 1522 880 114',
      ),
    ).toEqual({
      name: 'Northgate Solvents Ltd',
      address: 'Unit 14, Brayford Industrial Estate, Lincoln LN6 7DQ',
      telephone: '+44 1522 880 114',
    })
  })

  it('flattens an address the model read across two lines, so it survives the round trip', () => {
    const supplier = { name: 'Northgate', address: 'Unit 14\nLincoln LN6 7DQ', telephone: '+44 1' }
    expect(parseValue('supplier', formatValue('supplier', supplier))).toEqual({
      name: 'Northgate',
      address: 'Unit 14, Lincoln LN6 7DQ',
      telephone: '+44 1',
    })
  })

  it('will not build a supplier out of a name alone', () => {
    // `GhsSupplier` needs an address. One with a blank one is a supplier block
    // the engine would draw with a hole in it.
    expect(parseValue('supplier', 'Northgate Solvents Ltd')).toBeUndefined()
  })

  it('treats a field edited down to nothing as undeclared, not as blank', () => {
    // `''` in `productIdentifier` is a product identifier that exists and is
    // empty, which the engine would then draw. Absent is the thing the user
    // meant.
    expect(parseValue('productIdentifier', '   ')).toBeUndefined()
    expect(parseValue('signalWords', ' , ')).toBeUndefined()
    expect(parseValue('supplier', '\n\n')).toBeUndefined()
  })

  it('describes every key it advertises', () => {
    expect(READING_KEYS.length).toBe(Object.keys(FIELD_SHAPES).length)
    for (const key of READING_KEYS) expect(FIELD_SHAPES[key].label.length).toBeGreaterThan(0)
  })
})

const canonicalEntryOf = (key: 'signalWords', text: string) =>
  partitionEntries(key, 'eu-clp', text).usable[0]

describe('which statement codes a label can actually carry', () => {
  it('accepts a code the tables have verified text for', () => {
    expect(entryIsUsable('hazardStatementCodes', 'eu-clp', 'H225')).toBe(true)
    expect(entryIsUsable('precautionaryStatementCodes', 'eu-clp', 'P337 + P313')).toBe(true)
  })

  it('refuses one they do not', () => {
    expect(entryIsUsable('hazardStatementCodes', 'eu-clp', 'H999')).toBe(false)
  })

  it('refuses every code under a regime whose table is empty', () => {
    // `US_OSHA_HAZARD_STATEMENTS` has never been transcribed in verifiable
    // form. That is a gap in this build rather than a defect on the label, and
    // the screen has to say so rather than quietly accept the codes.
    expect(entryIsUsable('hazardStatementCodes', 'us-osha', 'H225')).toBe(false)
  })

  it('checks the pictogram list too, not only the statement tables', () => {
    // The first version asked this of the two statement tables alone, which is
    // fine for a reading straight from the server and wrong the moment a field
    // is edited: `GHS99` confirmed into the document, where
    // `isPictogramRecognised` would have refused it.
    expect(entryIsUsable('pictograms', 'eu-clp', 'GHS02')).toBe(true)
    expect(entryIsUsable('pictograms', 'eu-clp', 'GHS99')).toBe(false)
    expect(entryIsUsable('signalWords', 'eu-clp', 'Danger')).toBe(true)
    expect(entryIsUsable('signalWords', 'eu-clp', 'Caution')).toBe(false)
  })

  it('accepts a signal word in the case labels actually print it', () => {
    // The endpoint folds case; matching exactly here meant an edited `DANGER` —
    // which is what the sample label prints — was marked unusable under a
    // banner claiming this build had no wording for it.
    expect(entryIsUsable('signalWords', 'eu-clp', 'DANGER')).toBe(true)
    expect(canonicalEntryOf('signalWords', 'DANGER')).toBe('Danger')
  })

  it('says something that fits the field it is talking about', () => {
    // One sentence for all four read "this build has no verified wording for
    // the European Union", which is about statement text and says nothing true
    // about a rejected pictogram code.
    expect(unusableReason('hazardStatementCodes', 'EU')).toContain('verified wording')
    expect(unusableReason('pictograms', 'EU')).toContain('pictogram code')
    expect(unusableReason('signalWords', 'EU')).toContain('Article 20')
  })

  it('accepts a code spelled the way the server accepts it', () => {
    // The screen and the endpoint canonicalise through the same function now.
    // They did not: a user typing `P337+P313` or `h225` — both of which the
    // server takes — had it marked unusable here and dropped without a word.
    expect(entryIsUsable('precautionaryStatementCodes', 'eu-clp', 'P337+P313')).toBe(true)
    expect(entryIsUsable('hazardStatementCodes', 'eu-clp', 'h225')).toBe(true)
  })

  it('stores the spelling the engine looks up, not the one that was typed', () => {
    const { usable } = partitionEntries('precautionaryStatementCodes', 'eu-clp', 'p337+p313')
    expect(usable).toEqual(['P337 + P313'])
  })

  it('splits what was read into what can be confirmed and what can only be shown', () => {
    const { usable, unusable } = partitionEntries(
      'hazardStatementCodes',
      'eu-clp',
      'H225, H999, H319',
    )
    expect(usable).toEqual(['H225', 'H319'])
    // Shown, never confirmed — the code really was on the label, and
    // `GhsRequest` would refuse the whole document for carrying it.
    expect(unusable).toEqual(['H999'])
  })
})
