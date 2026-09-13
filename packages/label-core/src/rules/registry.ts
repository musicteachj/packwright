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
