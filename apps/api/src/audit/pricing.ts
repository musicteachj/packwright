/**
 * What a reading costs, at list price, in integer micro-dollars.
 *
 * **Source: Anthropic, "Pricing", platform.claude.com/docs/en/about-claude/pricing, read on
 * 2026-11-19.** Its model table gives Claude Opus 5.5 at $4 / MTok base input, $5 / MTok for a
 * 5-minute cache write, $8 / MTok for a 1-hour cache write, $0.20 / MTok for cache hits and
 * refreshes (0.05x base input, its footnote 2) and $20 / MTok output. Open Door's pricing note
 * (`open-door/apps/api/app/ai/pricing.py`) recorded the same $4, $5, $0.20 and $20 from the same
 * page on 2026-10-14.
 *
 * **Only the model the reading uses is pinned.** A reply from any other model has no price here,
 * so `costMicros` says so with `undefined` and the caller settles the read at its full
 * reservation, which over-counts rather than guessing.
 *
 * **A 1-hour cache write has no price here either**, though the page gives one. The vision
 * request asks for no prompt caching, so a reply reporting one is a request this code did not
 * make, and it settles at the full reservation like an unknown model rather than at a rate
 * nobody checked against what was sent.
 *
 * **A reply billed at any other rate has no price either.** The same page lists US-only
 * inference (`inference_geo`) at 1.1x every rate, fast mode at $8 / $40 on Opus 5.5, and the
 * Batch API at half. The request asks for none of them, so a reply whose usage reports a speed
 * other than `standard`, a service tier other than `standard`, or an inference geography other
 * than `global` was billed at a rate this table does not hold. Priced at the standard rate it
 * would under-count (fast mode doubles the bill), so it is `undefined` and settles at the full
 * reservation instead. A field the reply leaves out or sends as null is read as the standard.
 *
 * Money is integers. A dollar per million tokens is a micro-dollar per token, so each rate is
 * held as micro-dollars per million tokens (an integer), the products are summed exactly, and
 * the one division at the end is rounded up: a fraction of a micro-dollar is charged, never
 * dropped. Summing the dollar rates as floats happens to land exactly for the rates pinned
 * today, but it would leave which way an amount rounds to the binary representation of the next
 * rate somebody adds (0.1 + 0.2 is 0.30000000000000004), so it is not relied on.
 */

import type Anthropic from '@anthropic-ai/sdk'

/** Dollars per million tokens, as the pricing page states them. */
export interface TokenPrice {
  inputUsdPerMTok: number
  cacheWriteUsdPerMTok: number
  cacheReadUsdPerMTok: number
  outputUsdPerMTok: number
}

/** Source: Anthropic's pricing page, read on 2026-11-19 (see the module note). */
export const PRICES: Readonly<Record<string, TokenPrice>> = Object.freeze({
  'claude-opus-5-5': Object.freeze({
    inputUsdPerMTok: 4,
    // The 5-minute write. A 1-hour write is not priced; see the module note.
    cacheWriteUsdPerMTok: 5,
    cacheReadUsdPerMTok: 0.2,
    outputUsdPerMTok: 20,
  }),
})

export const usdToMicros = (usd: number): number => Math.round(usd * 1_000_000)

/** Own properties only: `PRICES['constructor']` is a function, not a price. */
const priceOf = (model: string): TokenPrice | undefined =>
  Object.hasOwn(PRICES, model) ? PRICES[model] : undefined

/**
 * Tokens times rates, in millionths of a micro-dollar, then rounded up to micro-dollars. Each
 * rate is converted to micro-dollars per million tokens first, which is an integer for any price
 * quoted to the cent, so the sum is exact.
 */
function microsFor(parts: readonly (readonly [tokens: number, usdPerMTok: number])[]): number {
  const total = parts.reduce(
    (sum, [tokens, usdPerMTok]) => sum + tokens * usdToMicros(usdPerMTok),
    0,
  )
  return Math.ceil(total / 1_000_000)
}

/**
 * The reply's usage as it arrives. `speed` is in the reply (`recorded.json` carries it) but not in
 * this SDK's non-beta `Usage` type, so it is read through this one.
 */
type BilledUsage = Anthropic.Usage & { speed?: string | null }

/** Standard speed, the standard tier and global inference, or a field left out or null. */
function atStandardRate(usage: BilledUsage): boolean {
  const isOrAbsent = (value: string | null | undefined, expected: string) =>
    value === undefined || value === null || value === expected
  return (
    isOrAbsent(usage.speed, 'standard') &&
    isOrAbsent(usage.service_tier, 'standard') &&
    isOrAbsent(usage.inference_geo, 'global')
  )
}

/**
 * What a reply cost, rounded up to the micro-dollar, or `undefined` where this module cannot
 * say: an unpriced model, a reply that reports 1-hour cache writes, or one billed at a speed,
 * tier or geography other than the standard. A null or absent cache field counts as none.
 */
export function costMicros(model: string, usage: Anthropic.Usage): number | undefined {
  const price = priceOf(model)
  if (price === undefined) return undefined
  if ((usage.cache_creation?.ephemeral_1h_input_tokens ?? 0) > 0) return undefined
  if (!atStandardRate(usage)) return undefined
  return microsFor([
    [usage.input_tokens, price.inputUsdPerMTok],
    [usage.cache_creation_input_tokens ?? 0, price.cacheWriteUsdPerMTok],
    [usage.cache_read_input_tokens ?? 0, price.cacheReadUsdPerMTok],
    [usage.output_tokens, price.outputUsdPerMTok],
  ])
}

/**
 * The most a call can cost: every input token at the input rate and every output token the
 * request allows at the output rate, rounded up. Throws for an unpriced model, because a
 * reservation nobody can size is a call that must not be made.
 */
export function reservationMicros(model: string, inputTokens: number, maxTokens: number): number {
  const price = priceOf(model)
  if (price === undefined) throw new Error(`No price is pinned for ${model}.`)
  return microsFor([
    [inputTokens, price.inputUsdPerMTok],
    [maxTokens, price.outputUsdPerMTok],
  ])
}
