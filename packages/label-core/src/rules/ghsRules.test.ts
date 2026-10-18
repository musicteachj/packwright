import { describe, expect, it } from 'vitest'
import { layOutGhsLabel } from '../layout/ghsEngine'
import { GHS_CONFORMANT, GHS_FIXTURES, HAZARDS } from './fixtures/ghs'
import { GHS_PICTOGRAM_PRECEDENCE_OPTIONAL, GHS_PICTOGRAM_SYMBOL_MISSING } from './index'
import { ghsPictogramSetRule } from './ghs/pictogramSet'
import { ghsPictogramSizeRule } from './ghs/pictogramSize'
import { GHS_RULES, declinedChecks, runRules } from './registry'
import { codesOf } from './types'
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
    const uncovered = GHS_RULES.flatMap((rule) => codesOf(rule)).filter(
      (code) =>
        !covered.has(code) &&
        // Pass codes, and the two guidance codes, are not failures. Matched by name;
        // see BACKLOG.md, "The rule catalogue's severities".
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

describe('a pictogram outside the required set says why', () => {
  const stock = GHS_CONFORMANT.stock
  const eyeDamageAndIrritation = (pictograms: GhsLabelData['pictograms']) =>
    findingsFor(
      {
        regime: 'eu-clp',
        productIdentifier: 'X',
        capacityL: 5,
        hazards: [HAZARDS.seriousEyeDamage, HAZARDS.skinIrritation],
        ...(pictograms === undefined ? {} : { pictograms }),
      },
      stock,
    )
  const notRequired = (findings: ReturnType<typeof findingsFor>) =>
    findings.filter((f) => f.code === 'GHS_PICTOGRAM_NOT_REQUIRED')

  it('leaves a pictogram the precedence rule already reports to that rule', () => {
    // GHS05 and GHS07 both drawn: `ghs/pictogram-precedence` reports GHS07 under
    // Article 26(1)(c). This rule used to report it again as "no hazard class
    // declared … requires it" under Annex V, which assigns GHS07 to the skin
    // irritation — a reason its own citation contradicts.
    const findings = eyeDamageAndIrritation(['GHS05', 'GHS07'])
    expect(findings.filter((f) => f.code === 'GHS_PICTOGRAM_PRECEDENCE_VIOLATED')).toHaveLength(1)
    expect(notRequired(findings)).toEqual([])
  })

  it('still reports one Article 26 removes when nothing else does, citing the clause', () => {
    // GHS05 applies and is not drawn, so the precedence rule is silent. Dropping
    // the finding here would leave GHS07 on the label with no violation at all.
    const findings = eyeDamageAndIrritation(['GHS07'])
    expect(findings.filter((f) => f.code === 'GHS_PICTOGRAM_PRECEDENCE_VIOLATED')).toEqual([])
    const [finding, ...rest] = notRequired(findings)
    expect(rest).toEqual([])
    expect(finding!.severity).toBe('violation')
    expect(finding!.citation.reference).toBe('Regulation (EC) No 1272/2008 (CLP), Article 26(1)')
    expect(finding!.message).toContain('Article 26(1)(c)')
    expect(finding!.message).not.toContain('no hazard class declared')
  })

  it('keeps Annex V for a pictogram no declared hazard calls for', () => {
    const findings = eyeDamageAndIrritation(['GHS05', 'GHS02'])
    const [finding, ...rest] = notRequired(findings)
    expect(rest).toEqual([])
    expect(finding!.citation.reference).toBe('Regulation (EC) No 1272/2008 (CLP), Annex V')
    expect(finding!.message).toContain('no hazard class declared')
  })
})

describe('an exclamation mark needed for a hazard the precedence clause does not name', () => {
  // Article 26(1)(c) removes GHS07 beside GHS05 only "for skin or eye irritation".
  // Here acute toxicity 4 needs it too, so it stays: a label carrying it is not in
  // breach of precedence, and a label leaving it off is missing a pictogram. Before
  // the precedence fix the second drew no finding — the derivation had removed it.
  const stock = GHS_CONFORMANT.stock
  const withPictograms = (pictograms: GhsLabelData['pictograms']) =>
    findingsFor(
      {
        regime: 'eu-clp',
        productIdentifier: 'X',
        capacityL: 5,
        hazards: [
          HAZARDS.seriousEyeDamage,
          HAZARDS.skinIrritation,
          '3.1/acute-toxicity-oral-dermal-inhalation-4',
        ],
        ...(pictograms === undefined ? {} : { pictograms }),
      },
      stock,
    )

  it('is not a precedence violation when drawn', () => {
    const findings = withPictograms(['GHS05', 'GHS07'])
    expect(findings.filter((f) => f.code === 'GHS_PICTOGRAM_PRECEDENCE_VIOLATED')).toEqual([])
    expect(findings.filter((f) => f.code === 'GHS_PICTOGRAM_NOT_REQUIRED')).toEqual([])
  })

  it('is reported missing when left off', () => {
    const missing = withPictograms(['GHS05']).filter((f) => f.code === 'GHS_PICTOGRAM_MISSING')
    expect(missing.map((f) => f.message).join(' ')).toContain('GHS07')
  })
})

describe('the pictogram set passes only on a set that is all required', () => {
  // The pass is withheld today because no pictogram artwork is drawn, which would
  // hide this defect until the day some is. So the artwork is taken as drawn here —
  // the pictograms' omissions removed — and the rule is asked directly.
  const judgeAsIfDrawn = (pictograms: GhsLabelData['pictograms']) => {
    const data: GhsLabelData = {
      regime: 'eu-clp',
      productIdentifier: 'X',
      capacityL: 5,
      hazards: [HAZARDS.seriousEyeDamage, HAZARDS.skinIrritation],
      ...(pictograms === undefined ? {} : { pictograms }),
    }
    const stock = GHS_CONFORMANT.stock
    const layout = layOutGhsLabel({ data, stock })
    const pictogramIds = new Set(layout.pictograms.map((p) => p.elementId))
    const drawn = {
      ...layout,
      omissions: layout.omissions.filter((o) => !pictogramIds.has(o.elementId)),
    }
    return ghsPictogramSetRule.check({ labelType: 'ghs-chemical', data, stock, layout: drawn })
  }
  const passes = (findings: ReturnType<typeof judgeAsIfDrawn>) =>
    findings.filter((f) => f.code === 'GHS_PICTOGRAM_SET_MATCHES')

  it('passes the set Article 26 leaves, so the condition is reachable', () => {
    expect(passes(judgeAsIfDrawn(['GHS05']))).toHaveLength(1)
  })

  it('does not pass a set carrying a pictogram it leaves to the precedence rule', () => {
    // GHS07 beside GHS05 for irritation: reported by ghs/pictogram-precedence, so
    // nothing is recorded here — and "nothing recorded" used to mean "pass".
    const findings = judgeAsIfDrawn(['GHS05', 'GHS07'])
    expect(findings).toEqual([])
    expect(passes(findings)).toEqual([])
  })
})

describe('a pictogram two clauses remove names them both', () => {
  it('gives 26(1)(c) and (d) when it is there for irritation and sensitisation', () => {
    // GHS05 for the eye damage, GHS08 for the respiratory sensitisation: (c) bars the
    // irritation use of GHS07 and (d) the sensitisation use. Neither alone is the
    // reason, and GHS08 is not drawn, so the precedence rule is silent.
    const findings = runRules({
      labelType: 'ghs-chemical',
      data: {
        regime: 'eu-clp',
        productIdentifier: 'X',
        capacityL: 5,
        hazards: [
          HAZARDS.seriousEyeDamage,
          HAZARDS.skinIrritation,
          HAZARDS.skinSensitisation,
          HAZARDS.respiratorySensitisation,
        ],
        pictograms: ['GHS05', 'GHS07'],
      },
      stock: GHS_CONFORMANT.stock,
      layout: layOutGhsLabel({
        data: {
          regime: 'eu-clp',
          productIdentifier: 'X',
          capacityL: 5,
          hazards: [
            HAZARDS.seriousEyeDamage,
            HAZARDS.skinIrritation,
            HAZARDS.skinSensitisation,
            HAZARDS.respiratorySensitisation,
          ],
          pictograms: ['GHS05', 'GHS07'],
        },
        stock: GHS_CONFORMANT.stock,
      }),
    })
    const [finding, ...rest] = findings.filter((f) => f.code === 'GHS_PICTOGRAM_NOT_REQUIRED')
    expect(rest).toEqual([])
    expect(finding!.message).toContain('Article 26(1)(c) and Article 26(1)(d) take it off')
  })
})

describe('one precedence finding per pictogram', () => {
  it('names both OSHA clauses that bar one exclamation mark, in a single violation', () => {
    // C.2.1.2 bars its acute-toxicity use beside the skull and crossbones, C.2.1.3 its
    // irritation use beside corrosion. One pictogram, one defect, one finding.
    const data: GhsLabelData = {
      regime: 'us-osha',
      productIdentifier: 'X',
      capacityL: 5,
      hazards: [
        HAZARDS.acuteToxicity,
        '3.1/acute-toxicity-oral-dermal-inhalation-4',
        HAZARDS.seriousEyeDamage,
        HAZARDS.skinIrritation,
      ],
      pictograms: ['GHS05', 'GHS06', 'GHS07'],
    }
    const violations = findingsFor(data, GHS_CONFORMANT.stock).filter(
      (f) => f.code === 'GHS_PICTOGRAM_PRECEDENCE_VIOLATED',
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]!.message).toContain('(C.2.1.2, C.2.1.3)')
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

  describe('which pictograms a US classification requires', () => {
    // It judged a US label against CLP Annex V and cited Annex V, so a US label was told its
    // pictograms were wrong under an EU regulation. OSHA takes them from Appendix C.4, which
    // this tool does not hold, so it says that instead of judging.
    const usLabel = (data: Partial<GhsLabelData>): GhsLabelData => ({
      regime: 'us-osha',
      productIdentifier: 'X',
      capacityL: 5,
      ...data,
    })
    const declineOf = (data: GhsLabelData) => {
      const stock = GHS_CONFORMANT.stock
      return declinedChecks({
        labelType: 'ghs-chemical',
        data,
        stock,
        layout: layOutGhsLabel({ data, stock }),
      }).find((declined) => declined.ruleId === 'ghs/pictogram-set')
    }

    it("gives no verdict on the set, and says the limit is the tool's", () => {
      // A flame the classification requires, and an exclamation mark it does not: under CLP
      // this label draws both a violation and an advisory, each citing Annex V.
      const data = usLabel({ hazards: [HAZARDS.flammableLiquid], pictograms: ['GHS07'] })
      const findings = findingsFor(data, GHS_CONFORMANT.stock)
      expect(
        findings.filter(
          (f) => f.code === 'GHS_PICTOGRAM_NOT_REQUIRED' || f.code === 'GHS_PICTOGRAM_MISSING',
        ),
      ).toEqual([])
      expect(findings.map((f) => f.citation.reference)).not.toContain(
        'Regulation (EC) No 1272/2008 (CLP), Annex V',
      )

      const declined = declineOf(data)
      expect(declined?.limit).toBe(true)
      expect(declined?.wants).toEqual([])
      expect(declined?.citation).toEqual({
        authority: 'OSHA',
        reference: '29 CFR 1910.1200, Appendix C, C.2',
        title: 'Label elements specified in C.4 for each hazard class and category',
      })
    })

    it('says so before asking for a classification that would not make it run', () => {
      const declined = declineOf(usLabel({ pictograms: ['GHS02'] }))
      expect(declined?.limit, 'not "classify the substance and this check will run"').toBe(true)
    })

    it('still judges an EU label against Annex V', () => {
      const data = {
        ...usLabel({ hazards: [HAZARDS.flammableLiquid], pictograms: ['GHS07'] }),
        regime: 'eu-clp' as const,
      }
      const codes = findingsFor(data, GHS_CONFORMANT.stock).map((f) => f.code)
      expect(codes).toContain('GHS_PICTOGRAM_NOT_REQUIRED')
      expect(codes).toContain('GHS_PICTOGRAM_MISSING')
      expect(declineOf(data)).toBeUndefined()
    })
  })
})

describe('the pictogram size pass says only what it measured', () => {
  // It said a pictogram clearing Table 1.3 met "the one fifteenth requirement" too, which at
  // the table's own 32 mm is false: 1,024 mm² against 1,036.3 (item 13 of the 2026-10-17
  // source verification). Checked on the rule itself, since the pass is withheld while no
  // pictogram symbol is drawn.
  const messageAt = (capacityL: number, pictogramSideMm: number, stock: LabelStock) => {
    const data: GhsLabelData = {
      regime: 'eu-clp',
      productIdentifier: 'Example solvent',
      capacityL,
      hazards: [HAZARDS.flammableLiquid],
      pictogramSideMm,
    }
    const [pass] = ghsPictogramSizeRule.check({
      labelType: 'ghs-chemical',
      data,
      stock,
      layout: layOutGhsLabel({ data, stock }),
    })
    return pass!.message
  }

  it('does not claim the fraction where Table 1.3’s own figure falls short of it', () => {
    const message = messageAt(100, 32, { widthMm: 105, heightMm: 148, marginMm: 4 })
    expect(message).toContain('which meets Table 1.3')
    expect(message).toContain('does not reach 1.2.1.3’s one fifteenth'.replace('’', "'"))
    expect(message).not.toContain('and, with it')
  })

  it('says nothing of the fraction against the first band’s "if possible" label', () => {
    // Table 1.3 qualifies 52 × 74 "If possible", so there is no minimum to take a fifteenth
    // of, and the pass does not say the pictogram falls short of one. Found by review.
    for (const side of [12, 20]) {
      // Short of the fraction, or past it: either way, nothing is claimed of it.
      const message = messageAt(1, side, { widthMm: 52, heightMm: 74, marginMm: 3 })
      expect(message, `${side} mm`).toContain('which meets Table 1.3.')
      expect(message, `${side} mm`).not.toContain('one fifteenth')
    }
  })

  it('claims it where the pictogram reaches it', () => {
    const message = messageAt(100, 33, { widthMm: 105, heightMm: 148, marginMm: 4 })
    expect(message).toContain("and 1.2.1.3's one fifteenth of the label's minimum area")
  })
})

describe('GHS02 on a Type B is compulsory whether or not GHS01 is drawn', () => {
  it('reports its absence as a violation beside a missing GHS01 too', () => {
    // Annex V makes both compulsory for a Type B; without GHS01, Article 26(1)(a) is not
    // even in play, so no clause can take GHS02 off. Found by review of the item 11 fix.
    const data: GhsLabelData = {
      regime: 'eu-clp',
      productIdentifier: 'Example peroxide',
      capacityL: 5,
      hazards: ['2.15/organic-peroxides-types-a-b', '2.15/organic-peroxides-types-b-c-d-e-f'],
      pictograms: ['GHS05'],
    }
    const missing = findingsFor(data, { widthMm: 74, heightMm: 105, marginMm: 4 }).filter(
      (f) => f.code === 'GHS_PICTOGRAM_MISSING',
    )
    expect(missing.find((f) => f.message.startsWith('GHS02'))?.severity).toBe('violation')
    expect(missing.find((f) => f.message.startsWith('GHS01'))?.severity).toBe('advisory')
  })

  it('stays an advisory on a CLP inner label of 10 ml or less on the small-package path', () => {
    // 1.5.2.4.2 asks only for GHS01, GHS05, GHS06 and/or GHS08 there, where 1.5.2.4.1 applies,
    // which no label states. Found by `/code-review high` on #106.
    const data: GhsLabelData = {
      regime: 'eu-clp',
      productIdentifier: 'Example peroxide',
      capacityL: 0.01,
      smallContainerLabelling: true,
      hazards: ['2.15/organic-peroxides-types-a-b', '2.15/organic-peroxides-types-b-c-d-e-f'],
      pictograms: ['GHS01'],
    }
    const ghs02 = findingsFor(data, { widthMm: 52, heightMm: 74, marginMm: 3 }).find(
      (f) => f.code === 'GHS_PICTOGRAM_MISSING' && f.message.startsWith('GHS02'),
    )
    expect(ghs02?.severity).toBe('advisory')
  })
})
