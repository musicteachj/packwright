import { DEFAULT_UPC_A_STOCK } from '@packwright/label-core'
import supertest from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { LabelDocument } from './labelDocument'
import { withDatabase } from '../testing/withDatabase'

const app = () => createApp({ enableLogging: false })
const STOCK = DEFAULT_UPC_A_STOCK
const A_LABEL = {
  name: 'Granola 340g',
  labelType: 'gs1-retail',
  stock: STOCK,
  data: { gtin: '036000291452' },
} as const

describe('/api/labels', () => {
  withDatabase()

  it('creates a label and returns it with an id', async () => {
    const response = await supertest(app()).post('/api/labels').send(A_LABEL)
    expect(response.status).toBe(201)
    expect(typeof response.body.id).toBe('string')
    expect(response.body.data).toEqual({ gtin: '036000291452' })
  })

  it('refuses a body whose data belongs to another label type', async () => {
    const response = await supertest(app())
      .post('/api/labels')
      .send({ ...A_LABEL, labelType: 'us-food' })
    expect(response.status).toBe(400)
    expect(response.body.detail).toBeInstanceOf(Array)
  })

  it('lists labels newest first, without their data', async () => {
    await LabelDocument.create({ ...A_LABEL, name: 'Older' })
    await LabelDocument.create({ ...A_LABEL, name: 'Newer' })
    const response = await supertest(app()).get('/api/labels')
    expect(response.status).toBe(200)
    expect(response.body.map((entry: { name: string }) => entry.name)).toEqual(['Newer', 'Older'])
    // A list needs names and dates, not three nested label payloads.
    expect(response.body[0]).not.toHaveProperty('data')
  })

  it('reads one label in full', async () => {
    const created = await LabelDocument.create(A_LABEL)
    const response = await supertest(app()).get(`/api/labels/${created._id}`)
    expect(response.status).toBe(200)
    expect(response.body.data).toEqual({ gtin: '036000291452' })
  })

  it('answers 404 for an id that is not an ObjectId', async () => {
    // A request for a label that does not exist, which is what 404 means.
    // Letting Mongoose's cast error become a 500 reports a server fault for a
    // client's typo.
    expect((await supertest(app()).get('/api/labels/nonsense')).status).toBe(404)
  })

  it('answers 404 for a well-formed id that names nothing', async () => {
    expect((await supertest(app()).get('/api/labels/64b7f0000000000000000000')).status).toBe(404)
  })

  it('replaces a label rather than merging into it', async () => {
    const created = await LabelDocument.create(A_LABEL)
    const response = await supertest(app())
      .put(`/api/labels/${created._id}`)
      .send({ ...A_LABEL, name: 'Renamed' })
    expect(response.status).toBe(200)
    expect(response.body.name).toBe('Renamed')
  })

  it('keeps the date a label was created, and moves the date it changed', async () => {
    // `findOneAndReplace` re-dated the label on every edit, because a
    // replacement body carries no `createdAt` and mongoose fills it with the
    // current time. Nothing noticed: the test above asserts only the name.
    const created = await LabelDocument.create(A_LABEL)
    const before = created.createdAt.toISOString()
    // Mongo stores milliseconds, so an edit in the same millisecond is
    // indistinguishable from no edit at all.
    await new Promise((resolve) => setTimeout(resolve, 5))

    const response = await supertest(app())
      .put(`/api/labels/${created._id}`)
      .send({ ...A_LABEL, name: 'Renamed' })

    expect(response.body.createdAt, 'the label was not created again').toBe(before)
    expect(new Date(response.body.updatedAt).getTime()).toBeGreaterThan(new Date(before).getTime())
  })

  it('deletes a label', async () => {
    const created = await LabelDocument.create(A_LABEL)
    expect((await supertest(app()).delete(`/api/labels/${created._id}`)).status).toBe(204)
    expect(await LabelDocument.findById(created._id)).toBeNull()
  })

  it('reports a stored document that no longer validates rather than serving it', async () => {
    // The guard that cannot be reached by using the API normally, which is why
    // it is asserted here. A label saved under an older shape must not be handed
    // to the engine to mis-draw, or to a rule to mis-judge.
    const created = await LabelDocument.create({ ...A_LABEL, data: { gtin: 'not-a-gtin' } })
    const response = await supertest(app()).get(`/api/labels/${created._id}`)
    expect(response.status).toBe(500)
    expect(JSON.stringify(response.body)).toContain(String(created._id))
  })

  it('leaves the export routes reachable on the same mount path', async () => {
    // `/api/labels/:id` is one segment; `/api/labels/upc-a/export` is two and
    // POST-only. Asserted because "the CRUD router shadowed the exports" is the
    // kind of thing found in production rather than by reading.
    const response = await supertest(app())
      .post('/api/labels/upc-a/export')
      .send({ gtin: '036000291452' })
    expect(response.status).toBe(200)
  })
})
