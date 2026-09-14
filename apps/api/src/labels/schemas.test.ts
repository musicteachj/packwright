/**
 * The shape of a saved label.
 *
 * `LabelDocumentInput` is the only description of what may be stored, and the
 * same one the export routes are built from — so these cases are also what stops
 * the two paths drifting into disagreeing about what a valid label is.
 */
import { DEFAULT_UPC_A_STOCK } from '@packwright/label-core'
import { describe, expect, it } from 'vitest'
import { LABEL_TYPES, LabelDocumentInput } from './schemas'

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
