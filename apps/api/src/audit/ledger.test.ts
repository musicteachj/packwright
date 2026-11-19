import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  allowanceTodayMicros,
  createLedger,
  memoryLedgerStore,
  utcDay,
  utcMonth,
  type BudgetConfig,
  type LedgerStore,
} from './ledger'

/**
 * $10 a month, a $0.50 floor and three times the even share of what is left. Every expected
 * allowance below is worked by hand from `min(left, max(floor(3 x left / daysLeft), floor))`,
 * where `daysLeft` counts today.
 */
const CONFIG: BudgetConfig = {
  monthlyBudgetMicros: 10_000_000,
  pacingMultiplier: 3,
  dailyFloorMicros: 500_000,
}

const at = (iso: string) => new Date(iso)

/** A clock a test can move. */
function clock(iso: string) {
  let now = at(iso)
  return {
    now: () => now,
    set: (next: string) => {
      now = at(next)
    },
  }
}

describe('the UTC periods spend is counted in', () => {
  it('names the day and the month in UTC', () => {
    // 01:30 on the 1st in UTC is still the 30th of November west of Greenwich.
    expect(utcDay(at('2026-12-01T01:30:00Z'))).toBe('2026-12-01')
    expect(utcMonth(at('2026-12-01T01:30:00Z'))).toBe('2026-12')
  })
})

describe("today's allowance", () => {
  it.each([
    // [now, spent before today, expected, the arithmetic]
    ['2026-11-01T12:00:00Z', 0, 1_000_000, '3 x 10,000,000 / 30'],
    ['2026-11-19T12:00:00Z', 6_000_000, 1_000_000, '3 x 4,000,000 / 12'],
    ['2026-11-19T12:00:00Z', 9_000_000, 500_000, '3 x 1,000,000 / 12 = 250,000; the floor wins'],
    ['2026-11-30T12:00:00Z', 9_800_000, 200_000, 'what is left caps it'],
    ['2026-12-01T12:00:00Z', 0, 967_741, '3 x 10,000,000 / 31 = 967,741.9, rounded down'],
    ['2024-02-29T12:00:00Z', 0, 10_000_000, 'one day left; what is left caps it'],
    ['2026-11-19T12:00:00Z', 11_000_000, 0, 'overspent'],
  ])('on %s with %i spent before today is %i (%s)', (now, spentBefore, expected) => {
    expect(allowanceTodayMicros(CONFIG, spentBefore, at(now))).toBe(expected)
  })

  it.each(['2026-11-01T00:00:00Z', '2026-11-19T12:00:00Z', '2024-02-29T23:59:59Z'])(
    'is nothing on %s when the budget is nothing, whatever the floor',
    (now) => {
      expect(allowanceTodayMicros({ ...CONFIG, monthlyBudgetMicros: 0 }, 0, at(now))).toBe(0)
    },
  )
})

describe('the ledger, in memory', () => {
  it('refuses every reservation when the budget is zero', async () => {
    const ledger = createLedger(memoryLedgerStore(), { ...CONFIG, monthlyBudgetMicros: 0 }, () =>
      at('2026-11-19T12:00:00Z'),
    )
    expect(await ledger.reserve(112_000)).toBeUndefined()
  })

  it('admits reservations until the day is full, then refuses', async () => {
    const store = memoryLedgerStore()
    await store.add(['2026-11', '2026-11-05'], 9_000_000)
    // 1,000,000 left over 12 days: 3 x 1,000,000 / 12 = 250,000, so the floor of 500,000.
    const ledger = createLedger(store, CONFIG, () => at('2026-11-19T12:00:00Z'))
    const admitted = []
    for (let i = 0; i < 5; i++) admitted.push(await ledger.reserve(112_000))
    expect(admitted.slice(0, 4).every((r) => r !== undefined)).toBe(true)
    // 4 x 112,000 = 448,000; a fifth would make 560,000.
    expect(admitted[4]).toBeUndefined()
    // The fifth passed the month's guard and was refused by the day's, so the month gave it back.
    expect(await store.totals(['2026-11', '2026-11-19'])).toEqual({
      '2026-11': 9_448_000,
      '2026-11-19': 448_000,
    })
  })

  it('settling gives back what a read did not spend', async () => {
    const ledger = createLedger(memoryLedgerStore(), CONFIG, () => at('2026-11-19T12:00:00Z'))
    // Nothing spent: 3 x 10,000,000 / 12 = 2,500,000.
    expect(await ledger.roomTodayMicros()).toBe(2_500_000)
    const reservation = await ledger.reserve(112_000)
    expect(reservation).toBeDefined()
    // 2,500,000 - 112,000
    expect(await ledger.roomTodayMicros()).toBe(2_388_000)
    await ledger.settle(reservation!, 19_908)
    // 2,500,000 - 19,908
    expect(await ledger.roomTodayMicros()).toBe(2_480_092)
  })

  it('settles once', async () => {
    const ledger = createLedger(memoryLedgerStore(), CONFIG, () => at('2026-11-19T12:00:00Z'))
    const reservation = (await ledger.reserve(112_000))!
    await ledger.settle(reservation, 19_908)
    await ledger.settle(reservation, 19_908)
    await ledger.settle(reservation, 0)
    expect(await ledger.roomTodayMicros()).toBe(2_480_092)
  })

  it('a reservation older than ten minutes is charged at what was reserved', async () => {
    const store = memoryLedgerStore()
    const time = clock('2026-11-19T12:00:00Z')
    const ledger = createLedger(store, CONFIG, time.now)
    const reservation = (await ledger.reserve(112_000))!

    // Eleven minutes on, the read never settled. The next reservation sweeps it, and asks for
    // more than any day allows, so it is refused and adds nothing of its own.
    time.set('2026-11-19T12:11:00Z')
    expect(await ledger.reserve(Number.MAX_SAFE_INTEGER)).toBeUndefined()
    expect(await store.totals(['2026-11-19'])).toEqual({ '2026-11-19': 112_000 })

    // A settle arriving after the sweep is too late to give anything back.
    await ledger.settle(reservation, 0)
    expect(await store.totals(['2026-11', '2026-11-19'])).toEqual({
      '2026-11': 112_000,
      '2026-11-19': 112_000,
    })
  })

  it('a read that crosses midnight at the end of a month settles into the month it began in', async () => {
    const store = memoryLedgerStore()
    const time = clock('2026-11-30T23:59:59Z')
    const ledger = createLedger(store, CONFIG, time.now)
    const reservation = (await ledger.reserve(112_000))!

    time.set('2026-12-01T00:00:01Z')
    await ledger.settle(reservation, 20_000)
    expect(await store.totals(['2026-11', '2026-11-30', '2026-12'])).toEqual({
      '2026-11': 20_000,
      '2026-11-30': 20_000,
      '2026-12': 0,
    })
    // December starts whole: 3 x 10,000,000 / 31, rounded down.
    expect(await ledger.roomTodayMicros()).toBe(967_741)
  })

  it('holds the month even when its totals were read before another reservation landed', async () => {
    // The pacing alone keeps a day inside the month, so the month's own guard matters only in a
    // race, and this builds one: a reservation dated yesterday lands between this one reading
    // the totals and writing to them, so the totals it read are 200,000 short of the month.
    const memory = memoryLedgerStore()
    await memory.add(['2026-11', '2026-11-18'], 200_000)
    const behind: LedgerStore = {
      ...memory,
      async totals(periods) {
        const read = await memory.totals(periods)
        return { ...read, '2026-11': read['2026-11']! - 200_000 }
      },
    }
    // Read as nothing spent: left is 300,000, which caps the floor of 1,000,000.
    const ledger = createLedger(
      behind,
      { monthlyBudgetMicros: 300_000, pacingMultiplier: 3, dailyFloorMicros: 1_000_000 },
      () => at('2026-11-19T12:00:00Z'),
    )
    // 200,000 + 112,000 = 312,000, past the month's 300,000.
    expect(await ledger.reserve(112_000)).toBeUndefined()
    expect(await memory.totals(['2026-11', '2026-11-19'])).toEqual({
      '2026-11': 200_000,
      '2026-11-19': 0,
    })
  })

  it('reports 0 for a period it has never seen', async () => {
    expect(await memoryLedgerStore().totals(['2026-11', '2026-11-19'])).toEqual({
      '2026-11': 0,
      '2026-11-19': 0,
    })
  })
})

describe('settling, when something goes wrong', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const NOV_19 = () => at('2026-11-19T12:00:00Z')
  const totalsOf = (store: LedgerStore) => store.totals(['2026-11', '2026-11-19'])

  it('counts a read that cost more than it reserved, and says so as an error', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = memoryLedgerStore()
    const ledger = createLedger(store, CONFIG, NOV_19)
    const reservation = (await ledger.reserve(112_000))!
    await ledger.settle(reservation, 150_000)
    expect(await totalsOf(store)).toEqual({ '2026-11': 150_000, '2026-11-19': 150_000 })
    expect(logged).toHaveBeenCalledTimes(1)
    const [message] = logged.mock.calls[0]!
    expect(message).toContain('150000')
    expect(message).toContain('112000')
    expect(message).toContain(reservation.id)
  })

  it('keeps the overspend of a read when the process dies after the reservation is closed', async () => {
    // Every write after the close fails, which is what a process that died there leaves. The
    // 38,000 the read cost beyond its reservation was counted first, so it is not lost.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const memory = memoryLedgerStore()
    let closed = false
    const dying: LedgerStore = {
      ...memory,
      async closeReservation(id, actualMicros, at) {
        const result = await memory.closeReservation(id, actualMicros, at)
        closed = true
        return result
      },
      async add(periods, micros) {
        if (closed) throw new Error('the process died')
        return memory.add(periods, micros)
      },
    }
    const ledger = createLedger(dying, CONFIG, NOV_19)
    const reservation = (await ledger.reserve(112_000))!
    await ledger.settle(reservation, 150_000).catch(() => {})
    // 112,000 + 38,000
    expect(await totalsOf(memory)).toEqual({ '2026-11': 150_000, '2026-11-19': 150_000 })
  })

  it('takes the overspend back when the reservation was already settled', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = memoryLedgerStore()
    const ledger = createLedger(store, CONFIG, NOV_19)
    const reservation = (await ledger.reserve(112_000))!
    await ledger.settle(reservation, 19_908)
    await ledger.settle(reservation, 150_000)
    expect(await totalsOf(store)).toEqual({ '2026-11': 19_908, '2026-11-19': 19_908 })
  })

  it('takes the overspend back when the sweep already charged the reservation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = memoryLedgerStore()
    const time = clock('2026-11-19T12:00:00Z')
    const ledger = createLedger(store, CONFIG, time.now)
    const reservation = (await ledger.reserve(112_000))!
    time.set('2026-11-19T12:11:00Z')
    await ledger.reserve(Number.MAX_SAFE_INTEGER)
    await ledger.settle(reservation, 150_000)
    expect(await totalsOf(store)).toEqual({ '2026-11': 112_000, '2026-11-19': 112_000 })
  })

  it.each([
    ['not a number', Number.NaN],
    ['negative', -1],
    ['a fraction of a micro-dollar', 0.5],
    ['infinite', Number.POSITIVE_INFINITY],
  ])('keeps the full reservation for a cost that is %s, and says so', async (_, actual) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = memoryLedgerStore()
    const ledger = createLedger(store, CONFIG, NOV_19)
    const reservation = (await ledger.reserve(112_000))!
    await ledger.settle(reservation, actual)
    expect(await totalsOf(store)).toEqual({ '2026-11': 112_000, '2026-11-19': 112_000 })
    expect(logged).toHaveBeenCalledTimes(1)
    expect(logged.mock.calls[0]![0]).toContain(reservation.id)
  })
})

describe('reserving, when the reservation cannot be recorded', () => {
  it('gives back what it counted and rethrows', async () => {
    const memory = memoryLedgerStore()
    await memory.add(['2026-11', '2026-11-18'], 200_000)
    const failing: LedgerStore = {
      ...memory,
      async openReservation() {
        throw new Error('the database went away')
      },
    }
    const ledger = createLedger(failing, CONFIG, () => at('2026-11-19T12:00:00Z'))
    await expect(ledger.reserve(112_000)).rejects.toThrow('the database went away')
    expect(await memory.totals(['2026-11', '2026-11-19'])).toEqual({
      '2026-11': 200_000,
      '2026-11-19': 0,
    })
  })
})
