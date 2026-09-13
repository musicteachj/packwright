/**
 * The nine major food allergens.
 *
 * In `fda/` rather than `usFood/` because that is what this layer is named for
 * elsewhere: `gs1/` carries GS1's reference data and `ghs/` carries GHS's, so
 * the regulator's own abbreviation is the convention. The label *type* stays
 * `us-food`; the body that defines its content is the FDA.
 *
 * Source: **FD&C Act §201(qq) / 21 U.S.C. 321(qq)(1)**, read from the US Code on
 * 2026-09-12. Verbatim: "Milk, egg, fish (e.g., bass, flounder, or cod),
 * Crustacean shellfish (e.g., crab, lobster, or shrimp), tree nuts (e.g.,
 * almonds, pecans, or walnuts), wheat, peanuts, soybeans, and sesame."
 *
 * **These are statute, not regulation, and they are genuinely not in 21 CFR
 * part 101.** The whole part contains no definition of "major food allergen" —
 * the definition arrived with FALCPA in 2004 and sesame with the FASTER Act in
 * 2021, both as amendments to the Act itself. A rule citing a CFR section for
 * them would be citing a section that does not say it.
 *
 * The names below are the statute's own words and are looked up, never composed.
 * "Crustacean shellfish" is capitalised as the Act capitalises it; "tree nuts"
 * and "soybeans" are plural there and singular nowhere. A label reading
 * "Contains: Shellfish" has not declared what the Act asks for.
 *
 * §321(qq)(2) extends the definition to any ingredient containing protein
 * derived from one of the nine, excepting highly refined oils and ingredients
 * exempted under §403(w)(6) or (7). Those exemptions are granted per ingredient
 * by petition or notification to the Secretary and are published by FDA — they
 * are facts about a docket, not about a label, so nothing here infers them.
 */

/** Stable ids. The *names* are the regulated strings; these are not. */
export const MAJOR_FOOD_ALLERGEN_IDS = [
  'milk',
  'egg',
  'fish',
  'crustacean-shellfish',
  'tree-nuts',
  'wheat',
  'peanuts',
  'soybeans',
  'sesame',
] as const
export type MajorFoodAllergenId = (typeof MAJOR_FOOD_ALLERGEN_IDS)[number]

export interface MajorFoodAllergen {
  id: MajorFoodAllergenId
  /** The food source name as §321(qq)(1) writes it. Never paraphrased. */
  name: string
  /**
   * Whether §403(w)(2) demands the specific type rather than the category:
   * "in the case of a tree nut, fish, or Crustacean shellfish, the term 'name of
   * the food source from which the major food allergen is derived' means the
   * name of the specific type of nut or species of fish or Crustacean
   * shellfish." So "Contains: tree nuts" is not a declaration; "Contains:
   * almonds" is.
   */
  requiresSpecificType: boolean
  /** The examples the statute itself gives, for the form to offer. */
  examples: readonly string[]
}

export const MAJOR_FOOD_ALLERGENS: readonly MajorFoodAllergen[] = [
  { id: 'milk', name: 'milk', requiresSpecificType: false, examples: [] },
  { id: 'egg', name: 'egg', requiresSpecificType: false, examples: [] },
  {
    id: 'fish',
    name: 'fish',
    requiresSpecificType: true,
    examples: ['bass', 'flounder', 'cod'],
  },
  {
    id: 'crustacean-shellfish',
    name: 'Crustacean shellfish',
    requiresSpecificType: true,
    examples: ['crab', 'lobster', 'shrimp'],
  },
  {
    id: 'tree-nuts',
    name: 'tree nuts',
    requiresSpecificType: true,
    examples: ['almonds', 'pecans', 'walnuts'],
  },
  { id: 'wheat', name: 'wheat', requiresSpecificType: false, examples: [] },
  { id: 'peanuts', name: 'peanuts', requiresSpecificType: false, examples: [] },
  { id: 'soybeans', name: 'soybeans', requiresSpecificType: false, examples: [] },
  { id: 'sesame', name: 'sesame', requiresSpecificType: false, examples: [] },
]

const BY_ID = new Map(MAJOR_FOOD_ALLERGENS.map((allergen) => [allergen.id, allergen]))

/** Undefined for an id the table does not carry, rather than a fabricated name. */
export function majorFoodAllergen(id: string): MajorFoodAllergen | undefined {
  return BY_ID.get(id as MajorFoodAllergenId)
}

/**
 * The food source name a declaration must carry for this allergen.
 *
 * For the six that need no specific type this is the table's name. For the three
 * that do, it is whatever specific type the ingredient declared — and `undefined`
 * where none was, because inventing "almonds" for an unspecified tree nut would
 * be this engine composing the regulated string it exists to check.
 */
export function foodSourceName(id: MajorFoodAllergenId, specificType?: string): string | undefined {
  const allergen = BY_ID.get(id)
  if (allergen === undefined) return undefined
  if (!allergen.requiresSpecificType) return allergen.name
  const specific = specificType?.trim()
  return specific === undefined || specific === '' ? undefined : specific
}
