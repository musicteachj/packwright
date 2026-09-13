import cors from 'cors'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { join } from 'node:path'
import { createLabelRouter } from './labels/routes'

export interface AppOptions {
  /** Suppresses request logging under test, where it is only noise. */
  enableLogging?: boolean
  /**
   * The built client to serve, or nothing to serve JSON alone.
   *
   * Passed in rather than resolved here, so that `createApp()` builds the same
   * application every time it is called. Resolving `apps/web/dist` internally
   * would make every route test depend on whether someone had run a web build —
   * `GET /nope` would 404 as JSON on a clean checkout and return the client's
   * `index.html` after a build, which is a suite that passes or fails on the
   * state of a gitignored directory. `server.ts` decides; tests state it.
   */
  webRoot?: string | undefined
}

/**
 * Paths the client must never be allowed to answer for.
 *
 * The history fallback below turns an unknown path into the client's entry
 * point, which is right for `/rules` and wrong for `/api/labels/nope`: an API
 * caller that mistypes a route needs its JSON 404, not a page of HTML with a 200
 * on it. `/api/` is the entry that does that work — `/api/labels` is a mounted
 * router, but nothing else under `/api/` is, so without this those paths reach
 * the fallback and come back as a page.
 *
 * `/health` is listed and is **currently unreachable**, because it is registered
 * as a route above and answered before the fallback is consulted. It is here
 * against a reordering rather than against a request: it is the ALB's liveness
 * probe, and a target group reading `index.html` as healthy would hold a broken
 * task in service. Nothing can test that, which is why it is written down.
 *
 * Matched by path segment rather than by string prefix, which this got wrong in
 * both directions at once. `startsWith('/api/')` missed bare `/api` — no
 * trailing slash, no match — so the one path most likely to be typed by hand
 * came back as the client with a 200 on it. And `startsWith('/health')` would
 * have swallowed any future client route beginning with those letters, 404ing
 * `/health-report` instead of serving the page.
 */
const RESERVED_FOR_THE_SERVER = ['/api', '/health']

const isReservedForTheServer = (path: string): boolean =>
  RESERVED_FOR_THE_SERVER.some((base) => path === base || path.startsWith(`${base}/`))

/**
 * Builds the Express application without starting a listener.
 *
 * Split from `server.ts` on purpose: Supertest can exercise the app directly,
 * so route tests need neither a port nor a running process.
 */
export function createApp(options: AppOptions = {}): Express {
  const { enableLogging = true, webRoot } = options
  const app = express()

  app.use(helmet())
  app.use(cors())
  // Generous, because a label audit posts a photograph.
  app.use(express.json({ limit: '10mb' }))
  if (enableLogging) app.use(morgan('combined'))

  /**
   * Liveness probe. The ALB target group polls this, so its shape is load
   * bearing — a 200 here is what keeps the ECS task in service.
   */
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
    })
  })

  app.use('/api/labels', createLabelRouter())

  /**
   * The built client, served from the same origin as the API it calls.
   *
   * Mounted *after* the routes above and *before* the 404 below, which is the
   * only position that works: ahead of the routes it would shadow them, behind
   * the 404 it would never be reached.
   */
  if (webRoot !== undefined) {
    // Vite fingerprints everything under `assets/`, so the filename changes
    // whenever the bytes do and the old name is never requested again. That is
    // what makes a year-long immutable cache safe, and serving them at the
    // default `max-age=0` instead spends a revalidation round trip per asset on
    // every load to be told nothing changed — which throws away the only thing
    // content hashing is for.
    app.use(
      '/assets',
      express.static(join(webRoot, 'assets'), { index: false, immutable: true, maxAge: '1y' }),
    )

    // `index: false` because the fallback below serves the entry point. Left on,
    // `express.static` answers `/` itself and the two would disagree about which
    // one owns the route. The entry point is deliberately *not* cached long: it
    // is the file that names the current hashed bundles, so a stale copy pins a
    // browser to a deployment that no longer exists.
    app.use(express.static(webRoot, { index: false }))

    app.use((request: Request, response: Response, next: NextFunction) => {
      // `createWebHistory` means a deep link is a real navigation: the browser
      // asks this server for `/rules`, not for `/#/rules`, so without a fallback
      // every route but `/` 404s on refresh.
      if (request.method !== 'GET' && request.method !== 'HEAD') return next()
      if (isReservedForTheServer(request.path)) return next()

      // A path whose last segment has a dot is asking for a file, and
      // `express.static` has already declined it — so the file is missing.
      // Answering that with `index.html` and a 200 turns a broken asset
      // reference into a page that half-loads and reports nothing, which is the
      // hardest kind of deploy fault to see. Let it fall through to the 404.
      const lastSegment = request.path.slice(request.path.lastIndexOf('/') + 1)
      if (lastSegment.includes('.')) return next()

      response.sendFile(join(webRoot, 'index.html'))
    })
  }

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' })
  })

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    // Never leak an internal message to the client; the detail goes to the logs,
    // which in production means CloudWatch.
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
