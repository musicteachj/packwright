export { labelFilename } from './filename'
export {
  DEFAULT_GHS_STOCK,
  GHS_ELEMENTS,
  canonicalSignalWord,
  GHS_SIGNAL_WORDS,
  GHS_TYPE_DEFAULT,
} from './ghs'
export type { GhsLabelData, GhsSignalWord, GhsSupplier } from './ghs'
export { ANCHORS, ARTWORK_DEFAULT, anchorBox, panelFor } from './stock'
export type { Anchor, ArtworkBlock, LabelStock, Panel } from './stock'
export {
  DEFAULT_UPC_A_STOCK,
  NOMINAL_X_DIMENSION_MM,
  UPC_A_ELEMENTS,
  UPC_A_HRI_DEFAULT,
  completeGtin,
  upcAHriFor,
} from './upcA'
export type { DigitalLinkData, UpcALabelData } from './upcA'
export {
  DEFAULT_US_FOOD_STOCK,
  INGREDIENT_THRESHOLD_PERCENTS,
  US_FOOD_ELEMENTS,
  US_FOOD_INGREDIENTS_EXEMPTIONS,
  US_FOOD_NUTRITION_EXEMPTIONS,
  US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE,
  US_FOOD_PACKAGINGS,
  US_FOOD_TYPE_DEFAULT,
  NUTRITION_ELEMENT_PREFIX,
  NUTRITION_ROW_PREFIX,
  nutritionRowElementId,
} from './usFood'
export type {
  IngredientThresholdPercent,
  UsFoodIngredient,
  UsFoodIngredientsExemption,
  UsFoodIngredientsExemptionKind,
  UsFoodLabelData,
  UsFoodNetQuantity,
  UsFoodNutritionExemption,
  UsFoodNutritionExemptionKind,
  UsFoodNutritionFacts,
  UsFoodPackaging,
  UsFoodSmallPackageExemption,
  UsFoodResponsibleFirm,
} from './usFood'
