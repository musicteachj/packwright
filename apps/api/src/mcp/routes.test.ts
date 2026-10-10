/**
 * `/mcp` as mounted: whether it is there, whom it answers, and how often.
 *
 * Driven over HTTP with Supertest, because the guards are Express middleware in
 * front of the handler. What the tools answer is `server.test.ts`'s.
 */
import supertest from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { isFromAnthropic, toolCallsIn, type McpRouterOptions } from './routes'

/** A `tools/list` call, as the SDK's documentation sends one by hand. */
const listTools = (agent: supertest.Agent | ReturnType<typeof supertest>) =>
  agent
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })

/** A `tools/call`, which is what the allowances count. */
const checkGtin = (agent: ReturnType<typeof supertest>) =>
  agent
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'check_gtin', arguments: { gtin: '036000291452' } },
    })

function appWith(mcp: McpRouterOptions | undefined, trustProxyHops?: number) {
  const lines: string[] = []
  const app = createApp({
    enableLogging: false,
    ...(mcp === undefined ? {} : { mcp: { ...mcp, log: (line: string) => lines.push(line) } }),
    ...(trustProxyHops === undefined ? {} : { trustProxyHops }),
  })
  return { app, lines }
}

describe('mounting', () => {
  it('serves the tools when mounted', async () => {
    const response = await listTools(supertest(appWith({}).app))
    expect(response.status).toBe(200)
    for (const tool of ['check_label', 'list_rules', 'ghs_statement_text', 'check_gtin']) {
      expect(response.text).toContain(`"name":"${tool}"`)
    }
  })

  it('answers a JSON 404 when switched off', async () => {
    const response = await listTools(supertest(appWith(undefined).app))
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Not found' })
  })
})

describe('Host and Origin', () => {
  it('refuses a Host it was not told about', async () => {
    const response = await listTools(supertest(appWith({}).app)).set('Host', 'evil.example')
    expect(response.status).toBe(403)
  })

  it('answers a Host it was told about', async () => {
    const { app } = appWith({ allowedHosts: ['packwright.example'] })
    expect((await listTools(supertest(app)).set('Host', 'packwright.example')).status).toBe(200)
  })

  it('passes a request with no Origin, which is every non-browser client', async () => {
    const { app, lines } = appWith({})
    expect((await listTools(supertest(app))).status).toBe(200)
    expect(lines).toEqual([])
  })

  it('refuses an Origin not on the list, and writes down what it was', async () => {
    const { app, lines } = appWith({})
    const response = await listTools(supertest(app)).set('Origin', 'https://evil.example')
    expect(response.status).toBe(403)
    expect(lines).toEqual([expect.stringContaining('mcp: Origin "https://evil.example"')])
  })

  it('admits localhost and a listed Origin, and still writes each down', async () => {
    const { app, lines } = appWith({ allowedOrigins: ['claude.ai'] })
    expect((await listTools(supertest(app)).set('Origin', 'http://localhost:5173')).status).toBe(
      200,
    )
    expect((await listTools(supertest(app)).set('Origin', 'https://claude.ai')).status).toBe(200)
    expect(lines).toHaveLength(2)
  })
})

describe('rate limits', () => {
  const LIMITS = { anthropicPerHour: 2, perClientPerHour: 1 }
  const from = (agent: ReturnType<typeof supertest>, ip: string) =>
    checkGtin(agent).set('X-Forwarded-For', ip)

  it('counts tool calls, not the requests a client makes to get ready for one', async () => {
    // The older protocol's handshake and `tools/list` come before every call. Counted,
    // they spent most of an allowance before a single label was checked.
    const { app } = appWith({ limits: LIMITS }, 1)
    const agent = supertest(app)
    for (let i = 0; i < 3; i++) {
      expect((await listTools(agent).set('X-Forwarded-For', '203.0.113.9')).status).toBe(200)
    }
    expect((await from(agent, '203.0.113.9')).status).toBe(200)
    expect((await from(agent, '203.0.113.9')).status).toBe(429)
  })

  it('gives each other address its own allowance, and refuses past it with a log line', async () => {
    const { app, lines } = appWith({ limits: LIMITS }, 1)
    const agent = supertest(app)
    expect((await from(agent, '203.0.113.1')).status).toBe(200)
    const refused = await from(agent, '203.0.113.1')
    expect(refused.status).toBe(429)
    expect(refused.body).toEqual({ error: 'Too many requests to /mcp — try again later' })
    expect(lines).toEqual([expect.stringContaining('per-client limit, from 203.0.113.1')])
    // Someone else's allowance is untouched.
    expect((await from(agent, '203.0.113.2')).status).toBe(200)
  })

  it('refuses a batch of tool calls, which would otherwise count as one', async () => {
    const { app, lines } = appWith({ limits: { anthropicPerHour: 100, perClientPerHour: 100 } }, 1)
    const call = (id: number) => ({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: 'check_gtin', arguments: { gtin: '036000291452' } },
    })
    const response = await supertest(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('X-Forwarded-For', '203.0.113.5')
      .send([call(1), call(2)])
    expect(response.status).toBe(400)
    expect(response.body.error).toContain('one tool call per request')
    expect(lines).toEqual([expect.stringContaining('refused a batch of tool calls')])
  })

  it('shares one allowance across Anthropic’s whole range, and spends no one else’s', async () => {
    const { app, lines } = appWith({ limits: LIMITS }, 1)
    const agent = supertest(app)
    // Two ends of 160.79.104.0/21, sharing one bucket of two.
    expect((await from(agent, '160.79.104.0')).status).toBe(200)
    expect((await from(agent, '160.79.111.255')).status).toBe(200)
    expect((await from(agent, '160.79.107.9')).status).toBe(429)
    expect(lines).toEqual([expect.stringContaining('shared Anthropic limit')])
    // An address just past the range is a client of its own.
    expect((await from(agent, '160.79.112.0')).status).toBe(200)
  })
})

describe('isFromAnthropic', () => {
  it.each([
    ['160.79.103.255', false],
    ['160.79.104.0', true],
    ['160.79.111.255', true],
    ['160.79.112.0', false],
    ['::ffff:160.79.104.1', true],
    // Anthropic's IPv6 range is inbound; its outbound calls come from IPv4.
    ['2607:6bc0::1', false],
    [undefined, false],
  ] as const)('%s → %s', (ip, expected) => {
    expect(isFromAnthropic(ip)).toBe(expected)
  })
})

describe('toolCallsIn', () => {
  it.each([
    [{ jsonrpc: '2.0', id: 1, method: 'tools/call' }, 1],
    [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 0],
    [{ jsonrpc: '2.0', method: 'notifications/initialized' }, 0],
    [[{ method: 'tools/list' }, { method: 'tools/call' }], 1],
    [[{ method: 'tools/call' }, { method: 'tools/call' }], 2],
    [[{ method: 'initialize' }], 0],
    [undefined, 0],
    [null, 0],
    ['tools/call', 0],
  ] as const)('%j → %s', (body, expected) => {
    expect(toolCallsIn(body)).toBe(expected)
  })
})
