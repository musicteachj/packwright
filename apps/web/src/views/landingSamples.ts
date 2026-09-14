import type { GhsLabelData, UsFoodLabelData } from '@packwright/label-core'

/**
 * Showcase documents, declared here rather than borrowed from the store.
 *
 * The editor's seeds exist to be edited: they open on a label the rules pass so
 * that changing a field is what makes it fail. These exist to be looked at. The
 * two want different things, and sharing them would mean a change to the
 * editor's starting point silently redrawing the front door.
 */
export const GHS_SAMPLE: GhsLabelData = {
  regime: 'eu-clp',
  productIdentifier: 'Acetone, technical grade',
  capacityL: 5,
  signalWords: ['Danger'],
  pictograms: ['GHS02', 'GHS07'],
  hazardStatementCodes: ['H225', 'H319'],
  precautionaryStatementCodes: ['P210', 'P233', 'P280'],
  supplier: { name: 'Example Chemicals Ltd', address: '1 Example Way, Leeds LS1 1AA' },
}

/**
 * **`marzipan (almonds)`, not `almonds (almonds)`.**
 *
 * `docs/BACKLOG.md` records the editor's seed declaring an allergen against an
 * ingredient already named for it, which is a demonstration that demonstrates
 * nothing. An ingredient whose name does not reveal its allergen is the case the
 * parenthetical exists for, and the front door is where it is worth showing.
 */
export const FOOD_SAMPLE: UsFoodLabelData = {
  statementOfIdentity: 'Almond marzipan stollen',
  container: { shape: 'rectangular', widthMm: 120, heightMm: 240 },
  netQuantity: { inchPound: 'NET WT 12 OZ', metric: '(340 g)' },
  // The last two really are at or under two percent, because the statement that
  // groups them says so. Copied from the editor's seed with its percentages left
  // alone, it grouped a 10% sugar and a 5% butter behind "2 percent or less" and
  // the engine reported the front door twice for it.
  ingredients: [
    { name: 'enriched wheat flour', percentByWeight: 55, allergen: 'wheat', declareInline: true },
    {
      name: 'marzipan',
      percentByWeight: 30,
      allergen: 'tree-nuts',
      allergenSpecificType: 'almonds',
      declareInline: true,
    },
    { name: 'butter', percentByWeight: 13, allergen: 'milk', declareInline: true },
    { name: 'sugar', percentByWeight: 1.5 },
    { name: 'salt', percentByWeight: 0.5 },
  ],
  ingredientThreshold: { percent: 2, count: 2 },
  containsStatement: ['wheat', 'tree-nuts', 'milk'],
  nutritionFacts: {
    // Eight of these is exactly the declared 340 g. `NET WT 12 OZ` fixes the
    // metric at 340.19 g, so the slice that reconciles is 42.5 and not the 42
    // that left four grams unaccounted for.
    servingSize: '1 slice (42.5g)',
    servingsPerContainer: 8,
    amounts: {
      calories: 170,
      'total-fat': 7,
      'saturated-fat': 2.5,
      'trans-fat': 0,
      cholesterol: 10,
      sodium: 65,
      'total-carbohydrate': 24,
      'dietary-fiber': 2,
      'total-sugars': 14,
      'added-sugars': 10,
      protein: 3,
      'vitamin-d': 0,
      calcium: 40,
      iron: 1,
      potassium: 90,
    },
  },
  responsibleFirm: {
    name: 'Example Bakery Inc',
    isManufacturer: true,
    streetAddress: '1 Example Way',
    city: 'Portland',
    state: 'OR',
    zip: '97201',
  },
}
