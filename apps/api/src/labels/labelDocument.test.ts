import { DEFAULT_UPC_A_STOCK } from '@packwright/label-core'
import { describe, expect, it } from 'vitest'
import { LabelDocument, serializeLabelDocument } from './labelDocument'
import { withDatabase } from '../testing/withDatabase'

const STOCK = DEFAULT_UPC_A_STOCK
// `as const` so `labelType` stays the literal the schema's enum expects. Widened
// to `string`, `create()` falls through to its filter overload and the errors
// then point at `_id` rather than at the fixture.
const A_LABEL = {
  name: 'Granola 340g',
  labelType: 'gs1-retail',
  stock: STOCK,
  data: { gtin: '036000291452' },
} as const

// Once for the file. Called inside each `describe`, it starts and stops a
// separate `mongod` per block, which is two of them to answer questions that
// share a collection.
withDatabase()

describe('LabelDocument', () => {
  it('round-trips a gs1-retail label', async () => {
    const saved = await LabelDocument.create(A_LABEL)
    const read = await LabelDocument.findById(saved._id).lean()
    expect(read?.data).toEqual({ gtin: '036000291452' })
  })

  it('round-trips a us-food label without reshaping its nested data', async () => {
    // `Mixed` is stored opaquely, which is the point — but it is worth proving
    // a nutrition panel comes back with its structure intact rather than as
    // something Mongoose decided to flatten.
    const data = {
      statementOfIdentity: 'Oat and almond granola',
      container: { shape: 'rectangular', widthMm: 120, heightMm: 240 },
      netQuantity: { inchPound: 'NET WT 12 OZ', metric: '(340 g)' },
      nutritionFacts: {
        servingSize: '1/2 cup (40g)',
        servingsPerContainer: 8,
        amounts: { calories: 150, protein: 5 },
      },
    }
    const saved = await LabelDocument.create({
      name: 'Granola',
      labelType: 'us-food' as const,
      stock: STOCK,
      data,
    })
    const read = await LabelDocument.findById(saved._id).lean()
    expect(read?.data).toEqual(data)
  })

  it('refuses a label type it does not know', async () => {
    // Cast because the point is a value the type system already refuses. The
    // test is that the database refuses it too, for a caller that is not typed.
    await expect(
      LabelDocument.create({ ...A_LABEL, labelType: 'gs1-pallet' } as never),
    ).rejects.toThrow(/gs1-pallet/)
  })

  it('records when it was created and last changed', async () => {
    const saved = await LabelDocument.create(A_LABEL)
    expect(saved.createdAt).toBeInstanceOf(Date)
    expect(saved.updatedAt).toBeInstanceOf(Date)
  })
})

describe('serializeLabelDocument', () => {
  it('hands back a string id, and no version key', async () => {
    const saved = await LabelDocument.create(A_LABEL)
    const body = serializeLabelDocument(saved)
    expect(typeof body.id).toBe('string')
    expect(body).not.toHaveProperty('_id')
    expect(body).not.toHaveProperty('__v')
    expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
