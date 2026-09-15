import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app'
import { loadEnv } from './env'

const app = createApp({ enableLogging: false })

describe('GET /health', () => {
  it('reports healthy', async () => {
    const response = await request(app).get('/health')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ok')
  })

  it('returns the fields the ALB target group and dashboards read', async () => {
    // The shape is load bearing: this endpoint decides whether the ECS task
    // stays in service.
    const { body } = await request(app).get('/health')
    expect(body).toMatchObject({
      status: expect.any(String),
      uptimeSeconds: expect.any(Number),
      environment: expect.any(String),
      timestamp: expect.any(String),
    })
  })
})

describe('unknown routes', () => {
  it('404s as JSON rather than HTML', async () => {
    const response = await request(app).get('/nope')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Not found' })
  })
})

/**
 * Everything the schema requires, so a case can vary one field and mean it.
 *
 * `MONGODB_URI` is required, and without it supplied here the two `toThrow`
 * cases below pass on the missing URI rather than on the port or the NODE_ENV
 * they name — true with their own subject deleted.
 */
const REQUIRED = { MONGODB_URI: 'mongodb://localhost:27017/packwright' }
const load = (overrides: NodeJS.ProcessEnv = {}) => loadEnv({ ...REQUIRED, ...overrides })

describe('/health and the database', () => {
  it('reports the database as part of liveness', async () => {
    const response = await request(
      createApp({ enableLogging: false, databaseStatus: () => 'connected' }),
    ).get('/health')
    expect(response.status).toBe(200)
    expect(response.body.database).toBe('connected')
  })

  it('fails the probe when the connection has gone away', async () => {
    // Phase 8 puts an ALB target group behind this. A task that reports healthy
    // without a database holds a broken instance in service.
    const response = await request(
      createApp({ enableLogging: false, databaseStatus: () => 'disconnected' }),
    ).get('/health')
    expect(response.status).toBe(503)
    expect(response.body.status).toBe('degraded')
  })

  it('reports healthy when nothing told it about a database', async () => {
    // The route tests that construct an app to ask about a PDF must not need a
    // connection to do it.
    const response = await request(createApp({ enableLogging: false })).get('/health')
    expect(response.status).toBe(200)
    expect(response.body).not.toHaveProperty('database')
  })
})

describe('loadEnv', () => {
  it('applies defaults when nothing else is set', () => {
    const env = load({})
    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(3000)
  })

  it('coerces PORT from the string the platform actually provides', () => {
    expect(load({ PORT: '8080' }).PORT).toBe(8080)
  })

  it('fails loudly on a malformed value rather than at first use', () => {
    expect(() => load({ PORT: 'not-a-port' })).toThrow(/Invalid environment configuration/)
  })

  it('rejects an unknown NODE_ENV', () => {
    expect(() => load({ NODE_ENV: 'staging' })).toThrow(/Invalid environment configuration/)
  })

  it('treats a declared-but-blank secret as absent', () => {
    // Regression: an ECS task definition that declares an environment variable
    // and leaves its value empty yields '' — which is *present*, so a bare
    // .min(1).optional() rejected it and crash-looped the container on a config
    // that looks perfectly fine in the console.
    //
    // MONGODB_URI is absorbed the same way and is no longer demonstrable here,
    // because absent is now fatal for it. `env.test.ts` asserts that directly.
    expect(load({ ANTHROPIC_API_KEY: '' }).ANTHROPIC_API_KEY).toBeUndefined()
  })

  it('still accepts a real secret', () => {
    expect(load({ ANTHROPIC_API_KEY: 'sk-ant-example' }).ANTHROPIC_API_KEY).toBe('sk-ant-example')
  })
})

/**
 * The API is same-origin in both modes it runs in, and says so.
 *
 * Vite proxies `/api` and `/health` in development; in production this server
 * serves the client itself. `cors()` was nonetheless mounted at its defaults,
 * answering every request with `Access-Control-Allow-Origin: *` — an invitation
 * to any page on the internet to call this API from a visitor's browser, to
 * solve a problem neither mode has. It cost little on a stateless PDF endpoint
 * and stops being cheap the moment saved labels put user data behind these
 * routes.
 */
describe('cross-origin access', () => {
  it('grants none, on the API or the client', async () => {
    for (const path of ['/health', '/api/labels/nope']) {
      const response = await request(app).get(path).set('Origin', 'https://not-packwright.example')
      expect(response.headers['access-control-allow-origin'], path).toBeUndefined()
      expect(response.headers['access-control-allow-credentials'], path).toBeUndefined()
    }
  })

  it('does not answer a preflight for a cross-origin caller', async () => {
    const response = await request(app)
      .options('/api/labels/upc-a/export')
      .set('Origin', 'https://not-packwright.example')
      .set('Access-Control-Request-Method', 'POST')

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    expect(response.headers['access-control-allow-methods']).toBeUndefined()
  })
})

describe('a request the server cannot accept', () => {
  it('reports an oversized body as the client error it is', async () => {
    // It answered 500 before this, which told a caller the server had broken
    // when what had happened was that they sent 11 MB. Found by posting exactly
    // that, and reachable in normal use for the first time now that `/api/audit`
    // takes photographs.
    const response = await request(app)
      .post('/api/labels/upc-a/export')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(11 * 1024 * 1024) }))

    expect(response.status).toBe(413)
    expect(response.body).toEqual({ error: 'The request body is too large' })
  })

  it('reports an unsupported encoding in words about the encoding', async () => {
    // `body-parser` raises three: `entity.parse.failed` (400),
    // `entity.too.large` (413) and `encoding.unsupported` (415). An earlier fix
    // answered any 4xx and worded them all "Bad request", which gave this one a
    // status about the encoding and a sentence about the body.
    const response = await request(app)
      .post('/api/labels/upc-a/export')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'bogus')
      .send('{}')

    expect(response.status).toBe(415)
    expect(response.body).toEqual({ error: 'The request encoding is not supported' })
  })

  it('does not fill the log with stack traces for things the client did', async () => {
    // `morgan` already records the request. A stack per oversized upload turns
    // the one signal this log carries — that something here is broken — into
    // noise, and `/api/audit` takes photographs from phones.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await request(app)
        .post('/api/labels/upc-a/export')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ blob: 'x'.repeat(11 * 1024 * 1024) }))
      expect(logged).not.toHaveBeenCalled()
    } finally {
      logged.mockRestore()
    }
  })

  it('reports malformed JSON as a bad request rather than a broken server', async () => {
    const response = await request(app)
      .post('/api/labels/upc-a/export')
      .set('Content-Type', 'application/json')
      .send('{"gtin": ')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Bad request' })
  })
})

describe('the audit endpoint', () => {
  it('is mounted, and says it has no key rather than 404ing', async () => {
    // `createApp()` with no options is what every route test in this workspace
    // builds, and it must keep building — the endpoint being unconfigured is a
    // state the server serves happily, not one it refuses to start in.
    const response = await request(app).post('/api/audit/ghs').send({})
    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'Vision extraction is not configured' })
  })

  it('is not swallowed by the client history fallback', async () => {
    // `/api` is reserved for the server, so a mistyped audit path is a JSON 404
    // rather than a page of HTML with a 200 on it.
    const response = await request(app).post('/api/audit/nope').send({})
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Not found' })
  })
})
