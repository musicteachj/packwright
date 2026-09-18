import { describe, expect, it } from 'vitest'
import { forgetBlanks } from './dotenv'
import { ENV_NAMES } from './env'

describe('loading .env over an environment that already has blanks in it', () => {
  it('forgets a name that is present but empty', () => {
    // `dotenv` will not overwrite a name that is already defined, and
    // defined-but-empty counts as defined. A shell exporting
    // `ANTHROPIC_API_KEY=` therefore silences a correct `.env`, and the server
    // reports vision extraction unconfigured while the key sits in the file.
    // Found by running the fixture recorder, which refused to start for exactly
    // that reason.
    const source: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: '' }
    expect(forgetBlanks(source)).toEqual(['ANTHROPIC_API_KEY'])
    expect('ANTHROPIC_API_KEY' in source).toBe(false)
  })

  it('leaves a name that has a value, however short', () => {
    const source: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'k', MONGODB_URI: 'mongodb://x/y' }
    expect(forgetBlanks(source)).toEqual([])
    expect(source.ANTHROPIC_API_KEY).toBe('k')
  })

  it('leaves alone every name this server does not read', () => {
    // Scoped rather than sweeping every blank in the process, because this file
    // has no business deciding what an empty `PATH` means.
    const source: NodeJS.ProcessEnv = { PATH: '', SOMETHING_ELSE: '' }
    expect(forgetBlanks(source)).toEqual([])
    expect(source.PATH).toBe('')
  })

  it('covers every name the schema reads, without being told them twice', () => {
    // The list is derived from `EnvSchema.shape`, so a field added to the schema
    // is covered here the moment it is added. This asserts the derivation, which
    // is the thing that would silently stop being true.
    expect([...ENV_NAMES].sort()).toEqual(
      [
        'ANTHROPIC_API_KEY',
        'AUDIT_API_KEY',
        'MONGODB_URI',
        'NODE_ENV',
        'PORT',
        'TRUST_PROXY_HOPS',
      ].sort(),
    )
  })
})
