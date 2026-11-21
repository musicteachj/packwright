import { createApp } from './app'
import { databaseAllowance } from './audit/dailyAllowance'
import { createLedger } from './audit/ledger'
import { mongoLedgerStore } from './audit/ledgerStore'
import { usdToMicros } from './audit/pricing'
import { DEFAULT_AUDIT_LIMITS, type AuditSpend } from './audit/routes'
import { DEFAULT_LABEL_WRITE_LIMITS } from './labels/labelDocumentRoutes'
import { DEFAULT_EXPORT_LIMIT } from './labels/routes'
import { DEFAULT_MCP_LIMITS } from './mcp/routes'
import { liveExtractor, VISION_RESERVATION_MICROS } from './audit/extract'
import { connectToDatabase, databaseStatus } from './db'
import { loadDotenv } from './dotenv'
import { loadEnv } from './env'
import { resolveWebRoot } from './static'

// Loads .env before anything reads process.env. Declared as a dependency since
// the first commit but never actually imported, so a local .env was silently
// ignored and every optional secret read as absent. A no-op in the container,
// where the task definition supplies the environment directly.
//
// Called rather than imported for its side effect, because a blank variable
// already in the environment beats the file otherwise — see `dotenv.ts`.
loadDotenv()

const env = loadEnv()
const webRoot = resolveWebRoot()

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
    perDay: env.AUDIT_DAILY_LIMIT ?? DEFAULT_AUDIT_LIMITS.perDay,
  },
  // In the database, so a restart does not start the day again at zero.
  auditAllowance: databaseAllowance(),
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
          limits: DEFAULT_MCP_LIMITS,
        },
      }
    : {}),
})

app.listen(env.PORT, () => {
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
  }
  console.log(
    env.MCP_ENABLED
      ? `/mcp enabled, answering to localhost${env.MCP_ALLOWED_HOSTS.map((host) => `, ${host}`).join('')}`
      : '/mcp disabled by MCP_ENABLED',
  )
})
