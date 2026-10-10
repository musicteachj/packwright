import { layOutGhsLabel } from '../layout/ghsEngine'
import type { ResolvedLayout } from '../layout/types'
import { DEFAULT_GHS_STOCK } from '../templates/ghs'
import { describe, expect, it } from 'vitest'
import { uncheckableIn } from './uncheckable'

/**
 * What no rule can judge, assembled once.
 *
 * It was written twice — once in the editor's store and once in the audit
 * report — and both now call this.
 */

const ghs = layOutGhsLabel({
  stock: DEFAULT_GHS_STOCK,
  data: {
    regime: 'eu-clp',
    productIdentifier: 'Acetone',
    capacityL: 1,
    signalWords: ['Danger'],
    pictograms: ['GHS02', 'GHS07'],
  },
})

describe('what cannot be checked', () => {
  it('carries the engine’s explanation through rather than only its sentence', () => {
    const items = uncheckableIn(ghs)
    const reasons = items.flatMap((item) => item.reasons)
    const explained = reasons.filter((reason) => reason.explanation !== undefined)
    expect(explained.length).toBeGreaterThanOrEqual(2)
    for (const reason of explained) {
      expect(reason.text, 'the whole sentence is still there').toBe(
        `${reason.explanation!.what} ${reason.explanation!.why}`,
      )
    }
  })

  it('says an overprinted symbol was not certified, wherever the layout came from', () => {
    // Kept from the editor's copy. The audit's left it out because an audit
    // layout has no symbols; one builder means the half is shared, not lost.
    const overprinted: ResolvedLayout = {
      widthMm: 60,
      heightMm: 40,
      primitives: [],
      elements: [],
      pictograms: [],
      omissions: [],
      symbols: [
        {
          elementId: 'symbol',
          symbology: 'UPC-A',
          overprintedBy: ['artwork'],
        } as never,
      ],
    }
    const [item] = uncheckableIn(overprinted)
    expect(item!.elementId).toBe('symbol')
    // Exactly, because it is report text a reader sees, and since 2026-10-10 the MCP
    // server says it too: a mutation that reworded it passed the old `toContain`.
    expect(item!.reasons[0]!.text).toBe(
      'Artwork is printed over the UPC-A symbol. A symbol with ink through it will not scan ' +
        'whatever its margins measure.',
    )
  })

  it('has nothing to say about no layout at all', () => {
    expect(uncheckableIn(null)).toEqual([])
  })
})
