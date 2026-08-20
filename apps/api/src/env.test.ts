import { describe, expect, it } from 'vitest'
import { loadEnv } from './env'

describe('loadEnv', () => {
  it('applies defaults when nothing is set', () => {
    expect(loadEnv({})).toEqual({ NODE_ENV: 'development', PORT: 3000 })
  })

  it.each(['PORT', 'NODE_ENV', 'MONGODB_URI', 'ANTHROPIC_API_KEY'])(
    'treats a declared but blank %s as absent',
    (key) => {
      // An ECS task definition that declares a variable and leaves its value
      // empty produces exactly this. `.default()` only fires for an absent
      // value, and '' is present — so a blank PORT coerced to 0 and failed
      // `.positive()`, taking the container down on a config that looks correct
      // in the console.
      expect(() => loadEnv({ [key]: '' })).not.toThrow()
    },
  )

  it('falls back to the default port when PORT is blank', () => {
    expect(loadEnv({ PORT: '' }).PORT).toBe(3000)
  })

  it('reads a port that is set', () => {
    expect(loadEnv({ PORT: '8080' }).PORT).toBe(8080)
  })

  it('rejects a port above the TCP maximum', () => {
    // Without an upper bound this passes validation and fails inside `listen`,
    // where the error no longer names the config that caused it.
    expect(() => loadEnv({ PORT: '80800' })).toThrow(/Invalid environment/)
  })

  it('rejects a non-numeric port', () => {
    expect(() => loadEnv({ PORT: 'http' })).toThrow(/Invalid environment/)
  })

  it('rejects an unrecognised NODE_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/Invalid environment/)
  })

  it('keeps a secret that is actually set', () => {
    expect(loadEnv({ ANTHROPIC_API_KEY: 'sk-test' }).ANTHROPIC_API_KEY).toBe('sk-test')
  })
})
