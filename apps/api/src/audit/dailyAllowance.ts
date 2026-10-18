/**
 * The audit route's daily budget: how many paid vision calls this deployment may
 * make in a UTC day, counted where a restart cannot reset it.
 *
 * **Held in the database since 2026-10-18.** The count used to be a variable in
 * the process, so a task the load balancer replaced, or one knocked over on
 * purpose, started the day again at zero, and the cap on what the audit route can
 * spend stopped being a cap (`docs/security-review-2026-10-18.md`, finding 2). One
 * document per day, keyed by the date, so two tasks share one count as well.
 *
 * **A UTC calendar day**, where the count in memory ran for 24 hours from whenever
 * the process started. A day that begins at the same moment for every task is the
 * one a shared count needs, and it is the day the Anthropic console reports in.
 */

import { Schema, model } from 'mongoose'

/** Takes one call from today's budget, or refuses. Rejects where the count cannot be read. */
export interface DailyAllowance {
  take(limit: number): Promise<boolean>
}

/** The UTC date a call is counted against, as `YYYY-MM-DD`. */
export const utcDay = (now: Date): string => now.toISOString().slice(0, 10)

/**
 * One day's calls. The date is the `_id` rather than an indexed field, so the
 * uniqueness the count rests on is the one index every collection always has, and
 * nothing has to be created, or recreated after a test drops the database, for it
 * to hold.
 */
const auditDaySchema = new Schema(
  {
    _id: { type: String, required: true },
    calls: { type: Number, required: true, min: 0 },
  },
  { versionKey: false },
)

export const AuditDay = model('AuditDay', auditDaySchema)

/** MongoDB's duplicate-key error, which is how a full day refuses an upsert. */
const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000

/**
 * The count in the database, taken in one atomic step.
 *
 * The update matches today's document only while it is under the limit. Under it,
 * the call is counted. With no document yet, the upsert creates today's with one
 * call. At the limit, nothing matches, so the upsert tries to create today's
 * document a second time, which its `_id` refuses: that refusal is the answer
 * no. Two calls at once cannot both take the last one, because the database
 * applies the condition and the increment together.
 *
 * **Except for the day's first call, which is tried twice.** Two calls racing for
 * it both find no document and both try to create it, and the loser's refusal is
 * the same duplicate key as a full day's, though the day has one call in it.
 * MongoDB retries such an upsert itself only when its filter is equality alone,
 * which this one is not. Tried again, the loser finds the document the winner
 * made and is counted against it, or refused if that filled the day (found by the
 * medium review of fix 2).
 */
export function databaseAllowance(now: () => Date = () => new Date()): DailyAllowance {
  return {
    async take(limit) {
      // An upsert ignores the condition when it creates the document, so a limit
      // of zero would allow the day's first call without this.
      if (limit <= 0) return false
      const day = utcDay(now())
      for (let attempt = 1; ; attempt++) {
        try {
          const counted = await AuditDay.findOneAndUpdate(
            { _id: day, calls: { $lt: limit } },
            { $inc: { calls: 1 } },
            { upsert: true, returnDocument: 'after' },
          ).lean()
          return counted !== null
        } catch (error) {
          if (!isDuplicateKey(error)) throw error
          if (attempt === 2) return false
        }
      }
    },
  }
}

/**
 * The same count in memory, for an application built without a database: the
 * route tests, and `createApp` given limits and no allowance. `server.ts`, which
 * is the only place that builds a real server, passes `databaseAllowance`.
 */
export function memoryAllowance(now: () => Date = () => new Date()): DailyAllowance {
  let day = ''
  let calls = 0
  return {
    async take(limit) {
      const today = utcDay(now())
      if (today !== day) {
        day = today
        calls = 0
      }
      if (calls >= limit) return false
      calls += 1
      return true
    },
  }
}
