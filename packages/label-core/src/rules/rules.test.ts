import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import { layOutUpcALabel } from '../layout/engine'
import type { LabelStock } from '../templates/stock'
import type { UpcALabelData } from '../templates/upcA'
import type { Finding } from '../types/index'
import { CONFORMANT_FIXTURE, GS1_RETAIL_FIXTURES } from './fixtures/gs1Retail'
import { layOutGhsLabel } from '../layout/ghsEngine'
import { GHS_RULES, GS1_RETAIL_RULES, listRules, runRules } from './registry'
import { compareSeverity } from './types'

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
    const declared = new Set(GS1_RETAIL_RULES.flatMap((rule) => rule.codes))
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
        rule.codes.some((code) => codes.has(code)),
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
    const gs1Codes = new Set(GS1_RETAIL_RULES.flatMap((rule) => rule.codes))
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
    expect(listRules()).toHaveLength(GS1_RETAIL_RULES.length + GHS_RULES.length)
  })
})
