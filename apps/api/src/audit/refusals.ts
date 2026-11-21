/**
 * Every way the photo audit says no to a live read, as one status and one sentence each.
 *
 * **These strings are not what a visitor sees.** The web app shows its own `REFUSAL_COPY`,
 * keyed on `reason`, and never these. The `error` strings here exist for API callers and the
 * logs, which is why each still points at the sample label: someone calling the API directly
 * reads them too.
 *
 * **The reason unions are declared again in `apps/web/src/api/audit.ts`, on purpose.**
 * `label-core` is not the place for them (it holds the engine, not this API's wire format), and
 * the web app does not import the API. "keeps the refusal reasons the web app copies" in
 * `routes.test.ts` pins the keys of `REFUSALS` (the unions here are types only) to the five names
 * written out in it; the web app's `api/audit.test.ts` pins its `REFUSAL_COPY` keys,
 * `REFUSAL_REASONS` and `UNAVAILABLE_REASONS` to the same names written out there. The two sides
 * agree by being written the same. The duplication is accepted, not an oversight.
 */

import type { Response } from 'express'

/** Why `GET /api/audit/status` says no read is possible. */
export type AuditUnavailableReason = 'budget' | 'ip' | 'unconfigured'

/** Why `POST /api/audit/ghs` refused a read: the status's reasons, and two only a read can meet. */
export type AuditRefusal = AuditUnavailableReason | 'unavailable' | 'bot-check'

export const REFUSALS: Readonly<Record<AuditRefusal, { status: number; error: string }>> = {
  budget: { status: 429, error: 'Live photo reads are paused for now. Try the sample label.' },
  ip: {
    status: 429,
    error: 'This network has used its live photo reads for now. Try the sample label.',
  },
  unconfigured: {
    status: 503,
    error: 'This server does not read photographs live. Try the sample label.',
  },
  unavailable: {
    status: 503,
    error: 'Live photo reading is not available right now. Try the sample label.',
  },
  'bot-check': {
    status: 403,
    error: 'The bot check did not pass. Complete it again, or try the sample label.',
  },
}

/** Writes the refusal as `{ error, reason }` under its status. */
export function refuse(response: Response, reason: AuditRefusal): void {
  const { status, error } = REFUSALS[reason]
  response.status(status).json({ error, reason })
}
