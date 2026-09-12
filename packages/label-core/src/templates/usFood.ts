/**
 * The US food label — 21 CFR 101 and the Fair Packaging and Labeling Act.
 *
 * The third label type, and the first whose **type sizes are regulated**. The
 * UPC-A and GHS templates carry type defaults marked "legible, not regulated,
 * no rule may judge against them". Here the opposite holds: 21 CFR 101.7(i)
 * sets a minimum letter height per principal-display-panel area, so the size of
 * the net quantity declaration is a compliance question and the engine derives
 * it rather than defaulting it. A caller may override it — that is how a label
 * that fails the rule gets drawn.
 *
 * The other thing this template introduces is the split between the *package*
 * and the *label*. Every earlier template had one geometry, the stock. Here the
 * minimum type size keys off the area of the principal display panel, which is a
 * property of the container: 21 CFR 101.1 computes it as the full face of a
 * rectangular package, 40% of height x circumference for a cylinder, and 40% of
 * total surface for anything else. A 120 x 170 mm label can sit on any of the
 * three. So `container` is declared alongside `stock` and the two are not
 * interchangeable.
 */

import type { Container, NetQuantityMarkingMethod } from '../geometry/pdp'
import type { Anchor, LabelStock } from './stock'

export const US_FOOD_ELEMENTS = {
  statementOfIdentity: 'food-statement-of-identity',
  netQuantity: 'food-net-quantity',
  principalDisplayPanel: 'food-pdp',
  border: 'label-border',
} as const

/**
 * How the package is put up, for the two cases where 15 U.S.C. 1453 does not
 * demand an SI declaration alongside the inch/pound one.
 *
 * - `random` — 1453(a)(3)(A)(ii) and (a)(5): one of a lot of packages of the
 *   same commodity with varying weights and no fixed weight pattern. The SI
 *   statement is permitted, not required.
 * - `packaged-at-retail` — 1453(a)(6): "shall not apply to foods that are
 *   packaged at the retail store level."
 */
export const US_FOOD_PACKAGINGS = ['standard', 'random', 'packaged-at-retail'] as const
export type UsFoodPackaging = (typeof US_FOOD_PACKAGINGS)[number]

/**
 * The net quantity of contents declaration.
 *
 * Two strings rather than a quantity and a unit, because this template does not
 * convert between measurement systems. Working out that 12 oz is 340 g is the
 * labeller's job and getting it wrong is a different defect from the ones these
 * rules find; inventing the conversion here would mean this engine silently
 * authoring part of a regulated statement.
 */
export interface UsFoodNetQuantity {
  /** The inch/pound declaration as it will be printed, e.g. `NET WT 12 OZ`. */
  inchPound: string
  /**
   * The SI metric declaration, e.g. `(340 g)`. Required alongside the
   * inch/pound one by 15 U.S.C. 1453(a)(2) — a statute, not 21 CFR 101, which
   * has never been amended to require it.
   */
  metric?: string
  /** Defaults to `standard`, where the SI declaration is required. */
  packaging?: UsFoodPackaging
}

export interface UsFoodLabelData {
  /** 21 CFR 101.3 — what the food *is*. Drawn so there is something for the
   *  net quantity to be separated from, which 101.7(f) measures. */
  statementOfIdentity: string
  netQuantity: UsFoodNetQuantity
  /** The package. Its area sets the minimum type size; see the module note. */
  container: Container
  /** 21 CFR 101.7(i) — a declaration formed in the surface rather than printed
   *  needs 1/16 inch more type. Defaults to `printed`. */
  markingMethod?: NetQuantityMarkingMethod
  /**
   * Em size for the declaration. Omitted, the engine derives the size 101.7(i)
   * requires and the label complies. Present, it is drawn exactly as asked —
   * which is how an undersized declaration reaches the rule that reports it.
   */
  netQuantityFontSizeMm?: number
  /**
   * Where the declaration sits. 21 CFR 101.7(f) requires the bottom 30% of the
   * panel on all but the smallest packages, so `bottom-centre` complies and
   * anything higher is a defect a rule reports rather than one the form
   * prevents.
   */
  netQuantityAnchor?: Anchor
}

/**
 * Type for the US food label. The net quantity is **not** here: 21 CFR 101.7(i)
 * sets it by panel area, so the engine computes it. Only the unregulated
 * surrounding type has a default.
 */
export const US_FOOD_TYPE_DEFAULT = {
  fontFamily: 'IBM Plex Sans',
  emphasisFontWeight: 600,
  statementOfIdentityMm: 6,
  /** Leading between stacked lines, as a multiple of the type size. */
  lineHeight: 1.3,
  blockGapMm: 3,
} as const

/**
 * A 120 x 170 mm front panel — 31.6 in², which lands in 21 CFR 101.7(i)'s
 * "more than 25 but not more than 100 square inches" band and so demands
 * 3/16 inch type. That is DESIGN.md's own done-when case, made the default so
 * the interesting rule is live the moment the label loads.
 */
export const DEFAULT_US_FOOD_STOCK: LabelStock = { widthMm: 120, heightMm: 170, marginMm: 6 }
