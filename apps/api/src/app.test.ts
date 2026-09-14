import request from 'supertest'
import { describe, expect, it } from 'vitest'
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
