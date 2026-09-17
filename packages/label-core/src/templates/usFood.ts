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
import type { UnitContainerWording } from '../fda/unitContainerStatement'

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
  /** (e)(1)'s headings over the two columns of a dual-column panel. */
  nutritionColumnHeading: 'food-nutrition-column-heading',
  /** (e)(3)'s vertical lines between them. */
  nutritionColumnRule: 'food-nutrition-column-rule',
  /**
   * The band the second set of values occupies, emitted **only where one was
   * actually drawn**.
   *
   * It exists so a rule can ask the layout what the panel carries rather than
   * asking the document what it intended. `us-food/dual-column-required` read
   * `columns.mode` and reported the column present on a tabular panel that draws
   * a single one — a rule certifying content the engine never printed, which is
   * the failure `layout/types.ts` records learning the hard way.
   */
  nutritionSecondColumn: 'food-nutrition-second-column',
  nutritionFootnote: 'food-nutrition-footnote',
  /**
   * 101.9(j)(13)(i)(A)'s address or telephone number, on a small package using that
   * exemption. **Deliberately not under `food-nutrition-`**: that prefix is how the
   * rules deferring to 101.9's own type sizes recognise the panel, and 101.9 sets no
   * size for this line, so it answers to 101.2(c)'s floor instead.
   */
  smallPackageContact: 'food-small-package-contact',
  /**
   * 101.9(j)(15)(iii)'s "This Unit Not Labeled For Retail Sale", on a unit container
   * using that exemption. Outside `food-nutrition-` as the contact line is; unlike the
   * line, (iii) sets its size by name, and the rule that grants the exemption measures
   * it, so 101.2(c)'s rule leaves it alone.
   */
  unitContainerStatement: 'food-unit-container-statement',
  /**
   * § 101.100(a)(1)'s statement naming the other ingredients an assortment may
   * contain. Its own element, drawn after the list and any "Contains" statement: a
   * block between those two would move the "Contains" statement away from the list
   * §403(w)(1)(A) wants it beside, and folding it into the list's own text would let
   * a name in it discharge an allergen declaration the list itself never made.
   */
  assortmentStatement: 'food-assortment-statement',
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
 * The § 101.100 exemptions from ingredient labelling a label can claim.
 *
 * Source: 21 CFR 101.100, read from the eCFR on 2026-09-16. Only paragraph (a)
 * exempts a food from section 403(i)(2)'s ingredient statement, and its three
 * limbs differ in kind, which is why a bare "exempt" could not be judged:
 *
 * - `assortment` — (a)(1): "An assortment of different items of food, when
 *   variations in the items that make up different packages packed from such
 *   assortment normally occur in good packing practice", exempt "with respect to
 *   any ingredient that is not common to all packages" and "on the condition that
 *   the label shall bear, in conjunction with the names of such ingredients as are
 *   common to all packages, a statement (in terms that are as informative as
 *   practicable and that are not misleading) indicating by name other ingredients
 *   which may be present". Declared with that statement and the names it must
 *   carry; the list holds the ingredients common to all packages.
 * - `bulk-at-retail` — (a)(2): "A food having been received in bulk containers at
 *   a retail establishment", displayed with the bulk container's labeling in view
 *   or a counter card or sign, either way in lettering "not less than one-fourth
 *   of an inch in height". The condition is on the display, not on this label.
 *
 * **Not offered, and why.** (a)(3) excuses incidental additives from the list
 * rather than the list itself, so nothing is claimed by leaving them out. (b), (c)
 * and (h) exempt other requirements, and (d) a shipment in transit rather than a
 * retail label.
 */
export const US_FOOD_INGREDIENTS_EXEMPTIONS_CLAIMED_ALONE = ['bulk-at-retail'] as const

/** Every kind, the one declared with particulars included. */
export const US_FOOD_INGREDIENTS_EXEMPTIONS = [
  ...US_FOOD_INGREDIENTS_EXEMPTIONS_CLAIMED_ALONE,
  'assortment',
] as const
export type UsFoodIngredientsExemptionKind = (typeof US_FOOD_INGREDIENTS_EXEMPTIONS)[number]

/** § 101.100(a)(1): the statement the label bears, and the names it must carry. */
export interface UsFoodAssortmentExemption {
  kind: 'assortment'
  /** Printed as typed. The regulation prescribes no wording, only what it must name. */
  statement: string
  /** The other ingredients that may be present, each of which the statement must name. */
  mayBePresent: readonly string[]
}

export type UsFoodIngredientsExemption =
  | { kind: (typeof US_FOOD_INGREDIENTS_EXEMPTIONS_CLAIMED_ALONE)[number] }
  | UsFoodAssortmentExemption

/**
 * The 21 CFR 101.9(j) exemptions from nutrition labelling a label can claim.
 *
 * Source: 21 CFR 101.9(j), read from the eCFR on 2026-09-16. Each is named for the
 * paragraph that grants it, and `rules/usFood/nutritionFacts.ts` cites that
 * paragraph and says which of its conditions are not checked:
 *
 * - `small-business` — (j)(1), sales by a person making direct sales to consumers.
 * - `food-service` — (j)(2), food served, sold or used in establishments serving
 *   food for immediate human consumption, or sold by a distributor to them.
 * - `retail-prepared` — (j)(3), ready-to-eat food processed and prepared primarily
 *   in a retail establishment and not offered for sale outside it.
 * - `insignificant-nutrients` — (j)(4), food containing insignificant amounts of
 *   all the nutrients and food components (c) requires.
 * - `medical-food` — (j)(8), a medical food as the Orphan Drug Act defines it,
 *   "subject to this exemption only if" it meets five conditions on how it is
 *   formulated and used.
 * - `bulk-for-manufacture` — (j)(9), food shipped in bulk form, not for
 *   distribution to consumers in that form.
 * - `raw-produce-or-fish` — (j)(10), raw fruits, vegetables and fish subject to
 *   section 403(q)(4) of the act.
 * - `custom-processed-fish-or-game` — (j)(11)(ii): "Nutrition information is not
 *   required for custom processed fish or game meats."
 * - `small-package` — (j)(13)(i), a package with "a total surface area available
 *   to bear labeling of less than 12 square inches", whose label bears "an address
 *   or telephone number that a consumer can use to obtain the required nutrition
 *   information" under (A). The only one declared with particulars: the area, and
 *   the line, which the engine prints and a rule requires.
 * - `unit-container` — (j)(15), a unit container in a multiunit retail package whose
 *   outer package carries the nutrition information, "labeled with the statement
 *   'This Unit Not Labeled For Retail Sale' in type size not less than 1/16-inch in
 *   height" under (iii). Declared with the wording claimed, since "individual" may
 *   stand in lieu of or before "Retail"; the engine prints the statement from
 *   `fda/unitContainerStatement.ts` and a rule measures it. Left out until both
 *   did.
 * - `egg-carton` — (j)(14), shell eggs in a carton with a top lid "designed to
 *   conform to the shape of the eggs", exempt from outer carton label requirements
 *   "where the required nutrition information is clearly presented immediately
 *   beneath the carton lid or in an insert that can be clearly seen when the carton
 *   is opened". Declared with where it is presented. **The only kind that keeps its
 *   `nutritionFacts`**: the information is relocated, not excused, so it is still
 *   declared and still judged, and the engine draws none of it on the outer carton.
 * - `bulk-at-retail` — (j)(16), food sold from bulk containers.
 * - `low-volume` — (j)(18), low-volume products of a small business.
 *
 * **Not offered, and why.** Some paragraphs are not exemptions from nutrition
 * labelling: (j)(5) sets what foods for infants and young children declare, (j)(6)
 * and (j)(7) move dietary supplements and infant formula to § 101.36 and part 107,
 * and (j)(11)(i), (j)(12) and (j)(17) permit where or on what basis the information
 * is given rather than excusing it. The first draft of this list offered (j)(14)
 * as though it excused the panel, and called (j)(8) and (j)(11) not exemptions at
 * all; a review of it read the paragraphs again. (j)(14) is offered now on the
 * reading that review reached, with its nutrition information kept.
 */
export const US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE = [
  'small-business',
  'food-service',
  'retail-prepared',
  'insignificant-nutrients',
  'medical-food',
  'bulk-for-manufacture',
  'raw-produce-or-fish',
  'custom-processed-fish-or-game',
  'bulk-at-retail',
  'low-volume',
] as const

/** Every kind, those declared with particulars included. */
export const US_FOOD_NUTRITION_EXEMPTIONS = [
  ...US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE,
  'small-package',
  'unit-container',
  'egg-carton',
] as const
export type UsFoodNutritionExemptionKind = (typeof US_FOOD_NUTRITION_EXEMPTIONS)[number]

/** 101.9(j)(13)(i): the area that qualifies the package, and the line (A) requires. */
export interface UsFoodSmallPackageExemption {
  kind: 'small-package'
  /** The *package's* total surface area available to bear labeling — not this label's. */
  availableSurfaceSqInches: number
  /** Printed as typed, e.g. "For nutrition information, call 1-800-123-4567". */
  contactLine: string
}

/** Where (j)(14) lets an egg carton present its nutrition information. */
export const US_FOOD_EGG_CARTON_PRESENTATIONS = ['beneath-lid', 'insert'] as const
export type UsFoodEggCartonPresentation = (typeof US_FOOD_EGG_CARTON_PRESENTATIONS)[number]

/** Each place in (j)(14)'s own words, for the omission, the finding and the editor to quote. */
export const US_FOOD_EGG_CARTON_PRESENTED: Record<UsFoodEggCartonPresentation, string> = {
  'beneath-lid': 'immediately beneath the carton lid',
  insert: 'in an insert that can be clearly seen when the carton is opened',
}

/** 101.9(j)(14): where the carton's nutrition information is presented instead. */
export interface UsFoodEggCartonExemption {
  kind: 'egg-carton'
  presentedIn: UsFoodEggCartonPresentation
}

/** 101.9(j)(15): which of the wordings (iii) permits the unit bears. */
export interface UsFoodUnitContainerExemption {
  kind: 'unit-container'
  wording: UnitContainerWording
}

export type UsFoodNutritionExemption =
  | { kind: (typeof US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE)[number] }
  | UsFoodSmallPackageExemption
  | UsFoodUnitContainerExemption
  | UsFoodEggCartonExemption

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
    /**
     * What the second column declares, per nutrient.
     *
     * **Declared, not derived.** The obvious arithmetic — multiply the serving
     * figures by the number of servings in the package — is exactly the kind this
     * engine refuses to do on a labeller's behalf, for the reason the SI net
     * quantity is typed rather than converted: a regulated figure this tool
     * computed confidently and wrongly is worse than one it never printed, and
     * rounding under (c) is applied to each declared amount in its own right
     * rather than to a product of two.
     */
    secondAmounts?: Partial<Record<NutrientId, number>>
    /**
     * 101.9(e)(3)'s vertical lines, drawn unless the label says otherwise.
     *
     * It exists so the panel can be drawn **wrong**, which is the same reason
     * `typeScale` exists: the lines are a requirement, so a panel that always
     * draws them complies by construction and the rule that checks them could
     * never fail. Dropping them to save width is also the realistic way this goes
     * wrong on a crowded label.
     */
    separated?: boolean
    /**
     * A multiplier on the second column's type size. 101.9(e) requires "equal
     * prominence ... to both sets of values", so anything but 1 is a defect a
     * rule reports — and setting the package column smaller than the serving one
     * is precisely how a designer de-emphasises a figure they would rather a
     * reader skipped.
     */
    secondColumnTypeScale?: number
  }
  /**
   * The applicable reference amount from **§101.12(b)**, where the label states
   * it.
   *
   * Declared, never inferred. The Reference Amounts Customarily Consumed table is
   * roughly 140 food categories and this project does not carry it, so the two
   * mandatory dual-column provisions take the figure from the label the same way
   * `cannotAccommodateVertical` and the §101.100 exemption are taken — and the
   * rules that use it decline entirely when it is absent, because a rule that
   * reports a label for *not* carrying a second column must only fire on facts
   * the label has asserted.
   *
   * `category` is recorded so a finding can say which row of the table the figure
   * claims to come from.
   */
  referenceAmount?: { amount: number; unit: 'g' | 'mL'; category: string }
  /** What the whole package holds, in the reference amount's unit — (b)(12)(i). */
  packageContent?: number
  /** What one individual unit weighs, in the same unit — (b)(2)(i)(D). */
  unitContent?: number
  /** (b)(12)(i) reaches only products "packaged and sold individually". */
  packagedAndSoldIndividually?: boolean
  /**
   * The two (b)(12)(i) exemptions that are facts about a product rather than
   * about a label. (A) is computed from the package's own format entitlement and
   * most of (C) falls out of `columns.basis`, so neither is declared here.
   */
  dualColumnExemption?: {
    /** (B) — raw fruits, vegetables and seafood under voluntary labelling. */
    rawCommodityVoluntary?: boolean
    /** (C)'s closing limb — varied-weight products under (b)(8)(iii). */
    variedWeight?: boolean
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
   * Which § 101.100 exemption from ingredient labelling the label claims, where
   * it claims one. Stated by the supplier and never inferred, like the GHS
   * small-container provision. See `US_FOOD_INGREDIENTS_EXEMPTIONS`.
   */
  ingredientsExemption?: UsFoodIngredientsExemption
  /**
   * **Superseded by `ingredientsExemption`, and read only so a label saved with it
   * still opens.** A bare "exempt" named no paragraph, so no rule could ask what
   * that paragraph requires of the label. It now excuses the missing list and
   * draws an advisory asking which exemption is claimed, rather than a pass.
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
   * Which 21 CFR 101.9(j) exemption from nutrition labelling the label claims,
   * where it claims one. Stated and never inferred. See
   * `US_FOOD_NUTRITION_EXEMPTIONS`.
   */
  nutritionExemption?: UsFoodNutritionExemption
  /**
   * **Superseded by `nutritionExemption`, and read only so a label saved with it
   * still opens.** It excuses the missing panel and draws an advisory asking which
   * paragraph is claimed, rather than a pass.
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
