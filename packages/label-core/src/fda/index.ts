export {
  MAJOR_FOOD_ALLERGENS,
  MAJOR_FOOD_ALLERGEN_IDS,
  foodSourceName,
  majorFoodAllergen,
} from './allergens'
export type { MajorFoodAllergen, MajorFoodAllergenId } from './allergens'
export {
  DAILY_VALUE_POPULATIONS,
  NUTRIENTS,
  NUTRIENT_IDS,
  dailyValueFor,
  nutrient,
  percentDailyValue,
  permittedNutrientAmounts,
  printedPercentDailyValue,
  roundNutrientAmount,
  roundingIsCheckable,
} from './nutrients'
export type {
  DailyValueKind,
  DailyValuePopulation,
  Nutrient,
  NutrientId,
  NutrientRounding,
} from './nutrients'
export {
  NUTRITION_DISPLAYS,
  NUTRITION_FOOTNOTE,
  NUTRITION_PANEL_RULES,
  NUTRITION_PANEL_TYPE,
  NUTRITION_TYPE_BY_DISPLAY,
  nutritionDisplayFor,
  nutritionTypeForDisplay,
} from './nutritionPanel'
export type { NutritionDisplay, NutritionTypeSizes } from './nutritionPanel'
export {
  DUAL_COLUMN_BASES,
  DUAL_COLUMN_BASIS_REFERENCE,
  DUAL_COLUMN_MAX_PERCENT,
  DUAL_COLUMN_MIN_PERCENT,
  dualColumnDuty,
  NUTRITION_COLUMN_MODES,
  NUTRITION_FORMATS,
  REDUCED_FORMAT_MAX_SQ_INCHES,
  SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES,
  TABULAR_VERTICAL_SPACE_INCHES,
  formatIsPermitted,
  smallPackageRouteApplies,
} from './nutritionFormats'
export {
  UNIT_CONTAINER_STATEMENTS,
  UNIT_CONTAINER_STATEMENT_MIN_TYPE_HEIGHT_INCHES,
  UNIT_CONTAINER_STATEMENT_MIN_TYPE_HEIGHT_MM,
  UNIT_CONTAINER_WORDINGS,
} from './unitContainerStatement'
export type { UnitContainerWording } from './unitContainerStatement'
export type {
  DualColumnBasis,
  DualColumnDuty,
  DualColumnInput,
  MandatoryDualColumnBasis,
  FormatEntitlement,
  FormatVerdict,
  NutritionColumnMode,
  NutritionFormat,
} from './nutritionFormats'
