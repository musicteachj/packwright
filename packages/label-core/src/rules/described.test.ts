/**
 * On a label printed elsewhere, no check passes on a value the engine chose.
 *
 * `check_label` judges a `described` label: the engine fills in what the request
 * leaves out, and before stage 23 the rules passed its defaults — magnification 1.0,
 * the nominal bar height, a net-quantity em derived to just meet 101.7(i), the
 * Nutrition Facts sizes the rule checks against — as if they were the user's label.
 * `rules/described.ts` sets those aside. The first block is the property that makes
 * it safe: on every GS1 and US food document, a described label's findings are the
 * drawing's with some taken away and none added, so this path cannot clear anything.
 */

import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import { FIT_NOT_CHECKED, judgeLabel, type Judgement, type JudgeRequest } from '../judge/judge'
import { EDGELESS_MM } from '../schema/labelDocument'
import type { LabelStock } from '../templates/stock'
import type { UpcALabelData } from '../templates/upcA'
import type { UsFoodLabelData } from '../templates/usFood'
import { CONFORMANT_FIXTURE, GS1_RETAIL_FIXTURES } from './fixtures/gs1Retail'
import { PERMISSION_PATHS } from './fixtures/sweep'
import { US_FOOD_CONFORMANT, US_FOOD_FIXTURES } from './fixtures/usFood'
import { US_FOOD_RULES } from './registry'
import { someFindingsGoOnADescribedLabel } from './described'
import { codesOf, type LabelSubject, type UsFoodContext } from './types'

const CITE = { authority: 'FDA', reference: 'x', title: 'x' } as const

function judged(request: JudgeRequest): Judgement {
  const result = judgeLabel(request)
  if (result.outcome !== 'judged') throw new Error(`refused: ${result.reason}`)
  return result
}

const upcA = (data: UpcALabelData, stock: LabelStock, subject?: LabelSubject) =>
  judged({
    labelType: 'gs1-retail',
    data,
    stock,
    barcode: bwip,
    ...(subject === undefined ? {} : { subject }),
  })

const food = (data: UsFoodLabelData, stock: LabelStock, subject?: LabelSubject) =>
  judged({ labelType: 'us-food', data, stock, ...(subject === undefined ? {} : { subject }) })

const codes = (judgement: Judgement) => judgement.findings.map((one) => one.code)
const declinedBy = (judgement: Judgement, ruleId: string) =>
  judgement.declined.find((one) => one.ruleId === ruleId)

describe('a described label is judged as drawn, with findings taken away and none added', () => {
  const documents = [
    ...[...GS1_RETAIL_FIXTURES, { name: 'conformant', ...CONFORMANT_FIXTURE }].map(
      (f) =>
        [
          `gs1: ${f.name}`,
          () => [upcA(f.data, f.stock), upcA(f.data, f.stock, 'described')],
        ] as const,
    ),
    ...[
      ...US_FOOD_FIXTURES,
      { name: 'conformant', ...US_FOOD_CONFORMANT },
      ...PERMISSION_PATHS.map(({ label, data, stock }) => ({
        name: label,
        data: data as UsFoodLabelData,
        stock: stock ?? US_FOOD_CONFORMANT.stock,
      })),
    ].map(
      (f) =>
        [
          `food: ${f.name}`,
          () => [food(f.data, f.stock), food(f.data, f.stock, 'described')],
        ] as const,
    ),
  ]

  it.each(documents)('%s', (_name, judge) => {
    const [drawing, described] = judge()
    // Every described finding is one the drawing made, word for word: nothing here
    // can manufacture a pass, or a verdict of any kind.
    for (const finding of described!.findings) expect(drawing!.findings).toContainEqual(finding)
  })
})

describe('a barcode described rather than drawn', () => {
  const stock = CONFORMANT_FIXTURE.stock
  const gtinOnly: UpcALabelData = { gtin: '036000291452' }

  it('passes nothing on the magnification, bar height and digits it was not told', () => {
    const drawing = upcA(gtinOnly, stock)
    const described = upcA(gtinOnly, stock, 'described')
    // The premise: on the drawing all three pass, on the engine's own defaults.
    expect(codes(drawing)).toEqual(
      expect.arrayContaining([
        'GS1_MAGNIFICATION_IN_RANGE',
        'GS1_BAR_HEIGHT_SUFFICIENT',
        'GS1_HRI_PRESENT',
        'GS1_QUIET_ZONE_CLEAR',
      ]),
    )
    expect(codes(described)).not.toContain('GS1_MAGNIFICATION_IN_RANGE')
    expect(codes(described)).not.toContain('GS1_BAR_HEIGHT_SUFFICIENT')
    expect(codes(described)).not.toContain('GS1_HRI_PRESENT')
    expect(codes(described)).not.toContain('GS1_QUIET_ZONE_CLEAR')
    // The check digit is a fact about the number the request states.
    expect(codes(described)).toContain('GS1_GTIN_CHECK_DIGIT_VALID')

    expect(declinedBy(described, 'gs1/magnification')?.wants).toEqual(['magnification'])
    expect(declinedBy(described, 'gs1/bar-height')?.wants).toEqual(['barHeightMm', 'magnification'])
    expect(declinedBy(described, 'gs1/human-readable')?.wants).toEqual(['omitHri'])
    expect(declinedBy(described, 'gs1/quiet-zone')).toMatchObject({ wants: [], limit: true })
  })

  it('runs those checks once the request states what they wait for', () => {
    const stated = upcA(
      { ...gtinOnly, magnification: 1, barHeightMm: 22.85, omitHri: false },
      stock,
      'described',
    )
    expect(codes(stated)).toEqual(
      expect.arrayContaining([
        'GS1_MAGNIFICATION_IN_RANGE',
        'GS1_BAR_HEIGHT_SUFFICIENT',
        'GS1_HRI_PRESENT',
      ]),
    )
    // The quiet zone is not a value anyone can state: everything printed around the
    // symbol is not in the request.
    expect(codes(stated)).not.toContain('GS1_QUIET_ZONE_CLEAR')
    expect(declinedBy(stated, 'gs1/quiet-zone')?.limit).toBe(true)
  })

  it('gives no bar-height verdict against a minimum set by a magnification nobody stated', () => {
    // 20 mm is short of 100%'s 22.85 mm and clears 80%'s 18.28 mm. Measured against the
    // default it was a violation about a label that may be printed at 80%. Found by review.
    const short = upcA({ ...gtinOnly, barHeightMm: 20 }, stock, 'described')
    expect(codes(short)).not.toContain('GS1_BAR_HEIGHT_BELOW_MINIMUM')
    expect(declinedBy(short, 'gs1/bar-height')?.wants).toEqual(['magnification'])
    // Asked only for what is missing, in words that do not deny what was given.
    const heightless = upcA({ ...gtinOnly, magnification: 0.8 }, stock, 'described')
    const asked = declinedBy(heightless, 'gs1/bar-height')!
    expect(asked.wants).toEqual(['barHeightMm'])
    expect(asked.reason).not.toContain('magnification')
    const atEighty = upcA({ ...gtinOnly, barHeightMm: 20, magnification: 0.8 }, stock, 'described')
    expect(codes(atEighty)).toContain('GS1_BAR_HEIGHT_SUFFICIENT')
  })

  it('asks for nothing where no symbol was drawn to measure', () => {
    // A wrong check digit encodes no symbol; the barcode checks have nothing to run on,
    // and the check digit rule says why.
    const unencodable = upcA({ gtin: '036000291453' }, stock, 'described')
    for (const ruleId of ['gs1/magnification', 'gs1/bar-height', 'gs1/human-readable']) {
      expect(declinedBy(unencodable, ruleId), ruleId).toBeUndefined()
    }
  })

  it('still reports a stated magnification outside the specification', () => {
    const small = upcA({ ...gtinOnly, magnification: 0.5 }, stock, 'described')
    expect(codes(small)).toContain('GS1_MAGNIFICATION_OUT_OF_RANGE')
    // A rule that judged has not stood down.
    expect(declinedBy(small, 'gs1/magnification')).toBeUndefined()
  })
})

describe('a food label described rather than drawn', () => {
  const stockOf = US_FOOD_CONFORMANT.stock
  const STOOD_DOWN = [
    'us-food/net-quantity-type-size',
    'us-food/net-quantity-placement',
    'us-food/net-quantity-separation',
    'us-food/contains-statement-type',
    'us-food/information-panel-type-size',
    'us-food/nutrition-type-size',
  ]

  it('gives no verdict on type sizes or positions, and says why', () => {
    const drawing = food(US_FOOD_CONFORMANT.data, stockOf)
    const described = food(US_FOOD_CONFORMANT.data, stockOf, 'described')
    // The premise: each of these passes on the drawing.
    expect(codes(drawing)).toEqual(
      expect.arrayContaining([
        'FDA_NET_QUANTITY_TYPE_SIZE_MET',
        'FDA_NET_QUANTITY_PLACEMENT_MET',
        'FDA_NET_QUANTITY_SEPARATION_MET',
        'FDA_CONTAINS_TYPE_MET',
        'FDA_PANEL_TYPE_SIZE_MET',
        'FDA_NUTRITION_TYPE_SIZE_MET',
      ]),
    )
    for (const ruleId of STOOD_DOWN) {
      const own = codesOf(US_FOOD_RULES.find((rule) => rule.id === ruleId)!)
      expect(
        described.findings.filter((one) => own.includes(one.code)),
        ruleId,
      ).toEqual([])
      const declined = declinedBy(described, ruleId)
      expect(declined, ruleId).toMatchObject({ wants: [], limit: true })
      expect(declined!.reason, ruleId).toContain('a limit of this tool')
    }
    // What the request states is still judged: the declaration is present, in both
    // systems, and the nutrients are complete.
    expect(codes(described)).toEqual(
      expect.arrayContaining([
        'FDA_NET_QUANTITY_DECLARED_MET',
        'FDA_NET_QUANTITY_DUAL_MET',
        'FDA_NUTRITION_COMPLETE',
      ]),
    )
  })

  it('says type size is the typeface’s, not a fault in the label', () => {
    const described = food(US_FOOD_CONFORMANT.data, stockOf, 'described')
    expect(declinedBy(described, 'us-food/net-quantity-type-size')!.reason).toContain(
      'height of the printed letters',
    )
  })

  it('gives no verdict either way on a net quantity set too small in Packwright’s face', () => {
    // A stated em, measured in Packwright's typeface, says nothing certain about the
    // letters a different face prints at that size — so no violation either.
    const fixture = US_FOOD_FIXTURES.find(
      (f) => f.expected.code === 'FDA_NET_QUANTITY_TYPE_TOO_SMALL',
    )!
    expect(codes(food(fixture.data, fixture.stock))).toContain('FDA_NET_QUANTITY_TYPE_TOO_SMALL')
    const described = food(fixture.data, fixture.stock, 'described')
    expect(codes(described)).not.toContain('FDA_NET_QUANTITY_TYPE_TOO_SMALL')
    expect(declinedBy(described, 'us-food/net-quantity-type-size')?.limit).toBe(true)
  })

  it('keeps a dual-column panel’s stated faults, and withholds only its pass', () => {
    const headingless = US_FOOD_FIXTURES.find(
      (f) => f.expected.code === 'FDA_DUAL_COLUMN_HEADINGS_MISSING',
    )!
    expect(codes(food(headingless.data, headingless.stock, 'described'))).toContain(
      'FDA_DUAL_COLUMN_HEADINGS_MISSING',
    )

    const passing = US_FOOD_FIXTURES.map((f) => ({ f, drawn: food(f.data, f.stock) })).find(
      ({ drawn }) => codes(drawn).includes('FDA_DUAL_COLUMN_FORM_MET'),
    )
    expect(passing, 'the premise: some document passes the form on the drawing').toBeDefined()
    const described = food(passing!.f.data, passing!.f.stock, 'described')
    expect(codes(described)).not.toContain('FDA_DUAL_COLUMN_FORM_MET')
  })

  it('says nothing set aside where the label has nothing of the kind', () => {
    // A unit container carries no Nutrition Facts panel and, with no allergens, no
    // Contains statement: there is no verdict on either to set aside.
    const small = US_FOOD_FIXTURES.find(
      (f) => f.expected.code === 'FDA_UNIT_CONTAINER_STATEMENT_TOO_SMALL',
    )!
    const { informationPanelFontSizeMm: _size, containsStatement: _contains, ...unit } = small.data
    const described = food(unit, small.stock, 'described')
    expect(declinedBy(described, 'us-food/nutrition-type-size')).toBeUndefined()
    expect(declinedBy(described, 'us-food/contains-statement-type')).toBeUndefined()
  })

  it('gives no verdict on a unit container statement’s type size, either way', () => {
    const small = US_FOOD_FIXTURES.find(
      (f) => f.expected.code === 'FDA_UNIT_CONTAINER_STATEMENT_TOO_SMALL',
    )!
    const described = food(small.data, small.stock, 'described')
    expect(codes(described)).not.toContain('FDA_UNIT_CONTAINER_STATEMENT_TOO_SMALL')
    expect(declinedBy(described, 'us-food/nutrition-completeness')?.limit).toBe(true)
    // Under its own provision, not the completeness rule's 101.9(c).
    expect(declinedBy(described, 'us-food/nutrition-completeness')?.citation.reference).toBe(
      '21 CFR 101.9(j)(15)(iii)',
    )

    // At the default size it passes on the drawing; described, the pass goes too.
    const { informationPanelFontSizeMm: _size, ...defaultSize } = small.data
    expect(codes(food(defaultSize, small.stock))).toContain('FDA_NUTRITION_EXEMPT')
    expect(codes(food(defaultSize, small.stock, 'described'))).not.toContain('FDA_NUTRITION_EXEMPT')
  })
})

describe('a rule some of whose findings go', () => {
  // Held directly: the two rules that use it today only ever lose their only finding,
  // so nothing above reaches a rule that loses one finding and keeps another.
  const { declines: _declines, ...base } = US_FOOD_RULES[0]!
  const rule = someFindingsGoOnADescribedLabel<UsFoodContext>(
    {
      ...base,
      check: () => [
        { code: 'GOES', severity: 'pass', certifies: 'artwork', message: '', citation: CITE },
        { code: 'STAYS', severity: 'violation', message: '', citation: CITE },
      ],
    },
    { goes: (one) => one.code === 'GOES', why: 'Why.' },
  )
  const context = {
    labelType: 'us-food',
    subject: 'described',
  } as unknown as UsFoodContext

  it('keeps what does not go, and does not claim to have stood down beside it', () => {
    expect(rule.check(context).map((one) => one.code)).toEqual(['STAYS'])
    expect(rule.declines!(context)).toBeUndefined()
  })
})

describe('a label described without its size', () => {
  // As `check_label` judges a request with no `stock`: drawn on an edgeless stock, its
  // rules told the size is unknown (`sizeUnstated`). The panel alone decides a denial;
  // a grant waits for the size, since a bigger label could take it away.
  const sizeless = (data: UsFoodLabelData) =>
    judged({
      labelType: 'us-food',
      data,
      stock: { widthMm: EDGELESS_MM, heightMm: EDGELESS_MM, marginMm: 6 },
      subject: 'described',
      sizeUnstated: true,
    })
  const smallBox = { shape: 'rectangular' as const, widthMm: 50, heightMm: 60 }
  const bigBox = { shape: 'rectangular' as const, widthMm: 120, heightMm: 240 }
  const panel = US_FOOD_CONFORMANT.data.nutritionFacts!
  const tabular = (container: typeof smallBox) => ({
    ...US_FOOD_CONFORMANT.data,
    container,
    nutritionFacts: { ...panel, format: 'tabular' as const, availableSurfaceSqInches: 5 },
  })

  it('waits for the size before granting a format the panel alone would permit', () => {
    const described = sizeless(tabular(smallBox))
    expect(codes(described)).not.toContain('FDA_NUTRITION_FORMAT_MET')
    expect(declinedBy(described, 'us-food/nutrition-format')?.wants).toEqual(['stock'])
  })

  it('judges a tabular display any package of its shape may use, without the size', () => {
    // (d)(11)(iii): a package without the continuous vertical space for the standard
    // display may use the tabular one, whatever its size — so no size is asked for.
    // Found by review.
    const tall = {
      ...US_FOOD_CONFORMANT.data,
      container: bigBox,
      nutritionFacts: {
        ...panel,
        format: 'tabular' as const,
        availableSurfaceSqInches: 60,
        continuousVerticalSpaceInches: 2,
      },
    }
    const described = sizeless(tall)
    expect(codes(described)).toContain('FDA_NUTRITION_FORMAT_MET')
    expect(declinedBy(described, 'us-food/nutrition-format')).toBeUndefined()
  })

  it('denies a format the panel alone rules out, naming the panel', () => {
    const described = sizeless(tabular(bigBox))
    const denied = described.findings.find((f) => f.code === 'FDA_NUTRITION_FORMAT_NOT_PERMITTED')
    expect(denied).toBeDefined()
    // The panel, never the ten-metre stock a sizeless label is drawn on.
    expect(denied!.message).not.toContain('155')
    expect(declinedBy(described, 'us-food/nutrition-format')).toBeUndefined()
  })

  it('waits before granting the small-package exemption, and denies it where the panel rules it out', () => {
    const smallPackage = PERMISSION_PATHS.find((p) => p.label === 'small package nutrition exempt')!
    const claimed = smallPackage.data as UsFoodLabelData
    const granted = sizeless(claimed)
    expect(codes(granted)).not.toContain('FDA_NUTRITION_EXEMPT')
    expect(declinedBy(granted, 'us-food/nutrition-completeness')?.wants).toEqual(['stock'])

    const denied = sizeless({ ...claimed, container: bigBox })
    const missing = denied.findings.find((f) => f.code === 'FDA_NUTRITION_MISSING')
    expect(missing?.message).toContain('principal display panel is itself')
  })

  it('does not pass a second column’s protein percentage on an excuse the size decides', () => {
    // A food for children 1 through 3 with a per-container column and no protein
    // percentage in it. On its 50 × 60 mm panel alone, declaring 10 in², the column is
    // excused under (A); on a 100 × 100 mm label it is owed, and the missing percentage a
    // violation. Raised by review.
    const fixture = US_FOOD_FIXTURES.find(
      (f) =>
        f.expected.code === 'FDA_PROTEIN_PERCENT_MISSING' &&
        f.data.nutritionFacts?.columns?.mode === 'dual',
    )!
    const small = {
      ...fixture.data,
      container: smallBox,
      nutritionFacts: { ...fixture.data.nutritionFacts!, availableSurfaceSqInches: 10 },
    } as UsFoodLabelData
    const described = sizeless(small)
    // No verdict on the column either way, and the size asked for where it is owed.
    expect(codes(described)).not.toContain('FDA_PROTEIN_PERCENT_MET')
    expect(codes(described)).not.toContain('FDA_PROTEIN_PERCENT_MISSING')
    expect(declinedBy(described, 'us-food/dual-column-required')?.wants).toEqual(['stock'])
    const sized = food(small, { widthMm: 100, heightMm: 100, marginMm: 6 }, 'described')
    expect(codes(sized)).toContain('FDA_PROTEIN_PERCENT_MISSING')

    // The first column's percentage owes nothing to the size: missing, it is reported
    // without one. Waiting the whole rule hid it. Found by `/code-review high` on #90.
    const { protein: _protein, ...noFirstPercent } = small.nutritionFacts!.declaredPercentDv!
    const firstMissing = sizeless({
      ...small,
      nutritionFacts: { ...small.nutritionFacts!, declaredPercentDv: noFirstPercent },
    })
    expect(
      firstMissing.findings
        .filter((f) => f.code === 'FDA_PROTEIN_PERCENT_MISSING')
        .map((f) => f.citation.reference),
    ).toEqual(['21 CFR 101.9(c)(7)(i)'])
  })

  it('says fit went unchecked, and lays out on no edge whatever stock it is handed', () => {
    // A caller handing the judge a sizeless label on a small stock still gets no overrun:
    // the judge draws it edgeless itself. Found by `/code-review high` on #90.
    const onSmallStock = judged({
      labelType: 'us-food',
      data: US_FOOD_CONFORMANT.data,
      stock: { widthMm: 40, heightMm: 40, marginMm: 2 },
      subject: 'described',
      sizeUnstated: true,
    })
    expect(onSmallStock.layout.omissions.filter((o) => /past the|runs off/.test(o.reason))).toEqual(
      [],
    )
    expect(onSmallStock.uncheckable[0]).toEqual({
      elementId: 'label',
      reasons: [{ text: FIT_NOT_CHECKED }],
    })
  })

  it('still asks what a second column counts, without the size', () => {
    // The form rule waits on the size here, with nothing of its own to set aside; its
    // own question about the column's basis must not vanish with it. Found by review.
    const unstated = US_FOOD_FIXTURES.find((f) =>
      f.name.includes('second column says nothing about what it counts'),
    )!
    const small = {
      ...unstated.data,
      container: smallBox,
      nutritionFacts: {
        ...unstated.data.nutritionFacts!,
        availableSurfaceSqInches: 5,
        cannotAccommodateVertical: true,
      },
    } as UsFoodLabelData
    expect(declinedBy(sizeless(small), 'us-food/dual-column-form')?.wants).toEqual([
      'nutritionFacts.columns.basis',
    ])
  })

  it('waits before excusing a second column under (b)(12)(i)(A)', () => {
    // 55 g against a 22 g reference amount is 250 percent, so the package owes a second
    // column unless excused; its panel alone, under 12 in², would excuse it.
    const owed = {
      ...US_FOOD_CONFORMANT.data,
      container: smallBox,
      nutritionFacts: {
        ...panel,
        format: 'tabular' as const,
        availableSurfaceSqInches: 5,
        referenceAmount: { amount: 22, unit: 'g', category: 'Snacks' },
        packageContent: 55,
        packagedAndSoldIndividually: true,
      },
    } as UsFoodLabelData
    const described = sizeless(owed)
    expect(codes(described)).not.toContain('FDA_DUAL_COLUMN_EXEMPT')
    expect(declinedBy(described, 'us-food/dual-column-required')?.wants).toEqual(['stock'])
    // Told the size, it is judged: on a 120 × 240 mm label the package is too big for (A).
    const sized = food(owed, { widthMm: 120, heightMm: 240, marginMm: 6 }, 'described')
    expect(declinedBy(sized, 'us-food/dual-column-required')).toBeUndefined()
  })
})
