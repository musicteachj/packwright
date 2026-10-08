import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import { LayoutError, layOutUpcALabel } from '../layout/engine'
import type { LabelStock } from '../templates/stock'
import type { UpcALabelData } from '../templates/upcA'
import type { Finding } from '../types/index'
import { CONFORMANT_FIXTURE, GS1_RETAIL_FIXTURES } from './fixtures/gs1Retail'
import { layOutGhsLabel } from '../layout/ghsEngine'
import { layOutUsFoodLabel } from '../layout/usFoodEngine'
import { GHS_FIXTURES, HAZARDS } from './fixtures/ghs'
import { US_FOOD_CONFORMANT, US_FOOD_FIXTURES } from './fixtures/usFood'
import {
  GHS_RULES,
  GS1_RETAIL_RULES,
  US_FOOD_RULES,
  declinedChecks,
  listRules,
  runRules,
} from './registry'
import {
  codesOf,
  compareSeverity,
  type Decline,
  type DeclinedFact,
  type RuleContext,
} from './types'
import type { GhsLabelData } from '../templates/ghs'
import type { UsFoodLabelData } from '../templates/usFood'

function findingsFor(data: UpcALabelData, stock: LabelStock): Finding[] {
  const layout = layOutUpcALabel(bwip as never, { data, stock })
  return runRules({ labelType: 'gs1-retail', data, stock, layout })
}

describe('the rule registry', () => {
  it('gives every rule a unique id', () => {
    const ids = GS1_RETAIL_RULES.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every rule a citation with an authority and a reference', () => {
    // The citation is what makes the findings panel credible rather than
    // decorative. A rule without one does not ship.
    for (const rule of listRules()) {
      expect(rule.citation.authority).toBeTruthy()
      expect(rule.citation.reference).toBeTruthy()
      expect(rule.title).toBeTruthy()
    }
  })

  it('declares every code it can emit, so the catalogue is complete', () => {
    // Enforced at runtime by `finding()` too; asserted here so a rule that emits
    // an undeclared code fails in the suite rather than in front of a user.
    const all = findingsFor(CONFORMANT_FIXTURE.data, CONFORMANT_FIXTURE.stock)
    const declared = new Set(GS1_RETAIL_RULES.flatMap((rule) => codesOf(rule)))
    for (const finding of all) expect(declared).toContain(finding.code)
  })
})

describe('known-bad labels produce the expected finding', () => {
  for (const fixture of GS1_RETAIL_FIXTURES) {
    it(`${fixture.name} — ${fixture.defect}`, () => {
      const findings = findingsFor(fixture.data, fixture.stock)
      const match = findings.find((f) => f.code === fixture.expected.code)

      expect(match, `no ${fixture.expected.code} finding was produced`).toBeDefined()
      expect(match!.severity).toBe(fixture.expected.severity)
      // The exact clause, not merely "a citation". A finding carrying the wrong
      // reference is worse than no finding: it reads as authority.
      expect(match!.citation.reference).toBe(fixture.expected.citation)
      expect(match!.message.length).toBeGreaterThan(0)
    })
  }
})

describe('a conformant label', () => {
  const findings = findingsFor(CONFORMANT_FIXTURE.data, CONFORMANT_FIXTURE.stock)

  it('produces nothing but passes', () => {
    // A rule set that fires on a conformant label is as useless as one that
    // never fires.
    const failures = findings.filter((f) => f.severity !== 'pass')
    expect(failures).toEqual([])
  })

  it('runs every rule in the registry', () => {
    // Each rule contributes at least one pass, so "6 checks passed" is evidence
    // that six checks ran rather than that six rules exist.
    expect(findings.length).toBeGreaterThanOrEqual(GS1_RETAIL_RULES.length)
    const codes = new Set(findings.map((f) => f.code))
    for (const rule of GS1_RETAIL_RULES) {
      expect(
        codesOf(rule).some((code) => codes.has(code)),
        `${rule.id} did not run`,
      ).toBe(true)
    }
  })
})

describe('a rule that could not run says nothing', () => {
  it('reports no Digital Link finding when none is configured', () => {
    // Distinct from a pass. Sunrise 2027 is a transition, not a deadline that
    // has passed, and a label without a Digital Link has not cleared a check.
    const findings = findingsFor({ gtin: '036000291452' }, CONFORMANT_FIXTURE.stock)
    expect(findings.filter((f) => f.code.startsWith('GS1_DIGITAL_LINK'))).toEqual([])
  })

  it('measures no geometry when the GTIN could not be encoded', () => {
    // No symbol was drawn, so there is nothing to measure. Reporting the quiet
    // zone as clear would be the exact false reassurance this project avoids.
    const findings = findingsFor({ gtin: '036000291453' }, CONFORMANT_FIXTURE.stock)
    const codes = findings.map((f) => f.code)
    expect(codes).toContain('GS1_GTIN_CHECK_DIGIT_INVALID')
    expect(codes.filter((c) => c.startsWith('GS1_QUIET_ZONE'))).toEqual([])
    expect(codes.filter((c) => c.startsWith('GS1_BAR_HEIGHT'))).toEqual([])
  })
})

describe('a symbol with artwork printed through it', () => {
  // The review finding this closes: six passes and no findings, on a barcode
  // with a block of ink through the middle of it.
  const overprinted = {
    gtin: '036000291452',
    artwork: { text: 'X', anchor: 'centre', widthMm: 6, heightMm: 6 },
  } as const

  it('is not certified as having clear quiet zones', () => {
    const findings = findingsFor(overprinted, CONFORMANT_FIXTURE.stock)
    expect(findings.filter((f) => f.code.startsWith('GS1_QUIET_ZONE'))).toEqual([])
  })

  it('is recorded on the resolved symbol so the editor can say so', () => {
    const layout = layOutUpcALabel(bwip as never, {
      data: overprinted,
      stock: CONFORMANT_FIXTURE.stock,
    })
    expect(layout.symbols[0]!.overprintedBy).toEqual(['artwork-block'])
  })

  it('still reports the checks that overprinting does not invalidate', () => {
    // Declining to certify the quiet zone is not declining to check anything —
    // the check digit and the magnification are unaffected by where artwork sits.
    const codes = findingsFor(overprinted, CONFORMANT_FIXTURE.stock).map((f) => f.code)
    expect(codes).toContain('GS1_GTIN_CHECK_DIGIT_VALID')
    expect(codes).toContain('GS1_MAGNIFICATION_IN_RANGE')
  })
})

describe('declining to certify never silences a violation', () => {
  // The regression the first round of fixes introduced: suppressing the whole
  // symbol when it was overprinted also suppressed real, measured violations.
  it('reports a quiet zone of zero even on an overprinted symbol', () => {
    const findings = findingsFor(
      {
        gtin: '036000291452',
        artwork: { text: 'ACME', anchor: 'bottom-left', widthMm: 20, heightMm: 4 },
      },
      CONFORMANT_FIXTURE.stock,
    )
    expect(findings.map((f) => f.code)).toContain('GS1_QUIET_ZONE_TOO_NARROW')
  })

  it('withholds only the pass, never the finding', () => {
    const findings = findingsFor(
      { gtin: '036000291452', artwork: { text: 'X', anchor: 'centre', widthMm: 6, heightMm: 6 } },
      CONFORMANT_FIXTURE.stock,
    )
    expect(findings.filter((f) => f.code === 'GS1_QUIET_ZONE_CLEAR')).toEqual([])
    expect(findings.filter((f) => f.severity !== 'pass')).toEqual([])
  })

  it('does not treat artwork level with the printed digits as an overprint', () => {
    // The overprint band is the bar ink, not the whole drawn height. Measuring
    // it against the human-readable strip is what made the suppression fire on
    // a label whose bars nothing touched.
    const layout = layOutUpcALabel(bwip as never, {
      data: {
        gtin: '036000291452',
        artwork: { text: 'ACME', anchor: 'bottom-left', widthMm: 20, heightMm: 4 },
      },
      stock: CONFORMANT_FIXTURE.stock,
    })
    expect(layout.symbols[0]!.overprintedBy).toEqual([])
  })
})

describe('a symbol drawn off the stock', () => {
  it('is not certified as having clear quiet zones', () => {
    // Nothing measured vertical containment, so this reported six passes.
    const stock = { widthMm: 100, heightMm: 20, marginMm: 3 }
    const findings = findingsFor({ gtin: '036000291452' }, stock)
    expect(findings.filter((f) => f.code.startsWith('GS1_QUIET_ZONE'))).toEqual([])
  })

  it('records how far it overflows', () => {
    const stock = { widthMm: 100, heightMm: 20, marginMm: 3 }
    const layout = layOutUpcALabel(bwip as never, { data: { gtin: '036000291452' }, stock })
    expect(layout.symbols[0]!.verticalOverflowMm).toBeGreaterThan(0)
  })

  it('is zero for a symbol that fits', () => {
    const layout = layOutUpcALabel(bwip as never, {
      data: { gtin: '036000291452' },
      stock: CONFORMANT_FIXTURE.stock,
    })
    expect(layout.symbols[0]!.verticalOverflowMm).toBe(0)
  })
})

describe('a symbol drawn off the stock is recorded as not printed in full', () => {
  // Measured since phase 3 and read by the quiet-zone rule alone, so bar height
  // and the digits still cleared on a symbol half off its label. Now an omission,
  // which withholds every pass measured off the symbol and leaves the check
  // digit, a fact about the number, standing.
  const layoutOn = (data: UpcALabelData, stock: LabelStock) =>
    layOutUpcALabel(bwip as never, { data, stock })
  const symbolOmissions = (data: UpcALabelData, stock: LabelStock) =>
    layoutOn(data, stock).omissions.filter((omission) => omission.elementId === 'upca-symbol')
  const passesOnTheSymbol = (data: UpcALabelData, stock: LabelStock) =>
    findingsFor(data, stock)
      .filter((f) => f.severity === 'pass' && f.elementId === 'upca-symbol')
      .map((f) => f.code)

  it('withholds everything measured off a symbol running past both edges of a short label', () => {
    const stock = { widthMm: 100, heightMm: 20, marginMm: 3 }
    const omissions = symbolOmissions({ gtin: '036000291452' }, stock)

    expect(omissions.map((o) => o.scope)).toEqual(['detail'])
    expect(omissions[0]!.reason).toContain('past the top')
    expect(omissions[0]!.reason).toContain('past the bottom')
    expect(passesOnTheSymbol({ gtin: '036000291452' }, stock)).toEqual([
      'GS1_GTIN_CHECK_DIGIT_VALID',
    ])
  })

  it('names only the edge it runs past', () => {
    // Anchored to the bottom of a 20 mm label, the symbol rises past the top alone.
    const stock = { widthMm: 100, heightMm: 20, marginMm: 3 }
    const [omission] = symbolOmissions(
      { gtin: '036000291452', symbolPlacement: 'bottom-left' },
      stock,
    )
    expect(omission!.reason).toContain('past the top')
    expect(omission!.reason).not.toContain('past the bottom')
  })

  it('records bars running past the right edge', () => {
    // Anchored top-left on a 36 mm label, the 31.35 mm of bars begin after the
    // margin and the quiet zone and end past the edge.
    const stock = { widthMm: 36, heightMm: 40, marginMm: 3 }
    const [omission] = symbolOmissions({ gtin: '036000291452', symbolPlacement: 'top-left' }, stock)
    expect(omission!.reason).toContain('past the right edge')
    expect(omission!.reason).not.toContain('past the left edge')
  })

  it('records a digit cut off by the edge while every bar prints', () => {
    // The first digit sits in the left quiet zone. On a 33 mm label with no margin
    // the centred bars fit and the digit beside them does not.
    const stock = { widthMm: 33, heightMm: 40, marginMm: 0 }
    const layout = layoutOn({ gtin: '036000291452' }, stock)
    const symbol = layout.symbols[0]!

    expect(symbol.xMm, 'the premise: the bars start on the label').toBeGreaterThanOrEqual(0)
    expect(symbol.xMm + symbol.barPatternWidthMm, 'and end on it').toBeLessThanOrEqual(33)
    const [omission] = symbolOmissions({ gtin: '036000291452' }, stock)
    expect(omission!.reason).toContain('past the left edge')
    expect(passesOnTheSymbol({ gtin: '036000291452' }, stock)).not.toContain('GS1_HRI_PRESENT')
  })

  // A margin wider than the stock let an anchor place the symbol wholly outside the
  // label, and filed as a detail it exported empty. The engine recorded it as absent
  // after that; it now refuses the stock, because no panel is left between the
  // margins, so an empty label never resolves. One case per side, each outside on
  // that side alone, so a check on only one dimension would fail two of them.
  it.each([
    ['right', 'top-left', { widthMm: 60, heightMm: 200, marginMm: 65 }],
    ['left', 'top-right', { widthMm: 60, heightMm: 200, marginMm: 65 }],
    ['bottom', 'top-centre', { widthMm: 200, heightMm: 60, marginMm: 65 }],
    ['top', 'bottom-centre', { widthMm: 200, heightMm: 60, marginMm: 65 }],
  ] as const)(
    'refuses the stock that placed a symbol wholly past the %s of the label',
    (_side, symbolPlacement, stock) => {
      const data = { gtin: '036000291452', symbolPlacement }
      expect(() => layoutOn(data, stock)).toThrow(LayoutError)
    },
  )

  it('records nothing for a symbol that fits', () => {
    expect(symbolOmissions({ gtin: '036000291452' }, CONFORMANT_FIXTURE.stock)).toEqual([])
    expect(
      symbolOmissions({ gtin: '036000291452' }, { widthMm: 37.29, heightMm: 40, marginMm: 3 }),
      'nor for one on stock exactly its own footprint wide',
    ).toEqual([])
  })

  it('records nothing for a symbol on a label typed to its exact height', () => {
    // A review found it: the drawn height is 22.160000000000004 mm at 0.8x, so a
    // 22.16 mm label read as an overrun of float noise on both edges, withholding
    // every pass on a symbol that printed whole.
    for (const [magnification, heightMm] of [
      [0.8, 22.16],
      [1.1, 30.47],
      [1.5, 41.55],
    ] as const) {
      const stock = { widthMm: 80, heightMm, marginMm: 0 }
      const data = { gtin: '036000291452', magnification }
      expect(symbolOmissions(data, stock), `${magnification}x on ${heightMm} mm`).toEqual([])
      expect(layoutOn(data, stock).symbols[0]!.verticalOverflowMm, 'nor measures it').toBe(0)
    }
  })

  it('states an overrun just past the tolerance without rounding it to nothing', () => {
    // 4 µm short of the symbol, centred, so 2 µm over each edge — past the 1 µm
    // tolerance, so recorded, and the message must not read "0.00 mm".
    const [omission] = symbolOmissions(
      { gtin: '036000291452', magnification: 0.8 },
      { widthMm: 80, heightMm: 22.156, marginMm: 0 },
    )
    expect(omission!.reason).toContain('0.002 mm past the top')
    expect(omission!.reason).toContain('0.002 mm past the bottom')
    expect(omission!.reason).not.toContain('0.00 mm past')
  })
})

describe('measurements compared with a tolerance', () => {
  it('does not fault a quiet zone that is exactly the minimum', () => {
    // 37.29 mm stock is exactly the 113-module footprint. The two sides reach
    // 2.97 mm by different arithmetic, so one landed a fraction under and
    // produced "measures 2.97 mm; requires 2.97 mm" — a violation contradicting
    // its own message, under a real GS1 citation.
    const findings = findingsFor(
      { gtin: '036000291452' },
      { widthMm: 37.29, heightMm: 40, marginMm: 3 },
    )
    expect(findings.filter((f) => f.code === 'GS1_QUIET_ZONE_TOO_NARROW')).toEqual([])
    expect(findings.filter((f) => f.code === 'GS1_QUIET_ZONE_CLEAR')).toHaveLength(2)
  })
})

describe('a Digital Link needs a resolvable address', () => {
  it.each(['', 'not a url', 'javascript:alert(1)', 'id.example.com'])(
    'faults the resolver domain %o',
    (domain) => {
      // `buildDigitalLinkUri` never inspects the domain, so "it did not throw"
      // was being reported as a green pass.
      const findings = findingsFor(
        { gtin: '036000291452', digitalLink: { domain } },
        CONFORMANT_FIXTURE.stock,
      )
      expect(findings.map((f) => f.code)).toContain('GS1_DIGITAL_LINK_INVALID')
      expect(findings.map((f) => f.code)).not.toContain('GS1_DIGITAL_LINK_VALID')
    },
  )

  it('does not count a URI it simultaneously faults as a check that passed', () => {
    const findings = findingsFor(
      {
        gtin: '036000291452',
        digitalLink: { domain: 'https://id.example.com', useConvenienceAlphas: true },
      },
      CONFORMANT_FIXTURE.stock,
    )
    expect(findings.map((f) => f.code)).toContain('GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS')
    expect(findings.map((f) => f.code)).not.toContain('GS1_DIGITAL_LINK_VALID')
  })
})

describe('a rule does not blame another rule’s defect', () => {
  it('says nothing about the Digital Link when the GTIN itself is wrong', () => {
    // `buildDigitalLinkUri` throws on a bad check digit, which produced a second
    // finding blaming the URI for a fault in the identifier it is built from.
    const findings = findingsFor(
      { gtin: '036000291453', digitalLink: { domain: 'https://id.example.com' } },
      CONFORMANT_FIXTURE.stock,
    )
    expect(findings.map((f) => f.code)).toEqual(['GS1_GTIN_CHECK_DIGIT_INVALID'])
  })

  it('still reports a Digital Link that is genuinely malformed', () => {
    const findings = findingsFor(
      { gtin: '036000291452', digitalLink: { domain: 'https://id.example.com', expiry: '2612' } },
      CONFORMANT_FIXTURE.stock,
    )
    expect(findings.map((f) => f.code)).toContain('GS1_DIGITAL_LINK_INVALID')
  })
})

describe('findings point at geometry', () => {
  it('carries the element id, so a finding can highlight the canvas', () => {
    const [fixture] = GS1_RETAIL_FIXTURES.filter((f) => f.name.includes('quiet zone'))
    const findings = findingsFor(fixture!.data, fixture!.stock)
    const match = findings.find((f) => f.code === fixture!.expected.code)
    expect(match!.elementId).toBe('upca-symbol')
  })

  it('states the measurement against the requirement', () => {
    const findings = findingsFor(
      { gtin: '036000291452', barHeightMm: 10 },
      CONFORMANT_FIXTURE.stock,
    )
    const match = findings.find((f) => f.code === 'GS1_BAR_HEIGHT_BELOW_MINIMUM')
    expect(match!.measurement).toEqual({ actual: '10.00 mm', required: '22.85 mm' })
  })
})

describe('measurements read as measurements', () => {
  it('reports a centred symbol’s quiet zones symmetrically', () => {
    // 14.325 mm either side, exactly. In binary one side lands a fraction above
    // and the other a fraction below, and they straddle the boundary that
    // two-decimal rounding turns on — so this read back "14.33 / 14.32" for a
    // label symmetric to the micrometre.
    const findings = findingsFor({ gtin: '036000291452' }, CONFORMANT_FIXTURE.stock)
    const zones = findings.filter((f) => f.code === 'GS1_QUIET_ZONE_CLEAR')
    const measured = zones.map((f) => f.message.match(/is ([\d.]+) mm/)![1])
    expect(measured[0]).toBe(measured[1])
  })

  it('quotes an X-dimension to three places', () => {
    // The permitted range spans 0.264 to 0.660 mm, so two places cannot tell
    // 0.264 from 0.26 — a tenth of the whole range hidden by the format.
    const findings = findingsFor(
      { gtin: '036000291452', magnification: 0.8 },
      CONFORMANT_FIXTURE.stock,
    )
    const match = findings.find((f) => f.code === 'GS1_MAGNIFICATION_IN_RANGE')
    expect(match!.message).toContain('X = 0.264 mm')
  })
})

describe('compareSeverity', () => {
  it('sorts most severe first and passes last', () => {
    const sorted = ['pass', 'advisory', 'blocking', 'guidance', 'violation'].sort((a, b) =>
      compareSeverity(a as never, b as never),
    )
    expect(sorted).toEqual(['blocking', 'violation', 'advisory', 'guidance', 'pass'])
  })
})

describe('the registry runs the rules for the document’s own label type', () => {
  const ghsStock = { widthMm: 74, heightMm: 105, marginMm: 4 }
  const ghsData = {
    regime: 'eu-clp' as const,
    productIdentifier: 'Acetone',
    capacityL: 5,
    pictograms: ['GHS02'],
  } as const

  it('runs the GHS rules, and only those, against a chemical label', () => {
    const layout = layOutGhsLabel({ data: { ...ghsData }, stock: ghsStock })
    const findings = runRules({
      labelType: 'ghs-chemical',
      data: { ...ghsData },
      stock: ghsStock,
      layout,
    })

    // An earlier version of this test asserted both of these were empty, which
    // was true and useless: the rules existed as files but were never added to
    // the registry, so they compiled, never ran, and the suite stayed green
    // while nothing was being checked. Asserting they are non-empty is what
    // makes that state impossible to reach again.
    expect(GHS_RULES.length).toBeGreaterThan(0)
    expect(findings.length).toBeGreaterThan(0)

    // Every finding came from a GHS rule; no GS1 rule quietly no-opped its way
    // into reporting on a chemical label.
    const gs1Codes = new Set(GS1_RETAIL_RULES.flatMap((rule) => codesOf(rule)))
    expect(findings.filter((f) => gs1Codes.has(f.code))).toEqual([])
  })

  it('declares a label type on every rule, so none can no-op on the wrong document', () => {
    for (const rule of listRules()) {
      expect(rule.appliesTo, `${rule.id} declares no label type`).toBeDefined()
    }
    expect(GS1_RETAIL_RULES.every((rule) => rule.appliesTo === 'gs1-retail')).toBe(true)
  })

  it('filters the catalogue by label type, and lists everything without one', () => {
    expect(listRules('gs1-retail')).toHaveLength(GS1_RETAIL_RULES.length)
    expect(listRules('ghs-chemical')).toHaveLength(GHS_RULES.length)
    expect(listRules('us-food')).toHaveLength(US_FOOD_RULES.length)
    expect(listRules()).toHaveLength(
      GS1_RETAIL_RULES.length + GHS_RULES.length + US_FOOD_RULES.length,
    )
  })
})

describe('a rule that stands down says so, and only then', () => {
  // `declines` exists because an empty `check` is silence, and silence beside a
  // clean report reads as approval. Two invariants keep it honest: a rule cannot
  // both judge and stand down, and a decline must name something worth telling
  // somebody. Asserted over every fixture and every rule rather than per rule, so
  // a rule that gains a `declines` later is covered the day it does.
  const usFood = US_FOOD_FIXTURES.map((fixture) => ({
    name: fixture.name,
    rules: US_FOOD_RULES,
    context: {
      labelType: 'us-food' as const,
      data: fixture.data,
      stock: fixture.stock,
      layout: layOutUsFoodLabel({ data: fixture.data, stock: fixture.stock }),
    },
  }))
  const ghs = GHS_FIXTURES.map((fixture) => ({
    name: fixture.name,
    rules: GHS_RULES,
    context: {
      labelType: 'ghs-chemical' as const,
      data: fixture.data,
      stock: fixture.stock,
      layout: layOutGhsLabel({ data: fixture.data, stock: fixture.stock }),
    },
  }))
  const everyCase = [...usFood, ...ghs]

  it.each(everyCase.map((one) => [one.name, one] as const))(
    'never both judges and stands down: %s',
    (_name, { rules, context }) => {
      for (const rule of rules) {
        const judged = rule.check(context as never).length > 0
        const stoodDown = rule.declines?.(context as never) !== undefined
        expect(judged && stoodDown, `${rule.id} did both`).toBe(false)
      }
    },
  )

  it('gives every stood-down check a reason, a title and a citation', () => {
    for (const { name, context } of everyCase) {
      for (const declined of declinedChecks(context)) {
        expect(declined.reason.length, `${declined.ruleId} on ${name}`).toBeGreaterThan(20)
        expect(declined.citation.reference, declined.ruleId).toBeTruthy()
        expect(declined.title, declined.ruleId).toBeTruthy()
      }
    }
  })

  it('says nothing where it judged the unit and could not judge the package', () => {
    // The edge the invariant above exists for, and no fixture reaches it: a unit
    // content in the band gives (b)(2)(i)(D) its answer and `check` reports a
    // missing column, while (b)(12)(i) stays undetermined for want of a package
    // content. The rule judged, so it must not also stand down — a report saying
    // both "you owe a column" and "this was not checked" is worse than either.
    const base = US_FOOD_CONFORMANT
    const data = {
      ...base.data,
      nutritionFacts: {
        ...base.data.nutritionFacts!,
        availableSurfaceSqInches: 60,
        referenceAmount: { amount: 40, unit: 'g' as const, category: 'Breakfast cereals' },
        unitContent: 100,
      },
    }
    const context = {
      labelType: 'us-food' as const,
      data,
      stock: base.stock,
      layout: layOutUsFoodLabel({ data, stock: base.stock }),
    }

    expect(
      runRules(context).map((finding) => finding.code),
      'premise: (b)(2)(i)(D) was answered and reported',
    ).toContain('FDA_DUAL_COLUMN_MISSING')
    expect(declinedChecks(context).map((one) => one.ruleId)).not.toContain(
      'us-food/dual-column-required',
    )
  })

  it('stands the dual-column check down until the label states what it turns on', () => {
    const conformant = US_FOOD_CONFORMANT
    const context = {
      labelType: 'us-food' as const,
      data: conformant.data,
      stock: conformant.stock,
      layout: layOutUsFoodLabel({ data: conformant.data, stock: conformant.stock }),
    }
    const declined = declinedChecks(context).find(
      (one) => one.ruleId === 'us-food/dual-column-required',
    )
    expect(declined, 'the conformant label states no reference amount').toBeDefined()
    expect(declined!.reason).toContain('reference amount')
    expect(declined!.citation.reference).toBe('21 CFR 101.9(b)(12)(i)')
  })
})

describe('a decline that is a limit of the tool', () => {
  it('cannot name a fact to state, by its type', () => {
    // Held by the compiler, not by a fixture reaching it: if a limit naming a fact
    // ever compiles, this directive goes unused and the typecheck fails.
    // @ts-expect-error — a limit has nothing for the user to state
    const wrong: Decline = { reason: 'A limit.', wants: ['hazards'], limit: true }
    expect(wrong.limit).toBe(true)
  })
})

/**
 * What a check that stood down asks for, held to its word.
 *
 * `Decline.reason` promises that doing what it says makes the check run, and
 * nothing enforced it. Designing the test below is what found it broken: for a
 * second column counting the individual unit, two rules told a user to state
 * the reference amount, the package content and whether it is sold
 * individually — and (b)(2)(i)(D) turns on the reference amount and the *unit*
 * content, so a user who did exactly that was left with a check still standing
 * down. The facts are now named in the data, and this states them and watches.
 */
describe('a check that stood down names what would let it run', () => {
  const foodBase = US_FOOD_CONFORMANT
  const foodPanel = foodBase.data.nutritionFacts!
  const food = (name: string, panel: Partial<NonNullable<UsFoodLabelData['nutritionFacts']>>) => ({
    name,
    data: { ...foodBase.data, nutritionFacts: { ...foodPanel, ...panel } } as UsFoodLabelData,
  })

  /** Ingredients with the percentages at `blank` taken away, as a cleared box leaves them. */
  const unweighed = (name: string, blank: readonly number[], threshold?: number) => ({
    name,
    data: {
      ...foodBase.data,
      ...(threshold === undefined
        ? {}
        : { ingredientThreshold: { count: threshold, percent: 2 as const } }),
      ingredients: (foodBase.data.ingredients ?? []).map((ingredient, index) => {
        if (!blank.includes(index)) return { ...ingredient }
        const { percentByWeight: _taken, ...rest } = ingredient
        return rest
      }),
    } as UsFoodLabelData,
  })

  /** The shapes no fixture reaches, one per declining branch the fixtures miss. */
  const constructed = [
    food('a package owing both additional columns, drawing one', {
      availableSurfaceSqInches: 60,
      referenceAmount: { amount: 40, unit: 'g', category: 'Breakfast cereals' },
      packageContent: 100,
      unitContent: 100,
      packagedAndSoldIndividually: true,
      columns: {
        mode: 'dual',
        basis: 'per-container',
        headings: ['Per serving', 'Per container'],
        secondAmounts: { ...foodPanel.amounts },
      },
    }),
    unweighed('an ingredient whose percentage was never stated', [1]),
    unweighed('a grouped ingredient whose percentage was never stated', [3], 2),
    food('a second column that does not say what it counts', {
      columns: {
        mode: 'dual',
        headings: ['Per serving', 'Per container'],
        secondAmounts: { ...foodPanel.amounts },
      },
    }),
    food('a per-unit column whose duty turns on a unit content nobody stated', {
      availableSurfaceSqInches: 60,
      referenceAmount: { amount: 40, unit: 'g', category: 'Breakfast cereals' },
      packagedAndSoldIndividually: false,
      columns: {
        mode: 'dual',
        basis: 'per-unit',
        headings: ['Per serving', 'Per unit'],
        secondAmounts: { 'total-fat': 7.5 },
        separated: false,
      },
    }),
    food('a per-container column whose duty turns on a package content nobody stated', {
      availableSurfaceSqInches: 60,
      referenceAmount: { amount: 40, unit: 'g', category: 'Breakfast cereals' },
      columns: {
        mode: 'dual',
        basis: 'per-container',
        headings: ['Per serving', 'Per container'],
        secondAmounts: { 'total-fat': 7.5 },
        separated: false,
      },
    }),
    food('a toddler food whose second column carries protein and says nothing of what it counts', {
      representedFor: 'children-1-through-3',
      declaredPercentDv: { ...foodPanel.declaredPercentDv, protein: 38 },
      columns: {
        mode: 'dual',
        headings: ['Per serving', 'Per container'],
        secondAmounts: { ...foodPanel.amounts },
      },
    }),
    food('a toddler food whose per-unit column carries protein, unit content unstated', {
      representedFor: 'children-1-through-3',
      declaredPercentDv: { ...foodPanel.declaredPercentDv, protein: 38 },
      referenceAmount: { amount: 40, unit: 'g', category: 'Breakfast cereals' },
      packagedAndSoldIndividually: false,
      columns: {
        mode: 'dual',
        basis: 'per-unit',
        headings: ['Per serving', 'Per unit'],
        secondAmounts: { ...foodPanel.amounts },
      },
    }),
  ]

  const contextOf = (labelType: 'us-food' | 'ghs-chemical', data: unknown, stock: LabelStock) =>
    labelType === 'us-food'
      ? ({
          labelType,
          data: data as UsFoodLabelData,
          stock,
          layout: layOutUsFoodLabel({ data: data as UsFoodLabelData, stock }),
        } satisfies RuleContext)
      : ({
          labelType,
          data: data as GhsLabelData,
          stock,
          layout: layOutGhsLabel({ data: data as GhsLabelData, stock }),
        } satisfies RuleContext)

  const cases = [
    ...US_FOOD_FIXTURES.map((f) => ({
      name: f.name,
      labelType: 'us-food' as const,
      data: f.data as unknown,
      stock: f.stock,
    })),
    ...constructed.map((c) => ({ ...c, labelType: 'us-food' as const, stock: foodBase.stock })),
    ...GHS_FIXTURES.map((f) => ({
      name: f.name,
      labelType: 'ghs-chemical' as const,
      data: f.data as unknown,
      stock: f.stock,
    })),
  ]

  /** Whether the label has already stated a fact — never asked for twice. */
  const stated = (data: unknown, fact: DeclinedFact): boolean => {
    const figure = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value > 0
    const ghs = data as GhsLabelData
    const panel = (data as UsFoodLabelData).nutritionFacts
    switch (fact) {
      case 'hazards':
        return (ghs.hazards ?? []).length > 0
      case 'ingredients.percentByWeight':
        return ((data as UsFoodLabelData).ingredients ?? []).every(
          (ingredient) => ingredient.percentByWeight !== undefined,
        )
      case 'nutritionFacts.referenceAmount':
        return figure(panel?.referenceAmount?.amount)
      case 'nutritionFacts.packageContent':
        return figure(panel?.packageContent)
      case 'nutritionFacts.unitContent':
        return figure(panel?.unitContent)
      case 'nutritionFacts.packagedAndSoldIndividually':
        return panel?.packagedAndSoldIndividually !== undefined
      case 'nutritionFacts.columns.basis':
        return panel?.columns?.basis !== undefined
    }
  }

  /** A valid answer to each fact, as a user filling the field would give one. */
  const state = (data: unknown, fact: DeclinedFact): unknown => {
    if (fact === 'hazards') return { ...(data as GhsLabelData), hazards: [HAZARDS.flammableLiquid] }
    const label = data as UsFoodLabelData
    if (fact === 'ingredients.percentByWeight') {
      // Each blank takes the figure above it, so a run the stated figures kept in
      // order stays in order — the answer a user filling the boxes in would give.
      let above = 100
      const ingredients = (label.ingredients ?? []).map((ingredient) => {
        above = ingredient.percentByWeight ?? above
        return { ...ingredient, percentByWeight: above }
      })
      return { ...label, ingredients }
    }
    const panel = label.nutritionFacts!
    const answer: Record<
      Exclude<DeclinedFact, 'hazards' | 'ingredients.percentByWeight'>,
      object
    > = {
      'nutritionFacts.referenceAmount': {
        referenceAmount: { amount: 40, unit: 'g', category: 'Breakfast cereals' },
      },
      'nutritionFacts.packageContent': { packageContent: 100 },
      'nutritionFacts.unitContent': { unitContent: 100 },
      'nutritionFacts.packagedAndSoldIndividually': { packagedAndSoldIndividually: true },
      'nutritionFacts.columns.basis': { columns: { ...panel.columns!, basis: 'per-container' } },
    }
    return { ...label, nutritionFacts: { ...panel, ...answer[fact] } }
  }

  it('names at least one fact, and never one the label already states', () => {
    for (const one of cases) {
      const context = contextOf(one.labelType, one.data, one.stock)
      for (const declined of declinedChecks(context)) {
        // A limit of the tool names nothing, because there is nothing to state — and
        // says whose limit it is, so the silence beside it is not read as the label's.
        if (declined.limit === true) {
          expect(declined.wants, `${declined.ruleId} on ${one.name}`).toEqual([])
          expect(declined.reason).toContain('a limit of this tool')
          continue
        }
        expect(
          declined.wants.length,
          `${declined.ruleId} on ${one.name} names nothing`,
        ).toBeGreaterThan(0)
        for (const fact of declined.wants) {
          expect(
            stated(one.data, fact),
            `${declined.ruleId} on ${one.name} asks again for ${fact}`,
          ).toBe(false)
        }
      }
    }
  })

  it('runs once the label states what it was asked for', () => {
    // Followed to the end, because one answer can turn a decline into a
    // different one — stating what a column counts can leave its duty to be
    // determined — and the promise is about where following leads.
    //
    // **Asserted on the rule standing down, not on the asks running out.** The
    // first version ended when `wants` was empty and then asserted it was, so a
    // decline that asked for nothing passed by never entering the loop — which
    // is exactly the decline that cannot be followed.
    for (const one of cases) {
      for (const first of declinedChecks(contextOf(one.labelType, one.data, one.stock)).filter(
        // A limit of the tool promises nothing to follow; the test above holds it to that.
        (declined) => declined.limit !== true,
      )) {
        let data = one.data
        let asked: readonly DeclinedFact[] = first.wants
        const path: string[] = []
        for (let step = 0; step < 4 && asked.length > 0; step += 1) {
          for (const fact of asked) data = state(data, fact)
          path.push(asked.join(' + '))
          asked =
            declinedChecks(contextOf(one.labelType, data, one.stock)).find(
              (d) => d.ruleId === first.ruleId,
            )?.wants ?? []
        }
        const still = declinedChecks(contextOf(one.labelType, data, one.stock)).find(
          (d) => d.ruleId === first.ruleId,
        )
        expect(
          still,
          `${first.ruleId} on ${one.name} still stands down after ${path.join(' then ') || 'being asked for nothing'}`,
        ).toBeUndefined()
      }
    }
  })

  it('tells a per-unit column’s author to state the unit, not the package', () => {
    // The defect the properties above were written to catch, pinned in the
    // words a user reads. The instruction is built from `wants`, so this also
    // holds the prose to the links beneath it.
    const perUnit = constructed.find((c) => c.name.startsWith('a per-unit column'))!
    const declined = declinedChecks(contextOf('us-food', perUnit.data, foodBase.stock)).find(
      (d) => d.ruleId === 'us-food/dual-column-form',
    )!
    expect(declined.wants).toEqual(['nutritionFacts.unitContent'])
    expect(declined.reason).toContain(
      'State what one individual unit holds and this check will run.',
    )
    expect(declined.reason).toContain('101.9(b)(2)(i)(D)')
    expect(declined.reason, 'the package provision is not this column’s').not.toContain(
      '(b)(12)(i)',
    )
    expect(declined.reason).not.toContain('what the whole package holds')
  })

  it('reaches every rule that can stand down, so neither property above passes for want of a case', () => {
    const reached = new Set(
      cases.flatMap((one) =>
        declinedChecks(contextOf(one.labelType, one.data, one.stock)).map((d) => d.ruleId),
      ),
    )
    const declaring = [...US_FOOD_RULES, ...GHS_RULES]
      .filter((rule) => rule.declines !== undefined)
      .map((r) => r.id)
    expect([...reached].sort()).toEqual([...declaring].sort())
  })
})
