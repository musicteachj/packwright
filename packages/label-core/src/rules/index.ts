export { GHS_RULES, GS1_RETAIL_RULES, US_FOOD_RULES, listRules, runRules } from './registry'

export { LABEL_TYPES, SEVERITY_ORDER, compareSeverity } from './types'
export type {
  GhsChemicalContext,
  GhsChemicalRule,
  Gs1RetailContext,
  Gs1RetailRule,
  LabelType,
  Rule,
  RuleContext,
  UsFoodContext,
  UsFoodRule,
} from './types'

export { MEASUREMENT_TOLERANCE_MM, finding, mm, passed, xDimensionMm } from './finding'

export {
  GS1_GTIN_CHECK_DIGIT_INVALID,
  GS1_GTIN_CHECK_DIGIT_VALID,
  gtinCheckDigitRule,
} from './gs1/gtinCheckDigit'
export {
  GS1_MAGNIFICATION_IN_RANGE,
  GS1_MAGNIFICATION_OUT_OF_RANGE,
  magnificationRule,
} from './gs1/magnification'
export {
  GS1_BAR_HEIGHT_BELOW_MINIMUM,
  GS1_BAR_HEIGHT_SUFFICIENT,
  barHeightRule,
} from './gs1/barHeight'
export { GS1_QUIET_ZONE_CLEAR, GS1_QUIET_ZONE_TOO_NARROW, quietZoneRule } from './gs1/quietZone'
export { GS1_HRI_MISSING, GS1_HRI_PRESENT, humanReadableRule } from './gs1/humanReadable'
export {
  GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS,
  GS1_DIGITAL_LINK_INVALID,
  GS1_DIGITAL_LINK_VALID,
  digitalLinkRule,
} from './gs1/digitalLink'

export {
  GHS_LABEL_BELOW_MINIMUM_SIZE,
  GHS_LABEL_SIZE_MET,
  ghsLabelDimensionsRule,
} from './ghs/labelDimensions'
export {
  GHS_PICTOGRAM_COMPLETE,
  GHS_PICTOGRAM_NOT_RECOGNISED,
  GHS_PICTOGRAM_SYMBOL_MISSING,
  ghsPictogramIntegrityRule,
} from './ghs/pictogramIntegrity'
export {
  GHS_PICTOGRAM_PRECEDENCE_MET,
  GHS_PICTOGRAM_PRECEDENCE_OPTIONAL,
  GHS_PICTOGRAM_PRECEDENCE_VIOLATED,
  ghsPictogramPrecedenceRule,
} from './ghs/pictogramPrecedence'
export {
  GHS_PICTOGRAM_BELOW_MINIMUM_SIZE,
  GHS_PICTOGRAM_SIZE_MET,
  ghsPictogramSizeRule,
} from './ghs/pictogramSize'
export {
  GHS_SIGNAL_WORD_CONFLICT,
  GHS_SIGNAL_WORD_SINGLE,
  ghsSignalWordRule,
} from './ghs/signalWord'
export {
  GHS_PICTOGRAM_MISSING,
  GHS_PICTOGRAM_NOT_REQUIRED,
  GHS_PICTOGRAM_SET_MATCHES,
  ghsPictogramSetRule,
} from './ghs/pictogramSet'
export {
  CLP_SMALL_PACKAGE_MAX_L,
  OSHA_SMALL_CONTAINER_MAX_L,
  smallContainerThresholdL,
  GHS_SMALL_CONTAINER_AVAILABLE,
  GHS_SMALL_CONTAINER_COMPLETE,
  GHS_SMALL_CONTAINER_INCOMPLETE,
  GHS_SMALL_CONTAINER_NOT_ELIGIBLE,
  ghsSmallContainerRule,
} from './ghs/smallContainer'

export {
  FDA_NET_QUANTITY_DECLARED_MET,
  FDA_NET_QUANTITY_MISSING,
  usFoodNetQuantityPresentRule,
} from './usFood/netQuantityPresent'
export {
  FDA_NET_QUANTITY_TYPE_SIZE_MET,
  FDA_NET_QUANTITY_TYPE_TOO_SMALL,
  usFoodNetQuantityTypeSizeRule,
} from './usFood/netQuantityTypeSize'
export {
  FDA_NET_QUANTITY_OUTSIDE_ZONE,
  FDA_NET_QUANTITY_PLACEMENT_MET,
  FDA_NET_QUANTITY_ZONE_NOT_REQUIRED,
  usFoodNetQuantityPlacementRule,
} from './usFood/netQuantityPlacement'
export {
  FDA_NET_QUANTITY_CROWDED,
  FDA_NET_QUANTITY_SEPARATION_MET,
  usFoodNetQuantitySeparationRule,
} from './usFood/netQuantitySeparation'
export {
  FDA_NET_QUANTITY_DUAL_MET,
  FDA_NET_QUANTITY_METRIC_MISSING,
  FDA_NET_QUANTITY_METRIC_NOT_REQUIRED,
  usFoodNetQuantityDualDeclarationRule,
} from './usFood/netQuantityDualDeclaration'

export {
  FDA_INGREDIENTS_EXEMPT,
  FDA_INGREDIENTS_MISSING,
  FDA_INGREDIENTS_ORDER_MET,
  FDA_INGREDIENTS_OUT_OF_ORDER,
  FDA_INGREDIENT_NAME_MISSING,
  FDA_INGREDIENT_THRESHOLD_EXCEEDED,
  FDA_INGREDIENT_THRESHOLD_MET,
  FDA_INGREDIENT_THRESHOLD_NOT_PERMITTED,
  usFoodIngredientListRule,
  usFoodIngredientThresholdRule,
} from './usFood/ingredientList'
export {
  FDA_DUAL_COLUMN_EXEMPT,
  FDA_DUAL_COLUMN_MET,
  FDA_DUAL_COLUMN_MISSING,
  usFoodDualColumnRule,
} from './usFood/dualColumn'
export {
  FDA_DUAL_COLUMN_FORM_MET,
  FDA_DUAL_COLUMN_HEADINGS_MISSING,
  FDA_DUAL_COLUMN_NOT_SEPARATED,
  FDA_DUAL_COLUMN_UNEQUAL_PROMINENCE,
  usFoodDualColumnFormRule,
} from './usFood/dualColumnForm'
export {
  FDA_RESPONSIBLE_FIRM_ADDRESS_INCOMPLETE,
  FDA_RESPONSIBLE_FIRM_MET,
  FDA_RESPONSIBLE_FIRM_MISSING,
  FDA_RESPONSIBLE_FIRM_UNQUALIFIED,
  usFoodResponsibleFirmRule,
} from './usFood/responsibleFirm'
export {
  FDA_STATEMENT_OF_IDENTITY_MET,
  FDA_STATEMENT_OF_IDENTITY_MISSING,
  usFoodStatementOfIdentityRule,
} from './usFood/statementOfIdentity'
export {
  FDA_PANEL_TYPE_SIZE_MET,
  FDA_PANEL_TYPE_TOO_SMALL,
  usFoodInformationPanelTypeSizeRule,
} from './usFood/informationPanelTypeSize'

export {
  FDA_ALLERGEN_DECLARED_MET,
  FDA_ALLERGEN_NOT_DECLARED,
  FDA_ALLERGEN_SOURCE_NOT_SPECIFIC,
  usFoodAllergenRule,
} from './usFood/allergens'
export {
  FDA_CONTAINS_NOT_ADJACENT,
  FDA_CONTAINS_TYPE_MET,
  FDA_CONTAINS_TYPE_TOO_SMALL,
  usFoodContainsStatementTypeRule,
} from './usFood/containsStatementType'

export {
  FDA_NUTRITION_COMPLETE,
  FDA_NUTRITION_EXEMPT,
  FDA_NUTRITION_MISSING,
  FDA_NUTRITION_NUTRIENT_MISSING,
  FDA_NUTRITION_ORDER_MET,
  FDA_NUTRITION_OUT_OF_ORDER,
  FDA_NUTRITION_PERCENT_DV_MET,
  FDA_NUTRITION_PERCENT_DV_WRONG,
  FDA_NUTRITION_ROUNDING_MET,
  FDA_NUTRITION_ROUNDING_WRONG,
  FDA_SERVING_SIZE_MET,
  FDA_SERVING_SIZE_MISSING,
  usFoodNutritionCompletenessRule,
  usFoodNutritionOrderRule,
  usFoodNutritionPercentDvRule,
  usFoodNutritionRoundingRule,
  usFoodServingSizeRule,
} from './usFood/nutritionFacts'
export {
  FDA_NUTRITION_TYPE_SIZE_MET,
  FDA_NUTRITION_TYPE_TOO_SMALL,
  usFoodNutritionTypeSizeRule,
} from './usFood/nutritionTypeSize'
export {
  FDA_NUTRITION_FORMAT_MET,
  FDA_NUTRITION_FORMAT_NOT_PERMITTED,
  usFoodNutritionFormatRule,
} from './usFood/nutritionFormat'
