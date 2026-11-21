import { createHash } from 'node:crypto'
import { ipKeyGenerator } from 'express-rate-limit'
import { describe, expect, it } from 'vitest'
import { withDatabase } from '../testing/withDatabase'
import {
  AuditVisitorDay,
  databaseVisitorAllowance,
  memoryVisitorAllowance,
  visitorKey,
  type VisitorAllowance,
} from './visitorAllowance'

const KEY = 'k'.repeat(32)
const KEY_A = 'a'.repeat(32)
const KEY_B = 'b'.repeat(32)
const at = (iso: string) => () => new Date(iso)

const implementations: Array<[string, (now: () => Date) => VisitorAllowance]> = [
  ['in the database', databaseVisitorAllowance],
  ['in memory', memoryVisitorAllowance],
]

describe.each(implementations)('the per-visitor allowance, %s', (name, build) => {
  if (name === 'in the database') withDatabase()

  it('takes reads until the limit, then refuses', async () => {
    const allowance = build(at('2026-11-19T12:00:00Z'))
    const left = [await allowance.left('v', 5)]
    const taken: boolean[] = []
    for (let i = 0; i < 6; i++) {
      taken.push(await allowance.take('v', 5))
      left.push(await allowance.left('v', 5))
    }
    expect(taken).toEqual([true, true, true, true, true, false])
    expect(left).toEqual([5, 4, 3, 2, 1, 0, 0])
  })

  it('counts each visitor apart', async () => {
    const allowance = build(at('2026-11-19T12:00:00Z'))
    expect(await allowance.take('one', 1)).toBe(true)
    expect(await allowance.take('one', 1)).toBe(false)
    expect(await allowance.take('two', 1)).toBe(true)
  })

  it('starts a new UTC day at zero', async () => {
    let now = '2026-11-19T23:59:00Z'
    const allowance = build(() => new Date(now))
    expect(await allowance.take('v', 1)).toBe(true)
    expect(await allowance.take('v', 1)).toBe(false)
    now = '2026-11-20T00:01:00Z'
    expect(await allowance.left('v', 1)).toBe(1)
    expect(await allowance.take('v', 1)).toBe(true)
  })

  it('refuses everything at a limit of zero', async () => {
    const allowance = build(at('2026-11-19T12:00:00Z'))
    expect(await allowance.take('v', 0)).toBe(false)
    expect(await allowance.left('v', 0)).toBe(0)
  })
})

describe('the per-visitor allowance, in the database only', () => {
  withDatabase()

  it('two first reads at once are both counted', async () => {
    await AuditVisitorDay.createCollection()
    for (let day = 1; day <= 20; day++) {
      const date = `2026-11-${String(day).padStart(2, '0')}`
      const allowance = databaseVisitorAllowance(at(`${date}T08:00:00Z`))
      const taken = await Promise.all([allowance.take('v', 5), allowance.take('v', 5)])
      expect(taken, date).toEqual([true, true])
      expect(await AuditVisitorDay.findById(`${date}:v`).lean()).toMatchObject({ reads: 2 })
    }
  })

  it('stores no address, and no unkeyed hash of one', async () => {
    const ip = '203.0.113.7'
    const allowance = databaseVisitorAllowance(at('2026-11-19T12:00:00Z'))
    expect(await allowance.take(visitorKey(KEY, ip), 5)).toBe(true)
    const stored = await AuditVisitorDay.find().lean()
    expect(stored).toHaveLength(1)
    const unkeyed = createHash('sha256').update(ipKeyGenerator(ip)).digest('hex').slice(0, 32)
    expect(stored[0]!._id).not.toContain(ip)
    expect(stored[0]!._id).not.toContain(unkeyed)
  })

  it('forgets a visitor within two days', async () => {
    const allowance = databaseVisitorAllowance(at('2026-11-19T15:30:00Z'))
    await allowance.take('v', 5)
    const stored = await AuditVisitorDay.findById('2026-11-19:v').lean()
    expect(stored?.expiresAt.toISOString()).toBe('2026-11-21T00:00:00.000Z')
  })
})

describe('the visitor key', () => {
  it('gives the same address a different visitor under another key', () => {
    const a = visitorKey(KEY_A, '203.0.113.7')
    const b = visitorKey(KEY_B, '203.0.113.7')
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(b).toMatch(/^[0-9a-f]{32}$/)
  })

  it('groups an IPv6 visitor by its /56', () => {
    // Same /56, different /64s: only /56 grouping makes these equal.
    expect(visitorKey(KEY, '2001:db8:0:100::1')).toBe(visitorKey(KEY, '2001:db8:0:1ff::1'))
    // Different /56s.
    expect(visitorKey(KEY, '2001:db8:0:100::1')).not.toBe(visitorKey(KEY, '2001:db8:0:200::1'))
    expect(visitorKey(KEY, '203.0.113.7')).not.toBe(visitorKey(KEY, '203.0.113.8'))
  })
})
