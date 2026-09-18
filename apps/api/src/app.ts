import compression from 'compression'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { join } from 'node:path'
import { createAuditRouter, type AuditLimits } from './audit/routes'
import { createLabelDocumentRouter } from './labels/labelDocumentRoutes'
import { createLabelRouter, type ExportLimit } from './labels/routes'
import type { ExtractLabel } from './audit/extract'
import type { DatabaseStatus } from './db'

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
  /**
   * How the database is doing, asked rather than looked up.
   *
   * Injected for the same reason `webRoot` is: `createApp` builds the same
   * application every time it is called, and importing mongoose here would make
   * every route test that asks about a PDF depend on a live connection. Absent
   * means "this app was built without a database", which is what those tests
   * are.
   */
  databaseStatus?: (() => DatabaseStatus) | undefined
  /**
   * How a label photograph is read, or nothing to serve the rest without it.
   *
   * Injected for the reason its two neighbours are, and for one more of its
   * own: constructing an Anthropic client here would make `createApp` need an
   * API key, and every route test in this workspace would then depend on a
   * secret to build an application that never calls out. Absent means the audit
   * endpoint answers 503 and nothing else changes — which is the behaviour
   * `ANTHROPIC_API_KEY` staying optional in `env.ts` is there to allow.
   */
  extract?: ExtractLabel | undefined
  /**
   * The shared secret the audit route requires, or nothing to require none.
   *
   * Injected for the reason `extract` is: reading it here would make every
   * route test in this workspace depend on the environment to build an
   * application that checks nothing.
   */
  auditApiKey?: string | undefined
  /**
   * The audit route's quotas, or `false` to enforce none.
   *
   * Stated rather than defaulted from `NODE_ENV`, because this factory builds
   * the same application every time it is called and an application that
   * quietly drops its own spending limits under one environment variable is not
   * the same application. `server.ts` passes the defaults; a test that is not
   * about the quotas passes `false`.
   */
  auditLimits?: AuditLimits | false | undefined
  /**
   * What one client may export in an hour, or `false` for no limit.
   *
   * Stated rather than defaulted for the reason `auditLimits` is: this factory
   * builds the same application every time it is called, and a test that renders
   * a dozen PDFs is not making a statement about production quotas.
   */
  exportLimit?: ExportLimit | false | undefined
  /**
   * How many proxies sit in front of this server. See `TRUST_PROXY_HOPS`.
   *
   * Nothing means none, which is the safe reading: the per-client quota then
   * keys on the socket address, and behind an unconfigured proxy that is one
   * shared bucket rather than a forgeable one.
   */
  trustProxyHops?: number | undefined
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
 * The client errors a library can hand this server, in this server's own words.
 *
 * A map rather than a status range, because a range needs a sentence for every
 * status in it and there is only one honest sentence per status. An earlier
 * version answered any 4xx and worded all of them "Bad request", so a
 * body-parser 415 — an unsupported `Content-Encoding`, which is a real thing a
 * client can send — came back with a status about the encoding and a sentence
 * about the body. Anything not listed here is an error this server has not
 * accounted for and stays a 500 with its detail in the log.
 *
 * These are the three `body-parser` raises: `entity.parse.failed`,
 * `entity.too.large` and `encoding.unsupported`.
 */
const CLIENT_ERRORS: Readonly<Record<number, string>> = {
  400: 'Bad request',
  413: 'The request body is too large',
  415: 'The request encoding is not supported',
}

/** What a label document may weigh as JSON. See the note where these are mounted. */
const BODY_LIMIT = '256kb'
/** What the audit route may weigh, because it carries a photograph. */
const AUDIT_BODY_LIMIT = '10mb'

/**
 * A client-error status an upstream library has already worked out, or nothing.
 *
 * Express and body-parser both set `status`; some libraries set `statusCode`
 * instead. Read as `unknown` and checked rather than cast, because this runs on
 * the error path and a wrong assumption here turns one failure into two.
 */
function statusOf(error: Error): number | undefined {
  const carried = error as { status?: unknown; statusCode?: unknown }
  const status = typeof carried.status === 'number' ? carried.status : carried.statusCode
  if (typeof status !== 'number') return undefined
  return Object.hasOwn(CLIENT_ERRORS, status) ? status : undefined
}

/**
 * Builds the Express application without starting a listener.
 *
 * Split from `server.ts` on purpose: Supertest can exercise the app directly,
 * so route tests need neither a port nor a running process.
 */
export function createApp(options: AppOptions = {}): Express {
  const {
    enableLogging = true,
    webRoot,
    databaseStatus,
    extract,
    auditApiKey,
    auditLimits,
    exportLimit,
    trustProxyHops,
  } = options
  const app = express()

  /**
   * Who to believe about a client's address, and why the default is nobody.
   *
   * Express trusts no proxy unless told to, so `request.ip` is the socket's
   * peer — the load balancer, in a deployment that has one. The audit route's
   * per-client quota then treats the world as one caller, which is blunt but
   * refuses rather than admits. Setting `trust proxy` to `true` instead would
   * make Express believe whatever `X-Forwarded-For` says, and a caller who can
   * write that header can mint a fresh quota for every request. A hop count is
   * the only form of this setting that is safe to hold: it reads exactly that
   * many addresses from the right, which are the ones a proxy it is behind
   * appended.
   */
  if (trustProxyHops !== undefined) app.set('trust proxy', trustProxyHops)

  /**
   * helmet's defaults, with one directive widened and the reason recorded.
   *
   * `script-src 'self'` forbids `WebAssembly.instantiate`, and the barcode
   * scanner is zxing compiled to WebAssembly — the engine most people who ever
   * scan with this will run, since `BarcodeDetector` is Chromium-only and every
   * browser on iOS is WebKit. Without this the camera opens, the module fails to
   * instantiate, and nothing reads.
   *
   * **`'wasm-unsafe-eval'` and not `'unsafe-eval'`.** They look interchangeable
   * and are not: the second re-enables `eval` and `new Function` for the entire
   * application, which is the grant this policy exists to withhold. The first
   * permits WebAssembly compilation and nothing else.
   *
   * Everything else is left alone deliberately. The client was confirmed to run
   * clean under the untouched defaults when it was first served from this server,
   * so each directive still carries its weight and any further widening should
   * have to argue for itself the way this one did.
   */
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'", "'wasm-unsafe-eval'"],
        },
      },
    }),
  )

  /**
   * There is deliberately no CORS middleware here, and re-adding one would be a
   * regression rather than a convenience.
   *
   * Nothing in this application makes a cross-origin request. In development
   * Vite proxies `/api` and `/health` to this server, so the browser sees one
   * origin; in production this server *is* the origin, because it serves the
   * client itself. `cors()` was mounted at its defaults, which answers every
   * request with `Access-Control-Allow-Origin: *` — an invitation to any page on
   * the internet to call this API from a visitor's browser, issued to solve a
   * problem neither mode has.
   *
   * It cost little while the API was stateless: a wildcard on an endpoint that
   * takes JSON and returns a PDF is an open service rather than an exposure. It
   * stops being cheap at the two things next on the roadmap — saved labels, which
   * put user data behind these routes, and the vision endpoint, which spends
   * money per call behind a key. Closing it now is one line; closing it after
   * either of those is a migration.
   *
   * If some future client genuinely does live on another origin, the answer is an
   * explicit allowlist of that origin, never the default.
   */

  /**
   * Compressed on the way out, except where it would be work for nothing.
   *
   * The client is served from this process, and its largest asset is about
   * 934 KB of barcode encoder that gzip takes to roughly a quarter of that. The
   * default `filter` already skips anything already-compressed by content type,
   * and a PDF is deflated internally by PDFKit before it ever reaches here — so
   * the exports, which are the biggest responses this API produces, are excluded
   * rather than spending CPU to grow by a percent.
   *
   * Mounted before every route, because a response passes back out through the
   * middleware it came in past. After `helmet`, which only sets headers.
   */
  app.use(
    compression({
      filter: (request, response) => {
        const type = response.getHeader('Content-Type')
        if (typeof type === 'string' && type.includes('application/pdf')) return false
        return compression.filter(request, response)
      },
    }),
  )

  /**
   * Ten megabytes for the one route that posts a photograph, and a fortieth of
   * that for everything else.
   *
   * The generous figure used to be global, which meant every route on this server
   * would buffer and parse ten megabytes before anything looked at it — including
   * the ones that take a label document, which is a few kilobytes of JSON, and
   * including the audit route's own guards, so a request they were about to
   * refuse had already been read in full.
   *
   * Mounted narrow-first: `body-parser` steps over a request another parser has
   * already finished — `onFinished.isFinished`, since 2.x dropped the `_body`
   * flag it used to set — so `/api/audit` gets the large limit and nothing else
   * can reach it. A label document that genuinely needs more than
   * 256 KB of JSON does not exist — the largest field is an ingredient list —
   * and a request that claims to is one worth refusing before it is read.
   */
  app.use('/api/audit', express.json({ limit: AUDIT_BODY_LIMIT }))
  app.use(express.json({ limit: BODY_LIMIT }))

  if (enableLogging) app.use(morgan('combined'))

  /**
   * Liveness probe. The ALB target group polls this, so its shape is load
   * bearing — a 200 here is what keeps the ECS task in service.
   */
  app.get('/health', (_req: Request, res: Response) => {
    const database = databaseStatus?.()
    // A probe that answers 200 without a database holds a broken task in
    // service, which is the one thing this endpoint exists to prevent. With
    // MONGODB_URI required a booted server has a connection; one lost afterwards
    // is the state worth reporting.
    const healthy = database === undefined || database === 'connected'
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      ...(database === undefined ? {} : { database }),
      uptimeSeconds: Math.round(process.uptime()),
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
    })
  })

  // The saved-label routes first: their paths are the shorter ones, and nothing
  // about either mount shadows the other.
  app.use('/api/labels', createLabelDocumentRouter())
  app.use('/api/labels', createLabelRouter({ limit: exportLimit }))
  app.use('/api/audit', createAuditRouter({ extract, apiKey: auditApiKey, limits: auditLimits }))

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
    // A body-parser failure is the client's, and it already knows its own
    // status. Flattening it to 500 told a caller the server had broken when
    // what had happened was that they sent 11 MB — verified by posting exactly
    // that and getting `Internal server error` back, with
    // `type: 'entity.too.large'` underneath it. No route had posted anything
    // large enough to reach this before; `/api/audit` will, from every phone.
    //
    // Only 4xx is honoured. A library reporting a 5xx of its own is still an
    // error this server has not accounted for, and the message stays in the log
    // where it cannot leak.
    //
    // Not logged, either. `morgan` already records the request, and a stack
    // trace for every oversized upload turns the one signal this log carries —
    // that something here is broken — into noise.
    const status = statusOf(error)
    if (status !== undefined) {
      res.status(status).json({ error: CLIENT_ERRORS[status] })
      return
    }

    // Never leak an internal message to the client; the detail goes to the logs,
    // which in production means CloudWatch.
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
