import { describe, expect, it } from 'vitest'
import { layOutGhsLabel } from '../layout/ghsEngine'
import { GHS_CONFORMANT, GHS_FIXTURES, HAZARDS } from './fixtures/ghs'
import { GHS_PICTOGRAM_PRECEDENCE_OPTIONAL, GHS_PICTOGRAM_SYMBOL_MISSING } from './index'
import { GHS_RULES, runRules } from './registry'
import type { GhsLabelData } from '../templates/ghs'
import type { LabelStock } from '../templates/stock'

const findingsFor = (data: GhsLabelData, stock: LabelStock) =>
  runRules({ labelType: 'ghs-chemical', data, stock, layout: layOutGhsLabel({ data, stock }) })

describe('every GHS rule ships with a label that provokes it', () => {
  it.each(GHS_FIXTURES.map((f) => [f.name, f] as const))('%s', (_name, fixture) => {
    const findings = findingsFor(fixture.data, fixture.stock)
    const match = findings.find((f) => f.code === fixture.expected.code)

    expect(match, `${fixture.defect}\nGot: ${findings.map((f) => f.code).join(', ')}`).toBeDefined()
    expect(match!.severity).toBe(fixture.expected.severity)
    // The citation is asserted exactly. These rules cite two regulators, so the
    // reference is what separates a correct verdict from one under the wrong law.
    expect(match!.citation.reference).toBe(fixture.expected.citation)
  })

  it('declares a fixture for every code a rule can emit as a failure', () => {
    const covered = new Set(GHS_FIXTURES.map((f) => f.expected.code))
    const uncovered = GHS_RULES.flatMap((rule) => rule.codes).filter(
      (code) =>
        !covered.has(code) &&
        // Pass codes and the advisory-only precedence code are not failures.
        !/_MET$|_SINGLE$|_COMPLETE$|_OPTIONAL$|_MATCHES$|_AVAILABLE$/.test(code),
    )
    expect(uncovered, 'these failure codes have no known-bad fixture').toEqual([])
  })
})

describe('the conformant control', () => {
  const findings = findingsFor(GHS_CONFORMANT.data, GHS_CONFORMANT.stock)

  it('raises nothing but the missing pictogram symbols', () => {
    const failures = findings.filter((f) => f.severity !== 'pass' && f.severity !== 'guidance')
    // The engine cannot draw a clean label yet: the Annex V specimen artwork is
    // unverified, so every frame is empty. Under CLP that is a violation rather
    // than blocking, and it is the only thing this label should raise.
    expect(failures.map((f) => f.code)).toEqual([GHS_PICTOGRAM_SYMBOL_MISSING])
  })

  it('passes the checks it can pass, rather than reporting nothing', () => {
    const passes = findings.filter((f) => f.severity === 'pass')
    expect(passes.length).toBeGreaterThan(0)
  })
})

describe('precedence needs the classification, not the pictogram codes', () => {
  const stock = GHS_CONFORMANT.stock

  it('declines when a label lists pictograms but no hazards', () => {
    // Without knowing *why* GHS07 is present, Article 26(c) is unanswerable, and
    // saying nothing is the honest answer. A rule that fired here would report a
    // violation on a label whose exclamation mark came from acute toxicity 4 —
    // something Article 26 says nothing about.
    const findings = findingsFor(
      { regime: 'eu-clp', productIdentifier: 'X', capacityL: 5, pictograms: ['GHS05', 'GHS07'] },
      stock,
    )
    expect(findings.filter((f) => f.code.startsWith('GHS_PICTOGRAM_PRECEDENCE'))).toEqual([])
  })

  it('does not fire when the exclamation mark is there for a reason the article omits', () => {
    // GHS05 from eye damage, GHS07 from skin *sensitisation* — 26(c) covers skin
    // and eye irritation only, so this label is conformant.
    const findings = findingsFor(
      {
        regime: 'eu-clp',
        productIdentifier: 'X',
        capacityL: 5,
        hazards: [HAZARDS.seriousEyeDamage, HAZARDS.skinSensitisation],
      },
      stock,
    )
    expect(findings.filter((f) => f.code === 'GHS_PICTOGRAM_PRECEDENCE_VIOLATED')).toEqual([])
  })

  it('reports an optional pictogram as guidance, never as a violation', () => {
    // Article 26(1)(e): with GHS02 present, GHS04 is optional — not forbidden.
    const findings = findingsFor(
      {
        regime: 'eu-clp',
        productIdentifier: 'X',
        capacityL: 5,
        hazards: [HAZARDS.flammableLiquid],
        pictograms: ['GHS02', 'GHS04'],
      },
      stock,
    )
    const optional = findings.find((f) => f.code === GHS_PICTOGRAM_PRECEDENCE_OPTIONAL)
    expect(optional).toBeDefined()
    expect(optional!.severity).toBe('guidance')
  })
})

describe('rules that only one regime sets', () => {
  it('measures no dimension on a US label, because OSHA sets none', () => {
    const findings = findingsFor(
      {
        regime: 'us-osha',
        productIdentifier: 'X',
        capacityL: 5,
        hazards: [HAZARDS.flammableLiquid],
      },
      { widthMm: 40, heightMm: 50, marginMm: 3 },
    )
    // The same stock is a violation under CLP. Declining is not a pass.
    expect(findings.filter((f) => f.code.startsWith('GHS_LABEL_'))).toEqual([])
    expect(findings.filter((f) => f.code.startsWith('GHS_PICTOGRAM_BELOW'))).toEqual([])
  })

  it('cites the regulator it actually judged against, including on a pass', () => {
    const us = findingsFor(
      { regime: 'us-osha', productIdentifier: 'X', capacityL: 5, signalWords: ['Danger'] },
      GHS_CONFORMANT.stock,
    )
    const pass = us.find((f) => f.code === 'GHS_SIGNAL_WORD_SINGLE')
    expect(pass!.citation.authority).toBe('OSHA')
    expect(pass!.citation.reference).toBe('29 CFR 1910.1200, Appendix C, C.2.1.1')
  })
})
