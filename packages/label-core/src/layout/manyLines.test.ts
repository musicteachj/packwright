/**
 * A block of more lines than a call can take arguments is still laid out.
 *
 * The widest line was found with `Math.max(...lines)`, which passes every line as an
 * argument and fails past about 122,000 of them: an ingredient list of one-letter words
 * on a narrow label did that inside the 256 KB body limit and answered a 500
 * (`docs/security-review-2026-10-18.md`, finding 1). Both engines that measure their
 * blocks that way are given one line per word here, and so are the rules, which found the
 * smallest line the same way (`rules/usFood/printedText.ts`).
 */
import { describe, expect, it } from 'vitest'
import { judgeLabel } from '../judge/judge'
import { GHS_CONFORMANT } from '../rules/fixtures/ghs'
import { US_FOOD_CONFORMANT } from '../rules/fixtures/usFood'
import { layOutGhsLabel } from './ghsEngine'
import { layOutUsFoodLabel } from './usFoodEngine'

const WORDS = 'a '.repeat(130_000).trim()
const NARROW = { widthMm: 3, heightMm: 1_000, marginMm: 0 }

describe('a block of more lines than a call takes arguments', () => {
  it('is laid out by the US food engine', () => {
    const layout = layOutUsFoodLabel({
      data: { ...US_FOOD_CONFORMANT.data, ingredients: [{ name: WORDS }] },
      stock: NARROW,
    })
    expect(layout.primitives.length).toBeGreaterThan(130_000)
  })

  it('is laid out by the GHS engine', () => {
    const layout = layOutGhsLabel({
      data: { ...GHS_CONFORMANT.data, productIdentifier: WORDS },
      stock: NARROW,
    })
    expect(layout.primitives.length).toBeGreaterThan(130_000)
  })

  it('is judged by the US food rules', () => {
    const judged = judgeLabel({
      labelType: 'us-food',
      data: { ...US_FOOD_CONFORMANT.data, ingredients: [{ name: WORDS }] },
      stock: NARROW,
    })
    expect(judged.outcome).toBe('judged')
  })
})
