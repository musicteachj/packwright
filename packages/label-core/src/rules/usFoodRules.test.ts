import { describe, expect, it } from 'vitest'
import { layOutUsFoodLabel } from '../layout/usFoodEngine'
import type { TextPrimitive } from '../layout/types'
import {
  NUTRITION_ELEMENT_PREFIX,
  US_FOOD_ELEMENTS,
  US_FOOD_NUTRITION_EXEMPTIONS,
  US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE,
  nutritionRowElementId,
} from '../templates/usFood'
import type { LabelStock } from '../templates/stock'
import { US_FOOD_CONFORMANT, US_FOOD_FIXTURES, US_FOOD_SMALL_PANEL } from './fixtures/usFood'
import { blockingOmissions } from '../layout/omissions'
import { MAJOR_FOOD_ALLERGENS, majorFoodAllergen } from '../fda/allergens'
import type {
  UsFoodIngredient,
  UsFoodAssortmentExemption,
  UsFoodLabelData,
  UsFoodSmallPackageExemption,
  UsFoodUnitContainerExemption,
} from '../templates/usFood'
import { NUTRIENT_IDS, roundNutrientAmount } from '../fda/nutrients'
import type { DualColumnBasis } from '../fda/nutritionFormats'
import { UNIT_CONTAINER_STATEMENTS, UNIT_CONTAINER_WORDINGS } from '../fda/unitContainerStatement'
import { nutritionDisplayFor, nutritionTypeForDisplay } from '../fda/nutritionPanel'
import { MM_PER_POINT } from '../geometry/units'
import {
  FDA_ALLERGEN_NOT_DECLARED,
  FDA_NUTRITION_PERCENT_DV_WRONG,
  FDA_NUTRITION_ROUNDING_WRONG,
  FDA_CONTAINS_TYPE_TOO_SMALL,
  FDA_ALLERGEN_SOURCE_NOT_SPECIFIC,
  FDA_INGREDIENTS_EXEMPT,
  FDA_INGREDIENTS_EXEMPTION_UNSTATED,
  FDA_INGREDIENTS_MISSING,
  FDA_NUTRITION_EXEMPTION_UNSTATED,
  FDA_INGREDIENTS_ORDER_MET,
  FDA_INGREDIENTS_OUT_OF_ORDER,
  FDA_INGREDIENT_THRESHOLD_EXCEEDED,
  FDA_PANEL_TYPE_SIZE_MET,
  FDA_PANEL_TYPE_TOO_SMALL,
  FDA_NUTRITION_CONTACT_MISSING,
  FDA_UNIT_CONTAINER_STATEMENT_TOO_SMALL,
  usFoodNutritionCompletenessRule,
  FDA_NET_QUANTITY_CROWDED,
  FDA_NET_QUANTITY_DUAL_MET,
  FDA_NET_QUANTITY_METRIC_NOT_REQUIRED,
  FDA_NET_QUANTITY_MISSING,
  FDA_NET_QUANTITY_OUTSIDE_ZONE,
  FDA_NET_QUANTITY_SEPARATION_MET,
  FDA_NET_QUANTITY_TYPE_SIZE_MET,
  FDA_NET_QUANTITY_TYPE_TOO_SMALL,
  FDA_NET_QUANTITY_ZONE_NOT_REQUIRED,
  FDA_CONTAINS_NOT_ADJACENT,
  FDA_ASSORTMENT_STATEMENT_MISSING,
  FDA_ASSORTMENT_STATEMENT_INCOMPLETE,
  usFoodIngredientListRule,
} from './index'
import { US_FOOD_RULES, runRules } from './registry'

/**
 * Fixtures by name, never by index.
 *
 * Three tests here indexed into `US_FOOD_FIXTURES` positionally, so adding a
 * fixture at the front of the list silently repointed them at a different label —
 * two failed loudly and one asserted the wrong thing about the wrong document.
 * The name is the fixture's identity; its position is not.
 */
const fixture = (name: string) => {
  const match = US_FOOD_FIXTURES.find((f) => f.name === name)
  if (match === undefined) throw new Error(`no fixture named "${name}"`)
  return match
}

const findingsFor = (data: UsFoodLabelData, stock: LabelStock) =>
  runRules({ labelType: 'us-food', data, stock, layout: layOutUsFoodLabel({ data, stock }) })

describe('every US food rule ships with a label that provokes it', () => {
  it.each(US_FOOD_FIXTURES.map((f) => [f.name, f] as const))('%s', (_name, fixture) => {
    const findings = findingsFor(fixture.data, fixture.stock)
    const match = findings.find((f) => f.code === fixture.expected.code)

    expect(match, `${fixture.defect}\nGot: ${findings.map((f) => f.code).join(', ')}`).toBeDefined()
    expect(match!.severity).toBe(fixture.expected.severity)
    // Asserted exactly. One of these rules is enforced under a statute rather
    // than under 21 CFR 101, so the reference is what separates a correct
    // verdict from one delivered under a regulation that never required it.
    expect(match!.citation.reference).toBe(fixture.expected.citation)
  })

  it('declares a fixture for every code a rule can emit as a failure', () => {
    const covered = new Set(US_FOOD_FIXTURES.map((f) => f.expected.code))
    const uncovered = US_FOOD_RULES.flatMap((rule) => rule.codes).filter(
      (code) => !covered.has(code) && !/_MET$|_NOT_REQUIRED$|_EXEMPT$|_COMPLETE$/.test(code),
    )
    expect(uncovered, 'these failure codes have no known-bad fixture').toEqual([])
  })
})

describe('the conformant control', () => {
  const findings = findingsFor(US_FOOD_CONFORMANT.data, US_FOOD_CONFORMANT.stock)

  it('raises nothing at all', () => {
    const failures = findings.filter((f) => f.severity !== 'pass' && f.severity !== 'guidance')
    expect(failures.map((f) => f.code)).toEqual([])
  })

  it('passes every check rather than reporting nothing', () => {
    // "Reported nothing" and "everything passed" are different answers, and only
    // one of them means the rules ran. Four rules, one finding each.
    const passes = findings.filter((f) => f.severity === 'pass')
    // Short of the registry, and deliberately: the format rule declines on a
    // panel using the standard vertical display, because every package may use
    // it and there is no entitlement to judge. A pass there would be a check
    // that clears every label carrying the default. So does the protein
    // percentage rule on a food for adults, which (c)(7)(i) permits to omit it.
    expect(passes).toHaveLength(US_FOOD_RULES.length - 4)
    expect(findings.map((f) => f.code)).not.toContain('FDA_NUTRITION_FORMAT_MET')
  })

  it('derives a compliant type size when the label states none', () => {
    // The default label complying is a property of the engine, not a claim: it
    // states no `netQuantityFontSizeMm`, so the size checked here is the one
    // 101.7(i) produced for a 31.62 in² panel.
    expect(US_FOOD_CONFORMANT.data.netQuantityFontSizeMm).toBeUndefined()
    expect(findings.map((f) => f.code)).toContain(FDA_NET_QUANTITY_TYPE_SIZE_MET)
  })
})

describe('the panel belongs to the package, not to the label stock', () => {
  it('sizes type from the cylinder rather than from the wrap around it', () => {
    // 21 CFR 101.1(b): 40% of height × circumference. A 200 mm bottle 300 mm
    // round has a 37.20 in² panel — the 3/16 inch band — while the 60 × 90 mm
    // label wrapped round it is 8.37 in², whose band is 1/8. The requirement the
    // finding states must be the larger one.
    const { data, stock } = fixture(
      'type sized for the label rather than for the cylinder it wraps',
    )
    const findings = findingsFor(data, stock)
    const match = findings.find((f) => f.code === FDA_NET_QUANTITY_TYPE_TOO_SMALL)
    expect(match!.measurement!.required).toBe('4.76 mm')
  })

  // 101.7(f)'s proviso, read from the eCFR on 2026-09-16: the bottom-30 percent
  // requirement "shall not apply when the declaration of net quantity of contents
  // meets the other requirements of this part". A 4.65 in² package with its
  // declaration set mid-panel, drawn on 400 mm of stock so that nothing crowds it —
  // the one layout on which the exemption is the only question.
  const smallMidPanel: UsFoodLabelData = {
    ...US_FOOD_CONFORMANT.data,
    container: { shape: 'rectangular', widthMm: 50, heightMm: 60 },
    netQuantityAnchor: 'centre',
  }
  const tall: LabelStock = { ...US_FOOD_CONFORMANT.stock, heightMm: 400 }
  const netQuantityFindings = (data: UsFoodLabelData, stock = tall) =>
    findingsFor(data, stock).filter((f) => f.code.startsWith('FDA_NET_QUANTITY'))
  const codesOf = (findings: { code: string }[]) => findings.map((f) => f.code)

  it('exempts a small package from the placement rule instead of reporting it', () => {
    // An exemption, not a relaxation. The identical layout on the 44.64 in² panel
    // is a violation; on a 4.65 in² one whose declaration meets the rest it is
    // not, and a rule that skipped this check would report against a compliant
    // package.
    const smallFindings = netQuantityFindings(smallMidPanel)
    const small = codesOf(smallFindings)
    expect(small, 'the premise: nothing else is wrong with the declaration').toEqual(
      expect.not.arrayContaining([FDA_NET_QUANTITY_CROWDED, FDA_NET_QUANTITY_TYPE_TOO_SMALL]),
    )
    expect(small).toContain(FDA_NET_QUANTITY_ZONE_NOT_REQUIRED)
    expect(small).not.toContain(FDA_NET_QUANTITY_OUTSIDE_ZONE)
    expect(
      smallFindings.find((f) => f.code === FDA_NET_QUANTITY_ZONE_NOT_REQUIRED)!.message,
      'naming the separation it measured',
    ).toContain("meets 101.7(a) and (i) and (f)'s separation")

    const large = codesOf(
      netQuantityFindings({ ...smallMidPanel, container: US_FOOD_CONFORMANT.data.container }),
    )
    expect(large, 'the control: the same layout on a large panel').toContain(
      FDA_NET_QUANTITY_OUTSIDE_ZONE,
    )
  })

  it('does not exempt a small package whose declaration is too small, and judges its placement', () => {
    // The pass once issued beside `FDA_NET_QUANTITY_TYPE_TOO_SMALL` for the same
    // declaration, resting on the condition that finding had just said was unmet.
    const findings = netQuantityFindings({ ...smallMidPanel, netQuantityFontSizeMm: 1 })
    const codes = codesOf(findings)

    expect(codes, 'the premise: 101.7(i) is not met').toContain(FDA_NET_QUANTITY_TYPE_TOO_SMALL)
    expect(codes, 'and nothing crowds it').not.toContain(FDA_NET_QUANTITY_CROWDED)
    expect(codes, 'so the proviso does not apply').not.toContain(FDA_NET_QUANTITY_ZONE_NOT_REQUIRED)
    // "Shall not apply when" the rest is met, so where it is not, the requirement
    // does — and a declaration set mid-panel is outside the bottom 30 percent.
    const outside = findings.find((f) => f.code === FDA_NET_QUANTITY_OUTSIDE_ZONE)
    expect(outside, 'the placement requirement is back in force').toBeDefined()
    expect(outside!.message, 'and says why the exemption was not given').toContain(
      "does not meet 101.7(i)'s type size",
    )
  })

  it('does not exempt a crowded one either, and still reports the crowding', () => {
    // Separation is one of "the other requirements" too, though it sits in the same
    // paragraph. `US_FOOD_SMALL_PANEL` prints its declaration over the statement of
    // identity, and was once reported crowded and exempt at the same time.
    const findings = netQuantityFindings(US_FOOD_SMALL_PANEL.data, US_FOOD_SMALL_PANEL.stock)
    const codes = codesOf(findings)

    expect(codes).toContain(FDA_NET_QUANTITY_CROWDED)
    expect(codes).not.toContain(FDA_NET_QUANTITY_ZONE_NOT_REQUIRED)
    expect(
      findings.find((f) => f.code === FDA_NET_QUANTITY_OUTSIDE_ZONE)?.message,
      'judged at the top of its panel, and told why',
    ).toContain("does not meet 101.7(f)'s separation")
  })

  it('does not exempt a small package with no inch-pound declaration', () => {
    // The metric statement still prints, so type size and separation both clear —
    // and the exemption used to be issued beside the blocking finding that says the
    // panel bears no declaration at all.
    const blank: UsFoodLabelData = {
      ...smallMidPanel,
      netQuantity: { ...smallMidPanel.netQuantity, inchPound: '' },
    }
    const findings = netQuantityFindings(blank)
    const codes = codesOf(findings)

    expect(codes, 'the premise: 101.7(a) is not met').toContain(FDA_NET_QUANTITY_MISSING)
    expect(codes, 'and nothing else is').toEqual(
      expect.not.arrayContaining([FDA_NET_QUANTITY_CROWDED, FDA_NET_QUANTITY_TYPE_TOO_SMALL]),
    )
    expect(codes).not.toContain(FDA_NET_QUANTITY_ZONE_NOT_REQUIRED)
    expect(findings.find((f) => f.code === FDA_NET_QUANTITY_OUTSIDE_ZONE)?.message).toContain(
      'does not meet 101.7(a)',
    )
  })

  it('still exempts a declaration with nothing else on its panel to be crowded by', () => {
    // The separation rule declines rather than passes when nothing else is printed,
    // and a declaration alone on its panel has not failed to stand clear of anything.
    // Reading that decline as unmet would take the exemption from the plainest label
    // there is.
    const {
      nutritionFacts: _panel,
      responsibleFirm: _firm,
      ingredientThreshold: _threshold,
      ...rest
    } = smallMidPanel
    const alone: UsFoodLabelData = {
      ...rest,
      statementOfIdentity: '',
      ingredients: [],
      containsStatement: [],
      ingredientsExemption: { kind: 'bulk-at-retail' },
      nutritionExemption: { kind: 'small-business' },
    }
    const findings = netQuantityFindings(alone)
    const codes = codesOf(findings)

    expect(codes, 'the premise: separation had nothing to measure').not.toContain(
      FDA_NET_QUANTITY_SEPARATION_MET,
    )
    expect(codes).not.toContain(FDA_NET_QUANTITY_CROWDED)
    expect(codes).toContain(FDA_NET_QUANTITY_ZONE_NOT_REQUIRED)
    // And it says so, rather than claiming a separation it never measured — which
    // the first message did, and the review of PR #33 caught.
    const message = findings.find((f) => f.code === FDA_NET_QUANTITY_ZONE_NOT_REQUIRED)!.message
    expect(message).not.toContain("meets 101.7(a) and (i) and (f)'s separation")
    expect(message).toContain("nothing else on the panel for (f)'s separation to measure")
  })
})

describe('a declaration formed in the surface rather than printed', () => {
  // The fixture and this pair together are what make the finding attributable to
  // 101.7(i)'s closing sentence: the label, the panel, the text and the em are
  // identical, and only `markingMethod` differs.
  const molded = fixture('type sized for the printed band on a declaration molded into the bottle')

  it('fails at a size that clears the printed band', () => {
    const codes = findingsFor(molded.data, molded.stock).map((f) => f.code)
    expect(codes).toContain(FDA_NET_QUANTITY_TYPE_TOO_SMALL)
  })

  it('passes at that same size when it is printed', () => {
    const printed = { ...molded.data, markingMethod: 'printed' } as const
    const codes = findingsFor(printed, molded.stock).map((f) => f.code)
    expect(codes).toContain(FDA_NET_QUANTITY_TYPE_SIZE_MET)
  })

  it('states the increased requirement in the finding', () => {
    // 3/16 + 1/16 = 1/4 inch = 6.35 mm.
    const match = findingsFor(molded.data, molded.stock).find(
      (f) => f.code === FDA_NET_QUANTITY_TYPE_TOO_SMALL,
    )
    expect(match!.measurement!.required).toBe('6.35 mm')
  })
})

describe('the em is not the letter height', () => {
  it('reports a declaration whose em equals the requirement in millimetres', () => {
    // The trap `layout/types.ts` warns about, asserted rather than described. The
    // drawn primitive's `fontSizeMm` is 4.7625 — numerically the 3/16 inch this
    // panel requires, so `fontSizeMm >= requiredMm` is true — while the letter
    // the regulation measures stands at 54% of the minimum.
    const { data, stock } = fixture('type sized as though the em were the letter height')
    const layout = layOutUsFoodLabel({ data, stock })
    const drawn = layout.primitives.find(
      (primitive): primitive is TextPrimitive =>
        primitive.kind === 'text' && primitive.elementId === US_FOOD_ELEMENTS.netQuantity,
    )
    expect(drawn!.fontSizeMm).toBe(4.7625)

    const match = findingsFor(data, stock).find((f) => f.code === FDA_NET_QUANTITY_TYPE_TOO_SMALL)
    expect(match!.measurement).toEqual({ actual: '2.57 mm', required: '4.76 mm' })
  })
})

describe('which letter is measured follows the casing of the declaration', () => {
  // 21 CFR 101.7(h)(2). The same em passes set in capitals and fails set with
  // lower case, because capitals stand 0.698 em and the "o" 0.540. A rule that
  // assumed one basis would be wrong on half of all real labels.
  const at = (inchPound: string, netQuantityFontSizeMm: number) =>
    findingsFor(
      { ...US_FOOD_CONFORMANT.data, netQuantity: { inchPound }, netQuantityFontSizeMm },
      US_FOOD_CONFORMANT.stock,
    ).map((f) => f.code)

  it('clears 6.83 mm of capitals on a panel that demands 3/16 inch', () => {
    expect(at('NET WT 12 OZ', 6.83)).toContain(FDA_NET_QUANTITY_TYPE_SIZE_MET)
  })

  it('rejects the same em set with lower case', () => {
    expect(at('Net wt 12 oz', 6.83)).toContain(FDA_NET_QUANTITY_TYPE_TOO_SMALL)
  })

  it('clears lower case once the em reaches 8.82 mm', () => {
    expect(at('Net wt 12 oz', 8.82)).toContain(FDA_NET_QUANTITY_TYPE_SIZE_MET)
  })

  it('names the letter it measured, so the finding can be acted on', () => {
    const findings = findingsFor(
      {
        ...US_FOOD_CONFORMANT.data,
        netQuantity: { inchPound: 'Net wt 12 oz' },
        netQuantityFontSizeMm: 6.83,
      },
      US_FOOD_CONFORMANT.stock,
    )
    const match = findings.find((f) => f.code === FDA_NET_QUANTITY_TYPE_TOO_SMALL)
    expect(match!.message).toContain('the lowercase "o"')
  })
})

describe('rules that decline rather than pass', () => {
  it('says nothing about separation when there is nothing else on the panel', () => {
    // An empty panel has not cleared the separation requirement; the requirement
    // had nothing to bite on. Reporting a pass would read as "checked and clear".
    //
    // This assertion used to hold for the wrong reason: an absent statement of
    // identity still produced an invisible element, and the declaration merely
    // happened to sit far enough from it. The separation rule must return
    // *nothing at all*, not merely no violation, and the element must not exist.
    // Every neighbour has to go, not just the statement of identity: the panel
    // carries an ingredient statement and a responsible firm now, and a test
    // that cleared one of three would be back to passing for the wrong reason.
    const {
      responsibleFirm: _firm,
      containsStatement: _contains,
      nutritionFacts: _panel,
      ...rest
    } = US_FOOD_CONFORMANT.data
    const data = {
      ...rest,
      statementOfIdentity: '',
      ingredients: [],
      nutritionExemption: { kind: 'small-business' as const },
    }
    const layout = layOutUsFoodLabel({ data, stock: US_FOOD_CONFORMANT.stock })
    for (const elementId of [
      US_FOOD_ELEMENTS.statementOfIdentity,
      US_FOOD_ELEMENTS.ingredients,
      US_FOOD_ELEMENTS.responsibleFirm,
      US_FOOD_ELEMENTS.nutritionPanel,
    ]) {
      expect(layout.elements.map((e) => e.elementId)).not.toContain(elementId)
    }

    const findings = findingsFor(data, US_FOOD_CONFORMANT.stock)
    expect(findings.filter((f) => f.code.startsWith('FDA_NET_QUANTITY_SEPARATION'))).toEqual([])
    expect(findings.filter((f) => f.code === FDA_NET_QUANTITY_CROWDED)).toEqual([])
  })

  it('does not claim a declaration stands alone when it does not', () => {
    // Both exemptions are permissions, so a random package may carry the SI
    // declaration anyway. Reporting "the inch/pound declaration stands alone"
    // about a label that plainly shows both is a finding a user can see is wrong.
    const findings = findingsFor(
      {
        ...US_FOOD_CONFORMANT.data,
        netQuantity: { inchPound: 'NET WT 1.27 LB', metric: '(576 g)', packaging: 'random' },
      },
      US_FOOD_CONFORMANT.stock,
    )
    const match = findings.find((f) => f.code === FDA_NET_QUANTITY_METRIC_NOT_REQUIRED)
    expect(match!.message).toContain('(576 g)')
    expect(match!.message).not.toContain('stands alone')
  })

  it('does not demand an SI declaration from a random package', () => {
    // 15 U.S.C. 1453(a)(3)(A)(ii) — permitted, not required. The pass carries its
    // own paragraph rather than the general clause at (a)(2).
    const findings = findingsFor(
      {
        ...US_FOOD_CONFORMANT.data,
        netQuantity: { inchPound: 'NET WT 1.27 LB', packaging: 'random' },
      },
      US_FOOD_CONFORMANT.stock,
    )
    const match = findings.find((f) => f.code === FDA_NET_QUANTITY_METRIC_NOT_REQUIRED)
    expect(match!.citation.reference).toBe('15 U.S.C. 1453(a)(3)(A)(ii)')
  })

  it('does not demand one from a food packaged at the retail store level', () => {
    const findings = findingsFor(
      {
        ...US_FOOD_CONFORMANT.data,
        netQuantity: { inchPound: 'NET WT 12 OZ', packaging: 'packaged-at-retail' },
      },
      US_FOOD_CONFORMANT.stock,
    )
    const match = findings.find((f) => f.code === FDA_NET_QUANTITY_METRIC_NOT_REQUIRED)
    expect(match!.citation.reference).toBe('15 U.S.C. 1453(a)(6)')
  })

  it('still recognises a dual declaration on an ordinary package', () => {
    const findings = findingsFor(US_FOOD_CONFORMANT.data, US_FOOD_CONFORMANT.stock)
    expect(findings.map((f) => f.code)).toContain(FDA_NET_QUANTITY_DUAL_MET)
  })
})

describe('21 CFR 101.7(h)(3), which this stage does not model', () => {
  it('records an omission rather than passing a fraction silently', () => {
    // Component numerals of a fraction are measured against half the minimum.
    // The engine sets the declaration as one run, so there is nothing to measure
    // and the gap is recorded on the label instead of being left unsaid.
    const data: UsFoodLabelData = {
      ...US_FOOD_CONFORMANT.data,
      netQuantity: { inchPound: 'NET WT 1½ LB', metric: '(680 g)' },
    }
    const layout = layOutUsFoodLabel({ data, stock: US_FOOD_CONFORMANT.stock })
    expect(layout.omissions.map((o) => o.reason).join(' ')).toContain('101.7(h)(3)')
  })

  it('does not record one for a declaration with no fraction in it', () => {
    const layout = layOutUsFoodLabel(US_FOOD_CONFORMANT)
    expect(layout.omissions).toEqual([])
  })
})

describe('a label with no declaration is not a label that passed', () => {
  const data = { ...US_FOOD_CONFORMANT.data, netQuantity: { inchPound: '' } }
  const findings = findingsFor(data, US_FOOD_CONFORMANT.stock)

  it('draws no declaration rather than an empty one', () => {
    // The empty primitive is what let the type-size rule measure a blank string
    // at 4.76 mm "on capital letters" and pass it.
    const layout = layOutUsFoodLabel({ data, stock: US_FOOD_CONFORMANT.stock })
    expect(layout.primitives.filter((p) => p.elementId === US_FOOD_ELEMENTS.netQuantity)).toEqual(
      [],
    )
    expect(layout.elements.map((e) => e.elementId)).not.toContain(US_FOOD_ELEMENTS.netQuantity)
  })

  it('reports the missing declaration as blocking', () => {
    const match = findings.find((f) => f.code === FDA_NET_QUANTITY_MISSING)
    expect(match!.severity).toBe('blocking')
    expect(match!.citation.reference).toBe('21 CFR 101.7(a)')
  })

  it('passes no net-quantity check, because nothing was measured', () => {
    // The whole point. Rules declining is not rules clearing, and before
    // `netQuantityPresent` existed this label came back with three passes, each
    // carrying a real CFR citation. Scoped to the net quantity because the
    // ingredient and firm rules on this label ran and legitimately passed —
    // which is itself the distinction worth keeping visible.
    const passes = findings.filter((f) => f.severity === 'pass')
    expect(passes.filter((f) => f.code.startsWith('FDA_NET_QUANTITY'))).toEqual([])
    expect(passes.length).toBeGreaterThan(0)
  })
})

describe('the 101.2(c) floor is measured the way 101.7(h)(2) says', () => {
  // 101.2(c) sets a height and then incorporates 101.7(h)(2) by reference —
  // "The requirements for conspicuousness and legibility shall include the
  // specifications of §§ 101.7(h)(1) and (2)" — so the floor is measured on a
  // capital or on the lowercase "o" depending on the casing, exactly as the net
  // quantity is. A rule fixing the basis at cap height would clear an
  // all-lowercase ingredient statement 23% under the floor.
  //
  // 1.5875 mm needs 2.274 mm of em on capitals and 2.940 mm on the "o", so an em
  // between the two passes under the wrong reading and fails under the right one.
  const at = (name: string, informationPanelFontSizeMm: number) =>
    findingsFor(
      {
        ...US_FOOD_CONFORMANT.data,
        ingredients: [{ name, percentByWeight: 100 }],
        ingredientThreshold: { percent: 2, count: 0 },
        informationPanelFontSizeMm,
      },
      US_FOOD_CONFORMANT.stock,
    ).map((f) => f.code)

  it('rejects lower-case type that a capital-height reading would clear', () => {
    expect(at('rolled oats', 2.5)).toContain(FDA_PANEL_TYPE_TOO_SMALL)
  })

  it('clears the same text once the em reaches 2.94 mm', () => {
    expect(at('rolled oats', 2.95)).toContain(FDA_PANEL_TYPE_SIZE_MET)
  })

  it('reports the height of the letter it measured, not the em', () => {
    const match = findingsFor(
      {
        ...US_FOOD_CONFORMANT.data,
        ingredients: [{ name: 'rolled oats', percentByWeight: 100 }],
        ingredientThreshold: { percent: 2, count: 0 },
        informationPanelFontSizeMm: 2.5,
      },
      US_FOOD_CONFORMANT.stock,
    ).find((f) => f.code === FDA_PANEL_TYPE_TOO_SMALL)
    // 2.5 x 0.540 = 1.35, not 2.50 and not 1.745.
    expect(match!.measurement).toEqual({ actual: '1.35 mm', required: '1.59 mm' })
  })
})

describe('findings from the phase 5 review', () => {
  const stock = US_FOOD_CONFORMANT.stock

  describe('a quantifying statement covering the whole list', () => {
    const data = {
      ...US_FOOD_CONFORMANT.data,
      ingredients: [
        { name: 'salt', percentByWeight: 0.7 },
        { name: 'sugar', percentByWeight: 90 },
      ],
      ingredientThreshold: { percent: 2 as const, count: 2 },
    }

    it('does not report an order it never examined', () => {
      // This returned "0 ingredients run in descending order" as a pass, about a
      // list it had sliced to nothing. A rule with no entries left to order has
      // declined; it has not cleared the label.
      const codes = findingsFor(data, stock).map((f) => f.code)
      expect(codes).not.toContain(FDA_INGREDIENTS_ORDER_MET)
      expect(codes).not.toContain(FDA_INGREDIENTS_OUT_OF_ORDER)
    })

    it('still reports the ingredient that exceeds the threshold', () => {
      // Declining on order must not take the threshold rule down with it —
      // sugar at 90% behind a 2 percent statement is the real defect here.
      expect(findingsFor(data, stock).map((f) => f.code)).toContain(
        FDA_INGREDIENT_THRESHOLD_EXCEEDED,
      )
    })

    it('draws no leading empty sentence', () => {
      // "INGREDIENTS: . Contains 2 percent or less of salt, sugar."
      const layout = layOutUsFoodLabel({ data, stock })
      const text = layout.primitives
        .filter(
          (p): p is TextPrimitive =>
            p.kind === 'text' && p.elementId === US_FOOD_ELEMENTS.ingredients,
        )
        .map((p) => p.text)
        .join(' ')
      expect(text).not.toContain('INGREDIENTS: .')
      expect(text).toContain('Contains 2 percent or less of')
    })

    it('survives a count past the end of the list', () => {
      const wild = { ...data, ingredientThreshold: { percent: 2 as const, count: 99 } }
      expect(() => layOutUsFoodLabel({ data: wild, stock })).not.toThrow()
      expect(findingsFor(wild, stock).map((f) => f.code)).toContain(
        FDA_INGREDIENT_THRESHOLD_EXCEEDED,
      )
    })
  })

  describe('the panel floor reads the whole element, not one line of it', () => {
    // 2.5 mm of em clears the 1.5875 mm floor on capitals (1.745) and fails on
    // the "o" (1.35). An ingredient statement wrapping to an all-caps first line
    // and a lower-case second was judged on the first and passed, while the firm
    // block at the identical size failed. Same rule, same size, two verdicts.
    const data = {
      ...US_FOOD_CONFORMANT.data,
      ingredients: [
        {
          name: 'WHOLE GRAIN ROLLED OATS AND MANY OTHER CAPITALISED THINGS TO FORCE A WRAP HERE NOW',
          percentByWeight: 99,
        },
        { name: 'natural flavor', percentByWeight: 1 },
      ],
      ingredientThreshold: { percent: 2 as const, count: 0 },
      informationPanelFontSizeMm: 2.5,
    }

    it('wraps to an all-caps first line and a lower-case second', () => {
      const lines = layOutUsFoodLabel({ data, stock }).primitives.filter(
        (p): p is TextPrimitive =>
          p.kind === 'text' && p.elementId === US_FOOD_ELEMENTS.ingredients,
      )
      expect(lines.length).toBeGreaterThan(1)
      expect(/\p{Ll}/u.test(lines[0]!.text)).toBe(false)
      expect(lines.some((line) => /\p{Ll}/u.test(line.text))).toBe(true)
    })

    it('reports the statement, not only the firm beside it', () => {
      const undersized = findingsFor(data, stock).filter((f) => f.code === FDA_PANEL_TYPE_TOO_SMALL)
      // Two elements, not three: this data replaces the ingredients with
      // entries carrying no allergen, so the conformant label's "Contains" ids
      // match nothing and the engine draws no statement for them to be measured.
      expect(undersized.map((f) => f.elementId).sort()).toEqual(
        [US_FOOD_ELEMENTS.ingredients, US_FOOD_ELEMENTS.responsibleFirm].sort(),
      )
      expect(undersized[0]!.measurement!.actual).toBe('1.35 mm')
    })
  })

  describe('content that runs off the stock says so', () => {
    // Phase 4 shipped this hole once, with a product identifier set 88.9 mm on a
    // 74 mm label: it ran off the substrate, nothing recorded it, and the label
    // reported clean with a mandatory element missing from the artifact.
    const data = {
      ...US_FOOD_CONFORMANT.data,
      ingredients: Array.from({ length: 400 }, (_, i) => ({
        name: `ingredient number ${i}`,
        percentByWeight: 100 - i * 0.1,
      })),
      ingredientThreshold: { percent: 2 as const, count: 0 },
    }

    it('records an omission for a block that is only partly printed', () => {
      const layout = layOutUsFoodLabel({ data, stock })
      const cut = layout.omissions.find((o) => o.elementId === US_FOOD_ELEMENTS.ingredients)
      expect(cut, 'a block running off the stock recorded nothing').toBeDefined()
      expect(cut!.scope).toBe('detail')
      expect(cut!.reason).toContain('not printed')
    })

    it('blocks the export of a block that is not printed at all', () => {
      // The responsible firm starts below the bottom edge, so none of it exists
      // on the artifact. That is an element-scope omission, which gates export.
      const layout = layOutUsFoodLabel({ data, stock })
      const gone = layout.omissions.find((o) => o.elementId === US_FOOD_ELEMENTS.responsibleFirm)
      expect(gone!.scope).toBe('element')
      expect(blockingOmissions(layout).length).toBeGreaterThan(0)
    })

    it('records nothing for a label that fits', () => {
      expect(layOutUsFoodLabel(US_FOOD_CONFORMANT).omissions).toEqual([])
    })
  })

  describe('the §101.100 exemption excuses absence, not disorder', () => {
    const bulkAtRetail = { kind: 'bulk-at-retail' } as const

    it('clears a label that lists nothing, citing the paragraph claimed', () => {
      const findings = findingsFor(
        { ...US_FOOD_CONFORMANT.data, ingredients: [], ingredientsExemption: bulkAtRetail },
        stock,
      )
      const codes = findings.map((f) => f.code)
      expect(codes).not.toContain(FDA_INGREDIENTS_MISSING)
      const pass = findings.find((f) => f.code === FDA_INGREDIENTS_EXEMPT)
      expect(pass!.citation.reference).toBe('21 CFR 101.100(a)(2)')
      // And says what of that paragraph it cannot see: the display, not the label.
      expect(pass!.message).toContain('one-fourth of an inch')
    })

    it('asks which paragraph a label saved with the old bare flag claims', () => {
      // Excused, so a label that once cleared is not now blocked — but no longer
      // cleared, because a claim naming no paragraph has no conditions to check.
      const findings = findingsFor(
        { ...US_FOOD_CONFORMANT.data, ingredients: [], ingredientsExempt: true },
        stock,
      )
      const codes = findings.map((f) => f.code)
      expect(codes).not.toContain(FDA_INGREDIENTS_MISSING)
      expect(codes).not.toContain(FDA_INGREDIENTS_EXEMPT)
      const advisory = findings.find((f) => f.code === FDA_INGREDIENTS_EXEMPTION_UNSTATED)
      expect(advisory!.severity).toBe('advisory')
      expect(advisory!.citation.reference).toBe('21 CFR 101.100')

      const both = findingsFor(
        {
          ...US_FOOD_CONFORMANT.data,
          ingredients: [],
          ingredientsExempt: true,
          ingredientsExemption: bulkAtRetail,
        },
        stock,
      ).map((f) => f.code)
      expect(both, 'a stated paragraph wins over the old flag').toContain(FDA_INGREDIENTS_EXEMPT)
      expect(both).not.toContain(FDA_INGREDIENTS_EXEMPTION_UNSTATED)
    })

    it('still judges a list printed anyway', () => {
      const codes = findingsFor(
        {
          ...US_FOOD_CONFORMANT.data,
          ingredientsExemption: bulkAtRetail,
          ingredients: [
            { name: 'sugar', percentByWeight: 2 },
            { name: 'oats', percentByWeight: 97 },
          ],
          ingredientThreshold: { percent: 2 as const, count: 0 },
        },
        stock,
      ).map((f) => f.code)
      expect(codes).not.toContain(FDA_INGREDIENTS_EXEMPT)
      expect(codes).toContain(FDA_INGREDIENTS_OUT_OF_ORDER)
    })
  })

  describe('the §101.100(a)(1) assortment, which must bear a statement of what may be present', () => {
    // Read from the eCFR on 2026-09-16: exempt "with respect to any ingredient that is
    // not common to all packages", "on the condition that the label shall bear, in
    // conjunction with the names of such ingredients as are common to all packages, a
    // statement … indicating by name other ingredients which may be present".
    const assortment = (
      statement: string,
      mayBePresent: readonly string[] = ['pecans', 'walnuts'],
    ): UsFoodAssortmentExemption => ({ kind: 'assortment', statement, mayBePresent })
    const { ingredientThreshold: _threshold, ...withoutThreshold } = US_FOOD_CONFORMANT.data
    const named = 'May also contain pecans or walnuts.'
    const printedStatement = (data: UsFoodLabelData, onStock: LabelStock = stock) =>
      layOutUsFoodLabel({ data, stock: onStock })
        .primitives.filter(
          (p): p is TextPrimitive =>
            p.kind === 'text' && p.elementId === US_FOOD_ELEMENTS.assortmentStatement,
        )
        .map((p) => p.text)
        .join(' ')

    it('prints the statement as typed, after the list and its "Contains" statement', () => {
      const data = { ...US_FOOD_CONFORMANT.data, ingredientsExemption: assortment(named) }
      expect(printedStatement(data)).toBe(named)
      const boxes = layOutUsFoodLabel({ data, stock }).elements
      const top = (id: string) => boxes.find((e) => e.elementId === id)!.box.yMm
      expect(top(US_FOOD_ELEMENTS.assortmentStatement)).toBeGreaterThan(
        top(US_FOOD_ELEMENTS.containsStatement),
      )
      // Placed there so the "Contains" statement stays beside the list.
      expect(findingsFor(data, stock).map((f) => f.code)).not.toContain(FDA_CONTAINS_NOT_ADJACENT)
    })

    it('clears the exemption on the statement, and still judges the common ingredients', () => {
      const findings = findingsFor(
        { ...US_FOOD_CONFORMANT.data, ingredientsExemption: assortment(named) },
        stock,
      )
      const pass = findings.find((f) => f.code === FDA_INGREDIENTS_EXEMPT)
      expect(pass!.citation.reference).toBe('21 CFR 101.100(a)(1)')
      expect(pass!.elementId, 'naming the statement, so one that did not print withholds it').toBe(
        US_FOOD_ELEMENTS.assortmentStatement,
      )
      expect(
        findings.map((f) => f.code),
        'the list is judged as any list',
      ).toContain(FDA_INGREDIENTS_ORDER_MET)

      const misordered = findingsFor(
        {
          ...withoutThreshold,
          ingredientsExemption: assortment(named),
          ingredients: [...US_FOOD_CONFORMANT.data.ingredients!].reverse(),
        },
        stock,
      ).map((f) => f.code)
      expect(misordered, 'and a common list out of order is still reported').toContain(
        FDA_INGREDIENTS_OUT_OF_ORDER,
      )
    })

    it('owes only the statement where no ingredient is common to all packages', () => {
      const findings = findingsFor(
        {
          ...withoutThreshold,
          ingredients: [],
          ingredientsExemption: assortment(named),
        },
        stock,
      ).map((f) => f.code)
      expect(findings).toContain(FDA_INGREDIENTS_EXEMPT)
      expect(findings).not.toContain(FDA_INGREDIENTS_MISSING)
    })

    it('reports a claim with no statement, and one that leaves a name out', () => {
      const none = findingsFor(
        { ...US_FOOD_CONFORMANT.data, ingredientsExemption: assortment('  ') },
        stock,
      )
      expect(none.find((f) => f.code === FDA_ASSORTMENT_STATEMENT_MISSING)!.severity).toBe(
        'blocking',
      )
      expect(none.map((f) => f.code)).not.toContain(FDA_INGREDIENTS_EXEMPT)

      const partial = findingsFor(
        { ...US_FOOD_CONFORMANT.data, ingredientsExemption: assortment('May contain walnuts.') },
        stock,
      )
      const incomplete = partial.find((f) => f.code === FDA_ASSORTMENT_STATEMENT_INCOMPLETE)
      expect(incomplete!.message).toContain('"pecans"')
      expect(incomplete!.message).not.toContain('"walnuts"')
      expect(partial.map((f) => f.code)).not.toContain(FDA_INGREDIENTS_EXEMPT)

      const nothingDeclared = findingsFor(
        { ...US_FOOD_CONFORMANT.data, ingredientsExemption: assortment(named, ['  ']) },
        stock,
      ).map((f) => f.code)
      expect(nothingDeclared, 'a statement checked against no names has shown nothing').toContain(
        FDA_ASSORTMENT_STATEMENT_INCOMPLETE,
      )
    })

    it.each([
      ['egg', 'May also contain eggplant.', false],
      ['pea', 'May also contain peanuts.', false],
      ['oat', 'May also contain chocolate-coated raisins.', false],
      ['egg', 'May also contain egg.', true],
      ['Brazil nuts', 'May also contain pecans or brazil nuts.', true],
      ['pecans', 'May also contain PECANS.', true],
    ] as const)('names "%s" in "%s" only as a word of its own: %s', (name, statement, clears) => {
      // A bare substring cleared the first three, naming nothing the label declared.
      const codes = findingsFor(
        { ...US_FOOD_CONFORMANT.data, ingredientsExemption: assortment(statement, [name]) },
        stock,
      ).map((f) => f.code)
      expect(codes.includes(FDA_INGREDIENTS_EXEMPT)).toBe(clears)
      expect(codes.includes(FDA_ASSORTMENT_STATEMENT_INCOMPLETE)).toBe(!clears)
    })

    it('withholds the exemption when the statement does not print', () => {
      const data = { ...US_FOOD_CONFORMANT.data, ingredientsExemption: assortment(named) }
      const short: LabelStock = { ...stock, heightMm: 170 }
      const layout = layOutUsFoodLabel({ data, stock: short })
      expect(
        layout.omissions.map((o) => o.elementId),
        'the premise: the statement did not print in full',
      ).toContain(US_FOOD_ELEMENTS.assortmentStatement)
      const context = { labelType: 'us-food' as const, data, stock: short, layout }
      expect(
        usFoodIngredientListRule.check(context).map((f) => f.code),
        'the premise: the rule itself clears it',
      ).toContain(FDA_INGREDIENTS_EXEMPT)
      expect(runRules(context).map((f) => f.code)).not.toContain(FDA_INGREDIENTS_EXEMPT)
    })

    it('never lets a name in the statement declare an allergen the list did not', () => {
      // The statement is its own element for this reason. Folded into the list's text,
      // "may also contain almonds" would satisfy §403(w)(1)(B)(ii)'s "appears elsewhere
      // in the ingredient list" for an almond ingredient declared nowhere.
      const data: UsFoodLabelData = {
        ...US_FOOD_CONFORMANT.data,
        containsStatement: [],
        ingredients: US_FOOD_CONFORMANT.data.ingredients!.map((ingredient) =>
          ingredient.allergen === undefined
            ? ingredient
            : { ...ingredient, name: 'nut paste', declareInline: false },
        ),
        ingredientsExemption: assortment('May also contain almonds.', ['almonds']),
      }
      // Searched across every line the label prints, not only the statement's own
      // element, so the premise still holds if the statement were folded into the list.
      const everything = layOutUsFoodLabel({ data, stock })
        .primitives.filter((p): p is TextPrimitive => p.kind === 'text')
        .map((p) => p.text)
        .join(' ')
      expect(everything, 'the premise: the label prints "almonds" in the statement').toContain(
        'May also contain almonds.',
      )
      expect(findingsFor(data, stock).map((f) => f.code)).toContain(FDA_ALLERGEN_NOT_DECLARED)
    })

    it('holds the statement to the 101.2(c) floor', () => {
      const small = findingsFor(
        {
          ...US_FOOD_CONFORMANT.data,
          ingredientsExemption: assortment(named),
          informationPanelFontSizeMm: 2,
        },
        stock,
      ).filter((f) => f.code === FDA_PANEL_TYPE_TOO_SMALL)
      expect(small.map((f) => f.elementId)).toContain(US_FOOD_ELEMENTS.assortmentStatement)
    })
  })
})

describe('major food allergens', () => {
  const stock = US_FOOD_CONFORMANT.stock
  const withIngredients = (ingredients: UsFoodIngredient[], containsStatement?: string[]) =>
    findingsFor(
      {
        ...US_FOOD_CONFORMANT.data,
        ingredients,
        ingredientThreshold: { percent: 2 as const, count: 0 },
        ...(containsStatement === undefined
          ? {}
          : { containsStatement: containsStatement as never }),
      },
      stock,
    ).map((f) => f.code)

  it('accepts either form, and does not demand both', () => {
    // §403(w)(1) says "(A) ... or (B) ...". Requiring both would report a
    // violation against a label that complies by the route it chose.
    const viaContains = withIngredients(
      [{ name: 'whey', percentByWeight: 100, allergen: 'milk' }],
      ['milk'],
    )
    const viaParenthetical = withIngredients([
      { name: 'whey', percentByWeight: 100, allergen: 'milk', declareInline: true },
    ])
    expect(viaContains).not.toContain(FDA_ALLERGEN_NOT_DECLARED)
    expect(viaParenthetical).not.toContain(FDA_ALLERGEN_NOT_DECLARED)
  })

  it('excuses the parenthetical where the ingredient name already carries the source', () => {
    // §403(w)(1)(B)(i). "buttermilk" contains "milk", so nothing more is owed —
    // and this falls out of reading the printed label rather than needing a
    // clause of its own.
    expect(
      withIngredients([{ name: 'buttermilk', percentByWeight: 100, allergen: 'milk' }]),
    ).not.toContain(FDA_ALLERGEN_NOT_DECLARED)
  })

  it('excuses it where the source appears elsewhere in the list', () => {
    // §403(w)(1)(B)(ii).
    expect(
      withIngredients([
        { name: 'whey', percentByWeight: 60, allergen: 'milk' },
        { name: 'milk', percentByWeight: 40, allergen: 'milk', declareInline: true },
      ]),
    ).not.toContain(FDA_ALLERGEN_NOT_DECLARED)
  })

  it('does not let a non-allergen ingredient discharge the declaration', () => {
    // The caveat on (B)(ii): the appearance must not be "part of the name of a
    // food ingredient that is not a major food allergen". Coconut milk contains
    // no dairy, so the word "milk" in it declares nothing about the whey.
    expect(
      withIngredients([
        { name: 'whey', percentByWeight: 60, allergen: 'milk' },
        { name: 'coconut milk', percentByWeight: 40 },
      ]),
    ).toContain(FDA_ALLERGEN_NOT_DECLARED)
  })

  it('demands the species for a fish and the type for a nut, but not for milk', () => {
    // Three of the nine work this way under §403(w)(2) and six do not.
    expect(
      withIngredients([{ name: 'fish stock', percentByWeight: 100, allergen: 'fish' }]),
    ).toContain(FDA_ALLERGEN_SOURCE_NOT_SPECIFIC)
    expect(
      withIngredients([
        {
          name: 'fish stock',
          percentByWeight: 100,
          allergen: 'fish',
          allergenSpecificType: 'cod',
          declareInline: true,
        },
      ]),
    ).not.toContain(FDA_ALLERGEN_SOURCE_NOT_SPECIFIC)
    expect(
      withIngredients([
        { name: 'whey', percentByWeight: 100, allergen: 'milk', declareInline: true },
      ]),
    ).not.toContain(FDA_ALLERGEN_SOURCE_NOT_SPECIFIC)
  })

  it('declines entirely on a recipe with no allergen in it', () => {
    // Nothing to declare is not a declaration cleared.
    const codes = withIngredients([{ name: 'sugar', percentByWeight: 100 }])
    expect(codes.filter((code) => code.startsWith('FDA_ALLERGEN'))).toEqual([])
  })

  it('names sesame, which the FASTER Act added in 2021', () => {
    expect(MAJOR_FOOD_ALLERGENS.map((a) => a.id)).toContain('sesame')
    expect(MAJOR_FOOD_ALLERGENS).toHaveLength(9)
  })

  it("carries the statute's own wording, not a paraphrase", () => {
    // §321(qq)(1) writes "Crustacean shellfish" capitalised and "tree nuts" and
    // "soybeans" plural. A label reading "Contains: Shellfish" has not declared
    // what the Act asks for, so the table may not quietly normalise them.
    const byId = new Map(MAJOR_FOOD_ALLERGENS.map((a) => [a.id, a.name]))
    expect(byId.get('crustacean-shellfish')).toBe('Crustacean shellfish')
    expect(byId.get('tree-nuts')).toBe('tree nuts')
    expect(byId.get('soybeans')).toBe('soybeans')
  })

  it('returns nothing for an id it does not carry', () => {
    expect(majorFoodAllergen('shellfish')).toBeUndefined()
    expect(majorFoodAllergen('toString')).toBeUndefined()
  })
})

describe('findings from the stage 3 review', () => {
  const stock = US_FOOD_CONFORMANT.stock
  const textOf = (layout: ReturnType<typeof layOutUsFoodLabel>, elementId: string) =>
    layout.primitives
      .filter((p): p is TextPrimitive => p.kind === 'text' && p.elementId === elementId)
      .map((p) => p.text)
      .join(' ')

  describe('a relative type size is compared on one basis', () => {
    // The most ordinary food layout there is: an all-caps ingredient list under
    // a mixed-case "Contains" statement. Converting each through its own casing
    // made 4 mm of em read as 2.79 mm against 2.16 mm and reported a violation
    // against a label a typesetter had set to a single size.
    const data: UsFoodLabelData = {
      ...US_FOOD_CONFORMANT.data,
      ingredients: [
        { name: 'ROLLED OATS', percentByWeight: 99, allergen: 'wheat', declareInline: false },
      ],
      ingredientThreshold: { percent: 2, count: 0 },
      containsStatement: ['wheat'],
      informationPanelFontSizeMm: 4,
      containsStatementFontSizeMm: 4,
    }

    it('draws the casing the case depends on', () => {
      const layout = layOutUsFoodLabel({ data, stock })
      expect(/\p{Ll}/u.test(textOf(layout, US_FOOD_ELEMENTS.ingredients))).toBe(false)
      expect(/\p{Ll}/u.test(textOf(layout, US_FOOD_ELEMENTS.containsStatement))).toBe(true)
    })

    it('passes two blocks set at the same em', () => {
      expect(findingsFor(data, stock).map((f) => f.code)).not.toContain(FDA_CONTAINS_TYPE_TOO_SMALL)
    })

    it('still reports a statement genuinely set smaller', () => {
      const smaller = { ...data, containsStatementFontSizeMm: 3 }
      expect(findingsFor(smaller, stock).map((f) => f.code)).toContain(FDA_CONTAINS_TYPE_TOO_SMALL)
    })
  })

  describe('the "Contains" statement is composed from the recipe', () => {
    it('names every specific type, not the first of them', () => {
      // Two tree nuts. Taking the first drew "Contains: almonds." and the
      // allergen rule then reported walnuts undeclared, with no route through
      // §403(w)(1)(A) that could fix it.
      const data: UsFoodLabelData = {
        ...US_FOOD_CONFORMANT.data,
        ingredients: [
          {
            name: 'almond pieces',
            percentByWeight: 60,
            allergen: 'tree-nuts',
            allergenSpecificType: 'almonds',
          },
          {
            name: 'walnut pieces',
            percentByWeight: 40,
            allergen: 'tree-nuts',
            allergenSpecificType: 'walnuts',
          },
        ],
        ingredientThreshold: { percent: 2, count: 0 },
        containsStatement: ['tree-nuts'],
      }
      const layout = layOutUsFoodLabel({ data, stock })
      expect(textOf(layout, US_FOOD_ELEMENTS.containsStatement)).toBe('Contains: almonds, walnuts.')
      expect(findingsFor(data, stock).map((f) => f.code)).not.toContain(FDA_ALLERGEN_NOT_DECLARED)
    })

    it('refuses to declare an allergen no ingredient carries', () => {
      // "Contains: milk." on a food containing only sugar — the engine composing
      // a regulated declaration the recipe does not support, with nothing
      // reporting it because the allergen rule had no allergen to run on.
      const data: UsFoodLabelData = {
        ...US_FOOD_CONFORMANT.data,
        ingredients: [{ name: 'sugar', percentByWeight: 100 }],
        ingredientThreshold: { percent: 2, count: 0 },
        containsStatement: ['milk'],
      }
      const layout = layOutUsFoodLabel({ data, stock })
      expect(textOf(layout, US_FOOD_ELEMENTS.containsStatement)).toBe('')
      expect(layout.omissions.map((o) => o.reason).join(' ')).toContain('no ingredient carries')
    })

    it('says so when an allergen it names has no source name to print', () => {
      // Tree nuts, fish and crustacean shellfish are declared by their specific type,
      // and an ingredient that states none gives the statement nothing to name. It used
      // to draw nothing for it and record nothing, so a declared statement could leave
      // the label with no trace. §403(w)(2)'s finding reports the ingredient; the
      // omission reports what the artwork lost.
      const containsOmissions = (layout: ReturnType<typeof layOutUsFoodLabel>) =>
        layout.omissions.filter((o) => o.elementId === US_FOOD_ELEMENTS.containsStatement)
      const praline = { name: 'praline', percentByWeight: 10, allergen: 'tree-nuts' as const }
      const alone: UsFoodLabelData = {
        ...US_FOOD_CONFORMANT.data,
        ingredients: [{ name: 'sugar', percentByWeight: 90 }, praline],
        ingredientThreshold: { percent: 2, count: 0 },
        containsStatement: ['tree-nuts'],
      }
      const nothingNamed = layOutUsFoodLabel({ data: alone, stock })
      expect(textOf(nothingNamed, US_FOOD_ELEMENTS.containsStatement)).toBe('')
      const [lost] = containsOmissions(nothingNamed)
      expect(lost!.scope).toBe('detail')
      expect(lost!.reason).toContain('"praline"')
      expect(lost!.reason).toContain('tree nuts')
      expect(findingsFor(alone, stock).map((f) => f.code)).toContain(
        FDA_ALLERGEN_SOURCE_NOT_SPECIFIC,
      )

      // Beside an ingredient that does name its nut, the statement prints for that one and
      // still says what it could not name for the other.
      const beside: UsFoodLabelData = {
        ...alone,
        ingredients: [
          { name: 'sugar', percentByWeight: 80 },
          praline,
          {
            name: 'almonds',
            percentByWeight: 10,
            allergen: 'tree-nuts',
            allergenSpecificType: 'almonds',
          },
        ],
      }
      const partlyNamed = layOutUsFoodLabel({ data: beside, stock })
      expect(textOf(partlyNamed, US_FOOD_ELEMENTS.containsStatement)).toBe('Contains: almonds.')
      expect(containsOmissions(partlyNamed).map((o) => o.reason)).toEqual([
        expect.stringContaining('"praline"'),
      ])

      // And nothing is recorded where every ingredient names its source.
      expect(containsOmissions(layOutUsFoodLabel(US_FOOD_CONFORMANT))).toEqual([])
    })

    it('leaves another allergen in that statement unconfirmed, though it printed whole', () => {
      // Pinned so the cost is a decision rather than an accident. The allergen rule asks
      // whether a declaring element has any omission, not which part of it was lost, so
      // the omission for an unnamed praline also withholds confirmation of the marzipan's
      // almonds, which "Contains: almonds." declares in full. Stricter than necessary,
      // never looser, and the over-firing `docs/BACKLOG.md` already records; the review
      // of this change found it. Fixing that entry should change this expectation.
      const data: UsFoodLabelData = {
        ...US_FOOD_CONFORMANT.data,
        ingredients: [
          { name: 'sugar', percentByWeight: 80 },
          { name: 'praline', percentByWeight: 10, allergen: 'tree-nuts' },
          {
            name: 'marzipan',
            percentByWeight: 10,
            allergen: 'tree-nuts',
            allergenSpecificType: 'almonds',
          },
        ],
        ingredientThreshold: { percent: 2, count: 0 },
        containsStatement: ['tree-nuts'],
      }
      const layout = layOutUsFoodLabel({ data, stock })
      expect(textOf(layout, US_FOOD_ELEMENTS.containsStatement)).toBe('Contains: almonds.')
      const findings = findingsFor(data, stock)
      const unconfirmed = findings.find((f) => f.code === 'FDA_ALLERGEN_DECLARATION_UNCONFIRMED')
      expect(unconfirmed!.severity).toBe('advisory')
      expect(unconfirmed!.message).toContain('"marzipan" contains almonds')
      expect(findings.map((f) => f.code)).not.toContain('FDA_CONTAINS_TYPE_MET')
    })
  })

  it('does not walk a prototype chain to find an allergen', () => {
    // A Map does not, so the guard copied here from the plain-object tables in
    // `text/metrics` allocated a nine-key object per lookup to prevent nothing —
    // on every keystroke in the editor.
    expect(majorFoodAllergen('toString')).toBeUndefined()
    expect(majorFoodAllergen('constructor')).toBeUndefined()
    expect(majorFoodAllergen('milk')?.name).toBe('milk')
  })
})

describe('the two clauses the Nutrition Facts rules turn on', () => {
  const stock = US_FOOD_CONFORMANT.stock
  const panel = US_FOOD_CONFORMANT.data.nutritionFacts!
  const withPanel = (patch: Partial<typeof panel>) =>
    findingsFor({ ...US_FOOD_CONFORMANT.data, nutritionFacts: { ...panel, ...patch } }, stock).map(
      (f) => f.code,
    )

  describe('101.9(d)(7)(ii) permits either basis for the percentage', () => {
    // "The percent shall be calculated by dividing **either** the amount
    // declared on the label for each nutrient **or** the actual amount of each
    // nutrient (i.e., before rounding) by the DRV". 8.7 g of fat declared as
    // 9 g is 11 percent from the actual and 12 from the declared — two
    // permitted answers, and a rule accepting one reports a violation against a
    // label that took the other.
    const amounts = { ...panel.amounts, 'total-fat': 8.7 }
    const declaredAmounts = { ...panel.declaredAmounts, 'total-fat': 9 }

    it('the two bases really do disagree here', () => {
      expect(Math.round((9 / 78) * 100)).toBe(12)
      expect(Math.round((8.7 / 78) * 100)).toBe(11)
    })

    it('accepts the percentage computed from the declared amount', () => {
      expect(
        withPanel({
          amounts,
          declaredAmounts,
          declaredPercentDv: { ...panel.declaredPercentDv, 'total-fat': 12 },
        }),
      ).not.toContain(FDA_NUTRITION_PERCENT_DV_WRONG)
    })

    it('accepts the percentage computed from the actual amount', () => {
      expect(
        withPanel({
          amounts,
          declaredAmounts,
          declaredPercentDv: { ...panel.declaredPercentDv, 'total-fat': 11 },
        }),
      ).not.toContain(FDA_NUTRITION_PERCENT_DV_WRONG)
    })

    it('still rejects a percentage neither basis gives', () => {
      expect(
        withPanel({
          amounts,
          declaredAmounts,
          declaredPercentDv: { ...panel.declaredPercentDv, 'total-fat': 13 },
        }),
      ).toContain(FDA_NUTRITION_PERCENT_DV_WRONG)
    })
  })

  describe('101.9(c)(8)(ii) permits additional significance on a mineral weight', () => {
    // "additional levels of significance may be used when the number of decimal
    // places indicated is not sufficient". 235 mg of potassium and 235.4 mg are
    // both proper declarations, so no single value can be demanded — which is
    // how an invented 10 mg increment was caught turning 101.9(d)(8)'s own
    // worked example into 240 mg.
    it('does not report a weight declared more precisely than whole units', () => {
      expect(
        withPanel({
          amounts: { ...panel.amounts, potassium: 235.4 },
          declaredAmounts: { ...panel.declaredAmounts, potassium: 235.4 },
        }),
      ).not.toContain(FDA_NUTRITION_ROUNDING_WRONG)
    })

    it("reproduces the regulation's own worked weight rather than rounding past it", () => {
      expect(roundNutrientAmount('potassium', 235)).toBe(235)
      expect(roundNutrientAmount('calcium', 260)).toBe(260)
    })

    it('still reports a macronutrient rounded wrongly', () => {
      // The skip is scoped to the vitamins and minerals and nothing else.
      expect(
        withPanel({
          amounts: { ...panel.amounts, sodium: 163 },
          declaredAmounts: { ...panel.declaredAmounts, sodium: 165 },
        }),
      ).toContain(FDA_NUTRITION_ROUNDING_WRONG)
    })
  })
})

describe('findings from the stage 4 review', () => {
  const stock = US_FOOD_CONFORMANT.stock

  it('a blank ingredient row does not undeclare every allergen on the label', () => {
    // §403(w)(1)(B)(ii)'s caveat is implemented by striking non-allergen
    // ingredient names out of the printed list before searching it. `split('')`
    // splits between every character, so one empty name turned the list into
    // spaced-out letters and nothing was ever found in it again — and the rail's
    // "Add an ingredient" button inserts exactly that row.
    const { containsStatement: _drop, ...rest } = US_FOOD_CONFORMANT.data
    const whey = {
      name: 'whey',
      percentByWeight: 100,
      allergen: 'milk' as const,
      declareInline: true,
    }
    const codesFor = (ingredients: UsFoodIngredient[]) =>
      findingsFor(
        { ...rest, ingredients, ingredientThreshold: { percent: 2 as const, count: 0 } },
        stock,
      ).map((f) => f.code)

    expect(codesFor([whey])).toContain('FDA_ALLERGEN_DECLARED_MET')
    expect(codesFor([whey, { name: '', percentByWeight: 0 }])).toContain(
      'FDA_ALLERGEN_DECLARED_MET',
    )
    expect(codesFor([whey, { name: '   ', percentByWeight: 0 }])).not.toContain(
      FDA_ALLERGEN_NOT_DECLARED,
    )
  })

  it('still strikes out a real non-allergen name, which is the point of the loop', () => {
    // Coconut milk contains no dairy, so the word "milk" in it declares nothing
    // about the whey. Skipping blanks must not have skipped this.
    const { containsStatement: _drop, ...rest } = US_FOOD_CONFORMANT.data
    const codes = findingsFor(
      {
        ...rest,
        ingredients: [
          { name: 'whey', percentByWeight: 60, allergen: 'milk' },
          { name: 'coconut milk', percentByWeight: 40 },
          { name: '', percentByWeight: 0 },
        ],
        ingredientThreshold: { percent: 2, count: 0 },
      },
      stock,
    ).map((f) => f.code)
    expect(codes).toContain(FDA_ALLERGEN_NOT_DECLARED)
  })

  it('reports a nutrient the panel holds but does not print', () => {
    // The order rule narrows its expectation to what `order` lists and leaves
    // omissions to the completeness rule; the completeness rule was reading
    // `amounts`. A panel listing 14 of 15 came back "All 15 mandatory nutrients
    // are declared" beside "14 nutrients run in the order 101.9(c) sets", with
    // nobody owning the dropped line.
    const panel = US_FOOD_CONFORMANT.data.nutritionFacts!
    const codes = findingsFor(
      {
        ...US_FOOD_CONFORMANT.data,
        nutritionFacts: {
          ...panel,
          order: panel.order!.filter((id) => id !== 'potassium'),
        },
      },
      stock,
    )
    const missing = codes.find((f) => f.code === 'FDA_NUTRITION_NUTRIENT_MISSING')
    expect(
      missing,
      'a nutrient dropped from the printed order was reported by nobody',
    ).toBeDefined()
    expect(missing!.message).toContain('Potassium')
    expect(codes.map((f) => f.code)).not.toContain('FDA_NUTRITION_COMPLETE')
  })

  it('the example label declares only allergens the food contains', () => {
    // Oats are not wheat and are not one of the nine. The shipped example
    // marked them `wheat`, so the first label anyone sees declared an allergen
    // the food does not contain — on a tool whose only value is being right.
    const declared = (US_FOOD_CONFORMANT.data.ingredients ?? []).flatMap((i) =>
      i.allergen === undefined ? [] : [i.allergen],
    )
    expect(declared).toEqual(['tree-nuts'])
    expect(US_FOOD_CONFORMANT.data.containsStatement).toEqual(['tree-nuts'])
  })
})

describe('the drawn Nutrition Facts panel', () => {
  const stock = US_FOOD_CONFORMANT.stock
  const layout = layOutUsFoodLabel(US_FOOD_CONFORMANT)
  const bars = layout.primitives
    .filter(
      (p): p is Extract<typeof p, { kind: 'rect' }> =>
        p.kind === 'rect' && p.elementId === US_FOOD_ELEMENTS.nutritionPanel,
    )
    .sort((a, b) => a.yMm - b.yMm)

  it('draws the rule weights FDA states, to the micrometre', () => {
    // 7 pt = 2.4694 mm, 3 pt = 1.0583, ¼ pt = 0.0882. Transcribed figures, so
    // they are checked as transcriptions rather than trusted.
    const weights = [...new Set(bars.map((b) => Number(b.heightMm.toFixed(4))))].sort(
      (a, b) => a - b,
    )
    expect(weights).toContain(0.0882)
    expect(weights).toContain(1.0583)
    expect(weights).toContain(2.4694)
  })

  it('separates the heading from the servings line with a hairline', () => {
    // 101.9(d)(1)(v) says *shall*, and the panel drew nothing there — the same
    // sentence puts a hairline between nutrient rows, which it did draw, so the
    // half that was missing looked like the half that was present.
    const heading = layout.elements.find((e) => e.elementId === US_FOOD_ELEMENTS.nutritionHeading)!
    const servings = layout.elements.find(
      (e) => e.elementId === US_FOOD_ELEMENTS.nutritionServings,
    )!
    const between = bars.filter(
      (b) => b.yMm > heading.box.yMm + heading.box.heightMm && b.yMm < servings.box.yMm,
    )
    expect(between).toHaveLength(1)
    expect(between[0]!.heightMm).toBeCloseTo(0.0882, 4)
  })

  it('puts no rule above the first nutrient row', () => {
    // A hairline is "centered between nutrients" and the first has nothing above
    // it. Keying it off the loop index put one under the "% Daily Value"
    // heading, because Calories takes index 0 and is drawn further up — a rule
    // no printed Nutrition Facts label has.
    // Scoped to the gap between Calories and the first row. A blanket "no
    // hairline above the first row" was too broad the moment 101.9(d)(1)(v)'s
    // hairline under the heading arrived — which is higher up and required.
    const firstRow = layout.elements.find(
      (e) => e.elementId === nutritionRowElementId('total-fat'),
    )!
    const calories = layout.elements.find(
      (e) => e.elementId === US_FOOD_ELEMENTS.nutritionCalories,
    )!
    const hairlines = bars.filter(
      (b) =>
        b.heightMm < 0.1 &&
        b.yMm > calories.box.yMm + calories.box.heightMm &&
        b.yMm < firstRow.box.yMm,
    )
    expect(hairlines).toEqual([])
  })

  it('gives every nutrient its own element, so a finding can point at the row', () => {
    for (const id of ['total-fat', 'added-sugars', 'potassium']) {
      expect(layout.elements.map((e) => e.elementId)).toContain(nutritionRowElementId(id))
    }
  })

  it('counts the panel once when measuring what the net quantity stands clear of', () => {
    // The box and its rows are one block of ink. Counting both read "stands
    // clear of the 24 other elements" on a label carrying five printed blocks:
    // the statement of identity, the panel, the ingredient statement, the
    // "Contains" statement and the responsible firm. A single crowding could
    // also have produced a finding per row.
    const pass = findingsFor(US_FOOD_CONFORMANT.data, stock).find(
      (f) => f.code === 'FDA_NET_QUANTITY_SEPARATION_MET',
    )
    expect(pass!.message).toContain('5 other elements')
  })

  it('reports a panel scaled below the minimums 101.9(d) sets', () => {
    const codes = findingsFor(
      {
        ...US_FOOD_CONFORMANT.data,
        nutritionFacts: { ...US_FOOD_CONFORMANT.data.nutritionFacts!, typeScale: 0.8 },
      },
      stock,
    ).map((f) => f.code)
    expect(codes).toContain('FDA_NUTRITION_TYPE_TOO_SMALL')
  })

  it('passes the panel drawn at the minimums themselves', () => {
    expect(findingsFor(US_FOOD_CONFORMANT.data, stock).map((f) => f.code)).toContain(
      'FDA_NUTRITION_TYPE_SIZE_MET',
    )
  })
})

describe('the §101.9(j) nutrition exemption', () => {
  // Shipped since stage 4 and never once asserted — it appeared in a test only
  // as setup for something else, which is how a documented branch ends up with
  // no coverage while every code it emits looks accounted for.
  const stock = US_FOOD_CONFORMANT.stock
  const { nutritionFacts: _panel, ...withoutPanel } = US_FOOD_CONFORMANT.data

  it('reports a missing panel as blocking when nothing is claimed', () => {
    const match = findingsFor(withoutPanel, stock).find((f) => f.code === 'FDA_NUTRITION_MISSING')
    expect(match!.severity).toBe('blocking')
    expect(match!.citation.reference).toBe('21 CFR 101.9(c)')
  })

  // Each kind is named for the paragraph that grants it, and the pass must cite that
  // paragraph — not 101.9(j) as a whole, which exempts nothing by itself.
  const PARAGRAPH: Record<(typeof US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE)[number], string> = {
    'small-business': '21 CFR 101.9(j)(1)',
    'food-service': '21 CFR 101.9(j)(2)',
    'retail-prepared': '21 CFR 101.9(j)(3)',
    'insignificant-nutrients': '21 CFR 101.9(j)(4)',
    'medical-food': '21 CFR 101.9(j)(8)',
    'bulk-for-manufacture': '21 CFR 101.9(j)(9)',
    'raw-produce-or-fish': '21 CFR 101.9(j)(10)',
    'custom-processed-fish-or-game': '21 CFR 101.9(j)(11)(ii)',
    'bulk-at-retail': '21 CFR 101.9(j)(16)',
    'low-volume': '21 CFR 101.9(j)(18)',
  }

  it.each(US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE.map((kind) => [kind] as const))(
    'clears it when the label claims %s, citing its own paragraph',
    (kind) => {
      const findings = findingsFor({ ...withoutPanel, nutritionExemption: { kind } }, stock)
      const match = findings.find((f) => f.code === 'FDA_NUTRITION_EXEMPT')
      expect(match!.severity).toBe('pass')
      expect(match!.citation.reference).toBe(PARAGRAPH[kind])
      expect(match!.message, 'and says what it cannot check').toContain('Not checked here:')
      expect(findings.map((f) => f.code)).not.toContain('FDA_NUTRITION_MISSING')
    },
  )

  it('offers no exemption that holds only on something printed that nothing checks', () => {
    // (j)(13)(i)'s address or telephone number, (j)(14)'s information beneath the
    // carton lid and (j)(15)'s "This Unit Not Labeled For Retail Sale" are each a
    // condition on the package. A first draft offered (j)(14), and its pass said no
    // panel was required of a carton whose panel had only moved. All three are
    // offered now, as kinds declared with particulars — the line and the statement
    // because they are checked, below, and the carton because it keeps its nutrition
    // information and has it judged — and nothing claimed by paragraph alone reaches
    // any of them.
    expect(
      US_FOOD_NUTRITION_EXEMPTIONS.filter(
        (kind) => !(US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE as readonly string[]).includes(kind),
      ),
    ).toEqual(['small-package', 'unit-container', 'egg-carton'])
    const cited = US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE.map((kind) =>
      findingsFor({ ...withoutPanel, nutritionExemption: { kind } }, stock).find(
        (f) => f.code === 'FDA_NUTRITION_EXEMPT',
      ),
    ).map((pass) => pass!.citation.reference)
    for (const paragraph of ['(j)(13)', '(j)(14)', '(j)(15)']) {
      expect(
        cited.filter((reference) => reference.includes(paragraph)),
        paragraph,
      ).toEqual([])
    }
  })

  it('asks which paragraph a label saved with the old bare flag claims', () => {
    const findings = findingsFor({ ...withoutPanel, nutritionFactsExempt: true }, stock)
    const codes = findings.map((f) => f.code)
    expect(codes, 'still excused, so a label that once cleared is not blocked').not.toContain(
      'FDA_NUTRITION_MISSING',
    )
    expect(codes, 'but no longer cleared').not.toContain('FDA_NUTRITION_EXEMPT')
    const advisory = findings.find((f) => f.code === FDA_NUTRITION_EXEMPTION_UNSTATED)
    expect(advisory!.severity).toBe('advisory')
    expect(advisory!.citation.reference).toBe('21 CFR 101.9(j)')
  })

  it('does not let the claim excuse a panel that is present and wrong', () => {
    // The exemption relieves a food of bearing a panel. A panel printed anyway
    // is judged — the same reading as §101.100 and the ingredient list.
    const codes = findingsFor(
      {
        ...US_FOOD_CONFORMANT.data,
        nutritionExemption: { kind: 'small-business' },
        nutritionFacts: { ...US_FOOD_CONFORMANT.data.nutritionFacts!, typeScale: 0.8 },
      },
      stock,
    ).map((f) => f.code)
    expect(codes).toContain('FDA_NUTRITION_TYPE_TOO_SMALL')
  })

  describe('the (j)(13)(i) small package, which must bear a line to ask for the information', () => {
    // Read from the eCFR on 2026-09-16: packages "that have a total surface area
    // available to bear labeling of less than 12 square inches", on which (A) requires
    // "an address or telephone number that a consumer can use to obtain the required
    // nutrition information".
    const line = 'For nutrition information, call 1-800-555-0100'
    const codesOf = (findings: { code: string }[]) => findings.map((f) => f.code)
    // A 60 × 70 mm label is 6.51 in². A package bears at least the labeling on it, so a
    // label of 12 in² or more rules the exemption out — which the full-size stock the
    // rest of this file uses would do before any of these cases were reached.
    const fullSize = US_FOOD_CONFORMANT.stock
    const stock: LabelStock = { widthMm: 60, heightMm: 70, marginMm: 3 }
    // And a small package: 50 × 60 mm is a 4.65 in² panel, which does not rule it out either.
    const claim = (patch: Partial<UsFoodSmallPackageExemption> = {}): UsFoodLabelData => ({
      ...withoutPanel,
      container: { shape: 'rectangular', widthMm: 50, heightMm: 60 },
      nutritionExemption: {
        kind: 'small-package',
        availableSurfaceSqInches: 11.5,
        contactLine: line,
        ...patch,
      },
    })
    const contactText = (data: UsFoodLabelData, onStock: LabelStock = stock) =>
      layOutUsFoodLabel({ data, stock: onStock })
        .primitives.filter(
          (p): p is TextPrimitive =>
            p.kind === 'text' && p.elementId === US_FOOD_ELEMENTS.smallPackageContact,
        )
        .map((p) => p.text)
        .join(' ')

    it('prints the line as typed and clears the exemption on it', () => {
      expect(contactText(claim()), 'the engine prints it, and composes nothing').toBe(line)
      const findings = findingsFor(claim(), stock)
      const pass = findings.find((f) => f.code === 'FDA_NUTRITION_EXEMPT')
      expect(pass!.citation.reference).toBe('21 CFR 101.9(j)(13)(i)')
      expect(pass!.elementId, 'naming the line, so a line that did not print withholds it').toBe(
        US_FOOD_ELEMENTS.smallPackageContact,
      )
      expect(findings.map((f) => f.code)).not.toContain('FDA_NUTRITION_MISSING')
    })

    it('refuses it on a label of 12 square inches or more, whatever area is typed', () => {
      // The PR review found the first fixtures declaring 11.5 in² on a 120 × 240 mm label.
      const findings = findingsFor(claim(), fullSize)
      const missing = findings.find((f) => f.code === 'FDA_NUTRITION_MISSING')
      expect(missing!.message).toContain('The label is itself 44.6 in²')
      expect(missing!.citation.reference).toBe('21 CFR 101.9(j)(13)(i)')
      expect(codesOf(findings)).not.toContain('FDA_NUTRITION_EXEMPT')
      // Nor on a small label on a package whose panel alone is 44.6 in².
      const onBigPackage = findingsFor(
        { ...claim(), container: US_FOOD_CONFORMANT.data.container },
        stock,
      )
      expect(onBigPackage.find((f) => f.code === 'FDA_NUTRITION_MISSING')!.message).toContain(
        'The principal display panel is itself 44.6 in²',
      )
      // 12 in² exactly is not "less than 12": 3 × 4 inches.
      expect(
        codesOf(findingsFor(claim(), { widthMm: 76.2, heightMm: 101.6, marginMm: 3 })),
      ).not.toContain('FDA_NUTRITION_EXEMPT')
    })

    it('refuses it for a package of 12 square inches or more, which "less than 12" excludes', () => {
      expect(codesOf(findingsFor(claim({ availableSurfaceSqInches: 11.99 }), stock))).toContain(
        'FDA_NUTRITION_EXEMPT',
      )
      const findings = findingsFor(claim({ availableSurfaceSqInches: 12 }), stock)
      const missing = findings.find((f) => f.code === 'FDA_NUTRITION_MISSING')
      expect(missing!.severity).toBe('blocking')
      expect(missing!.citation.reference, 'the paragraph the claim failed').toBe(
        '21 CFR 101.9(j)(13)(i)',
      )
      expect(codesOf(findings)).not.toContain('FDA_NUTRITION_EXEMPT')
    })

    it.each([Number.NaN, 0, -3])(
      'does not read an area of %s as small enough',
      (availableSurfaceSqInches) => {
        // A blank area arrives as NaN, and 0 or less describes no surface at all. Read
        // as under 12, either would exempt a package nobody measured — a review caught
        // 0 doing exactly that after NaN had been handled.
        const findings = findingsFor(claim({ availableSurfaceSqInches }), stock)
        const missing = findings.find((f) => f.code === 'FDA_NUTRITION_MISSING')
        expect(missing!.message).toContain('declares no area above zero')
        expect(codesOf(findings)).not.toContain('FDA_NUTRITION_EXEMPT')
      },
    )

    it('reports a claim with no line, and prints nothing for it', () => {
      const data = claim({ contactLine: '   ' })
      expect(contactText(data)).toBe('')
      const findings = findingsFor(data, stock)
      const missing = findings.find((f) => f.code === FDA_NUTRITION_CONTACT_MISSING)
      expect(missing!.severity).toBe('blocking')
      expect(missing!.citation.reference).toBe('21 CFR 101.9(j)(13)(i)(A)')
      expect(codesOf(findings)).not.toContain('FDA_NUTRITION_EXEMPT')
    })

    it('withholds the exemption when the line does not print', () => {
      // A label short enough that the line, drawn under the statement of identity,
      // begins past its bottom edge. The rule clears it; the guard must not let that
      // stand, because (A) is about what the label bears.
      const short: LabelStock = { ...stock, heightMm: 16 }
      const data = claim()
      const layout = layOutUsFoodLabel({ data, stock: short })
      expect(
        layout.omissions.map((o) => o.elementId),
        'the premise: the line did not print in full',
      ).toContain(US_FOOD_ELEMENTS.smallPackageContact)
      const context = { labelType: 'us-food' as const, data, stock: short, layout }
      expect(
        usFoodNutritionCompletenessRule.check(context).map((f) => f.code),
        'the premise: the rule itself clears it',
      ).toContain('FDA_NUTRITION_EXEMPT')
      expect(codesOf(runRules(context))).not.toContain('FDA_NUTRITION_EXEMPT')
    })

    it('holds the line to the 101.2(c) floor, since 101.9 sets no size for it', () => {
      const small = findingsFor({ ...claim(), informationPanelFontSizeMm: 2 }, stock).filter(
        (f) => f.code === FDA_PANEL_TYPE_TOO_SMALL,
      )
      expect(small.map((f) => f.elementId)).toContain(US_FOOD_ELEMENTS.smallPackageContact)
    })

    it('prints no line on a label that carries a panel, which is not using the exemption', () => {
      const data: UsFoodLabelData = {
        ...US_FOOD_CONFORMANT.data,
        nutritionExemption: {
          kind: 'small-package',
          availableSurfaceSqInches: 11.5,
          contactLine: line,
        },
      }
      expect(contactText(data, fullSize)).toBe('')
      const codes = codesOf(findingsFor(data, fullSize))
      expect(codes).toContain('FDA_NUTRITION_COMPLETE')
      expect(codes).not.toContain('FDA_NUTRITION_EXEMPT')
    })
  })

  describe('the (j)(15) unit container, which must bear the statement (iii) requires', () => {
    // Read from the eCFR on 2026-09-17: the unit containers in a multiunit retail
    // package are exempt where, among two conditions on the outer package, "each unit
    // container is labeled with the statement 'This Unit Not Labeled For Retail Sale'
    // in type size not less than 1/16-inch in height", and "the word 'individual' may
    // be used in lieu of or immediately preceding the word 'Retail'".
    const codesOf = (findings: { code: string }[]) => findings.map((f) => f.code)
    const claim = (patch: Partial<UsFoodUnitContainerExemption> = {}): UsFoodLabelData => ({
      ...withoutPanel,
      nutritionExemption: { kind: 'unit-container', wording: 'retail', ...patch },
    })
    const statementText = (data: UsFoodLabelData, onStock: LabelStock = stock) =>
      layOutUsFoodLabel({ data, stock: onStock })
        .primitives.filter(
          (p): p is TextPrimitive =>
            p.kind === 'text' && p.elementId === US_FOOD_ELEMENTS.unitContainerStatement,
        )
        .map((p) => p.text)
        .join(' ')

    it('carries the three wordings the paragraph permits, word for word', () => {
      // The regulation's own text, with "individual" in lieu of "Retail" and then
      // immediately preceding it. Written out here rather than derived, so the table
      // is checked against the paragraph and not against itself.
      expect(UNIT_CONTAINER_STATEMENTS).toEqual({
        retail: 'This Unit Not Labeled For Retail Sale',
        individual: 'This Unit Not Labeled For Individual Sale',
        'individual-retail': 'This Unit Not Labeled For Individual Retail Sale',
      })
    })

    it.each(UNIT_CONTAINER_WORDINGS)('prints the %s wording from the table', (wording) => {
      expect(statementText(claim({ wording }))).toBe(UNIT_CONTAINER_STATEMENTS[wording])
    })

    it('clears the exemption on the printed statement, citing (j)(15)', () => {
      const findings = findingsFor(claim(), stock)
      const pass = findings.find((f) => f.code === 'FDA_NUTRITION_EXEMPT')
      expect(pass!.citation.reference).toBe('21 CFR 101.9(j)(15)')
      expect(pass!.elementId, 'naming the statement, so one that did not print withholds it').toBe(
        US_FOOD_ELEMENTS.unitContainerStatement,
      )
      expect(pass!.message, 'and says what it cannot check').toContain('Not checked here:')
      expect(codesOf(findings)).not.toContain('FDA_NUTRITION_MISSING')
    })

    it('reports a statement under 1/16 inch under (iii), and withholds the exemption', () => {
      // 2 mm of em puts the lowercase "o" at 0.540 × 2 = 1.08 mm, under the 1.5875 mm floor.
      const findings = findingsFor({ ...claim(), informationPanelFontSizeMm: 2 }, stock)
      const small = findings.find((f) => f.code === FDA_UNIT_CONTAINER_STATEMENT_TOO_SMALL)
      expect(small!.severity).toBe('blocking')
      expect(small!.citation.reference).toBe('21 CFR 101.9(j)(15)(iii)')
      expect(small!.elementId).toBe(US_FOOD_ELEMENTS.unitContainerStatement)
      expect(small!.measurement).toEqual({ actual: '1.08 mm', required: '1.59 mm' })
      expect(codesOf(findings)).not.toContain('FDA_NUTRITION_EXEMPT')
    })

    it('judges that height under (iii) alone, not under 101.2(c) as well', () => {
      // One dimension, one finding: (iii) sets the same 1/16 inch for the statement by
      // name, so the panel-wide rule leaves it to the specific provision, as it leaves
      // the net quantity to 101.7(i).
      const under101_2c = findingsFor({ ...claim(), informationPanelFontSizeMm: 2 }, stock)
        .filter((f) => f.code === FDA_PANEL_TYPE_TOO_SMALL)
        .map((f) => f.elementId)
      expect(under101_2c).not.toContain(US_FOOD_ELEMENTS.unitContainerStatement)
    })

    it('reports a claim whose statement is not on the label, rather than trusting the claim', () => {
      // The engine prints it whenever it is claimed, so this strips it from the layout
      // and asks the rule alone: does the pass rest on the artwork, or on the document?
      const data = claim()
      const drawn = layOutUsFoodLabel({ data, stock })
      const without = (id: string | undefined) => id !== US_FOOD_ELEMENTS.unitContainerStatement
      const layout = {
        ...drawn,
        primitives: drawn.primitives.filter((p) => without(p.elementId)),
        elements: drawn.elements.filter((e) => without(e.elementId)),
      }
      const findings = usFoodNutritionCompletenessRule.check({
        labelType: 'us-food',
        data,
        stock,
        layout,
      })
      const missing = findings.find((f) => f.code === 'FDA_NUTRITION_MISSING')
      expect(missing!.severity).toBe('blocking')
      expect(missing!.citation.reference).toBe('21 CFR 101.9(j)(15)(iii)')
      expect(missing!.elementId, 'nothing printed, so the panel it would sit on').toBe(
        US_FOOD_ELEMENTS.principalDisplayPanel,
      )
      expect(codesOf(findings)).not.toContain('FDA_NUTRITION_EXEMPT')
    })

    it('reports a statement printed in words other than those claimed, and outlines it', () => {
      // A layout drawn for one wording, judged against a claim of another: the words on the
      // unit are the thing at fault, so the finding names the element that carries them.
      const layout = layOutUsFoodLabel({ data: claim({ wording: 'retail' }), stock })
      const data = claim({ wording: 'individual' })
      const findings = usFoodNutritionCompletenessRule.check({
        labelType: 'us-food',
        data,
        stock,
        layout,
      })
      const missing = findings.find((f) => f.code === 'FDA_NUTRITION_MISSING')
      expect(missing!.citation.reference).toBe('21 CFR 101.9(j)(15)(iii)')
      expect(missing!.measurement).toEqual({
        actual: 'This Unit Not Labeled For Retail Sale',
        required: '"This Unit Not Labeled For Individual Sale"',
      })
      expect(missing!.elementId).toBe(US_FOOD_ELEMENTS.unitContainerStatement)
      expect(codesOf(findings)).not.toContain('FDA_NUTRITION_EXEMPT')
    })

    it('withholds the exemption when the statement does not print in full', () => {
      const short: LabelStock = { ...stock, heightMm: 16 }
      const data = claim()
      const layout = layOutUsFoodLabel({ data, stock: short })
      expect(
        layout.omissions.map((o) => o.elementId),
        'the premise: the statement did not print in full',
      ).toContain(US_FOOD_ELEMENTS.unitContainerStatement)
      const context = { labelType: 'us-food' as const, data, stock: short, layout }
      expect(
        usFoodNutritionCompletenessRule.check(context).map((f) => f.code),
        'the premise: the rule itself clears it',
      ).toContain('FDA_NUTRITION_EXEMPT')
      expect(codesOf(runRules(context))).not.toContain('FDA_NUTRITION_EXEMPT')
    })

    it('prints no statement on a label that carries a panel, which is not using the exemption', () => {
      const data: UsFoodLabelData = {
        ...US_FOOD_CONFORMANT.data,
        nutritionExemption: { kind: 'unit-container', wording: 'retail' },
      }
      expect(statementText(data)).toBe('')
      const codes = codesOf(findingsFor(data, stock))
      expect(codes).toContain('FDA_NUTRITION_COMPLETE')
      expect(codes).not.toContain('FDA_NUTRITION_EXEMPT')
    })
  })

  describe('the (j)(14) egg carton, whose nutrition information moves beneath the lid', () => {
    // Read from the eCFR on 2026-09-17: shell eggs in a carton with a top lid "designed
    // to conform to the shape of the eggs are exempt from outer carton label requirements
    // where the required nutrition information is clearly presented immediately beneath
    // the carton lid or in an insert that can be clearly seen when the carton is opened".
    // Relocated, not excused: the information is still declared, and still judged.
    const codesOf = (findings: { code: string }[]) => findings.map((f) => f.code)
    const carton = (
      presentedIn: 'beneath-lid' | 'insert' = 'beneath-lid',
      data: UsFoodLabelData = US_FOOD_CONFORMANT.data,
    ): UsFoodLabelData => ({ ...data, nutritionExemption: { kind: 'egg-carton', presentedIn } })

    it('draws no panel on the outer carton, says so, and still exports', () => {
      const layout = layOutUsFoodLabel({ data: carton(), stock })
      expect(
        layout.primitives.filter((p) => p.elementId?.startsWith(NUTRITION_ELEMENT_PREFIX)),
        'nothing of the panel is drawn on the outer carton',
      ).toEqual([])
      const omitted = layout.omissions.filter(
        (o) => o.elementId === US_FOOD_ELEMENTS.nutritionPanel,
      )
      expect(omitted).toHaveLength(1)
      expect(omitted[0]!.scope, 'the outer carton is a whole label without it').toBe('detail')
      expect(omitted[0]!.reason).toContain('101.9(j)(14)')
      expect(omitted[0]!.reason).toContain('beneath the carton lid')
      expect(blockingOmissions(layout)).toEqual([])
    })

    it.each([
      ['beneath-lid', 'beneath the carton lid'],
      ['insert', 'in an insert'],
    ] as const)('clears it on information declared %s, citing (j)(14)', (presentedIn, words) => {
      const findings = findingsFor(carton(presentedIn), stock)
      const pass = findings.find((f) => f.code === 'FDA_NUTRITION_EXEMPT')
      expect(pass!.citation.reference).toBe('21 CFR 101.9(j)(14)')
      expect(pass!.message).toContain(words)
      expect(pass!.message, 'and says what it cannot check').toContain('Not checked here:')
      expect(pass!.message, 'naming the column among what is judged').toContain(
        'must declare any second column the package owes',
      )
      expect(pass!.message, 'and its layout among what is not').toContain(
        'whether a second column states every figure the first does',
      )
      expect(codesOf(findings)).not.toContain('FDA_NUTRITION_MISSING')
    })

    it('refuses it where no nutrition information is declared at all', () => {
      const findings = findingsFor(carton('beneath-lid', withoutPanel), stock)
      const missing = findings.find((f) => f.code === 'FDA_NUTRITION_MISSING')
      expect(missing!.severity).toBe('blocking')
      expect(missing!.citation.reference).toBe('21 CFR 101.9(j)(14)')
      expect(codesOf(findings)).not.toContain('FDA_NUTRITION_EXEMPT')
    })

    it('still reports a nutrient missing from the information declared', () => {
      const findings = findingsFor(
        carton('beneath-lid', fixture('a panel with no potassium on it').data),
        stock,
      )
      expect(codesOf(findings)).toContain('FDA_NUTRITION_NUTRIENT_MISSING')
      expect(codesOf(findings)).not.toContain('FDA_NUTRITION_EXEMPT')
    })

    it('still judges the declared figures, and certifies none of them as printed', () => {
      const wrong = findingsFor(
        carton('beneath-lid', fixture('sodium rounded in the wrong band').data),
        stock,
      )
      expect(codesOf(wrong), 'a figure wrong on the lid is wrong').toContain(
        'FDA_NUTRITION_ROUNDING_WRONG',
      )

      // Premise: on the outer label these pass, each on the artwork of the panel.
      const artworkPasses = [
        'FDA_NUTRITION_COMPLETE',
        'FDA_NUTRITION_ORDER_MET',
        'FDA_NUTRITION_ROUNDING_MET',
        'FDA_NUTRITION_PERCENT_DV_MET',
        'FDA_SERVING_SIZE_MET',
      ]
      const unclaimed = codesOf(findingsFor(US_FOOD_CONFORMANT.data, stock))
      for (const code of artworkPasses) expect(unclaimed, `premise: ${code}`).toContain(code)
      // Nothing here drew them, so none of them is certified.
      const claimed = codesOf(findingsFor(carton(), stock))
      for (const code of artworkPasses) expect(claimed, code).not.toContain(code)
    })

    it('still requires a second column the carton owes, judged on what it declares', () => {
      // (j)(14) moves the required nutrition information, and a package inside
      // (b)(12)(i)'s band is required to carry a second column in it. The panel is not
      // drawn here, so the column cannot be read off the layout — but saying nothing
      // would excuse a column the regulation still demands.
      const oneColumn = fixture('a 250 percent package carrying one column')
      expect(
        codesOf(findingsFor(oneColumn.data, oneColumn.stock)),
        'premise: the outer label owes a second column',
      ).toContain('FDA_DUAL_COLUMN_MISSING')
      const findings = findingsFor(carton('beneath-lid', oneColumn.data), oneColumn.stock)
      const missing = findings.find((f) => f.code === 'FDA_DUAL_COLUMN_MISSING')
      expect(missing!.severity).toBe('violation')
      expect(missing!.citation.reference).toBe('21 CFR 101.9(b)(12)(i)')
      expect(missing!.message, 'and does not describe a panel as drawn').not.toContain('as drawn')
      expect(missing!.elementId, 'naming the carton, since no panel is on it').toBe(
        US_FOOD_ELEMENTS.principalDisplayPanel,
      )

      // Declared with its figures, the column is not reported missing — and not certified,
      // since nothing here printed it.
      const facts = oneColumn.data.nutritionFacts!
      const twoColumns: UsFoodLabelData = {
        ...oneColumn.data,
        nutritionFacts: {
          ...facts,
          columns: {
            mode: 'dual',
            basis: 'per-container',
            headings: ['Per serving', 'Per container'],
            secondAmounts: { ...facts.amounts },
          },
        },
      }
      expect(
        codesOf(findingsFor(twoColumns, oneColumn.stock)),
        'premise: on the outer label the declared column is drawn and passes',
      ).toContain('FDA_DUAL_COLUMN_MET')
      const declared = codesOf(findingsFor(carton('insert', twoColumns), oneColumn.stock))
      expect(declared).not.toContain('FDA_DUAL_COLUMN_MISSING')
      expect(declared).not.toContain('FDA_DUAL_COLUMN_MET')
    })
  })
})

describe('a second column may state its own percentages', () => {
  // 101.9(e)(2), (e)(3) and (e)(6) each present the (d)(7)(ii) percentages in both columns,
  // and until now only the first column could state one: the second derived every figure,
  // and derived none for protein. So a toddler food on a dual-column panel could not comply.
  const stock = US_FOOD_CONFORMANT.stock
  const panel = US_FOOD_CONFORMANT.data.nutritionFacts!
  const dual = (
    columns: Partial<NonNullable<typeof panel.columns>> = {},
    facts: Partial<typeof panel> = {},
  ): UsFoodLabelData => ({
    ...US_FOOD_CONFORMANT.data,
    nutritionFacts: {
      ...panel,
      ...facts,
      columns: {
        mode: 'dual',
        basis: 'per-container',
        headings: ['Per serving', 'Per container'],
        // 250 percent of each serving figure, the other fixtures' second column.
        secondAmounts: { ...panel.amounts, calcium: 650, 'total-fat': 7.5 },
        ...columns,
      },
    },
  })
  const codesOf = (findings: { code: string }[]) => findings.map((f) => f.code)
  const rowTexts = (data: UsFoodLabelData, id: Parameters<typeof nutritionRowElementId>[0]) =>
    layOutUsFoodLabel({ data, stock })
      .primitives.filter(
        (p): p is TextPrimitive => p.kind === 'text' && p.elementId === nutritionRowElementId(id),
      )
      .map((p) => p.text)

  it('prints a stated second-column percentage rather than the derived one', () => {
    // 650 mg of calcium against the 1,300 mg Daily Value derives 50 percent. A label may
    // state its own figure, as the first column may, and the panel prints what it states.
    expect(rowTexts(dual(), 'calcium').at(-1), 'premise: derived').toBe('650mg 50%')
    expect(rowTexts(dual({ secondPercentDv: { calcium: 45 } }), 'calcium').at(-1)).toBe('650mg 45%')
  })

  it('judges a stated second-column percentage as it judges the first', () => {
    const wrong = findingsFor(dual({ secondPercentDv: { calcium: 45 } }), stock).find(
      (f) => f.code === 'FDA_NUTRITION_PERCENT_DV_WRONG',
    )
    expect(wrong!.message).toContain('second column')
    expect(wrong!.measurement).toEqual({ actual: '45%', required: '50%' })
    expect(wrong!.elementId).toBe(nutritionRowElementId('calcium'))
    expect(
      codesOf(findingsFor(dual({ secondPercentDv: { calcium: 50 } }), stock)),
      'and clears the figure the column derives',
    ).toContain('FDA_NUTRITION_PERCENT_DV_MET')
  })

  it('lets a food for children 1 through 3 comply on a dual-column panel', () => {
    // The gap this field closes: (c)(7)(i) requires the protein percentage, the second
    // column could not state one, and the engine derives none for protein.
    const toddler = (columns: Partial<NonNullable<typeof panel.columns>> = {}) =>
      dual(columns, {
        representedFor: 'children-1-through-3',
        declaredPercentDv: { ...panel.declaredPercentDv, protein: 38 },
      })
    expect(
      codesOf(findingsFor(toddler(), stock)),
      'premise: without one, the second column is reported',
    ).toContain('FDA_PROTEIN_PERCENT_MISSING')
    const stated = codesOf(findingsFor(toddler({ secondPercentDv: { protein: 96 } }), stock))
    expect(stated).not.toContain('FDA_PROTEIN_PERCENT_MISSING')
    expect(stated).toContain('FDA_PROTEIN_PERCENT_MET')
  })

  it('reads the second column only where one was drawn', () => {
    // The review of the commit adding the field found the rule reading these figures from
    // the document alone. A panel left with a second column's figures after its mode went
    // back to single draws one column, and a correct figure there was counted in the pass —
    // certifying a percentage nothing printed, which is the shape this project guards.
    const leftovers = (secondPercentDv: Record<string, number>): UsFoodLabelData =>
      dual({ mode: 'single', secondPercentDv })
    for (const [label, percent] of [
      ['wrong', 45],
      ['right', 50],
    ] as const) {
      const data = leftovers({ calcium: percent })
      expect(
        layOutUsFoodLabel({ data, stock }).elements.map((e) => e.elementId),
        `premise: ${label}, no second column is drawn`,
      ).not.toContain(US_FOOD_ELEMENTS.nutritionSecondColumn)
      const codes = codesOf(findingsFor(data, stock))
      expect(codes, label).not.toContain('FDA_NUTRITION_PERCENT_DV_WRONG')
    }
    // The first column's own percentages are still judged, and still pass.
    expect(codesOf(findingsFor(leftovers({ calcium: 50 }), stock))).toContain(
      'FDA_NUTRITION_PERCENT_DV_MET',
    )
  })

  it('says so when it cannot print a stated second-column percentage', () => {
    // The engine prints a percentage beside an amount, so a figure stated for a nutrient
    // the second column gives no amount for has nowhere to go — as a second-column Calories
    // figure has nowhere to go, which the engine already records.
    const omissions = (data: UsFoodLabelData) =>
      layOutUsFoodLabel({ data, stock }).omissions.filter((o) =>
        o.reason.includes('second-column percentage'),
      )
    const dropped = omissions(
      dual({ secondPercentDv: { iron: 40 }, secondAmounts: { calcium: 650 } }),
    )
    expect(dropped).toHaveLength(1)
    expect(dropped[0]!.scope).toBe('detail')
    expect(dropped[0]!.elementId).toBe(nutritionRowElementId('iron'))
    expect(dropped[0]!.reason).toContain('Iron')
    expect(
      omissions(dual({ secondPercentDv: { calcium: 50 } })),
      'and nothing where the column has the amount to print it beside',
    ).toEqual([])
  })

  it('reads a row the panel left out of neither column', () => {
    // `order` decides which nutrients print, so a nutrient left out of it draws no cell in
    // either column while the panel around it draws two. Read panel-wide, the rule counted
    // its stated second-column figure — certifying one nothing printed.
    const withoutIron = dual(
      { secondPercentDv: { iron: 999 } },
      { order: NUTRIENT_IDS.filter((id) => id !== 'iron') },
    )
    expect(rowTexts(withoutIron, 'iron'), 'premise: neither column prints an iron cell').toEqual([])
    expect(codesOf(findingsFor(withoutIron, stock))).not.toContain('FDA_NUTRITION_PERCENT_DV_WRONG')
  })

  it('records a stated percentage the panel draws no second column for', () => {
    const single = dual({ mode: 'single', secondPercentDv: { calcium: 50 } })
    const dropped = layOutUsFoodLabel({ data: single, stock }).omissions.filter((o) =>
      o.reason.includes('second-column percentage'),
    )
    expect(dropped).toHaveLength(1)
    expect(dropped[0]!.reason).toContain('draws a single column')
  })

  it('asks an egg carton for the second column its information declares', () => {
    // No panel is drawn, so the figures are asked of the document: the same question, put
    // to a carton whose information is presented beneath the lid.
    const carton = (columns: Partial<NonNullable<typeof panel.columns>> = {}): UsFoodLabelData => ({
      ...dual(columns, {
        representedFor: 'children-1-through-3',
        declaredPercentDv: { ...panel.declaredPercentDv, protein: 38 },
      }),
      nutritionExemption: { kind: 'egg-carton', presentedIn: 'beneath-lid' },
    })
    expect(
      findingsFor(carton(), stock).map((f) => f.code),
      'the second column declares no protein percentage',
    ).toContain('FDA_PROTEIN_PERCENT_MISSING')
    // And says nothing where that column declares no protein amount either: an incomplete
    // column is the form rule's finding, as it is on a panel the engine draws.
    const { protein: _none, ...withoutProtein } = panel.amounts
    expect(
      codesOf(findingsFor(carton({ secondAmounts: withoutProtein }), stock)),
      'an incomplete second column is not a missing percentage',
    ).not.toContain('FDA_PROTEIN_PERCENT_MISSING')
    expect(codesOf(findingsFor(carton({ secondPercentDv: { protein: 96 } }), stock))).not.toContain(
      'FDA_PROTEIN_PERCENT_MISSING',
    )
  })
})

describe('a dual-column panel is judged under the paragraph for what its second column counts', () => {
  // Read from the eCFR on 2026-09-17. (e)(2) presents the information "for the form of the
  // product as packaged and for any other form"; (e)(3), for forms, combinations, "different
  // units, or ... two or more groups for which RDIs are established", presents it "in two
  // columns and the columns shall be separated by vertical lines"; (e)(6) does the same for
  // "a per serving basis and per container basis" under (b)(12)(i) or "per unit basis" under
  // (b)(2)(i)(D). Both findings cited (e)(2) or (e)(3) whatever the column counted, which the
  // review of PR #39 found.
  const withBasis = (name: string, basis: DualColumnBasis | undefined): UsFoodLabelData => {
    const source = fixture(name).data
    const { basis: _basis, ...columns } = source.nutritionFacts!.columns!
    return {
      ...source,
      nutritionFacts: {
        ...source.nutritionFacts!,
        columns: { ...columns, ...(basis === undefined ? {} : { basis }) },
      },
    }
  }
  const findingOf = (data: UsFoodLabelData, code: string) =>
    findingsFor(data, US_FOOD_CONFORMANT.stock).find((f) => f.code === code)

  it.each([
    ['as-prepared', '21 CFR 101.9(e)(2)', '21 CFR 101.9(e)(3)'],
    ['combination', '21 CFR 101.9(e)(2)', '21 CFR 101.9(e)(3)'],
    ['per-unit-measure', '21 CFR 101.9(e)(3)', '21 CFR 101.9(e)(3)'],
    ['rdi-groups', '21 CFR 101.9(e)(3)', '21 CFR 101.9(e)(3)'],
    ['per-cup-popped', '21 CFR 101.9(e)(3)', '21 CFR 101.9(e)(3)'],
    ['per-container', '21 CFR 101.9(e)(6)', '21 CFR 101.9(e)(6)'],
    ['per-unit', '21 CFR 101.9(e)(6)', '21 CFR 101.9(e)(6)'],
    // No basis names no subparagraph, so both cite (e), the dual labeling paragraph itself.
    [undefined, '21 CFR 101.9(e)', '21 CFR 101.9(e)'],
  ] as const)(
    '%s: an incomplete column under %s, unseparated columns under %s',
    (basis, incomplete, separated) => {
      // The message is asserted beside the citation, because they are written separately and
      // the review of PR #40 found the prose free to name a paragraph the citation contradicts.
      const short = findingOf(
        withBasis('a second column carrying one figure out of fourteen', basis),
        'FDA_DUAL_COLUMN_INCOMPLETE',
      )
      expect(short!.citation.reference).toBe(incomplete)
      const unseparated = findingOf(
        withBasis('two columns run together with no line between them', basis),
        'FDA_DUAL_COLUMN_NOT_SEPARATED',
      )
      expect(unseparated!.citation.reference).toBe(separated)

      if (basis === undefined) {
        // No subparagraph to name, so both say why rather than naming one.
        for (const found of [short, unseparated]) {
          expect(found!.message).toContain('states no basis')
          expect(found!.message, 'and names no subparagraph').not.toMatch(/101\.9\(e\)\(\d\)/)
        }
        return
      }
      const bare = (reference: string) => reference.replace('21 CFR ', '')
      expect(short!.message).toContain(`${bare(incomplete)} requires`)
      expect(unseparated!.message).toContain(`${bare(separated)} requires`)
    },
  )

  it('titles a shared reference for the requirement each rule measures', () => {
    // The titles are what `/rules` and the findings rail show, so a reference two rules
    // cite is titled twice — for the quantities and lines this rule measures, and for the
    // percentages `us-food/protein-percent` reads. One merged table gave both the same
    // title, about vertical lines, and the review of PR #40 found it.
    const columns = findingOf(
      withBasis('a second column carrying one figure out of fourteen', 'per-container'),
      'FDA_DUAL_COLUMN_INCOMPLETE',
    )!.citation
    const panel = US_FOOD_CONFORMANT.data.nutritionFacts!
    const percentages = findingsFor(
      {
        ...US_FOOD_CONFORMANT.data,
        nutritionFacts: {
          ...panel,
          representedFor: 'children-1-through-3',
          declaredPercentDv: { ...panel.declaredPercentDv, protein: 38 },
          columns: {
            mode: 'dual',
            basis: 'per-container',
            headings: ['Per serving', 'Per container'],
            secondAmounts: { ...panel.amounts },
          },
        },
      },
      US_FOOD_CONFORMANT.stock,
    ).find((f) => f.code === 'FDA_PROTEIN_PERCENT_MISSING')!.citation

    expect(percentages.reference, 'the same paragraph').toBe(columns.reference)
    expect(columns.title).toContain('fills two columns and separates them by vertical lines')
    expect(percentages.title).toContain('percent Daily Value')
    expect(percentages.title).not.toContain('vertical lines')
  })
})

describe('a food for children 1 through 3, labelled against their Daily Values', () => {
  // 21 CFR 101.9(c)(8)(i), read from the eCFR on 2026-09-17: foods "represented or
  // purported to be specifically for ... children 1 through 3 years ... shall use the RDIs
  // that are specified for the intended group". Every figure below is worked by hand from
  // the "Children 1 through 3 years" columns of (c)(8)(iv) and (c)(9).
  const stock = US_FOOD_CONFORMANT.stock
  const panel = US_FOOD_CONFORMANT.data.nutritionFacts!
  const forToddlers = (patch: Partial<typeof panel> = {}): UsFoodLabelData => ({
    ...US_FOOD_CONFORMANT.data,
    nutritionFacts: { ...panel, representedFor: 'children-1-through-3', ...patch },
  })
  const codesOf = (findings: { code: string }[]) => findings.map((f) => f.code)
  const rowText = (data: UsFoodLabelData, id: Parameters<typeof nutritionRowElementId>[0]) =>
    layOutUsFoodLabel({ data, stock })
      .primitives.filter(
        (p): p is TextPrimitive => p.kind === 'text' && p.elementId === nutritionRowElementId(id),
      )
      .map((p) => p.text)
      .join(' ')

  it('reports percentages worked against the adult Daily Values', () => {
    expect(
      codesOf(findingsFor(US_FOOD_CONFORMANT.data, stock)),
      'premise: they are right for an adult food',
    ).toContain('FDA_NUTRITION_PERCENT_DV_MET')
    const findings = findingsFor(forToddlers(), stock)
    const wrong = findings.filter((f) => f.code === 'FDA_NUTRITION_PERCENT_DV_WRONG')
    // Eight of the eleven differ; cholesterol, sodium and added sugars are 0 either way.
    expect(wrong.map((f) => f.elementId)).toEqual(
      (
        [
          'total-fat',
          'saturated-fat',
          'total-carbohydrate',
          'dietary-fiber',
          'vitamin-d',
          'calcium',
          'iron',
          'potassium',
        ] as const
      ).map((id) => nutritionRowElementId(id)),
    )
    const fat = wrong.find((f) => f.elementId === nutritionRowElementId('total-fat'))!
    // 3 g of 39 is 7.69 percent: 8.
    expect(fat.measurement).toEqual({ actual: '4%', required: '8%' })
    expect(fat.message).toContain('39g Daily Value for children 1 through 3')
    expect(codesOf(findings)).not.toContain('FDA_NUTRITION_PERCENT_DV_MET')
  })

  it('clears percentages worked against the children 1 through 3 column', () => {
    const findings = findingsFor(
      forToddlers({
        declaredPercentDv: {
          'total-fat': 8, // 3 of 39
          'saturated-fat': 5, // 0.5 of 10
          cholesterol: 0,
          sodium: 0,
          'total-carbohydrate': 18, // 27 of 150
          'dietary-fiber': 29, // 4 of 14 is 28.57
          'added-sugars': 0,
          'vitamin-d': 15, // 2 of 15 is 13.3, in the 5-percent band
          calcium: 35, // 260 of 700 is 37.1
          iron: 110, // 8 of 7 is 114.3, in the 10-percent band
          potassium: 8, // 235 of 3,000 is 7.83, in the 2-percent band
        },
      }),
      stock,
    )
    expect(codesOf(findings)).not.toContain('FDA_NUTRITION_PERCENT_DV_WRONG')
    expect(codesOf(findings)).toContain('FDA_NUTRITION_PERCENT_DV_MET')
  })

  it('prints the 1,000-calorie footnote on the vertical and tabular displays', () => {
    // 101.9(d)(9), read from the eCFR on 2026-09-17: "If the food product is represented or
    // purported to be for children 1 through 3 years of age, the second sentence of the
    // footnote shall substitute '1,000 calories' for '2,000 calories'." (j)(5)(iii) states
    // the whole footnote for such a food, and it is copied from there, not from the table
    // the engine draws with, so the two are checked against each other.
    const toddlerFootnote =
      '*The % Daily Value tells you how much a nutrient in a serving of food contributes to ' +
      'a daily diet. 1,000 calories a day is used for general nutrition advice.'
    const footnoteOf = (data: UsFoodLabelData, onStock: LabelStock = stock) =>
      layOutUsFoodLabel({ data, stock: onStock })
        .primitives.filter(
          (p): p is TextPrimitive =>
            p.kind === 'text' && p.elementId === US_FOOD_ELEMENTS.nutritionFootnote,
        )
        .map((p) => p.text)
        .join(' ')
    expect(footnoteOf(US_FOOD_CONFORMANT.data), 'premise: an adult food').toContain(
      '2,000 calories a day',
    )
    expect(footnoteOf(forToddlers())).toBe(toddlerFootnote)
    // (d)(11)'s tabular display draws its footnote on a separate path.
    const wide = { widthMm: 200, heightMm: 240, marginMm: 6 }
    const tabular = forToddlers({
      format: 'tabular',
      availableSurfaceSqInches: 80,
      continuousVerticalSpaceInches: 2,
    })
    expect(
      footnoteOf(
        { ...tabular, container: { shape: 'rectangular', widthMm: 200, heightMm: 240 } },
        wide,
      ),
    ).toBe(toddlerFootnote)
  })

  it('keeps the full footnote on the small-package displays, which (j)(13)(i) does not excuse', () => {
    // (j)(13)(i) relieves packages on the (j)(13)(ii)(A)(1) and (2) displays of "the
    // information in paragraphs (d)(9) and (f)(5) related to the footnote". (j)(5)(iii) is
    // not named, and it says such a food "shall include" the full footnote on its own —
    // so the abbreviation stays for adult foods and a toddler food keeps its sentence.
    // Printing it is compliant on either reading, since the exemption only relaxes. Found
    // by the review of PR #38.
    const small: LabelStock = { widthMm: 100, heightMm: 70, marginMm: 3 }
    const onSmallPackage = (format: 'tabular' | 'linear', data: UsFoodLabelData) => ({
      ...data,
      container: { shape: 'rectangular' as const, widthMm: 100, heightMm: 70 },
      nutritionFacts: { ...data.nutritionFacts!, format, availableSurfaceSqInches: 9 },
    })
    const footnoteOf = (data: UsFoodLabelData) =>
      layOutUsFoodLabel({ data, stock: small })
        .primitives.filter(
          (p): p is TextPrimitive =>
            p.kind === 'text' && p.elementId === US_FOOD_ELEMENTS.nutritionFootnote,
        )
        .map((p) => p.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    for (const format of ['tabular', 'linear'] as const) {
      expect(
        footnoteOf(onSmallPackage(format, US_FOOD_CONFORMANT.data)),
        `premise: an adult food on the ${format} display abbreviates`,
      ).toContain('% DV = % Daily Value')
      expect(footnoteOf(onSmallPackage(format, forToddlers())), format).toContain(
        '1,000 calories a day is used for general nutrition advice.',
      )
    }
  })

  describe('its protein percentage, which (c)(7)(i) says shall be given', () => {
    // 21 CFR 101.9(c)(7)(i), read from the eCFR on 2026-09-17: the protein percentage "may
    // be placed on the label, except that such a statement shall be given if a protein
    // claim is made for the product, or if the product is represented or purported to be
    // specifically for infants through 12 months or children 1 through 3 years of age".
    // Its value is corrected by a digestibility score no label carries, so only that it
    // is printed can be checked.
    const withProtein = (percent: number) =>
      forToddlers({ declaredPercentDv: { ...panel.declaredPercentDv, protein: percent } })

    it('reports a toddler food that prints none', () => {
      expect(
        codesOf(findingsFor(US_FOOD_CONFORMANT.data, stock)),
        'premise: an adult food may omit it',
      ).not.toContain('FDA_PROTEIN_PERCENT_MISSING')
      const missing = findingsFor(forToddlers(), stock).find(
        (f) => f.code === 'FDA_PROTEIN_PERCENT_MISSING',
      )
      expect(missing!.severity).toBe('violation')
      expect(missing!.citation.reference).toBe('21 CFR 101.9(c)(7)(i)')
      expect(missing!.elementId).toBe(nutritionRowElementId('protein'))
    })

    it('clears one that is printed, and says its value is not checked', () => {
      // 5 g of 13 is 38 percent before correction; the corrected figure can only be lower.
      const data = withProtein(38)
      expect(rowText(data, 'protein')).toContain('38%')
      const findings = findingsFor(data, stock)
      expect(codesOf(findings)).not.toContain('FDA_PROTEIN_PERCENT_MISSING')
      const pass = findings.find((f) => f.code === 'FDA_PROTEIN_PERCENT_MET')
      expect(pass!.elementId).toBe(nutritionRowElementId('protein'))
      expect(pass!.message).toContain('38%')
      expect(pass!.message).toContain('Not checked here:')
    })

    it('asks it of every column a dual-column panel draws', () => {
      // Read from the eCFR on 2026-09-17: where dual labeling is per serving and per
      // container, 101.9(e)(6) says "the percent Daily Value as required in paragraph
      // (d)(7)(ii) shall be presented in two columns". A toddler food's protein percentage is
      // part of that, so a second column without one is missing it. The review of the change
      // adding this rule found it passing on the first column's percentage alone.
      const band = fixture('a 250 percent package carrying one column')
      const facts = band.data.nutritionFacts!
      const data: UsFoodLabelData = {
        ...band.data,
        nutritionFacts: {
          ...facts,
          representedFor: 'children-1-through-3',
          declaredPercentDv: { ...facts.declaredPercentDv, protein: 38 },
          columns: {
            mode: 'dual',
            basis: 'per-container',
            headings: ['Per serving', 'Per container'],
            secondAmounts: { ...facts.amounts },
          },
        },
      }
      const layout = layOutUsFoodLabel({ data, stock: band.stock })
      expect(
        layout.elements.map((e) => e.elementId),
        'premise: the second column is drawn',
      ).toContain(US_FOOD_ELEMENTS.nutritionSecondColumn)
      const findings = findingsFor(data, band.stock)
      const missing = findings.find((f) => f.code === 'FDA_PROTEIN_PERCENT_MISSING')
      expect(missing!.citation.reference).toBe('21 CFR 101.9(e)(6)')
      expect(missing!.elementId).toBe(nutritionRowElementId('protein'))
      expect(missing!.measurement?.actual).toBe('no protein percentage in the second column')
      expect(codesOf(findings)).not.toContain('FDA_PROTEIN_PERCENT_MET')

      // A second column with no protein figure at all is the form rule's incomplete column,
      // reported once there, and neither reported nor cleared here.
      const { protein: _dropped, ...secondWithoutProtein } = facts.amounts
      const incomplete: UsFoodLabelData = {
        ...data,
        nutritionFacts: {
          ...data.nutritionFacts!,
          columns: { ...data.nutritionFacts!.columns!, secondAmounts: secondWithoutProtein },
        },
      }
      const codes = codesOf(findingsFor(incomplete, band.stock))
      expect(codes, 'premise: the form rule reports it').toContain('FDA_DUAL_COLUMN_INCOMPLETE')
      expect(codes).not.toContain('FDA_PROTEIN_PERCENT_MISSING')
      expect(codes).not.toContain('FDA_PROTEIN_PERCENT_MET')
    })

    it.each([
      // (e)(2): "for the form of the product as packaged and for any other form of the
      // product (e.g., 'as prepared' or combined with another ingredient ...)".
      ['as-prepared', '21 CFR 101.9(e)(2)'],
      ['combination', '21 CFR 101.9(e)(2)'],
      // (e)(3): "for different units, or for two or more groups for which RDIs are
      // established, the quantitative information by weight and the percent Daily Value
      // shall be presented in two columns". Popcorn's cup popped is (e)'s "different units
      // ... as provided for in paragraph (b)".
      ['per-unit-measure', '21 CFR 101.9(e)(3)'],
      ['rdi-groups', '21 CFR 101.9(e)(3)'],
      ['per-cup-popped', '21 CFR 101.9(e)(3)'],
      // (e)(6): per serving and per container under (b)(12)(i), or per unit under (b)(2)(i)(D).
      ['per-container', '21 CFR 101.9(e)(6)'],
      ['per-unit', '21 CFR 101.9(e)(6)'],
      // No basis stated names no (e) paragraph, so the finding cites the requirement itself.
      [undefined, '21 CFR 101.9(c)(7)(i)'],
    ] as const)('cites the paragraph a %s second column answers to: %s', (basis, reference) => {
      // The review of PR #39 found every basis cited to (e)(2), which is about forms.
      const band = fixture('a 250 percent package carrying one column')
      const facts = band.data.nutritionFacts!
      const data: UsFoodLabelData = {
        ...band.data,
        nutritionFacts: {
          ...facts,
          representedFor: 'children-1-through-3',
          declaredPercentDv: { ...facts.declaredPercentDv, protein: 38 },
          columns: {
            mode: 'dual',
            ...(basis === undefined ? {} : { basis }),
            headings: ['Per serving', 'Per container'],
            secondAmounts: { ...facts.amounts },
          },
        },
      }
      const missing = findingsFor(data, band.stock).find(
        (f) => f.code === 'FDA_PROTEIN_PERCENT_MISSING',
      )
      expect(missing!.citation.reference).toBe(reference)
    })

    it('does not clear one that did not print in full', () => {
      const short: LabelStock = { ...stock, heightMm: 120 }
      const data = withProtein(38)
      const layout = layOutUsFoodLabel({ data, stock: short })
      expect(
        layout.omissions.map((o) => o.elementId),
        'premise: the panel runs off a 120 mm label',
      ).toContain(US_FOOD_ELEMENTS.nutritionPanel)
      const codes = codesOf(runRules({ labelType: 'us-food', data, stock: short, layout }))
      expect(codes).not.toContain('FDA_PROTEIN_PERCENT_MET')
    })

    it('asks it of an egg carton’s declared figures, since no panel is drawn', () => {
      const carton = (data: UsFoodLabelData): UsFoodLabelData => ({
        ...data,
        nutritionExemption: { kind: 'egg-carton', presentedIn: 'beneath-lid' },
      })
      const missing = findingsFor(carton(forToddlers()), stock).find(
        (f) => f.code === 'FDA_PROTEIN_PERCENT_MISSING',
      )
      expect(missing!.elementId, 'the carton, since no row is on it').toBe(
        US_FOOD_ELEMENTS.principalDisplayPanel,
      )
      const declared = codesOf(findingsFor(carton(withProtein(38)), stock))
      expect(declared).not.toContain('FDA_PROTEIN_PERCENT_MISSING')
      expect(declared, 'and certifies nothing it did not print').not.toContain(
        'FDA_PROTEIN_PERCENT_MET',
      )
    })
  })

  it('prints the percentages it derives against that column', () => {
    const { declaredPercentDv: _stated, ...derived } = panel
    const adult: UsFoodLabelData = { ...US_FOOD_CONFORMANT.data, nutritionFacts: derived }
    const toddler: UsFoodLabelData = {
      ...US_FOOD_CONFORMANT.data,
      nutritionFacts: { ...derived, representedFor: 'children-1-through-3' },
    }
    expect(rowText(adult, 'total-fat'), 'premise: 3 g of 78 is 3.85 percent').toContain('4%')
    expect(rowText(toddler, 'total-fat')).toContain('8%')
    expect(rowText(adult, 'calcium'), 'premise: 260 mg of 1,300 is 20 percent').toContain('20%')
    expect(rowText(toddler, 'calcium')).toContain('35%')
  })
})

describe('findings from the stage 5 review', () => {
  const stock = US_FOOD_CONFORMANT.stock
  const panel = US_FOOD_CONFORMANT.data.nutritionFacts!
  const withPanel = (patch: Partial<typeof panel>) =>
    findingsFor({ ...US_FOOD_CONFORMANT.data, nutritionFacts: { ...panel, ...patch } }, stock)

  it('expresses fat under half a gram as zero, which 101.9(c)(2) requires', () => {
    // "If the serving contains less than 0.5 gram, the content **shall** be
    // expressed as zero." A *shall*, where the gram nutrients at (c)(6) and
    // (c)(7) get a *may* — and the two were treated alike, so 0.4 g rounded up
    // to 0.5 and a compliant "Total Fat 0g" was reported as a violation.
    expect(roundNutrientAmount('total-fat', 0.4)).toBe(0)
    const codes = withPanel({
      amounts: { ...panel.amounts, 'total-fat': 0.4 },
      declaredAmounts: { ...panel.declaredAmounts, 'total-fat': 0 },
    }).map((f) => f.code)
    expect(codes).not.toContain('FDA_NUTRITION_ROUNDING_WRONG')
  })

  it('names the declared amount in a percentage finding, not the Daily Value', () => {
    // The message read "12% is what 78 g gives", and 78 g is the Daily Value —
    // which gives 100%.
    const match = withPanel({
      declaredPercentDv: { ...panel.declaredPercentDv, 'total-fat': 15 },
    }).find((f) => f.code === 'FDA_NUTRITION_PERCENT_DV_WRONG')
    expect(match!.message).toContain('3g of a 78g Daily Value')
  })

  it('does not count a percentage it could not check', () => {
    // A declared percentage with no amount behind it is neither reported nor
    // checked, and the pass counted it anyway.
    const { calcium: _drop, ...amounts } = panel.amounts
    const pass = withPanel({
      amounts,
      declaredAmounts: { ...panel.declaredAmounts },
      declaredPercentDv: { ...panel.declaredPercentDv },
    }).find((f) => f.code === 'FDA_NUTRITION_PERCENT_DV_MET')
    expect(pass!.message).toContain('10 percentages')
  })

  it('does not report the heading of a panel scaled in proportion', () => {
    // 101.9(d)(2) asks only that the heading be no smaller than the rest, which
    // a uniform scale preserves. Enforcing the 22 points the illustrations draw
    // it at reported a compliant panel under a citation saying no such thing —
    // and the relative requirement itself is satisfied by construction here, so
    // it gets a note in the rule rather than a check that could never fail.
    expect(withPanel({ typeScale: 0.8 }).map((f) => f.elementId)).not.toContain(
      US_FOOD_ELEMENTS.nutritionHeading,
    )
  })

  it('omits a protein percentage rather than printing one it cannot check', () => {
    // 101.9(c)(7)(ii) corrects protein by a digestibility score no label
    // carries, so the rule declines — and the panel was printing one anyway.
    const layout = layOutUsFoodLabel(US_FOOD_CONFORMANT)
    const proteinRow = layout.primitives
      .filter(
        (p): p is TextPrimitive =>
          p.kind === 'text' && p.elementId === nutritionRowElementId('protein'),
      )
      .map((p) => p.text)
    expect(proteinRow.some((t) => t.includes('%'))).toBe(false)
    expect(proteinRow.some((t) => t.startsWith('Protein'))).toBe(true)
  })

  it('inspects every entry the order lists, including a duplicated one', () => {
    // `expected` is the regulation's order narrowed to what appears, so a
    // duplicate makes it shorter — and walking only that far left the trailing
    // entry uninspected.
    const codes = withPanel({
      order: [...panel.order!, 'calories'],
    }).map((f) => f.code)
    expect(codes).toContain('FDA_NUTRITION_OUT_OF_ORDER')
  })
})

describe('a second column asked for and not drawn', () => {
  // 101.9(e)(6)(ii)'s dual-column tabular display has its type row and its display
  // id wired, and the tabular branch draws one column. The combination has to be
  // honest about that in both directions: the layout says what it did not draw,
  // and the rule reports what is on the label rather than what the document meant.
  const stock = { widthMm: 200, heightMm: 240, marginMm: 6 }
  const tabularDual: UsFoodLabelData = {
    ...US_FOOD_CONFORMANT.data,
    container: { shape: 'rectangular', widthMm: 200, heightMm: 240 },
    nutritionFacts: {
      ...US_FOOD_CONFORMANT.data.nutritionFacts!,
      format: 'tabular',
      availableSurfaceSqInches: 80,
      continuousVerticalSpaceInches: 2,
      referenceAmount: { amount: 22, unit: 'g', category: 'Snacks' },
      packageContent: 55,
      packagedAndSoldIndividually: true,
      columns: { mode: 'dual', basis: 'per-container' },
    },
  }

  it('records the omission rather than drawing a single column quietly', () => {
    const omissions = layOutUsFoodLabel({ data: tabularDual, stock }).omissions
    expect(omissions.map((o) => o.reason).join(' ')).toContain('second column')
  })

  it('reports the column missing, because the rule reads what was printed', () => {
    // Asked of the document this returned FDA_DUAL_COLUMN_MET — a rule certifying
    // content the engine never drew, which is the failure `layout/types.ts`
    // records learning the hard way with the GHS pictograms.
    const codes = findingsFor(tabularDual, stock).map((f) => f.code)
    expect(codes).toContain('FDA_DUAL_COLUMN_MISSING')
    expect(codes).not.toContain('FDA_DUAL_COLUMN_MET')
  })

  it('says the label asked for two, so the finding is not mistaken for a typo', () => {
    const match = findingsFor(tabularDual, stock).find((f) => f.code === 'FDA_DUAL_COLUMN_MISSING')
    expect(match!.message).toContain('though the label asks for two')
  })

  it('draws no omission where the second column is drawn', () => {
    const vertical: UsFoodLabelData = {
      ...US_FOOD_CONFORMANT.data,
      nutritionFacts: {
        ...US_FOOD_CONFORMANT.data.nutritionFacts!,
        columns: { mode: 'dual', basis: 'per-container', secondAmounts: { 'total-fat': 7.5 } },
      },
    }
    const omissions = layOutUsFoodLabel({
      data: vertical,
      stock: US_FOOD_CONFORMANT.stock,
    }).omissions
    expect(omissions.map((o) => o.reason).join(' ')).not.toContain('second column')
  })
})

describe('a declaration larger than the label it is drawn on', () => {
  it('reports the net quantity running off the substrate', () => {
    // 101.7(i) sizes the declaration from the *package*, not from the label, so a
    // container far larger than the artwork derives type wider than the stock. It
    // was the only drawn element with no overflow check: a 1800 mm carton on the
    // default 120 mm label put the declaration at x -57.5 mm, entirely off the
    // artwork, while all five net-quantity rules reported it compliant.
    const data: UsFoodLabelData = {
      ...US_FOOD_CONFORMANT.data,
      container: { shape: 'rectangular', widthMm: 1800, heightMm: 1800 },
    }
    const layout = layOutUsFoodLabel({ data, stock: US_FOOD_CONFORMANT.stock })
    expect(layout.omissions.map((o) => o.reason).join(' ')).toContain('net quantity declaration')
  })

  it('says nothing about a declaration that fits', () => {
    expect(
      layOutUsFoodLabel(US_FOOD_CONFORMANT)
        .omissions.map((o) => o.reason)
        .join(' '),
    ).not.toContain('net quantity declaration')
  })
})

describe('the dual-column display, drawn', () => {
  const stock = US_FOOD_CONFORMANT.stock
  const dual = (patch: Record<string, unknown> = {}): UsFoodLabelData => ({
    ...US_FOOD_CONFORMANT.data,
    nutritionFacts: {
      ...US_FOOD_CONFORMANT.data.nutritionFacts!,
      columns: {
        mode: 'dual',
        basis: 'per-container',
        headings: ['Per serving', 'Per container'],
        secondAmounts: { 'total-fat': 7.5, sodium: 0, iron: 20, protein: 12.5 },
        ...patch,
      },
    },
  })
  const rowText = (layout: ReturnType<typeof layOutUsFoodLabel>, id: string) =>
    layout.primitives
      .filter(
        (p): p is TextPrimitive => p.kind === 'text' && p.elementId === nutritionRowElementId(id),
      )
      .map((p) => p.text)

  it('puts the weight and the percentage together in each column', () => {
    // (e)(3): "the quantitative information by weight and the percent Daily Value
    // shall be presented in two columns". So the weight moves off the nutrient
    // name and into the column beside its percentage, which is why this is not
    // the single-column row with an extra figure appended.
    const layout = layOutUsFoodLabel({ data: dual(), stock })
    expect(rowText(layout, 'total-fat')).toEqual(['Total Fat', '3g 4%', '8g 10%'])
  })

  it('rounds each declared amount in its own right', () => {
    // 7.5 g is rounded under (c)(2) as an amount, not carried through from a
    // multiplication — which is also why the second column is declared rather
    // than derived from the servings per container.
    expect(rowText(layOutUsFoodLabel({ data: dual(), stock }), 'total-fat')[2]).toBe('8g 10%')
  })

  it('omits the protein percentage in both columns, not just the first', () => {
    // 101.9(d)(7)(ii) again, applied per column: a rule spelled once and used
    // twice cannot disagree with itself across them.
    expect(rowText(layOutUsFoodLabel({ data: dual(), stock }), 'protein')).toEqual([
      'Protein',
      '5g',
      '13g',
    ])
  })

  it('prints the headings (e)(1) requires, as given', () => {
    // "two or more column headings accurately describing the amount per serving
    // size" — and their wording is the labeller's. "Per 1/4 cup mix" and "Per
    // prepared portion" are the regulation's own examples, so nothing here
    // composes them.
    const layout = layOutUsFoodLabel({ data: dual(), stock })
    const headings = layout.primitives
      .filter(
        (p): p is TextPrimitive =>
          p.kind === 'text' && p.elementId === US_FOOD_ELEMENTS.nutritionColumnHeading,
      )
      .map((p) => p.text)
    expect(headings).toEqual(['Per serving', 'Per container'])
  })

  it('separates the columns by the vertical lines (e)(3) requires', () => {
    const layout = layOutUsFoodLabel({ data: dual(), stock })
    const rules = layout.primitives.filter(
      (p) => p.kind === 'rect' && p.elementId === US_FOOD_ELEMENTS.nutritionColumnRule,
    )
    expect(rules).toHaveLength(2)
    for (const rule of rules) expect(rule.kind === 'rect' && rule.heightMm).toBeGreaterThan(10)
  })

  it('takes the panel width rather than the single-column 2.5 inches', () => {
    // No paragraph sets a panel width; 2.5 inches is the illustrations' figure for
    // a panel carrying one column of values. Holding a dual column to it would
    // take the room out of the nutrient names, which is how the tabular display
    // once ended up stacked into a single column.
    const single = layOutUsFoodLabel(US_FOOD_CONFORMANT).elements.find(
      (e) => e.elementId === US_FOOD_ELEMENTS.nutritionPanel,
    )!
    const both = layOutUsFoodLabel({ data: dual(), stock }).elements.find(
      (e) => e.elementId === US_FOOD_ELEMENTS.nutritionPanel,
    )!
    expect(both.box.widthMm).toBeGreaterThan(single.box.widthMm)
  })

  it('draws no second column where no second figure was given', () => {
    // The element that marks "a second column was drawn" is emitted for a column
    // that *was* drawn, not for one that was asked for. Keyed off the declaration
    // instead, a panel with no second figures cleared the form rule and suppressed
    // the engine's own "asked for and not drawn" omission.
    const empty: UsFoodLabelData = {
      ...US_FOOD_CONFORMANT.data,
      nutritionFacts: {
        ...US_FOOD_CONFORMANT.data.nutritionFacts!,
        columns: { mode: 'dual', basis: 'per-container', headings: ['A', 'B'] },
      },
    }
    const layout = layOutUsFoodLabel({ data: empty, stock })
    expect(layout.elements.map((e) => e.elementId)).not.toContain(
      US_FOOD_ELEMENTS.nutritionSecondColumn,
    )
    expect(layout.omissions.map((o) => o.reason).join(' ')).toContain('second column')
    expect(findingsFor(empty, stock).map((f) => f.code)).not.toContain('FDA_DUAL_COLUMN_FORM_MET')
  })

  it('draws one column where the panel says single', () => {
    // The other direction: the axis has to change the drawing, not merely be
    // carried on the document.
    const layout = layOutUsFoodLabel(US_FOOD_CONFORMANT)
    expect(rowText(layout, 'total-fat')).toEqual(['Total Fat 3g', '4%'])
    expect(
      layout.primitives.filter((p) => p.elementId === US_FOOD_ELEMENTS.nutritionColumnRule),
    ).toEqual([])
  })
})

describe('the second column (b)(12)(i) and (b)(2)(i)(D) make mandatory', () => {
  const stock = US_FOOD_CONFORMANT.stock
  const panel = (patch: Record<string, unknown>): UsFoodLabelData => ({
    ...US_FOOD_CONFORMANT.data,
    nutritionFacts: {
      ...US_FOOD_CONFORMANT.data.nutritionFacts!,
      availableSurfaceSqInches: 60,
      referenceAmount: { amount: 22, unit: 'g', category: 'Snacks' },
      ...patch,
    },
  })
  const codesFor = (patch: Record<string, unknown>) =>
    findingsFor(panel(patch), stock).map((f) => f.code)

  const individually = { packagedAndSoldIndividually: true }

  it('declines entirely where the label states no reference amount', () => {
    // The trigger is a percentage of §101.12(b)'s figure, and this project does
    // not carry that table. A rule that reports a label for *not* carrying a
    // column must not do it on a number the engine invented.
    const { referenceAmount: _drop, ...facts } = panel({
      ...individually,
      packageContent: 55,
    }).nutritionFacts!
    const codes = findingsFor({ ...US_FOOD_CONFORMANT.data, nutritionFacts: facts }, stock).map(
      (f) => f.code,
    )
    expect(codes).not.toContain('FDA_DUAL_COLUMN_MISSING')
    expect(codes).not.toContain('FDA_DUAL_COLUMN_MET')
    expect(codes).not.toContain('FDA_DUAL_COLUMN_EXEMPT')
  })

  it('is inclusive at both ends of the 200 to 300 percent band', () => {
    // "at least 200 percent and up to and including 300 percent" — so both
    // boundaries are inside it, and a rule using two exclusive comparisons would
    // clear the two labels that sit exactly on them.
    expect(codesFor({ ...individually, packageContent: 44 })).toContain('FDA_DUAL_COLUMN_MISSING')
    expect(codesFor({ ...individually, packageContent: 66 })).toContain('FDA_DUAL_COLUMN_MISSING')
  })

  it('says nothing about a package outside the band', () => {
    for (const packageContent of [43.9, 66.1]) {
      expect(codesFor({ ...individually, packageContent }), String(packageContent)).not.toContain(
        'FDA_DUAL_COLUMN_MISSING',
      )
    }
  })

  it('reaches a package only where it is packaged and sold individually', () => {
    expect(codesFor({ packageContent: 55 })).not.toContain('FDA_DUAL_COLUMN_MISSING')
  })

  it('reports the per-unit duty (b)(2)(i)(D) sets on a heavy unit', () => {
    const match = findingsFor(panel({ unitContent: 55 }), stock).find(
      (f) => f.code === 'FDA_DUAL_COLUMN_MISSING',
    )
    expect(match).toBeDefined()
    expect(match!.citation.reference).toBe('21 CFR 101.9(b)(2)(i)(D)')
    expect(match!.message).toContain('the individual unit')
  })

  it('clears a package that carries the column', () => {
    const codes = codesFor({
      ...individually,
      packageContent: 55,
      columns: {
        mode: 'dual',
        basis: 'per-container',
        secondAmounts: { 'total-fat': 7.5 },
      },
    })
    expect(codes).toContain('FDA_DUAL_COLUMN_MET')
    expect(codes).not.toContain('FDA_DUAL_COLUMN_MISSING')
  })

  // The exemptions, each asserted on a label that would otherwise be reported.
  // An exemption that silently stops working is the failure mode for a rule that
  // reports an absence, and only a case that would fire without it can catch that.
  const exempt = (
    patch: Record<string, unknown>,
    reference: string,
    name: string,
    on: { stock: LabelStock; container?: UsFoodLabelData['container'] } = { stock },
  ) => {
    it(`is excused by ${reference} — ${name}`, () => {
      const data = panel({ ...individually, packageContent: 55, ...patch })
      const findings = findingsFor(
        on.container === undefined ? data : { ...data, container: on.container },
        on.stock,
      )
      const match = findings.find((f) => f.code === 'FDA_DUAL_COLUMN_EXEMPT')
      expect(match, 'the exemption produced no finding at all').toBeDefined()
      expect(match!.citation.reference).toBe(reference)
      expect(findings.map((f) => f.code)).not.toContain('FDA_DUAL_COLUMN_MISSING')
    })
  }

  // (A) turns on entitlement — "products that meet the requirements to use the
  // tabular format", not products that use it — so a small package is excused
  // whatever display it actually carries. This one is the widest of the three.
  // On a label and panel small enough not to rule the package out: 100 × 70 mm is 10.85 in².
  exempt({ availableSurfaceSqInches: 9 }, '21 CFR 101.9(b)(12)(i)(A)', 'a small package', {
    stock: { widthMm: 100, heightMm: 70, marginMm: 3 },
    container: { shape: 'rectangular', widthMm: 100, heightMm: 70 },
  })

  it('is not excused by (b)(12)(i)(A) where the label rules the package out', () => {
    // 9 in² declared on a 44.64 in² label and panel. The route's requirements cannot be
    // met, and the exemption is stamped on the document, so no omission would have
    // withheld it.
    const codes = codesFor({ ...individually, packageContent: 55, availableSurfaceSqInches: 9 })
    expect(codes).not.toContain('FDA_DUAL_COLUMN_EXEMPT')
    expect(codes).toContain('FDA_DUAL_COLUMN_MISSING')
  })
  exempt(
    { dualColumnExemption: { rawCommodityVoluntary: true } },
    '21 CFR 101.9(b)(12)(i)(B)',
    'a raw commodity labelled voluntarily',
  )
  // (C) is conjunctive — it excuses a product that *already provides* a second
  // column for another reason — so most of it falls out of the declared basis.
  exempt(
    { columns: { mode: 'dual', basis: 'as-prepared' } },
    '21 CFR 101.9(b)(12)(i)(C)',
    'a second column already given as prepared',
  )
  exempt(
    { dualColumnExemption: { variedWeight: true } },
    '21 CFR 101.9(b)(12)(i)(C)',
    'a varied-weight product',
  )
})

describe('the columns axis is orthogonal to the display', () => {
  it('sends a dual-column tabular panel to (e)(6)(ii), not to (d)(11)', () => {
    // The combination a flat union of "formats" cannot express, and the reason
    // the two are separate axes: (e)(6)(ii) is "(b)(2)(i)(D) and (b)(12)(i) ...
    // for labels that use the tabular display". (d)(1)(iii) names it separately
    // from (d)(11), so the engine has to be able to tell them apart even though
    // the two rows currently carry the same figures.
    expect(nutritionDisplayFor({ format: 'tabular', availableSurfaceSqInches: 80 })).toBe(
      'tabularD11',
    )
    expect(
      nutritionDisplayFor({
        format: 'tabular',
        availableSurfaceSqInches: 80,
        columns: { mode: 'dual' },
      }),
    ).toBe('tabularDualColumnE6ii')
  })

  it('reaches that display from a document rather than only from a flag', () => {
    // The wiring, not just the function: `columns.mode` is what sets it.
    const data: UsFoodLabelData = {
      ...US_FOOD_CONFORMANT.data,
      container: { shape: 'rectangular', widthMm: 200, heightMm: 240 },
      nutritionFacts: {
        ...US_FOOD_CONFORMANT.data.nutritionFacts!,
        format: 'tabular',
        availableSurfaceSqInches: 80,
        continuousVerticalSpaceInches: 2,
        columns: { mode: 'dual', basis: 'as-prepared', headings: ['As packaged', 'As prepared'] },
      },
    }
    // Drawn without error and still judged, which is what threading the axis has
    // to achieve before anything draws a second column.
    const findings = findingsFor(data, { widthMm: 200, heightMm: 240, marginMm: 6 })
    expect(findings.map((f) => f.code)).toContain('FDA_NUTRITION_FORMAT_MET')
  })
})

describe('every display finishes the same way', () => {
  it('puts the panel element first, whichever display drew it', () => {
    // The box and the result were built separately in each branch, and the three
    // copies had drifted: the linear one pushed the panel element where the other
    // two unshifted it, so a linear label listed the panel somewhere in the middle
    // of the reading order `LabelTextView` renders. One helper now, which is also
    // why the opaque white rect stays first among the primitives rather than
    // painting over the bars.
    const displays: Array<[string, UsFoodLabelData, LabelStock]> = [
      ['vertical', US_FOOD_CONFORMANT.data, US_FOOD_CONFORMANT.stock],
      [
        'linear',
        {
          ...US_FOOD_CONFORMANT.data,
          nutritionFacts: {
            ...US_FOOD_CONFORMANT.data.nutritionFacts!,
            format: 'linear',
            availableSurfaceSqInches: 9,
            cannotAccommodateTabular: true,
          },
        },
        US_FOOD_CONFORMANT.stock,
      ],
      [
        'tabular',
        {
          ...US_FOOD_CONFORMANT.data,
          container: { shape: 'rectangular', widthMm: 200, heightMm: 240 },
          nutritionFacts: {
            ...US_FOOD_CONFORMANT.data.nutritionFacts!,
            format: 'tabular',
            availableSurfaceSqInches: 80,
            continuousVerticalSpaceInches: 2,
          },
        },
        { widthMm: 200, heightMm: 240, marginMm: 6 },
      ],
    ]

    for (const [name, data, on] of displays) {
      const layout = layOutUsFoodLabel({ data, stock: on })
      const panelElements = layout.elements.filter(
        (e) => e.elementId === US_FOOD_ELEMENTS.nutritionPanel,
      )
      expect(panelElements, name).toHaveLength(1)
      const order = layout.elements.findIndex(
        (e) => e.elementId === US_FOOD_ELEMENTS.nutritionPanel,
      )
      const panelOwned = layout.elements.filter((e) => e.elementId.startsWith('food-nutrition'))
      expect(layout.elements[order], name).toBe(panelOwned[0])
    }
  })
})

describe('the Contains statement sits where §403(w)(1)(A) puts it', () => {
  const stock = US_FOOD_CONFORMANT.stock

  it('stays adjacent at a type size tighter than the generic block gap', () => {
    // The allowance is one line of the ingredient list, and the engine used to
    // leave a fixed 3 mm between every pair of blocks — so below an ingredient em
    // of about 2.3 mm the engine's own tightest layout reported itself
    // non-adjacent, and this label came back with a spurious finding beside the
    // type-size ones it was written for.
    const small: UsFoodLabelData = { ...US_FOOD_CONFORMANT.data, informationPanelFontSizeMm: 2 }
    expect(findingsFor(small, stock).map((f) => f.code)).not.toContain('FDA_CONTAINS_NOT_ADJACENT')
  })

  it('still reports a statement pushed away on purpose', () => {
    // The other direction: tightening the default must not make the rule
    // unfailable. `containsStatementGapMm` is how a label is drawn adrift.
    const adrift: UsFoodLabelData = { ...US_FOOD_CONFORMANT.data, containsStatementGapMm: 40 }
    expect(findingsFor(adrift, stock).map((f) => f.code)).toContain('FDA_CONTAINS_NOT_ADJACENT')
  })
})

describe('a permission the rounding rule has to accept either way', () => {
  const stock = US_FOOD_CONFORMANT.stock
  const withCalories = (analysed: number, declared: number): UsFoodLabelData => ({
    ...US_FOOD_CONFORMANT.data,
    nutritionFacts: {
      ...US_FOOD_CONFORMANT.data.nutritionFacts!,
      amounts: { ...US_FOOD_CONFORMANT.data.nutritionFacts!.amounts, calories: analysed },
      declaredAmounts: { calories: declared },
    },
  })

  it('accepts the zero 101.9(c)(1) permits below five calories', () => {
    expect(findingsFor(withCalories(3, 0), stock).map((f) => f.code)).not.toContain(
      FDA_NUTRITION_ROUNDING_WRONG,
    )
  })

  it('accepts the nearest 5-calorie increment for the same amount', () => {
    // The half the rule used to report. "Amounts less than 5 calories *may* be
    // expressed as zero" is a permission, so the main clause's answer stays
    // lawful — and 5 is what a label that declines the permission prints.
    expect(findingsFor(withCalories(3, 5), stock).map((f) => f.code)).not.toContain(
      FDA_NUTRITION_ROUNDING_WRONG,
    )
  })

  it('still reports an amount neither clause allows', () => {
    // The permission is two answers, not any answer.
    const match = findingsFor(withCalories(3, 3), stock).find(
      (f) => f.code === FDA_NUTRITION_ROUNDING_WRONG,
    )
    expect(match).toBeDefined()
    expect(match!.measurement!.required).toBe('0 or 5')
  })
})

describe('the linear display', () => {
  // A package the label and panel do not rule out: 120 × 60 mm is 11.16 in², and a
  // 50 × 60 mm panel 4.65. On the conformant 44.64 in² label, the declared 9 in² could
  // not stand, and the route would be refused before anything here was reached.
  const stock: LabelStock = { widthMm: 120, heightMm: 60, marginMm: 3 }
  const small = (patch: Record<string, unknown> = {}): UsFoodLabelData => ({
    ...US_FOOD_CONFORMANT.data,
    container: { shape: 'rectangular', widthMm: 50, heightMm: 60 },
    nutritionFacts: {
      ...US_FOOD_CONFORMANT.data.nutritionFacts!,
      format: 'linear',
      availableSurfaceSqInches: 9,
      cannotAccommodateTabular: true,
      ...patch,
    },
  })

  it('presents the information in one run rather than vertical columns', () => {
    // 101.9(j)(13)(ii)(A): "in a tabular or ... linear (i.e., string) fashion
    // rather than in vertical columns". That is the whole of what makes it
    // linear, and it is why a small package can carry it.
    //
    // What marks it as linear is that the nutrients share lines, not that they
    // are unidentifiable: each one carries an element now, so a finding about
    // Sodium can outline the words that say Sodium. In the vertical display every
    // nutrient sits on a baseline of its own; here fourteen of them share a
    // handful.
    const layout = layOutUsFoodLabel({ data: small(), stock })
    const panel = layout.elements.find((e) => e.elementId === US_FOOD_ELEMENTS.nutritionPanel)!
    const vertical = layOutUsFoodLabel(US_FOOD_CONFORMANT).elements.find(
      (e) => e.elementId === US_FOOD_ELEMENTS.nutritionPanel,
    )!
    expect(panel.box.heightMm).toBeLessThan(vertical.box.heightMm / 3)

    const rows = layout.primitives.filter(
      (p): p is TextPrimitive =>
        p.kind === 'text' && (p.elementId?.startsWith('food-nutrition-row-') ?? false),
    )
    const nutrients = new Set(rows.map((r) => r.elementId))
    const baselines = new Set(rows.map((r) => r.baselineYMm.toFixed(3)))
    expect(nutrients.size).toBeGreaterThan(10)
    expect(baselines.size).toBeLessThan(nutrients.size / 2)
  })

  it('sets each part of the run to the minimum its own paragraph states', () => {
    // The run used to be one string at 8 point, which put the Calories numeral at
    // 8 where (d)(1)(iii) requires 14 on this very display — it is named in the
    // exception — and left the servings lines under (d)(3)'s 9. One size could
    // not satisfy four minimums, so the parts each carry their own.
    const layout = layOutUsFoodLabel({ data: small(), stock })
    const ptOf = (elementId: string): number =>
      Math.min(
        ...layout.primitives
          .filter((p): p is TextPrimitive => p.kind === 'text' && p.elementId === elementId)
          .map((p) => p.fontSizeMm / MM_PER_POINT),
      )
    expect(ptOf(US_FOOD_ELEMENTS.nutritionServingSize)).toBeCloseTo(9, 5)
    expect(ptOf(US_FOOD_ELEMENTS.nutritionServings)).toBeCloseTo(9, 5)
    expect(ptOf(US_FOOD_ELEMENTS.nutritionCalories)).toBeCloseTo(10, 5)
    expect(ptOf(US_FOOD_ELEMENTS.nutritionCaloriesFigure)).toBeCloseTo(14, 5)
    expect(ptOf(nutritionRowElementId('sodium'))).toBeCloseTo(8, 5)

    // (d)(2) wants the heading "no smaller than all other print size ... except
    // for the numerical information for 'Calories'", which is now the Calories
    // word rather than the serving-size figure it used to borrow.
    expect(ptOf(US_FOOD_ELEMENTS.nutritionHeading)).toBeGreaterThanOrEqual(
      ptOf(US_FOOD_ELEMENTS.nutritionCalories),
    )
  })

  it('still carries the heading 101.9(d)(2) requires', () => {
    // The reduced displays are excused from setting it "the full width of the
    // information provided under paragraph (d)(7)" — not from carrying it.
    const layout = layOutUsFoodLabel({ data: small(), stock })
    const heading = layout.primitives.filter(
      (p): p is TextPrimitive =>
        p.kind === 'text' && p.elementId === US_FOOD_ELEMENTS.nutritionHeading,
    )
    expect(heading.map((h) => h.text)).toEqual(['Nutrition Facts'])
  })

  it('drops the footnote for the abbreviated statement (j)(13)(i) permits', () => {
    // "do not require the information in paragraphs (d)(9) and (f)(5) related to
    // the footnote, however the abbreviated footnote statement '% DV = % Daily
    // Value' may be used."
    const layout = layOutUsFoodLabel({ data: small(), stock })
    // Joined without a separator: the run is flowed word by word and each piece
    // keeps the space that followed it, so the spacing is already in the text.
    const text = layout.primitives
      .filter((p): p is TextPrimitive => p.kind === 'text')
      .map((p) => p.text)
      .join('')
    expect(text).toContain('% DV = % Daily Value')
    expect(text).not.toContain('2,000 calories a day')
  })

  it('is permitted on a package that cannot take a tabular display', () => {
    expect(findingsFor(small(), stock).map((f) => f.code)).toContain('FDA_NUTRITION_FORMAT_MET')
  })

  it('is not permitted on the same package without that declaration', () => {
    const { cannotAccommodateTabular: _drop, ...facts } = small().nutritionFacts!
    const codes = findingsFor({ ...small(), nutritionFacts: facts }, stock).map((f) => f.code)
    expect(codes).toContain('FDA_NUTRITION_FORMAT_NOT_PERMITTED')
  })

  it('judges every part of the run, having something to identify at last', () => {
    // It used to decline here, because one undifferentiated run left no servings
    // line, serving size or Calories element to measure. Declining was the right
    // answer to that question and the wrong question to be asking: nothing
    // measured any type size on this display, so a linear panel at 0.4 point came
    // back with ten passes and no violation at all.
    const codes = findingsFor(small(), stock).map((f) => f.code)
    expect(codes).toContain('FDA_NUTRITION_TYPE_SIZE_MET')
    expect(codes).not.toContain('FDA_NUTRITION_TYPE_TOO_SMALL')
  })

  it('sets spans of different sizes on a shared baseline', () => {
    // A 14 point numeral beside an 8 point nutrient has to sit on the line, not
    // float at its own height. Each line is as tall as its largest span and every
    // piece on it takes that baseline; measured per piece instead, the run steps
    // up and down as it reads.
    const layout = layOutUsFoodLabel({ data: small(), stock })
    const byBaseline = new Map<string, Set<number>>()
    for (const p of layout.primitives) {
      if (p.kind !== 'text' || !(p.elementId?.startsWith('food-nutrition') ?? false)) continue
      const key = p.baselineYMm.toFixed(4)
      byBaseline.set(key, (byBaseline.get(key) ?? new Set()).add(p.fontSizeMm))
    }
    const mixed = [...byBaseline.values()].filter((sizes) => sizes.size > 1)
    expect(mixed.length).toBeGreaterThan(0)
  })

  it('reports a linear panel shrunk below the minimums it answers to', () => {
    const undersized = findingsFor(small({ typeScale: 0.5 }), stock).filter(
      (f) => f.code === 'FDA_NUTRITION_TYPE_TOO_SMALL',
    )
    expect(undersized.length).toBeGreaterThan(0)
    // Including the numeral, which is the figure the single-size run got wrong
    // even at full scale.
    expect(undersized.map((f) => f.citation.reference)).toContain('21 CFR 101.9(d)(1)(iii)')
  })
})

describe('the tabular display', () => {
  const stock = { widthMm: 200, heightMm: 240, marginMm: 6 }
  const tabular = (patch: Record<string, unknown> = {}): UsFoodLabelData => ({
    ...US_FOOD_CONFORMANT.data,
    container: { shape: 'rectangular', widthMm: 200, heightMm: 240 },
    nutritionFacts: {
      ...US_FOOD_CONFORMANT.data.nutritionFacts!,
      format: 'tabular',
      availableSurfaceSqInches: 80,
      continuousVerticalSpaceInches: 2,
      ...patch,
    },
  })

  it('runs the nutrients across the label instead of down it', () => {
    // The point of (d)(11): a package "without sufficient continuous vertical
    // space" gets the same information in a quarter of the height.
    const layout = layOutUsFoodLabel({ data: tabular(), stock })
    const panel = layout.elements.find((e) => e.elementId === US_FOOD_ELEMENTS.nutritionPanel)!
    const rows = layout.elements.filter((e) => e.elementId.startsWith('food-nutrition-row-'))
    const columns = new Set(rows.map((r) => Math.round(r.box.xMm)))
    expect(columns.size).toBeGreaterThan(1)
    expect(panel.box.heightMm).toBeLessThan(40)
    expect(panel.box.widthMm).toBeGreaterThan(100)
  })

  it('keeps a row element per nutrient, as the vertical display does', () => {
    const layout = layOutUsFoodLabel({ data: tabular(), stock })
    for (const id of ['total-fat', 'added-sugars', 'potassium']) {
      expect(layout.elements.map((e) => e.elementId)).toContain(nutritionRowElementId(id))
    }
  })

  it('is permitted by 101.9(d)(11)(iii) on a package far above the (j)(13) areas', () => {
    // 80 in² is twice the (j)(13) cap, and (d)(11)(iii) does not run through it:
    // "If there is not sufficient continuous vertical space (i.e.,
    // approximately 3 in) ... the nutrition label may be presented in a tabular
    // display." A rule knowing only the area route would report this label.
    const match = findingsFor(tabular(), stock).find((f) => f.code === 'FDA_NUTRITION_FORMAT_MET')
    expect(match!.citation.reference).toBe('21 CFR 101.9(d)(11)(iii)')
  })

  it('is not permitted on the same package with room for a vertical column', () => {
    const codes = findingsFor(tabular({ continuousVerticalSpaceInches: 6 }), stock).map(
      (f) => f.code,
    )
    expect(codes).toContain('FDA_NUTRITION_FORMAT_NOT_PERMITTED')
  })

  it('does not let the vertical-space route reach the linear display', () => {
    // (d)(11)(iii) names the tabular display only. Linear stays behind
    // (j)(13)(ii)(A)'s areas and its own gate.
    const codes = findingsFor(
      tabular({ format: 'linear', cannotAccommodateTabular: true }),
      stock,
    ).map((f) => f.code)
    expect(codes).toContain('FDA_NUTRITION_FORMAT_NOT_PERMITTED')
  })

  it('judges its type against the reduced minimums, not the vertical ones', () => {
    // (d)(1)(iii) drops the Calories word to 10 point on this display, and
    // (d)(3)(ii) "Serving size" to 9, so a panel drawn to them complies — judged
    // against the vertical set it would not.
    expect(findingsFor(tabular(), stock).map((f) => f.code)).not.toContain(
      'FDA_NUTRITION_TYPE_TOO_SMALL',
    )
  })

  // A small package the label and panel do not rule out: 100 × 70 mm is 10.85 in².
  const smallStock: LabelStock = { widthMm: 100, heightMm: 70, marginMm: 3 }
  const smallTabular = (): UsFoodLabelData => ({
    ...tabular({ availableSurfaceSqInches: 9, continuousVerticalSpaceInches: undefined }),
    container: { shape: 'rectangular', widthMm: 100, heightMm: 70 },
  })

  const caloriesNumeralPt = (data: UsFoodLabelData, on: LabelStock): number => {
    const drawn = layOutUsFoodLabel({ data, stock: on }).primitives.find(
      (p): p is TextPrimitive =>
        p.kind === 'text' && p.elementId === US_FOOD_ELEMENTS.nutritionCaloriesFigure,
    )!
    return drawn.fontSizeMm / MM_PER_POINT
  }

  it('keeps the Calories numeral at 22 point here and drops it to 14 only on a small package', () => {
    // (d)(1)(iii)'s numeral exception names (j)(13)(ii)(A)(1) and (A)(2) and
    // *not* (d)(11), so this display carries a 22 point numeral beside its 10
    // point word. Reading "the tabular display" as one thing put 14 on both.
    expect(caloriesNumeralPt(tabular(), stock)).toBeCloseTo(22, 5)
    expect(caloriesNumeralPt(smallTabular(), smallStock)).toBeCloseTo(14, 5)
    // And not on a label that rules the package out, whatever area it declares: 9 in²
    // typed on this 74.4 in² label drew 14 point and cleared it.
    expect(
      caloriesNumeralPt(
        tabular({ availableSurfaceSqInches: 9, continuousVerticalSpaceInches: undefined }),
        stock,
      ),
    ).toBeCloseTo(22, 5)
  })

  it('refuses the small-package route on a label that rules the package out', () => {
    // 9 in² declared on this 200 × 240 mm label, 74.4 in², with no short vertical space to
    // fall back on. The route is (j)(13)(ii)(A)'s alone, and it is closed above 40.
    const verdict = findingsFor(
      tabular({ availableSurfaceSqInches: 9, continuousVerticalSpaceInches: undefined }),
      stock,
    ).find((f) => f.code === 'FDA_NUTRITION_FORMAT_NOT_PERMITTED')
    expect(verdict!.message).toContain('the label is itself 74.4 in²')
    const entitled = findingsFor(smallTabular(), smallStock).find(
      (f) => f.code === 'FDA_NUTRITION_FORMAT_MET',
    )
    expect(entitled, 'the control: on a small label and panel it is entitled').toBeDefined()
    // And the pass names the area that decided it: the label, larger than the 9 declared.
    expect(entitled!.message).toContain('its label, more than the 9.0 in² declared')
  })

  it('judges the numeral against the display the label can reach, not the one declared', () => {
    // Scaled so the numeral lands at 16 point: over the small-package 14, under (d)(11)'s
    // 22. On this 74.4 in² label the 9 in² declared cannot open the small-package route,
    // so the rule must hold the numeral to 22 — the same display the engine chose.
    const scaled = tabular({
      availableSurfaceSqInches: 9,
      continuousVerticalSpaceInches: undefined,
      typeScale: 16 / 22,
    })
    expect(caloriesNumeralPt(scaled, stock), 'the premise').toBeCloseTo(16, 5)
    const numeral = findingsFor(scaled, stock).find(
      (f) => f.citation.reference === '21 CFR 101.9(d)(1)(iii)',
    )
    expect(numeral?.code).toBe('FDA_NUTRITION_TYPE_TOO_SMALL')
    expect(numeral!.measurement!.required).toBe('22 pt')
  })

  it('keeps the servings statement at 10 point here, which only (j)(13) lowers', () => {
    // (d)(3)(i) names the small-package pair alone. (d)(3)(ii) names this display
    // too, so the two servings lines part company and only one of them drops.
    const type = nutritionTypeForDisplay('tabularD11')
    expect(type.servingsPerContainerPt).toBe(10)
    expect(type.servingSizePt).toBe(9)
  })

  it('reports a Calories numeral set below the 22 point (d)(1)(iii) requires', () => {
    // Nothing measured the numeral at all before this: it shared the word's
    // element id, so the smaller of the two always won and an undersized numeral
    // beside a correct word could not be seen.
    const match = findingsFor(tabular({ typeScale: 0.5 }), stock).find(
      (f) => f.citation.reference === '21 CFR 101.9(d)(1)(iii)',
    )
    expect(match).toBeDefined()
    expect(match!.code).toBe('FDA_NUTRITION_TYPE_TOO_SMALL')
    expect(match!.measurement!.required).toBe('22 pt')
    expect(match!.message).toContain('the Calories numeral')
  })

  it('does not report the numeral on a small package drawn to its own 14 point', () => {
    // The over-strict direction. (j)(13)(ii)(A)(1) permits 14 here, and holding
    // this panel to 22 would report a label the paragraph allows.
    expect(
      findingsFor(smallTabular(), smallStock).filter(
        (f) => f.citation.reference === '21 CFR 101.9(d)(1)(iii)',
      ),
    ).toEqual([])
  })

  const textOf = (data: UsFoodLabelData, on: LabelStock): string[] =>
    layOutUsFoodLabel({ data, stock: on })
      .primitives.filter((p): p is TextPrimitive => p.kind === 'text')
      .map((p) => p.text)

  it('gives the full (d)(9) footnote to the display (j)(13)(i) does not reach', () => {
    // "Foods in packages subject to requirements of paragraphs (j)(13)(ii)(A)(1)
    // and (2) ... do not require the information in paragraphs (d)(9) and (f)(5)
    // ... however the abbreviated footnote statement '% DV = % Daily Value' may be
    // used." Two named paragraphs, and (d)(11)(iii) is neither: it is a space
    // accommodation that permits the arrangement and relieves nothing. The
    // abbreviation was being printed on every tabular display, and no rule checks
    // the footnote, so nothing said otherwise.
    expect(textOf(tabular(), stock).join(' ')).toContain(
      '2,000 calories a day is used for general nutrition advice.',
    )
  })

  it('keeps the abbreviation for the small-package display that may use it', () => {
    const text = textOf(smallTabular(), smallStock).join(' ')
    expect(text).toContain('% DV = % Daily Value')
    expect(text).not.toContain('2,000 calories a day')
  })

  it('draws the (d)(4) subheading and the (d)(6) column heading', () => {
    // (d)(4)'s only exception is "the dual column formats shown in paragraphs
    // (e)(5), (e)(6)(i), and (e)(6)(ii)", and (d)(6) states none at all — so every
    // tabular display owes both, and this one was drawing neither.
    for (const patch of [{}, { availableSurfaceSqInches: 9 }]) {
      const text = textOf(tabular(patch), stock)
      expect(text, JSON.stringify(patch)).toContain('Amount per serving')
      expect(text, JSON.stringify(patch)).toContain('% Daily Value*')
    }
  })

  const narrow = { widthMm: 60, heightMm: 40, marginMm: 3 }
  const onNarrowLabel = (): UsFoodLabelData => ({
    ...US_FOOD_CONFORMANT.data,
    container: { shape: 'rectangular', widthMm: 60, heightMm: 40 },
    nutritionFacts: {
      ...US_FOOD_CONFORMANT.data.nutritionFacts!,
      format: 'tabular',
      availableSurfaceSqInches: 9,
    },
  })

  it('moves the nutrients below the serving block when they do not fit beside it', () => {
    // Every row used to be drawn from the right-hand edge of a serving block that
    // already took 42 mm of a 60 mm label — off the panel, off the substrate, and
    // reported complete by the rules, because the engine only ever measured
    // overflow downward.
    const layout = layOutUsFoodLabel({ data: onNarrowLabel(), stock: narrow })
    const rows = layout.elements.filter((e) => e.elementId.startsWith('food-nutrition-row-'))
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.box.xMm + row.box.widthMm, row.elementId).toBeLessThanOrEqual(narrow.widthMm)
    }
  })

  it('grows the panel box to enclose nutrients placed below the serving block', () => {
    // The height was measured as the taller of the serving block and the nutrient
    // columns, which is right only while they sit side by side. Stacked, the panel
    // is as tall as both — and a box measured from the top instead of from where
    // the columns actually start leaves every row outside the rule it is drawn in
    // and hides the overflow from the engine's own bottom-edge check.
    const layout = layOutUsFoodLabel({ data: onNarrowLabel(), stock: narrow })
    const panel = layout.elements.find((e) => e.elementId === US_FOOD_ELEMENTS.nutritionPanel)!
    const rows = layout.elements.filter((e) => e.elementId.startsWith('food-nutrition-row-'))
    expect(rows.length).toBeGreaterThan(0)
    const panelBottomMm = panel.box.yMm + panel.box.heightMm
    for (const row of rows) {
      expect(row.box.yMm + row.box.heightMm, row.elementId).toBeLessThanOrEqual(panelBottomMm)
    }
  })

  it('reports a panel that still runs past the right edge rather than drawing it away', () => {
    // The residual case the reflow cannot rescue: one nutrient row wider than the
    // whole label. It has to say so, the way the vertical overflow always did.
    const tiny = { widthMm: 20, heightMm: 40, marginMm: 3 }
    const data: UsFoodLabelData = {
      ...onNarrowLabel(),
      container: { shape: 'rectangular', widthMm: 20, heightMm: 40 },
    }
    // Read from `omissions` rather than `blockingOmissions`: the panel is present
    // and part of it is not printed, which is `scope: 'detail'` — the same scope
    // the overflow past the bottom edge has always carried.
    const overflow = layOutUsFoodLabel({ data, stock: tiny }).omissions.filter(
      (o) => o.elementId === US_FOOD_ELEMENTS.nutritionPanel,
    )
    expect(overflow.map((o) => o.reason).join(' ')).toContain('past the right edge')
    expect(overflow.every((o) => o.scope === 'detail')).toBe(true)
  })

  it('leaves the Calories numeral to 101.9 and does not judge it under 101.2(c)', () => {
    // The numeral got an id of its own so (d)(1)(iii)'s 22 point could be measured
    // separately. That put it in reach of the 1/16 inch information-panel floor,
    // which is the one part of this panel the 101.2(c) rule's own note says must
    // be excluded — and, having no element of its own, it reported under a raw id
    // that highlighted nothing. At this scale the numeral is 1.08 mm.
    const shrunk: UsFoodLabelData = {
      ...US_FOOD_CONFORMANT.data,
      nutritionFacts: { ...US_FOOD_CONFORMANT.data.nutritionFacts!, typeScale: 0.2 },
    }
    const under1012 = findingsFor(shrunk, US_FOOD_CONFORMANT.stock).filter((f) =>
      f.citation.reference.startsWith('21 CFR 101.2'),
    )
    expect(under1012.map((f) => f.elementId)).not.toContain(
      US_FOOD_ELEMENTS.nutritionCaloriesFigure,
    )
  })
})

/**
 * Which column a lone figure is in, said correctly.
 *
 * The (e)(2) completeness check counted value cells per row and never asked
 * which column the survivor was in, so a nutrient declared only in the *second*
 * column was reported as declaring "a quantity in the first column only" — a
 * sentence pointing the reader at the one column that does carry it.
 */
describe('the second column, reported in the right direction', () => {
  const HEADINGS = ['Per serving', 'Per container'] as [string, string]
  const FULL_SECOND = {
    'total-fat': 7.5,
    'saturated-fat': 1.25,
    'trans-fat': 0,
    cholesterol: 0,
    sodium: 0,
    'total-carbohydrate': 67.5,
    'dietary-fiber': 10,
    'total-sugars': 2.5,
    'added-sugars': 0,
    protein: 12.5,
    'vitamin-d': 5,
    calcium: 650,
    iron: 20,
    potassium: 587.5,
  }

  const incompleteFinding = (data: UsFoodLabelData) =>
    findingsFor(data, US_FOOD_CONFORMANT.stock).find((f) => f.code === 'FDA_DUAL_COLUMN_INCOMPLETE')

  it('names the first column when the second is the one carrying the figure', () => {
    const facts = US_FOOD_CONFORMANT.data.nutritionFacts!
    const without = <T extends object>(source: T, key: string) =>
      Object.fromEntries(Object.entries(source).filter(([k]) => k !== key))

    const data: UsFoodLabelData = {
      ...US_FOOD_CONFORMANT.data,
      nutritionFacts: {
        ...facts,
        amounts: without(facts.amounts, 'iron') as typeof facts.amounts,
        ...(facts.declaredAmounts === undefined
          ? {}
          : { declaredAmounts: without(facts.declaredAmounts, 'iron') as never }),
        columns: {
          mode: 'dual',
          basis: 'per-container',
          headings: HEADINGS,
          secondAmounts: FULL_SECOND,
        },
      },
    }

    const match = incompleteFinding(data)
    expect(match, 'a row declared in one column only must be reported').toBeDefined()
    expect(match!.message).toMatch(/second column only — Iron/)
    expect(match!.message).not.toMatch(/first column only — Iron/)
  })

  it('names the second column when the first is the one carrying the figure', () => {
    const facts = US_FOOD_CONFORMANT.data.nutritionFacts!
    const { iron: _dropped, ...secondWithoutIron } = FULL_SECOND

    const data: UsFoodLabelData = {
      ...US_FOOD_CONFORMANT.data,
      nutritionFacts: {
        ...facts,
        columns: {
          mode: 'dual',
          basis: 'per-container',
          headings: HEADINGS,
          secondAmounts: secondWithoutIron,
        },
      },
    }

    const match = incompleteFinding(data)
    expect(match, 'a row declared in one column only must be reported').toBeDefined()
    expect(match!.message).toMatch(/first column only — Iron/)
  })
})
