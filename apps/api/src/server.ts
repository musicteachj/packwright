import { createApp } from './app'
import { loadEnv } from './env'

const env = loadEnv()
const app = createApp({ enableLogging: env.NODE_ENV !== 'test' })

app.listen(env.PORT, () => {
  console.log(`packwright api listening on :${env.PORT} (${env.NODE_ENV})`)
})
