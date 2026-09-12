import { describe, expect, it } from 'vitest'
import { requiredPictograms } from './classification'
import { applyPrecedence, precedenceSuppressions } from './precedence'

const EYE_DAMAGE = '3.3/serious-eye-damage-1'
const SKIN_IRRITATION = '3.2/skin-irritation-2'
const SKIN_SENSITISATION = '3.4/skin-sensitisation-1-1a-1b'
const RESPIRATORY = '3.4/respiratory-sensitisation-1-1a-1b'
const ACUTE_TOX = '3.1/acute-toxicity-oral-dermal-inhalation-1-2-3'
const FLAMMABLE = '2.6/flammable-liquids-1-2-3'
const EXPLOSIVE = '2.1/unstable-explosives-explosives-of-divisions-1-1-1-2-1-3'

describe('Article 26 applied, not merely reported', () => {
  /**
   * The defect this module was extracted for: the derivation produced a set that
   * the rule then flagged, so the editor's own default output was non-compliant.
   */
  it('removes the exclamation mark the corrosion pictogram forbids', () => {
    const hazards = [EYE_DAMAGE, SKIN_IRRITATION]
    expect(requiredPictograms(hazards)).toEqual(['GHS05', 'GHS07'])
    expect(applyPrecedence(requiredPictograms(hazards), hazards, 'eu-clp')).toEqual(['GHS05'])
  })

  it('leaves a derived set with nothing to suppress alone', () => {
    const hazards = [FLAMMABLE]
    expect(applyPrecedence(requiredPictograms(hazards), hazards, 'eu-clp')).toEqual(['GHS02'])
  })

  it('keeps optional suppressions, because omitting a hazard symbol is not ours to decide', () => {
    // Article 26(1)(a): with GHS01 present, GHS02 is optional — not forbidden.
    const hazards = [EXPLOSIVE, FLAMMABLE]
    const derived = requiredPictograms(hazards)
    expect(derived).toContain('GHS02')
    expect(applyPrecedence(derived, hazards, 'eu-clp')).toContain('GHS02')
    expect(
      precedenceSuppressions(derived, hazards, 'eu-clp').some((s) => s.kind === 'optional'),
    ).toBe(true)
  })

  it('applies the health-hazard clause only for respiratory sensitisation', () => {
    const hazards = [RESPIRATORY, SKIN_SENSITISATION]
    expect(applyPrecedence(requiredPictograms(hazards), hazards, 'eu-clp')).toEqual(['GHS08'])
  })

  it('declines entirely without a classification, rather than guessing', () => {
    // No hazards means no "why", and every conditional clause is unanswerable.
    expect(precedenceSuppressions(['GHS05', 'GHS07'], [], 'eu-clp')).toEqual([])
    expect(applyPrecedence(['GHS05', 'GHS07'], [], 'eu-clp')).toEqual(['GHS05', 'GHS07'])
  })
})

describe('the regimes differ, and each is applied on its own terms', () => {
  it('narrows the skull-and-crossbones clause to acute toxicity under OSHA', () => {
    // CLP 26(1)(b) forbids GHS07 outright when GHS06 applies; OSHA C.2.1.2 only
    // where the exclamation mark is there for acute toxicity.
    const viaIrritation = [ACUTE_TOX, SKIN_IRRITATION]
    const drawn: ('GHS06' | 'GHS07')[] = ['GHS06', 'GHS07']
    expect(applyPrecedence(drawn, viaIrritation, 'eu-clp')).toEqual(['GHS06'])
    // Under OSHA the exclamation mark here is for skin irritation, and C.2.1.3
    // covers that only when the corrosion pictogram is present, which it is not.
    expect(applyPrecedence(drawn, viaIrritation, 'us-osha')).toEqual(['GHS06', 'GHS07'])
  })

  it('raises no optional clause under OSHA, which has no equivalent', () => {
    const hazards = [EXPLOSIVE, FLAMMABLE]
    const derived = requiredPictograms(hazards)
    expect(precedenceSuppressions(derived, hazards, 'us-osha')).toEqual([])
    expect(
      precedenceSuppressions(derived, hazards, 'eu-clp').filter((s) => s.kind === 'optional')
        .length,
    ).toBeGreaterThan(0)
  })
})

describe('the derivation and the rule cannot disagree', () => {
  /**
   * Both call `precedenceSuppressions`. This pins the consequence: a set the
   * derivation produced has no mandatory suppression left for the rule to find.
   */
  it('leaves nothing for the rule to flag on a derived set', () => {
    for (const hazards of [
      [EYE_DAMAGE, SKIN_IRRITATION],
      [ACUTE_TOX, SKIN_IRRITATION],
      [RESPIRATORY, SKIN_SENSITISATION],
      [FLAMMABLE],
      [EXPLOSIVE, FLAMMABLE],
    ]) {
      for (const regime of ['eu-clp', 'us-osha'] as const) {
        const derived = applyPrecedence(requiredPictograms(hazards), hazards, regime)
        const mandatory = precedenceSuppressions(derived, hazards, regime).filter(
          (s) => s.kind === 'mandatory',
        )
        expect(mandatory, `${regime} ${hazards.join(' + ')}`).toEqual([])
      }
    }
  })
})
