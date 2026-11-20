/**
 * Every live read is reserved before it is sent and settled after it answers.
 *
 * `metered` wraps an `ExtractLabel` so that the model is never called without a reservation
 * (`ledger.ts`), and so that whatever happens next leaves the ledger counting at least what was
 * spent: a reply settles at what it reports it cost, a known-unbilled failure settles at nothing,
 * and anything else keeps its whole reservation, which the ledger's sweep charges later. An
 * unknown outcome is never settled at nothing or at a guess.
 *
 * **Which failures settle at nothing is this project's rule, not Anthropic's.** The rule is the
 * portfolio's shared one (`portfolio-infra/PLAN.md`, Shared conventions, Ledger, Settle, updated
 * 2026-11-19): settle to $0 on 401, 403 and 402; on a 400 workspace or organization usage-limit
 * error, or a 400 saying the credit balance is too low; on any 429, the plain rate limit
 * included; and on a 529 or overloaded error before any output. It treats them as unbilled
 * because each is a refusal of the request, rejected before any work is done; every other error
 * keeps its reservation, and so does a timeout, a connection error or an unknown outcome.
 * Anthropic's pages are cited below only for what they say: each error's status and type, and the
 * wording of the usage-limit 400. They say nothing about what any of these errors is billed.
 *
 * **How each is recognized.** Source: Anthropic, "Claude API errors",
 * platform.claude.com/docs/en/api/errors, § HTTP errors, and "Rate limits",
 * platform.claude.com/docs/en/api/rate-limits, § Reaching your spend cap and § Setting your own
 * spend limit, both read on 2026-11-19.
 *
 * - 401 is `authentication_error`, 403 `permission_error` and 402 `billing_error` ("There’s an
 *   issue with your billing or payment information"). Matched by the SDK's class for 401 and 403,
 *   and by the status for 402, which has no class of its own.
 * - "The API also returns a 400 when usage reaches an organization or workspace spend limit you
 *   set" (the errors page). The rate-limits page gives the wording: the request returns HTTP 400
 *   with type `invalid_request_error`, and "The message starts with `You have reached your
 *   specified API usage limits`, or `You have reached your specified workspace API usage limits`
 *   for a workspace limit". The organization's limit is the first of those, which names no
 *   organization. Matched on the opening of the body's own message, since every other 400 has the
 *   same type and status.
 * - 429 is `rate_limit_error`, for a rate limit, the usage tier's spend cap (which the rate-limits
 *   page says carries `error.details.error_code` `enforced_spend_limit_reached`) and a Claude Code
 *   workspace limit alike. Matched by the SDK's class; the `error_code` is not read, because the
 *   rule covers any 429 and every provider error answers the visitor the same way.
 * - 529 is `overloaded_error`: "The API is temporarily overloaded." Matched by the status or by
 *   the type. The request is not streamed, so an error is all it returns.
 * - **The 400 for a credit balance too low is in the shared rule and is not matched here.**
 *   Neither page gives its wording, and a string nobody can check is not matched: such a 400
 *   keeps its reservation, which over-counts rather than guessing.
 *
 * The body's message is read where the SDK keeps it. `APIError.generate(status, body, ...)` stores
 * the reply's JSON body, `{ type: 'error', error: { type, message, details } }`, as `error.error`,
 * and its own `message` is the status and a JSON dump of that body, so the documented opening is
 * at `error.error.error.message` (`@anthropic-ai/sdk` 0.116.0, `core/error.js`).
 *
 * Everything else keeps the reservation: a 500 (`api_error`, or `timeout_error` "when a request
 * reaches the server’s time limit"), a connection failure, a timeout, and an abort once the call
 * has been made. A visitor who has left before the call is made is not read for at all.
 */

import Anthropic from '@anthropic-ai/sdk'
import { ExtractionError, type ExtractLabel } from './extract'
import type { SpendLedger, Reservation } from './ledger'
import { costMicros } from './pricing'

/** The ledger had no room for the reservation, so the model was not called. */
export class SpendRefused extends Error {
  constructor() {
    super('There is no room in the AI budget for another read today.')
    this.name = 'SpendRefused'
  }
}

/** The ledger could not be asked, so the model was not called. `cause` holds why. */
export class SpendUnavailable extends Error {
  constructor(cause: unknown) {
    super('The AI budget could not be read, so no read was reserved.', { cause })
    this.name = 'SpendUnavailable'
  }
}

/** The documented openings of the 400 a spend limit you set returns. See the module note. */
const USAGE_LIMIT_REACHED = /^You have reached your specified (?:workspace )?API usage limits/

/** The message inside the reply's body, which is where the documented wording is. */
function bodyMessage(error: InstanceType<typeof Anthropic.APIError>): string | undefined {
  const body = error.error as { error?: { message?: unknown } } | undefined
  const message = body?.error?.message
  return typeof message === 'string' ? message : undefined
}

/** Whether the shared rule settles this error at nothing. See the module note. */
export function knownUnbilled(error: unknown): boolean {
  if (!(error instanceof Anthropic.APIError)) return false
  if (error instanceof Anthropic.AuthenticationError) return true
  if (error instanceof Anthropic.PermissionDeniedError) return true
  if (error.status === 402) return true
  if (error instanceof Anthropic.RateLimitError) return true
  if (error.status === 529 || error.type === 'overloaded_error') return true
  if (error instanceof Anthropic.BadRequestError) {
    return USAGE_LIMIT_REACHED.test(bodyMessage(error) ?? '')
  }
  return false
}

/**
 * Settles a reservation and never throws. A settle that fails leaves the reservation open, so the
 * sweep charges it at what it reserved: over-counted, never lost, and the reading is not taken
 * away from somebody who has already paid for it.
 */
async function settleQuietly(
  ledger: SpendLedger,
  reservation: Reservation,
  actualMicros: number,
): Promise<void> {
  try {
    await ledger.settle(reservation, actualMicros)
  } catch (error) {
    console.error(`Reservation ${reservation.id} could not be settled; it stays counted.`, error)
  }
}

export function metered(
  extract: ExtractLabel,
  ledger: SpendLedger,
  reservationMicros: number,
): ExtractLabel {
  /** What a billed reply cost, or the whole reservation for one this server cannot price. */
  const costOf = (billed: { model: string; usage: Anthropic.Usage }) =>
    costMicros(billed.model, billed.usage) ?? reservationMicros

  return async (photo, regime, options) => {
    // Asked each time rather than read once: the signal can fire during any `await` below.
    const gone = () => options?.signal?.aborted === true

    // A visitor who has already gone is not read for, and nothing is reserved for them.
    if (gone()) throw new Anthropic.APIUserAbortError()

    let reservation: Reservation | undefined
    try {
      reservation = await ledger.reserve(reservationMicros)
    } catch (error) {
      console.error('The spend ledger could not reserve a read, so none was sent.', error)
      throw new SpendUnavailable(error)
    }
    if (reservation === undefined) throw new SpendRefused()

    // Gone while the reservation was being made: nothing reached Anthropic, so nothing was spent.
    if (gone()) {
      await settleQuietly(ledger, reservation, 0)
      throw new Anthropic.APIUserAbortError()
    }

    let reading: Awaited<ReturnType<ExtractLabel>>
    try {
      reading = await extract(photo, regime, options)
    } catch (error) {
      if (error instanceof ExtractionError && error.billed !== undefined) {
        await settleQuietly(ledger, reservation, costOf(error.billed))
      } else if (knownUnbilled(error)) {
        await settleQuietly(ledger, reservation, 0)
      }
      // Anything else may have been billed, so its reservation stays open and counted.
      throw error
    }
    // Outside the `try` above, so a settle can never be mistaken for a failed call.
    await settleQuietly(ledger, reservation, costOf(reading.billed))
    return reading
  }
}
