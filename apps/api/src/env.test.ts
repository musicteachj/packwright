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
    expect(load({})).toEqual({ NODE_ENV: 'development', PORT: 3000, ...REQUIRED })
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
