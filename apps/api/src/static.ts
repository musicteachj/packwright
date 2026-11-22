/**
 * Where the built client lives, from whatever is running.
 *
 * Production is a single artifact: `apps/web` compiles to static assets and this
 * server serves them, so there is one container rather than two. That is the
 * assumption phase 8's deployment rests on, and it is checked here and in
 * `scripts/verify-build.sh` rather than discovered on the first deploy.
 *
 * The candidate list is deliberate and is the same shape as `renderPdf.ts`'s
 * `resolveFontDir`, for the same reason: a single relative path cannot serve both
 * the source tree and the bundle. That exact bug already shipped once here — the
 * font directory resolved four levels up from `src/labels/`, which is right from
 * source and points outside the repository from `dist/server.js`, and all 283
 * tests passed while `npm start` answered its first export with an ENOENT 500.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Env } from './env'

/** The file every candidate must contain to be a client build at all. */
const ENTRY = 'index.html'

/**
 * The built client, or `undefined` when there is not one.
 *
 * Absent is an ordinary state rather than an error: the API is a working JSON
 * server without a client build in front of it, which is what `npm run dev`
 * serves while Vite hosts the client on its own port and proxies across. Throwing
 * here would make the API refuse to start for anyone who had not run a web build.
 */
export function resolveWebRoot(): string | undefined {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const candidates = [
    // Bundled: the api build copies the client beside server.js. A container
    // image ships `dist/` alone, so this is the only one that can match there.
    join(here, 'public'),
    // Running from source, via tsx or vitest, where the client build sits in its
    // own workspace and has not been copied anywhere.
    join(here, '../../web/dist'),
  ]

  return candidates.find((candidate) => existsSync(join(candidate, ENTRY)))
}

/**
 * The client build production cannot start without.
 *
 * Absent is ordinary in development, as `resolveWebRoot` says. In production it is
 * the whole deployment being wrong: one container that serves the API but not the
 * client answers every page with a JSON 404 while its health checks pass, so the
 * process refuses to start, where the log says why, rather than run that way.
 */
export function requireWebRoot(
  nodeEnv: Env['NODE_ENV'],
  webRoot: string | undefined,
): string | undefined {
  if (nodeEnv === 'production' && webRoot === undefined) {
    throw new Error(
      'NODE_ENV is production and no client build was found: `npm run build` copies ' +
        'apps/web/dist into apps/api/dist/public, and production serves it from there',
    )
  }
  return webRoot
}
