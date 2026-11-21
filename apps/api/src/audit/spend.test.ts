import Anthropic from '@anthropic-ai/sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExtractionDeclined, type ExtractLabel } from './extract'
import { recorded } from './fixtures/responses'
import { createLedger, memoryLedgerStore, type BudgetConfig, type SpendLedger } from './ledger'
import { knownUnbilled, metered, SpendRefused, SpendUnavailable } from './spend'

/**
 * Built the way the SDK builds them from a reply: `APIError.generate` with the reply's JSON body,
 * which is `{ type: 'error', error: { type, message, details } }`.
 */
const apiError = (
  status: number,
  type: string,
  message: string,
  details: Record<string, unknown> | null = null,
) =>
  Anthropic.APIError.generate(
    status,
    { type: 'error', error: { type, message, details } },
    undefined,
    new Headers(),
  )

describe('which provider errors were never billed', () => {
  // The two usage-limit messages are the documented openings (Anthropic, "Rate limits",
  // § Setting your own spend limit, read 2026-11-19); the rest of each message is not documented
  // and is elided here rather than made up.
  it.each([
    ['a revoked key (401)', apiError(401, 'authentication_error', 'invalid x-api-key')],
    ['a forbidden key (403)', apiError(403, 'permission_error', 'not allowed')],
    ['a billing error (402)', apiError(402, 'billing_error', 'credit balance too low')],
    [
      'the workspace usage limit (400)',
      apiError(
        400,
        'invalid_request_error',
        'You have reached your specified workspace API usage limits. ...',
      ),
    ],
    [
      'the organization usage limit (400)',
      apiError(
        400,
        'invalid_request_error',
        'You have reached your specified API usage limits. ...',
      ),
    ],
    [
      'the spend cap (429)',
      apiError(429, 'rate_limit_error', 'spend limit', {
        error_code: 'enforced_spend_limit_reached',
      }),
    ],
    ['a plain rate limit (429)', apiError(429, 'rate_limit_error', 'slow down')],
    ['an overload (529)', apiError(529, 'overloaded_error', 'Overloaded')],
    ['an overload by its type alone', apiError(503, 'overloaded_error', 'Overloaded')],
  ])('settles %s at nothing', (_, error) => expect(knownUnbilled(error)).toBe(true))

  it.each([
    ['any other bad request', apiError(400, 'invalid_request_error', 'image too large')],
    [
      'a bad request that only mentions a usage limit',
      apiError(
        400,
        'invalid_request_error',
        'messages.0: You have reached your specified API usage limits',
      ),
    ],
    ['a server error', apiError(500, 'api_error', 'oops')],
    ['a timeout', new Anthropic.APIConnectionTimeoutError()],
    ['our own abort', new Anthropic.APIUserAbortError()],
    ['anything else', new Error('?')],
  ])('keeps the reservation for %s', (_, error) => expect(knownUnbilled(error)).toBe(false))
})

/** $10 a month on 2026-11-19: twelve days left, so today may reserve 3 x 10,000,000 / 12. */
const CONFIG: BudgetConfig = {
  monthlyBudgetMicros: 10_000_000,
  pacingMultiplier: 3,
  dailyFloorMicros: 500_000,
}
const clock = () => new Date('2026-11-19T12:00:00Z')

const PHOTO = { mediaType: 'image/png', data: 'AAAA' } as const

const BILLED = { model: 'claude-opus-5-5', usage: recorded.usage }
/** What `recorded.usage` costs: worked by hand in `pricing.test.ts`, 19,908 micro-dollars. */
const RECORDED_COST = 19_908
const READING = {
  extraction: { fields: {}, warnings: [] },
  model: 'claude-opus-5-5',
  billed: BILLED,
}

function setup(config: BudgetConfig = CONFIG) {
  const ledger = createLedger(memoryLedgerStore(), config, clock)
  return { ledger, room: () => ledger.roomTodayMicros() }
}

const resolving = () => vi.fn<ExtractLabel>().mockResolvedValue(READING)
const rejecting = (error: unknown) => vi.fn<ExtractLabel>().mockRejectedValue(error)

describe('metered', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refuses before calling when the budget has no room', async () => {
    const { ledger } = setup({ ...CONFIG, monthlyBudgetMicros: 0 })
    const inner = resolving()
    await expect(metered(inner, ledger, 112_000)(PHOTO, 'eu-clp')).rejects.toBeInstanceOf(
      SpendRefused,
    )
    expect(inner).not.toHaveBeenCalled()
  })

  it('a ledger that cannot reserve is unavailable, not a crash', async () => {
    const { ledger } = setup()
    const down = new Error('no database')
    const broken: SpendLedger = { ...ledger, reserve: () => Promise.reject(down) }
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const inner = resolving()

    const error = await metered(inner, broken, 112_000)(PHOTO, 'eu-clp').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SpendUnavailable)
    expect((error as SpendUnavailable).cause).toBe(down)
    expect(inner).not.toHaveBeenCalled()
    expect(logged).toHaveBeenCalled()
  })

  it('settles a reading at what it cost', async () => {
    const { ledger, room } = setup()
    const before = await room()
    const reading = await metered(resolving(), ledger, 112_000)(PHOTO, 'eu-clp')
    expect(reading).toBe(READING)
    expect(await room()).toBe(before - RECORDED_COST)
  })

  it('settles a billed failure at what it cost, then raises it', async () => {
    const { ledger, room } = setup()
    const before = await room()
    const declined = new ExtractionDeclined('cyber')
    declined.billed = BILLED

    await expect(metered(rejecting(declined), ledger, 112_000)(PHOTO, 'eu-clp')).rejects.toBe(
      declined,
    )
    expect(await room()).toBe(before - RECORDED_COST)
  })

  it('settles a known-unbilled failure at nothing', async () => {
    const { ledger, room } = setup()
    const before = await room()
    const revoked = apiError(401, 'authentication_error', 'invalid x-api-key')

    await expect(metered(rejecting(revoked), ledger, 112_000)(PHOTO, 'eu-clp')).rejects.toBe(
      revoked,
    )
    expect(await room()).toBe(before)
  })

  it('keeps the whole reservation when the outcome is unknown', async () => {
    const { ledger, room } = setup()
    const before = await room()
    const timeout = new Anthropic.APIConnectionTimeoutError()

    await expect(metered(rejecting(timeout), ledger, 112_000)(PHOTO, 'eu-clp')).rejects.toBe(
      timeout,
    )
    expect(await room()).toBe(before - 112_000)
  })

  it('settles a reply from a model with no price at the whole reservation', async () => {
    const { ledger, room } = setup()
    const before = await room()
    const unpriced = vi.fn<ExtractLabel>().mockResolvedValue({
      ...READING,
      model: 'claude-unknown',
      billed: { model: 'claude-unknown', usage: recorded.usage },
    })

    await metered(unpriced, ledger, 112_000)(PHOTO, 'eu-clp')
    expect(await room()).toBe(before - 112_000)
  })

  it('a ledger that cannot settle does not take the reading away', async () => {
    const { ledger } = setup()
    const down = new Error('no database')
    const settle = vi.fn<SpendLedger['settle']>().mockRejectedValue(down)
    const broken: SpendLedger = { ...ledger, settle }
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(metered(resolving(), broken, 112_000)(PHOTO, 'eu-clp')).resolves.toBe(READING)
    expect(logged).toHaveBeenCalledWith(expect.anything(), down)
    // Once: a settle that failed is not tried again on the failure path.
    expect(settle).toHaveBeenCalledTimes(1)
  })

  it('neither reserves nor calls for a visitor who has already left', async () => {
    const { ledger, room } = setup()
    const before = await room()
    const reserve = vi.spyOn(ledger, 'reserve')
    const inner = resolving()
    const controller = new AbortController()
    controller.abort()

    await expect(
      metered(inner, ledger, 112_000)(PHOTO, 'eu-clp', { signal: controller.signal }),
    ).rejects.toBeInstanceOf(Anthropic.APIUserAbortError)
    expect(reserve).not.toHaveBeenCalled()
    expect(inner).not.toHaveBeenCalled()
    expect(await room()).toBe(before)
  })

  it('gives the reservation back when the visitor leaves while it is being made', async () => {
    const { ledger, room } = setup()
    const before = await room()
    const controller = new AbortController()
    // The visitor leaves after the ledger has counted the reservation and before it answers.
    const leaving: SpendLedger = {
      ...ledger,
      reserve: async (micros) => {
        const reservation = await ledger.reserve(micros)
        controller.abort()
        return reservation
      },
    }
    const inner = resolving()

    await expect(
      metered(inner, leaving, 112_000)(PHOTO, 'eu-clp', { signal: controller.signal }),
    ).rejects.toBeInstanceOf(Anthropic.APIUserAbortError)
    expect(inner).not.toHaveBeenCalled()
    expect(await room()).toBe(before)
  })

  it('passes the signal through', async () => {
    const { ledger } = setup()
    const inner = resolving()
    const signal = new AbortController().signal

    await metered(inner, ledger, 112_000)(PHOTO, 'eu-clp', { signal })
    expect(inner).toHaveBeenCalledTimes(1)
    expect(inner.mock.calls[0]![0]).toBe(PHOTO)
    expect(inner.mock.calls[0]![1]).toBe('eu-clp')
    expect(inner.mock.calls[0]![2]?.signal).toBe(signal)
  })
})
