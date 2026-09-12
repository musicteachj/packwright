import { describe, expect, it } from 'vitest'
import { layOutUsFoodLabel } from '../layout/usFoodEngine'
import type { TextPrimitive } from '../layout/types'
import { US_FOOD_ELEMENTS } from '../templates/usFood'
import type { LabelStock } from '../templates/stock'
import { US_FOOD_CONFORMANT, US_FOOD_FIXTURES, US_FOOD_SMALL_PANEL } from './fixtures/usFood'
import { blockingOmissions } from '../layout/omissions'
import { MAJOR_FOOD_ALLERGENS, majorFoodAllergen } from '../fda/allergens'
import type { UsFoodIngredient, UsFoodLabelData } from '../templates/usFood'
import { roundNutrientAmount } from '../fda/nutrients'
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
    expect(passes).toHaveLength(US_FOOD_RULES.length)
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
    const { data, stock } = US_FOOD_FIXTURES[2]!
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
  const molded = US_FOOD_FIXTURES[1]!

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
    const { data, stock } = US_FOOD_FIXTURES[0]!
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
      ...rest
    } = US_FOOD_CONFORMANT.data
    const data = { ...rest, statementOfIdentity: '', ingredients: [] }
    const layout = layOutUsFoodLabel({ data, stock: US_FOOD_CONFORMANT.stock })
    for (const elementId of [
      US_FOOD_ELEMENTS.statementOfIdentity,
      US_FOOD_ELEMENTS.ingredients,
      US_FOOD_ELEMENTS.responsibleFirm,
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
