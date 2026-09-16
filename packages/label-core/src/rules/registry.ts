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

import { wasFullyDrawn } from '../layout/omissions'
import type { ResolvedLayout } from '../layout/types'
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
import { usFoodAllergenRule } from './usFood/allergens'
import { usFoodContainsStatementTypeRule } from './usFood/containsStatementType'
import { usFoodIngredientListRule, usFoodIngredientThresholdRule } from './usFood/ingredientList'
import { usFoodInformationPanelTypeSizeRule } from './usFood/informationPanelTypeSize'
import {
  usFoodNutritionCompletenessRule,
  usFoodServingSizeRule,
  usFoodNutritionOrderRule,
  usFoodNutritionPercentDvRule,
  usFoodNutritionRoundingRule,
} from './usFood/nutritionFacts'
import { usFoodDualColumnRule } from './usFood/dualColumn'
import { usFoodDualColumnFormRule } from './usFood/dualColumnForm'
import { usFoodNutritionFormatRule } from './usFood/nutritionFormat'
import { usFoodNutritionTypeSizeRule } from './usFood/nutritionTypeSize'
import { usFoodNetQuantityDualDeclarationRule } from './usFood/netQuantityDualDeclaration'
import { usFoodNetQuantityPlacementRule } from './usFood/netQuantityPlacement'
import { usFoodNetQuantityPresentRule } from './usFood/netQuantityPresent'
import { usFoodNetQuantitySeparationRule } from './usFood/netQuantitySeparation'
import { usFoodNetQuantityTypeSizeRule } from './usFood/netQuantityTypeSize'
import { usFoodResponsibleFirmRule } from './usFood/responsibleFirm'
import { usFoodStatementOfIdentityRule } from './usFood/statementOfIdentity'
import type {
  GhsChemicalRule,
  Gs1RetailRule,
  LabelType,
  Rule,
  RuleContext,
  UsFoodRule,
} from './types'

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
 * The US food rule set.
 *
 * Ordered as a person would read the label: the net quantity first — is it there
 * at all, is it big enough, is it in the right part of the panel, does it stand
 * clear of everything else, does it say the quantity in both measurement systems
 * — then what the food is made of, then who is answerable for it, and finally
 * whether any of it is legible.
 *
 * The first of those was added after the other four shipped. Each of them
 * declines when nothing is drawn, which is right individually and produced
 * "checked and clear" collectively on a label with no declaration on it.
 *
 * Two requirements of 21 CFR 101.7 are deliberately absent, recorded here rather
 * than only in the changelog so they read as decisions:
 *
 * - **(h)(1)**, the 3:1 height-to-width cap, because `TextPrimitive` carries no
 *   horizontal scale. This engine cannot draw condensed type, so the rule could
 *   never fail — it would clear every label put to it, which is the failure mode
 *   `layout/types.ts` records learning the hard way. A literal per-letter reading
 *   would also fail `I`, `l` and `1` in every typeface ever cut, so the intended
 *   reading is about type *style*, and no primary source pinning it was found.
 * - **(h)(3)**, fraction component numerals at half the minimum height, because
 *   the engine sets the declaration as one run rather than as separate glyphs.
 *   `usFoodEngine` records a `LayoutOmission` saying so, so the gap is visible
 *   on the label rather than only in this comment.
 */
export const US_FOOD_RULES: readonly UsFoodRule[] = [
  usFoodStatementOfIdentityRule,
  usFoodNetQuantityPresentRule,
  usFoodNetQuantityTypeSizeRule,
  usFoodNetQuantityPlacementRule,
  usFoodNetQuantitySeparationRule,
  usFoodNetQuantityDualDeclarationRule,
  usFoodIngredientListRule,
  usFoodIngredientThresholdRule,
  usFoodAllergenRule,
  usFoodContainsStatementTypeRule,
  usFoodNutritionCompletenessRule,
  usFoodServingSizeRule,
  usFoodNutritionOrderRule,
  usFoodNutritionRoundingRule,
  usFoodNutritionPercentDvRule,
  usFoodNutritionTypeSizeRule,
  usFoodNutritionFormatRule,
  usFoodDualColumnRule,
  usFoodDualColumnFormRule,
  usFoodResponsibleFirmRule,
  usFoodInformationPanelTypeSizeRule,
]

/**
 * Every rule, or every rule for one label type.
 *
 * The `/rules` catalogue in phase 6 calls this with no argument, because a user
 * browsing the encoded rules wants all of them.
 */
export function listRules(labelType?: LabelType): readonly Rule[] {
  const all: readonly Rule[] = [...GS1_RETAIL_RULES, ...GHS_RULES, ...US_FOOD_RULES]
  return labelType === undefined ? all : all.filter((rule) => rule.appliesTo === labelType)
}

/**
 * Withholds any pass issued for an element the engine did not print in full.
 *
 * This is a floor under every rule rather than a courtesy each one performs, and
 * it is here because the courtesy was not performed. `usFoodEngine` records an
 * omission when a declaration is drawn past the edge of the stock — the fix for
 * "the net quantity at x −57.5 mm with all five of its rules reporting
 * compliant" — but that fix landed in the layout alone. Not one rule read
 * `layout.omissions`, so the same label still came back with eighteen findings
 * and every one of them a pass.
 *
 * Withholding the *pass* is the whole of it. A violation is never touched, for
 * the reason `quietZone.ts` records at length: an earlier fix there skipped an
 * uncertifiable symbol outright and manufactured a second false clearance out of
 * the first. An element that could not be drawn has not been cleared, and it has
 * not been absolved either.
 *
 * A pass built by `passedOnDocument` is left alone, because it judges something
 * the engine's drawing cannot change — an exemption is a fact about the food.
 * `elementId` cannot make that distinction, and an earlier version of this guard
 * that tried to read it that way deleted two entitlements: `elementId` says where
 * to look, not what was judged. `Finding.certifies` says what was judged.
 *
 * **A pass carrying no `elementId` is also left alone, and for a narrower reason
 * than this comment used to give.** It said such passes judge the document, and
 * offered a check digit as the example. Neither holds: `GS1_GTIN_CHECK_DIGIT_VALID`
 * names an element, and a pass that names none has not thereby said anything
 * about what it rests on. The real reason is mechanical — omissions are recorded
 * per element, so a pass naming no element has nothing this guard can look up.
 * Which means a pass that certifies the artwork and names no element is a pass
 * this guard cannot withhold, whatever `certifies` says. Two do today, and
 * neither is a false clearance: pictogram precedence reports that nothing
 * forbidden appears, which ink not laid down cannot falsify, and the small
 * container rule checks for itself that everything it lists printed.
 */
function withholdUncertifiablePasses(findings: Finding[], layout: ResolvedLayout): Finding[] {
  if (layout.omissions.length === 0) return findings
  return findings.filter(
    (result) =>
      result.severity !== 'pass' ||
      result.certifies === 'document' ||
      result.elementId === undefined ||
      wasFullyDrawn(layout, result.elementId),
  )
}

/**
 * Runs the rules for the document's own label type.
 *
 * The switch is what keeps this honest: narrowing on `labelType` gives each rule
 * set a context it already matches, so no assertion is needed and the compiler
 * still checks that a rule and the document it judges describe the same thing.
 */
export function runRules(context: RuleContext): Finding[] {
  return withholdUncertifiablePasses(check(context), context.layout)
}

function check(context: RuleContext): Finding[] {
  switch (context.labelType) {
    case 'gs1-retail':
      return GS1_RETAIL_RULES.flatMap((rule) => rule.check(context))
    case 'ghs-chemical':
      return GHS_RULES.flatMap((rule) => rule.check(context))
    case 'us-food':
      return US_FOOD_RULES.flatMap((rule) => rule.check(context))
    default: {
      // Every member of `LABEL_TYPES` now has a context and a case. This is what
      // keeps that true: add a fourth label type and the assignment stops
      // compiling, rather than the switch falling off the end and returning
      // `undefined` to callers that all treat the result as an array.
      const unreachable: never = context
      return unreachable
    }
  }
}
