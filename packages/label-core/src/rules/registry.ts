/**
 * The rule registry — every encoded rule, in one list.
 *
 * It is a plain array on purpose. The `/rules` catalogue is generated from it
 * rather than hand-written, so a rule that ships is a rule a user can read the
 * citation for, and a rule nobody can find in the catalogue does not exist.
 *
 * Findings come back in registry order. Grouping them by severity is the
 * presentation layer's job — `compareSeverity` is there for it — because the
 * order a reader wants and the order the checks ran in are different questions.
 */

import type { Finding } from '../types/index'
import { barHeightRule } from './gs1/barHeight'
import { digitalLinkRule } from './gs1/digitalLink'
import { gtinCheckDigitRule } from './gs1/gtinCheckDigit'
import { humanReadableRule } from './gs1/humanReadable'
import { magnificationRule } from './gs1/magnification'
import { quietZoneRule } from './gs1/quietZone'
import { ghsLabelDimensionsRule } from './ghs/labelDimensions'
import { ghsPictogramIntegrityRule } from './ghs/pictogramIntegrity'
import { ghsPictogramPrecedenceRule } from './ghs/pictogramPrecedence'
import { ghsPictogramSetRule } from './ghs/pictogramSet'
import { ghsPictogramSizeRule } from './ghs/pictogramSize'
import { ghsSignalWordRule } from './ghs/signalWord'
import { ghsSmallContainerRule } from './ghs/smallContainer'
import type { GhsChemicalRule, Gs1RetailRule, LabelType, Rule, RuleContext } from './types'

/**
 * Ordered as a person would check a label: is the identifier right, is the
 * symbol the right size, does it have the room it needs, is it legible, and
 * does the web address on it work.
 */
export const GS1_RETAIL_RULES: readonly Gs1RetailRule[] = [
  gtinCheckDigitRule,
  magnificationRule,
  barHeightRule,
  quietZoneRule,
  humanReadableRule,
  digitalLinkRule,
]

/**
 * The GHS rule set, empty until its stage.
 *
 * Ordered as a person would check a chemical label: is the warning right, are
 * the pictograms real ones, is there the right *set* of them, and is any of it
 * big enough to read.
 */
export const GHS_RULES: readonly GhsChemicalRule[] = [
  ghsSignalWordRule,
  ghsPictogramIntegrityRule,
  ghsPictogramSetRule,
  ghsPictogramPrecedenceRule,
  ghsLabelDimensionsRule,
  ghsPictogramSizeRule,
  ghsSmallContainerRule,
]

/**
 * Every rule, or every rule for one label type.
 *
 * The `/rules` catalogue in phase 6 calls this with no argument, because a user
 * browsing the encoded rules wants all of them.
 */
export function listRules(labelType?: LabelType): readonly Rule[] {
  const all: readonly Rule[] = [...GS1_RETAIL_RULES, ...GHS_RULES]
  return labelType === undefined ? all : all.filter((rule) => rule.appliesTo === labelType)
}

/**
 * Runs the rules for the document's own label type.
 *
 * The switch is what keeps this honest: narrowing on `labelType` gives each rule
 * set a context it already matches, so no assertion is needed and the compiler
 * still checks that a rule and the document it judges describe the same thing.
 */
export function runRules(context: RuleContext): Finding[] {
  switch (context.labelType) {
    case 'gs1-retail':
      return GS1_RETAIL_RULES.flatMap((rule) => rule.check(context))
    case 'ghs-chemical':
      return GHS_RULES.flatMap((rule) => rule.check(context))
  }
}
