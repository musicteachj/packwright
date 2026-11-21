/**
 * What the audit page says when no live read is possible, or a read was refused.
 *
 * **This is the copy a visitor sees.** The server's `REFUSALS` strings
 * (`apps/api/src/audit/refusals.ts`) exist for API callers and the logs, and the
 * page never shows them: it keys on the refusal's `reason` and says this instead.
 * Every sentence but the bot check's points at the sample label, which shows the
 * whole audit with a reading made earlier and sends nothing.
 *
 * `budget` does not say the budget is spent, because the server also answers
 * `budget` when it cannot read its counts: it fails closed (decision 12), and
 * during a database blip "used up" would not be true.
 *
 * The keys are the server's `AuditRefusal` list, copied on purpose (the web app
 * does not import the API); a test in `api/audit.test.ts` pins them to it.
 */

import type { AuditRefusalReason } from '../api/audit'

export const REFUSAL_COPY: Readonly<Record<AuditRefusalReason, string>> = {
  budget:
    'Live photo reads are paused for now. The sample label shows the whole audit, with a reading Claude made earlier.',
  ip: "You've used the live photo reads this network gets for now. The sample label shows the whole audit, with a reading Claude made earlier.",
  unconfigured:
    "This server doesn't read photographs live. The sample label shows the whole audit, with a reading Claude made earlier.",
  unavailable:
    "Live photo reading isn't available right now. The sample label shows the whole audit, with a reading Claude made earlier.",
  'bot-check':
    "The bot check didn't go through. Complete it again to read your photo, or try the sample label.",
}
