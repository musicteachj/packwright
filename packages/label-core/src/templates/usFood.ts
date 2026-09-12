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
import type { MajorFoodAllergenId } from '../fda/allergens'
import type { Anchor, LabelStock } from './stock'

export const US_FOOD_ELEMENTS = {
  statementOfIdentity: 'food-statement-of-identity',
  containsStatement: 'food-contains-statement',
  netQuantity: 'food-net-quantity',
  ingredients: 'food-ingredients',
  responsibleFirm: 'food-responsible-firm',
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

/**
 * One entry in the ingredient statement.
 *
 * The weight share is carried because 21 CFR 101.4(a)(1) orders the list "in
 * descending order of predominance by weight", and an order can only be checked
 * against the weights it claims to reflect. A list of names in an order is a
 * claim; a list of names with weights is a claim that can be wrong.
 */
export interface UsFoodIngredient {
  /** Common or usual name, and a specific one — 21 CFR 101.4(b). */
  name: string
  /** Share of the finished food by weight, as a percentage. */
  percentByWeight: number
  /**
   * The major food allergen this ingredient is, or contains protein from —
   * FD&C Act §201(qq). A fact about the recipe, which is why it sits on the
   * ingredient rather than being guessed from its name: "natural flavor" may
   * contain milk protein and "cocoa butter" contains no dairy at all.
   */
  allergen?: MajorFoodAllergenId
  /**
   * The specific type or species, where §403(w)(2) demands one — the almond
   * behind "tree nuts", the cod behind "fish". Ignored for the six allergens
   * whose category name is itself the food source name.
   */
  allergenSpecificType?: string
  /**
   * Whether the label prints §403(w)(1)(B)'s parenthetical after this
   * ingredient — `whey (milk)`.
   *
   * It has to be stated rather than derived. An engine that appended the
   * parenthetical whenever it knew an allergen would make an undeclared
   * allergen impossible to draw, and the rule that reports one could then never
   * fail: it would clear every label put to it, which is the shape
   * `ResolvedSymbol` was restructured to avoid.
   */
  declareInline?: boolean
}

/**
 * The 21 CFR 101.4(a)(2) exception, where it is claimed.
 *
 * Ingredients at or below the threshold may be grouped at the end of the list,
 * out of order, behind a quantifying statement. The permitted thresholds are a
 * closed set — "2 percent, or, if desired, 1.5 percent, 1.0 percent, or 0.5
 * percent" — and nothing behind the statement may exceed the one chosen.
 */
export const INGREDIENT_THRESHOLD_PERCENTS = [2, 1.5, 1.0, 0.5] as const
export type IngredientThresholdPercent = (typeof INGREDIENT_THRESHOLD_PERCENTS)[number]

/**
 * The firm whose name appears on the label — 21 CFR 101.5.
 *
 * Two things here are facts about the world rather than about the label, so the
 * supplier declares them and no rule infers them. Whether this firm actually
 * made the food decides whether 101.5(c) demands a qualifying phrase, and
 * whether the street address appears in a current city or telephone directory
 * decides whether 101.5(d) demands it on the label. Neither is answerable by
 * inspecting artwork — the same reasoning that made GHS small-container
 * labelling a declaration rather than a capacity check.
 */
export interface UsFoodResponsibleFirm {
  /**
   * 21 CFR 101.5(b): for a corporation, the actual corporate name; for an
   * individual, partnership or association, the name the business is conducted
   * under.
   */
  name: string
  /** Whether this firm manufactured the food. */
  isManufacturer: boolean
  /**
   * The phrase printed before the name where it did not — "Manufactured for",
   * "Distributed by". Free text, because 101.5(c) permits "any other wording
   * that expresses the facts" and an enum here would reject a compliant label.
   */
  qualifyingPhrase?: string
  streetAddress?: string
  /** Declared, because whether an address is in a current directory is not
   *  visible on the label. 101.5(d) drops the street address when it is. */
  streetAddressInDirectory?: boolean
  city: string
  state: string
  zip?: string
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
  /**
   * The ingredient statement, in the order it will be printed. The engine draws
   * this order as given — it does not sort — because a list printed out of
   * descending order is exactly the defect 101.4(a)(1) exists to catch, and an
   * engine that quietly sorted would make that defect undrawable.
   */
  ingredients?: readonly UsFoodIngredient[]
  /**
   * Where the 101.4(a)(2) grouping is claimed: the threshold on the quantifying
   * statement, and how many entries at the end of the list sit behind it.
   */
  ingredientThreshold?: {
    percent: IngredientThresholdPercent
    /** Count of trailing entries the quantifying statement covers. */
    count: number
  }
  /**
   * Declared where § 101.100 exempts the food from ingredient labelling. Those
   * exemptions turn on facts about the product and its packaging rather than on
   * anything drawable, so like the GHS small-container provision this is stated
   * by the supplier and never inferred.
   */
  ingredientsExempt?: boolean
  /**
   * The allergens the label's "Contains" statement names — FD&C Act
   * §403(w)(1)(A). Stated rather than derived, so a statement that omits an
   * allergen the recipe contains can be drawn and reported. Omitted entirely
   * means the label carries no such statement and relies on (w)(1)(B)'s
   * parenthetical form instead.
   */
  containsStatement?: readonly MajorFoodAllergenId[]
  /**
   * Em size for the "Contains" statement. Omitted, it is set to match the
   * ingredient list, which is what §403(w)(1)(A) asks for. Present, it is drawn
   * as given — the only way type smaller than the list reaches the rule.
   */
  containsStatementFontSizeMm?: number
  /**
   * Extra space between the ingredient list and the "Contains" statement, for
   * the same reason: §403(w)(1)(A) wants them adjacent, and a label that pushes
   * them apart has to be drawable before it can be reported.
   */
  containsStatementGapMm?: number
  responsibleFirm?: UsFoodResponsibleFirm
  /**
   * Em size for the ingredient statement and the responsible firm. Omitted, the
   * engine uses a default set at the 21 CFR 101.2(c) floor. Present, it draws
   * what it is given — which is how type below the floor reaches the rule.
   */
  informationPanelFontSizeMm?: number
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
  /**
   * The ingredient statement and the responsible firm. Set at the 21 CFR 101.2(c)
   * floor of 1/16 inch measured on the lowercase "o" — 1.5875 / 0.540 = 2.94 mm
   * of em — so the default label sits exactly on the line the rule checks rather
   * than comfortably above it. A default that cleared by a wide margin would mean
   * the rule never ran against anything close to its own threshold.
   */
  informationPanelMm: 2.94,
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
