/**
 * How many live reads one visitor may make in a UTC day, counted in the database
 * where a restart or a second task cannot reset it.
 *
 * **A visitor is a keyed hash of their network, never the network.** The key is
 * an HMAC-SHA256 secret (`AUDIT_IP_HASH_KEY`). An unkeyed sha256 of an IPv4
 * address is reversed by trying all ~4 billion addresses, so a leaked collection
 * would name everyone in it. Keyed, the hash means nothing without the secret.
 * No raw address is stored, and no unkeyed hash of one. IPv6 addresses are first
 * reduced to their /56 (`ipKeyGenerator`'s default), so one household cannot
 * mint a fresh visitor by rotating through its own subnet.
 *
 * **Documents expire by themselves.** Each carries `expiresAt`, 00:00 UTC two days
 * after the day it counts, and a TTL index on that field removes it. A visitor is
 * forgotten within two days.
 *
 * The upsert and its duplicate-key retry are ported from `dailyAllowance.ts`.
 */

import { createHmac } from 'node:crypto'
import { ipKeyGenerator } from 'express-rate-limit'
import { Schema, model } from 'mongoose'

/** Takes one read from a visitor's day, or refuses. Rejects where the count cannot be read. */
export interface VisitorAllowance {
  take(visitor: string, limit: number): Promise<boolean>
  /** Reads still available today, never below zero. */
  left(visitor: string, limit: number): Promise<number>
}

/**
 * The visitor a request counts against: 32 hex characters of an HMAC-SHA256 of
 * the network (IPv6 grouped by /56) under `key`.
 */
export const visitorKey = (key: string, ip: string | undefined): string =>
  createHmac('sha256', key)
    .update(ipKeyGenerator(ip ?? 'unknown'))
    .digest('hex')
    .slice(0, 32)

/** The UTC date a read is counted against, as `YYYY-MM-DD`. */
const utcDay = (now: Date): string => now.toISOString().slice(0, 10)

/** 00:00 UTC two days after the counted day: the whole of that day, plus one more. */
const expiryOf = (now: Date): Date => {
  const start = Date.parse(`${utcDay(now)}T00:00:00.000Z`)
  return new Date(start + 2 * 24 * 60 * 60 * 1000)
}

/**
 * One visitor's reads on one day. The `_id` is `<YYYY-MM-DD>:<visitor>`, so the
 * uniqueness the count rests on is the index every collection always has.
 */
const auditVisitorDaySchema = new Schema(
  {
    _id: { type: String, required: true },
    reads: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false, collection: 'audit_visitor_days' },
)
auditVisitorDaySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const AuditVisitorDay = model('AuditVisitorDay', auditVisitorDaySchema)

/** MongoDB's duplicate-key error, which is how a full day refuses an upsert. */
const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000

/**
 * The count in the database, taken in one atomic step.
 *
 * The update matches the visitor's document only while it is under the limit.
 * With none yet, the upsert creates it with one read. At the limit nothing
 * matches, so the upsert tries to create the document again, which its `_id`
 * refuses: that refusal is the answer no.
 *
 * **Except for the day's first read, which is tried twice.** Two reads racing for
 * it both find no document and both try to create it, and the loser's refusal is
 * the same duplicate key as a full day's, though the day has one read in it.
 * MongoDB retries such an upsert itself only when its filter is equality alone,
 * which this one is not. Tried again, the loser finds the winner's document and
 * is counted against it, or refused if that filled the day.
 */
export function databaseVisitorAllowance(now: () => Date = () => new Date()): VisitorAllowance {
  return {
    async take(visitor, limit) {
      // An upsert ignores the condition when it creates the document, so a limit
      // of zero would allow the first read without this.
      if (limit <= 0) return false
      const moment = now()
      const id = `${utcDay(moment)}:${visitor}`
      for (let attempt = 1; ; attempt++) {
        try {
          const counted = await AuditVisitorDay.findOneAndUpdate(
            { _id: id, reads: { $lt: limit } },
            { $inc: { reads: 1 }, $setOnInsert: { expiresAt: expiryOf(moment) } },
            { upsert: true, returnDocument: 'after' },
          ).lean()
          return counted !== null
        } catch (error) {
          if (!isDuplicateKey(error)) throw error
          if (attempt === 2) return false
        }
      }
    },
    async left(visitor, limit) {
      const found = await AuditVisitorDay.findById(`${utcDay(now())}:${visitor}`).lean()
      return Math.max(0, limit - (found?.reads ?? 0))
    },
  }
}

/** The same count in memory, for an application built without a database. */
export function memoryVisitorAllowance(now: () => Date = () => new Date()): VisitorAllowance {
  let day = ''
  const reads = new Map<string, number>()
  const today = (): void => {
    const current = utcDay(now())
    if (current !== day) {
      day = current
      reads.clear()
    }
  }
  return {
    async take(visitor, limit) {
      today()
      const used = reads.get(visitor) ?? 0
      if (used >= limit) return false
      reads.set(visitor, used + 1)
      return true
    },
    async left(visitor, limit) {
      today()
      return Math.max(0, limit - (reads.get(visitor) ?? 0))
    },
  }
}
