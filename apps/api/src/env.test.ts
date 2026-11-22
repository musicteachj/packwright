import { describe, expect, it } from 'vitest'
import { TEST_SECRET_FAILS, TEST_SECRET_PASSES, TEST_SITE_KEY } from './audit/turnstile'
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
      AI_PACING_MULTIPLIER: 3,
      AI_DAILY_FLOOR_USD: 0.5,
      AUDIT_PUBLIC: false,
      TURNSTILE_HOSTNAMES: [],
      AUDIT_READS_PER_IP_PER_DAY: 5,
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

  it.each([
    'mongodb://localhost:27017',
    'mongodb://localhost:27017/',
    'mongodb://localhost:27017/?replicaSet=rs0',
    'mongodb+srv://u:p@cluster.example.net/?retryWrites=true',
    'mongodb://localhost:27017?tlsCAFile=/etc/ssl/ca.pem',
  ])('refuses %s, which names no database', (uri) => {
    // Without a database name the driver writes to `test`, so a deployment would
    // save every label into a database nobody named and nothing reads.
    expect(() => loadEnv({ MONGODB_URI: uri })).toThrow(/MONGODB_URI must name its database/)
  })

  it('accepts an Atlas URI that names its database before its options', () => {
    const uri = 'mongodb+srv://u:p@cluster.example.net/packwright?retryWrites=true'
    expect(loadEnv({ MONGODB_URI: uri }).MONGODB_URI).toBe(uri)
  })

  it('accepts a replica-set URI that names its database', () => {
    const uri = 'mongodb://h1:1,h2:2/packwright?replicaSet=rs0'
    expect(loadEnv({ MONGODB_URI: uri }).MONGODB_URI).toBe(uri)
  })

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

  /**
   * The audit key is required where the server can spend the Anthropic key in
   * production (`docs/security-review-2026-10-18.md`, James's decision of
   * 2026-10-18): a deployment that left it unset opened the audit to anyone. Since
   * 2026-11-18 the public path (`AUDIT_PUBLIC`, below) is the other way to start.
   */
  it('refuses to start in production with the Anthropic key and no audit key', () => {
    expect(() => load({ NODE_ENV: 'production', ANTHROPIC_API_KEY: 'sk-ant-x' })).toThrow(
      /AUDIT_API_KEY: is required in production when ANTHROPIC_API_KEY is set/,
    )
    expect(() =>
      load({ NODE_ENV: 'production', ANTHROPIC_API_KEY: 'sk-ant-x', AUDIT_API_KEY: '' }),
    ).toThrow(/AUDIT_API_KEY/)
  })

  it('starts in production with both keys, or with neither', () => {
    expect(
      load({
        NODE_ENV: 'production',
        ANTHROPIC_API_KEY: 'sk-ant-x',
        AUDIT_API_KEY: 'the-secret',
        AI_MONTHLY_BUDGET_USD: '10',
      }).AUDIT_API_KEY,
    ).toBe('the-secret')
    // No Anthropic key is no audit to spend, so nothing to protect.
    expect(load({ NODE_ENV: 'production' }).NODE_ENV).toBe('production')
  })

  it('leaves the audit key optional outside production', () => {
    expect(load({ ANTHROPIC_API_KEY: 'sk-ant-x' }).AUDIT_API_KEY).toBeUndefined()
  })

  it('reads the hourly label creates as a whole number of at least one, absent when blank', () => {
    expect(load({ LABEL_CREATES_PER_HOUR: '1000' }).LABEL_CREATES_PER_HOUR).toBe(1000)
    expect(load({ LABEL_CREATES_PER_HOUR: '' }).LABEL_CREATES_PER_HOUR).toBeUndefined()
    expect(() => load({ LABEL_CREATES_PER_HOUR: '0' })).toThrow(/LABEL_CREATES_PER_HOUR/)
    expect(() => load({ LABEL_CREATES_PER_HOUR: '2.5' })).toThrow(/LABEL_CREATES_PER_HOUR/)
    expect(() => load({ LABEL_CREATES_PER_HOUR: ' ' })).toThrow(/LABEL_CREATES_PER_HOUR/)
  })

  it('reads the monthly AI budget in dollars, absent when blank', () => {
    expect(load({ AI_MONTHLY_BUDGET_USD: '10' }).AI_MONTHLY_BUDGET_USD).toBe(10)
    expect(load({ AI_MONTHLY_BUDGET_USD: '0.5' }).AI_MONTHLY_BUDGET_USD).toBe(0.5)
    expect(load({ AI_MONTHLY_BUDGET_USD: '0' }).AI_MONTHLY_BUDGET_USD).toBe(0)
    expect(load({ AI_MONTHLY_BUDGET_USD: '0.000001' }).AI_MONTHLY_BUDGET_USD).toBe(0.000001)
    expect(load({ AI_MONTHLY_BUDGET_USD: '' }).AI_MONTHLY_BUDGET_USD).toBeUndefined()
    for (const value of ['-1', 'ten', '1e3', '1001', '0.0000001', ' ']) {
      expect(() => load({ AI_MONTHLY_BUDGET_USD: value }), value).toThrow(/AI_MONTHLY_BUDGET_USD/)
    }
  })

  it('paces the budget at three times an even share, with a fifty-cent floor, unless told otherwise', () => {
    const env = load({})
    expect(env.AI_PACING_MULTIPLIER).toBe(3)
    expect(env.AI_DAILY_FLOOR_USD).toBe(0.5)
    expect(load({ AI_PACING_MULTIPLIER: '1' }).AI_PACING_MULTIPLIER).toBe(1)
    expect(load({ AI_PACING_MULTIPLIER: '31' }).AI_PACING_MULTIPLIER).toBe(31)
    expect(load({ AI_DAILY_FLOOR_USD: '0' }).AI_DAILY_FLOOR_USD).toBe(0)
    expect(load({ AI_DAILY_FLOOR_USD: '' }).AI_DAILY_FLOOR_USD).toBe(0.5)
    for (const value of ['0', '32', 'three']) {
      expect(() => load({ AI_PACING_MULTIPLIER: value }), value).toThrow(/AI_PACING_MULTIPLIER/)
    }
    for (const value of ['-1', '1001', 'half']) {
      expect(() => load({ AI_DAILY_FLOOR_USD: value }), value).toThrow(/AI_DAILY_FLOOR_USD/)
    }
  })

  it('production that can spend the Anthropic key states its budget', () => {
    const production = { NODE_ENV: 'production', ANTHROPIC_API_KEY: 'k', AUDIT_API_KEY: 'a' }
    expect(() => load(production)).toThrow(/AI_MONTHLY_BUDGET_USD/)
    expect(() => load({ ...production, AI_MONTHLY_BUDGET_USD: '' })).toThrow(
      /AI_MONTHLY_BUDGET_USD/,
    )
    expect(load({ ...production, AI_MONTHLY_BUDGET_USD: '0' }).AI_MONTHLY_BUDGET_USD).toBe(0)
    // Outside production, or without the key, there is nothing to spend or a developer's own.
    expect(load({ ANTHROPIC_API_KEY: 'k' }).AI_MONTHLY_BUDGET_USD).toBeUndefined()
    expect(load({ NODE_ENV: 'production' }).AI_MONTHLY_BUDGET_USD).toBeUndefined()
  })

  it('trims the audit key, as the audit page trims what is typed', () => {
    expect(load({ AUDIT_API_KEY: 'the-secret\n' }).AUDIT_API_KEY).toBe('the-secret')
  })
})

/**
 * The public photo audit (James, 2026-11-18): live reads behind Cloudflare's bot check and a
 * per-visitor daily count, instead of the shared key. Each rule names its variable, so a
 * deployment that will not start says which setting to fix.
 */
describe('the public photo audit', () => {
  /** A 32-character key, the shortest `AUDIT_IP_HASH_KEY` takes. */
  const HASH_KEY = '0123456789abcdef0123456789abcdef'
  /** Every public setting, with keys that are not Cloudflare's test keys. */
  const PUBLIC = {
    AUDIT_PUBLIC: 'true',
    TURNSTILE_SITE_KEY: '0x4AAAAAAAreal-site-key',
    TURNSTILE_SECRET_KEY: '0x4AAAAAAAreal-secret-key',
    TURNSTILE_HOSTNAMES: 'packwright.example',
    AUDIT_IP_HASH_KEY: HASH_KEY,
  }
  /** Production that can spend the Anthropic key, in public mode, as it is deployed. */
  const PRODUCTION = {
    ...PUBLIC,
    NODE_ENV: 'production',
    ANTHROPIC_API_KEY: 'sk-ant-x',
    AI_MONTHLY_BUDGET_USD: '10',
    TRUST_PROXY_HOPS: '1',
  }

  it('production with the Anthropic key needs the audit key or the public path', () => {
    const production = {
      NODE_ENV: 'production',
      ANTHROPIC_API_KEY: 'k',
      AI_MONTHLY_BUDGET_USD: '10',
    }
    expect(() => load(production)).toThrow(/AUDIT_API_KEY/)
    expect(() => load(production)).toThrow(/unless AUDIT_PUBLIC is true/)
  })

  it('a complete public production config starts without AUDIT_API_KEY', () => {
    const env = load(PRODUCTION)
    expect(env.AUDIT_PUBLIC).toBe(true)
    expect(env.AUDIT_API_KEY).toBeUndefined()
    expect(env.TURNSTILE_SITE_KEY).toBe('0x4AAAAAAAreal-site-key')
    expect(env.TURNSTILE_SECRET_KEY).toBe('0x4AAAAAAAreal-secret-key')
    expect(env.TURNSTILE_HOSTNAMES).toEqual(['packwright.example'])
    expect(env.AUDIT_IP_HASH_KEY).toBe(HASH_KEY)
    expect(env.AUDIT_READS_PER_IP_PER_DAY).toBe(5)
  })

  it('refuses the public path and the key together, in any environment', () => {
    for (const NODE_ENV of ['development', 'production']) {
      expect(
        () => load({ ...PRODUCTION, NODE_ENV, AUDIT_API_KEY: 'the-secret' }),
        NODE_ENV,
      ).toThrow(/AUDIT_PUBLIC: cannot be true while AUDIT_API_KEY is set/)
    }
  })

  it.each(['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'TURNSTILE_HOSTNAMES'])(
    'the public path needs %s, in any environment',
    (name) => {
      for (const NODE_ENV of ['development', 'production']) {
        const missing = new RegExp(`${name}: is required when AUDIT_PUBLIC is true`)
        expect(() => load({ ...PRODUCTION, NODE_ENV, [name]: undefined }), NODE_ENV).toThrow(
          missing,
        )
        expect(() => load({ ...PRODUCTION, NODE_ENV, [name]: '' }), NODE_ENV).toThrow(missing)
      }
    },
  )

  it('the public path needs AUDIT_IP_HASH_KEY of at least 32 characters, development included', () => {
    expect(() => load({ ...PUBLIC, AUDIT_IP_HASH_KEY: undefined })).toThrow(
      /AUDIT_IP_HASH_KEY: is required when AUDIT_PUBLIC is true, at least 32 characters/,
    )
    expect(() => load({ ...PUBLIC, AUDIT_IP_HASH_KEY: '' })).toThrow(/AUDIT_IP_HASH_KEY/)
    expect(() => load({ ...PUBLIC, AUDIT_IP_HASH_KEY: 'a'.repeat(31) })).toThrow(
      /AUDIT_IP_HASH_KEY/,
    )
    // Trimmed first, so padding does not make a short key long enough.
    expect(() => load({ ...PUBLIC, AUDIT_IP_HASH_KEY: ` ${'a'.repeat(31)} ` })).toThrow(
      /AUDIT_IP_HASH_KEY/,
    )
    expect(load({ ...PUBLIC, AUDIT_IP_HASH_KEY: 'a'.repeat(32) }).AUDIT_IP_HASH_KEY).toBe(
      'a'.repeat(32),
    )
  })

  it.each([
    ['unset', undefined],
    ['0', '0'],
    ['2', '2'],
  ])('public production refuses TRUST_PROXY_HOPS %s', (_name, hops) => {
    expect(() => load({ ...PRODUCTION, TRUST_PROXY_HOPS: hops })).toThrow(
      /TRUST_PROXY_HOPS: must be exactly 1 in production when AUDIT_PUBLIC is true/,
    )
  })

  it('public production starts with TRUST_PROXY_HOPS 1', () => {
    expect(load(PRODUCTION).TRUST_PROXY_HOPS).toBe(1)
  })

  it("production refuses Cloudflare's test keys", () => {
    expect(() => load({ ...PRODUCTION, TURNSTILE_SITE_KEY: TEST_SITE_KEY })).toThrow(
      /TURNSTILE_SITE_KEY: is one of Cloudflare's test keys/,
    )
    for (const secret of [TEST_SECRET_PASSES, TEST_SECRET_FAILS]) {
      expect(() => load({ ...PRODUCTION, TURNSTILE_SECRET_KEY: secret }), secret).toThrow(
        /TURNSTILE_SECRET_KEY: is one of Cloudflare's test keys/,
      )
    }
  })

  it('the test keys start production on a local host only', () => {
    const testKeys = {
      ...PRODUCTION,
      TURNSTILE_SITE_KEY: TEST_SITE_KEY,
      TURNSTILE_SECRET_KEY: TEST_SECRET_PASSES,
    }
    expect(load({ ...testKeys, TURNSTILE_HOSTNAMES: 'localhost' }).TURNSTILE_SITE_KEY).toBe(
      TEST_SITE_KEY,
    )
    expect(
      load({ ...testKeys, TURNSTILE_HOSTNAMES: 'localhost,127.0.0.1' }).TURNSTILE_HOSTNAMES,
    ).toEqual(['localhost', '127.0.0.1'])
    expect(() =>
      load({ ...testKeys, TURNSTILE_HOSTNAMES: 'localhost,packwright.example' }),
    ).toThrow(/TURNSTILE_SITE_KEY: is one of Cloudflare's test keys/)
    // Outside production the test keys are what a developer runs on, whatever the hosts.
    expect(
      load({ ...testKeys, NODE_ENV: 'development', TURNSTILE_HOSTNAMES: 'packwright.example' })
        .TURNSTILE_SECRET_KEY,
    ).toBe(TEST_SECRET_PASSES)
  })

  it('reads AUDIT_PUBLIC as true or false and nothing else', () => {
    expect(load({}).AUDIT_PUBLIC).toBe(false)
    expect(load({ AUDIT_PUBLIC: '' }).AUDIT_PUBLIC).toBe(false)
    expect(load({ AUDIT_PUBLIC: 'false' }).AUDIT_PUBLIC).toBe(false)
    expect(() => load({ AUDIT_PUBLIC: 'yes' })).toThrow(/AUDIT_PUBLIC/)
  })

  it('reads the reads per visitor as a whole number, 5 unless set, at most 1000', () => {
    expect(load({}).AUDIT_READS_PER_IP_PER_DAY).toBe(5)
    expect(load({ AUDIT_READS_PER_IP_PER_DAY: '' }).AUDIT_READS_PER_IP_PER_DAY).toBe(5)
    expect(load({ AUDIT_READS_PER_IP_PER_DAY: '12' }).AUDIT_READS_PER_IP_PER_DAY).toBe(12)
    for (const value of ['2.5', '-1', ' ', '1001', 'five']) {
      expect(() => load({ AUDIT_READS_PER_IP_PER_DAY: value }), value).toThrow(
        /AUDIT_READS_PER_IP_PER_DAY/,
      )
    }
  })

  it('reads TURNSTILE_HOSTNAMES as bare hostnames', () => {
    expect(() => load({ TURNSTILE_HOSTNAMES: 'https://packwright.example' })).toThrow(
      /TURNSTILE_HOSTNAMES takes bare hostnames/,
    )
  })
})
