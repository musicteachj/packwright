// Loads .env before anything reads process.env. Declared as a dependency since
// the first commit but never actually imported, so a local .env was silently
// ignored and every optional secret read as absent. A no-op in the container,
// where the task definition supplies the environment directly.
import 'dotenv/config'

import { createApp } from './app'
import { loadEnv } from './env'

const env = loadEnv()
const app = createApp({ enableLogging: env.NODE_ENV !== 'test' })

app.listen(env.PORT, () => {
  console.log(`packwright api listening on :${env.PORT} (${env.NODE_ENV})`)
})
