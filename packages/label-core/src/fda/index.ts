export {
  MAJOR_FOOD_ALLERGENS,
  MAJOR_FOOD_ALLERGEN_IDS,
  foodSourceName,
  majorFoodAllergen,
} from './allergens'
export type { MajorFoodAllergen, MajorFoodAllergenId } from './allergens'
export {
  NUTRIENTS,
  NUTRIENT_IDS,
  nutrient,
  percentDailyValue,
  permittedNutrientAmounts,
  printedPercentDailyValue,
  roundNutrientAmount,
  roundingIsCheckable,
} from './nutrients'
export type { DailyValueKind, Nutrient, NutrientId, NutrientRounding } from './nutrients'
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
  NUTRITION_FORMATS,
  REDUCED_FORMAT_MAX_SQ_INCHES,
  SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES,
  TABULAR_VERTICAL_SPACE_INCHES,
  formatIsPermitted,
  smallPackageRouteApplies,
} from './nutritionFormats'
export type { FormatEntitlement, FormatVerdict, NutritionFormat } from './nutritionFormats'
