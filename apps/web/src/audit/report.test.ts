import { DEFAULT_GHS_STOCK, type GhsLabelData } from '@packwright/label-core'
import { describe, expect, it } from 'vitest'
import { auditReport } from './report'
import type { ReadingKey } from './readingRows'

const A_LABEL: GhsLabelData = {
  regime: 'eu-clp',
  productIdentifier: 'Acetone',
  capacityL: 1,
  signalWords: ['Danger', 'Warning'],
  hazardStatementCodes: ['H225'],
}

const report = (
  data: GhsLabelData = A_LABEL,
  stock = DEFAULT_GHS_STOCK,
  read: ReadingKey[] = [],
  confirmed: ReadingKey[] = [],
) => auditReport(data, stock, new Set(read), new Set(confirmed))

describe('what the engine says about a rebuilt label', () => {
  it('reports the Article 20(3) conflict the sample label carries', () => {
    // The payoff of the whole phase: a photograph that prints DANGER and
    // WARNING together, read by a model, judged by a rule written in phase 4 —
    // with the citation that rule carries, not one produced here.
    const result = report()
    expect(result.outcome).toBe('reported')
    if (result.outcome !== 'reported') return

    const conflict = result.findings.find((f) => f.code === 'GHS_SIGNAL_WORD_CONFLICT')
    expect(conflict, result.findings.map((f) => f.code).join(', ')).toBeDefined()
    expect(conflict!.severity).toBe('violation')
    expect(conflict!.citation.reference).toBe('Regulation (EC) No 1272/2008 (CLP), Article 20(3)')
  })

  it('takes every finding from the rule registry and invents none', () => {
    const result = report()
    if (result.outcome !== 'reported') throw new Error('expected a report')
    // Each finding carries an authority and a reference because `rules/` put
    // them there. Anything authored on this path would have neither.
    for (const finding of result.findings) {
      expect(finding.citation.authority, finding.code).toBeTruthy()
      expect(finding.citation.reference, finding.code).toBeTruthy()
    }
    expect(result.findings.length).toBeGreaterThan(0)
  })

  it('splits failures from passes and orders the groups by severity', () => {
    const result = report()
    if (result.outcome !== 'reported') throw new Error('expected a report')
    expect(result.failures.every((f) => f.severity !== 'pass')).toBe(true)
    expect(result.passes.every((f) => f.severity === 'pass')).toBe(true)
    expect(result.failures.length + result.passes.length).toBe(result.findings.length)
  })
})

describe('what the report says it did not judge', () => {
  it('names a field that was read and never confirmed', () => {
    // The honest half. Decline to confirm the signal words and
    // `ghs/signal-word-precedence` clears, because there is nothing left to
    // conflict — a clearance produced by the interface rather than by a rule.
    // Built without the key rather than with it set to `undefined`:
    // `exactOptionalPropertyTypes` treats those as different things, and so
    // does the engine.
    const withoutSignalWords: GhsLabelData = {
      regime: 'eu-clp',
      productIdentifier: 'Acetone',
      capacityL: 1,
      hazardStatementCodes: ['H225'],
    }
    const result = report(
      withoutSignalWords,
      DEFAULT_GHS_STOCK,
      ['signalWords', 'productIdentifier'],
      ['productIdentifier'],
    )
    if (result.outcome !== 'reported') throw new Error('expected a report')

    // The premise, and it is worse than "the rule cleared": with no signal
    // words the rule says *nothing at all*. The same label with both words
    // reports GHS_SIGNAL_WORD_CONFLICT; declining to confirm the field makes
    // that line disappear, with nothing in its place. A reader sees one fewer
    // check and no reason for it.
    const withBoth = report()
    if (withBoth.outcome !== 'reported') throw new Error('expected a report')
    expect(withBoth.findings.some((f) => f.code === 'GHS_SIGNAL_WORD_CONFLICT')).toBe(true)
    expect(result.findings.some((f) => f.code.startsWith('GHS_SIGNAL_WORD'))).toBe(false)

    expect(result.unconfirmed).toEqual(['Signal words'])
  })

  it('names nothing when everything read was confirmed', () => {
    const result = report(A_LABEL, DEFAULT_GHS_STOCK, ['signalWords'], ['signalWords'])
    if (result.outcome !== 'reported') throw new Error('expected a report')
    expect(result.unconfirmed).toEqual([])
  })

  it('carries what the engine could not draw', () => {
    // Every GHS pictogram glyph is an omission in this build — the Annex V
    // artwork was never verified — so this block is populated on every audit
    // that has pictograms, and it is a fact about this application.
    const result = report({ ...A_LABEL, pictograms: ['GHS02'] })
    if (result.outcome !== 'reported') throw new Error('expected a report')
    expect(result.uncertifiable.length).toBeGreaterThan(0)
    expect(result.uncertifiable[0]!.reasons[0]).toBeTruthy()
  })

  it('names the checks a reading could never answer', () => {
    // The case this exists for. A photograph yields H-codes and pictograms and
    // never a hazard classification, so the two rules that read one stand down on
    // almost every audit — and did it in silence, beside a report that looked
    // complete. Separate from the block above: that one is about ink the engine
    // could not lay down, this is about a question the reading cannot answer.
    const result = report({ ...A_LABEL, pictograms: ['GHS02'] })
    if (result.outcome !== 'reported') throw new Error('expected a report')

    const rules = result.declined.map((one) => one.ruleId)
    expect(rules).toContain('ghs/pictogram-set')
    expect(rules).toContain('ghs/pictogram-precedence')
    for (const declined of result.declined) {
      expect(declined.reason).toContain('hazard classification')
      // Regime-neutral: the citation says which regulation, and on a us-osha label
      // it is not the EU one. Prose naming CLP under an OSHA citation was the
      // half-fix the high review caught.
      expect(declined.reason).not.toContain('CLP')
      expect(declined.citation.reference).toBeTruthy()
      // Written for somebody in a browser, so it names what to do and not where
      // a file lives in this repository. Found by review.
      expect(declined.reason).toContain('classify the substance')
      expect(declined.reason).not.toContain('docs/')
    }
  })

  it('cites the regulation the label is judged under, not the other one', () => {
    // `check` picks OSHA's Appendix C for a us-osha label and CLP Article 26 for
    // an EU one; the decline hard-coded the EU citation, so a US audit came back
    // annotated with an EU regulation. Found by review.
    const osha = report({ ...A_LABEL, regime: 'us-osha', pictograms: ['GHS02'] })
    if (osha.outcome !== 'reported') throw new Error('expected a report')
    const precedence = osha.declined.find((one) => one.ruleId === 'ghs/pictogram-precedence')
    expect(precedence!.citation.reference).toContain('1910.1200')

    const eu = report({ ...A_LABEL, regime: 'eu-clp', pictograms: ['GHS02'] })
    if (eu.outcome !== 'reported') throw new Error('expected a report')
    const euPrecedence = eu.declined.find((one) => one.ruleId === 'ghs/pictogram-precedence')
    expect(euPrecedence!.citation.reference).toContain('1272/2008')
  })
})

describe('a document the engine will not draw', () => {
  it('is a refusal that says what was wrong, not a throw', () => {
    const result = report({ ...A_LABEL, capacityL: 0 })
    expect(result.outcome).toBe('refused')
    if (result.outcome !== 'refused') return
    expect(result.reason.length).toBeGreaterThan(0)
  })

  it('refuses a stock with no area rather than drawing on nothing', () => {
    const result = report(A_LABEL, { widthMm: 0, heightMm: 105, marginMm: 4 })
    expect(result.outcome).toBe('refused')
  })
})
