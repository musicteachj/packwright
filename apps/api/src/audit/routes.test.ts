import Anthropic from '@anthropic-ai/sdk'
import supertest from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import {
  ExtractionDeclined,
  ExtractionTruncated,
  ExtractionUnreadable,
  EXTRACTION_MODEL,
  type ExtractLabel,
} from './extract'
import { AUDIT_KEY_HEADER, MAX_PHOTO_BASE64 } from './routes'

const A_PHOTO = { mediaType: 'image/png', data: 'AAAA' }
const A_REQUEST = { regime: 'eu-clp', image: A_PHOTO }

const EXTRACTION = {
  fields: { productIdentifier: { value: 'Acetone', confidence: 0.99 } },
  warnings: [],
}

/** A model name that is not the one this server asks for, so the two cannot be confused. */
const ANSWERED_BY = 'claude-opus-5-some-other-snapshot'
const READING = { extraction: EXTRACTION, model: ANSWERED_BY }

// `auditLimits: false` everywhere below, stated rather than inherited: these
// cases are about what the route does with a body, and a quota counting down
// across them would make the last one fail for a reason none of them is about.
// The quotas have their own describe at the end of this file.
const post = (body: unknown, extract?: ExtractLabel) =>
  supertest(createApp({ enableLogging: false, extract, auditLimits: false }))
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

  it('returns the reading and the model that actually produced it', async () => {
    // The fake answers on a model this server would never ask for, which is the
    // only way to tell a reported `response.model` from a reported constant.
    const response = await post(A_REQUEST, reading())
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ extraction: EXTRACTION, model: ANSWERED_BY })
    expect(response.body.model).not.toBe(EXTRACTION_MODEL)
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

  it('does not blame the photograph for a fault it cannot attribute', async () => {
    // A 400 from upstream is `invalid_request_error` whether the image was
    // undecodable or this server sent a parameter the API has stopped
    // accepting. The first wording said the image "may be corrupt", which tells
    // every user their photograph is bad on the strength of a fault that may be
    // entirely ours.
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
    expect(response.body.error).toBe('The vision service could not process this request')
    expect(JSON.stringify(response.body)).not.toContain('corrupt')
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

describe('what the audit route costs to call', () => {
  // Every call here reaches a paid vision API on a key the server holds, and
  // nothing in the request path asked anything of the caller before this.
  const app = (options: Parameters<typeof createApp>[0] = {}) =>
    createApp({ enableLogging: false, extract: reading(), ...options })

  const send = (built: ReturnType<typeof createApp>, key?: string) => {
    const request = supertest(built).post('/api/audit/ghs')
    return key === undefined
      ? request.send(A_REQUEST)
      : request.set(AUDIT_KEY_HEADER, key).send(A_REQUEST)
  }

  describe('the shared secret', () => {
    it('lets every caller through when none is configured', async () => {
      const response = await send(app({ auditLimits: false }))
      expect(response.status).toBe(200)
    })

    it('refuses a caller that presents none when one is configured', async () => {
      const response = await send(app({ auditLimits: false, auditApiKey: 'the-secret' }))
      expect(response.status).toBe(401)
      expect(response.body.error).toBe('A valid audit key is required')
    })

    it('refuses a caller that presents the wrong one', async () => {
      const response = await send(app({ auditLimits: false, auditApiKey: 'the-secret' }), 'not-it')
      expect(response.status).toBe(401)
    })

    it('admits a caller that presents the right one', async () => {
      const response = await send(
        app({ auditLimits: false, auditApiKey: 'the-secret' }),
        'the-secret',
      )
      expect(response.status).toBe(200)
    })

    it('spends nothing on a refused request', async () => {
      // The 401 has to come before the extractor, or the key would protect the
      // bill from nobody: a wrong key would still have paid for the reading.
      const extract = reading()
      const built = createApp({
        enableLogging: false,
        extract,
        auditLimits: false,
        auditApiKey: 'the-secret',
      })
      await send(built, 'not-it')
      expect(extract).not.toHaveBeenCalled()
    })
  })

  describe('the quotas', () => {
    it('refuses a client that exceeds the hourly allowance', async () => {
      const built = app({ auditLimits: { perHour: 2, perDay: 100 } })
      expect((await send(built)).status).toBe(200)
      expect((await send(built)).status).toBe(200)

      const refused = await send(built)
      expect(refused.status).toBe(429)
      expect(refused.body.error).toBe('Too many audit requests — try again later')
    })

    it('refuses once the process has spent its day, whatever the client', async () => {
      // `trustProxyHops` so that the forwarded addresses are actually believed —
      // without it Express reads the socket and all three requests are one
      // caller, which the hourly limiter would refuse for its own reason and
      // this case would pass without proving anything.
      const built = app({ auditLimits: { perHour: 100, perDay: 2 }, trustProxyHops: 1 })
      const from = (address: string) =>
        supertest(built).post('/api/audit/ghs').set('X-Forwarded-For', address).send(A_REQUEST)

      // The daily figure is about what this deployment can lose, which is not a
      // question about any one caller, so arriving from somewhere new must not
      // buy a fresh allowance.
      expect((await from('203.0.113.1')).status).toBe(200)
      expect((await from('203.0.113.2')).status).toBe(200)

      const refused = await from('203.0.113.3')
      expect(refused.status).toBe(429)
      expect(refused.body.error).toBe('This server has reached its daily audit limit')
    })

    it('gives a different client its own hourly allowance', async () => {
      // The other side of the same setting: with the hops stated, two callers
      // are two callers. Paired with the case above so that neither limiter can
      // quietly take on the other's behaviour.
      const built = app({ auditLimits: { perHour: 1, perDay: 100 }, trustProxyHops: 1 })
      const from = (address: string) =>
        supertest(built).post('/api/audit/ghs').set('X-Forwarded-For', address).send(A_REQUEST)

      expect((await from('203.0.113.1')).status).toBe(200)
      expect((await from('203.0.113.1')).status).toBe(429)
      expect((await from('203.0.113.2')).status).toBe(200)
    })

    it('spends nothing on a request the quota refused', async () => {
      const extract = reading()
      const built = createApp({
        enableLogging: false,
        extract,
        auditLimits: { perHour: 1, perDay: 100 },
      })
      await send(built)
      await send(built)
      expect(extract).toHaveBeenCalledTimes(1)
    })

    it('charges a refused key to the guesser, so the key cannot be guessed for free', async () => {
      const built = app({ auditLimits: { perHour: 2, perDay: 100 }, auditApiKey: 'the-secret' })
      expect((await send(built, 'guess-one')).status).toBe(401)
      expect((await send(built, 'guess-two')).status).toBe(401)
      expect((await send(built, 'guess-three')).status).toBe(429)
    })

    it('does not charge a refused key to the day, which everyone shares', async () => {
      // The ordering the first review of this change found back to front. With
      // the daily bucket ahead of the key, a caller with no key could spend the
      // whole deployment's day in a few minutes and lock out every holder of the
      // key until the window turned — which makes the key worse than no key.
      const built = app({
        auditLimits: { perHour: 100, perDay: 2 },
        auditApiKey: 'the-secret',
        trustProxyHops: 1,
      })
      const guessFrom = (address: string) =>
        supertest(built)
          .post('/api/audit/ghs')
          .set('X-Forwarded-For', address)
          .set(AUDIT_KEY_HEADER, 'wrong')
          .send(A_REQUEST)

      for (const address of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
        expect((await guessFrom(address)).status).toBe(401)
      }

      // The day is untouched, so the key still works.
      expect((await send(built, 'the-secret')).status).toBe(200)
    })

    it('spends no day on requests that never reach the paid call', async () => {
      // The quotas sit on `POST /ghs` rather than on the router. Mounted on the
      // router they counted a 404, a malformed body and a 503 alike, so a budget
      // denominated in paid vision calls was exhaustible with free requests.
      const built = app({ auditLimits: { perHour: 100, perDay: 2 } })
      const server = supertest(built)
      expect((await server.get('/api/audit/ghs')).status).toBe(404)
      expect((await server.post('/api/audit/nowhere').send(A_REQUEST)).status).toBe(404)
      expect((await server.post('/api/audit/ghs').send({ regime: 'nonsense' })).status).toBe(400)

      // Two paid calls were the whole allowance and none of the above was one.
      expect((await send(built)).status).toBe(200)
      expect((await send(built)).status).toBe(200)
      expect((await send(built)).status).toBe(429)
    })

    it('counts a reading the model declined, because that reading was paid for', async () => {
      // The other half of counting calls rather than requests. A 422 is a
      // failed request and a spent one: the model ran and answered. A budget
      // that skipped it would under-report the bill it exists to cap.
      const built = createApp({
        enableLogging: false,
        extract: failing(new ExtractionDeclined('no')),
        auditLimits: { perHour: 100, perDay: 1 },
      })
      expect((await send(built)).status).toBe(422)

      const refused = await send(built)
      expect(refused.status).toBe(429)
      expect(refused.body.error).toBe('This server has reached its daily audit limit')
    })

    it('enforces none when told to enforce none', async () => {
      const built = app({ auditLimits: false })
      for (let i = 0; i < 25; i++) expect((await send(built)).status).toBe(200)
    })
  })
})
