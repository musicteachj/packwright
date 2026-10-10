import { describe, expect, it } from 'vitest'
import { loadEnv } from './env'

/**
 * Everything the schema requires, so a case can vary one field and mean it.
 *
 * `MONGODB_URI` became required and every case below stopped being about its own
 * subject: the three that assert `Invalid environment` went on passing, but on
 * the missing URI rather than on the port or the NODE_ENV they name. They would
 * have kept passing with their own subject deleted.
 */
const REQUIRED = { MONGODB_URI: 'mongodb://localhost:27017/packwright' }
const load = (overrides: NodeJS.ProcessEnv = {}) => loadEnv({ ...REQUIRED, ...overrides })

describe('loadEnv', () => {
  it('applies defaults when nothing else is set', () => {
    expect(load({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      MCP_ENABLED: true,
      MCP_ALLOWED_HOSTS: [],
      MCP_ALLOWED_ORIGINS: [],
      ...REQUIRED,
    })
  })

  it('turns /mcp off only for the word false', () => {
    // `z.coerce.boolean()` reads any non-empty string as true, `'false'` included,
    // which would make the off switch the one value that cannot turn it off.
    expect(load({ MCP_ENABLED: 'false' }).MCP_ENABLED).toBe(false)
    expect(load({ MCP_ENABLED: 'true' }).MCP_ENABLED).toBe(true)
    expect(load({ MCP_ENABLED: '' }).MCP_ENABLED).toBe(true)
    expect(() => load({ MCP_ENABLED: 'no' })).toThrow(/Invalid environment configuration/)
  })

  it('reads the /mcp host and origin lists as comma-separated hostnames', () => {
    const env = load({
      MCP_ALLOWED_HOSTS: 'packwright.example, www.packwright.example,',
      MCP_ALLOWED_ORIGINS: 'claude.ai',
    })
    expect(env.MCP_ALLOWED_HOSTS).toEqual(['packwright.example', 'www.packwright.example'])
    expect(env.MCP_ALLOWED_ORIGINS).toEqual(['claude.ai'])
  })

  it('lowercases the /mcp hostnames, and refuses one with a scheme, port or path', () => {
    // The checks compare bare lowercased hostnames, so any of these would match
    // nothing and leave a deployed /mcp answering 403 to everyone.
    expect(load({ MCP_ALLOWED_HOSTS: 'Packwright.Example' }).MCP_ALLOWED_HOSTS).toEqual([
      'packwright.example',
    ])
    for (const value of [
      'https://packwright.example',
      'packwright.example:443',
      'packwright.example/mcp',
    ]) {
      expect(() => load({ MCP_ALLOWED_HOSTS: value }), value).toThrow(/bare hostnames/)
      expect(() => load({ MCP_ALLOWED_ORIGINS: value }), value).toThrow(/bare hostnames/)
    }
  })

  it.each(['PORT', 'NODE_ENV', 'ANTHROPIC_API_KEY'])(
    'treats a declared but blank %s as absent',
    (key) => {
      // An ECS task definition that declares a variable and leaves its value
      // empty produces exactly this. `.default()` only fires for an absent
      // value, and '' is present — so a blank PORT coerced to 0 and failed
      // `.positive()`, taking the container down on a config that looks correct
      // in the console.
      expect(() => load({ [key]: '' })).not.toThrow()
    },
  )

  it('falls back to the default port when PORT is blank', () => {
    expect(load({ PORT: '' }).PORT).toBe(3000)
  })

  it('reads a port that is set', () => {
    expect(load({ PORT: '8080' }).PORT).toBe(8080)
  })

  it('rejects a port above the TCP maximum', () => {
    // Without an upper bound this passes validation and fails inside `listen`,
    // where the error no longer names the config that caused it.
    expect(() => load({ PORT: '80800' })).toThrow(/Invalid environment/)
  })

  it('rejects a non-numeric port', () => {
    expect(() => load({ PORT: 'http' })).toThrow(/Invalid environment/)
  })

  it('rejects an unrecognised NODE_ENV', () => {
    expect(() => load({ NODE_ENV: 'staging' })).toThrow(/Invalid environment/)
  })

  it('refuses to start without a database URI', () => {
    // This file's opening docblock already argues the case: deferring a missing
    // database URI until the first request that needs it means a container that
    // reports healthy and then 500s under traffic.
    expect(() => loadEnv({})).toThrow(/MONGODB_URI/)
  })

  it('treats a declared but blank MONGODB_URI as absent, which is now fatal', () => {
    // Still absorbed by `blankAsAbsent` — an ECS variable declared with an empty
    // value is missing rather than invalid. What changed is what missing costs.
    expect(() => loadEnv({ MONGODB_URI: '' })).toThrow(/MONGODB_URI/)
  })

  it.each(['   ', 'mongodb://', 'localhost:27017', 'postgres://localhost/packwright'])(
    'refuses %j, which is not a URI mongoose can dial',
    (uri) => {
      // `blankAsAbsent` only maps the empty string to absent, so whitespace is a
      // *present* value that satisfies a bare `.min(1)` — booting a server that
      // reports healthy and fails at first connect, which is the deferral this
      // variable was made required to prevent. The scheme is checked because it
      // is the part mongoose cannot work around.
      expect(() => loadEnv({ MONGODB_URI: uri })).toThrow(/MONGODB_URI/)
    },
  )

  it('accepts the SRV form used by Atlas', () => {
    expect(loadEnv({ MONGODB_URI: 'mongodb+srv://host/packwright' }).MONGODB_URI).toBe(
      'mongodb+srv://host/packwright',
    )
  })

  it('reads a database URI that is set', () => {
    expect(load({}).MONGODB_URI).toBe('mongodb://localhost:27017/packwright')
  })

  it('keeps a secret that is actually set', () => {
    expect(load({ ANTHROPIC_API_KEY: 'sk-test' }).ANTHROPIC_API_KEY).toBe('sk-test')
  })
})
