/**
 * No rule certifies an element the engine did not print.
 *
 * This is the guarantee `runRules` enforces for every rule at once, and it is
 * tested here rather than rule by rule because rule by rule is how it was missed.
 * `usFoodEngine` has recorded an omission for a declaration drawn past the edge
 * of its stock since phase 5 — the fix for "the net quantity at x −57.5 mm with
 * all five of its rules reporting compliant" — but nothing read it. The fix had
 * landed in the layout alone, so the same label still came back with eighteen
 * findings and every one of them a pass.
 *
 * The four cases below are the four ways this can go wrong: a pass that should
 * be withheld and is not, a violation that should survive and does not, a clean
 * label quietly losing its passes, and an entitlement withheld because the
 * artwork it points at could not be drawn.
 */

import { describe, expect, it } from 'vitest'
import { layOutUsFoodLabel } from '../layout/usFoodEngine'
import { US_FOOD_CONFORMANT } from './fixtures/usFood'
import type { LabelStock } from '../templates/stock'
import { US_FOOD_ELEMENTS } from '../templates/usFood'
import type { UsFoodIngredient, UsFoodLabelData } from '../templates/usFood'
import { runRules } from './registry'
import { FDA_DUAL_COLUMN_EXEMPT, FDA_NET_QUANTITY_CROWDED, FDA_RESPONSIBLE_FIRM_MET } from './index'

/** Layout and findings together, because every case here asserts its own premise. */
const judge = (data: UsFoodLabelData, stock: LabelStock) => {
  const layout = layOutUsFoodLabel({ data, stock })
  return {
    layout,
    findings: runRules({ labelType: 'us-food', data, stock, layout }),
    omitted: layout.omissions.map((omission) => omission.elementId),
  }
}

/**
 * A container far larger than the artwork it is drawn on.
 *
 * 101.7(i) sizes the declaration from the *package*, so an 1800 mm carton
 * demands type too wide for a 120 mm label and the engine draws it running off
 * the left edge — `xMm −57.49` on a 120 mm stock, which is the reproduction this
 * whole guard exists for.
 */
const OVERSIZED_PACKAGE: UsFoodLabelData = {
  ...US_FOOD_CONFORMANT.data,
  container: { shape: 'rectangular', widthMm: 1800, heightMm: 1800 },
}

describe('a rule never certifies what the engine did not print', () => {
  it('withholds every pass for an element recorded as omitted', () => {
    const { findings, omitted } = judge(OVERSIZED_PACKAGE, US_FOOD_CONFORMANT.stock)

    // The premise. If the engine ever stops recording this, the assertion below
    // passes for the wrong reason and the guard is untested.
    expect(omitted, 'the engine must still record the declaration it could not draw').toContain(
      US_FOOD_ELEMENTS.netQuantity,
    )

    const netQuantityPasses = findings.filter(
      (result) => result.severity === 'pass' && result.elementId === US_FOOD_ELEMENTS.netQuantity,
    )

    expect(
      netQuantityPasses.map((result) => result.code),
      'a declaration drawn off the label cannot be cleared by any of its rules',
    ).toEqual([])
  })

  it('still reports the violations on an element it declines to certify', () => {
    // The trap this guard had to avoid, and the one `quietZone.ts` records
    // falling into: skipping an uncertifiable element outright silences its
    // violations too, which manufactures a second false clearance out of the
    // first. Withholding the pass is the whole of the change.
    // Descending by weight, so the list is in 101.4(a)(1) order and the only
    // thing wrong with this label is that it is too long to fit on its stock.
    const ingredients: UsFoodIngredient[] = Array.from({ length: 400 }, (_, index) => ({
      name: `ingredient number ${index}`,
      percentByWeight: (400 - index) / 400,
    }))
    const { findings, omitted } = judge(
      { ...US_FOOD_CONFORMANT.data, ingredients },
      US_FOOD_CONFORMANT.stock,
    )

    expect(omitted, 'the premise: the firm must be what could not be drawn').toContain(
      US_FOOD_ELEMENTS.responsibleFirm,
    )

    const codes = findings.map((result) => result.code)
    expect(codes, 'the firm was not printed, so 101.5 cannot be reported met').not.toContain(
      FDA_RESPONSIBLE_FIRM_MET,
    )
    expect(codes, 'a real violation must survive the withholding').toContain(
      FDA_NET_QUANTITY_CROWDED,
    )
  })

  it('leaves a label with nothing omitted exactly as it was', () => {
    const { findings, layout } = judge(US_FOOD_CONFORMANT.data, US_FOOD_CONFORMANT.stock)

    expect(layout.omissions, 'the conformant fixture must draw in full').toEqual([])
    expect(
      findings.every((result) => result.severity === 'pass'),
      'withholding must not cost a clean label any of its passes',
    ).toBe(true)
    expect(findings).toHaveLength(18)
  })

  it('keeps an entitlement that rests on the document, not on the artwork', () => {
    // `elementId` says where to look; it does not say what was judged. An
    // exemption under 101.9(b)(12)(i) points at the nutrition panel so the canvas
    // can highlight it, but what it reports is that this food is excused from
    // carrying a second column — true whether or not the panel printed. An
    // earlier version of the guard read `elementId` alone and deleted it.
    const exemptButUndrawable: UsFoodLabelData = {
      ...US_FOOD_CONFORMANT.data,
      nutritionFacts: {
        ...US_FOOD_CONFORMANT.data.nutritionFacts!,
        availableSurfaceSqInches: 60,
        referenceAmount: { amount: 22, unit: 'g', category: 'Snacks' },
        packageContent: 55,
        packagedAndSoldIndividually: true,
        dualColumnExemption: { rawCommodityVoluntary: true },
      },
    }
    // Small enough that the panel itself cannot be drawn, which is what makes
    // this a test of the distinction rather than of nothing: the exemption names
    // the nutrition panel, and the panel is exactly what was omitted.
    const { findings, omitted } = judge(exemptButUndrawable, {
      widthMm: 60,
      heightMm: 60,
      marginMm: 4,
    })

    expect(omitted, 'the premise: the panel the exemption points at must be omitted').toContain(
      US_FOOD_ELEMENTS.nutritionPanel,
    )
    expect(
      findings.map((result) => result.code),
      'an exemption is a fact about the food and survives an omission',
    ).toContain(FDA_DUAL_COLUMN_EXEMPT)
  })
})

describe('the statement of identity is bounded like every other block', () => {
  it('records an omission when it runs off the stock, and is then not certified', () => {
    const { findings, omitted } = judge(
      {
        ...US_FOOD_CONFORMANT.data,
        statementOfIdentity:
          'A very long statement of identity indeed, one that wraps many times over',
      },
      { widthMm: 30, heightMm: 18, marginMm: 2 },
    )

    // It is drawn by its own loop rather than through `stackText`, so it never
    // inherited that helper's bounds check — the one mandatory element that could
    // leave the substrate with nothing recording it.
    expect(omitted, '101.3(a)’s element must say when it is not printed').toContain(
      US_FOOD_ELEMENTS.statementOfIdentity,
    )

    const certified = findings.some(
      (result) =>
        result.severity === 'pass' && result.elementId === US_FOOD_ELEMENTS.statementOfIdentity,
    )
    expect(certified, 'an identity printed off the label cannot be reported met').toBe(false)
  })
})
