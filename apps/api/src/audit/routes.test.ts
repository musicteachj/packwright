import { createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'

import Anthropic from '@anthropic-ai/sdk'
import express from 'express'
import supertest from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, type AppOptions } from '../app'
import {
  ExtractionDeclined,
  ExtractionTruncated,
  ExtractionUnreadable,
  EXTRACTION_MODEL,
  type ExtractLabel,
} from './extract'
import { createLedger, memoryLedgerStore, type BudgetConfig } from './ledger'
import { REFUSALS } from './refusals'
import {
  AUDIT_BODY_LIMIT,
  AUDIT_KEY_HEADER,
  createAuditRouter,
  DEFAULT_AUDIT_LIMITS,
  MAX_PHOTO_BASE64,
  type AuditLimits,
  type AuditSpend,
  type AuditVisitors,
} from './routes'
import { TURNSTILE_HEADER, type TurnstileOutcome, type VerifyTurnstile } from './turnstile'
import { memoryVisitorAllowance, visitorKey, type VisitorAllowance } from './visitorAllowance'
import { recorded } from './fixtures/responses'

// The opening of a real PNG, its signature and the start of its IHDR chunk: the
// route refuses data that does not begin as its media type does (`photoSignature.ts`).
const A_PHOTO = { mediaType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUg==' }
const A_REQUEST = { regime: 'eu-clp', image: A_PHOTO }

const EXTRACTION = {
  fields: { productIdentifier: { value: 'Acetone', confidence: 0.99 } },
  warnings: [],
}

/** A model name that is not the one this server asks for, so the two cannot be confused. */
const ANSWERED_BY = 'claude-opus-5-some-other-snapshot'
const READING = {
  extraction: EXTRACTION,
  model: ANSWERED_BY,
  billed: { model: ANSWERED_BY, usage: recorded.usage },
}

/**
 * A ledger that never refuses: $1,000 a month and a floor of the same, about 8,900 reads a day.
 * The router refuses an extractor without a ledger, so a test that is not about money passes
 * this one rather than none.
 */
const roomy = (): AuditSpend => ({
  ledger: createLedger(memoryLedgerStore(), {
    monthlyBudgetMicros: 1_000_000_000,
    pacingMultiplier: 31,
    dailyFloorMicros: 1_000_000_000,
  }),
  reservationMicros: 112_000,
})

// `auditLimits: false` everywhere below, stated rather than inherited: these
// cases are about what the route does with a body, and a quota counting down
// across them would make the last one fail for a reason none of them is about.
// The quotas have their own describe at the end of this file.
const post = (body: unknown, extract?: ExtractLabel) =>
  supertest(createApp({ enableLogging: false, extract, auditLimits: false, auditSpend: roomy() }))
    .post('/api/audit/ghs')
    .send(body as object)

const reading = (): ExtractLabel => vi.fn().mockResolvedValue(READING)
const failing = (error: unknown): ExtractLabel => vi.fn().mockRejectedValue(error)

/** Limits generous enough that only the one a test is about can refuse. */
const GENEROUS: AuditLimits = { perHour: 100, perVisitorPerDay: 100, statusPerMinute: 1000 }

/** Cloudflare's always-passing test site key, which the status hands the browser. */
const SITE_KEY = '1x00000000000000000000AA'

/** $10 a month on 2026-11-19, as in `spend.test.ts`: $2.50 of room today, 22 reads. */
const CONFIG: BudgetConfig = {
  monthlyBudgetMicros: 10_000_000,
  pacingMultiplier: 3,
  dailyFloorMicros: 500_000,
}
const clock = () => new Date('2026-11-19T12:00:00Z')

/**
 * The public audit, as `server.ts` builds it when `AUDIT_PUBLIC` is true: a Turnstile check,
 * a per-visitor count in memory and a $10 ledger. `outcome` is what the bot check answers.
 */
function publicAudit(
  overrides: Partial<AppOptions> & { outcome?: TurnstileOutcome; config?: BudgetConfig } = {},
) {
  const { outcome = 'passed', config = CONFIG, ...options } = overrides
  const verify = vi.fn<VerifyTurnstile>().mockResolvedValue(outcome)
  const visitors: AuditVisitors = {
    allowance: memoryVisitorAllowance(),
    ipHashKey: 'k'.repeat(32),
  }
  const ledger = createLedger(memoryLedgerStore(), config, clock)
  const app = createApp({
    enableLogging: false,
    extract: reading(),
    auditLimits: GENEROUS,
    auditTurnstile: { siteKey: SITE_KEY, verify },
    auditVisitors: visitors,
    auditSpend: { ledger, reservationMicros: 112_000 },
    ...options,
  })
  return { app, verify, visitors, roomTodayMicros: () => ledger.roomTodayMicros() }
}

/** A read with a token, as the audit page sends one. */
const readWithToken = (app: ReturnType<typeof createApp>, body: unknown = A_REQUEST) =>
  supertest(app)
    .post('/api/audit/ghs')
    .set(TURNSTILE_HEADER, 'tok')
    .send(body as object)

describe('POST /api/audit/ghs', () => {
  it('reports an unconfigured server rather than pretending the route is missing', async () => {
    const response = await post(A_REQUEST)
    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      error: 'This server does not read photographs live. Try the sample label.',
      reason: 'unconfigured',
    })
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
    expect(response.body).not.toHaveProperty('billed')
    expect(response.body.model).not.toBe(EXTRACTION_MODEL)
  })

  it('hands the extractor the regime it was asked for', async () => {
    const extract = reading()
    await post({ ...A_REQUEST, regime: 'us-osha' }, extract)
    expect(extract).toHaveBeenCalledWith(A_PHOTO, 'us-osha', {
      signal: expect.any(AbortSignal),
    })
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
    expect(AUDIT_BODY_LIMIT).toBe('6mb')
    expect(MAX_PHOTO_BASE64).toBe(5 * 1024 * 1024)
    expect(MAX_PHOTO_BASE64).toBeLessThan(6 * 1024 * 1024)
    const response = await post(
      { ...A_REQUEST, image: { ...A_PHOTO, data: 'A'.repeat(MAX_PHOTO_BASE64 + 1) } },
      reading(),
    )
    expect(response.status).toBe(413)
    expect(response.body.error).toBe('The image is too large')
    expect(response.body.detail[0]).toContain(String(MAX_PHOTO_BASE64))
  })

  it('refuses a body past six megabytes before it reads it as an image', async () => {
    const response = await post(
      { ...A_REQUEST, image: { ...A_PHOTO, data: 'A'.repeat(6 * 1024 * 1024) } },
      reading(),
    )
    expect(response.status).toBe(413)
    expect(response.body).toEqual({ error: 'The request body is too large' })
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
    expect(response.body.error).toBe(
      'The reading came back in a form Packwright could not use. Try again, or try the sample label.',
    )
    expect(response.body.detail[0]).toContain('productIdentifier.confidence')
  })

  it('reports a reading cut short as cut short, not as an unreadable image', async () => {
    const response = await post(A_REQUEST, failing(new ExtractionTruncated()))
    expect(response.status).toBe(422)
    expect(response.body.error).toBe('The reading was cut short')
  })

  it('reports an upstream failure as unavailable, points at the sample, and leaks nothing', async () => {
    // Every provider error is one refusal: nothing about it is the visitor's to fix, and the
    // detail, which can carry request identifiers and a hint about the key, goes to the log.
    const upstream = new Anthropic.InternalServerError(
      503,
      { type: 'error', error: { type: 'overloaded_error', message: 'sk-ant-leaky' } },
      'overloaded',
      new Headers(),
    )
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await post(A_REQUEST, failing(upstream))
    logged.mockRestore()
    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      error: 'Live photo reading is not available right now. Try the sample label.',
      reason: 'unavailable',
    })
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

describe('how the audit router is built', () => {
  it('an extractor without a spend ledger is refused when the router is built', () => {
    // No path may call a live extractor unmetered, so a router that would is never built.
    expect(() => createAuditRouter({ extract: reading() })).toThrow(
      'An extractor needs a spend ledger.',
    )
    expect(() => createApp({ enableLogging: false, extract: reading() })).toThrow(
      'An extractor needs a spend ledger.',
    )
    expect(() => createAuditRouter({ extract: reading(), spend: roomy() })).not.toThrow()
  })

  it('refuses the key and the bot check together, which are two modes', () => {
    expect(() =>
      createAuditRouter({
        apiKey: 'the-secret',
        turnstile: { siteKey: SITE_KEY, verify: vi.fn<VerifyTurnstile>() },
        visitors: { allowance: memoryVisitorAllowance(), ipHashKey: 'k'.repeat(32) },
      }),
    ).toThrow('An audit router takes an API key or a Turnstile check, not both.')
  })

  it('refuses a bot check with nowhere to count visitors', () => {
    expect(() =>
      createAuditRouter({ turnstile: { siteKey: SITE_KEY, verify: vi.fn<VerifyTurnstile>() } }),
    ).toThrow('A Turnstile check needs a visitor allowance.')
  })
})

describe('what the audit route costs to call', () => {
  // Every call here reaches a paid vision API on a key the server holds, and
  // nothing in the request path asked anything of the caller before this.
  const app = (options: Parameters<typeof createApp>[0] = {}) =>
    createApp({ enableLogging: false, extract: reading(), auditSpend: roomy(), ...options })

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
        auditSpend: roomy(),
      })
      await send(built, 'not-it')
      expect(extract).not.toHaveBeenCalled()
    })

    it('key mode is not counted per visitor', async () => {
      // Decision 1: the per-visitor count belongs to the public path. The owner's key is bounded
      // by the hourly limiter and the ledger, so visitors handed to a key-mode app go unused.
      const visitors: AuditVisitors = {
        allowance: memoryVisitorAllowance(),
        ipHashKey: 'k'.repeat(32),
      }
      const built = app({
        auditLimits: { ...GENEROUS, perVisitorPerDay: 1 },
        auditApiKey: 'the-secret',
        auditVisitors: visitors,
        trustProxyHops: 1,
      })
      const withKey = () =>
        supertest(built)
          .post('/api/audit/ghs')
          .set('X-Forwarded-For', '203.0.113.7')
          .set(AUDIT_KEY_HEADER, 'the-secret')
          .send(A_REQUEST)

      const first = await withKey()
      const second = await withKey()
      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(second.body.reason).not.toBe('ip')
      expect(await visitors.allowance.left(visitorKey(visitors.ipHashKey, '203.0.113.7'), 1)).toBe(
        1,
      )
    })
  })

  describe('the quotas', () => {
    it('refuses a client that exceeds the hourly allowance', async () => {
      const built = app({ auditLimits: { ...GENEROUS, perHour: 2 } })
      expect((await send(built)).status).toBe(200)
      expect((await send(built)).status).toBe(200)

      // Not `ip`: the status reads only the daily count, so an `ip` here would be followed
      // by a status saying a read is possible.
      const refused = await send(built)
      expect(refused.status).toBe(429)
      expect(refused.body).toEqual({
        error: 'Live photo reading is not available right now. Try the sample label.',
        reason: 'unavailable',
      })
    })

    it('gives a different client its own hourly allowance', async () => {
      // With the hops stated, two callers are two callers.
      const built = app({ auditLimits: { ...GENEROUS, perHour: 1 }, trustProxyHops: 1 })
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
        auditLimits: { ...GENEROUS, perHour: 1 },
        auditSpend: roomy(),
      })
      await send(built)
      await send(built)
      expect(extract).toHaveBeenCalledTimes(1)
    })

    it('charges a refused key to the guesser, so the key cannot be guessed for free', async () => {
      const built = app({ auditLimits: { ...GENEROUS, perHour: 2 }, auditApiKey: 'the-secret' })
      expect((await send(built, 'guess-one')).status).toBe(401)
      expect((await send(built, 'guess-two')).status).toBe(401)
      expect((await send(built, 'guess-three')).status).toBe(429)
    })

    it('enforces none when told to enforce none', async () => {
      const built = app({ auditLimits: false })
      for (let i = 0; i < 25; i++) expect((await send(built)).status).toBe(200)
    })
  })
})

describe('the bot check', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the token and the visitor address to siteverify', async () => {
    const { app, verify } = publicAudit({ trustProxyHops: 1 })
    const response = await supertest(app)
      .post('/api/audit/ghs')
      .set('X-Forwarded-For', '203.0.113.7')
      .set('X-Turnstile-Token', 'tok')
      .send(A_REQUEST)
    expect(response.status).toBe(200)
    expect(verify).toHaveBeenCalledWith({ token: 'tok', remoteIp: '203.0.113.7' })
  })

  it('a missing token is a failed check', async () => {
    const extract = reading()
    const { app, verify } = publicAudit({ extract })
    const response = await supertest(app).post('/api/audit/ghs').send(A_REQUEST)
    expect(response.status).toBe(403)
    expect(response.body).toEqual({
      error: 'The bot check did not pass. Complete it again, or try the sample label.',
      reason: 'bot-check',
    })
    expect(verify).not.toHaveBeenCalled()
    expect(extract).not.toHaveBeenCalled()
  })

  it('a token the check refuses is a failed check, and spends nothing', async () => {
    const extract = reading()
    const { app, roomTodayMicros } = publicAudit({ outcome: 'failed', extract })
    const before = await roomTodayMicros()
    const response = await readWithToken(app)
    expect(response.status).toBe(403)
    expect(response.body.reason).toBe('bot-check')
    expect(extract).not.toHaveBeenCalled()
    expect(await roomTodayMicros()).toBe(before)
  })

  it('a check Cloudflare could not answer refuses as unavailable', async () => {
    const { app } = publicAudit({ outcome: 'unavailable' })
    const response = await readWithToken(app)
    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      error: 'Live photo reading is not available right now. Try the sample label.',
      reason: 'unavailable',
    })
  })

  it('a check that throws refuses as unavailable, not a 500', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app, verify } = publicAudit()
    verify.mockRejectedValue(new Error('nobody home'))
    const response = await readWithToken(app)
    expect(response.status).toBe(503)
    expect(response.body.reason).toBe('unavailable')
    expect(logged).toHaveBeenCalled()
  })
})

describe('the per-visitor count', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** The visitor supertest's requests come from, without a proxy to believe. */
  const LOOPBACK = '::ffff:127.0.0.1'

  it('counts a read against the visitor only once it is a valid photo', async () => {
    const { app, visitors } = publicAudit({ auditLimits: { ...GENEROUS, perVisitorPerDay: 5 } })
    const left = () => visitors.allowance.left(visitorKey(visitors.ipHashKey, LOOPBACK), 5)
    const server = supertest(app)

    // Requests that never reach the paid call: a 404, a malformed body and a body that is no
    // photograph. None of them is a read.
    expect((await server.get('/api/audit/ghs')).status).toBe(404)
    expect((await server.post('/api/audit/nowhere').send(A_REQUEST)).status).toBe(404)
    expect((await readWithToken(app, { regime: 'nonsense' })).status).toBe(400)
    expect(
      (await readWithToken(app, { ...A_REQUEST, image: { ...A_PHOTO, data: 'A' } })).status,
    ).toBe(400)
    expect(await left()).toBe(5)

    expect((await readWithToken(app)).status).toBe(200)
    expect(await left()).toBe(4)
  })

  it('refuses a visitor past their reads with the per-network copy', async () => {
    const extract = reading()
    const { app } = publicAudit({ extract, auditLimits: { ...GENEROUS, perVisitorPerDay: 1 } })
    expect((await readWithToken(app)).status).toBe(200)

    const refused = await readWithToken(app)
    expect(refused.status).toBe(429)
    expect(refused.body).toEqual({
      error: 'This network has used its live photo reads for now. Try the sample label.',
      reason: 'ip',
    })
    expect(extract).toHaveBeenCalledTimes(1)
  })

  it('counts a reading the model declined, because that reading was paid for', async () => {
    // A 422 is a failed request and a spent one: the model ran and answered.
    const { app } = publicAudit({
      extract: failing(new ExtractionDeclined('no')),
      auditLimits: { ...GENEROUS, perVisitorPerDay: 1 },
    })
    expect((await readWithToken(app)).status).toBe(422)
    expect((await readWithToken(app)).body.reason).toBe('ip')
  })

  it('counts against the allowance it is given, which a restart does not reset', async () => {
    const visitors: AuditVisitors = {
      allowance: memoryVisitorAllowance(),
      ipHashKey: 'k'.repeat(32),
    }
    const options = { auditLimits: { ...GENEROUS, perVisitorPerDay: 1 }, auditVisitors: visitors }
    expect((await readWithToken(publicAudit(options).app)).status).toBe(200)
    // A second application, as after a restart, on the same count.
    expect((await readWithToken(publicAudit(options).app)).status).toBe(429)
  })

  it('refuses, and spends nothing, when the count cannot be read', async () => {
    const extract = reading()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unreadable: VisitorAllowance = {
      take: () => Promise.reject(new Error('no database')),
      left: () => Promise.reject(new Error('no database')),
    }
    const { app } = publicAudit({
      extract,
      auditVisitors: { allowance: unreadable, ipHashKey: 'k'.repeat(32) },
    })
    const response = await readWithToken(app)
    expect(response.status).toBe(503)
    expect(response.body.reason).toBe('unavailable')
    expect(extract).not.toHaveBeenCalled()
    expect(logged).toHaveBeenCalled()
  })

  it('a forged leftmost X-Forwarded-For does not change the rate-limit key', async () => {
    // No extractor, so every admitted request stops at `unconfigured` and none reaches the count.
    const { app } = publicAudit({
      extract: undefined,
      auditSpend: undefined,
      auditLimits: { ...GENEROUS, perHour: 2 },
      trustProxyHops: 1,
    })
    const from = (forwarded: string) =>
      supertest(app)
        .post('/api/audit/ghs')
        .set('X-Forwarded-For', forwarded)
        .set(TURNSTILE_HEADER, 'tok')
        .send(A_REQUEST)

    expect((await from('198.51.100.1, 203.0.113.7')).body.reason).toBe('unconfigured')
    expect((await from('198.51.100.2, 203.0.113.7')).body.reason).toBe('unconfigured')
    const third = await from('198.51.100.3, 203.0.113.7')
    expect(third.status).toBe(429)
    expect(third.body.reason).toBe('unavailable')
    expect((await from('198.51.100.9, 203.0.113.8')).status).not.toBe(429)
  })

  it('a forged leftmost X-Forwarded-For does not change the daily count', async () => {
    const { app } = publicAudit({
      auditLimits: { ...DEFAULT_AUDIT_LIMITS, perVisitorPerDay: 1 },
      trustProxyHops: 1,
    })
    const from = (forwarded: string) =>
      supertest(app)
        .post('/api/audit/ghs')
        .set('X-Forwarded-For', forwarded)
        .set(TURNSTILE_HEADER, 'tok')
        .send(A_REQUEST)

    expect((await from('198.51.100.1, 203.0.113.7')).status).toBe(200)
    const second = await from('198.51.100.2, 203.0.113.7')
    expect(second.status).toBe(429)
    expect(second.body.reason).toBe('ip')
  })
})

/** Built the way the SDK builds one from a reply's JSON body. */
const apiError = (
  status: number,
  type: string,
  message: string,
  details: Record<string, unknown> | null = null,
) =>
  Anthropic.APIError.generate(
    status,
    { type: 'error', error: { type, message, details } },
    undefined,
    new Headers(),
  )

describe('what a read may spend', () => {
  // On the public path, which is the one the budget exists for: key and public modes are
  // exclusive, and every read here carries a token the check passes.
  const spending = (extract: ExtractLabel, config: BudgetConfig = CONFIG) => {
    const { app, roomTodayMicros } = publicAudit({ extract, config, auditLimits: false })
    return { app, roomTodayMicros }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refuses cleanly when the budget is zero', async () => {
    const extract = reading()
    const { app } = spending(extract, { ...CONFIG, monthlyBudgetMicros: 0 })
    const response = await readWithToken(app)
    expect(response.status).toBe(429)
    expect(response.body).toEqual({
      error: 'Live photo reads are paused for now. Try the sample label.',
      reason: 'budget',
    })
    expect(response.body.error).toMatch(/sample/)
    expect(extract).not.toHaveBeenCalled()
  })

  it('a ledger that cannot reserve answers unavailable, not a 500', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const extract = reading()
    const ledger = createLedger(memoryLedgerStore(), CONFIG, clock)
    const { app } = publicAudit({
      extract,
      auditSpend: {
        ledger: { ...ledger, reserve: () => Promise.reject(new Error('no database')) },
        reservationMicros: 112_000,
      },
    })
    const response = await readWithToken(app)
    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      error: 'Live photo reading is not available right now. Try the sample label.',
      reason: 'unavailable',
    })
    expect(extract).not.toHaveBeenCalled()
    expect(logged).toHaveBeenCalled()
  })

  // The two usage-limit messages open as Anthropic documents them ("Rate limits", § Setting
  // your own spend limit, read 2026-11-19); the rest of each is elided rather than made up.
  it.each([
    [
      'the workspace usage limit (400)',
      apiError(
        400,
        'invalid_request_error',
        'You have reached your specified workspace API usage limits. ...',
      ),
    ],
    [
      'the organization usage limit (400)',
      apiError(
        400,
        'invalid_request_error',
        'You have reached your specified API usage limits. ...',
      ),
    ],
    ['any other bad request (400)', apiError(400, 'invalid_request_error', 'image too large')],
    ['a revoked key (401)', apiError(401, 'authentication_error', 'invalid x-api-key')],
    ['a billing error (402)', apiError(402, 'billing_error', 'credit balance too low')],
    ['a forbidden key (403)', apiError(403, 'permission_error', 'not allowed')],
    [
      'the spend cap (429)',
      apiError(429, 'rate_limit_error', 'spend limit', {
        error_code: 'enforced_spend_limit_reached',
      }),
    ],
    ['a plain rate limit (429)', apiError(429, 'rate_limit_error', 'slow down')],
    ['an overload (529)', apiError(529, 'overloaded_error', 'Overloaded')],
    ['a server error (500)', apiError(500, 'api_error', 'oops')],
    ['a timeout', new Anthropic.APIConnectionTimeoutError()],
    ['a connection failure', new Anthropic.APIConnectionError({ message: 'Connection error.' })],
  ])('a provider limit points at the sample, never at the photo: %s', async (_, error) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app } = spending(failing(error))
    const response = await readWithToken(app)
    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      error: 'Live photo reading is not available right now. Try the sample label.',
      reason: 'unavailable',
    })
    expect(JSON.stringify(response.body)).not.toMatch(/unreadable|corrupt|try again in a moment/i)
  })

  it('a visitor who leaves mid-read stops the call, and the reservation stays counted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let fired = false
    let markEntered!: () => void
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve
    })
    let markRejected!: () => void
    const rejected = new Promise<void>((resolve) => {
      markRejected = resolve
    })
    const extract = vi.fn<ExtractLabel>(
      (_photo, _regime, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            fired = true
            reject(new Anthropic.APIUserAbortError())
            markRejected()
          })
          markEntered()
        }),
    )
    const { app, roomTodayMicros } = spending(extract)
    const before = await roomTodayMicros()

    // The visitor leaves once the read is under way: not on a timer, which could fire before
    // the handler reached the call, or after.
    const request = readWithToken(app)
    const settled = request.then(
      () => undefined,
      () => undefined,
    )
    await entered
    request.abort()
    await settled

    // The server's rejection, and the settle it must not make, run after the client has gone.
    await vi.waitFor(async () => expect(await roomTodayMicros()).not.toBe(before), {
      timeout: 2_000,
    })
    await rejected
    await new Promise((resolve) => setImmediate(resolve))

    expect(fired).toBe(true)
    expect(await roomTodayMicros()).toBe(before - 112_000)
  })

  it('a visitor who leaves while their reads are being counted is never read for', async () => {
    // The connection closes during an await of the handler. A close hook registered after it
    // has missed the event, so the read would go out for nobody.
    const extract = reading()

    let markTaking!: () => void
    const taking = new Promise<void>((resolve) => {
      markTaking = resolve
    })
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let markTaken!: () => void
    const taken = new Promise<void>((resolve) => {
      markTaken = resolve
    })
    const slowCount: VisitorAllowance = {
      take: async () => {
        markTaking()
        await released
        markTaken()
        return true
      },
      left: async () => 10,
    }

    const { app, roomTodayMicros } = publicAudit({
      extract,
      auditVisitors: { allowance: slowCount, ipHashKey: 'k'.repeat(32) },
    })
    // Its own server, so the test can see the server side of the connection close.
    const server = createServer(app)
    let markClosed!: () => void
    const closed = new Promise<void>((resolve) => {
      markClosed = resolve
    })
    server.on('request', (_request, response) => response.on('close', () => markClosed()))
    const before = await roomTodayMicros()

    const request = supertest(server)
      .post('/api/audit/ghs')
      .set(TURNSTILE_HEADER, 'tok')
      .send(A_REQUEST)
    const settled = request.then(
      () => undefined,
      () => undefined,
    )
    await taking
    request.abort()
    await settled
    await closed
    release()
    await taken
    // What the handler does after the count resolves, given every chance to run.
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))

    expect(extract).not.toHaveBeenCalled()
    expect(await roomTodayMicros()).toBe(before)
  })

  it('a visitor who leaves during the bot check is never read for', async () => {
    // The check runs before the handler, so the connection can close before the handler's
    // close hook exists. What stops the read today is the body parser, which gives no body
    // for a request that has already finished, so the handler refuses it as a bad body. Pinned
    // here so that a change to either is noticed.
    const extract = reading()
    let markAsking!: () => void
    const asking = new Promise<void>((resolve) => {
      markAsking = resolve
    })
    let answer!: (outcome: TurnstileOutcome) => void
    const answered = new Promise<TurnstileOutcome>((resolve) => {
      answer = resolve
    })
    const { app, verify, roomTodayMicros } = publicAudit({ extract })
    verify.mockImplementation(async () => {
      markAsking()
      return answered
    })

    const server = createServer(app)
    let markClosed!: () => void
    const closed = new Promise<void>((resolve) => {
      markClosed = resolve
    })
    server.on('request', (_request, response) => response.on('close', () => markClosed()))
    const before = await roomTodayMicros()

    const request = supertest(server)
      .post('/api/audit/ghs')
      .set(TURNSTILE_HEADER, 'tok')
      .send(A_REQUEST)
    const settled = request.then(
      () => undefined,
      () => undefined,
    )
    await asking
    request.abort()
    await settled
    await closed
    answer('passed')
    // What the handler does once the check passes, given every chance to run: the body
    // parser reads on a later turn of the event loop, so a few immediates are not enough.
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(extract).not.toHaveBeenCalled()
    expect(await roomTodayMicros()).toBe(before)
  })
})

/**
 * Findings 2 and 3 of `docs/security-review-2026-10-18.md`: a request the guards
 * refuse used to be parsed first, and a body that was no photograph spent a call.
 * Whether a body was parsed is read from the answer rather than timed: a body that
 * is not JSON draws 400 from the parser, so a refusal that arrives as 401, 403 or
 * 429 instead was decided before anything read it.
 */
describe('what the audit route reads before it refuses', () => {
  const NOT_JSON = '{"regime": "eu-clp", "image": '
  const app = (options: Parameters<typeof createApp>[0] = {}) =>
    createApp({ enableLogging: false, extract: reading(), auditSpend: roomy(), ...options })
  const postRaw = (built: ReturnType<typeof createApp>, body: string, key?: string) => {
    const request = supertest(built).post('/api/audit/ghs').set('Content-Type', 'application/json')
    return (key === undefined ? request : request.set(AUDIT_KEY_HEADER, key)).send(body)
  }

  it('refuses a missing key before it parses the body', async () => {
    const response = await postRaw(app({ auditLimits: false, auditApiKey: 'the-secret' }), NOT_JSON)
    expect(response.status).toBe(401)
  })

  it('refuses a client past its hourly allowance before it parses the body', async () => {
    const built = app({ auditLimits: { ...GENEROUS, perHour: 1 } })
    expect((await postRaw(built, NOT_JSON)).status).toBe(400)
    expect((await postRaw(built, NOT_JSON)).status).toBe(429)
  })

  it('checks the bot before it reads a byte of the body', async () => {
    // Three megabytes that are not JSON: read first, they would draw the parser's 400. Sent
    // with Node's own client, because supertest reports the write the early answer cuts off
    // as ECONNRESET instead of the answer.
    const { app: built, verify } = publicAudit({ outcome: 'failed' })
    const server = createServer(built).listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address() as AddressInfo
    const payload = Buffer.from(NOT_JSON + 'A'.repeat(3 * 1024 * 1024))
    try {
      const { status, body } = await new Promise<{ status: number | undefined; body: string }>(
        (resolve, reject) => {
          const sent = request(
            {
              port,
              method: 'POST',
              path: '/api/audit/ghs',
              headers: {
                'content-type': 'application/json',
                'content-length': payload.length,
                [TURNSTILE_HEADER]: 'tok',
              },
            },
            (answer) => {
              let text = ''
              answer.on('data', (chunk) => (text += chunk))
              answer.on('end', () => resolve({ status: answer.statusCode, body: text }))
            },
          )
          sent.on('error', reject)
          sent.end(payload)
        },
      )
      expect(status).toBe(403)
      expect(JSON.parse(body).reason).toBe('bot-check')
      expect(verify).toHaveBeenCalledTimes(1)
    } finally {
      server.close()
    }
  })

  it('still parses the body of a request the guards admit', async () => {
    const response = await postRaw(
      app({ auditLimits: false, auditApiKey: 'the-secret' }),
      NOT_JSON,
      'the-secret',
    )
    expect(response.status).toBe(400)
  })

  it('takes a photograph larger than every other route allows', async () => {
    // Mounted ahead of the 256 KB parser the other routes share, which would
    // otherwise refuse every real photograph with 413 before this route saw it.
    const extract = reading()
    const data = Buffer.concat([
      Buffer.from(A_PHOTO.data, 'base64'),
      Buffer.alloc(750_000),
    ]).toString('base64')
    const response = await supertest(app({ auditLimits: false, extract }))
      .post('/api/audit/ghs')
      .send({ ...A_REQUEST, image: { ...A_PHOTO, data } })
    expect(response.status).toBe(200)
    expect(extract).toHaveBeenCalled()
  })

  it.each([
    ['one character', 'A'],
    ['text that is not base64', 'not an image at all'],
    [
      'a JPEG declared as a PNG',
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0, 0]).toString('base64'),
    ],
  ])('refuses %s as the image without spending a read on it', async (_name, data) => {
    const extract = reading()
    const { app: built } = publicAudit({
      extract,
      auditLimits: { ...GENEROUS, perVisitorPerDay: 1 },
    })
    const refused = await readWithToken(built, { ...A_REQUEST, image: { ...A_PHOTO, data } })
    expect(refused.status).toBe(400)
    expect(refused.body.detail[0].path).toBe('image.data')
    expect(extract).not.toHaveBeenCalled()

    // The visitor's one read is still there for a photograph.
    expect((await readWithToken(built)).status).toBe(200)
  })
})

describe('GET /api/audit/status', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const status = (app: ReturnType<typeof createApp>) => supertest(app).get('/api/audit/status')

  it('status hands the browser the site key', async () => {
    const response = await status(publicAudit().app)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ available: true, reason: null, siteKey: SITE_KEY })
  })

  it('status says unconfigured without an extractor, or in key mode', async () => {
    const withoutExtractor = await status(
      publicAudit({ extract: undefined, auditSpend: undefined }).app,
    )
    expect(withoutExtractor.body).toEqual({
      available: false,
      reason: 'unconfigured',
      siteKey: SITE_KEY,
    })

    const keyMode = createApp({
      enableLogging: false,
      extract: reading(),
      auditApiKey: 'the-secret',
      auditLimits: false,
      auditSpend: roomy(),
    })
    expect((await status(keyMode)).body).toEqual({
      available: false,
      reason: 'unconfigured',
      siteKey: null,
    })
  })

  it('status says budget when the day has no room', async () => {
    const { app } = publicAudit({ config: { ...CONFIG, monthlyBudgetMicros: 0 } })
    expect((await status(app)).body).toEqual({
      available: false,
      reason: 'budget',
      siteKey: SITE_KEY,
    })
  })

  it('status says ip once this address has used its reads', async () => {
    const { app } = publicAudit({ auditLimits: { ...GENEROUS, perVisitorPerDay: 1 } })
    expect((await status(app)).body.available).toBe(true)
    expect((await readWithToken(app)).status).toBe(200)
    expect((await status(app)).body).toEqual({
      available: false,
      reason: 'ip',
      siteKey: SITE_KEY,
    })
  })

  it('a status that cannot read its counts says paused', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unreadable: VisitorAllowance = {
      take: () => Promise.reject(new Error('no database')),
      left: () => Promise.reject(new Error('no database')),
    }
    const { app } = publicAudit({
      auditVisitors: { allowance: unreadable, ipHashKey: 'k'.repeat(32) },
    })
    const response = await status(app)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ available: false, reason: 'budget', siteKey: SITE_KEY })
    expect(logged).toHaveBeenCalled()
  })

  it('a ledger it cannot ask says paused', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ledger = createLedger(memoryLedgerStore(), CONFIG, clock)
    const { app } = publicAudit({
      auditSpend: {
        ledger: { ...ledger, roomTodayMicros: () => Promise.reject(new Error('no database')) },
        reservationMicros: 112_000,
      },
    })
    const response = await status(app)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ available: false, reason: 'budget', siteKey: SITE_KEY })
    expect(logged).toHaveBeenCalled()
  })

  it('status is never cached', async () => {
    const response = await status(publicAudit().app)
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('the 61st status check in a minute is refused', async () => {
    const { app } = publicAudit({ auditLimits: DEFAULT_AUDIT_LIMITS })
    for (let i = 0; i < 60; i++) expect((await status(app)).status, `check ${i + 1}`).toBe(200)
    const refused = await status(app)
    expect(refused.status).toBe(429)
    expect(refused.body).toEqual({ error: 'Too many status checks. Try again in a minute.' })
  })

  describe('the ledger read behind it', () => {
    /** The router alone, on a clock the test moves. */
    const routerOn = (roomTodayMicros: () => Promise<number>) => {
      let at = 1_000_000
      const ledger = createLedger(memoryLedgerStore(), CONFIG, clock)
      const app = express().use(
        '/api/audit',
        createAuditRouter({
          extract: reading(),
          limits: false,
          spend: { ledger: { ...ledger, roomTodayMicros }, reservationMicros: 112_000 },
          now: () => at,
        }),
      )
      return {
        check: () => supertest(app).get('/api/audit/status'),
        advance: (ms: number) => {
          at += ms
        },
      }
    }

    it('two status checks within five seconds read the ledger once', async () => {
      const room = vi.fn(async () => 2_500_000)
      const { check, advance } = routerOn(room)
      expect((await check()).body.available).toBe(true)
      advance(4_999)
      expect((await check()).body.available).toBe(true)
      expect(room).toHaveBeenCalledTimes(1)
      advance(1)
      expect((await check()).body.available).toBe(true)
      expect(room).toHaveBeenCalledTimes(2)
    })

    it('a ledger read that fails is not kept', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const room = vi
        .fn<() => Promise<number>>()
        .mockRejectedValueOnce(new Error('no database'))
        .mockResolvedValue(2_500_000)
      const { check } = routerOn(room)
      expect((await check()).body.reason).toBe('budget')
      expect((await check()).body).toEqual({ available: true, reason: null, siteKey: null })
      expect(room).toHaveBeenCalledTimes(2)
    })
  })
})

describe('refusals', () => {
  it('every refusal points at the sample label', () => {
    for (const refusal of Object.values(REFUSALS)) expect(refusal.error).toMatch(/sample label/)
  })
})
