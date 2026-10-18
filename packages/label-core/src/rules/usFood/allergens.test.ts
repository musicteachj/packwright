import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAJOR_FOOD_ALLERGEN_IDS } from '../../fda/allergens'
import { layOutUsFoodLabel } from '../../layout/usFoodEngine'
import type { UsFoodIngredient } from '../../templates/usFood'
import { US_FOOD_CONFORMANT } from '../fixtures/usFood'
import type { UsFoodContext } from '../types'
import { usFoodAllergenRule } from './allergens'

/**
 * The printed list is searched for each allergen with the names of the other
 * ingredients struck out, and that was once done for every ingredient bearing an
 * allergen: 900 milk and egg entries took 1.7 s (`docs/security-review-2026-10-18.md`,
 * finding 1; found by the high review of #109). The strike-outs are counted, not timed.
 */
describe('the allergen rule strikes out names once per allergen', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('splits the list no more than once per allergen for each ingredient', () => {
    const ingredients: UsFoodIngredient[] = Array.from({ length: 300 }, (_, i) => ({
      name: `entry ${i}`,
      allergen: i % 2 === 0 ? 'milk' : 'egg',
    }))
    const data = { ...US_FOOD_CONFORMANT.data, ingredients }
    const layout = layOutUsFoodLabel({ data, stock: { widthMm: 400, heightMm: 600, marginMm: 5 } })
    const context = { labelType: 'us-food', data, layout } as unknown as UsFoodContext

    const split = vi.spyOn(String.prototype, 'split')
    usFoodAllergenRule.check(context)
    const splits = split.mock.calls.length
    split.mockRestore()

    // Two allergens, each striking out the other's 150 names: 300 in all, where once
    // per bearing ingredient it was 300 × 150.
    expect(splits).toBeLessThanOrEqual(MAJOR_FOOD_ALLERGEN_IDS.length * ingredients.length)
    expect(splits).toBeLessThanOrEqual(2 * ingredients.length)
  })
})
