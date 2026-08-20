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

  /** Optional until persistence lands. Injected from Secrets Manager in production. */
  MONGODB_URI: optionalSecret,

  /**
   * Server-side only, always. This key must never reach the browser bundle —
   * which is why vision extraction lives in this app rather than in the client.
   */
  ANTHROPIC_API_KEY: optionalSecret,
})

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${detail}`)
  }
  return parsed.data
}
