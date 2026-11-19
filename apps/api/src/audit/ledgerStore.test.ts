import { describe, expect, it, vi } from 'vitest'
import { withDatabase } from '../testing/withDatabase'
import { createLedger } from './ledger'
import { AiReservation, AiSpend, mongoLedgerStore } from './ledgerStore'

const T = new Date('2026-11-19T12:00:00Z')
const minutes = (n: number) => new Date(T.getTime() + n * 60_000)

describe('the spend ledger, in the database', () => {
  withDatabase()

  it('adds within a ceiling, and refuses past it', async () => {
    const store = mongoLedgerStore()
    const added = [
      await store.addWithin('2026-11-19', 100, 250),
      await store.addWithin('2026-11-19', 100, 250),
      await store.addWithin('2026-11-19', 100, 250),
    ]
    expect(added).toEqual([true, true, false])
    expect(await store.totals(['2026-11-19'])).toEqual({ '2026-11-19': 200 })
  })

  it('refuses at once what is larger than its ceiling, and writes nothing', async () => {
    const store = mongoLedgerStore()
    expect(await store.addWithin('2026-11', 112_000, 0)).toBe(false)
    expect(await store.totals(['2026-11'])).toEqual({ '2026-11': 0 })
  })

  it('reports 0 for a period it has never seen', async () => {
    expect(await mongoLedgerStore().totals(['2026-11', '2026-11-19'])).toEqual({
      '2026-11': 0,
      '2026-11-19': 0,
    })
  })

  it('adds to every period it is given, negative amounts included', async () => {
    const store = mongoLedgerStore()
    await store.add(['2026-11', '2026-11-19'], 112_000)
    await store.add(['2026-11', '2026-11-19'], -92_092)
    // 112,000 - 92,092
    expect(await store.totals(['2026-11', '2026-11-19'])).toEqual({
      '2026-11': 19_908,
      '2026-11-19': 19_908,
    })
  })

  it('writes a day before its month, one after the other, whatever order it is given them in', async () => {
    // A reader takes the month and then the day. Giving back the day first means that reader can
    // see the month not yet lowered beside a day that is, which overstates what was spent before
    // today, and never the reverse.
    const bulkWrite = vi.spyOn(AiSpend, 'bulkWrite')
    try {
      await mongoLedgerStore().add(['2026-11', '2026-11-19'], -92_092)
      const [operations, options] = bulkWrite.mock.calls[0]!
      expect(operations).toMatchObject([
        { updateOne: { filter: { _id: '2026-11-19' } } },
        { updateOne: { filter: { _id: '2026-11' } } },
      ])
      expect(options).toMatchObject({ ordered: true })
    } finally {
      bulkWrite.mockRestore()
    }
  })

  it('ten reservations at once never pass the day or the month', async () => {
    const store = mongoLedgerStore()
    await store.add(['2026-11', '2026-11-05'], 9_000_000)
    // 1,000,000 left over 12 days: 3 x 1,000,000 / 12 = 250,000, so the floor of 500,000.
    const ledger = createLedger(
      store,
      { monthlyBudgetMicros: 10_000_000, pacingMultiplier: 3, dailyFloorMicros: 500_000 },
      () => new Date('2026-11-19T12:00:00Z'),
    )
    const reserved = await Promise.all(Array.from({ length: 10 }, () => ledger.reserve(112_000)))
    expect(reserved.filter((r) => r !== undefined)).toHaveLength(4)
    // 4 x 112,000; a fifth would be 560,000, past the day's 500,000.
    expect(await store.totals(['2026-11', '2026-11-19'])).toEqual({
      '2026-11': 9_448_000,
      '2026-11-19': 448_000,
    })
    expect(await AiReservation.countDocuments({ state: 'open' })).toBe(4)
  })

  it('closes a reservation once', async () => {
    const store = mongoLedgerStore()
    const id = await store.openReservation('2026-11-19', 112_000, T)
    expect(await store.closeReservation(id, 19_908, minutes(1))).toBe(true)
    expect(await store.closeReservation(id, 0, minutes(2))).toBe(false)
    expect(await AiReservation.findById(id).lean()).toMatchObject({
      state: 'settled',
      actualMicros: 19_908,
      closedAt: minutes(1),
    })
  })

  it('charges only stale open reservations', async () => {
    const store = mongoLedgerStore()
    const stale = await store.openReservation('2026-11-19', 112_000, T)
    const fresh = await store.openReservation('2026-11-19', 112_000, minutes(11))
    expect(await store.chargeStale(minutes(10))).toBe(1)
    expect(await AiReservation.findById(stale).lean()).toMatchObject({ state: 'charged' })
    expect(await AiReservation.findById(fresh).lean()).toMatchObject({ state: 'open' })
    // Charged is closed: a settle that arrives afterwards finds nothing open.
    expect(await store.closeReservation(stale, 0, minutes(12))).toBe(false)
  })
})
