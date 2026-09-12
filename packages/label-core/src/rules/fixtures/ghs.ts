/**
 * Known-bad GHS labels, one per rule.
 *
 * Same contract as `gs1Retail.ts`: a rule without a fixture is a claim, not a
 * check. Each entry asserts the code, the severity **and the exact citation
 * string**, because a finding carrying the wrong clause is worse than no finding
 * — and because these rules cite two different regulators, so the citation is
 * the only thing distinguishing a correct verdict from one delivered under the
 * wrong law.
 *
 * The precedence fixtures are the ones that needed care. Article 26(c) suppresses
 * the exclamation mark only where it is there *for skin or eye irritation*, so
 * the fixture has to classify the label in a way that puts it there for that
 * reason. A fixture that merely listed GHS05 and GHS07 would pass against a
 * broken rule that ignored the cause entirely — which is the rule this project
 * would otherwise have shipped.
 */

import type { GhsLabelData } from '../../templates/ghs'
import type { LabelStock } from '../../templates/stock'
import type { Severity } from '../../types/index'
import {
  GHS_LABEL_BELOW_MINIMUM_SIZE,
  GHS_PICTOGRAM_BELOW_MINIMUM_SIZE,
  GHS_PICTOGRAM_NOT_RECOGNISED,
  GHS_PICTOGRAM_MISSING,
  GHS_PICTOGRAM_NOT_REQUIRED,
  GHS_PICTOGRAM_PRECEDENCE_VIOLATED,
  GHS_PICTOGRAM_SYMBOL_MISSING,
  GHS_SIGNAL_WORD_CONFLICT,
} from '../index'

/** Annex V ids, named so the fixtures read as chemistry rather than as slugs. */
export const HAZARDS = {
  flammableLiquid: '2.6/flammable-liquids-1-2-3',
  acuteToxicity: '3.1/acute-toxicity-oral-dermal-inhalation-1-2-3',
  skinIrritation: '3.2/skin-irritation-2',
  seriousEyeDamage: '3.3/serious-eye-damage-1',
  skinSensitisation: '3.4/skin-sensitisation-1-1a-1b',
  respiratorySensitisation: '3.4/respiratory-sensitisation-1-1a-1b',
  aquatic: '4.1/hazardous-to-the-aquatic-environment-acute-acute-1-long',
} as const

/** 74 x 105 mm — the CLP minimum for the 3-to-50-litre band. */
const CONFORMING_STOCK: LabelStock = { widthMm: 74, heightMm: 105, marginMm: 4 }

const BASE = {
  regime: 'eu-clp',
  productIdentifier: 'Example solvent',
  capacityL: 5,
} as const

export interface GhsRuleFixture {
  name: string
  /** What is wrong with this label, in one sentence. */
  defect: string
  data: GhsLabelData
  stock: LabelStock
  expected: {
    code: string
    severity: Severity
    /** The exact `citation.reference` the finding must carry. */
    citation: string
  }
}

export const GHS_FIXTURES: readonly GhsRuleFixture[] = [
  {
    name: 'both signal words',
    defect: 'The label carries Danger and Warning; where Danger is used, Warning may not appear.',
    data: { ...BASE, signalWords: ['Danger', 'Warning'] },
    stock: CONFORMING_STOCK,
    expected: {
      code: GHS_SIGNAL_WORD_CONFLICT,
      severity: 'violation',
      citation: 'Regulation (EC) No 1272/2008 (CLP), Article 20(3)',
    },
  },
  {
    name: 'corrosion alongside an exclamation mark raised by skin irritation',
    defect:
      'Serious eye damage puts GHS05 on the label and skin irritation puts GHS07 on it; ' +
      'Article 26(1)(c) forbids the second for that reason.',
    data: {
      ...BASE,
      hazards: [HAZARDS.seriousEyeDamage, HAZARDS.skinIrritation],
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: GHS_PICTOGRAM_PRECEDENCE_VIOLATED,
      severity: 'violation',
      citation: 'Regulation (EC) No 1272/2008 (CLP), Article 26(1)',
    },
  },
  {
    name: 'skull and crossbones alongside an exclamation mark',
    defect: 'Acute toxicity 1–3 puts GHS06 on the label, so GHS07 may not appear at all.',
    data: {
      ...BASE,
      hazards: [HAZARDS.acuteToxicity, HAZARDS.skinIrritation],
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: GHS_PICTOGRAM_PRECEDENCE_VIOLATED,
      severity: 'violation',
      citation: 'Regulation (EC) No 1272/2008 (CLP), Article 26(1)',
    },
  },
  {
    name: 'health hazard for respiratory sensitisation, over skin sensitisation',
    defect:
      'GHS08 is there for respiratory sensitisation, so GHS07 may not appear for skin ' +
      'sensitisation — Article 26(1)(d).',
    data: {
      ...BASE,
      hazards: [HAZARDS.respiratorySensitisation, HAZARDS.skinSensitisation],
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: GHS_PICTOGRAM_PRECEDENCE_VIOLATED,
      severity: 'violation',
      citation: 'Regulation (EC) No 1272/2008 (CLP), Article 26(1)',
    },
  },
  {
    name: 'a label smaller than its capacity band allows',
    defect: 'A 5-litre package requires at least 74 × 105 mm; this label is 50 × 70 mm.',
    data: { ...BASE, hazards: [HAZARDS.flammableLiquid] },
    stock: { widthMm: 50, heightMm: 70, marginMm: 3 },
    expected: {
      code: GHS_LABEL_BELOW_MINIMUM_SIZE,
      severity: 'violation',
      citation: 'Regulation (EC) No 1272/2008 (CLP), Annex I, 1.2.1.4, Table 1.3',
    },
  },
  {
    name: 'a pictogram below the minimum for its band',
    defect: 'A 5-litre package requires 23 mm pictograms; these are drawn at 8 mm.',
    data: { ...BASE, hazards: [HAZARDS.flammableLiquid], pictogramSideMm: 8 },
    stock: CONFORMING_STOCK,
    expected: {
      code: GHS_PICTOGRAM_BELOW_MINIMUM_SIZE,
      severity: 'violation',
      citation: 'Regulation (EC) No 1272/2008 (CLP), Annex I, 1.2.1.3 and Table 1.3',
    },
  },
  {
    name: 'a pictogram the classification does not require',
    defect:
      'The hazards declare serious eye damage and skin irritation, which require GHS05 and ' +
      'GHS07, while the label draws GHS02 — a flame nothing on this product justifies.',
    data: {
      ...BASE,
      hazards: [HAZARDS.seriousEyeDamage, HAZARDS.skinIrritation],
      pictograms: ['GHS02', 'GHS07'],
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: GHS_PICTOGRAM_NOT_REQUIRED,
      severity: 'violation',
      citation: 'Regulation (EC) No 1272/2008 (CLP), Annex V',
    },
  },
  {
    name: 'a pictogram the classification requires but the label omits',
    defect:
      'Flammable liquids require GHS02 and the label draws only GHS07, which no precedence rule ' +
      'explains.',
    data: {
      ...BASE,
      hazards: [HAZARDS.flammableLiquid, HAZARDS.skinIrritation],
      pictograms: ['GHS07'],
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: GHS_PICTOGRAM_MISSING,
      // Advisory, not a violation: Article 26 can legitimately remove a
      // pictogram and this rule does not model which.
      severity: 'advisory',
      citation: 'Regulation (EC) No 1272/2008 (CLP), Annex V',
    },
  },
  {
    name: 'the environment pictogram on a US label',
    defect: 'OSHA recognises eight hazard symbols; GHS09 is not among them.',
    data: { ...BASE, regime: 'us-osha', hazards: [HAZARDS.aquatic] },
    stock: CONFORMING_STOCK,
    expected: {
      code: GHS_PICTOGRAM_NOT_RECOGNISED,
      severity: 'violation',
      citation: '29 CFR 1910.1200, Appendix C, C.2.3.2',
    },
  },
  {
    name: 'a pictogram frame with no hazard symbol, on a US label',
    defect:
      'The Annex V specimen artwork is unavailable, so every frame ships empty — which OSHA ' +
      'forbids outright.',
    data: { ...BASE, regime: 'us-osha', hazards: [HAZARDS.flammableLiquid] },
    stock: CONFORMING_STOCK,
    expected: {
      code: GHS_PICTOGRAM_SYMBOL_MISSING,
      severity: 'blocking',
      citation: '29 CFR 1910.1200, Appendix C, C.2.3.1',
    },
  },
]

/**
 * A label with nothing wrong with it under CLP.
 *
 * It still cannot be clean: every pictogram this engine draws is a frame without
 * its symbol, so the integrity rule fires here too. That is the honest state of
 * the engine rather than a flaw in the fixture, and the control asserts it
 * explicitly instead of pretending otherwise.
 */
export const GHS_CONFORMANT: { data: GhsLabelData; stock: LabelStock } = {
  data: {
    ...BASE,
    signalWords: ['Danger'],
    hazards: [HAZARDS.flammableLiquid],
    hazardStatements: ['Highly flammable liquid and vapour.'],
    precautionaryStatements: ['Keep away from heat.'],
    supplier: { name: 'Example Chemicals Ltd', address: '1 Example Way, Leeds' },
  },
  stock: CONFORMING_STOCK,
}
