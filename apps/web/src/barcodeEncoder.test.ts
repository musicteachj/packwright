import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import { DEFAULT_UPC_A_STOCK, layOutUpcALabel } from '@packwright/label-core'
import { placeholderUpcALayout } from './barcodeEncoder'

/**
 * The placeholder is the real layout with the symbol's ink taken out.
 *
 * Compared against the layout bwip-js produces for the same request, so "holds the same
 * box" is checked against the thing it stands in for, not against a figure measured once.
 */
describe('the barcode placeholder', () => {
  for (const [name, request] of [
    ['the landing page’s label', { data: { gtin: '036000291452' }, stock: DEFAULT_UPC_A_STOCK }],
    [
      'a label at 150% on wider stock, digits left off',
      {
        data: { gtin: '012000161155', magnification: 1.5, omitHri: true },
        stock: { widthMm: 90, heightMm: 50, marginMm: 3 },
      },
    ],
  ] as const) {
    it(`lays out ${name} exactly as the engine does, without the bars`, () => {
      const real = layOutUpcALabel(bwip as never, request)
      const placeholder = placeholderUpcALayout(request)

      // Everything the figure is sized from: the label, its elements, the symbol's facts.
      expect(placeholder.widthMm).toBe(real.widthMm)
      expect(placeholder.heightMm).toBe(real.heightMm)
      expect(placeholder.elements).toEqual(real.elements)
      expect(placeholder.symbols).toEqual(real.symbols)
      expect(placeholder.omissions).toEqual(real.omissions)

      // And none of the symbol's ink, while everything else is drawn as it will be.
      const symbolIds = new Set(real.symbols.map((symbol) => symbol.elementId))
      const isSymbol = (p: { elementId?: string }) =>
        p.elementId !== undefined && symbolIds.has(p.elementId)
      // The premise: the real layout does draw ink for its symbol.
      expect(real.primitives.some(isSymbol)).toBe(true)
      expect(placeholder.primitives.some(isSymbol)).toBe(false)
      expect(placeholder.primitives).toEqual(real.primitives.filter((p) => !isSymbol(p)))
    })
  }
})
