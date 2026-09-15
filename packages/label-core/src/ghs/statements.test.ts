import { describe, expect, it } from 'vitest'
import { GHS_PICTOGRAMS_BY_REGIME, isPictogramRecognised } from './pictograms'
import {
  canonicalStatementCode,
  EU_CLP_HAZARD_STATEMENTS,
  EU_CLP_PRECAUTIONARY_STATEMENTS,
  GHS_REGIMES,
  hazardStatementText,
  precautionaryStatementText,
  US_OSHA_HAZARD_STATEMENTS,
  US_OSHA_PRECAUTIONARY_STATEMENTS,
} from './statements'

/**
 * Vectors transcribed from the source document, not produced by running the
 * lookup and pasting the result — which would prove only that a Record returns
 * what was put in it.
 */
describe('statement text is exact', () => {
  it.each([
    ['H225', 'Highly flammable liquid and vapour.'],
    ['H200', 'Unstable explosives.'],
    ['H301', 'Toxic if swallowed.'],
    ['H314', 'Causes severe skin burns and eye damage.'],
    ['H400', 'Very toxic to aquatic life.'],
  ])('%s reads exactly as CLP Annex III prints it', (code, text) => {
    expect(hazardStatementText('eu-clp', code)).toBe(text)
  })

  it('H420 carries no terminating full stop, because the source does not', () => {
    // Checked against the regulation rather than "corrected" to match its
    // neighbours — every language in Annex III renders this one without one.
    expect(hazardStatementText('eu-clp', 'H420')).toBe(
      'Harms public health and the environment by destroying ozone in the upper atmosphere',
    )
  })

  it.each([
    ['P233', 'Keep container tightly closed.'],
    ['P280', 'Wear protective gloves/protective clothing/eye protection/face protection.'],
  ])('%s reads exactly as CLP Annex IV prints it', (code, text) => {
    expect(precautionaryStatementText('eu-clp', code)).toBe(text)
  })

  /**
   * The bracketed optional component, which a parser that could not see square
   * brackets merged into a single fabricated code. Two statements, two texts.
   */
  it('keeps a bracketed optional component distinct from the statement without it', () => {
    expect(precautionaryStatementText('eu-clp', 'P370 + P380 + P375')).toBe(
      'In case of fire: Evacuate area. Fight fire remotely due to the risk of explosion.',
    )
    expect(precautionaryStatementText('eu-clp', 'P370 + P380 + P375 [+ P378]')).toBe(
      'In case of fire: Evacuate area. Fight fire remotely due to the risk of explosion. [Use … to extinguish].',
    )
    // The code the faulty parser invented must not exist.
    expect(precautionaryStatementText('eu-clp', 'P370 + P380')).toBeUndefined()
  })

  it('carries P503, whose text appears only in Annex IV Part 1', () => {
    expect(precautionaryStatementText('eu-clp', 'P503')).toContain('disposal/recovery/recycling')
  })

  it('has no entry for P200, which is a UN transport packing instruction', () => {
    // It appears in Annex IV Part 1 as "packing instruction P200 of the UN RTDG"
    // and is not a precautionary statement at all.
    expect(precautionaryStatementText('eu-clp', 'P200')).toBeUndefined()
  })
})

describe('canonicalising a code the tables already hold changes nothing', () => {
  it('leaves every key in every table exactly as the source spells it', () => {
    // The invariant that makes the bracket case checkable rather than
    // remembered. Spacing every `+` alike rewrote CLP's own
    // `'P370 + P380 + P375 [+ P378]'` to `'[ + P378]'`, so canonicalising the
    // table's own key produced something the table does not contain — and every
    // lookup that canonicalises first, which by now is all of them, stopped
    // finding the one code the editor offers for it.
    const tables = [
      EU_CLP_HAZARD_STATEMENTS,
      EU_CLP_PRECAUTIONARY_STATEMENTS,
      US_OSHA_HAZARD_STATEMENTS,
      US_OSHA_PRECAUTIONARY_STATEMENTS,
    ]
    for (const table of tables) {
      for (const key of Object.keys(table)) {
        expect(canonicalStatementCode(key), key).toBe(key)
      }
    }
  })

  it('still collapses the spellings a label actually prints', () => {
    expect(canonicalStatementCode('p337+p313')).toBe('P337 + P313')
    expect(canonicalStatementCode('  H225  ')).toBe('H225')
  })

  it('collapses every spacing of the bracketed member onto the key', () => {
    // A label prints this combination without much regard for the regulation's
    // own spacing, and all of these are the same code. Repairing only the `+`
    // inside the bracket left the unspaced form — the one a label is most likely
    // to print — still failing, which is the half-fix this replaced.
    const KEY = 'P370 + P380 + P375 [+ P378]'
    for (const spelling of [
      KEY,
      'P370 + P380 + P375 [ + P378]',
      'P370+P380+P375[+P378]',
      'p370 + p380 + p375 [ +p378 ]',
      '  P370+P380 + P375  [ + P378 ]  ',
    ]) {
      expect(canonicalStatementCode(spelling), spelling).toBe(KEY)
    }
  })
})

describe('the optional member of a combination code is not optional to a lookup', () => {
  it('keeps the bracketed and un-bracketed codes as two codes', () => {
    // **The guard against a fix that would generate regulatory text.**
    // `docs/BACKLOG.md` asked for “a lookup that understands the bracket”, on the
    // false premise that `P370 + P380 + P375` resolved to nothing. It is its own
    // key. Collapsing the two — the obvious reading of that request — would append
    // “[Use … to extinguish].” to a label that never carried P378.
    const bare = precautionaryStatementText('eu-clp', 'P370 + P380 + P375')
    const bracketed = precautionaryStatementText('eu-clp', 'P370 + P380 + P375 [+ P378]')

    expect(bare, 'the un-bracketed code is its own entry').toBeDefined()
    expect(bracketed).toBeDefined()
    expect(bare).not.toBe(bracketed)
    expect(bare, 'P378 is what the bracket adds, and it must not leak').not.toContain('extinguish')
    expect(bracketed).toContain('extinguish')
  })

  it('has exactly one bracketed key, which is the count the BACKLOG asked for', () => {
    const keys = [
      ...Object.keys(EU_CLP_HAZARD_STATEMENTS),
      ...Object.keys(EU_CLP_PRECAUTIONARY_STATEMENTS),
    ]
    expect(keys.filter((key) => key.includes('['))).toEqual(['P370 + P380 + P375 [+ P378]'])
  })
})

describe('a lookup answers from the table and never from the prototype', () => {
  it('has no text for an inherited property name', () => {
    // `constructor` is not undefined on a plain object literal — it is a
    // function — so a bare `table[code]` returns one, sails past a
    // `!== undefined` guard downstream, and crashes the layout engine on
    // `text.split`. That was once a 500 from a well-formed request, and `own()`
    // is the fix.
    //
    // **Pinned here rather than through a schema**, because every caller that
    // canonicalises to upper case defuses this by accident: nothing on
    // `Object.prototype` is spelt in capitals, so an API-level test passes with
    // `own()` removed and proves nothing about it. These go in raw.
    for (const code of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
      expect(hazardStatementText('eu-clp', code), code).toBeUndefined()
      expect(precautionaryStatementText('eu-clp', code), code).toBeUndefined()
      expect(hazardStatementText('us-osha', code), code).toBeUndefined()
    }
  })
})

describe('a regime never borrows another regime’s wording', () => {
  it('declines rather than falling back when it has no verified text', () => {
    // OSHA's Appendix C.4 text is not transcribed yet. A US label must say so,
    // not quietly print the EU wording.
    expect(hazardStatementText('us-osha', 'H225')).toBeUndefined()
    expect(precautionaryStatementText('us-osha', 'P233')).toBeUndefined()
    // And the EU table is unaffected by the empty one beside it.
    expect(hazardStatementText('eu-clp', 'H225')).toBeDefined()
  })

  it('accepts only the declared regimes', () => {
    expect(GHS_REGIMES).toEqual(['eu-clp', 'us-osha'])
  })
})

describe('pictogram sets differ by regime, per the source', () => {
  it('gives CLP nine pictograms and OSHA eight', () => {
    // 29 CFR 1910.1200 App. C.2.3.2: "One of eight standard hazard symbols".
    expect(GHS_PICTOGRAMS_BY_REGIME['eu-clp']).toHaveLength(9)
    expect(GHS_PICTOGRAMS_BY_REGIME['us-osha']).toHaveLength(8)
  })

  it('omits the environment pictogram from the US set, and only that one', () => {
    expect(isPictogramRecognised('us-osha', 'GHS09')).toBe(false)
    expect(isPictogramRecognised('eu-clp', 'GHS09')).toBe(true)
    const missing = GHS_PICTOGRAMS_BY_REGIME['eu-clp'].filter(
      (code) => !GHS_PICTOGRAMS_BY_REGIME['us-osha'].includes(code),
    )
    expect(missing).toEqual(['GHS09'])
  })
})

describe('the tables are the size the source says they are', () => {
  it('carries every CLP statement extracted from the annexes', () => {
    expect(Object.keys(EU_CLP_HAZARD_STATEMENTS)).toHaveLength(70)
    expect(Object.keys(EU_CLP_PRECAUTIONARY_STATEMENTS)).toHaveLength(129)
  })

  it('has no empty or placeholder text anywhere', () => {
    for (const [code, text] of [
      ...Object.entries(EU_CLP_HAZARD_STATEMENTS),
      ...Object.entries(EU_CLP_PRECAUTIONARY_STATEMENTS),
    ]) {
      expect(text.trim(), `${code} is blank`).not.toBe('')
      expect(text, `${code} carries an amendment marker`).not.toMatch(/[►◄▼]/)
      expect(text.length, `${code} is suspiciously short`).toBeGreaterThan(8)
    }
  })
})

describe('the text carries no extraction artefacts', () => {
  const ALL = Object.entries({
    ...EU_CLP_HAZARD_STATEMENTS,
    ...EU_CLP_PRECAUTIONARY_STATEMENTS,
  })

  /**
   * These patterns are what the first extraction produced, and what the original
   * verification could not see because it compared the extractor against itself.
   */
  it.each([
    ['a degree sign flattened to a spaced letter o', /\so\s[CF]\b/],
    ['a line break welded into a mid-token space', /[a-z]\/ [a-z]/],
    ['a double space', / {2}/],
    ['an amendment marker', /[►◄▼]/],
  ])('carries no %s', (_what, pattern) => {
    const offenders = ALL.filter(([, text]) => pattern.test(text)).map(([code]) => code)
    expect(offenders).toEqual([])
  })

  it('renders temperatures with a real degree sign', () => {
    expect(EU_CLP_PRECAUTIONARY_STATEMENTS['P412']).toBe(
      'Do not expose to temperatures exceeding 50 °C/122°F.',
    )
  })

  /**
   * Two things that look like defects and are not. Both were checked against the
   * rendered page; "fixing" either would be altering the regulation's text.
   */
  it('keeps the source’s own spacing before a closing full stop', () => {
    expect(EU_CLP_PRECAUTIONARY_STATEMENTS['P401']).toBe('Store in accordance with… .')
  })

  it('keeps the source’s own typo in P410 + P412', () => {
    // The regulation prints "Do no expose" here and "Do not expose" at P412.
    // Reproducing the text means reproducing that, however much it reads wrong.
    expect(EU_CLP_PRECAUTIONARY_STATEMENTS['P410 + P412']).toContain('Do no expose')
    expect(EU_CLP_PRECAUTIONARY_STATEMENTS['P412']).toContain('Do not expose')
  })
})
