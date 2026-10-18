import { describe, expect, it } from 'vitest'
import { withDatabase } from '../testing/withDatabase'
import { AuditDay, databaseAllowance, memoryAllowance, utcDay } from './dailyAllowance'

const at = (iso: string) => () => new Date(iso)

describe('the daily allowance, in the database', () => {
  withDatabase()

  it('counts calls up to the limit and refuses past it', async () => {
    const allowance = databaseAllowance(at('2026-10-18T12:00:00Z'))
    const taken = [await allowance.take(2), await allowance.take(2), await allowance.take(2)]
    expect(taken).toEqual([true, true, false])
    expect(await AuditDay.findById('2026-10-18').lean()).toMatchObject({ calls: 2 })
  })

  it('keeps its count across a restart', async () => {
    // A second allowance is what a replaced task builds. The count the first
    // one kept in memory used to start again at zero.
    expect(await databaseAllowance(at('2026-10-18T09:00:00Z')).take(1)).toBe(true)
    expect(await databaseAllowance(at('2026-10-18T10:00:00Z')).take(1)).toBe(false)
  })

  it('lets no two calls at once take the last one', async () => {
    const allowance = databaseAllowance(at('2026-10-18T12:00:00Z'))
    const taken = await Promise.all(Array.from({ length: 20 }, () => allowance.take(5)))
    expect(taken.filter(Boolean)).toHaveLength(5)
    expect(await AuditDay.findById('2026-10-18').lean()).toMatchObject({ calls: 5 })
  })

  it('counts every one of the day’s first calls when they arrive together', async () => {
    // All of them find no document and try to create it; only one can. The rest
    // used to read that refusal as a full day, so with nine of ten calls left the
    // day answered "limit reached" (found by the medium review of fix 2).
    //
    // The collection is made first: creating it on the first insert happens to put
    // the racing calls in a queue, which hid the race from this test. Measured
    // without the retry, ten calls at once lost about three of every ten.
    await AuditDay.createCollection()
    for (let day = 1; day <= 20; day++) {
      const date = `2026-11-${String(day).padStart(2, '0')}`
      const allowance = databaseAllowance(at(`${date}T08:00:00Z`))
      const taken = await Promise.all(Array.from({ length: 10 }, () => allowance.take(10)))
      expect(taken, date).toEqual(Array(10).fill(true))
      expect(await AuditDay.findById(date).lean()).toMatchObject({ calls: 10 })
    }
  })

  it('starts each UTC day afresh', async () => {
    expect(await databaseAllowance(at('2026-10-18T23:59:59Z')).take(1)).toBe(true)
    expect(await databaseAllowance(at('2026-10-18T23:59:59Z')).take(1)).toBe(false)
    expect(await databaseAllowance(at('2026-10-19T00:00:00Z')).take(1)).toBe(true)
  })

  it('refuses every call at a limit of zero, the first included', async () => {
    expect(await databaseAllowance(at('2026-10-18T12:00:00Z')).take(0)).toBe(false)
    expect(await AuditDay.countDocuments()).toBe(0)
  })
})

describe('the daily allowance, in memory', () => {
  it('counts to the limit and starts each UTC day afresh', async () => {
    let now = '2026-10-18T23:00:00Z'
    const allowance = memoryAllowance(() => new Date(now))
    expect([await allowance.take(1), await allowance.take(1)]).toEqual([true, false])
    now = '2026-10-19T00:30:00Z'
    expect(await allowance.take(1)).toBe(true)
  })

  it('names the day by its UTC date', () => {
    expect(utcDay(new Date('2026-10-18T23:59:59-07:00'))).toBe('2026-10-19')
  })
})
