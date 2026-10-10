/**
 * The labels given to a model with no tool, for the MCP "without" experiment.
 *
 * Each case is a **conformant label with one known defect** taken from a rule
 * fixture in `packages/label-core/src/rules/fixtures/`. The fixtures themselves
 * are minimal documents — the GHS base has no hazard statement and no supplier —
 * because each exists to provoke one rule. Sent as they are, a model would
 * rightly report a dozen absences and the planted defect would be lost among
 * them. So each document here starts from the conformant base for its label type
 * and changes only what the fixture changes.
 *
 * `expected` is copied verbatim from the fixture named in `fixtureName`: it was
 * written from the regulation when the rule was, and is the ground truth this
 * experiment grades against. `run.cli.ts` refuses to start unless the engine
 * still raises that code on the document below, so a document that lost its
 * defect in the copying cannot be sent.
 *
 * `facts` are what a designer would know and say that is **not** printed: the
 * container, the label's size, the classification, the recipe. Everything printed
 * is read from the engine's own layout rather than written here, so the text a
 * model sees is the text the engine draws.
 *
 * One departure from the plan agreed on 2026-10-09: the fixture "the environment
 * pictogram on a US label" was dropped. `docs/BACKLOG.md` records that whether
 * printing GHS09 on a US label is a violation is open — OSHA's own QuickCard calls
 * the pictogram non-mandatory — so it cannot be ground truth. "A container too
 * large for the provision it claims" took its place.
 */

import {
  FDA_ALLERGEN_SOURCE_NOT_SPECIFIC,
  FDA_INGREDIENTS_OUT_OF_ORDER,
  FDA_NET_QUANTITY_METRIC_MISSING,
  GHS_LABEL_BELOW_MINIMUM_SIZE,
  GHS_PICTOGRAM_PRECEDENCE_VIOLATED,
  GHS_SIGNAL_WORD_CONFLICT,
  GHS_SMALL_CONTAINER_INCOMPLETE,
  GHS_SMALL_CONTAINER_NOT_ELIGIBLE,
  GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS,
  GS1_GTIN_CHECK_DIGIT_INVALID,
  NUTRIENT_IDS,
  type GhsLabelData,
  type LabelStock,
  type UpcALabelData,
  type UsFoodIngredient,
  type UsFoodLabelData,
  type UsFoodNutritionFacts,
} from '@packwright/label-core'

export type CaseLabel =
  | { labelType: 'ghs-chemical'; data: GhsLabelData; stock: LabelStock }
  | { labelType: 'gs1-retail'; data: UpcALabelData; stock: LabelStock }
  | { labelType: 'us-food'; data: UsFoodLabelData; stock: LabelStock }

export interface ExperimentCase {
  /** Stable, sortable, and used as the key in `responses.jsonl`. */
  id: string
  /** Completes "I'm preparing this label for sale in …". */
  market: string
  /** The fixture this case's defect comes from, by its `name`, or the conformant control. */
  fixtureName: string
  /** Copied from the fixture. `null` for a control. */
  expected: { code: string; citation: string } | null
  /** What a designer knows that is not printed. */
  facts: readonly string[]
  label: CaseLabel
  /** Where the prompt departs from what the engine draws, or the engine reports more than the defect, and why. */
  note?: string
}

// ---------------------------------------------------------------------------
// GHS bases. `GHS_CONFORMANT` in `fixtures/ghs.ts`, with a telephone number,
// which CLP Article 17(1)(a) names and the conformant fixture omits only because
// no rule reads it; and with P-statements that carry no "…" placeholders, so the
// label is not incomplete in a way the experiment did not intend.
// ---------------------------------------------------------------------------

/** The Annex V ids `fixtures/ghs.ts` names in `HAZARDS`. */
const HAZARDS = {
  flammableLiquid: '2.6/flammable-liquids-1-2-3',
  skinIrritation: '3.2/skin-irritation-2',
  seriousEyeDamage: '3.3/serious-eye-damage-1',
} as const

const EU_SUPPLIER = {
  name: 'Example Chemicals Ltd',
  address: '1 Example Way, Leeds LS1 4AB, United Kingdom',
  telephone: '+44 113 496 0000',
} as const

const EU_FLAMMABLE: GhsLabelData = {
  regime: 'eu-clp',
  productIdentifier: 'Example solvent',
  capacityL: 5,
  signalWords: ['Danger'],
  hazards: [HAZARDS.flammableLiquid],
  hazardStatementCodes: ['H225'],
  precautionaryStatementCodes: ['P210', 'P233', 'P240', 'P403 + P235'],
  supplier: EU_SUPPLIER,
}

/** 74 x 105 mm — the CLP minimum for the 3-to-50-litre band. */
const GHS_STOCK: LabelStock = { widthMm: 74, heightMm: 105, marginMm: 4 }

const US_SUPPLIER = {
  name: 'Example Chemicals Inc',
  address: '1 Example Way, Portland, OR 97201',
  telephone: '(503) 555-0100',
} as const

const US_FLAMMABLE: GhsLabelData = {
  ...EU_FLAMMABLE,
  regime: 'us-osha',
  supplier: US_SUPPLIER,
}

const US_STATEMENTS_NOTE =
  'The document carries H225 and four P-statements, and the engine draws none of them: it holds no verified US ' +
  'wording. A reduced small-container label under 1910.1200(f)(12)(ii) does not require them, so neither ' +
  'planted defect depends on it.'

const FLAMMABLE_FACTS = [
  'Classification: flammable liquid, category 2.',
  'The product is a mixture sold in a metal can.',
] as const

// ---------------------------------------------------------------------------
// US food base. `BASE` in `fixtures/usFood.ts`, copied: the fixtures are not
// exported from the package, and this experiment must not reach into its
// source tree. The nutrition figures are 101.9(d)(8)'s own worked example.
// ---------------------------------------------------------------------------

const BASE_INGREDIENTS: readonly UsFoodIngredient[] = [
  { name: 'whole grain rolled oats', percentByWeight: 90 },
  {
    name: 'almonds',
    percentByWeight: 7,
    allergen: 'tree-nuts',
    allergenSpecificType: 'almonds',
    declareInline: true,
  },
  { name: 'sugar', percentByWeight: 2 },
  { name: 'salt', percentByWeight: 1 },
]

const BASE_NUTRITION: UsFoodNutritionFacts = {
  servingSize: '1/2 cup (40g)',
  servingsPerContainer: 8,
  amounts: {
    calories: 150,
    'total-fat': 3,
    'saturated-fat': 0.5,
    'trans-fat': 0,
    cholesterol: 0,
    sodium: 0,
    'total-carbohydrate': 27,
    'dietary-fiber': 4,
    'total-sugars': 1,
    'added-sugars': 0,
    protein: 5,
    'vitamin-d': 2,
    calcium: 260,
    iron: 8,
    potassium: 235,
  },
  declaredAmounts: {
    calories: 150,
    'total-fat': 3,
    'saturated-fat': 0.5,
    'trans-fat': 0,
    cholesterol: 0,
    sodium: 0,
    'total-carbohydrate': 27,
    'dietary-fiber': 4,
    'total-sugars': 1,
    'added-sugars': 0,
    protein: 5,
  },
  declaredPercentDv: {
    'total-fat': 4,
    'saturated-fat': 3,
    cholesterol: 0,
    sodium: 0,
    'total-carbohydrate': 10,
    'dietary-fiber': 14,
    'added-sugars': 0,
    'vitamin-d': 10,
    calcium: 20,
    iron: 45,
    potassium: 6,
  },
  order: [...NUTRIENT_IDS],
}

const US_FOOD: UsFoodLabelData = {
  statementOfIdentity: 'Oat and almond granola',
  container: { shape: 'rectangular', widthMm: 120, heightMm: 240 },
  netQuantity: { inchPound: 'NET WT 12 OZ', metric: '(340 g)' },
  ingredients: BASE_INGREDIENTS,
  ingredientThreshold: { percent: 2, count: 2 },
  containsStatement: ['tree-nuts'],
  nutritionFacts: BASE_NUTRITION,
  responsibleFirm: {
    name: 'Example Foods Inc',
    isManufacturer: true,
    streetAddress: '1 Example Way',
    city: 'Portland',
    state: 'OR',
    zip: '97201',
  },
}

const US_FOOD_STOCK: LabelStock = { widthMm: 120, heightMm: 240, marginMm: 6 }

/**
 * No recipe, except where the defect cannot be seen without one (case 08).
 *
 * The pilot of 2026-10-09 showed why. The panel is 101.9(d)(8)'s worked example
 * — sodium 0 mg among it — and a stated 1 percent of salt contradicts it, so a
 * recipe made the control a label with a real defect the experiment had put
 * there itself. Case 08's prompt keeps its recipe and was not changed.
 */
const US_FOOD_FACTS = [
  'Package: a rectangular carton; this label covers its 120 x 240 mm front panel.',
  'It is an ordinary packaged food sold at retail.',
] as const

// ---------------------------------------------------------------------------

export const CASES: readonly ExperimentCase[] = [
  {
    id: '01-clp-pictogram-precedence',
    market: 'the European Union',
    fixtureName: 'corrosion alongside an exclamation mark raised by skin irritation',
    expected: {
      code: GHS_PICTOGRAM_PRECEDENCE_VIOLATED,
      citation: 'Regulation (EC) No 1272/2008 (CLP), Article 26(1)',
    },
    facts: [
      'Classification: serious eye damage, category 1; skin irritation, category 2.',
      'The product is a mixture sold in a 5 litre plastic container.',
    ],
    label: {
      labelType: 'ghs-chemical',
      data: {
        ...EU_FLAMMABLE,
        productIdentifier: 'Example descaler',
        hazards: [HAZARDS.seriousEyeDamage, HAZARDS.skinIrritation],
        pictograms: ['GHS05', 'GHS07'],
        hazardStatementCodes: ['H318', 'H315'],
        precautionaryStatementCodes: ['P305 + P351 + P338', 'P332 + P313'],
      },
      stock: GHS_STOCK,
    },
  },
  {
    id: '02-clp-both-signal-words',
    market: 'the European Union',
    fixtureName: 'both signal words',
    expected: {
      code: GHS_SIGNAL_WORD_CONFLICT,
      citation: 'Regulation (EC) No 1272/2008 (CLP), Article 20(3)',
    },
    facts: [...FLAMMABLE_FACTS, 'Container: 5 litres.'],
    label: {
      labelType: 'ghs-chemical',
      data: { ...EU_FLAMMABLE, signalWords: ['Danger', 'Warning'] },
      stock: GHS_STOCK,
    },
  },
  {
    id: '03-clp-label-too-small',
    market: 'the European Union',
    fixtureName: 'a label smaller than its capacity band allows',
    expected: {
      code: GHS_LABEL_BELOW_MINIMUM_SIZE,
      citation: 'Regulation (EC) No 1272/2008 (CLP), Annex I, 1.2.1.4, Table 1.3',
    },
    facts: [...FLAMMABLE_FACTS, 'Container: 5 litres.', 'The label is 50 x 70 mm.'],
    note:
      'At its default type size the engine overruns a 50 x 70 mm label and records the precautionary ' +
      'statements and supplier as not printed. The prompt lists every line regardless: it is the ' +
      'document a designer means to print, set smaller, and the defect under test is the size.',
    label: {
      labelType: 'ghs-chemical',
      data: EU_FLAMMABLE,
      stock: { widthMm: 50, heightMm: 70, marginMm: 3 },
    },
  },
  {
    id: '04-osha-small-container-too-large',
    market: 'the United States (OSHA Hazard Communication)',
    fixtureName: 'a container too large for the provision it claims',
    expected: {
      code: GHS_SMALL_CONTAINER_NOT_ELIGIBLE,
      citation: '29 CFR 1910.1200(f)(12)',
    },
    facts: [
      ...FLAMMABLE_FACTS,
      'Container: 500 ml.',
      'Because the container is small, we use the reduced small-container label; the full label is on the outer carton.',
    ],
    note: US_STATEMENTS_NOTE,
    label: {
      labelType: 'ghs-chemical',
      data: {
        ...US_FLAMMABLE,
        capacityL: 0.5,
        smallContainerLabelling: true,
        outerPackageStatement: 'Full label information is on the outer package.',
      },
      stock: GHS_STOCK,
    },
  },
  {
    id: '05-osha-small-container-no-phone',
    market: 'the United States (OSHA Hazard Communication)',
    fixtureName: 'a small container missing the phone number the provision names',
    expected: {
      code: GHS_SMALL_CONTAINER_INCOMPLETE,
      citation: '29 CFR 1910.1200(f)(12)',
    },
    facts: [
      ...FLAMMABLE_FACTS,
      'Container: 50 ml.',
      'Because the container is small, we use the reduced small-container label; the full label is on the outer carton.',
    ],
    note: US_STATEMENTS_NOTE,
    label: {
      labelType: 'ghs-chemical',
      data: {
        ...US_FLAMMABLE,
        capacityL: 0.05,
        smallContainerLabelling: true,
        supplier: { name: US_SUPPLIER.name, address: US_SUPPLIER.address },
        outerPackageStatement: 'Full label information is on the outer package.',
      },
      stock: GHS_STOCK,
    },
  },
  {
    id: '06-gs1-check-digit',
    market: 'US retail stores',
    fixtureName: 'transposed check digit',
    expected: {
      code: GS1_GTIN_CHECK_DIGIT_INVALID,
      citation: 'GS1 General Specifications 26.0 §7.9.1',
    },
    facts: ['This is the barcode label for a retail product; the GTIN was assigned from our GS1 US company prefix.'],
    note:
      'Described from the document: the engine refuses to draw a UPC-A whose check digit is wrong, ' +
      'so its layout prints nothing.',
    label: {
      labelType: 'gs1-retail',
      data: { gtin: '036000291453' },
      stock: { widthMm: 60, heightMm: 40, marginMm: 3 },
    },
  },
  {
    id: '07-gs1-digital-link-alphas',
    market: 'US retail stores',
    fixtureName: 'Digital Link using the removed convenience alphas',
    expected: {
      code: GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS,
      citation: 'GS1 Digital Link URI Syntax 1.7.0 §4.1',
    },
    facts: [
      'This is the barcode label for a retail product; the GTIN was assigned from our GS1 US company prefix.',
      'The QR code is a GS1 Digital Link for the same product.',
    ],
    note:
      'Described from the document: the engine draws no carrier for a Digital Link. The URI is ' +
      'built by the same `buildDigitalLinkUri` the rule calls.',
    label: {
      labelType: 'gs1-retail',
      data: {
        gtin: '036000291452',
        digitalLink: { domain: 'https://id.example.com', useConvenienceAlphas: true },
      },
      stock: { widthMm: 60, heightMm: 40, marginMm: 3 },
    },
  },
  {
    id: '08-fda-ingredient-order',
    market: 'the United States',
    fixtureName: 'salt listed before the sugar there is more of',
    expected: { code: FDA_INGREDIENTS_OUT_OF_ORDER, citation: '21 CFR 101.4(a)(1)' },
    facts: [...US_FOOD_FACTS, 'Recipe by weight: rolled oats 97%, sugar 2%, salt 0.7%.'],
    label: {
      labelType: 'us-food',
      data: {
        ...US_FOOD,
        statementOfIdentity: 'Oat granola',
        ingredients: [
          { name: 'whole grain rolled oats', percentByWeight: 97 },
          { name: 'salt', percentByWeight: 0.7 },
          { name: 'sugar', percentByWeight: 2 },
        ],
        ingredientThreshold: { percent: 2, count: 0 },
        containsStatement: [],
      },
      stock: US_FOOD_STOCK,
    },
  },
  {
    id: '09-fda-tree-nut-type',
    market: 'the United States',
    fixtureName: 'a tree nut declared as "tree nuts"',
    expected: { code: FDA_ALLERGEN_SOURCE_NOT_SPECIFIC, citation: 'FD&C Act §403(w)(2)' },
    facts: [...US_FOOD_FACTS, 'The nut pieces are almonds.'],
    note:
      'The engine prints no "Contains" line here — it will not invent a source name for "nut ' +
      'pieces" — so the label names no allergen at all. Graded as caught only where the answer says ' +
      'the specific tree nut, almonds, must be named; "declare tree nuts" alone is partly.',
    label: {
      labelType: 'us-food',
      data: {
        ...US_FOOD,
        ingredients: BASE_INGREDIENTS.map((ingredient) => {
          if (ingredient.allergen !== 'tree-nuts') return { ...ingredient }
          const { allergenSpecificType: _dropped, ...rest } = ingredient
          return { ...rest, name: 'nut pieces' }
        }),
      },
      stock: US_FOOD_STOCK,
    },
  },
  {
    id: '10-fpla-metric-missing',
    market: 'the United States',
    fixtureName: 'net weight in ounces only',
    expected: { code: FDA_NET_QUANTITY_METRIC_MISSING, citation: '15 U.S.C. 1453(a)(2)' },
    facts: US_FOOD_FACTS,
    label: {
      labelType: 'us-food',
      data: { ...US_FOOD, netQuantity: { inchPound: 'NET WT 12 OZ' } },
      stock: US_FOOD_STOCK,
    },
  },
  {
    id: 'C1-clp-control',
    market: 'the European Union',
    fixtureName: 'GHS_CONFORMANT',
    expected: null,
    note:
      'The engine reports GHS_PICTOGRAM_SYMBOL_MISSING here because it has no verified pictogram ' +
      'artwork and draws empty frames. The prompt describes the GHS02 flame as printed, so that ' +
      'finding is about the engine, not this label.',
    facts: [...FLAMMABLE_FACTS, 'Container: 5 litres.'],
    label: { labelType: 'ghs-chemical', data: EU_FLAMMABLE, stock: GHS_STOCK },
  },
  {
    id: 'C2-fda-control',
    market: 'the United States',
    fixtureName: 'US_FOOD_CONFORMANT',
    expected: null,
    facts: US_FOOD_FACTS,
    label: { labelType: 'us-food', data: US_FOOD, stock: US_FOOD_STOCK },
  },
]
