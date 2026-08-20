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

describe('loadEnv', () => {
  it('applies defaults when nothing is set', () => {
    const env = loadEnv({})
    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(3000)
  })

  it('coerces PORT from the string the platform actually provides', () => {
    expect(loadEnv({ PORT: '8080' }).PORT).toBe(8080)
  })

  it('fails loudly on a malformed value rather than at first use', () => {
    expect(() => loadEnv({ PORT: 'not-a-port' })).toThrow(/Invalid environment configuration/)
  })

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/Invalid environment configuration/)
  })

  it('treats a declared-but-blank secret as absent', () => {
    // Regression: an ECS task definition that declares an environment variable
    // and leaves its value empty yields '' — which is *present*, so a bare
    // .min(1).optional() rejected it and crash-looped the container on a config
    // that looks perfectly fine in the console.
    const env = loadEnv({ ANTHROPIC_API_KEY: '', MONGODB_URI: '' })
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.MONGODB_URI).toBeUndefined()
  })

  it('still accepts a real secret', () => {
    expect(loadEnv({ ANTHROPIC_API_KEY: 'sk-ant-example' }).ANTHROPIC_API_KEY).toBe(
      'sk-ant-example',
    )
  })
})
