import { z } from 'zod'

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
   */
  MONGODB_URI: blankAsAbsent(
    z
      .string()
      .regex(
        /^mongodb(\+srv)?:\/\/\S/,
        'MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string',
      ),
  ),

  /**
   * Server-side only, always. This key must never reach the browser bundle —
   * which is why vision extraction lives in this app rather than in the client.
   */
  ANTHROPIC_API_KEY: optionalSecret,

  /**
   * A shared secret the audit route requires, or nothing to require none.
   *
   * Server-side only, like the key above and for a sharper reason: the audit
   * route spends `ANTHROPIC_API_KEY` on every call, so this is what stands
   * between an open origin and somebody else's bill. Set it and the route is
   * shut to everything that cannot present it — including this project's own
   * browser client unless the person using it types the key in, which the
   * audit page asks for. **Required in production wherever `ANTHROPIC_API_KEY`
   * is set** (`loadEnv`, below), since 2026-10-18: the quotas alone left a budget
   * shared by every anonymous caller, which enough addresses can always spend
   * (`docs/security-review-2026-10-18.md`, James's decision).
   */
  // Trimmed, as the audit page trims what is typed, so a key pasted into a console
  // with a trailing newline is still one a person can match.
  AUDIT_API_KEY: blankAsAbsent(z.string().trim().min(1).optional()),

  /**
   * How many vision calls the audit route may make in a UTC day, across the
   * deployment, or nothing for `DEFAULT_AUDIT_LIMITS.perDay` (10).
   *
   * A setting so that it can follow the Anthropic workspace's monthly spend limit
   * down without a release: at about $0.13 a call, a day's figure should be a small
   * fraction of that month's. Zero turns live audits off.
   */
  // Digits only, rather than `z.coerce.number()`, which reads " " as 0 and would
  // turn the audit off on a value meant as blank.
  AUDIT_DAILY_LIMIT: blankAsAbsent(
    z
      .string()
      .regex(/^\d+$/, 'must be a whole number of calls, such as 10')
      .transform(Number)
      .pipe(z.number().max(10_000))
      .optional(),
  ),

  /**
   * How many saved labels one address may create in an hour, or nothing for
   * `DEFAULT_LABEL_WRITE_LIMITS.createsPerHour` (10).
   *
   * A setting for one reason: the end-to-end suite runs the production server,
   * reused between local runs, and saves a few labels from one address each run,
   * so it would meet the production figure on about the fourth run in an hour.
   * `playwright.config.ts` raises it. A deployment has no reason to.
   */
  // Digits only, for the reason `AUDIT_DAILY_LIMIT` is; at least one, since a
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

/**
 * The schema, and the one rule that spans two of its fields: a production server
 * that can spend the Anthropic key must ask for the audit key. Without it the
 * server refuses to start, as it does without a database, so a deployment cannot go
 * out with the audit open to anyone by leaving a secret unset. Applied here, not
 * on `EnvSchema`, whose `shape` `ENV_NAMES` reads and a refinement would hide.
 */
const CheckedEnvSchema = EnvSchema.superRefine((env, context) => {
  if (
    env.NODE_ENV === 'production' &&
    env.ANTHROPIC_API_KEY !== undefined &&
    env.AUDIT_API_KEY === undefined
  ) {
    context.addIssue({
      code: 'custom',
      path: ['AUDIT_API_KEY'],
      message:
        'is required in production when ANTHROPIC_API_KEY is set, so that only the people ' +
        'given the key can spend it on the photo audit',
    })
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
