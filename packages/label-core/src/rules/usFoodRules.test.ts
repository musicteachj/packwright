import { describe, expect, it } from 'vitest'
import { layOutUsFoodLabel } from '../layout/usFoodEngine'
import type { TextPrimitive } from '../layout/types'
import { US_FOOD_ELEMENTS } from '../templates/usFood'
import type { LabelStock } from '../templates/stock'
import type { UsFoodLabelData } from '../templates/usFood'
import { US_FOOD_CONFORMANT, US_FOOD_FIXTURES, US_FOOD_SMALL_PANEL } from './fixtures/usFood'
import { blockingOmissions } from '../layout/omissions'
import {
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
      (code) => !covered.has(code) && !/_MET$|_NOT_REQUIRED$|_EXEMPT$/.test(code),
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
    const { responsibleFirm: _firm, ...rest } = US_FOOD_CONFORMANT.data
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
      expect(undersized.map((f) => f.elementId).sort()).toEqual([
        US_FOOD_ELEMENTS.ingredients,
        US_FOOD_ELEMENTS.responsibleFirm,
      ])
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
