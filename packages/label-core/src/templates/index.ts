export { labelFilename } from './filename'
export { DEFAULT_GHS_STOCK, GHS_ELEMENTS, GHS_SIGNAL_WORDS, GHS_TYPE_DEFAULT } from './ghs'
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
  US_FOOD_ELEMENTS,
  US_FOOD_PACKAGINGS,
  US_FOOD_TYPE_DEFAULT,
} from './usFood'
export type { UsFoodLabelData, UsFoodNetQuantity, UsFoodPackaging } from './usFood'
