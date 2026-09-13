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
import type { NutrientId } from '../fda/nutrients'
import type { DualColumnBasis, NutritionColumnMode, NutritionFormat } from '../fda/nutritionFormats'
import type { Anchor, LabelStock } from './stock'

/**
 * One id per nutrient row, so a finding outlines the line it is about.
 *
 * The `-row-` segment is load-bearing. With a bare `food-nutrition-` prefix the
 * generated ids collided with the fixed ones — `food-nutrition-heading`,
 * `-servings`, `-footnote` — so a rule selecting "the nutrient rows" by prefix
 * picked up the 6 point footnote and reported it against the 8 point minimum
 * 101.9(d)(7)(iii) sets for rows.
 */
export const NUTRITION_ROW_PREFIX = 'food-nutrition-row-'

/**
 * Everything the Nutrition Facts panel draws — the rows above and the fixed ids
 * beside them.
 *
 * The separation rule needs "is this element inside the panel?" rather than "is
 * this a nutrient row?", and spelled the answer as a literal `'food-nutrition-'`.
 * A prefix written out where a constant exists is a rename away from silently
 * changing meaning, and this one guards a rule that multiplies one crowding into
 * a finding per row when it gets the answer wrong.
 */
export const NUTRITION_ELEMENT_PREFIX = 'food-nutrition-'

export const nutritionRowElementId = (id: string): string => `${NUTRITION_ROW_PREFIX}${id}`

export const US_FOOD_ELEMENTS = {
  statementOfIdentity: 'food-statement-of-identity',
  nutritionPanel: 'food-nutrition-panel',
  nutritionHeading: 'food-nutrition-heading',
  nutritionServings: 'food-nutrition-servings',
  nutritionServingSize: 'food-nutrition-serving-size',
  nutritionCalories: 'food-nutrition-calories',
  /**
   * The Calories *numeral*, which 101.9(d)(1)(iii) gives a minimum of its own —
   * 22 point against the word's 16, and the two drop by different amounts on the
   * reduced displays. It is tagged separately because a rule measuring both
   * under one id can only see the smaller of them, and so could never report an
   * undersized numeral beside a correct word.
   */
  nutritionCaloriesFigure: 'food-nutrition-calories-figure',
  nutritionFootnote: 'food-nutrition-footnote',
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

/**
 * The Nutrition Facts panel, as content. Its geometry is a later stage.
 *
 * The split that matters is between **what the food contains** and **what the
 * label prints**. `amounts` carries the analysed value per serving; everything
 * else is what the artwork says about it, and is derived from `amounts` unless
 * stated. Deriving-unless-stated is the only arrangement in which a panel that
 * rounds wrongly, prints a wrong percentage, or lists the nutrients out of order
 * can exist at all — and those are three of the four things 21 CFR 101.9 is
 * checked for.
 */
export interface UsFoodNutritionFacts {
  /** 21 CFR 101.9(d)(3)(ii), e.g. `2/3 cup (55g)`. */
  servingSize: string
  /** 21 CFR 101.9(d)(3)(i). */
  servingsPerContainer?: number
  /** Analysed amount per serving, before rounding. Calories are in calories;
   *  everything else is in the unit its table entry states. */
  amounts: Partial<Record<NutrientId, number>>
  /** What the panel prints, where it differs from the rounded `amounts`. */
  declaredAmounts?: Partial<Record<NutrientId, number>>
  /** What the panel prints in the % Daily Value column, where it differs. */
  declaredPercentDv?: Partial<Record<NutrientId, number>>
  /** The order the panel lists them in. Omitted means 101.9(c)'s own order. */
  order?: readonly NutrientId[]
  /**
   * A multiplier on every type size in the panel, where the label sets one.
   *
   * It exists so the panel can be drawn *wrong*. Every size in
   * `NUTRITION_PANEL_TYPE` is a minimum 101.9 states, so a panel drawn from them
   * complies by construction and the type-size rule could never fail — the same
   * shape as the parenthetical the GHS engine used to append unconditionally.
   * A designer shrinking the panel to fit is also the realistic way this goes
   * wrong, which is the other reason it is a scale rather than a per-line size.
   */
  typeScale?: number
  /**
   * Which display the panel uses — 21 CFR 101.9(d) for the vertical one,
   * (j)(13)(ii)(A) for the two reduced ones. Omitted means vertical.
   */
  format?: NutritionFormat
  /**
   * The second set of values, where the panel carries one — 21 CFR 101.9(e), and
   * (b)(12)(i) and (b)(2)(i)(D) where it is not optional.
   *
   * **Orthogonal to `format`, and it has to be.** (e)(6)(ii) illustrates a
   * dual-column *tabular* panel and (e)(6)(i) a dual-column vertical one, so the
   * two axes combine; folding dual-column into `format` would make both of those
   * labels impossible to describe. Omitted means one column.
   *
   * The headings are carried because (e)(1) requires them — "there shall be two
   * or more column headings accurately describing the amount per serving size" —
   * and their text is the labeller's, not this engine's to compose.
   */
  columns?: {
    mode: NutritionColumnMode
    basis?: DualColumnBasis
    headings?: readonly [string, string]
  }
  /**
   * Total surface area available to bear labeling, in square inches, which is
   * what (j)(13) measures — **not** the principal display panel, which 101.1
   * computes for the net quantity. Two different areas on one label, and using
   * either for the other's question would be wrong in both directions.
   */
  availableSurfaceSqInches?: number
  /**
   * (j)(13)(ii)(A): "the package shape or size cannot accommodate a standard
   * vertical column or tabular display on any label panel", and "the label will
   * not accommodate a tabular display". Facts about a package that no artwork
   * shows, so they are declared — the GHS small-container call again.
   */
  cannotAccommodateVertical?: boolean
  cannotAccommodateTabular?: boolean
  /**
   * Continuous vertical space available for the nutrition label, in inches.
   * 101.9(d)(11)(iii) entitles a package of any size to the tabular display
   * where there is less than approximately 3.
   */
  continuousVerticalSpaceInches?: number
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
  nutritionFacts?: UsFoodNutritionFacts
  /**
   * Declared where 21 CFR 101.9(j) exempts the food from nutrition labelling.
   * That paragraph runs to eighteen subparagraphs turning on business size,
   * units sold, and what the food is — facts about a company and a product
   * rather than about a label, so this is stated and never inferred, the way
   * §101.100 and the GHS small-container provision are.
   */
  nutritionFactsExempt?: boolean
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
 * A 120 x 240 mm panel — 44.6 in², which lands in 21 CFR 101.7(i)'s "more than
 * 25 but not more than 100 square inches" band and so demands 3/16 inch type.
 * That is DESIGN.md's own done-when case, made the default so the interesting
 * rule is live the moment the label loads.
 *
 * The height is what a Nutrition Facts panel needs. At 129 mm the panel is most
 * of a label on its own, and everything else has to fit around it.
 */
export const DEFAULT_US_FOOD_STOCK: LabelStock = { widthMm: 120, heightMm: 240, marginMm: 6 }
