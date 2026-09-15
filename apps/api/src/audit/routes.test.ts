import Anthropic from '@anthropic-ai/sdk'
import supertest from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import {
  ExtractionDeclined,
  ExtractionTruncated,
  ExtractionUnreadable,
  type ExtractLabel,
} from './extract'
import { MAX_PHOTO_BASE64 } from './routes'

const A_PHOTO = { mediaType: 'image/png', data: 'AAAA' }
const A_REQUEST = { regime: 'eu-clp', image: A_PHOTO }

const READING = {
  fields: { productIdentifier: { value: 'Acetone', confidence: 0.99 } },
  warnings: [],
}

const post = (body: unknown, extract?: ExtractLabel) =>
  supertest(createApp({ enableLogging: false, extract }))
    .post('/api/audit/ghs')
    .send(body as object)

const reading = (): ExtractLabel => vi.fn().mockResolvedValue(READING)
const failing = (error: unknown): ExtractLabel => vi.fn().mockRejectedValue(error)

describe('POST /api/audit/ghs', () => {
  it('reports an unconfigured server rather than pretending the route is missing', async () => {
    const response = await post(A_REQUEST)
    expect(response.status).toBe(503)
    expect(response.body.error).toBe('Vision extraction is not configured')
  })

  it('says so before it looks at the body', async () => {
    // The endpoint is not unavailable for this request; it is unavailable. A
    // 400 here would send someone to fix a body that was never the problem.
    const response = await post({ nonsense: true })
    expect(response.status).toBe(503)
  })

  it('returns the reading and the model that produced it', async () => {
    const response = await post(A_REQUEST, reading())
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ extraction: READING, model: 'claude-opus-5' })
  })

  it('hands the extractor the regime it was asked for', async () => {
    const extract = reading()
    await post({ ...A_REQUEST, regime: 'us-osha' }, extract)
    expect(extract).toHaveBeenCalledWith(A_PHOTO, 'us-osha')
  })

  it('refuses a regime that is not one of the two', async () => {
    const response = await post({ ...A_REQUEST, regime: 'uk-chip' }, reading())
    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Invalid audit request')
    expect(response.body.detail.map((issue: { path: string }) => issue.path)).toContain('regime')
  })

  it('refuses a format the vision API does not accept', async () => {
    // HEIC is what an iPhone produces by default, so this is the likely case
    // rather than a hypothetical one. Refused here with the field named,
    // instead of upstream as a 502 blaming the service.
    const response = await post(
      { ...A_REQUEST, image: { ...A_PHOTO, mediaType: 'image/heic' } },
      reading(),
    )
    expect(response.status).toBe(400)
    expect(response.body.detail.map((issue: { path: string }) => issue.path)).toContain(
      'image.mediaType',
    )
  })

  it('refuses an image larger than it will forward', async () => {
    // Written first against the upstream API's own 10 MB figure, which never
    // ran: a 10 MB base64 string in a JSON envelope trips the body limit before
    // the handler is reached, and the test failed asserting the route's message
    // against body-parser's. The limit sits below the body limit now so that it
    // is reachable, and this test is what proves it still is.
    const response = await post(
      { ...A_REQUEST, image: { ...A_PHOTO, data: 'A'.repeat(MAX_PHOTO_BASE64 + 1) } },
      reading(),
    )
    expect(response.status).toBe(413)
    expect(response.body.error).toBe('The image is too large')
    expect(response.body.detail[0]).toContain(String(MAX_PHOTO_BASE64))
  })

  it('reports a declined request as a decision, with the category it was given', async () => {
    const response = await post(A_REQUEST, failing(new ExtractionDeclined('cyber')))
    expect(response.status).toBe(422)
    expect(response.body.error).toBe('Reading this image was declined')
    expect(response.body.detail[0]).toContain('cyber')
  })

  it('reports a declined request that gave no reason', async () => {
    const response = await post(A_REQUEST, failing(new ExtractionDeclined(null)))
    expect(response.status).toBe(422)
    expect(response.body.detail[0]).toBe('No reason was given.')
  })

  it('reports a reply it could not read, naming what was wrong with it', async () => {
    const response = await post(
      A_REQUEST,
      failing(
        new ExtractionUnreadable('The reply did not match the shape it was asked for.', [
          { path: 'productIdentifier.confidence', message: 'Too big' },
        ]),
      ),
    )
    expect(response.status).toBe(422)
    expect(response.body.error).toBe('The image could not be read as a label')
    expect(response.body.detail[0]).toContain('productIdentifier.confidence')
  })

  it('reports a reading cut short as cut short, not as an unreadable image', async () => {
    const response = await post(A_REQUEST, failing(new ExtractionTruncated()))
    expect(response.status).toBe(422)
    expect(response.body.error).toBe('The reading was cut short')
  })

  it('reports an image the vision service rejected as being about the image', async () => {
    // One message for every upstream failure was wrong in both directions: a
    // rejected image and an unreachable service are different facts, and only
    // one of them is something the person holding the camera can act on.
    const rejected = new Anthropic.BadRequestError(
      400,
      {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'could not decode image' },
      },
      'bad request',
      new Headers(),
    )
    const response = await post(A_REQUEST, failing(rejected))
    expect(response.status).toBe(422)
    expect(response.body.error).toBe('The image was rejected by the vision service')
  })

  it('reports being rate limited as busy rather than as unreachable', async () => {
    const limited = new Anthropic.RateLimitError(
      429,
      { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } },
      'rate limited',
      new Headers(),
    )
    const response = await post(A_REQUEST, failing(limited))
    expect(response.status).toBe(503)
    expect(response.body.error).toContain('busy')
  })

  it('reports an upstream failure as an upstream failure, and leaks nothing', async () => {
    const upstream = new Anthropic.InternalServerError(
      503,
      { type: 'error', error: { type: 'overloaded_error', message: 'sk-ant-leaky' } },
      'overloaded',
      new Headers(),
    )
    const response = await post(A_REQUEST, failing(upstream))
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'The extraction service could not be reached' })
    expect(JSON.stringify(response.body)).not.toContain('sk-ant')
  })

  it('does not let a library dictate a 5xx, or describe one in the wrong words', async () => {
    // The handler honours a carried status only in the 4xx range. Without that
    // restriction this answers 503 with the words "Bad request", which is a
    // sentence about the caller attached to a status about the server. Added
    // because the restriction survived being mutated away with every test still
    // green — a guard with no test is a claim.
    const response = await post(
      A_REQUEST,
      failing(Object.assign(new Error('upstream is down'), { status: 503 })),
    )
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Internal server error' })
  })

  it('lets an error it does not recognise reach the application handler', async () => {
    // Rethrown rather than mapped, so an unforeseen failure is a 500 with the
    // detail in the log — not a 502 implying the upstream service was at fault.
    const response = await post(A_REQUEST, failing(new Error('something else entirely')))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Internal server error' })
  })
})
