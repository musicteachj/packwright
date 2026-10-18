import { createHash } from 'node:crypto'
import { DEFAULT_UPC_A_STOCK } from '@packwright/label-core'
import mongoose from 'mongoose'
import supertest from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { LabelDocument } from './labelDocument'
import {
  DEFAULT_LABEL_WRITE_LIMITS,
  EDIT_TOKEN_HEADER,
  LABEL_CAP,
  type LabelWriteLimits,
} from './labelDocumentRoutes'
import { withDatabase } from '../testing/withDatabase'

const app = () => createApp({ enableLogging: false })
const STOCK = DEFAULT_UPC_A_STOCK
const A_LABEL = {
  name: 'Granola 340g',
  labelType: 'gs1-retail',
  stock: STOCK,
  data: { gtin: '036000291452' },
} as const

/** A label saved through the route, with the token its creator was handed. */
async function saved(body: object = A_LABEL): Promise<{ id: string; token: string }> {
  const response = await supertest(app()).post('/api/labels').send(body)
  expect(response.status).toBe(201)
  return { id: String(response.body.id), token: String(response.body.editToken) }
}

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

  describe('the cap', () => {
    // Stored straight through the model, which is the one way past the route's
    // count, so these can stand a collection at any size, including above the
    // cap, the way a development database from before it can.
    const store = (count: number) =>
      LabelDocument.insertMany(
        Array.from({ length: count }, (_, index) => ({ ...A_LABEL, name: `Stored ${index}` })),
      )

    it('is two hundred', () => {
      expect(LABEL_CAP).toBe(200)
    })

    it('takes the two hundredth label', async () => {
      await store(199)
      expect((await supertest(app()).post('/api/labels').send(A_LABEL)).status).toBe(201)
      expect(await LabelDocument.countDocuments({})).toBe(200)
    })

    it('refuses the two hundred and first, saying what to do about it', async () => {
      await store(200)
      // Refused before the insert, not only undone after it. The recount below
      // would also catch this, but by then an extra label has existed, counted
      // and openable by anyone who asked in that moment.
      const create = vi.spyOn(LabelDocument, 'create')
      let response
      let inserts
      try {
        response = await supertest(app()).post('/api/labels').send(A_LABEL)
        // Read before the restore: Vitest's `mockRestore` clears the calls it
        // recorded, so asserting afterwards passed whatever the route did.
        inserts = create.mock.calls.length
      } finally {
        create.mockRestore()
      }
      expect(inserts, 'nothing was inserted').toBe(0)
      expect(response.status).toBe(409)
      expect(response.body.error).toBe(
        'There are already 200 saved labels, which is as many as this app keeps. Labels are removed 30 days after their last change, so try again later, or delete one of yours from Saved labels.',
      )
      expect(await LabelDocument.countDocuments({})).toBe(200)
    })

    it('takes its own label back out when the count it read had gone stale', async () => {
      // The race, made deterministic: another save landed between this one's
      // count and its insert, so the count says one fewer than is stored.
      await store(200)
      const spy = vi.spyOn(LabelDocument, 'countDocuments').mockResolvedValueOnce(199 as never)
      try {
        const response = await supertest(app()).post('/api/labels').send(A_LABEL)
        expect(response.status).toBe(409)
      } finally {
        spy.mockRestore()
      }
      expect(await LabelDocument.countDocuments({}), 'not one over').toBe(200)
    })

    it('still replaces a label at the cap', async () => {
      // Replacing adds nothing, and refusing it would leave every label at the
      // cap uneditable: the user's way out would be to delete their own work.
      await store(199)
      const { id, token } = await saved()
      const response = await supertest(app())
        .put(`/api/labels/${id}`)
        .set(EDIT_TOKEN_HEADER, token)
        .send({ ...A_LABEL, name: 'Renamed' })
      expect(response.status).toBe(200)
      expect(response.body.name).toBe('Renamed')
    })

    it('reports the cap and the whole collection’s count, naming no label', async () => {
      await store(3)
      const response = await supertest(app()).get('/api/labels')
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ cap: 200, count: 3, labels: [] })
    })

    it('counts honestly above the cap, where a database predates it', async () => {
      await store(205)
      expect((await supertest(app()).get('/api/labels')).body.count).toBe(205)
    })
  })

  describe('the list', () => {
    // `docs/security-review-2026-10-18.md`, finding 4: the list used to be every
    // label there was, so anyone could read off every link and, with it, every
    // label. A browser now lists the ids it saved, and the server answers for
    // those alone.
    it('names no label it was not asked about', async () => {
      await saved({ ...A_LABEL, name: 'Somebody else’s' })
      const response = await supertest(app()).get('/api/labels')
      expect(response.body.labels).toEqual([])
    })

    it('lists the labels it is asked about, newest first, without their data', async () => {
      const older = await saved({ ...A_LABEL, name: 'Older' })
      // Mongo stores milliseconds. Two creates inside one of them tie on
      // `updatedAt` and the sort is then arbitrary.
      await new Promise((resolve) => setTimeout(resolve, 5))
      const newer = await saved({ ...A_LABEL, name: 'Newer' })
      await saved({ ...A_LABEL, name: 'Not asked about' })

      const response = await supertest(app()).get(`/api/labels?ids=${older.id},${newer.id}`)

      expect(response.status).toBe(200)
      expect(response.body.labels.map((entry: { name: string }) => entry.name)).toEqual([
        'Newer',
        'Older',
      ])
      // A list needs names and dates, not the labels themselves.
      expect(response.body.labels[0]).not.toHaveProperty('data')
      expect(response.body.count, 'the collection, not the answer').toBe(3)
    })

    it('leaves out an id that names nothing, so a browser can forget it', async () => {
      const kept = await saved()
      const response = await supertest(app()).get(
        `/api/labels?ids=${kept.id},64b7f0000000000000000000`,
      )
      expect(response.body.labels.map((entry: { id: string }) => entry.id)).toEqual([kept.id])
    })

    it.each([
      ['an id that is not an ObjectId', '?ids=nonsense'],
      ['an empty entry', '?ids=64b7f0000000000000000000,'],
      // Express parses a repeated parameter into an array.
      ['a repeated parameter', '?ids=64b7f0000000000000000000&ids=64b7f0000000000000000001'],
      [
        'more ids than the app keeps labels',
        `?ids=${Array.from({ length: 201 }, (_, index) => index.toString(16).padStart(24, '0')).join(',')}`,
      ],
    ])('refuses %s', async (_case, query) => {
      const response = await supertest(app()).get(`/api/labels${query}`)
      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid label list')
    })
  })

  describe('the edit token', () => {
    // `docs/security-review-2026-10-18.md`, finding 4: any caller could overwrite
    // or delete any label. Creating one now returns a secret, and changing or
    // deleting it needs that secret back. Reading stays open, by link.
    it('is handed back once, on create, and stored only as a hash', async () => {
      const response = await supertest(app()).post('/api/labels').send(A_LABEL)
      expect(typeof response.body.editToken).toBe('string')
      expect(response.body.editToken.length).toBeGreaterThanOrEqual(43)
      expect(response.body).not.toHaveProperty('editTokenHash')

      const stored = await LabelDocument.collection.findOne({
        _id: new mongoose.Types.ObjectId(String(response.body.id)),
      })
      expect(stored?.editTokenHash).toBe(
        createHash('sha256').update(String(response.body.editToken)).digest('hex'),
      )
      expect(JSON.stringify(stored)).not.toContain(String(response.body.editToken))
    })

    it('is never served by a read, a replace or the list', async () => {
      const { id, token } = await saved()
      const read = await supertest(app()).get(`/api/labels/${id}`)
      const replaced = await supertest(app())
        .put(`/api/labels/${id}`)
        .set(EDIT_TOKEN_HEADER, token)
        .send(A_LABEL)
      const listed = await supertest(app()).get(`/api/labels?ids=${id}`)
      for (const body of [read.body, replaced.body, listed.body]) {
        expect(JSON.stringify(body)).not.toMatch(/editToken/)
      }
    })

    it('is different for every label', async () => {
      const first = await saved()
      const second = await saved()
      expect(first.token).not.toBe(second.token)
    })

    const NOT_YOURS = 'This label can be changed only from the browser that saved it.'

    it.each([
      ['no token', undefined],
      ['a wrong token', 'not-the-token'],
      ['an empty token', ''],
    ])('refuses a replace with %s, and leaves the label as it was', async (_case, token) => {
      const { id } = await saved()
      const attempt = supertest(app()).put(`/api/labels/${id}`)
      if (token !== undefined) attempt.set(EDIT_TOKEN_HEADER, token)
      const response = await attempt.send({ ...A_LABEL, name: 'Overwritten' })

      expect(response.status).toBe(403)
      expect(response.body.error).toBe(NOT_YOURS)
      expect((await LabelDocument.findById(id).lean())?.name).toBe('Granola 340g')
    })

    it.each([
      ['no token', undefined],
      ['a wrong token', 'not-the-token'],
      ['an empty token', ''],
    ])('refuses a delete with %s, and keeps the label', async (_case, token) => {
      const { id } = await saved()
      const attempt = supertest(app()).delete(`/api/labels/${id}`)
      if (token !== undefined) attempt.set(EDIT_TOKEN_HEADER, token)
      const response = await attempt

      expect(response.status).toBe(403)
      expect(response.body.error).toBe(NOT_YOURS)
      expect(await LabelDocument.findById(id)).not.toBeNull()
    })

    it('does not let one label’s token change another', async () => {
      const mine = await saved()
      const theirs = await saved()
      const put = await supertest(app())
        .put(`/api/labels/${theirs.id}`)
        .set(EDIT_TOKEN_HEADER, mine.token)
        .send({ ...A_LABEL, name: 'Overwritten' })
      const deleted = await supertest(app())
        .delete(`/api/labels/${theirs.id}`)
        .set(EDIT_TOKEN_HEADER, mine.token)
      expect([put.status, deleted.status]).toEqual([403, 403])
      expect((await LabelDocument.findById(theirs.id).lean())?.name).toBe('Granola 340g')
    })

    it('opens nothing on a label stored before there were tokens', async () => {
      // No hash, so no token can match it: such a label is readable by its link
      // and nothing else, until it expires.
      const old = await LabelDocument.create(A_LABEL)
      for (const token of ['', 'anything']) {
        const put = await supertest(app())
          .put(`/api/labels/${old._id}`)
          .set(EDIT_TOKEN_HEADER, token)
          .send(A_LABEL)
        const deleted = await supertest(app())
          .delete(`/api/labels/${old._id}`)
          .set(EDIT_TOKEN_HEADER, token)
        expect([put.status, deleted.status]).toEqual([403, 403])
      }
      expect((await supertest(app()).get(`/api/labels/${old._id}`)).status).toBe(200)
    })

    it('still opens the label after a replace', async () => {
      // A replace writes exactly the fields it names, so a replacement that left
      // the hash out would make every label uneditable after its first edit.
      const { id, token } = await saved()
      const put = (name: string) =>
        supertest(app())
          .put(`/api/labels/${id}`)
          .set(EDIT_TOKEN_HEADER, token)
          .send({ ...A_LABEL, name })
      expect((await put('First edit')).status).toBe(200)
      expect((await put('Second edit')).status).toBe(200)
      expect(
        (await supertest(app()).delete(`/api/labels/${id}`).set(EDIT_TOKEN_HEADER, token)).status,
      ).toBe(204)
    })

    it('answers 404 rather than 403 for a label that does not exist', async () => {
      const { token } = await saved()
      const response = await supertest(app())
        .delete('/api/labels/64b7f0000000000000000000')
        .set(EDIT_TOKEN_HEADER, token)
      expect(response.status).toBe(404)
    })
  })

  describe('the write limits', () => {
    // `docs/security-review-2026-10-18.md`, finding 4: nothing limited writes, so
    // one caller could fill the cap in a few seconds.
    const limited = (limits: Partial<LabelWriteLimits> = {}) =>
      createApp({
        enableLogging: false,
        trustProxyHops: 1,
        labelWriteLimits: { ...DEFAULT_LABEL_WRITE_LIMITS, ...limits },
      })
    const from = (test: supertest.Test, address: string) => test.set('X-Forwarded-For', address)

    it('are ten creates, three hundred replaces and two hundred deletes an hour', () => {
      expect(DEFAULT_LABEL_WRITE_LIMITS).toEqual({
        createsPerHour: 10,
        replacesPerHour: 300,
        deletesPerHour: 200,
      })
    })

    it('refuse an eleventh create from one address, and not from the next', async () => {
      const server = limited()
      const statuses: number[] = []
      for (let index = 0; index < 11; index++) {
        statuses.push(
          (await from(supertest(server).post('/api/labels'), '203.0.113.1').send(A_LABEL)).status,
        )
      }
      expect(statuses).toEqual([...Array<number>(10).fill(201), 429])
      expect(await LabelDocument.countDocuments({}), 'the eleventh was not stored').toBe(10)

      const elsewhere = await from(supertest(server).post('/api/labels'), '198.51.100.7').send(
        A_LABEL,
      )
      expect(elsewhere.status).toBe(201)
    })

    it('refuse a replace past the hourly figure', async () => {
      const server = limited({ replacesPerHour: 2 })
      const { id, token } = await saved()
      const statuses: number[] = []
      for (let index = 0; index < 3; index++) {
        statuses.push(
          (
            await from(supertest(server).put(`/api/labels/${id}`), '203.0.113.1')
              .set(EDIT_TOKEN_HEADER, token)
              .send({ ...A_LABEL, name: `Edit ${index}` })
          ).status,
        )
      }
      expect(statuses).toEqual([200, 200, 429])
      expect((await LabelDocument.findById(id).lean())?.name).toBe('Edit 1')
    })

    it('refuse a delete past the hourly figure', async () => {
      const server = limited({ deletesPerHour: 1 })
      const first = await saved()
      const second = await saved()
      const remove = ({ id, token }: { id: string; token: string }) =>
        from(supertest(server).delete(`/api/labels/${id}`), '203.0.113.1').set(
          EDIT_TOKEN_HEADER,
          token,
        )
      expect([(await remove(first)).status, (await remove(second)).status]).toEqual([204, 429])
      expect(await LabelDocument.findById(second.id)).not.toBeNull()
    })

    it('count each kind of write separately, and leave reads alone', async () => {
      const server = limited({ createsPerHour: 1 })
      const created = await from(supertest(server).post('/api/labels'), '203.0.113.1').send(A_LABEL)
      expect(created.status).toBe(201)
      const id = String(created.body.id)
      const put = await from(supertest(server).put(`/api/labels/${id}`), '203.0.113.1')
        .set(EDIT_TOKEN_HEADER, String(created.body.editToken))
        .send(A_LABEL)
      expect(put.status, 'a replace is not a create').toBe(200)
      for (let index = 0; index < 3; index++) {
        expect((await from(supertest(server).get(`/api/labels/${id}`), '203.0.113.1')).status).toBe(
          200,
        )
      }
    })
  })

  it('expires a label thirty days after its last change', async () => {
    // A TTL index on `updatedAt`, which every replace moves. Asserted on the
    // index rather than by waiting: Mongo's TTL monitor runs once a minute, and
    // `withDatabase` drops the database, indexes and all, between tests, so the
    // index is built here first.
    await LabelDocument.createIndexes()
    const indexes = await LabelDocument.collection.indexes()
    const ttl = indexes.filter((index) => index.expireAfterSeconds !== undefined)
    expect(ttl).toHaveLength(1)
    expect(ttl[0]?.key).toEqual({ updatedAt: 1 })
    expect(ttl[0]?.expireAfterSeconds).toBe(30 * 24 * 60 * 60)
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
    const { id, token } = await saved()
    const response = await supertest(app())
      .put(`/api/labels/${id}`)
      .set(EDIT_TOKEN_HEADER, token)
      .send({ ...A_LABEL, name: 'Renamed' })
    expect(response.status).toBe(200)
    expect(response.body.name).toBe('Renamed')
  })

  it('keeps the date a label was created, and moves the date it changed', async () => {
    // `findOneAndReplace` re-dated the label on every edit, because a
    // replacement body carries no `createdAt` and mongoose fills it with the
    // current time. Nothing noticed: the test above asserts only the name.
    const { id, token } = await saved()
    const before = (await LabelDocument.findById(id).lean())!.createdAt.toISOString()
    // Mongo stores milliseconds, so an edit in the same millisecond is
    // indistinguishable from no edit at all.
    await new Promise((resolve) => setTimeout(resolve, 5))

    const response = await supertest(app())
      .put(`/api/labels/${id}`)
      .set(EDIT_TOKEN_HEADER, token)
      .send({ ...A_LABEL, name: 'Renamed' })

    expect(response.body.createdAt, 'the label was not created again').toBe(before)
    expect(new Date(response.body.updatedAt).getTime()).toBeGreaterThan(new Date(before).getTime())
  })

  it('clears a field an older shape left behind', async () => {
    // A replace and not a `$set`: updating the fields the schema knows about
    // leaves anything it does not, and a stale value becomes live again the day
    // a field name is reused. Nothing becomes label data silently.
    const { id, token } = await saved()
    const _id = new mongoose.Types.ObjectId(id)
    await LabelDocument.collection.updateOne({ _id }, { $set: { legacyField: 'stale' } })

    await supertest(app())
      .put(`/api/labels/${id}`)
      .set(EDIT_TOKEN_HEADER, token)
      .send({ ...A_LABEL, name: 'Renamed' })

    expect(await LabelDocument.collection.findOne({ _id })).not.toHaveProperty('legacyField')
  })

  it('deletes a label', async () => {
    const { id, token } = await saved()
    expect(
      (await supertest(app()).delete(`/api/labels/${id}`).set(EDIT_TOKEN_HEADER, token)).status,
    ).toBe(204)
    expect(await LabelDocument.findById(id)).toBeNull()
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
