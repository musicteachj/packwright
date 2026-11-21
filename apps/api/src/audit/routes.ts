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
import express, {
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
import type { SpendLedger } from './ledger'
import { photoFault } from './photoSignature'
import { refuse, REFUSALS, type AuditUnavailableReason } from './refusals'
import { metered, SpendRefused, SpendUnavailable } from './spend'
import { TURNSTILE_HEADER, type TurnstileOutcome, type VerifyTurnstile } from './turnstile'
import { visitorKey, type VisitorAllowance } from './visitorAllowance'

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
 * 5 MiB (5,242,880 base64 characters) sits under a 6 MB body limit with room for
 * the JSON around it, and below the upstream limit on either reading of its
 * "10 MB". It is still well above what this route expects: the client caps the
 * long edge at 2576 px and encodes JPEG at quality 0.92, which lands between one
 * and two megabytes.
 */
export const MAX_PHOTO_BASE64 = 5 * 1024 * 1024

const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

/** How long the status keeps the ledger's room for today before it asks again. */
const LEDGER_READ_TTL_MS = 5_000

/**
 * What the audit route may weigh, because it carries a photograph. Read here, after
 * the guards, rather than by `app.ts` ahead of them (see the order below).
 */
export const AUDIT_BODY_LIMIT = '6mb'

/**
 * What one client may ask in an hour, what one visitor may read in a day, and how often
 * one client may ask the status.
 *
 * Every read here reaches a paid vision API on a key the server holds, so an
 * unprotected route does not cost a slow server: it costs somebody else's money,
 * and it does so quietly, because nothing about a spent quota looks like an
 * incident until the bill arrives.
 *
 * **Three figures, because they answer different questions.** The hourly figure is
 * per client and asks whether one caller is going too fast; a person auditing
 * labels by hand takes minutes over each photograph, so twenty in an hour is
 * generous for the work and useless for a script. The daily figure is per visitor,
 * on the public path only, and shares the day's reads out between visitors
 * (`visitorAllowance.ts`); `AUDIT_READS_PER_IP_PER_DAY` sets it. The status figure
 * keeps a page that polls, or a script that floods it, from reading the counts
 * behind it without end. What the deployment may lose whatever the traffic looks
 * like is the spend ledger's to hold (`AuditSpend`), which reserves every read's
 * worst case, $0.112 (`VISION_RESERVATION_MICROS`), before it is sent; a typical
 * read costs about $0.02 to $0.04 (the recorded one, 19,908 micro-dollars).
 *
 * All are deliberately small. Raising a limit is a decision somebody makes on
 * purpose; discovering one was never there is not.
 */
export const DEFAULT_AUDIT_LIMITS = {
  perHour: 20,
  perVisitorPerDay: 5,
  statusPerMinute: 60,
} as const

export interface AuditLimits {
  /** `POST /ghs` requests per client per hour. */
  perHour: number
  /** Live reads per visitor per UTC day, on the public path only. */
  perVisitorPerDay: number
  /** `GET /status` requests per client per minute. */
  statusPerMinute: number
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

/**
 * The ledger every live read reserves against, and what one read reserves.
 *
 * With it, the extractor is wrapped once in `metered` (`spend.ts`): a read is refused before
 * the model is called when the day has no room, and settled at what it cost once it answers.
 */
export interface AuditSpend {
  ledger: SpendLedger
  reservationMicros: number
}

/**
 * Where the public path counts each visitor's reads, and the key their network is hashed under
 * (`visitorAllowance.ts`). Only the public path counts visitors: the owner's key is bounded by
 * the hourly limiter and the ledger (decision 1).
 */
export interface AuditVisitors {
  allowance: VisitorAllowance
  ipHashKey: string
}

export interface AuditRouterOptions {
  extract?: ExtractLabel | undefined
  /**
   * The shared secret this route requires, or nothing to require none: the owner's path.
   *
   * Optional because the route has to keep working for a deployment that has
   * not set one, and **required the moment it is set**: a key that is checked
   * only when the caller offers one is not a key. Never built into the client,
   * which is served from this same origin and would ship it to everyone who loads
   * the page. Metered by the ledger and the hourly limiter, and not counted per
   * visitor. **Since 2026-11-18 it is no longer the public path**, which is the
   * Turnstile check below; the two are exclusive, and the status tells a browser
   * in key mode that this server does not read photographs live.
   */
  apiKey?: string | undefined
  /**
   * The public path: Cloudflare's bot check, and the site key the status hands the
   * browser for its widget. Set, every read must carry a token that passes, and is
   * counted against its visitor (`visitors`).
   */
  turnstile?: { siteKey: string; verify: VerifyTurnstile } | undefined
  /**
   * The quotas to enforce, or `false` for none.
   *
   * Stated rather than defaulted, because `createApp` builds the same
   * application every time it is called and a limiter that switched itself off
   * by sniffing `NODE_ENV` would break that. Tests that are not about the
   * limits pass `false`; the ones that are pass small numbers. **Required with
   * `turnstile`**: the daily figure is what counts each visitor, so a public path
   * without limits is refused when the router is built.
   */
  limits?: AuditLimits | false | undefined
  /**
   * Where the public path counts each visitor's reads. Required with `turnstile`, and
   * ignored without it (decision 1). `server.ts` passes the database's, so a restart
   * does not give every visitor their day again.
   */
  visitors?: AuditVisitors | undefined
  /** The spend ledger. Required with `extract`; see `AuditSpend`. */
  spend?: AuditSpend | undefined
  /** The clock the status's ledger read is kept by, in milliseconds. A test moves it. */
  now?: (() => number) | undefined
}

export function createAuditRouter(options: AuditRouterOptions = {}): Router {
  const router = Router()
  const { apiKey, turnstile, limits, visitors, spend } = options
  const now = options.now ?? Date.now

  // No path may call a live extractor unmetered, so a router that would is never built.
  if (options.extract !== undefined && spend === undefined) {
    throw new Error('An extractor needs a spend ledger.')
  }
  // The two modes are exclusive (decision 1); `loadEnv` refuses both set, and so does this.
  if (apiKey !== undefined && turnstile !== undefined) {
    throw new Error('An audit router takes an API key or a Turnstile check, not both.')
  }
  // A public path with nowhere to count visitors would read for anyone, as often as they liked.
  if (turnstile !== undefined && visitors === undefined) {
    throw new Error('A Turnstile check needs a visitor allowance.')
  }
  // Without limits there is no daily figure to count against, so every pass would read.
  if (turnstile !== undefined && !limits) throw new Error('A Turnstile check needs limits.')

  // Wrapped once, here, so that no path through the handler can reach the model unreserved.
  const extract =
    options.extract === undefined || spend === undefined
      ? undefined
      : metered(options.extract, spend.ledger, spend.reservationMicros)

  /**
   * The public path's per-visitor count, or nothing. Only where a Turnstile check is
   * configured (decision 1): in key mode it is skipped even when `visitors` is given.
   */
  const perVisitor =
    turnstile !== undefined && visitors !== undefined && limits !== false && limits !== undefined
      ? { visitors, perDay: limits.perVisitorPerDay }
      : undefined
  const visitorOf = (request: Request, counted: AuditVisitors): string =>
    visitorKey(counted.ipHashKey, request.ip)

  /**
   * Today's room in the ledger, kept for five seconds, so a flood of status checks from
   * many addresses asks the database for the budget at most once every five seconds. A
   * stale answer costs nothing, because the read itself still reserves. A read that
   * throws is not kept. **The kept answer is dropped whenever a read reaches the metered
   * call**, whatever it ends in, so a read that took the day's last reservation is not
   * followed by a status saying another is possible. A read refused before that call
   * reserved nothing and leaves it. A ledger read still in flight when a read drops the
   * answer is not kept (`ledgerGeneration`), since it may predate that read's reservation.
   */
  let ledgerRead: { at: number; roomMicros: number } | undefined
  let ledgerGeneration = 0
  const roomTodayMicros = async (ledger: SpendLedger): Promise<number> => {
    const at = now()
    if (ledgerRead !== undefined && at - ledgerRead.at < LEDGER_READ_TTL_MS) {
      return ledgerRead.roomMicros
    }
    const generation = ledgerGeneration
    const roomMicros = await ledger.roomTodayMicros()
    if (generation === ledgerGeneration) ledgerRead = { at, roomMicros }
    return roomMicros
  }

  /**
   * `GET /status`: whether a read is possible now, and if not why, with the site key the
   * page's widget needs.
   *
   * **`Cache-Control: no-store`, though the shared conventions call this a cached flag.**
   * The `ip` reason is per visitor, so no cache between the visitor and this app may
   * share one visitor's answer with another. Only the ledger read behind it is kept, in
   * this process, and only for five seconds (`roomTodayMicros`, above).
   *
   * In order: no extractor, or the owner's key, is `unconfigured` (the page has no key
   * field, so in key mode a browser cannot read); a day without room for one reservation
   * is `budget`; a visitor who has used their reads is `ip`; and a count or a ledger
   * that cannot be read is `budget` too, logged, since a budget nobody can check is not
   * one.
   */
  const statusGuards: RequestHandler[] = []
  if (limits !== false && limits !== undefined) {
    statusGuards.push(
      rateLimit({
        windowMs: MINUTE_MS,
        limit: limits.statusPerMinute,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: 'Too many status checks. Try again in a minute.' },
      }),
    )
  }
  router.get('/status', ...statusGuards, async (request: Request, response: Response) => {
    const answer = (reason: AuditUnavailableReason | null) => {
      response.set('Cache-Control', 'no-store')
      response.json({ available: reason === null, reason, siteKey: turnstile?.siteKey ?? null })
    }
    if (extract === undefined || spend === undefined || apiKey !== undefined) {
      answer('unconfigured')
      return
    }
    try {
      if ((await roomTodayMicros(spend.ledger)) < spend.reservationMicros) {
        answer('budget')
        return
      }
      if (
        perVisitor !== undefined &&
        (await perVisitor.visitors.allowance.left(
          visitorOf(request, perVisitor.visitors),
          perVisitor.perDay,
        )) === 0
      ) {
        answer('ip')
        return
      }
    } catch (error) {
      console.error('The audit status could not read its counts.', error)
      answer('budget')
      return
    }
    answer(null)
  })

  // **Order is the whole of this.** Each guard is cheap to state and the sequence
  // is what makes them add up, so it is written out rather than assembled where
  // it happens to read well.
  const guards: RequestHandler[] = []

  // 1. The per-client hourly bucket, first, so that guessing at the key or
  //    failing the bot check costs the caller something. `express-rate-limit`
  //    writes its own 429 rather than passing an error along, which matters:
  //    `app.ts`'s handler maps exactly 400, 413 and 415, so a 429 arriving through
  //    `next(error)` would reach the caller as 500. Its reason is `unavailable`,
  //    not `ip`: the status reads only the daily count, so an `ip` here would be
  //    followed by a status saying a read is possible.
  if (limits !== false && limits !== undefined) {
    guards.push(
      rateLimit({
        windowMs: HOUR_MS,
        limit: limits.perHour,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: REFUSALS.unavailable.error, reason: 'unavailable' },
      }),
    )
  }

  // 2. The key in key mode, or the bot check on the public path, second, and both
  //    before a byte of the body is read. Written here rather than handed to
  //    `next` for the reason above: 401 and 403 are not in that map either.
  if (apiKey !== undefined) {
    guards.push((request: Request, response: Response, next: NextFunction) => {
      if (keyAccepted(request.get(AUDIT_KEY_HEADER), apiKey)) {
        next()
        return
      }
      response.status(401).json({ error: 'A valid audit key is required' })
    })
  }
  if (turnstile !== undefined) {
    guards.push(async (request: Request, response: Response, next: NextFunction) => {
      // A missing token is a failed check, decided here without asking Cloudflare.
      const token = request.get(TURNSTILE_HEADER)
      if (token === undefined || token === '') {
        refuse(response, 'bot-check')
        return
      }
      let outcome: TurnstileOutcome
      try {
        outcome = await turnstile.verify({ token, remoteIp: request.ip })
      } catch (error) {
        // `siteverify` answers `unavailable` rather than throwing; this is for one that does.
        console.error('The bot check could not be asked.', error)
        refuse(response, 'unavailable')
        return
      }
      if (outcome === 'passed') {
        next()
        return
      }
      refuse(response, outcome === 'unavailable' ? 'unavailable' : 'bot-check')
    })
  }

  // 3. The body, third, and only now. The parser used to run in `app.ts` ahead of
  //    this router, so a request the limiter or the key was about to refuse had
  //    already been read and parsed in full: a nested 10 MB body cost 635 ms of
  //    blocking CPU and 267 MB before its 401 (`docs/security-review-2026-10-18.md`,
  //    finding 2). Its errors reach `app.ts`'s handler, which maps 400, 413 and 415.
  guards.push(express.json({ limit: AUDIT_BODY_LIMIT }))

  // On the route rather than the router. Mounted with `router.use` these counted
  // every method and path under `/api/audit` (a 404, a malformed body, a 503
  // from an unconfigured server), so a budget denominated in paid vision calls
  // was exhaustible with requests that cost nothing. The second thing the first
  // review of this change found.
  router.post('/ghs', ...guards, async (request: Request, response: Response) => {
    // A visitor who leaves stops the call: the signal reaches the SDK, which abandons the request.
    // Its reservation stays counted (`spend.ts`), since what an abandoned call was billed is not
    // known. `writableFinished` tells a connection that closed after the answer from one that
    // closed before it. Registered before the first `await` below, because a connection that
    // closes during one emits `close` once, and a hook added after it would never hear it.
    const abort = new AbortController()
    response.on('close', () => {
      if (!response.writableFinished) abort.abort()
    })

    // 4. No extractor, before the body is looked at. The endpoint is not
    //    unavailable for this request; it is unavailable.
    if (extract === undefined) {
      refuse(response, 'unconfigured')
      return
    }

    // 5. The shape, the size and the photograph's signature, all free to refuse.
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

    // Before the visitor is counted, so a body that is no photograph is refused for
    // free rather than spending a read (`photoSignature.ts`).
    const fault = photoFault(image.mediaType, image.data)
    if (fault !== undefined) {
      badRequest(response, [{ path: ['image', 'data'], message: fault }])
      return
    }

    // 6. The visitor's day, on the public path only (decision 1), and the first thing
    //    that counts against anything. Taken before the reservation and not given back
    //    if the budget then refuses (decision 9). A count that cannot be read refuses
    //    too: a budget nobody can check is not one.
    if (perVisitor !== undefined) {
      let taken: boolean
      try {
        taken = await perVisitor.visitors.allowance.take(
          visitorOf(request, perVisitor.visitors),
          perVisitor.perDay,
        )
      } catch (error) {
        console.error('The visitor count could not be read, so no read was sent.', error)
        refuse(response, 'unavailable')
        return
      }
      if (!taken) {
        refuse(response, 'ip')
        return
      }
    }

    // Gone while the visitor was being counted: there is nobody to read for.
    if (abort.signal.aborted) return

    // 7. The metered call, which reserves before it reads (`spend.ts`).
    try {
      // `model` comes out of the reading rather than from `EXTRACTION_MODEL`.
      // The constant is what this server asked for; the reading carries what
      // answered, and reporting the first as the second is a claim dressed as
      // an observation.
      const { extraction, model } = await extract(image, regime, { signal: abort.signal })
      // Nobody is left to write to.
      if (abort.signal.aborted) return
      response.json({ extraction, model })
    } catch (error) {
      if (abort.signal.aborted) {
        if (!(error instanceof Anthropic.APIUserAbortError)) console.error(error)
        return
      }
      if (error instanceof SpendRefused) {
        refuse(response, 'budget')
        return
      }
      if (error instanceof SpendUnavailable) {
        // Logged by `metered`, with the ledger's own error.
        refuse(response, 'unavailable')
        return
      }
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
          error:
            'The reading came back in a form Packwright could not use. Try again, or try the sample label.',
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
        // Every provider error, connection failures and timeouts included, is one answer. A
        // usage limit, a revoked key, an empty credit balance and an outage are none of them
        // the visitor's to fix, and a 400 cannot be told from a fault of this server's except
        // by prose in its message, so no answer here blames the photograph. The upstream detail
        // goes to the log, not to the client: it can carry request identifiers and, on an
        // authentication failure, a hint about the key.
        console.error(error)
        refuse(response, 'unavailable')
        return
      }
      throw error
    } finally {
      // The read may have taken the day's last room, so the status asks the ledger again,
      // and a ledger read already under way is not kept either.
      ledgerRead = undefined
      ledgerGeneration += 1
    }
  })

  return router
}
