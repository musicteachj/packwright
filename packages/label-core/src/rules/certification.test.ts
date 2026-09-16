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
import * as bwip from 'bwip-js/generic'
import { layOutUpcALabel } from '../layout/engine'
import { layOutGhsLabel } from '../layout/ghsEngine'
import { layOutUsFoodLabel } from '../layout/usFoodEngine'
import { GHS_CONFORMANT } from './fixtures/ghs'
import { CONFORMANT_FIXTURE as GS1_CONFORMANT } from './fixtures/gs1Retail'
import { US_FOOD_CONFORMANT } from './fixtures/usFood'
import { PERMISSION_PATHS, sweepEveryRule } from './fixtures/sweep'
import { GHS_RULES, GS1_RETAIL_RULES, US_FOOD_RULES } from './registry'
import { finding } from './finding'
import type { Finding } from '../types/index'
import type { LabelStock } from '../templates/stock'
import { UPC_A_ELEMENTS } from '../templates/upcA'
import { US_FOOD_ELEMENTS } from '../templates/usFood'
import type { UsFoodIngredient, UsFoodLabelData } from '../templates/usFood'
import { runRules } from './registry'
import {
  FDA_DUAL_COLUMN_EXEMPT,
  FDA_NET_QUANTITY_CROWDED,
  FDA_RESPONSIBLE_FIRM_MET,
  GHS_PICTOGRAM_SIZE_MET,
  GS1_DIGITAL_LINK_VALID,
  GS1_GTIN_CHECK_DIGIT_VALID,
  ghsPictogramSizeRule,
} from './index'

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

describe('the GS1 passes that rest on the document', () => {
  // **The omission is added by hand, and no verdict the engine can reach moves.**
  // `layOutUpcALabel` records one omission — no symbol, because the check digit
  // is wrong — and on that label no GS1 rule passes at all. So a GS1 pass never
  // sits beside an omission today. These pin what each pass does on the day one
  // can: the same element omitted, and the two answers parting company over it.
  const drawn = layOutUpcALabel(bwip as never, GS1_CONFORMANT)
  const findings = runRules({
    labelType: 'gs1-retail',
    ...GS1_CONFORMANT,
    layout: {
      ...drawn,
      omissions: [
        { elementId: UPC_A_ELEMENTS.symbol, reason: 'Omitted for this test.', scope: 'element' },
      ],
    },
  })

  it('keeps the check digit, a fact about the number, when the symbol is omitted', () => {
    expect(drawn.omissions, 'the premise: the conformant label draws in full').toEqual([])

    const onTheSymbol = findings
      .filter((result) => result.severity === 'pass' && result.elementId === UPC_A_ELEMENTS.symbol)
      .map((result) => result.code)

    // Exact, so it fails in both directions: the check digit withheld, or any of
    // the four passes that measure the printed symbol surviving beside it.
    expect(
      onTheSymbol,
      'only the check digit survives; everything measured off the bars is withheld',
    ).toEqual([GS1_GTIN_CHECK_DIGIT_VALID])
  })

  it('keeps the Digital Link, and says why rather than surviving by accident', () => {
    const link = findings.find((result) => result.code === GS1_DIGITAL_LINK_VALID)

    // It names no element, so the guard has nothing to look up and would keep it
    // whichever answer it gave. Survival alone therefore cannot tell the two
    // apart — stamping it `artwork` again leaves this test's first two
    // assertions green. The declaration is the part a regression changes.
    expect(link, 'the premise: the conformant label configures a valid Digital Link').toBeDefined()
    expect(link!.elementId, 'the premise: nothing is drawn for it to name').toBeUndefined()
    expect(link!.severity === 'pass' && link!.certifies).toBe('document')
  })
})

describe('a GHS pictogram is certified on its ink', () => {
  it('withholds its size when the symbol inside the frame was not drawn', () => {
    // The one GHS answer a verdict turns on today, and nothing pinned it: stamped
    // `document`, the whole suite stayed green. Every pictogram this engine draws
    // is a frame with its symbol recorded as omitted, and a frame with no symbol
    // is not a pictogram (C.2.3.1), so there is no printed pictogram whose size
    // 1.2.1.3 could be met by. On the audit path it would be worse: nobody measures
    // `pictogramSideMm` there, so a pass on the document would clear a size that was
    // never measured, on every audit carrying a pictogram.
    const { data, stock } = GHS_CONFORMANT
    const layout = layOutGhsLabel({ data, stock })
    const context = { labelType: 'ghs-chemical' as const, data, stock, layout }

    expect(
      ghsPictogramSizeRule.check(context).map((result) => result.code),
      'the premise: the rule clears the frame before the guard sees it',
    ).toContain(GHS_PICTOGRAM_SIZE_MET)
    expect(
      runRules(context).map((result) => result.code),
      'a pictogram whose symbol was not printed has not met a size requirement',
    ).not.toContain(GHS_PICTOGRAM_SIZE_MET)
  })
})

/** One sweep for the whole file. It lays out every fixture; the assertions below do not each need their own. */
const SWEPT = sweepEveryRule(bwip)
const PASSES = SWEPT.filter(({ finding: result }) => result.severity === 'pass')

describe('every pass says what it certifies', () => {
  it('will not compile if a pass omits it', () => {
    // **The guarantee, and it is the compiler's rather than this file's.**
    // `Finding` is discriminated on `severity`, so the `pass` arm requires
    // `certifies`. That holds for every rule ever written, including the ones no
    // fixture reaches — which matters, because an entitlement is not a *bad*
    // label, so no known-bad fixture exercises one and a runtime sweep is
    // structurally blind to exactly the passes most likely to be mis-stamped.
    //
    // `@ts-expect-error` fails the build if the error stops happening, so this
    // is a check rather than a comment about one. **It sits inside the arrow on
    // purpose:** above the `const`, Prettier's line break moved the call off the
    // line the directive governs, and the typecheck reported it unused.
    const uncertified = () =>
      // @ts-expect-error a pass must say what it rests on
      finding(GS1_RETAIL_RULES[0]!, { code: 'x', severity: 'pass', message: 'm' })
    expect(typeof uncertified).toBe('function')
  })

  it('will not compile a finding assembled by hand as a pass without it either', () => {
    // The test above goes through `finding()`, so it pins `FindingInput` and
    // nothing else. `Finding` itself could be widened back to an optional field
    // and that test would still pass — a review did exactly that, and the whole
    // suite stayed green. This one names the type directly.
    // @ts-expect-error a finding that passes must say what it rests on
    const handBuilt: Finding = {
      code: 'x',
      severity: 'pass',
      message: 'm',
      citation: { authority: 'GS1', reference: 'r' },
    }
    expect(handBuilt.severity).toBe('pass')
  })

  it('and none of the passes the fixtures do reach has been left to a default', () => {
    // Belt and braces under the type: it would catch a `Finding` object built by
    // hand somewhere that bypassed `finding()` altogether.
    const undeclared = PASSES.filter(({ finding: result }) => result.certifies === undefined).map(
      ({ rule, finding: result }) => `${rule.id} / ${result.code}`,
    )
    expect([...new Set(undeclared)].sort(), 'a pass that did not say what it rests on').toEqual([])
  })

  it('reaches every rule set, so neither assertion is vacuous for one of them', () => {
    // Asserted per set against the registry's own arrays rather than as one
    // pooled threshold. A pooled count reads green while a whole rule set goes
    // dark: with three rules' slack today, all seven GHS rules could stop
    // emitting passes and a `> 25` check would not notice.
    const cleared = (rules: readonly { id: string }[]) =>
      rules.filter((rule) => PASSES.some(({ rule: seen }) => seen.id === rule.id)).length

    expect(cleared(GS1_RETAIL_RULES), 'GS1 rules that cleared at least once').toBe(
      GS1_RETAIL_RULES.length,
    )
    // Not all of them: `docs/BACKLOG.md` records which pass codes no fixture
    // reaches, and why one of them cannot be reached at all today.
    expect(cleared(GHS_RULES), 'GHS rules that cleared at least once').toBeGreaterThanOrEqual(5)
    expect(
      cleared(US_FOOD_RULES),
      'us-food rules that cleared at least once',
    ).toBeGreaterThanOrEqual(18)
  })

  it('reaches something with every permission path it carries', () => {
    // Two of the four were dead on the day they were written. One kept a panel
    // its rule's exemption branch requires to be absent; the other paraphrased a
    // paragraph's permission without its condition, so it never declared the fact
    // the permission turns on and got a violation instead of the pass its comment
    // named. Both would have sat in the sweep looking like coverage.
    const fromFixtures = new Set(
      PASSES.filter(({ source }) => source === 'fixtures').map(({ finding: r }) => r.code),
    )
    for (const { label } of PERMISSION_PATHS) {
      const reached = PASSES.filter(({ source }) => source === label)
        .map(({ finding: r }) => r.code)
        .filter((code) => !fromFixtures.has(code))
      expect(reached, `${label} must reach a pass no fixture does`).not.toEqual([])
    }
  })

  it('observes both answers, not just the default one', () => {
    // The gap this file shipped with for one commit: the sweep was copied from
    // `citations.test.ts` minus the permission paths, so it saw 708 passes and
    // every one of them `artwork`. Both `passedOnDocument` sites sit on rules it
    // never reached, which is to say the half of the distinction that changes a
    // verdict was untested by the test written to police it.
    const kinds = new Set(PASSES.map(({ finding: result }) => result.certifies))
    expect([...kinds].sort()).toEqual(['artwork', 'document'])
  })
})
