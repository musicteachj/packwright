import { createApp } from './app'
import { createLedger } from './audit/ledger'
import { mongoLedgerStore } from './audit/ledgerStore'
import { usdToMicros } from './audit/pricing'
import { DEFAULT_AUDIT_LIMITS, type AuditSpend } from './audit/routes'
import { siteverify } from './audit/turnstile'
import { databaseVisitorAllowance } from './audit/visitorAllowance'
import { DEFAULT_LABEL_WRITE_LIMITS } from './labels/labelDocumentRoutes'
import { DEFAULT_EXPORT_LIMIT } from './labels/routes'
import { DEFAULT_MCP_LIMITS } from './mcp/routes'
import { liveExtractor, VISION_RESERVATION_MICROS } from './audit/extract'
import { connectToDatabase, databaseStatus, disconnectFromDatabase } from './db'
import { loadDotenv } from './dotenv'
import { loadEnv } from './env'
import { configureTimeouts, shutDownGracefully } from './httpServer'
import { requireWebRoot, resolveWebRoot } from './static'

// Loads .env before anything reads process.env. Declared as a dependency since
// the first commit but never actually imported, so a local .env was silently
// ignored and every optional secret read as absent. A no-op in the container,
// where the task definition supplies the environment directly.
//
// Called rather than imported for its side effect, because a blank variable
// already in the environment beats the file otherwise — see `dotenv.ts`.
loadDotenv()

const env = loadEnv()
// Production without its client build refuses to start, here, before it connects to
// anything; see `requireWebRoot`.
const webRoot = requireWebRoot(env.NODE_ENV, resolveWebRoot())

// Before `listen`, so a server accepting requests is a server with a database.
// The alternative is a task that reports healthy and then fails under traffic,
// which is what `env.ts` refuses at startup and what this completes.
await connectToDatabase(env.MONGODB_URI)

/** Vision extraction, if this deployment has a key for it. See `liveExtractor`. */
const extract =
  env.ANTHROPIC_API_KEY === undefined ? undefined : liveExtractor(env.ANTHROPIC_API_KEY)

/**
 * What every live read reserves and settles against, in the database so that a restart does not
 * start the month again. Blank is 0 outside production, which turns live reads off; production
 * with a key refuses to start without a figure (`env.ts`).
 */
const monthlyBudgetUsd = env.AI_MONTHLY_BUDGET_USD ?? 0
const auditSpend: AuditSpend | undefined =
  extract === undefined
    ? undefined
    : {
        ledger: createLedger(mongoLedgerStore(), {
          monthlyBudgetMicros: usdToMicros(monthlyBudgetUsd),
          pacingMultiplier: env.AI_PACING_MULTIPLIER,
          dailyFloorMicros: usdToMicros(env.AI_DAILY_FLOOR_USD),
        }),
        reservationMicros: VISION_RESERVATION_MICROS,
      }

const app = createApp({
  enableLogging: env.NODE_ENV !== 'test',
  webRoot,
  databaseStatus,
  extract,
  auditSpend,
  // The quotas are stated here rather than defaulted inside `createApp`, which
  // builds the same application every time it is called. This is the only place
  // that knows it is a real server rather than a test harness, so it is the
  // place that decides what the route may spend.
  auditLimits: {
    perHour: DEFAULT_AUDIT_LIMITS.perHour,
    perVisitorPerDay: env.AUDIT_READS_PER_IP_PER_DAY,
    statusPerMinute: DEFAULT_AUDIT_LIMITS.statusPerMinute,
  },
  // The public path only (decision 1): key mode gets no visitors, so it is never counted per
  // visitor. `loadEnv` has refused AUDIT_PUBLIC without every setting read here, so the `!`s
  // state what it checked. The count is in the database, so a restart does not give every
  // visitor their day again.
  ...(env.AUDIT_PUBLIC
    ? {
        auditTurnstile: {
          siteKey: env.TURNSTILE_SITE_KEY!,
          verify: siteverify({
            secretKey: env.TURNSTILE_SECRET_KEY!,
            hostnames: env.TURNSTILE_HOSTNAMES,
          }),
        },
        auditVisitors: {
          allowance: databaseVisitorAllowance(),
          ipHashKey: env.AUDIT_IP_HASH_KEY!,
        },
      }
    : {}),
  exportLimit: DEFAULT_EXPORT_LIMIT,
  labelWriteLimits: {
    ...DEFAULT_LABEL_WRITE_LIMITS,
    createsPerHour: env.LABEL_CREATES_PER_HOUR ?? DEFAULT_LABEL_WRITE_LIMITS.createsPerHour,
  },
  ...(env.AUDIT_API_KEY === undefined ? {} : { auditApiKey: env.AUDIT_API_KEY }),
  ...(env.TRUST_PROXY_HOPS === undefined ? {} : { trustProxyHops: env.TRUST_PROXY_HOPS }),
  ...(env.MCP_ENABLED
    ? {
        mcp: {
          allowedHosts: env.MCP_ALLOWED_HOSTS,
          allowedOrigins: env.MCP_ALLOWED_ORIGINS,
          limits: {
            ...DEFAULT_MCP_LIMITS,
            anthropicPerHour:
              env.MCP_ANTHROPIC_CALLS_PER_HOUR ?? DEFAULT_MCP_LIMITS.anthropicPerHour,
          },
        },
      }
    : {}),
})

const server = app.listen(env.PORT, () => {
  console.log(`Packwright API listening on :${env.PORT} (${env.NODE_ENV})`)
  // Said out loud because the two modes look identical from the outside until a
  // request arrives. In production the absence of a client build is the whole
  // deployment being wrong, and a line in the log is how that gets noticed
  // before a user does.
  console.log(
    webRoot === undefined
      ? 'no client build found — serving the API only'
      : `serving the client from ${webRoot}`,
  )
  // Said out loud for the same reason: from the outside, an unconfigured key
  // and a working one are indistinguishable until somebody photographs a label.
  console.log(
    extract === undefined
      ? 'no ANTHROPIC_API_KEY — /api/audit will answer 503'
      : 'vision extraction configured',
  )
  if (auditSpend !== undefined) {
    console.log(`live photo reads: $${monthlyBudgetUsd} a month (0 means off)`)
    console.log(
      env.AUDIT_PUBLIC
        ? 'live photo reads are public, behind Turnstile'
        : 'live photo reads need AUDIT_API_KEY',
    )
  }
  console.log(
    env.MCP_ENABLED
      ? `/mcp enabled, answering to localhost${env.MCP_ALLOWED_HOSTS.map((host) => `, ${host}`).join('')}`
      : '/mcp disabled by MCP_ENABLED',
  )
})

// Keep-alive past the load balancer's idle timeout; see `httpServer.ts`.
configureTimeouts(server)

/**
 * A stop that finishes the requests in flight and closes the database, then exits.
 *
 * ECS sends SIGTERM and kills the process 30 s later by default; the compose file
 * (`stop_grace_period: 30s`) and `verify-image.sh` (`docker stop -t 30`) give it
 * the same 30 s, while a bare `docker stop` kills after 10 s. The kernel does not
 * apply a signal's default action to PID 1 unless the process handles the signal,
 * so without this handler the container ignored SIGTERM, sat out the whole wait
 * and was killed with 137, dropping whatever was in flight.
 *
 * At 25 s (`SHUTDOWN_GRACE_MS`) the connections still open are cut; the process
 * then exits once the database has closed, which nothing bounds, so a database
 * slow to disconnect can still meet the runtime's kill.
 *
 * `once`, so a second signal of the same kind during the stop falls through to the
 * default. From a terminal that ends the process at once, so Ctrl-C twice still
 * works. As PID 1 the second SIGTERM is ignored, but a second `docker stop` still
 * kills the process when its own timeout runs out (at once with `-t 0`). A second
 * signal of the other kind runs the other handler and starts a second stop, which
 * can fail (the server is already closing) and exit 1 before the first has finished.
 */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    console.log(`stopping: finishing requests in flight (${signal})`)
    shutDownGracefully(server, disconnectFromDatabase).then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(error)
        process.exit(1)
      },
    )
  })
}
