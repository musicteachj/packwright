/**
 * A margin that leaves no panel is refused, by all three engines alike.
 *
 * The check is one function, `assertMarginLeavesPanel`, and each engine calls it.
 * It is tested through the engines rather than on its own, because what matters
 * is that every engine refuses — a check shared by three callers is still skipped
 * by the one that stops calling it.
 *
 * The boundary is zero, exactly. On 74 mm GHS stock a 37 mm margin left a panel no
 * width at all and exported with every statement running off the right edge,
 * while 36.99 mm was refused export — so the case that must be refused is the one
 * at equality, and the case just short of it must still resolve.
 */

import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import { CONFORMANT_FIXTURE as GS1_CONFORMANT } from '../rules/fixtures/gs1Retail'
import { GHS_CONFORMANT } from '../rules/fixtures/ghs'
import { US_FOOD_CONFORMANT } from '../rules/fixtures/usFood'
import type { LabelStock } from '../templates/stock'
import { LayoutError, layOutUpcALabel } from './engine'
import { layOutGhsLabel } from './ghsEngine'
import { layOutUsFoodLabel } from './usFoodEngine'

const ENGINES = [
  [
    'layOutUpcALabel',
    (stock: LabelStock) => layOutUpcALabel(bwip as never, { data: GS1_CONFORMANT.data, stock }),
  ],
  ['layOutGhsLabel', (stock: LabelStock) => layOutGhsLabel({ data: GHS_CONFORMANT.data, stock })],
  [
    'layOutUsFoodLabel',
    (stock: LabelStock) => layOutUsFoodLabel({ data: US_FOOD_CONFORMANT.data, stock }),
  ],
] as const

describe.each(ENGINES)('%s', (_name, layOut) => {
  it('refuses a margin that leaves a panel no width', () => {
    expect(() => layOut({ widthMm: 40, heightMm: 60, marginMm: 20 })).toThrow(LayoutError)
  })

  it('refuses a margin that leaves a panel no height', () => {
    expect(() => layOut({ widthMm: 60, heightMm: 40, marginMm: 20 })).toThrow(LayoutError)
  })

  it('refuses a margin wider than the stock, and says why', () => {
    expect(() => layOut({ widthMm: 60, heightMm: 200, marginMm: 65 })).toThrow(
      /65 mm margin leaves no panel on 60 x 200 mm stock/,
    )
  })

  it('still draws on a panel just short of nothing', () => {
    expect(() => layOut({ widthMm: 40, heightMm: 60, marginMm: 19.99 })).not.toThrow()
    expect(() => layOut({ widthMm: 60, heightMm: 40, marginMm: 19.99 })).not.toThrow()
  })
})
