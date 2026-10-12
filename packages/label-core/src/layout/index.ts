export { LayoutError, assertMarginLeavesPanel, layOutUpcALabel } from './engine'
export type { UpcALayoutRequest } from './engine'

export {
  LAID_OUT_AT_DEFAULT_TYPE_SIZES,
  LAID_OUT_IN_PACKWRIGHTS_ARRANGEMENT,
  layOutGhsLabel,
  SYMBOL_NOT_DRAWN_BECAUSE,
  SYMBOL_NOT_SEEN_BECAUSE,
} from './ghsEngine'
export type { GhsLayoutRequest } from './ghsEngine'

export { layOutUsFoodLabel } from './usFoodEngine'
export type { UsFoodLayoutRequest } from './usFoodEngine'

export { layOutNutritionPanel } from './nutritionPanel'
export type { NutritionPanelRequest, NutritionPanelResult } from './nutritionPanel'

export {
  blockingOmissions,
  explainedOmission,
  omissionsForElement,
  wasFullyDrawn,
} from './omissions'
export { willDrawSecondColumn } from './nutritionPanel'
export { measureClearSpace } from './clearSpace'
export type { ClearSpace } from './clearSpace'

export type {
  ElementId,
  LayoutOmission,
  LayoutPrimitive,
  LinePrimitive,
  PathCommand,
  PathPrimitive,
  PlacedSymbol,
  PrimitiveBase,
  RectPrimitive,
  ResolvedElement,
  ResolvedLayout,
  ResolvedPictogram,
  ResolvedSymbol,
  TextAnchor,
  TextPrimitive,
} from './types'
