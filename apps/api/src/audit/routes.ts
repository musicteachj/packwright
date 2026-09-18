/**
 * `POST /api/audit/ghs` — a photograph in, an unverified reading out.
 *
 * Nothing this route returns is label data. It returns an `ExtractionResult`,
 * every field of which is unconfirmed until a user says otherwise, and it
 * returns no verdict of any kind: the rules run later, in the client, against
 * what the user confirmed.
 *
 * The extractor is injected rather than constructed here, for the reason
 * `AppOptions` gives about `webRoot` and `databaseStatus` — `createApp()` builds
 * the same application every time it is called, so a route test needs neither a
 * key nor a network. Absent, the route answers 503 and the rest of the server is
 * unaffected. That is deliberate: `MONGODB_URI` was made load-bearing in phase 6
 * and broke every harness that boots the server, and this key has an external
 * service and a per-call cost behind it.
 */

import { createHash, timingSafeEqual } from 'node:crypto'

import Anthropic from '@anthropic-ai/sdk'
import { GHS_REGIMES } from '@packwright/label-core'
import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import {
  ExtractionDeclined,
  ExtractionTruncated,
  ExtractionUnreadable,
  PHOTO_MEDIA_TYPES,
  type ExtractLabel,
} from './extract'

/**
 * The largest image this route will forward, in base64 characters.
 *
 * **Deliberately below `express.json`'s body limit, so that it can fire.** The
 * first figure written here was 10 MB — the vision API's own per-image
 * ceiling — and it was unreachable: a 10 MB base64 string inside a JSON
 * envelope exceeds a 10 MB body before the handler sees it, so the body limit
 * answered first and this branch could never run. A check that cannot fail is
 * the defect this codebase has found in a validator, a template field and a
 * rule, and it would have been one here too.
 *
 * 8 MB clears both readings of the upstream limit — whether its "10 MB" counts
 * 10,000,000 bytes or 10,485,760 — and is enormous for the traffic this route
 * expects, since the client caps the long edge at 2576 px and encodes JPEG,
 * which lands between one and two megabytes.
 */
export const MAX_PHOTO_BASE64 = 8 * 1024 * 1024

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * What one client may spend in an hour, and what this process may spend in a day.
 *
 * Every call here reaches a paid vision API on a key the server holds, so an
 * unprotected route does not cost a slow server — it costs somebody else's
 * money, and it does so quietly, because nothing about a spent quota looks like
 * an incident until the bill arrives.
 *
 * **Two windows, because they answer different questions.** The hourly figure is
 * per client and asks whether one caller is going too fast; a person auditing
 * labels by hand takes minutes over each photograph, so twenty in an hour is
 * generous for the work and useless for a script. The daily figure is
 * process-wide and asks what this deployment can lose in a day whatever the
 * traffic looks like — it is the only one of the two that still holds when
 * client addresses cannot be told apart, which is the usual case behind a proxy
 * that has not been configured for. See `trustProxyHops` in `AppOptions`.
 *
 * Both are deliberately small. Raising a limit is a decision somebody makes on
 * purpose; discovering one was never there is not.
 */
export const DEFAULT_AUDIT_LIMITS = { perHour: 20, perDay: 200 } as const

export interface AuditLimits {
  /** Requests per client per hour. */
  perHour: number
  /** Requests per process per day, whatever the client. */
  perDay: number
}

/** The header a configured key is presented in. */
export const AUDIT_KEY_HEADER = 'x-audit-key'

/**
 * Whether the request presents the configured key.
 *
 * Both sides are hashed before the comparison rather than compared directly.
 * `timingSafeEqual` throws on a length mismatch, so comparing the raw strings
 * would need a length check first — and that check answers faster than a wrong
 * key of the right length, which tells an attacker the length. Two SHA-256
 * digests are always 32 bytes, so there is nothing to compare first and nothing
 * to learn from how long it took.
 */
/**
 * What this process may still spend today, counted in calls rather than requests.
 *
 * Deliberately not an `express-rate-limit` bucket, which the first two attempts
 * at this were. A limiter counts *requests*, and the daily figure is a budget —
 * it is denominated in money, and money is spent at the moment `extract` is
 * called and at no other. Counting requests instead meant a malformed body, an
 * oversized image or a 503 from an unconfigured server each drew down the day,
 * so a caller sending nothing but rubbish could exhaust a deployment's whole
 * allowance and lock out every real caller until the window turned. Counting
 * calls also keeps the other half honest: a reading the vision API declines
 * comes back 422, and the model still ran, so that *is* spend and is counted.
 *
 * A fixed window, like the limiter's, and in memory, like the limiter's — see
 * `docs/BACKLOG.md` on what that means for more than one container.
 */
function dailyAllowance(limit: number) {
  let windowStartedAt = Date.now()
  let spent = 0
  return {
    /** Takes one call from today's allowance, or refuses. */
    take(): boolean {
      const now = Date.now()
      if (now - windowStartedAt >= DAY_MS) {
        windowStartedAt = now
        spent = 0
      }
      if (spent >= limit) return false
      spent += 1
      return true
    },
  }
}

function keyAccepted(presented: unknown, expected: string): boolean {
  if (typeof presented !== 'string') return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(presented), digest(expected))
}

const AuditRequest = z.object({
  regime: z.enum(GHS_REGIMES),
  image: z.object({
    mediaType: z.enum(PHOTO_MEDIA_TYPES),
    data: z.string().min(1),
  }),
})

/** The export routes' error shape, so the API has one contract for a bad body. */
const badRequest = (
  response: Response,
  issues: readonly { path: PropertyKey[]; message: string }[],
) =>
  response.status(400).json({
    error: 'Invalid audit request',
    detail: issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  })

export interface AuditRouterOptions {
  extract?: ExtractLabel | undefined
  /**
   * The shared secret this route requires, or nothing to require none.
   *
   * Optional because the route has to keep working for a deployment that has
   * not set one, and **required the moment it is set** — a key that is checked
   * only when the caller offers one is not a key. It is not a substitute for
   * authentication: the client is served from this same origin, so a browser
   * that could send the key would be shipping it to everyone who loads the
   * page. It shuts the route to everything *except* a browser, which is what a
   * private deployment wants and a public one cannot have.
   */
  apiKey?: string | undefined
  /**
   * The quotas to enforce, or `false` for none.
   *
   * Stated rather than defaulted, because `createApp` builds the same
   * application every time it is called and a limiter that switched itself off
   * by sniffing `NODE_ENV` would break that. Tests that are not about the
   * limits pass `false`; the ones that are pass small numbers.
   */
  limits?: AuditLimits | false | undefined
}

export function createAuditRouter(options: AuditRouterOptions = {}): Router {
  const router = Router()
  const { extract, apiKey, limits } = options

  // **Order is the whole of this.** Each guard is cheap to state and the sequence
  // is what makes them add up, so it is written out rather than assembled where
  // it happens to read well.
  const guards: RequestHandler[] = []
  const today = limits === false || limits === undefined ? undefined : dailyAllowance(limits.perDay)

  // 1. The per-client hourly bucket, first, so that guessing at the key costs
  //    the guesser something. `express-rate-limit` writes its own 429 rather
  //    than passing an error along, which matters: `app.ts`'s handler maps
  //    exactly 400, 413 and 415, so a 429 arriving through `next(error)` would
  //    reach the caller as 500.
  if (limits !== false && limits !== undefined) {
    guards.push(
      rateLimit({
        windowMs: HOUR_MS,
        limit: limits.perHour,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: 'Too many audit requests — try again later' },
      }),
    )
  }

  // 2. The key, second. Written here rather than handed to `next` for the
  //    reason above — 401 is not in that map either.
  if (apiKey !== undefined) {
    guards.push((request: Request, response: Response, next: NextFunction) => {
      if (keyAccepted(request.get(AUDIT_KEY_HEADER), apiKey)) {
        next()
        return
      }
      response.status(401).json({ error: 'A valid audit key is required' })
    })
  }

  // On the route rather than the router. Mounted with `router.use` these counted
  // every method and path under `/api/audit` — a 404, a malformed body, a 503
  // from an unconfigured server — so a budget denominated in paid vision calls
  // was exhaustible with requests that cost nothing. The second thing the first
  // review of this change found.
  router.post('/ghs', ...guards, async (request: Request, response: Response) => {
    if (extract === undefined) {
      // Before the body is looked at. The endpoint is not unavailable for this
      // request; it is unavailable.
      response.status(503).json({ error: 'Vision extraction is not configured' })
      return
    }

    const parsed = AuditRequest.safeParse(request.body)
    if (!parsed.success) {
      badRequest(response, parsed.error.issues)
      return
    }

    const { regime, image } = parsed.data
    if (image.data.length > MAX_PHOTO_BASE64) {
      response.status(413).json({
        error: 'The image is too large',
        detail: [
          `The image is ${image.data.length} base64 characters and the limit is ${MAX_PHOTO_BASE64}.`,
        ],
      })
      return
    }

    // The last thing before the money is spent, and the first thing that counts
    // against the day. Everything above this line is free to refuse.
    if (today !== undefined && !today.take()) {
      response.status(429).json({ error: 'This server has reached its daily audit limit' })
      return
    }

    try {
      // `model` comes out of the reading rather than from `EXTRACTION_MODEL`.
      // The constant is what this server asked for; the reading carries what
      // answered, and reporting the first as the second is a claim dressed as
      // an observation.
      const { extraction, model } = await extract(image, regime)
      response.json({ extraction, model })
    } catch (error) {
      if (error instanceof ExtractionDeclined) {
        response.status(422).json({
          error: 'Reading this image was declined',
          detail:
            error.category === null
              ? ['No reason was given.']
              : [`The request was declined under the ${error.category} category.`],
        })
        return
      }
      if (error instanceof ExtractionUnreadable) {
        response.status(422).json({
          error: 'The image could not be read as a label',
          detail:
            error.detail.length === 0
              ? [error.message]
              : error.detail.map((issue) => `${issue.path}: ${issue.message}`),
        })
        return
      }
      if (error instanceof ExtractionTruncated) {
        response.status(422).json({
          error: 'The reading was cut short',
          detail: ['The model reached its output limit before finishing this label.'],
        })
        return
      }
      if (error instanceof Anthropic.APIError) {
        // The upstream detail goes to the log, not to the client — it can carry
        // request identifiers and, on an authentication failure, a hint about
        // the key.
        console.error(error)

        // Sorted, because one message for every upstream failure was wrong in
        // both directions: a rejected image and a revoked key both read as "the
        // service could not be reached", which is false of the first and sends
        // whoever is debugging the second to look at the network.
        if (error instanceof Anthropic.BadRequestError) {
          // Worded to say what is known, which is less than it first appeared.
          // A 400 here is `invalid_request_error` whether the image was
          // undecodable or this server sent a parameter the API has stopped
          // accepting, and the two are told apart only by prose in the message
          // — which is the string-matching the SDK's own guidance warns off.
          // The first version said "it may be corrupt", which tells every user
          // their photograph is bad on the strength of a fault that may be
          // entirely ours. The detail is in the log above.
          response.status(422).json({
            error: 'The vision service could not process this request',
            detail: [
              'The image may be unreadable, or this server may have asked for something the service no longer accepts. The detail is in the server log.',
            ],
          })
          return
        }
        if (error instanceof Anthropic.RateLimitError) {
          response.status(503).json({ error: 'Vision extraction is busy — try again shortly' })
          return
        }
        response.status(502).json({ error: 'The extraction service could not be reached' })
        return
      }
      throw error
    }
  })

  return router
}
