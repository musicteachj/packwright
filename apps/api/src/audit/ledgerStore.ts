/**
 * The spend ledger's store in MongoDB, shared by every task the load balancer runs.
 *
 * **Two collections.** `ai_spend` holds one running total per period, keyed by the period itself
 * (`2026-11` or `2026-11-19`), so the uniqueness the totals rest on is the `_id` index every
 * collection always has. `ai_reservations` holds one document per reservation, so a sweep can
 * find the ones that never settled and a settle can tell it came too late.
 *
 * **Every write is one atomic update, and none is held across a model call.** A guarded add
 * raises a total only while it stays at or under its ceiling, with the condition in the filter,
 * so the database applies the check and the `$inc` together and two reads at once cannot both
 * take the last of a day. An open reservation is already counted at its full amount, so nothing
 * needs locking while the call is out. Closing a reservation matches it only while it is open,
 * so a settle and the sweep cannot both close it. A crash between two of these updates leaves
 * something over-counted, never under-counted: the month raised and the day not, or a
 * reservation counted and never settled, which the sweep then charges at what it reserved.
 *
 * Reservations are kept for 35 days and then expire, which is longer than any month they settle
 * into. The totals are kept.
 */

import { Schema, model } from 'mongoose'
import type { LedgerStore } from './ledger'

const aiSpendSchema = new Schema(
  {
    _id: { type: String, required: true },
    micros: { type: Number, required: true },
  },
  { versionKey: false, collection: 'ai_spend' },
)

export const AiSpend = model('AiSpend', aiSpendSchema)

const aiReservationSchema = new Schema(
  {
    day: { type: String, required: true },
    micros: { type: Number, required: true },
    state: { type: String, enum: ['open', 'settled', 'charged'], required: true },
    actualMicros: { type: Number },
    createdAt: { type: Date, required: true },
    closedAt: { type: Date },
  },
  { versionKey: false, collection: 'ai_reservations' },
)

/** What the sweep asks for: open, and opened before a moment. */
aiReservationSchema.index({ state: 1, createdAt: 1 })
/** A reservation is evidence for a month's spend, and is not needed after it. */
aiReservationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 35 * 24 * 60 * 60 })

export const AiReservation = model('AiReservation', aiReservationSchema)

export function mongoLedgerStore(): LedgerStore {
  return {
    async totals(periods) {
      const found = await AiSpend.find({ _id: { $in: [...periods] } }).lean()
      const byPeriod = new Map(found.map((doc) => [doc._id, doc.micros]))
      // Every period asked for, so a caller never subtracts `undefined`.
      return Object.fromEntries(periods.map((period) => [period, byPeriod.get(period) ?? 0]))
    },

    async addWithin(period, micros, ceilingMicros) {
      // A ceiling below the amount admits nothing, not even into an empty period.
      if (ceilingMicros - micros < 0) return false
      // Make sure the period exists, at zero. The filter is equality alone, so two of these at
      // once that both find nothing are retried by MongoDB itself rather than failing.
      await AiSpend.updateOne({ _id: period }, { $setOnInsert: { micros: 0 } }, { upsert: true })
      const added = await AiSpend.updateOne(
        { _id: period, micros: { $lte: ceilingMicros - micros } },
        { $inc: { micros } },
      )
      // Matched rather than modified: the filter is the guard, and an `$inc` of 0 matches
      // without modifying.
      return added.matchedCount === 1
    },

    async add(periods, micros) {
      if (periods.length === 0) return
      // Days (`YYYY-MM-DD`) before months (`YYYY-MM`), in order. `totals` reads the month and
      // then the day, and today's allowance rests on the month less the day. Settling usually
      // gives money back, and with the day lowered first a reader can see the day already lowered
      // beside the month not yet lowered, which overstates what was spent before today and so
      // understates the allowance, and never the reverse, which an unordered write would allow.
      // An overspend, which only a wrong reservation bound produces, is the one write this runs
      // the other way for, and then by at most the overspend, until the month write lands.
      const dayFirst = [...periods].sort((a, b) => b.length - a.length)
      await AiSpend.bulkWrite(
        dayFirst.map((period) => ({
          updateOne: { filter: { _id: period }, update: { $inc: { micros } }, upsert: true },
        })),
        { ordered: true },
      )
    },

    async openReservation(day, micros, at) {
      const created = await AiReservation.create({ day, micros, state: 'open', createdAt: at })
      return String(created._id)
    },

    async closeReservation(id, actualMicros, at) {
      const closed = await AiReservation.updateOne(
        { _id: id, state: 'open' },
        { $set: { state: 'settled', actualMicros, closedAt: at } },
      )
      return closed.modifiedCount === 1
    },

    async chargeStale(before) {
      const charged = await AiReservation.updateMany(
        { state: 'open', createdAt: { $lt: before } },
        { $set: { state: 'charged', closedAt: before } },
      )
      return charged.modifiedCount
    },
  }
}
