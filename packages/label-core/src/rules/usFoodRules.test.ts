import { describe, expect, it } from 'vitest'
import { layOutUsFoodLabel } from '../layout/usFoodEngine'
import type { TextPrimitive } from '../layout/types'
import { US_FOOD_ELEMENTS, nutritionRowElementId } from '../templates/usFood'
import type { LabelStock } from '../templates/stock'
import { US_FOOD_CONFORMANT, US_FOOD_FIXTURES, US_FOOD_SMALL_PANEL } from './fixtures/usFood'
import { blockingOmissions } from '../layout/omissions'
import { MAJOR_FOOD_ALLERGENS, majorFoodAllergen } from '../fda/allergens'
import type { UsFoodIngredient, UsFoodLabelData } from '../templates/usFood'
import { roundNutrientAmount } from '../fda/nutrients'
import { nutritionTypeForDisplay } from '../fda/nutritionPanel'
import { MM_PER_POINT } from '../geometry/units'
import {
  FDA_ALLERGEN_NOT_DECLARED,
  FDA_NUTRITION_PERCENT_DV_WRONG,
  FDA_NUTRITION_ROUNDING_WRONG,
  FDA_CONTAINS_TYPE_TOO_SMALL,
  FDA_ALLERGEN_SOURCE_NOT_SPECIFIC,
  FDA_INGREDIENTS_EXEMPT,
  FDA_INGREDIENTS_MISSING,
  FDA_INGREDIENTS_ORDER_MET,
  FDA_INGREDIENTS_OUT_OF_ORDER,
  FDA_INGREDIENT_THRESHOLD_EXCEEDED,
  FDA_PANEL_TYPE_SIZE_MET,
  FDA_PANEL_TYPE_TOO_SMALL,
  FDA_NET_QUANTITY_CROWDED,
  FDA_NET_QUANTITY_DUAL_MET,
  FDA_NET_QUANTITY_METRIC_NOT_REQUIRED,
  FDA_NET_QUANTITY_MISSING,
  FDA_NET_QUANTITY_OUTSIDE_ZONE,
  FDA_NET_QUANTITY_TYPE_SIZE_MET,
  FDA_NET_QUANTITY_TYPE_TOO_SMALL,
  FDA_NET_QUANTITY_ZONE_NOT_REQUIRED,
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
    // One short of the registry, and deliberately: the format rule declines on a
    // panel using the standard vertical display, because every package may use
    // it and there is no entitlement to judge. A pass there would be a check
    // that clears every label carrying the default.
    expect(passes).toHaveLength(US_FOOD_RULES.length - 1)
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

  it('exempts a small package from the placement rule instead of reporting it', () => {
    // 101.7(f)'s proviso is an exemption, not a relaxation. The identical layout
    // on a 31.62 in² panel is a violation; on a 4.65 in² one it is not, and a
    // rule that skipped this check would report against a compliant package.
    const findings = findingsFor(US_FOOD_SMALL_PANEL.data, US_FOOD_SMALL_PANEL.stock)
    expect(findings.map((f) => f.code)).toContain(FDA_NET_QUANTITY_ZONE_NOT_REQUIRED)
    expect(findings.map((f) => f.code)).not.toContain(FDA_NET_QUANTITY_OUTSIDE_ZONE)
  })

  it('exempts that package from placement only, not from the rest of 101.7(f)', () => {
    // The proviso covers placement within the bottom 30 percent and nothing
    // else. The declaration on this package is still printed over the statement
    // of identity, and the separation requirement in the same paragraph still
    // applies — reading the exemption as blanket would drop a real finding.
    const findings = findingsFor(US_FOOD_SMALL_PANEL.data, US_FOOD_SMALL_PANEL.stock)
    expect(findings.map((f) => f.code)).toContain(FDA_NET_QUANTITY_CROWDED)
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
      nutritionFactsExempt: true,
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
    it('clears a label that lists nothing', () => {
      const codes = findingsFor(
        { ...US_FOOD_CONFORMANT.data, ingredients: [], ingredientsExempt: true },
        stock,
      ).map((f) => f.code)
      expect(codes).toContain(FDA_INGREDIENTS_EXEMPT)
      expect(codes).not.toContain(FDA_INGREDIENTS_MISSING)
    })

    it('still judges a list printed anyway', () => {
      const codes = findingsFor(
        {
          ...US_FOOD_CONFORMANT.data,
          ingredientsExempt: true,
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

  it('clears it when the label claims the exemption, citing 101.9(j)', () => {
    const findings = findingsFor({ ...withoutPanel, nutritionFactsExempt: true }, stock)
    const match = findings.find((f) => f.code === 'FDA_NUTRITION_EXEMPT')
    expect(match!.severity).toBe('pass')
    expect(match!.citation.reference).toBe('21 CFR 101.9(j)')
    expect(findings.map((f) => f.code)).not.toContain('FDA_NUTRITION_MISSING')
  })

  it('does not let the claim excuse a panel that is present and wrong', () => {
    // The exemption relieves a food of bearing a panel. A panel printed anyway
    // is judged — the same reading as §101.100 and the ingredient list.
    const codes = findingsFor(
      {
        ...US_FOOD_CONFORMANT.data,
        nutritionFactsExempt: true,
        nutritionFacts: { ...US_FOOD_CONFORMANT.data.nutritionFacts!, typeScale: 0.8 },
      },
      stock,
    ).map((f) => f.code)
    expect(codes).toContain('FDA_NUTRITION_TYPE_TOO_SMALL')
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
  const stock = US_FOOD_CONFORMANT.stock
  const small = (patch: Record<string, unknown> = {}): UsFoodLabelData => ({
    ...US_FOOD_CONFORMANT.data,
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
    const codes = findingsFor({ ...US_FOOD_CONFORMANT.data, nutritionFacts: facts }, stock).map(
      (f) => f.code,
    )
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
    expect(
      caloriesNumeralPt(
        tabular({ availableSurfaceSqInches: 9, continuousVerticalSpaceInches: undefined }),
        stock,
      ),
    ).toBeCloseTo(14, 5)
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
    const small = tabular({
      availableSurfaceSqInches: 9,
      continuousVerticalSpaceInches: undefined,
    })
    expect(
      findingsFor(small, stock).filter((f) => f.citation.reference === '21 CFR 101.9(d)(1)(iii)'),
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
    const small = tabular({ availableSurfaceSqInches: 9, continuousVerticalSpaceInches: undefined })
    const text = textOf(small, stock).join(' ')
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
