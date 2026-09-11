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
import type { Rule, RuleContext } from './types'

/**
 * Ordered as a person would check a label: is the identifier right, is the
 * symbol the right size, does it have the room it needs, is it legible, and
 * does the web address on it work.
 */
export const GS1_RETAIL_RULES: readonly Rule[] = [
  gtinCheckDigitRule,
  magnificationRule,
  barHeightRule,
  quietZoneRule,
  humanReadableRule,
  digitalLinkRule,
]

export function listRules(): readonly Rule[] {
  return GS1_RETAIL_RULES
}

export function runRules(context: RuleContext): Finding[] {
  return listRules().flatMap((rule) => rule.check(context))
}
