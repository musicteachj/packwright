import supertest from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'

const app = () => createApp({ enableLogging: false })
const post = (body: object) => supertest(app()).post('/api/labels/upc-a/export').send(body)

describe('POST /api/labels/upc-a/export', () => {
  it('returns a PDF for a valid payload', async () => {
    const response = await post({ gtinPayload: '03600029145' })
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('application/pdf')
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('names the download after the full GTIN, check digit included', async () => {
    const response = await post({ gtinPayload: '03600029145' })
    expect(response.headers['content-disposition']).toContain('036000291452.pdf')
  })

  it('rejects a payload that is not eleven digits', async () => {
    // Eleven is what a user types; the twelfth is computed. Twelve digits is a
    // common and confusing mistake, so it gets a message rather than a 500.
    const response = await post({ gtinPayload: '036000291452' })
    expect(response.status).toBe(400)
    expect(JSON.stringify(response.body)).toContain('exactly 11 digits')
  })

  it('rejects a non-numeric payload', async () => {
    expect((await post({ gtinPayload: 'ABCDEFGHIJK' })).status).toBe(400)
  })

  it('rejects a magnification outside the permitted range', async () => {
    // 0.8x to 2.0x is what GenSpec figure 5.12.3.1-1 allows for EAN/UPC.
    expect((await post({ gtinPayload: '03600029145', magnification: 2.5 })).status).toBe(400)
    expect((await post({ gtinPayload: '03600029145', magnification: 0.5 })).status).toBe(400)
  })

  it('returns 422, not 500, when the symbol will not fit the stock', async () => {
    // The request is well formed; it simply cannot be satisfied. The distinction
    // matters because the caller can act on it — use bigger stock, or a smaller
    // magnification.
    const response = await post({
      gtinPayload: '03600029145',
      magnification: 2,
      stock: { widthMm: 40, heightMm: 30, marginMm: 3 },
    })
    expect(response.status).toBe(422)
    expect(response.body.detail).toMatch(/quiet zone/i)
  })

  it('honours a custom stock', async () => {
    const response = await post({
      gtinPayload: '03600029145',
      stock: { widthMm: 90, heightMm: 70, marginMm: 5 },
    })
    expect(response.status).toBe(200)
    // 90 mm is 255.118 pt; asserting on the file rules out the stock being
    // accepted and then ignored.
    expect(response.body.toString('latin1')).toMatch(/\/MediaBox\s*\[0 0 255\.11/)
  })

  it('rejects an empty request body', async () => {
    expect((await post({})).status).toBe(400)
  })
})
