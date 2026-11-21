import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { recorded } from './fixtures/responses'
import { costMicros, PRICES, reservationMicros, usdToMicros } from './pricing'

/**
 * Every expected value here is worked by hand from Anthropic's pricing page, read on 2026-11-19:
 * Claude Opus 5.5 at $4 / MTok input, $5 / MTok 5-minute cache write, $0.20 / MTok cache read and
 * $20 / MTok output. A dollar per million tokens is a micro-dollar per token, so 2,537 input tokens
 * at $4 / MTok are 10,148 micro-dollars. None was produced by running `costMicros`.
 */

/** A usage with nothing in it but what a test names. */
const usage = (fields: Partial<Anthropic.Usage>): Anthropic.Usage => ({
  cache_creation: null,
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
  inference_geo: null,
  input_tokens: 0,
  output_tokens: 0,
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: null,
  ...fields,
})

describe('the price of a reading', () => {
  it('prices the recorded reading at list price', () => {
    // 2,537 input x 4 + 488 output x 20 = 10,148 + 9,760
    expect(costMicros('claude-opus-5-5', recorded.usage)).toBe(19_908)
  })

  it('rounds a fraction of a micro-dollar up', () => {
    // 1,000 x 4 + 3 cache reads x 0.2 = 4,000.6
    expect(
      costMicros('claude-opus-5-5', usage({ input_tokens: 1_000, cache_read_input_tokens: 3 })),
    ).toBe(4_001)
  })

  it('does not round a whole amount up', () => {
    // 15 cache reads x 0.2 = 3 exactly, so rounding up adds nothing.
    expect(costMicros('claude-opus-5-5', usage({ cache_read_input_tokens: 15 }))).toBe(3)
  })

  it('prices a 5-minute cache write at its own rate', () => {
    // 1,000 x 4 + 200 cache writes x 5 = 4,000 + 1,000
    expect(
      costMicros(
        'claude-opus-5-5',
        usage({
          input_tokens: 1_000,
          cache_creation_input_tokens: 200,
          cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 0 },
        }),
      ),
    ).toBe(5_000)
  })

  it('counts a null cache field as nothing', () => {
    // 100 x 4 + 10 x 20
    expect(costMicros('claude-opus-5-5', usage({ input_tokens: 100, output_tokens: 10 }))).toBe(600)
  })

  it('counts an absent cache field as nothing', () => {
    // The reply is the API's JSON, so a field the type calls nullable can be missing outright,
    // and undefined x 4 is NaN where null x 4 is 0. 100 x 4 + 10 x 20
    const bare = { input_tokens: 100, output_tokens: 10 } as unknown as Anthropic.Usage
    expect(costMicros('claude-opus-5-5', bare)).toBe(600)
  })

  it('prices the recorded reading, which was standard speed, standard tier and global', () => {
    expect(recorded.usage).toMatchObject({
      speed: 'standard',
      service_tier: 'standard',
      inference_geo: 'global',
    })
    // 2,537 x 4 + 488 x 20 = 10,148 + 9,760
    expect(costMicros('claude-opus-5-5', recorded.usage)).toBe(19_908)
  })

  it.each([
    // The pricing page (read 2026-11-19): fast mode is $8 / $40 on Opus 5.5.
    ['fast mode', { speed: 'fast' }],
    // The same page: US-only inference costs 1.1x.
    ['US-only inference', { inference_geo: 'us' }],
    // A tier the request did not ask for, priced at nothing pinned here.
    ['the priority tier', { service_tier: 'priority' }],
    ['the batch tier', { service_tier: 'batch' }],
  ])('has no price for a reply billed at %s, which the request never asks for', (_, premium) => {
    // `speed` is in the reply but not in the SDK's `Usage` type, hence the cast.
    const billed = { ...recorded.usage, ...premium } as unknown as Anthropic.Usage
    expect(costMicros('claude-opus-5-5', billed)).toBeUndefined()
  })

  it('has no price for a model nobody pinned', () => {
    expect(costMicros('claude-unknown', recorded.usage)).toBeUndefined()
  })

  it('has no price for a 1-hour cache write, which the request never asks for', () => {
    // The page prices it at $8 / MTok, but no rate for it is pinned here, so a reply reporting one
    // settles at its full reservation rather than at a guess.
    expect(
      costMicros(
        'claude-opus-5-5',
        usage({
          input_tokens: 1_000,
          cache_creation_input_tokens: 500,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 500 },
        }),
      ),
    ).toBeUndefined()
  })

  it("does not look up a price on the table's prototype", () => {
    expect(costMicros('constructor', recorded.usage)).toBeUndefined()
    expect(() => reservationMicros('constructor', 1, 1)).toThrow()
  })
})

describe('a reservation', () => {
  it("reserves a read's worst case", () => {
    // 8,000 x 4 + 4,000 x 20
    expect(reservationMicros('claude-opus-5-5', 8_000, 4_000)).toBe(112_000)
  })

  it('refuses to reserve for a model nobody pinned', () => {
    expect(() => reservationMicros('claude-unknown', 8_000, 4_000)).toThrow(/claude-unknown/)
  })
})

describe('the price table', () => {
  it('holds the figures the pricing page gives, and only for the model the reading uses', () => {
    expect(PRICES).toEqual({
      'claude-opus-5-5': {
        inputUsdPerMTok: 4,
        cacheWriteUsdPerMTok: 5,
        cacheReadUsdPerMTok: 0.2,
        outputUsdPerMTok: 20,
      },
    })
  })

  it('converts dollars to micro-dollars', () => {
    expect(usdToMicros(10)).toBe(10_000_000)
    expect(usdToMicros(0.112)).toBe(112_000)
  })
})
