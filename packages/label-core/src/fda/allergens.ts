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
 * **A label may name the source in the singular: "peanut", "soybean".** §403(w)(1)
 * asks for "the name of the food source", and the singular of the statute's own name
 * is that name (James, 2026-10-17, decision A of `docs/verification-2026-10-17.md`).
 * So `alsoNamed` is searched for beside `name`, and only `name` is ever printed.
 * "soy" and "soya" are not the statute's words, and only FDA's nonbinding allergen
 * guidance (Edition 5) accepts them, so they are not here and a label relying on them
 * is reported. Re-read from govinfo (21 U.S.C. 321(qq)(1) and 343(w), 2024 edition,
 * identical to the 2023 text) on 2026-10-17.
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
  /**
   * What names only the category, where a specific type is required: the statute's own
   * name, its singular, the bare words it is built from, and the collective names that
   * stand for the category on a label ("mixed nuts", "seafood"). §403(w)(2) asks for "the
   * specific type of nut or species of fish or Crustacean shellfish", so a specific type
   * of "tree nuts" or "shellfish" is not one. Matched whole, with case, spaces, hyphens
   * and punctuation folded out ("tree-nuts", "Shell fish."), so "pecan nuts" and
   * "Atlantic cod" still count: these are the category's words, not a judgment of which
   * species names are real.
   */
  categoryNames?: readonly string[]
  /** Other forms of `name` a declaration may use, searched for and never printed. */
  alsoNamed?: readonly string[]
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
    categoryNames: ['fish', 'fishes', 'seafood'],
    examples: ['bass', 'flounder', 'cod'],
  },
  {
    id: 'crustacean-shellfish',
    name: 'Crustacean shellfish',
    requiresSpecificType: true,
    categoryNames: [
      'crustacean shellfish',
      'crustacean shellfishes',
      'shellfish',
      'shellfishes',
      'crustacean',
      'crustaceans',
      'seafood',
    ],
    examples: ['crab', 'lobster', 'shrimp'],
  },
  {
    id: 'tree-nuts',
    name: 'tree nuts',
    requiresSpecificType: true,
    categoryNames: [
      'tree nuts',
      'tree nut',
      'nuts',
      'nut',
      'mixed nuts',
      'assorted nuts',
      'mixed tree nuts',
      'assorted tree nuts',
    ],
    examples: ['almonds', 'pecans', 'walnuts'],
  },
  { id: 'wheat', name: 'wheat', requiresSpecificType: false, examples: [] },
  {
    id: 'peanuts',
    name: 'peanuts',
    requiresSpecificType: false,
    alsoNamed: ['peanut'],
    examples: [],
  },
  {
    id: 'soybeans',
    name: 'soybeans',
    requiresSpecificType: false,
    alsoNamed: ['soybean'],
    examples: [],
  },
  { id: 'sesame', name: 'sesame', requiresSpecificType: false, examples: [] },
]

const BY_ID = new Map(MAJOR_FOOD_ALLERGENS.map((allergen) => [allergen.id, allergen]))

/** Undefined for an id the table does not carry, rather than a fabricated name. */
export function majorFoodAllergen(id: string): MajorFoodAllergen | undefined {
  return BY_ID.get(id as MajorFoodAllergenId)
}

/** Letters only, lower case: "Tree-nuts." and "tree  nuts" both read "treenuts". */
const lettersOf = (text: string): string => text.toLowerCase().replace(/[^a-z]/g, '')

/** Whether a stated specific type is only the category's own name: "tree nuts", "shellfish". */
export function namesOnlyTheCategory(id: MajorFoodAllergenId, specificType?: string): boolean {
  const folded = lettersOf(specificType ?? '')
  if (folded === '') return false
  return (BY_ID.get(id)?.categoryNames ?? []).some((name) => lettersOf(name) === folded)
}

/**
 * The food source name a declaration must carry for this allergen.
 *
 * For the six that need no specific type this is the table's name. For the three
 * that do, it is whatever specific type the ingredient declared — and `undefined`
 * where none was, because inventing "almonds" for an unspecified tree nut would
 * be this engine composing the regulated string it exists to check. `undefined` too
 * where the type stated only names the category, which §403(w)(2) says is not one.
 */
export function foodSourceName(id: MajorFoodAllergenId, specificType?: string): string | undefined {
  const allergen = BY_ID.get(id)
  if (allergen === undefined) return undefined
  if (!allergen.requiresSpecificType) return allergen.name
  const specific = specificType?.trim()
  if (specific === undefined || specific === '') return undefined
  return namesOnlyTheCategory(id, specific) ? undefined : specific
}

/**
 * Every form of the food source name a declaration may carry: the name printed, then
 * the forms decision A accepts beside it. `undefined` where `foodSourceName` is.
 */
export function foodSourceNames(
  id: MajorFoodAllergenId,
  specificType?: string,
): readonly string[] | undefined {
  const source = foodSourceName(id, specificType)
  if (source === undefined) return undefined
  return [source, ...(BY_ID.get(id)?.alsoNamed ?? [])]
}
