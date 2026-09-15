/**
 * The shape of a saved label.
 *
 * `LabelDocumentInput` is the only description of what may be stored, and the
 * same one the export routes are built from — so these cases are also what stops
 * the two paths drifting into disagreeing about what a valid label is.
 */
import { DEFAULT_GHS_STOCK, DEFAULT_UPC_A_STOCK } from '@packwright/label-core'
import { describe, expect, it } from 'vitest'
import { GhsRequest, LABEL_TYPES, LabelDocumentInput } from './schemas'

// From the engine's own default rather than three numbers typed here. A copy
// keeps passing after the default moves, which leaves a fixture asserting
// against a stock the application no longer draws.
const STOCK = DEFAULT_UPC_A_STOCK
const A_RETAIL_LABEL = {
  name: 'Granola 340g',
  labelType: 'gs1-retail',
  stock: STOCK,
  data: { gtin: '036000291452' },
}

describe('LabelDocumentInput', () => {
  it('accepts a gs1-retail document', () => {
    expect(LabelDocumentInput.safeParse(A_RETAIL_LABEL).success).toBe(true)
  })

  it('refuses a document whose data belongs to another label type', () => {
    // The failure a PATCH would let through: a us-food document still carrying
    // a gtin. The discriminated union makes it unrepresentable.
    const parsed = LabelDocumentInput.safeParse({ ...A_RETAIL_LABEL, labelType: 'us-food' })
    expect(parsed.success).toBe(false)
  })

  it('requires stock rather than defaulting it', () => {
    // A saved label records the stock it was designed at. Inheriting
    // DEFAULT_UPC_A_STOCK would mean changing that constant silently resizes
    // every label already stored, first visible in a PDF someone has printed.
    const { stock: _stock, ...withoutStock } = A_RETAIL_LABEL
    expect(LabelDocumentInput.safeParse(withoutStock).success).toBe(false)
  })

  it.each(['', '   '])('refuses a name of %j', (name) => {
    expect(LabelDocumentInput.safeParse({ ...A_RETAIL_LABEL, name }).success).toBe(false)
  })

  it('keeps the same cross-field checks a us-food export gets', () => {
    // `.omit` is an object method and a refined schema is no longer an object,
    // so the saved shape is built from the unrefined base — and would validate
    // more weakly than the export route unless the refinement is reapplied.
    // This is the case that notices if it ever is not.
    const parsed = LabelDocumentInput.safeParse({
      name: 'Granola',
      labelType: 'us-food',
      stock: STOCK,
      data: {
        statementOfIdentity: 'Oat and almond granola',
        netQuantity: { inchPound: 'NET WT 12 OZ' },
        container: { shape: 'rectangular', widthMm: 120, heightMm: 240 },
        ingredients: [{ name: 'oats', percentByWeight: 98 }],
        // Two, against a list of one.
        ingredientThreshold: { percent: 2, count: 2 },
      },
    })
    expect(parsed.success).toBe(false)
    expect(JSON.stringify(parsed.error?.issues)).toContain('cannot cover more entries')
  })

  it('names every label type the editor can produce', () => {
    expect([...LABEL_TYPES]).toEqual(['gs1-retail', 'ghs-chemical', 'us-food'])
  })

  it('covers exactly the label types the model will accept', () => {
    // The union restates the three types because each arm carries a different
    // `data` schema, so the arms are not derivable from a list. What is derivable
    // is that the two agree — and they have to. A type in the union but not in
    // `LABEL_TYPES` turns a request this schema accepts into a 500 from the
    // Mongoose enum validator, which is the same two-sources-of-truth failure
    // this file exists to avoid, one level up.
    const covered = LabelDocumentInput.options.map((option) => option.shape.labelType.value)
    expect(covered.sort()).toEqual([...LABEL_TYPES].sort())
  })
})

/**
 * Statement codes belong to the regime of the label carrying them.
 *
 * Both arrays used to be keyed to the EU table whatever `regime` said beside
 * them. The saved-label route and the export route share this schema, so a case
 * here covers both — and `LabelDocumentInput` reaches it by a different route,
 * through `GhsRequestShape.omit(...)`, which is why the last case exists.
 */
describe('GHS statement codes are checked against the label\u2019s own regime', () => {
  const EU = {
    regime: 'eu-clp',
    productIdentifier: 'Acetone',
    capacityL: 5,
  }

  it('refuses a us-osha label\u2019s codes rather than checking them against the EU table', () => {
    // The defect. `H225` is a real UN GHS code and the EU table has text for it,
    // so the old enum waved it through on a US label — which this build cannot
    // draw, because Appendix C.4 is not transcribed.
    const parsed = GhsRequest.safeParse({
      ...EU,
      regime: 'us-osha',
      hazardStatementCodes: ['H225'],
    })
    expect(parsed.success).toBe(false)
    const message = JSON.stringify(parsed.error?.issues)
    expect(message, 'the message has to name the regime it judged against').toContain('us-osha')
    expect(message).toContain('no verified')
  })

  it('says so once for the whole field rather than once per code', () => {
    // Eleven identical sentences read like eleven defects on the label instead
    // of one gap in this build.
    const parsed = GhsRequest.safeParse({
      ...EU,
      regime: 'us-osha',
      hazardStatementCodes: ['H225', 'H319', 'H336'],
    })
    expect(parsed.error?.issues).toHaveLength(1)
  })

  it('still accepts the same codes under the regime that has text for them', () => {
    expect(GhsRequest.safeParse({ ...EU, hazardStatementCodes: ['H225'] }).success).toBe(true)
  })

  it('accepts a us-osha label that carries no statement codes at all', () => {
    // Which is every US label this build can currently draw. The check must not
    // make the regime itself unusable.
    expect(GhsRequest.safeParse({ ...EU, regime: 'us-osha' }).success).toBe(true)
  })

  it('names the one code it could not resolve, and where', () => {
    const parsed = GhsRequest.safeParse({
      ...EU,
      hazardStatementCodes: ['H225', 'H999'],
    })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues).toHaveLength(1)
    expect(parsed.error?.issues[0]?.message).toContain('H999')
    expect(
      parsed.error?.issues[0]?.path,
      'the field — an index would point into an array the caller never sent, ' +
        'since these are deduplicated and canonicalised before they are checked',
    ).toEqual(['hazardStatementCodes'])
  })

  it('accepts the spellings every other layer accepts, and stores one of them', () => {
    // `P337+P313` and `h225` are what the extraction endpoint and the confirm
    // screen both take; the enum here refused them, so a code the server had
    // already accepted once was rejected on the way to being saved. The engine
    // looks these up by exact key, so they are stored canonicalised rather than
    // merely tolerated — a confirmed `p337+p313` would otherwise draw nothing.
    const parsed = GhsRequest.safeParse({
      ...EU,
      hazardStatementCodes: ['h225'],
      precautionaryStatementCodes: ['P337+P313'],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.hazardStatementCodes).toEqual(['H225'])
    expect(parsed.data?.precautionaryStatementCodes).toEqual(['P337 + P313'])
  })

  it('carries one entry per statement, however many spellings arrive', () => {
    // The engine draws one statement per entry, so a duplicate is the statement
    // printed twice on the exported PDF. `extract.ts` dedupes after
    // canonicalising for exactly this reason, and canonicalising here without
    // doing the same added `h225` beside `H225` to the ways of reaching it. The
    // old enum already let an exact repeat through.
    const parsed = GhsRequest.safeParse({
      ...EU,
      hazardStatementCodes: ['H225', 'h225', 'H225'],
      precautionaryStatementCodes: ['P337+P313', 'P337 + P313'],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.hazardStatementCodes).toEqual(['H225'])
    expect(parsed.data?.precautionaryStatementCodes).toEqual(['P337 + P313'])
  })

  it('keeps distinct codes in the order they were sent', () => {
    // Deduping must not reorder: the label prints them in this order.
    const parsed = GhsRequest.safeParse({
      ...EU,
      hazardStatementCodes: ['H319', 'H225', 'h319'],
    })
    expect(parsed.data?.hazardStatementCodes).toEqual(['H319', 'H225'])
  })

  it('accepts the bracketed combination code the editor offers', () => {
    // CLP keys one entry `'P370 + P380 + P375 [+ P378]'`, where the `+` inside
    // the bracket is the regulation's own notation for an optional component.
    // Canonicalising spaced it like any other `+`, so the table's own key no
    // longer matched the table — and this check, which canonicalises first,
    // refused the one code the dropdown offers for it. The old enum took the key
    // verbatim, so this was a regression the refinement introduced.
    // Both the key's own spacing and the spacing a label is most likely to print.
    for (const spelling of ['P370 + P380 + P375 [+ P378]', 'P370+P380+P375[+P378]']) {
      const parsed = GhsRequest.safeParse({ ...EU, precautionaryStatementCodes: [spelling] })
      expect(parsed.success, `${spelling}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true)
      expect(parsed.data?.precautionaryStatementCodes).toEqual(['P370 + P380 + P375 [+ P378]'])
    }
  })

  it('refuses a blank entry rather than reporting a code it cannot name', () => {
    // A whitespace-only string has a length, so `.min(1)` passed it and it
    // canonicalised to nothing — giving ““” has no verified text”, a complaint
    // about a code the caller cannot go and look for.
    // Zod runs the object-level check even when the entry raised its own issue,
    // so the blank drew two complaints: the useful one, and one naming nothing.
    const parsed = GhsRequest.safeParse({ ...EU, hazardStatementCodes: ['   '] })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues, 'one complaint, not two').toHaveLength(1)
    expect(parsed.error?.issues[0]?.code).toBe('too_small')
  })

  it('refuses an inherited property name rather than crashing on it', () => {
    // The input here widened from an enum to free strings, so this boundary is
    // load-bearing again: a plain object literal inherits from `Object.prototype`,
    // and `table['constructor']` returns a function rather than `undefined`. That
    // once sailed past a `!== undefined` guard and crashed the layout engine on
    // `text.split` — a 500 from a well-formed request.
    //
    // Two things stop it now and only one is deliberate. `own()` in
    // `ghs/statements.ts` is the guard; canonicalising to upper case also happens
    // to defuse it, since nothing on `Object.prototype` is spelt in capitals. A
    // test that leant on the accident would pass with the guard removed.
    for (const code of ['constructor', 'toString', 'hasOwnProperty']) {
      const parsed = GhsRequest.safeParse({ ...EU, hazardStatementCodes: [code] })
      expect(parsed.success, `\u201C${code}\u201D must be refused, not resolved`).toBe(false)
    }
  })

  it('applies the same check to a label on its way into storage', () => {
    // `LabelDocumentInput` reaches the shape through `.omit({ stock: true })`,
    // which cannot carry a refinement across — so the check is applied again on
    // the other side rather than inherited, and this is what says it was.
    const parsed = LabelDocumentInput.safeParse({
      name: 'Acetone 5L',
      labelType: 'ghs-chemical',
      stock: DEFAULT_GHS_STOCK,
      data: { ...EU, regime: 'us-osha', hazardStatementCodes: ['H225'] },
    })
    expect(parsed.success).toBe(false)
    expect(JSON.stringify(parsed.error?.issues)).toContain('us-osha')
  })

  it('stores a saved label\u2019s codes canonicalised too', () => {
    const parsed = LabelDocumentInput.safeParse({
      name: 'Acetone 5L',
      labelType: 'ghs-chemical',
      stock: DEFAULT_GHS_STOCK,
      data: { ...EU, hazardStatementCodes: ['h225'] },
    })
    expect(parsed.success).toBe(true)
    expect(
      parsed.success && parsed.data.labelType === 'ghs-chemical'
        ? parsed.data.data.hazardStatementCodes
        : undefined,
    ).toEqual(['H225'])
  })
})
