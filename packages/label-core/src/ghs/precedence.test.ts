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
const ACUTE_TOX_4 = '3.1/acute-toxicity-oral-dermal-inhalation-4'
const STOT_SE_3 = '3.8/specific-target-organ-toxicity-single-exposure-3-respira'

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

  it('gives each regime its own words for the health-hazard clause', () => {
    // OSHA C.2.1.4, read from the eCFR on 2026-10-27: "for respiratory sensitization ...
    // for skin sensitization or for skin or eye irritation". CLP 26(1)(d), from the
    // Publications Office consolidation of 2026-07-01: "for respiratory sensitisation
    // ... for skin sensitisation or for skin and eye irritation".
    const hazards = [RESPIRATORY, SKIN_SENSITISATION]
    const reason = (regime: 'eu-clp' | 'us-osha') =>
      precedenceSuppressions(['GHS07', 'GHS08'], hazards, regime).find((s) => s.code === 'GHS07')
        ?.reason
    expect(reason('us-osha')).toBe(
      'The health hazard pictogram applies for respiratory sensitization, so the exclamation ' +
        'mark may not appear for skin sensitization or for skin or eye irritation.',
    )
    expect(reason('eu-clp')).toBe(
      'The health hazard pictogram applies for respiratory sensitisation, so the exclamation ' +
        'mark may not appear for skin sensitisation or for skin and eye irritation.',
    )
  })

  it('declines entirely without a classification, rather than guessing', () => {
    // No hazards means no "why", and every conditional clause is unanswerable.
    expect(precedenceSuppressions(['GHS05', 'GHS07'], [], 'eu-clp')).toEqual([])
    expect(applyPrecedence(['GHS05', 'GHS07'], [], 'eu-clp')).toEqual(['GHS05', 'GHS07'])
  })
})

describe('Article 26(1)(a) keeps GHS02 where its exception makes it compulsory', () => {
  // "except in cases where more than one of these hazard pictograms are compulsory".
  // Annex V gives a Type B organic peroxide both GHS01 ("Types A, B") and GHS02 ("Types
  // B, C, D, E, F"). Item 11 of the 2026-10-17 source verification.
  const typeB = ['2.15/organic-peroxides-types-a-b', '2.15/organic-peroxides-types-b-c-d-e-f']

  it('does not call GHS02 optional beside GHS01 on a Type B', () => {
    expect(requiredPictograms(typeB)).toEqual(['GHS01', 'GHS02'])
    const optional = precedenceSuppressions(['GHS01', 'GHS02'], typeB, 'eu-clp').filter(
      (s) => s.clause === 'Article 26(1)(a)',
    )
    expect(optional).toEqual([])
  })

  it('still calls it optional where GHS02 comes from another class', () => {
    // A Type A organic peroxide with a flammable liquid: GHS01 from one, GHS02 from the
    // other, and only one of them compulsory by the peroxide's own row.
    const hazards = ['2.15/organic-peroxides-types-a-b', '2.6/flammable-liquids-1-2-3']
    const optional = precedenceSuppressions(['GHS01', 'GHS02'], hazards, 'eu-clp').filter(
      (s) => s.clause === 'Article 26(1)(a)',
    )
    expect(optional.map((s) => s.code)).toEqual(['GHS02'])
  })
})

describe('a clause removes the exclamation mark only for the hazards it names', () => {
  // Article 26(1)(c) and (d) take GHS07 off "for" skin or eye irritation and
  // sensitisation, and OSHA C.2.1.2 to C.2.1.4 "where it is used for" them. A label
  // that needs GHS07 for something else as well keeps it. Written with `some`, the
  // clauses removed it — and a label then missing it drew no finding at all.
  it.each([
    ['acute toxicity 4', ACUTE_TOX_4],
    ['respiratory tract irritation (STOT SE 3)', STOT_SE_3],
  ])('keeps it beside corrosion when it is also there for %s', (_name, other) => {
    const hazards = [EYE_DAMAGE, SKIN_IRRITATION, other]
    for (const regime of ['eu-clp', 'us-osha'] as const) {
      expect(applyPrecedence(requiredPictograms(hazards), hazards, regime), regime).toEqual([
        'GHS05',
        'GHS07',
      ])
    }
  })

  it('keeps it beside the respiratory health hazard when it is also there for acute toxicity', () => {
    const hazards = [RESPIRATORY, SKIN_SENSITISATION, ACUTE_TOX_4]
    expect(applyPrecedence(requiredPictograms(hazards), hazards, 'eu-clp')).toContain('GHS07')
  })

  it('removes it under OSHA when two clauses between them bar every use of it', () => {
    // C.2.1.2 bars the exclamation mark for acute toxicity beside the skull and
    // crossbones; C.2.1.3 bars it for irritation beside corrosion. Needed for both,
    // with both pictograms present, it may not appear — though neither clause alone
    // covers every use. Requiring one clause to cover all of them kept it.
    const hazards = [ACUTE_TOX, ACUTE_TOX_4, EYE_DAMAGE, SKIN_IRRITATION]
    const required = requiredPictograms(hazards)
    expect(required).toContain('GHS07')
    expect(applyPrecedence(required, hazards, 'us-osha')).not.toContain('GHS07')
    expect(
      precedenceSuppressions(required, hazards, 'us-osha')
        .map((suppression) => suppression.clause)
        .sort(),
    ).toEqual(['C.2.1.2', 'C.2.1.3'])
  })

  it('keeps it under OSHA when one of its uses is barred by nothing present', () => {
    // No corrosion pictogram, so nothing bars the irritation use.
    const hazards = [ACUTE_TOX, ACUTE_TOX_4, SKIN_IRRITATION]
    expect(applyPrecedence(requiredPictograms(hazards), hazards, 'us-osha')).toContain('GHS07')
  })

  it('lets only the outright clause speak for an exclamation mark nothing calls for', () => {
    // Drawn with no hazard that needs it: 26(1)(b) bars it whatever its use, but
    // 26(1)(c) would claim a use for skin or eye irritation the label does not have.
    const hazards = [ACUTE_TOX, EYE_DAMAGE]
    const drawn = ['GHS05', 'GHS06', 'GHS07'] as const
    expect(
      precedenceSuppressions([...drawn], hazards, 'eu-clp').map(
        (suppression) => suppression.clause,
      ),
    ).toEqual(['Article 26(1)(b)'])
  })

  it('still removes it when every reason for it is one the clause names', () => {
    const hazards = [EYE_DAMAGE, SKIN_IRRITATION, '3.3/eye-irritation-2']
    expect(applyPrecedence(requiredPictograms(hazards), hazards, 'eu-clp')).toEqual(['GHS05'])
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
