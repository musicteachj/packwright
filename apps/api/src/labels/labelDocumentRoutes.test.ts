import { DEFAULT_UPC_A_STOCK } from '@packwright/label-core'
import mongoose from 'mongoose'
import supertest from 'supertest'
import { describe, expect, it, vi } from 'vitest'
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
    // Mongo stores milliseconds. Two creates inside one of them tie on
    // `updatedAt` and the sort is then arbitrary — a test that passes on the
    // machine it was written on.
    await new Promise((resolve) => setTimeout(resolve, 5))
    await LabelDocument.create({ ...A_LABEL, name: 'Newer' })
    const response = await supertest(app()).get('/api/labels')
    expect(response.status).toBe(200)
    expect(response.body.labels.map((entry: { name: string }) => entry.name)).toEqual([
      'Newer',
      'Older',
    ])
    // A list needs names and dates, not three nested label payloads.
    expect(response.body.labels[0]).not.toHaveProperty('data')
    // Nothing further to fetch, so no cursor is offered.
    expect(response.body.nextBefore).toBeUndefined()
  })

  it('pages over a cursor rather than returning everything there is', async () => {
    // The list was an unbounded collection scan: every saved label, every call.
    // `skip` would re-read and discard everything before the offset, so the last
    // page of a long list would cost the most; the cursor reads from where the
    // previous page stopped, against the index `updatedAt` already has.
    for (const name of ['A', 'B', 'C']) {
      await LabelDocument.create({ ...A_LABEL, name })
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    const first = await supertest(app()).get('/api/labels?limit=2')
    expect(first.body.labels.map((entry: { name: string }) => entry.name)).toEqual(['C', 'B'])
    expect(first.body.nextBefore, 'there is more to fetch').toBeTruthy()

    const second = await supertest(app()).get(
      `/api/labels?limit=2&before=${encodeURIComponent(String(first.body.nextBefore))}`,
    )
    expect(second.body.labels.map((entry: { name: string }) => entry.name)).toEqual(['A'])
    expect(second.body.nextBefore, 'and now there is not').toBeUndefined()
  })

  it('serves the paged sort from an index rather than a collection scan', async () => {
    // The only thing that would have caught this: the sort gained `_id` for the
    // cursor's tie-break and the index was left covering `updatedAt` alone, so
    // the planner quietly stopped matching it and went back to a collection scan
    // and an in-memory sort — on the very list that had just been made cheaper to
    // fetch, with the prose describing the change claiming the opposite. No
    // behavioural test can see this; the plan is the only evidence.
    await LabelDocument.syncIndexes()
    const plan = (await LabelDocument.find({}, 'name labelType createdAt updatedAt')
      .sort({ updatedAt: -1, _id: -1 })
      .limit(51)
      .explain('queryPlanner')) as never as { queryPlanner: { winningPlan: unknown } }

    const winning = JSON.stringify(plan.queryPlanner.winningPlan)
    expect(winning, 'an in-memory sort against a 32 MB ceiling').not.toContain('COLLSCAN')
    expect(winning).toContain('updatedAt_-1__id_-1')
  })

  it('pages through labels that share a timestamp', async () => {
    // The bug the first version of this shipped with, and the reason the test
    // above sleeps between creates: Mongo stores milliseconds, four labels saved
    // inside one of them tie on `updatedAt`, and a cursor of `updatedAt < x`
    // steps over every neighbour of the boundary. Two of four came back and the
    // list said it was finished. Nothing sleeps here — the ties are the point.
    await LabelDocument.insertMany(
      ['A', 'B', 'C', 'D'].map((name) => ({
        ...A_LABEL,
        name,
        createdAt: new Date('2026-09-18'),
        updatedAt: new Date('2026-09-18'),
      })),
      { timestamps: false },
    )

    const seen: string[] = []
    let before: string | undefined
    for (let page = 0; page < 5; page++) {
      const query: string =
        before === undefined ? '?limit=2' : `?limit=2&before=${encodeURIComponent(before)}`
      const response = await supertest(app()).get(`/api/labels${query}`)
      expect(response.status).toBe(200)
      seen.push(...response.body.labels.map((entry: { name: string }) => entry.name))
      before = response.body.nextBefore
      if (before === undefined) break
    }

    expect(seen.sort()).toEqual(['A', 'B', 'C', 'D'])
  })

  it('refuses a repeated cursor parameter, which Express hands over as an array', async () => {
    // Reading a non-string as "no cursor" answers page one carrying the same
    // `nextBefore` the caller just sent, which is the loop the 400 exists to
    // stop — reached by a different door. Found by review.
    const response = await supertest(app()).get('/api/labels?before=a_b&before=a_b')
    expect(response.status).toBe(400)
  })

  it('refuses a cursor it cannot read rather than starting over', async () => {
    // Ignoring it answers page one, so a client with a corrupted cursor loops
    // over the head of the list forever with nothing to tell it why.
    const response = await supertest(app()).get('/api/labels?before=not-a-cursor')
    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Invalid cursor')
  })

  // Asserted against the query rather than the response, which is the whole
  // point and was nearly missed: with only a handful of documents stored, a
  // response of every one of them is indistinguishable from a correctly paged
  // one. Both of the first attempts at these passed with the bound removed.
  it.each([
    ['nothing asked', '', 51],
    ['a modest page', '?limit=10', 11],
    ['more than the cap', '?limit=100000', 201],
    // `Number('')` is 0 and passes `isFinite`, so an empty parameter used to ask
    // for a page of one while `?limit=abc` correctly fell back to the default.
    ['a nonsense figure', '?limit=-5', 51],
    ['an empty figure', '?limit=', 51],
    ['an unreadable figure', '?limit=abc', 51],
  ])('bounds the query itself: %s', async (_case, query, expected) => {
    // Spied rather than stubbed, so the query still runs and the route still
    // answers — this asserts what was asked of Mongo, not what came back.
    const spy = vi.spyOn(mongoose.Query.prototype, 'limit')
    try {
      const response = await supertest(app()).get(`/api/labels${query}`)
      expect(response.status).toBe(200)

      // One more than the page, so "is there another page" is answered by the
      // query rather than by a second count that could disagree with it.
      expect(spy.mock.calls.map(([value]) => value)).toEqual([expected])
    } finally {
      // In a `finally`, or the failure this test exists to catch would poison
      // every test after it with a live spy on Mongoose's prototype.
      spy.mockRestore()
    }
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

  it('does not serve a field the schema no longer describes', async () => {
    // Reading validates, and what was validated is what must be sent. Zod strips
    // keys it does not know, so parsing and then serving the original checks
    // nothing a client can see — and a stale value reaching a client is a value
    // that can be sent back.
    const created = await LabelDocument.create(A_LABEL)
    await LabelDocument.collection.updateOne(
      { _id: created._id },
      { $set: { 'data.legacyField': 'stale' } },
    )

    const response = await supertest(app()).get(`/api/labels/${created._id}`)

    expect(response.status).toBe(200)
    expect(response.body.data).not.toHaveProperty('legacyField')
    expect(response.body.data).toEqual({ gtin: '036000291452' })
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

  it('clears a field an older shape left behind', async () => {
    // A replace and not a `$set`: updating the fields the schema knows about
    // leaves anything it does not, and a stale value becomes live again the day
    // a field name is reused. Nothing becomes label data silently.
    const created = await LabelDocument.create(A_LABEL)
    await LabelDocument.collection.updateOne(
      { _id: created._id },
      { $set: { legacyField: 'stale' } },
    )

    await supertest(app())
      .put(`/api/labels/${created._id}`)
      .send({ ...A_LABEL, name: 'Renamed' })

    expect(await LabelDocument.collection.findOne({ _id: created._id })).not.toHaveProperty(
      'legacyField',
    )
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
