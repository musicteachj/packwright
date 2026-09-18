import { createApp } from './app'
import { DEFAULT_AUDIT_LIMITS } from './audit/routes'
import { DEFAULT_EXPORT_LIMIT } from './labels/routes'
import { extractGhsLabel, sendThrough, visionClient, type ExtractLabel } from './audit/extract'
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

/**
 * Vision extraction, if this deployment has a key for it.
 *
 * Optional on purpose. `MONGODB_URI` was made required in phase 6 and broke
 * every harness that boots the server; this key has an external service and a
 * cost per call behind it, so the same move would be worse. Without one the
 * audit endpoint answers 503 and the rest of the application is untouched.
 */
const extract: ExtractLabel | undefined =
  env.ANTHROPIC_API_KEY === undefined
    ? undefined
    : (() => {
        const send = sendThrough(visionClient(env.ANTHROPIC_API_KEY))
        return (photo, regime) => extractGhsLabel(send, photo, regime)
      })()

const app = createApp({
  enableLogging: env.NODE_ENV !== 'test',
  webRoot,
  databaseStatus,
  extract,
  // The quotas are stated here rather than defaulted inside `createApp`, which
  // builds the same application every time it is called. This is the only place
  // that knows it is a real server rather than a test harness, so it is the
  // place that decides what the route may spend.
  auditLimits: DEFAULT_AUDIT_LIMITS,
  exportLimit: DEFAULT_EXPORT_LIMIT,
  ...(env.AUDIT_API_KEY === undefined ? {} : { auditApiKey: env.AUDIT_API_KEY }),
  ...(env.TRUST_PROXY_HOPS === undefined ? {} : { trustProxyHops: env.TRUST_PROXY_HOPS }),
})

app.listen(env.PORT, () => {
  console.log(`packwright api listening on :${env.PORT} (${env.NODE_ENV})`)
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
})
