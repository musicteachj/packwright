/**
 * The spend ledger: a fixed monthly AI budget, paced across the month, in integer micro-dollars.
 *
 * **Reserve, call, settle.** Before a paid call, `reserve` counts its worst case against today
 * and this month; after it, `settle` replaces that with what the reply says it cost. Nothing is
 * locked across the model call. An open reservation already counts at its full amount, so a call
 * in flight is never spent twice, and a crash during the call leaves its reservation counted.
 *
 * **Every step is one guarded update.** The month and the day are each raised only while they
 * stay at or under their ceilings, by the store in one atomic step, so two calls at once cannot
 * both take the last of a day. A refusal by the day after the month accepted gives the month
 * back. A crash between any two of these updates leaves something counted that should not be,
 * never the reverse: the ledger over-counts, it does not under-count.
 *
 * **A reservation that never settles is charged at what it reserved.** The next `reserve` sweeps
 * every reservation open for longer than ten minutes, well past the 60 s a read may take, and
 * marks it charged. The amount was counted when it was reserved, so the sweep moves no money; it
 * closes the reservation, so a settle arriving after it gives nothing back.
 *
 * **The pace.** Today may spend `multiplier` times an even share of what is left of the month
 * over the days left in it, today included, but never less than the daily floor and never more
 * than what is left: `min(left, max(floor(multiplier x left / daysLeft), floor))`. "Spent before
 * today" is the month's total less today's, so it includes every open reservation dated earlier
 * this month. A read settles into the day and month it was reserved in, even when the reply
 * arrives after midnight.
 */

/** The budget, in micro-dollars. */
export interface BudgetConfig {
  monthlyBudgetMicros: number
  pacingMultiplier: number
  dailyFloorMicros: number
}

/** The UTC date spend is counted against, as `YYYY-MM-DD`. */
export const utcDay = (now: Date): string => now.toISOString().slice(0, 10)

/** The UTC month spend is counted against, as `YYYY-MM`. */
export const utcMonth = (now: Date): string => now.toISOString().slice(0, 7)

/** Days in `now`'s UTC month: day 0 of the next month is the last day of this one. */
const daysInUtcMonth = (now: Date): number =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()

/** What today may spend, given what the month had spent before today began. Rounded down. */
export function allowanceTodayMicros(
  config: BudgetConfig,
  spentBeforeTodayMicros: number,
  now: Date,
): number {
  const left = Math.max(0, config.monthlyBudgetMicros - spentBeforeTodayMicros)
  const daysLeft = daysInUtcMonth(now) - now.getUTCDate() + 1
  const paced = Math.floor((config.pacingMultiplier * left) / daysLeft)
  return Math.min(left, Math.max(paced, config.dailyFloorMicros))
}

/** A reservation, and the day it is counted against. The month is the day's. */
export interface Reservation {
  id: string
  day: string
  micros: number
}

/**
 * Where the totals and the reservations are kept. Periods are `YYYY-MM` and `YYYY-MM-DD`
 * strings in one namespace.
 */
export interface LedgerStore {
  /** A total for every period asked for, 0 for one never written to. */
  totals(periods: readonly string[]): Promise<Record<string, number>>
  /** Adds to a period only if its total stays at or under the ceiling, atomically. */
  addWithin(period: string, micros: number, ceilingMicros: number): Promise<boolean>
  /** Adds to each period unconditionally. Negative to give back. */
  add(periods: readonly string[], micros: number): Promise<void>
  openReservation(day: string, micros: number, at: Date): Promise<string>
  /** Settles an open reservation. False if it was already settled or charged. */
  closeReservation(id: string, actualMicros: number, at: Date): Promise<boolean>
  /** Charges every reservation opened before `before` and still open. Returns how many. */
  chargeStale(before: Date): Promise<number>
}

export interface SpendLedger {
  /** Counts `micros` against today and this month, or refuses with `undefined`. */
  reserve(micros: number): Promise<Reservation | undefined>
  /** Replaces a reservation's amount with what was spent. Does nothing the second time. */
  settle(reservation: Reservation, actualMicros: number): Promise<void>
  /** What today may still reserve. */
  roomTodayMicros(): Promise<number>
}

/** How long a reservation may stay open before it is charged at what it reserved. */
export const STALE_RESERVATION_MS = 10 * 60_000

export function createLedger(
  store: LedgerStore,
  config: BudgetConfig,
  now: () => Date = () => new Date(),
): SpendLedger {
  /** Today's periods, its total and its allowance. */
  async function today(t: Date) {
    const day = utcDay(t)
    const month = utcMonth(t)
    const totals = await store.totals([month, day])
    const dayTotal = totals[day] ?? 0
    const monthTotal = totals[month] ?? 0
    return {
      day,
      month,
      dayTotal,
      allowance: allowanceTodayMicros(config, monthTotal - dayTotal, t),
    }
  }

  return {
    async reserve(micros) {
      const t = now()
      await store.chargeStale(new Date(t.getTime() - STALE_RESERVATION_MS))
      const { day, month, allowance } = await today(t)
      if (micros > allowance) return undefined
      // The month first. The pace keeps a day inside the month only for totals read before
      // anyone else wrote; this holds the month against a reservation that landed since.
      if (!(await store.addWithin(month, micros, config.monthlyBudgetMicros))) return undefined
      if (!(await store.addWithin(day, micros, allowance))) {
        await store.add([month], -micros)
        return undefined
      }
      let id: string
      try {
        id = await store.openReservation(day, micros, t)
      } catch (error) {
        // Nothing will settle a reservation that was never recorded, and the sweep cannot find
        // it, so what was counted for it would stay counted for the rest of the month. A process
        // that dies here still over-counts; one that is told it failed gives it back. The day
        // first, for the reason `mongoLedgerStore().add` gives.
        await store.add([day, month], -micros)
        throw error
      }
      return { id, day, micros }
    },

    async settle(reservation, reported) {
      const periods = [reservation.day, reservation.day.slice(0, 7)]
      // A cost that is not a whole, non-negative number of micro-dollars is not a cost anyone
      // can count, so the read keeps its full reservation, which over-counts.
      let actualMicros = reported
      if (!Number.isSafeInteger(reported) || reported < 0) {
        console.error(
          `Reservation ${reservation.id} was settled with ${reported}, which is not a cost in micro-dollars; it keeps its full reservation of ${reservation.micros}.`,
        )
        actualMicros = reservation.micros
      }
      const delta = actualMicros - reservation.micros

      if (delta > 0) {
        // More than was reserved, so the reservation bound is wrong. Counted before the close,
        // so a process that dies between the two has still counted it; taken back if the close
        // finds the reservation already settled or charged, whose amount is final.
        console.error(
          `Reservation ${reservation.id} cost ${actualMicros} micro-dollars against ${reservation.micros} reserved; the reservation bound is too low.`,
        )
        await store.add(periods, delta)
        if (!(await store.closeReservation(reservation.id, actualMicros, now()))) {
          await store.add(periods, -delta)
        }
        return
      }

      // Already settled, or charged by the sweep: either way its amount is final. Closed before
      // anything is given back, so a process that dies between the two keeps the full
      // reservation counted.
      if (!(await store.closeReservation(reservation.id, actualMicros, now()))) return
      await store.add(periods, delta)
    },

    async roomTodayMicros() {
      const { dayTotal, allowance } = await today(now())
      return Math.max(0, allowance - dayTotal)
    },
  }
}

interface MemoryReservation {
  day: string
  micros: number
  state: 'open' | 'settled' | 'charged'
  createdAt: Date
  actualMicros?: number
  closedAt?: Date
}

/**
 * The same ledger in memory, for tests and for an application built without a database. One
 * process, and every body runs to completion without awaiting, so each step is atomic here for
 * the reason the database's are there.
 */
export function memoryLedgerStore(): LedgerStore {
  const spend = new Map<string, number>()
  const reservations = new Map<string, MemoryReservation>()
  let nextId = 1

  return {
    async totals(periods) {
      return Object.fromEntries(periods.map((period) => [period, spend.get(period) ?? 0]))
    },

    async addWithin(period, micros, ceilingMicros) {
      const total = spend.get(period) ?? 0
      if (total + micros > ceilingMicros) return false
      spend.set(period, total + micros)
      return true
    },

    async add(periods, micros) {
      for (const period of periods) spend.set(period, (spend.get(period) ?? 0) + micros)
    },

    async openReservation(day, micros, at) {
      const id = String(nextId++)
      reservations.set(id, { day, micros, state: 'open', createdAt: at })
      return id
    },

    async closeReservation(id, actualMicros, at) {
      const reservation = reservations.get(id)
      if (reservation?.state !== 'open') return false
      reservation.state = 'settled'
      reservation.actualMicros = actualMicros
      reservation.closedAt = at
      return true
    },

    async chargeStale(before) {
      let charged = 0
      for (const reservation of reservations.values()) {
        if (reservation.state === 'open' && reservation.createdAt < before) {
          reservation.state = 'charged'
          reservation.closedAt = before
          charged += 1
        }
      }
      return charged
    },
  }
}
