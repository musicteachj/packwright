import type { GhsLabelData, UsFoodLabelData } from '@packwright/label-core'

/*
 * Showcase documents, declared here rather than borrowed from the store.
 *
 * The editor's seeds exist to be edited: they open on a label the rules pass so
 * that changing a field is what makes it fail. These exist to be looked at. The
 * two want different things, and sharing them would mean a change to the
 * editor's starting point silently redrawing the front door.
 */
/**
 * **A fictional mixture, not acetone.** This was "Acetone, technical grade" with H225 and
 * H319. Acetone is harmonised in CLP Annex VI (index 606-001-00-8) as Flam. Liq. 2, Eye
 * Irrit. 2 and STOT SE 3, so its label needs H336 and the supplemental EUH066 as well, and
 * an identification number beside the name under Article 18(2)(a) — and this engine has no
 * EUH statements, so it cannot draw acetone's label complete.
 *
 * A mixture classified Flam. Liq. 2 and Eye Irrit. 2 comes closer. Those give H225 and H319,
 * GHS02 and GHS07, and "Danger" over "Warning" (Article 20(3)); Article 18(3)(b) asks a
 * mixture's identifier to name its substances only for hazards it lists, eye irritation not
 * among them. The precautionary statements are a selection from the Annex I tables for the
 * two classes — P210 and P233 for the liquid, P280 for both, P305 + P351 + P338 for the eyes
 * — and choosing them is the supplier's under Articles 22 and 28, which this tool does not
 * judge.
 *
 * **Not complete, and no sample can be.** A real hazardous mixture placed on the EU market
 * would carry its UFI (Article 25(7), Annex VIII Part A, 5.1–5.2). The submitter creates the
 * code for a real Annex VIII submission, so a sample could only carry an invented one, which
 * would be worse than none, and this tool has no field for it — `docs/WHAT-IS-NOT-CHECKED.md`
 * says so. Read from the CLP consolidation in force, 02008R1272-20260701, on 2026-10-10.
 */
export const GHS_SAMPLE: GhsLabelData = {
  regime: 'eu-clp',
  productIdentifier: 'Example degreaser',
  capacityL: 5,
  signalWords: ['Danger'],
  pictograms: ['GHS02', 'GHS07'],
  hazardStatementCodes: ['H225', 'H319'],
  precautionaryStatementCodes: ['P210', 'P233', 'P280', 'P305 + P351 + P338'],
  // CLP Article 4(11), applying from 1 July 2026: a supplier established in the Union,
  // identified on the label; and Article 17(1)(a), its telephone number. This sample named a
  // supplier in Leeds with no number, and no rule reads either. See docs/WHAT-IS-NOT-CHECKED.md.
  supplier: {
    name: 'Example Chemicals B.V.',
    address: '1 Voorbeeldstraat, 3011 AA Rotterdam, Netherlands',
    telephone: '+31 10 000 0000',
  },
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
