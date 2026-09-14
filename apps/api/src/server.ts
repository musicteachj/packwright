// Loads .env before anything reads process.env. Declared as a dependency since
// the first commit but never actually imported, so a local .env was silently
// ignored and every optional secret read as absent. A no-op in the container,
// where the task definition supplies the environment directly.
import 'dotenv/config'

import { createApp } from './app'
import { connectToDatabase, databaseStatus } from './db'
import { loadEnv } from './env'
import { resolveWebRoot } from './static'

const env = loadEnv()
const webRoot = resolveWebRoot()

// Before `listen`, so a server accepting requests is a server with a database.
// The alternative is a task that reports healthy and then fails under traffic,
// which is what `env.ts` refuses at startup and what this completes.
await connectToDatabase(env.MONGODB_URI)

const app = createApp({ enableLogging: env.NODE_ENV !== 'test', webRoot, databaseStatus })

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
})
