import { describe, expect, it } from 'vitest'
import { measureClearSpace } from './clearSpace'
import type { PlacedSymbol, ResolvedElement } from './types'

/**
 * A symbol whose bar pattern runs from 20 mm to 40 mm, 10 mm tall, on a 60 mm
 * label. Round numbers so an expected value is arithmetic rather than a figure
 * copied out of a test run.
 */
const SYMBOL: PlacedSymbol = {
  elementId: 'symbol',
  symbology: 'UPC-A',
  value: '036000291452',
  xDimensionMm: 0.33,
  barPatternWidthMm: 20,
  barHeightMm: 10,
  xMm: 20,
  yMm: 5,
  drawnHeightMm: 10,
  guardBarHeightMm: 8,
  requiredQuietZoneLeftMm: 2.97,
  requiredQuietZoneRightMm: 2.97,
}

const block = (xMm: number, widthMm: number, yMm = 5, heightMm = 10): ResolvedElement => ({
  elementId: 'artwork',
  label: 'Artwork block',
  box: { xMm, yMm, widthMm, heightMm },
})

const measure = (elements: ResolvedElement[] = [], labelWidthMm = 60) =>
  measureClearSpace({ symbol: SYMBOL, elements, labelWidthMm })

describe('measureClearSpace', () => {
  it('measures to the trim edges when the label is otherwise empty', () => {
    expect(measure()).toEqual({ clearSpaceLeftMm: 20, clearSpaceRightMm: 20, overprintedBy: [] })
  })

  it('measures to the nearest encroaching box', () => {
    expect(measure([block(0, 12)]).clearSpaceLeftMm).toBe(8)
    expect(measure([block(45, 10)]).clearSpaceRightMm).toBe(5)
  })

  it('takes the nearest of several boxes on the same side', () => {
    expect(measure([block(0, 5), block(6, 9), block(2, 3)]).clearSpaceLeftMm).toBe(5)
  })

  it('ignores boxes that do not sit level with the symbol', () => {
    // Level with nothing: the block sits entirely above the symbol's band.
    expect(measure([block(0, 18, 0, 4)]).clearSpaceLeftMm).toBe(20)
  })

  it('treats boxes that merely touch the band as clear of it', () => {
    // The block's bottom edge is exactly the symbol's top edge. Touching is not
    // overlapping, or every element on a tightly-set label would encroach.
    expect(measure([block(0, 18, 0, 5)]).clearSpaceLeftMm).toBe(20)
  })

  it('reports zero, not a negative, for a box drawn across the bars', () => {
    // An element overlapping the bars has destroyed the quiet zone, but that is
    // a different failure from the symbol hanging off the stock — and the caller
    // needs to be able to tell them apart.
    expect(measure([block(0, 25)]).clearSpaceLeftMm).toBe(0)
    expect(measure([block(35, 20)]).clearSpaceRightMm).toBe(0)
  })

  it('excludes the symbol’s own boxes', () => {
    // The leading and trailing human-readable digits sit inside the quiet zone
    // by design. Counting them fails every conformant UPC-A.
    const own: ResolvedElement = {
      elementId: 'symbol',
      label: 'UPC-A symbol',
      box: { xMm: 17, yMm: 5, widthMm: 26, heightMm: 10 },
    }
    expect(measure([own])).toEqual({
      clearSpaceLeftMm: 20,
      clearSpaceRightMm: 20,
      overprintedBy: [],
    })
  })

  it('records artwork drawn over the bars, which clear space alone cannot see', () => {
    // The gap this closes. A 6 mm block in the middle of a 20 mm bar pattern
    // leaves both quiet zones untouched at their full 20 mm, and destroys the
    // symbol. Measuring only left and right reported it as fully compliant.
    const overprint = measure([block(27, 6)])
    expect(overprint.clearSpaceLeftMm).toBe(20)
    expect(overprint.clearSpaceRightMm).toBe(20)
    expect(overprint.overprintedBy).toEqual(['artwork'])
  })

  it('does not call artwork beside the symbol an overprint', () => {
    expect(measure([block(0, 12)]).overprintedBy).toEqual([])
    expect(measure([block(45, 10)]).overprintedBy).toEqual([])
  })

  it('counts a block spanning the whole symbol as an overprint', () => {
    expect(measure([block(0, 60)]).overprintedBy).toEqual(['artwork'])
  })

  it('goes negative when the bars run off the label', () => {
    // A 20 mm bar pattern starting at 20 mm on a 30 mm label overhangs by 10 mm.
    expect(measure([], 30).clearSpaceRightMm).toBe(-10)
  })
})
