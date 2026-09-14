/**
 * The front door draws compliant labels.
 *
 * **This is the check the showcase documents were written without.** Two
 * compliance defects were found by hand while authoring them — a "2 percent or
 * less" statement grouping a 10% sugar and a 5% butter, and a serving count that
 * did not reconcile with the declared net weight — and nothing would have caught
 * either the next time somebody edited a percentage. A compliance tool whose own
 * landing page draws a label its engine reports is the worst thing it could put
 * in front of a visitor.
 */
import {
  DEFAULT_GHS_STOCK,
  DEFAULT_US_FOOD_STOCK,
  layOutGhsLabel,
  layOutUsFoodLabel,
  runRules,
} from '@packwright/label-core'
import { describe, expect, it } from 'vitest'
import { FOOD_SAMPLE, GHS_SAMPLE } from './landingSamples'

const notPassing = (findings: readonly { severity: string; code: string }[]) =>
  findings.filter((finding) => finding.severity !== 'pass').map((finding) => finding.code)

describe('the labels the landing page draws', () => {
  it('reports nothing against the food sample', () => {
    const layout = layOutUsFoodLabel({ data: FOOD_SAMPLE, stock: DEFAULT_US_FOOD_STOCK })
    expect(
      notPassing(runRules({ layout, data: FOOD_SAMPLE, labelType: 'us-food' } as never)),
    ).toEqual([])
  })

  it('reports nothing against the chemical sample but the missing pictogram symbols', () => {
    // Those two are the engine declining to invent Annex V specimen artwork it
    // could not verify, which the page's own prose explains rather than hides.
    // Asserted exactly, so a *third* violation cannot arrive unnoticed behind
    // the two that are expected.
    const layout = layOutGhsLabel({ data: GHS_SAMPLE, stock: DEFAULT_GHS_STOCK })
    const codes = notPassing(
      runRules({ layout, data: GHS_SAMPLE, labelType: 'ghs-chemical' } as never),
    )
    expect(codes).toEqual(['GHS_PICTOGRAM_SYMBOL_MISSING', 'GHS_PICTOGRAM_SYMBOL_MISSING'])
  })

  it('declares an allergen the ingredient name does not give away', () => {
    // `marzipan (almonds)`, not `almonds (almonds)`. The parenthetical only
    // demonstrates anything on an ingredient that needs one.
    const marzipan = FOOD_SAMPLE.ingredients?.find((i) => i.name === 'marzipan')
    expect(marzipan?.allergenSpecificType).toBe('almonds')
    expect(marzipan?.name).not.toContain('almond')
  })
})
