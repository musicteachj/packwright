import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import { layOutUpcALabel } from '../../layout/engine'
import type { UpcALabelData } from '../../templates/upcA'
import { VALID_GTIN } from '../fixtures/gs1Retail'
import { declinedChecks, runRules } from '../registry'
import type { Gs1RetailContext, LabelSubject } from '../types'
import { GS1_BAR_HEIGHT_SUFFICIENT, barHeightRule } from './barHeight'
import { GS1_MAGNIFICATION_OUT_OF_RANGE, magnificationRule } from './magnification'

const STOCK = { widthMm: 60, heightMm: 40, marginMm: 3 }

const contextFor = (data: UpcALabelData, subject: LabelSubject = 'drawing'): Gs1RetailContext => ({
  labelType: 'gs1-retail',
  data,
  stock: STOCK,
  layout: layOutUpcALabel(bwip, { data, stock: STOCK }),
  subject,
})

/**
 * Table 5-44 footnote (*), read from the rendered page 411 of GenSpec 26.0 on 2026-10-18:
 * "The allowance for X-dimensions between 0.249 millimetre (0.0098 inch) and 0.264
 * millimetre (0.0104 inch) is only applicable to on demand (e.g., thermal, laser) print
 * processes." A label does not say how it is printed, so a symbol in that band is neither
 * passed nor reported (James's decision of 2026-10-18). It was reported as below the
 * range until then (verification record of 2026-10-17, item 12).
 */
describe('gs1/magnification in the on-demand band', () => {
  it('gives no verdict at 0.77x and says it is a limit of the tool', () => {
    const context = contextFor({ gtin: VALID_GTIN, magnification: 0.77 })
    expect(magnificationRule.check(context)).toEqual([])
    const declined = magnificationRule.declines!(context)
    expect(declined).toMatchObject({ wants: [], limit: true })
    expect(declined!.reason).toContain('0.77x (X = 0.254 mm)')
    expect(declined!.reason).toContain('on demand')
    expect(declined!.reason).toContain('limit of this tool')

    const codes = runRules(context).map((finding) => finding.code)
    expect(codes.filter((code) => code.startsWith('GS1_MAGNIFICATION'))).toEqual([])
    expect(declinedChecks(context).find((one) => one.ruleId === 'gs1/magnification')).toMatchObject(
      {
        limit: true,
        citation: { reference: 'GS1 General Specifications 26.0 §5.12.3.1, table 5-44' },
      },
    )
  })

  it('gives the same limit on a label described at 0.77x', () => {
    const context = contextFor({ gtin: VALID_GTIN, magnification: 0.77 }, 'described')
    expect(magnificationRule.check(context)).toEqual([])
    expect(magnificationRule.declines!(context)).toMatchObject({ wants: [], limit: true })
  })

  it('reports a symbol below the allowance, and names the allowance', () => {
    const context = contextFor({ gtin: VALID_GTIN, magnification: 0.7 })
    const [found] = magnificationRule.check(context)
    expect(found).toMatchObject({ code: GS1_MAGNIFICATION_OUT_OF_RANGE, severity: 'violation' })
    expect(found!.message).toContain('down to X = 0.249 mm')
    expect(magnificationRule.declines!(context)).toBeUndefined()
  })

  it('says the allowance in what it requires of a symbol below it', () => {
    const [found] = magnificationRule.check(contextFor({ gtin: VALID_GTIN, magnification: 0.7 }))
    expect(found!.measurement!.required).toBe(
      '0.80x–2.00x, or down to X = 0.249 mm printed on demand',
    )
  })

  // One symbol is drawn today; the rule iterates them all, so it is held for two. Found by
  // `/code-review medium` on this fix.
  const twoSymbols = (secondMagnification: number): Gs1RetailContext => {
    const context = contextFor({ gtin: VALID_GTIN })
    const [symbol] = context.layout.symbols
    const second = { ...symbol!, xDimensionMm: 0.33 * secondMagnification }
    return { ...context, layout: { ...context.layout, symbols: [symbol!, second] } }
  }

  it('passes no symbol beside one in the band, and stands down saying so', () => {
    const context = twoSymbols(0.77)
    expect(magnificationRule.check(context)).toEqual([])
    const declined = magnificationRule.declines!(context)
    expect(declined).toMatchObject({ limit: true })
    expect(declined!.reason).toContain('No other symbol on the label is passed')
  })

  it('reports a symbol out of range beside one in the band, and passes none beside it', () => {
    // In range, in the band and above it: the violation stands, the rule does not also
    // stand down, and the symbol in range gets no pass beside one nobody judged.
    const context = contextFor({ gtin: VALID_GTIN, magnification: 0.77 })
    const [symbol] = context.layout.symbols
    const three = {
      ...context,
      layout: {
        ...context.layout,
        symbols: [
          { ...symbol!, xDimensionMm: 0.33 },
          symbol!,
          { ...symbol!, xDimensionMm: 0.33 * 2.5 },
        ],
      },
    }
    const findings = magnificationRule.check(three)
    expect(findings.map((finding) => finding.severity)).toEqual(['violation'])
    expect(magnificationRule.declines!(three)).toBeUndefined()
    // The symbol in the band is said, in the finding's words, since the rule judged and
    // cannot also stand down. Found by `/code-review high` on #107.
    expect(findings[0]!.message).toContain('Another symbol is drawn at 0.77x (X = 0.254 mm)')
    expect(findings[0]!.message).toContain('No other symbol on the label is passed')
    expect(findings[0]!.message).toContain('gives no verdict on that magnification')
  })

  it('still passes at the table’s own minimum, 0.80x', () => {
    const context = contextFor({ gtin: VALID_GTIN, magnification: 0.8 })
    expect(magnificationRule.check(context).map((finding) => finding.severity)).toEqual(['pass'])
    expect(magnificationRule.declines!(context)).toBeUndefined()
  })
})

/**
 * Table 5-44 footnote (**): "When printing a minimum symbol with any method of printing,
 * the bar height SHALL NOT be truncated below the minimum as listed in the table above."
 * The engine draws an unstated bar height at the specification's minimum, so in the band
 * it draws the 18.28 mm listed for X = 0.264, not a height scaled down to 17.59 mm.
 */
describe('gs1/bar-height in the on-demand band', () => {
  it('draws an unstated bar height at the listed minimum, and passes it as drawn', () => {
    const context = contextFor({ gtin: VALID_GTIN, magnification: 0.77 })
    expect(context.layout.symbols[0]!.barHeightMm).toBe(18.28)
    const [pass] = barHeightRule.check(context)
    expect(pass).toMatchObject({ code: GS1_BAR_HEIGHT_SUFFICIENT, severity: 'pass' })
    // 18.28 mm is the figure for X = 0.264, owed by footnote (**), not this X's: the table
    // lists none below its minimum. Found by `/code-review high` on #107.
    expect(pass!.message).toContain(
      'meeting the 18.28 mm table 5-44 lists for its minimum X-dimension, 0.264 mm',
    )
    expect(pass!.message).not.toContain('for this X-dimension')
  })

  it('says the listed floor in a violation in the band', () => {
    const context = contextFor({ gtin: VALID_GTIN, magnification: 0.77, barHeightMm: 17.6 })
    const [found] = barHeightRule.check(context)
    expect(found!.severity).toBe('violation')
    expect(found!.message).toContain('requires 18.28 mm, the height table 5-44 lists')
    expect(found!.message).toContain(
      'footnote (**) says "When printing a minimum symbol with any method of printing, the bar ' +
        'height SHALL NOT be truncated below the minimum as listed in the table above."',
    )
  })

  it('still says the minimum for this X-dimension above the floor', () => {
    const [pass] = barHeightRule.check(contextFor({ gtin: VALID_GTIN, magnification: 1 }))
    expect(pass!.message).toContain('meeting the 22.85 mm minimum for this X-dimension')
  })
})
