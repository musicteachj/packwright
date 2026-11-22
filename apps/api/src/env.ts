import { z } from 'zod'
import { TEST_SECRET_FAILS, TEST_SECRET_PASSES, TEST_SITE_KEY } from './audit/turnstile'

/**
 * Environment is parsed once, at startup, and fails loudly if it is wrong.
 *
 * The alternative — reading `process.env` at each use site — defers a missing
 * database URI until the first request that needs it, which in a container
 * means a task that reports healthy and then 500s under traffic.
 */
/**
 * A variable that is present but blank is treated as absent.
 *
 * Without this, `FOO=""` is a *present* value that fails a non-empty check and
 * takes the process down at startup. That is not hypothetical: an ECS task
 * definition that declares an environment variable and leaves its value empty
 * produces exactly this, so the container would crash-loop on a config that
 * looks correct in the console.
 */
const blankAsAbsent = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema)

const optionalSecret = blankAsAbsent(z.string().min(1).optional())

/**
 * `a.example, B.example` as a list of hostnames: lowercased, trimmed, and with the
 * blanks a trailing comma leaves dropped — and refused at startup if one is not a
 * bare hostname.
 *
 * The `Host` and `Origin` checks compare against a lowercased hostname with no
 * scheme or port, so `https://packwright.example` or `packwright.example:443`
 * would match nothing, and a deployed `/mcp` would answer 403 to every request
 * while the startup line said the host was allowed. Refused here instead, where
 * the message names the variable.
 */
const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/

const hostnameList = (name: string) =>
  blankAsAbsent(z.string().optional())
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry !== ''),
    )
    .pipe(
      z.array(
        z
          .string()
          .regex(
            HOSTNAME,
            `${name} takes bare hostnames, such as packwright.example — no scheme, port or path`,
          ),
      ),
    )

/**
 * An amount in dollars: digits, and up to six decimals, which is a whole number of
 * micro-dollars, the unit the spend ledger counts in. No sign, no exponent and no
 * spaces, so `1e3` and `-1` are refused rather than read, and `' '` is not 0 the way
 * `z.coerce.number()` would read it. Blank is absent.
 */
const dollars = (name: string) =>
  z
    .string()
    .regex(
      /^\d+(?:\.\d{1,6})?$/,
      `${name} must be an amount in dollars with up to six decimals, such as 10 or 0.5`,
    )
    .transform(Number)
    .pipe(z.number().max(1_000, `${name} must be at most 1000`))

/**
 * The highest port number TCP can express. Without an upper bound a typo like
 * `PORT=80800` passes validation and fails later inside `listen`, by which point
 * the error no longer points at the config that caused it.
 */
const MAX_TCP_PORT = 65535

const EnvSchema = z.object({
  // `.default()` only fires for a value that is absent, and `''` is present —
  // so a blank NODE_ENV failed the enum and a blank PORT coerced to 0 and
  // failed `.positive()`. Both are the same declared-but-empty ECS variable
  // that `optionalSecret` exists to absorb; it was just never applied here.
  NODE_ENV: blankAsAbsent(z.enum(['development', 'test', 'production']).default('development')),
  PORT: blankAsAbsent(z.coerce.number().int().positive().max(MAX_TCP_PORT).default(3000)),

  /**
   * Required. The process refuses to boot without it.
   *
   * It was optional while there was nothing to store. Leaving it optional now
   * would mean a server that starts, reports healthy to the ALB, serves the
   * client, and fails every persistence route — which is precisely the shape
   * this file's opening docblock refuses to allow at startup. Injected from
   * Secrets Manager in production.
   *
   * `blankAsAbsent` still wraps it, so an ECS variable declared with an empty
   * value is reported as missing rather than as failing a non-empty check. The
   * difference between those two messages is the difference between finding the
   * task definition and reading the schema.
   *
   * **The scheme is checked, and `.min(1)` would not have been enough.**
   * `blankAsAbsent` maps only the empty string to absent, so `'   '` is a
   * present value that satisfies any non-empty check — and a server booted on
   * one reports healthy and fails at first connect, which is precisely the
   * deferral this variable was made required to prevent. A value mongoose cannot
   * dial is a missing value that has not admitted it yet.
   *
   * **And it must name its database**, in every environment. A URI with no path
   * after the host is one the driver connects with happily and then writes to
   * `test`, which is how an Atlas connection string pasted as the console gives it
   * would put every saved label in a database nothing else reads.
   */
  MONGODB_URI: blankAsAbsent(
    z
      .string()
      .regex(
        /^mongodb(\+srv)?:\/\/\S/,
        'MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string',
      )
      .regex(
        /^mongodb(\+srv)?:\/\/[^/?\s]+\/[^/?\s]+/,
        'MONGODB_URI must name its database, such as mongodb://localhost:27017/packwright (an Atlas URI without one writes to `test`)',
      ),
  ),

  /**
   * Server-side only, always. This key must never reach the browser bundle —
   * which is why vision extraction lives in this app rather than in the client.
   */
  ANTHROPIC_API_KEY: optionalSecret,

  /**
   * A shared secret the audit route requires: the owner's path.
   *
   * Server-side only, like the key above and for a sharper reason: the audit
   * route spends `ANTHROPIC_API_KEY` on every call, so this is what stands
   * between an open origin and somebody else's bill. Set it and the route is
   * shut to everything that cannot present it. Metered by the spend ledger and
   * the hourly limiter, and not counted per visitor. **Since 2026-11-18 it is no
   * longer the public path** (spec section 10): that is `AUDIT_PUBLIC`, below,
   * and the two are exclusive. In production with `ANTHROPIC_API_KEY` set, one
   * of the two is required (`loadEnv`, below), so a deployment cannot open the
   * audit to anyone by leaving both unset.
   */
  // Trimmed, as the audit page trims what is typed, so a key pasted into a console
  // with a trailing newline is still one a person can match.
  AUDIT_API_KEY: blankAsAbsent(z.string().trim().min(1).optional()),

  /**
   * The public path: live photo reads behind Cloudflare's bot check, counted per
   * visitor and metered by the spend ledger (James, 2026-11-18). `true` and `false`
   * and nothing else, false unless set, for the reason `MCP_ENABLED` is read that way.
   * Requires the three `TURNSTILE_` settings and `AUDIT_IP_HASH_KEY`, in every
   * environment, and in production `TRUST_PROXY_HOPS=1` (`loadEnv`, below).
   */
  AUDIT_PUBLIC: blankAsAbsent(
    z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  ),

  /**
   * The Turnstile widget's site key, which the status hands the browser. Public by
   * design, so not a secret, but required with `AUDIT_PUBLIC`.
   */
  TURNSTILE_SITE_KEY: blankAsAbsent(z.string().trim().min(1).optional()),

  /** The Turnstile secret `siteverify` is asked with. Server-side only. */
  TURNSTILE_SECRET_KEY: blankAsAbsent(z.string().trim().min(1).optional()),

  /**
   * The hostnames a passing token may have been issued on, comma-separated
   * (`audit/turnstile.ts` compares siteverify's `hostname` against them).
   */
  TURNSTILE_HOSTNAMES: hostnameList('TURNSTILE_HOSTNAMES'),

  /**
   * The HMAC key each visitor's network is hashed under before their count is stored
   * (`audit/visitorAllowance.ts`). At least 32 characters, trimmed first, so that a
   * leaked collection cannot be reversed by trying every IPv4 address (decision 23).
   */
  AUDIT_IP_HASH_KEY: blankAsAbsent(
    z
      .string()
      .trim()
      .min(32, 'must be at least 32 characters (generate one with openssl rand -hex 32)')
      .optional(),
  ),

  /**
   * How many live reads one visitor may make in a UTC day on the public path, or
   * nothing for 5. Up to 1,000.
   */
  // Digits only, rather than `z.coerce.number()`, which reads " " as 0 and would
  // refuse every visitor on a value meant as blank.
  AUDIT_READS_PER_IP_PER_DAY: blankAsAbsent(
    z
      .string()
      .regex(/^\d+$/, 'AUDIT_READS_PER_IP_PER_DAY must be a whole number of reads, such as 5')
      .transform(Number)
      .pipe(z.number().max(1_000, 'AUDIT_READS_PER_IP_PER_DAY must be at most 1000'))
      .default(5),
  ),

  /**
   * What every live photo read is reserved and settled against, in dollars a month, or
   * nothing for 0, which turns live reads off. Up to $1,000.
   *
   * **Required in production wherever `ANTHROPIC_API_KEY` is set** (`loadEnv`, below), so
   * that a deployment that can spend the key has said how much. Outside production a
   * blank is 0, so a developer key in `.env` is never spent by accident.
   */
  AI_MONTHLY_BUDGET_USD: blankAsAbsent(dollars('AI_MONTHLY_BUDGET_USD').optional()),

  /**
   * How far ahead of an even pace one day may spend: today may reserve this many times an
   * even share of what is left of the month over the days left in it (`ledger.ts`). 3
   * unless set; 1 to 31, where 31 lets any one day spend the whole month.
   */
  AI_PACING_MULTIPLIER: blankAsAbsent(
    z
      .string()
      .regex(/^\d+(?:\.\d{1,6})?$/, 'AI_PACING_MULTIPLIER must be a number, such as 3')
      .transform(Number)
      .pipe(
        z
          .number()
          .min(1, 'AI_PACING_MULTIPLIER must be at least 1')
          .max(31, 'AI_PACING_MULTIPLIER must be at most 31'),
      )
      .default(3),
  ),

  /**
   * The least any day may spend, in dollars, so a month that is nearly spent still allows
   * a read or two a day until what is left runs out. $0.50 unless set; up to $1,000.
   */
  AI_DAILY_FLOOR_USD: blankAsAbsent(dollars('AI_DAILY_FLOOR_USD').default(0.5)),

  /**
   * How many saved labels one address may create in an hour, or nothing for
   * `DEFAULT_LABEL_WRITE_LIMITS.createsPerHour` (10).
   *
   * A setting for one reason: the end-to-end suite runs the production server,
   * reused between local runs, and saves a few labels from one address each run,
   * so it would meet the production figure on about the fourth run in an hour.
   * `playwright.config.ts` raises it. A deployment has no reason to.
   */
  // Digits only, for the reason `AUDIT_READS_PER_IP_PER_DAY` is; at least one, since a
  // limit of none would refuse every save with a message about going too fast.
  LABEL_CREATES_PER_HOUR: blankAsAbsent(
    z
      .string()
      .regex(/^\d+$/, 'must be a whole number of labels, such as 10')
      .transform(Number)
      .pipe(z.number().min(1).max(100_000))
      .optional(),
  ),

  /**
   * How many proxies sit in front of this server, or nothing for none.
   *
   * The per-client quotas read it (the audit route's, the exports', the saved-label
   * writes', and both of `/mcp`'s, which also use it to tell Anthropic's range from
   * everyone else), and getting it wrong breaks them in one of two directions.
   * Left unset behind a load balancer, every request appears to come from the
   * balancer and the hourly limit becomes one bucket shared by the world: blunt,
   * but it errs towards refusing. Set too high, a caller can forge
   * `X-Forwarded-For` and mint themselves a fresh bucket per request, which errs
   * towards allowing and is the worse of the two. So it is off unless stated, and
   * stated as a hop count rather than a boolean, because `trust proxy: true` is
   * the setting that makes forging work.
   */
  TRUST_PROXY_HOPS: blankAsAbsent(z.coerce.number().int().min(0).max(10).optional()),

  /**
   * The off switch for `/mcp`, which is on unless this says `false`.
   *
   * `true` and `false` and nothing else. `z.coerce.boolean()` would read the
   * string `'false'` as true, which is the one value this exists to accept.
   */
  MCP_ENABLED: blankAsAbsent(
    z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
  ),

  /**
   * Hostnames `/mcp` answers to besides localhost, comma-separated: the public
   * host, once there is one. Without it a deployed `/mcp` answers 403 to every
   * request — refusing rather than admitting, as `TRUST_PROXY_HOPS` does.
   */
  MCP_ALLOWED_HOSTS: hostnameList('MCP_ALLOWED_HOSTS'),

  /**
   * `Origin` hostnames `/mcp` admits besides localhost, comma-separated. A
   * request with no `Origin` always passes; see `mcp/routes.ts` for why the list
   * starts empty and how it is to be filled.
   */
  MCP_ALLOWED_ORIGINS: hostnameList('MCP_ALLOWED_ORIGINS'),
})

export type Env = z.infer<typeof EnvSchema>

/**
 * Every name this server reads out of the environment.
 *
 * Derived from the schema rather than listed beside it, so a field added above
 * cannot be forgotten here. `dotenv.ts` needs the list before the schema can
 * run, to decide which blanks to treat as absent.
 */
export const ENV_NAMES = Object.keys(EnvSchema.shape) as readonly (keyof Env)[]

/** The hosts on which production accepts Cloudflare's test keys. */
const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1']

/**
 * The schema, and the rules that span its fields. Applied here, not on `EnvSchema`, whose
 * `shape` `ENV_NAMES` reads and a refinement would hide. Without any of them the server
 * refuses to start, as it does without a database, so a deployment cannot go out with the
 * audit open to anyone, with no figure for what it may spend, or with a bot check that
 * checks nothing, by leaving a setting unset.
 */
const CheckedEnvSchema = EnvSchema.superRefine((env, context) => {
  const issue = (name: keyof Env, message: string) =>
    context.addIssue({ code: 'custom', path: [name], message })
  const production = env.NODE_ENV === 'production'
  const spendsTheKey = production && env.ANTHROPIC_API_KEY !== undefined

  // A production server that can spend the Anthropic key chooses a path, and states its budget.
  if (spendsTheKey && env.AUDIT_API_KEY === undefined && !env.AUDIT_PUBLIC) {
    issue(
      'AUDIT_API_KEY',
      'is required in production when ANTHROPIC_API_KEY is set, unless AUDIT_PUBLIC is true',
    )
  }
  if (spendsTheKey && env.AI_MONTHLY_BUDGET_USD === undefined) {
    issue(
      'AI_MONTHLY_BUDGET_USD',
      'is required in production when ANTHROPIC_API_KEY is set; 0 turns live reads off',
    )
  }

  if (!env.AUDIT_PUBLIC) return

  // The public path, in every environment: exclusive with the key, and complete.
  if (env.AUDIT_API_KEY !== undefined) {
    issue(
      'AUDIT_PUBLIC',
      'cannot be true while AUDIT_API_KEY is set: choose the public bot-checked path or the key',
    )
  }
  if (env.TURNSTILE_SITE_KEY === undefined) {
    issue('TURNSTILE_SITE_KEY', 'is required when AUDIT_PUBLIC is true')
  }
  if (env.TURNSTILE_SECRET_KEY === undefined) {
    issue('TURNSTILE_SECRET_KEY', 'is required when AUDIT_PUBLIC is true')
  }
  if (env.TURNSTILE_HOSTNAMES.length === 0) {
    issue('TURNSTILE_HOSTNAMES', 'is required when AUDIT_PUBLIC is true')
  }
  if (env.AUDIT_IP_HASH_KEY === undefined) {
    issue(
      'AUDIT_IP_HASH_KEY',
      'is required when AUDIT_PUBLIC is true, at least 32 characters: it keys the hash each ' +
        "visitor's count is stored under (generate one with openssl rand -hex 32)",
    )
  }

  if (!production) return

  // Production's public path: one proxy believed, and no test keys off a local host.
  if (env.TRUST_PROXY_HOPS !== 1) {
    issue(
      'TRUST_PROXY_HOPS',
      'must be exactly 1 in production when AUDIT_PUBLIC is true: one load balancer stands in ' +
        'front of the app, so 0 counts the load balancer instead of the visitor, and more than ' +
        '1 lets a visitor forge an X-Forwarded-For entry',
    )
  }
  // Decision 22. Cloudflare's test keys pass, or fail, every token without asking, so in
  // production they are accepted only where the only hosts are this machine.
  const onlyLocal = env.TURNSTILE_HOSTNAMES.every((host) => LOCAL_HOSTS.includes(host))
  const testKeyMessage =
    "is one of Cloudflare's test keys, which production accepts only when every " +
    'TURNSTILE_HOSTNAMES entry is localhost or 127.0.0.1'
  if (!onlyLocal && env.TURNSTILE_SITE_KEY === TEST_SITE_KEY) {
    issue('TURNSTILE_SITE_KEY', testKeyMessage)
  }
  if (
    !onlyLocal &&
    (env.TURNSTILE_SECRET_KEY === TEST_SECRET_PASSES ||
      env.TURNSTILE_SECRET_KEY === TEST_SECRET_FAILS)
  ) {
    issue('TURNSTILE_SECRET_KEY', testKeyMessage)
  }
})

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = CheckedEnvSchema.safeParse(source)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${detail}`)
  }
  return parsed.data
}
