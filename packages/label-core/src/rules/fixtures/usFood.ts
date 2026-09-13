/**
 * Known-bad US food labels, one per rule.
 *
 * Same contract as `gs1Retail.ts` and `ghs.ts`: a rule without a fixture is a
 * claim, not a check. Each entry asserts the code, the severity **and the exact
 * citation string** — which matters more here than anywhere else so far, because
 * one of these four rules is enforced under a statute rather than under 21 CFR
 * 101, and two of its three outcomes cite different paragraphs of that statute.
 *
 * **Every figure below was worked from the regulation, not from the engine.**
 * The arithmetic, once, so the fixtures can be read rather than trusted:
 *
 * - A 120 × 170 mm panel is 20,400 mm². One square inch is 25.4² = 645.16 mm²,
 *   so the panel is 31.62 in². 21 CFR 101.7(i)(3) covers "more than 25 but not
 *   more than 100" and demands 3/16 inch, which is 0.1875 × 25.4 = 4.7625 mm.
 * - That 4.7625 mm is a *letter* height, and 101.7(h)(2) says which letter.
 *   Capitals stand 0.698 em in IBM Plex Sans and the lowercase "o" 0.540, so the
 *   same requirement needs an em of 4.7625 / 0.698 = 6.823 mm set in capitals
 *   and 4.7625 / 0.540 = 8.819 mm set with any lower case.
 * - Molded rather than printed, 101.7(i)'s closing sentence adds 1/16 inch:
 *   3/16 + 1/16 = 1/4 inch = 6.35 mm, needing 6.35 / 0.698 = 9.097 mm of em.
 * - A cylinder 200 mm tall and 300 mm round has a panel of 0.4 × 200 × 300 =
 *   24,000 mm² = 37.20 in² under 101.1(b) — also the 3/16 inch band, and more
 *   than four times the 60 × 90 mm label wrapped around it.
 * - A 50 × 60 mm panel is 3,000 mm² = 4.65 in², at or under the 5 in² at which
 *   101.7(f) stops requiring the bottom-30 percent placement altogether.
 */

import { NUTRIENT_IDS } from '../../fda/nutrients'
import type { LabelStock } from '../../templates/stock'
import type {
  UsFoodIngredient,
  UsFoodLabelData,
  UsFoodNutritionFacts,
} from '../../templates/usFood'
import type { Severity } from '../../types/index'
import {
  FDA_ALLERGEN_NOT_DECLARED,
  FDA_DUAL_COLUMN_HEADINGS_MISSING,
  FDA_DUAL_COLUMN_INCOMPLETE,
  FDA_DUAL_COLUMN_NOT_SEPARATED,
  FDA_DUAL_COLUMN_UNEQUAL_PROMINENCE,
  FDA_DUAL_COLUMN_MISSING,
  FDA_NUTRITION_MISSING,
  FDA_SERVING_SIZE_MISSING,
  FDA_STATEMENT_OF_IDENTITY_MISSING,
  FDA_NUTRITION_NUTRIENT_MISSING,
  FDA_NUTRITION_OUT_OF_ORDER,
  FDA_NUTRITION_PERCENT_DV_WRONG,
  FDA_NUTRITION_ROUNDING_WRONG,
  FDA_NUTRITION_TYPE_TOO_SMALL,
  FDA_NUTRITION_FORMAT_NOT_PERMITTED,
  FDA_ALLERGEN_SOURCE_NOT_SPECIFIC,
  FDA_CONTAINS_NOT_ADJACENT,
  FDA_CONTAINS_TYPE_TOO_SMALL,
  FDA_INGREDIENTS_MISSING,
  FDA_INGREDIENT_NAME_MISSING,
  FDA_INGREDIENTS_OUT_OF_ORDER,
  FDA_INGREDIENT_THRESHOLD_EXCEEDED,
  FDA_INGREDIENT_THRESHOLD_NOT_PERMITTED,
  FDA_NET_QUANTITY_CROWDED,
  FDA_NET_QUANTITY_METRIC_MISSING,
  FDA_NET_QUANTITY_MISSING,
  FDA_NET_QUANTITY_OUTSIDE_ZONE,
  FDA_NET_QUANTITY_TYPE_TOO_SMALL,
  FDA_PANEL_TYPE_TOO_SMALL,
  FDA_RESPONSIBLE_FIRM_ADDRESS_INCOMPLETE,
  FDA_RESPONSIBLE_FIRM_MISSING,
  FDA_RESPONSIBLE_FIRM_UNQUALIFIED,
} from '../index'

/**
 * 120 × 240 mm — 44.64 in², in 101.7(i)'s "more than 25 but not more than 100"
 * band, so the 3/16 inch requirement is the same one as before.
 *
 * It grew from 170 mm when the Nutrition Facts panel was drawn for the first
 * time: the panel alone is 129 mm tall, and everything else on the label has to
 * fit above and below it. That the previous stock could not carry a compliant
 * label is the sort of thing only drawing it reveals.
 */
const CONFORMING_STOCK: LabelStock = { widthMm: 120, heightMm: 240, marginMm: 6 }

/**
 * Typed rather than inferred from `as const`. The literal tuple a const
 * assertion produces has no common `allergen` property, so the fixtures below
 * that map over it to remove one could not name the field they were removing.
 */
const BASE_INGREDIENTS: readonly UsFoodIngredient[] = [
  // Oats are not wheat, and are not one of the nine. Marking them `wheat` made
  // the example label declare an allergen the food does not contain — on a tool
  // whose whole value is being right, and on the first label anyone sees. The
  // almonds are genuine and exercise §403(w)(2)'s specific-type requirement,
  // which is the more interesting of the two paths anyway.
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

/**
 * A panel whose analysed amounts round cleanly and whose percentages match.
 *
 * The four vitamin and mineral figures are 101.9(d)(8)'s own worked example —
 * "Vitamin D 2 mcg 10%, Calcium 260 mg 20%, Iron 8 mg 45%, Potassium 235 mg 6%"
 * — so the conformant label is checked against numbers the regulation printed
 * rather than numbers this project chose.
 */
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
  // Stated rather than left to derive, so all four rules have something
  // independent to measure. Every figure is worked from the paragraph that sets
  // it: 150 calories is above 50 so it rounds in tens; 3 g of fat is below 5 so
  // it rounds in half-grams; 0 sodium is under the 5 mg floor. The four
  // percentages are 101.9(d)(8)'s own worked answers.
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

/**
 * A complete second column, at 250 percent of the serving figures.
 *
 * Every dual-column fixture below carried `{ 'total-fat': 7.5 }` and nothing
 * else — one nutrient in a column of fourteen. Each was written to provoke one
 * defect in the *form* of the panel (its headings, its separating line, its
 * relative type size), and none of them noticed that the panel underneath was
 * itself declaring a second form for a single nutrient.
 *
 * 101.9(e)(2) requires the quantitative information "for the form of the product
 * as packaged **and for any other form**", so those fixtures were non-compliant
 * in a way no rule looked at, and a fixture that is wrong about something other
 * than its own defect is a fixture that can pass for the wrong reason. Calories
 * is absent because it is drawn in its own block above the rows rather than as
 * one of them.
 */
const SECOND_COLUMN_AMOUNTS = {
  'total-fat': 7.5,
  'saturated-fat': 1.25,
  'trans-fat': 0,
  cholesterol: 0,
  sodium: 0,
  'total-carbohydrate': 67.5,
  'dietary-fiber': 10,
  'total-sugars': 2.5,
  'added-sugars': 0,
  protein: 12.5,
  'vitamin-d': 5,
  calcium: 650,
  iron: 20,
  potassium: 587.5,
} as const

const BASE = {
  statementOfIdentity: 'Oat and almond granola',
  container: { shape: 'rectangular', widthMm: 120, heightMm: 240 },
  netQuantity: { inchPound: 'NET WT 12 OZ', metric: '(340 g)' },
  // Descending by weight, with the last two grouped behind a 101.4(a)(2)
  // statement at a permitted threshold — so every rule in the set runs against
  // the base label rather than declining on it. Shared with the fixtures that
  // vary it: a second copy here is how the corrected allergen data was applied
  // to one of them and not the other.
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
} as const

export interface UsFoodRuleFixture {
  name: string
  /** What is wrong with this label, in one sentence. */
  defect: string
  data: UsFoodLabelData
  stock: LabelStock
  expected: {
    code: string
    severity: Severity
    /** The exact `citation.reference` the finding must carry. */
    citation: string
  }
}

const { responsibleFirm: _firm, ...WITHOUT_FIRM } = BASE
const { ingredientThreshold: _threshold, ...WITHOUT_THRESHOLD } = BASE
const { nutritionFacts: _panel, ...WITHOUT_NUTRITION } = BASE

export const US_FOOD_FIXTURES: readonly UsFoodRuleFixture[] = [
  {
    name: 'a package that never says what the food is',
    defect:
      'The principal display panel bears a net quantity, an ingredient statement and a full ' +
      'nutrition panel, and nowhere says what is inside. 101.3(a) makes the statement of ' +
      'identity one of the panel\u2019s principal features, and until this rule existed it was ' +
      'the one mandatory element of a US food label that this engine drew and nothing checked \u2014 ' +
      'a blank reached the renderer, which drew no primitive at all, and every rule reported a ' +
      'clean label.',
    data: { ...BASE, statementOfIdentity: '' },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_STATEMENT_OF_IDENTITY_MISSING,
      severity: 'blocking',
      citation: '21 CFR 101.3(a)',
    },
  },
  {
    name: 'a food-source word inside another allergen’s ingredient name',
    defect:
      'Coconut milk carries tree nuts and whey carries milk, and only the coconut is declared. ' +
      'The word “milk” inside “coconut milk” was accepted as §403(w)(1)(B)(ii)’s “name of the ' +
      'food source … elsewhere in the ingredient list” for the *dairy* allergen, so an ' +
      'undeclared milk allergen cleared on the strength of a coconut — and the whole label came ' +
      'back with no findings at all. The caveat excludes an appearance that is “part of the name ' +
      'of a food ingredient that is not a major food allergen”, and coconut milk is not dairy ' +
      'whatever else it is.',
    data: {
      ...WITHOUT_THRESHOLD,
      ingredients: [
        {
          name: 'coconut milk',
          percentByWeight: 60,
          allergen: 'tree-nuts',
          allergenSpecificType: 'coconut',
          declareInline: true,
        },
        { name: 'whey', percentByWeight: 40, allergen: 'milk' },
      ],
      containsStatement: ['tree-nuts'],
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_ALLERGEN_NOT_DECLARED,
      severity: 'violation',
      citation: 'FD&C Act §403(w)(1)',
    },
  },
  {
    name: 'two columns with no headings over them',
    defect:
      'The panel carries two sets of values and never says which is which. 101.9(e)(1): ' +
      '"Following the serving size information there shall be two or more column headings ' +
      'accurately describing the amount per serving size." Their wording is the labeller’s — the ' +
      'regulation’s own examples are "Per 1/4 cup mix" and "Per prepared portion" — so an engine ' +
      'that composed them would be authoring part of a regulated statement.',
    data: {
      ...BASE,
      nutritionFacts: {
        ...BASE_NUTRITION,
        columns: {
          mode: 'dual',
          basis: 'per-container',
          secondAmounts: { ...SECOND_COLUMN_AMOUNTS },
        },
      },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_DUAL_COLUMN_HEADINGS_MISSING,
      severity: 'violation',
      citation: '21 CFR 101.9(e)(1)',
    },
  },
  {
    name: 'a second column carrying one figure out of fourteen',
    defect:
      'The panel heads two columns, separates them, gives them equal prominence — and declares a ' +
      'second quantity for Total Fat alone. 101.9(e)(2): the quantitative information by weight ' +
      '"shall be presented for the form of the product as packaged and for any other form of the ' +
      'product". A second column is a second declaration of the nutrients the first one declares, ' +
      'not a place to put one number. The engine draws the column it was asked for, so nothing ' +
      'else here reports it: the mandate rule sees a column present and the form rules see it ' +
      'headed, separated and equally prominent.',
    data: {
      ...BASE,
      nutritionFacts: {
        ...BASE_NUTRITION,
        columns: {
          mode: 'dual',
          basis: 'per-container',
          headings: ['Per serving', 'Per container'],
          secondAmounts: { 'total-fat': 7.5 },
        },
      },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_DUAL_COLUMN_INCOMPLETE,
      severity: 'violation',
      citation: '21 CFR 101.9(e)(2)',
    },
  },
  {
    name: 'two columns run together with no line between them',
    defect:
      '101.9(e)(3): the quantitative information and the percent Daily Value "shall be presented ' +
      'in two columns and the columns shall be separated by vertical lines". Dropped to save ' +
      'width on a crowded panel, the two sets of figures read as one run and a reader has no way ' +
      'to tell which column a number belongs to.',
    data: {
      ...BASE,
      nutritionFacts: {
        ...BASE_NUTRITION,
        columns: {
          mode: 'dual',
          basis: 'per-container',
          headings: ['Per serving', 'Per container'],
          secondAmounts: { ...SECOND_COLUMN_AMOUNTS },
          separated: false,
        },
      },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_DUAL_COLUMN_NOT_SEPARATED,
      severity: 'violation',
      citation: '21 CFR 101.9(e)(3)',
    },
  },
  {
    name: 'a package column set smaller than the serving column',
    defect:
      '101.9(e): "When such dual labeling is provided, equal prominence shall be given to both ' +
      'sets of values." At 70 percent of the first column’s type the package figures are the ' +
      'ones a reader skips — which is exactly why a labeller would set them that way, and why ' +
      'the requirement is stated at all.',
    data: {
      ...BASE,
      nutritionFacts: {
        ...BASE_NUTRITION,
        columns: {
          mode: 'dual',
          basis: 'per-container',
          headings: ['Per serving', 'Per container'],
          secondAmounts: { ...SECOND_COLUMN_AMOUNTS },
          secondColumnTypeScale: 0.7,
        },
      },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_DUAL_COLUMN_UNEQUAL_PROMINENCE,
      severity: 'violation',
      citation: '21 CFR 101.9(e)',
    },
  },
  {
    name: 'two columns headed identically',
    defect:
      'Both headings read "Per serving", so neither describes the amount its column declares and ' +
      'a reader cannot tell the package figure from the serving one. Present but not ' +
      'distinguishing is the failure the presence check alone would miss.',
    data: {
      ...BASE,
      nutritionFacts: {
        ...BASE_NUTRITION,
        columns: {
          mode: 'dual',
          basis: 'per-container',
          headings: ['Per serving', 'Per serving'],
          secondAmounts: { ...SECOND_COLUMN_AMOUNTS },
        },
      },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_DUAL_COLUMN_HEADINGS_MISSING,
      severity: 'violation',
      citation: '21 CFR 101.9(e)(1)',
    },
  },
  {
    name: 'a 250 percent package carrying one column',
    defect:
      'A 55 g bag against a 22 g reference amount is 250 percent of it, packaged and sold ' +
      'individually — squarely inside (b)(12)(i)’s "at least 200 percent and up to and including ' +
      '300 percent", which says such a product **must** provide a second column for the entire ' +
      'package. None of the three shared exemptions reaches it: the package is far above the ' +
      'small-package areas (A), it is not a raw commodity (B), and it provides no other second ' +
      'column (C). This is the one rule here that reports a label for *not* using a display, so ' +
      'it fires only where the label has stated the reference amount itself.',
    data: {
      ...BASE,
      nutritionFacts: {
        ...BASE_NUTRITION,
        availableSurfaceSqInches: 60,
        referenceAmount: { amount: 22, unit: 'g', category: 'Snacks — chips, pretzels' },
        packageContent: 55,
        packagedAndSoldIndividually: true,
      },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_DUAL_COLUMN_MISSING,
      severity: 'violation',
      citation: '21 CFR 101.9(b)(12)(i)',
    },
  },
  {
    name: 'an ingredient listed with no name',
    defect:
      'A fourth entry carries a weight and an empty name, which the engine draws as ' +
      '\u201cINGREDIENTS: whole grain rolled oats, sugar, salt, .\u201d. 101.4(a)(2) is about which ' +
      'ingredients may be grouped; 101.4(a)(1) requires each to be listed *by common or usual ' +
      'name*, and an entry with no name is not one. The API rejected this document with a 400 ' +
      'rather than reporting it, which is a schema standing in for a rule.',
    data: {
      ...BASE,
      ingredients: [...BASE_INGREDIENTS, { name: '  ', percentByWeight: 0 }],
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_INGREDIENT_NAME_MISSING,
      severity: 'violation',
      citation: '21 CFR 101.4(a)(1)',
    },
  },
  {
    name: 'a nutrition panel with no serving size',
    defect:
      'Every nutrient is declared and rounded correctly, and the panel never says what a ' +
      'serving is, so none of the figures mean anything. 101.9(d)(3)(ii) states no exception \u2014 ' +
      'unlike (d)(3)(i), which excuses the servings count on a single-serving container, which ' +
      'is why the two cannot be checked as one requirement.',
    data: {
      ...BASE,
      nutritionFacts: { ...BASE_NUTRITION, servingSize: '' },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_SERVING_SIZE_MISSING,
      severity: 'violation',
      citation: '21 CFR 101.9(d)(3)(ii)',
    },
  },
  {
    name: 'type sized as though the em were the letter height',
    defect:
      'The declaration is set at an em of 4.7625 mm — numerically the 3/16 inch this panel ' +
      'requires — so a rule comparing the requirement against `fontSizeMm` would pass it. Set ' +
      'with lower case, its "o" actually prints 2.57 mm, 54% of the minimum.',
    data: {
      ...BASE,
      netQuantity: { inchPound: 'Net wt 12 oz', metric: '(340 g)' },
      netQuantityFontSizeMm: 4.7625,
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NET_QUANTITY_TYPE_TOO_SMALL,
      severity: 'violation',
      citation: '21 CFR 101.7(i)',
    },
  },
  {
    name: 'type sized for the printed band on a declaration molded into the bottle',
    defect:
      'An em of 8.82 mm puts the "o" at 4.763 mm, a hair over the printed 3/16 inch this panel ' +
      'demands — and this same label passes with `markingMethod: printed`. Molded into a ' +
      'plastic surface, 101.7(i) adds a sixteenth of an inch and the requirement becomes ' +
      '6.35 mm, so nothing but the marking method separates the two verdicts.',
    data: {
      ...BASE,
      markingMethod: 'blown-embossed-or-molded',
      netQuantityFontSizeMm: 8.82,
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NET_QUANTITY_TYPE_TOO_SMALL,
      severity: 'violation',
      citation: '21 CFR 101.7(i)',
    },
  },
  {
    name: 'type sized for the label rather than for the cylinder it wraps',
    defect:
      'A 60 × 90 mm label is 8.37 in², whose band is 1/8 inch. The bottle it wraps has a ' +
      'principal display panel of 37.20 in² under 101.1(b), whose band is 3/16. Sizing type to ' +
      'the label understates the requirement by a third — the panel belongs to the package.',
    data: {
      ...BASE,
      container: { shape: 'cylindrical', heightMm: 200, circumferenceMm: 300 },
      // 3.175 / 0.540 — the em that puts the "o" at the 1/8 inch the *label*
      // area would demand, which is the mistake this fixture is made of.
      netQuantityFontSizeMm: 5.879,
    },
    stock: { widthMm: 60, heightMm: 90, marginMm: 4 },
    expected: {
      code: FDA_NET_QUANTITY_TYPE_TOO_SMALL,
      severity: 'violation',
      citation: '21 CFR 101.7(i)',
    },
  },
  {
    name: 'declaration set halfway up the panel',
    defect:
      'The bottom 30 percent of a 158 mm panel inset 6 mm begins 116.6 mm down. A centred ' +
      'declaration starts around 80 mm and is nowhere near it, while sitting far enough from ' +
      'everything else that only the placement rule should fire.',
    data: { ...BASE, netQuantityAnchor: 'centre' },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NET_QUANTITY_OUTSIDE_ZONE,
      severity: 'violation',
      citation: '21 CFR 101.7(f)',
    },
  },
  {
    name: 'declaration printed on top of the statement of identity',
    defect:
      'Anchored to the panel top, the declaration lands in the same space as the statement of ' +
      'identity — no gap either way, where 101.7(f) wants a letter height above or below and ' +
      'two "N" widths to the side.',
    data: { ...BASE, netQuantityAnchor: 'top-centre' },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NET_QUANTITY_CROWDED,
      severity: 'violation',
      citation: '21 CFR 101.7(f)',
    },
  },
  {
    name: 'salt listed before the sugar there is more of',
    defect:
      'Sugar is 2% of the food and salt 0.7%, and the list names salt first. 101.4(a)(1) runs the ' +
      'statement in descending order of predominance by weight, and only the declared weights ' +
      'make that checkable — a list of names in an order asserts nothing a rule can test.',
    data: {
      ...BASE,
      ingredients: [
        { name: 'whole grain rolled oats', percentByWeight: 97 },
        { name: 'salt', percentByWeight: 0.7 },
        { name: 'sugar', percentByWeight: 2 },
      ],
      ingredientThreshold: { percent: 2, count: 0 },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_INGREDIENTS_OUT_OF_ORDER,
      severity: 'violation',
      citation: '21 CFR 101.4(a)(1)',
    },
  },
  {
    name: 'no ingredient statement, and no exemption claimed',
    defect:
      'A packaged food listing nothing it is made of. §101.100 exempts some foods, but the ' +
      'exemption turns on facts about the product rather than the label and this one does not ' +
      'claim it — so silence here is a missing statement, not an exempt one.',
    data: { ...BASE, ingredients: [] },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_INGREDIENTS_MISSING,
      severity: 'blocking',
      citation: '21 CFR 101.4(a)(1)',
    },
  },
  {
    name: 'sugar hidden behind a 2 percent statement it exceeds',
    defect:
      'Sugar at 8% sits behind "Contains 2 percent or less of". 101.4(a)(2) is explicit that no ' +
      'ingredient the phrase applies to may exceed the stated threshold, which is what stops the ' +
      'grouping being used to bury a major ingredient out of order.',
    data: {
      ...BASE,
      ingredients: [
        { name: 'whole grain rolled oats', percentByWeight: 91 },
        { name: 'salt', percentByWeight: 1 },
        { name: 'sugar', percentByWeight: 8 },
      ],
      ingredientThreshold: { percent: 2, count: 2 },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_INGREDIENT_THRESHOLD_EXCEEDED,
      severity: 'violation',
      citation: '21 CFR 101.4(a)(2)',
    },
  },
  {
    name: 'a quantifying statement at 3 percent',
    defect:
      'The permitted thresholds are a closed set — "2 percent, or, if desired, 1.5 percent, 1.0 ' +
      'percent, or 0.5 percent". 3 percent is not among them, however reasonable it looks.',
    data: {
      ...BASE,
      ingredientThreshold: { percent: 3 as unknown as 2, count: 2 },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_INGREDIENT_THRESHOLD_NOT_PERMITTED,
      severity: 'violation',
      citation: '21 CFR 101.4(a)(2)',
    },
  },
  {
    name: 'nobody answerable for the food',
    defect:
      'No manufacturer, packer or distributor named. 101.5(a) requires one on every packaged ' +
      'food, and without it a consumer has nobody to go to.',
    // Absent, not undefined: `exactOptionalPropertyTypes` draws the distinction
    // and this project keeps it, so the fixture omits the key rather than
    // setting it to nothing.
    data: WITHOUT_FIRM,
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_RESPONSIBLE_FIRM_MISSING,
      severity: 'blocking',
      citation: '21 CFR 101.5(a)',
    },
  },
  {
    name: 'a distributor passing as the manufacturer',
    defect:
      'The firm did not make the food and its name stands unqualified, so the label reads as ' +
      'though it did. 101.5(c) wants a phrase revealing the connection — and cites its own ' +
      'examples as examples, which is why the phrase is free text rather than a closed list.',
    data: {
      ...BASE,
      responsibleFirm: { ...BASE.responsibleFirm, isManufacturer: false },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_RESPONSIBLE_FIRM_UNQUALIFIED,
      severity: 'violation',
      citation: '21 CFR 101.5(c)',
    },
  },
  {
    name: 'a place of business with no ZIP code',
    defect:
      'Street, city and State but no ZIP. 101.5(d) names all four, and only the street address ' +
      'has an escape — it may be dropped where it appears in a current directory, which is a ' +
      'fact about a directory rather than about the label.',
    data: {
      ...BASE,
      responsibleFirm: { ...BASE.responsibleFirm, zip: '' },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_RESPONSIBLE_FIRM_ADDRESS_INCOMPLETE,
      severity: 'violation',
      citation: '21 CFR 101.5(d)',
    },
  },
  {
    name: 'an ingredient statement in two-point type',
    defect:
      'An em of 2 mm puts the lowercase "o" at 1.08 mm, under the 1.5875 mm floor 101.2(c) sets ' +
      'for everything on the panel. The floor is measured the same way the net quantity is, ' +
      'because 101.2(c) incorporates 101.7(h)(2) by reference.',
    data: { ...BASE, informationPanelFontSizeMm: 2 },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_PANEL_TYPE_TOO_SMALL,
      severity: 'violation',
      citation: '21 CFR 101.2(c)',
    },
  },
  {
    name: 'almonds present and declared nowhere',
    defect:
      'The recipe carries almonds and the label says so in neither form — no parenthetical after ' +
      'the ingredient and nothing in the Contains statement. §403(w)(1) offers two ways and ' +
      'requires one of them.',
    data: {
      ...BASE,
      // Renamed as well as undeclared. "almonds" carries its own food source
      // name, which §403(w)(1)(B)(i) accepts on its own — so the base label is
      // compliant by that route and this fixture has to use an ingredient whose
      // name says nothing, which is the realistic case anyway.
      ingredients: BASE_INGREDIENTS.map((ingredient) =>
        ingredient.allergen === 'tree-nuts'
          ? { ...ingredient, name: 'nut pieces', declareInline: false }
          : { ...ingredient },
      ),
      containsStatement: [],
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_ALLERGEN_NOT_DECLARED,
      severity: 'violation',
      citation: 'FD&C Act §403(w)(1)',
    },
  },
  {
    name: 'a tree nut declared as "tree nuts"',
    defect:
      '§403(w)(2) wants the specific type of nut, not the category — "Contains: tree nuts" tells ' +
      'an almond-allergic reader nothing they did not already fear. Three of the nine work this ' +
      'way and six do not, which is the part easiest to miss.',
    data: {
      ...BASE,
      ingredients: BASE_INGREDIENTS.map((ingredient) => {
        if (ingredient.allergen !== 'tree-nuts') return { ...ingredient }
        const { allergenSpecificType: _dropped, ...rest } = ingredient
        return { ...rest, name: 'nut pieces' }
      }),
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_ALLERGEN_SOURCE_NOT_SPECIFIC,
      severity: 'violation',
      citation: 'FD&C Act §403(w)(2)',
    },
  },
  {
    name: 'a Contains statement in smaller type than the list it follows',
    defect:
      '§403(w)(1)(A) allows the statement to be larger than the ingredient list and never ' +
      'smaller. This is the first relative type-size requirement in the project — the figure ' +
      'comes from the other block rather than from a table.',
    data: { ...BASE, containsStatementFontSizeMm: 2 },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_CONTAINS_TYPE_TOO_SMALL,
      severity: 'violation',
      citation: 'FD&C Act §403(w)(1)(A)',
    },
  },
  {
    name: 'a Contains statement pushed away from the list',
    defect:
      'The statement must be "immediately after or [...] adjacent to the list of ingredients". ' +
      'Adrift at the foot of the panel it reads as unrelated text, which is exactly what a ' +
      'reader scanning for allergens will treat it as.',
    data: { ...BASE, containsStatementGapMm: 40 },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_CONTAINS_NOT_ADJACENT,
      severity: 'violation',
      citation: 'FD&C Act §403(w)(1)(A)',
    },
  },
  {
    name: 'a food with no nutrition label and no exemption claimed',
    defect:
      'A packaged food carrying no nutrition label. §101.9(j) exempts many foods, but its ' +
      'eighteen subparagraphs turn on business size, units sold and what the food is — facts ' +
      'about a firm rather than a label — and this one claims none of them.',
    data: WITHOUT_NUTRITION,
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NUTRITION_MISSING,
      severity: 'blocking',
      citation: '21 CFR 101.9(c)',
    },
  },
  {
    name: 'a panel with no potassium on it',
    defect:
      'Potassium is one of the four 101.9(c)(8)(ii) names explicitly, and the last of them, which ' +
      'is exactly where a panel quietly stops.',
    data: {
      ...BASE,
      nutritionFacts: {
        ...BASE_NUTRITION,
        amounts: Object.fromEntries(
          Object.entries(BASE_NUTRITION.amounts).filter(([id]) => id !== 'potassium'),
        ),
      },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NUTRITION_NUTRIENT_MISSING,
      severity: 'violation',
      citation: '21 CFR 101.9(c)',
    },
  },
  {
    name: 'sugars listed before the fibre they follow',
    defect:
      '101.9(c) fixes the order and the label may not choose its own. Total Sugars sits at ' +
      '(c)(6)(ii) and Dietary Fiber at (c)(6)(i), so a panel that swaps them is listing the ' +
      'subparagraphs backwards.',
    data: {
      ...BASE,
      nutritionFacts: {
        ...BASE_NUTRITION,
        order: [
          'calories',
          'total-fat',
          'saturated-fat',
          'trans-fat',
          'cholesterol',
          'sodium',
          'total-carbohydrate',
          'total-sugars',
          'dietary-fiber',
          'added-sugars',
          'protein',
          'vitamin-d',
          'calcium',
          'iron',
          'potassium',
        ],
      },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NUTRITION_OUT_OF_ORDER,
      severity: 'violation',
      citation: '21 CFR 101.9(c)',
    },
  },
  {
    name: 'sodium rounded in the wrong band',
    defect:
      '163 mg is above 140, so 101.9(c)(4) rounds it in 10 mg increments to 160. Rounded in the ' +
      '5 mg band that applies below 140 it comes out 165 — a figure that looks entirely ' +
      'reasonable and is not the one the paragraph permits.',
    data: {
      ...BASE,
      nutritionFacts: {
        ...BASE_NUTRITION,
        amounts: { ...BASE_NUTRITION.amounts, sodium: 163 },
        declaredAmounts: { sodium: 165 },
      },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NUTRITION_ROUNDING_WRONG,
      severity: 'violation',
      citation: '21 CFR 101.9(c)(4)',
    },
  },
  {
    name: 'iron shown at the whole percent instead of the 5 percent band',
    defect:
      '8 mg of an 18 mg RDI is 44.4 percent. 101.9(c)(8)(iii) rounds a vitamin or mineral to the ' +
      'nearest 5 percent above 10, giving 45; the whole-percent rule that governs the DRV ' +
      'nutrients gives 44. Both look right and only one is.',
    data: {
      ...BASE,
      nutritionFacts: { ...BASE_NUTRITION, declaredPercentDv: { iron: 44 } },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NUTRITION_PERCENT_DV_WRONG,
      severity: 'violation',
      citation: '21 CFR 101.9(c)(8)(iii)',
    },
  },
  {
    name: 'a Nutrition Facts panel shrunk to fit',
    defect:
      'Every size in the panel is a minimum 101.9(d) states, so scaling the whole thing to 80 ' +
      'percent puts all of them under — which is how this goes wrong in practice, a designer ' +
      'squeezing the panel into the space left rather than choosing a bad size on purpose. The ' +
      'heading is *not* among them: 101.9(d)(2) asks only that it be no smaller than the rest, ' +
      'and a panel scaled in proportion still satisfies that.',
    data: {
      ...BASE,
      nutritionFacts: { ...BASE_NUTRITION, typeScale: 0.8 },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NUTRITION_TYPE_TOO_SMALL,
      severity: 'violation',
      citation: '21 CFR 101.9(d)(3)(i)',
    },
  },
  {
    name: 'a tabular display on a package with room for a vertical one',
    defect:
      'A 60 in² package using a reduced display. 101.9(j)(13)(ii) permits them at 40 in² or ' +
      'less, and the second limb — a shape that cannot take a vertical column — is capped at the ' +
      'same 40, so nothing rescues a larger package.',
    data: {
      ...BASE,
      nutritionFacts: {
        ...BASE_NUTRITION,
        format: 'tabular',
        availableSurfaceSqInches: 60,
        cannotAccommodateVertical: true,
      },
    },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NUTRITION_FORMAT_NOT_PERMITTED,
      severity: 'violation',
      citation: '21 CFR 101.9(j)(13)(ii)(A)',
    },
  },
  {
    name: 'no net quantity declaration at all',
    defect:
      'A panel with a statement of identity and nothing else. Every rule that measures the ' +
      'declaration correctly declines, which collectively read as a clean bill of health until ' +
      'one rule owned the case — this is the label that produced three passes and no findings.',
    data: { ...BASE, netQuantity: { inchPound: '' } },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NET_QUANTITY_MISSING,
      severity: 'blocking',
      citation: '21 CFR 101.7(a)',
    },
  },
  {
    name: 'net weight in ounces only',
    defect:
      'An ordinary packaged food carrying the inch/pound declaration alone. The Fair Packaging ' +
      'and Labeling Act has required both measurement systems since 1992; 21 CFR 101.7 was ' +
      'never amended to say so, which is why this rule cites the statute.',
    data: { ...BASE, netQuantity: { inchPound: 'NET WT 12 OZ' } },
    stock: CONFORMING_STOCK,
    expected: {
      code: FDA_NET_QUANTITY_METRIC_MISSING,
      severity: 'violation',
      citation: '15 U.S.C. 1453(a)(2)',
    },
  },
]

/**
 * A label that should raise nothing.
 *
 * Unlike its GHS counterpart this one is genuinely clean, because nothing on a
 * net quantity declaration depends on artwork this project could not verify. It
 * states no type size, so the engine derives the em that meets 101.7(i) for this
 * panel and this casing — which is what makes "the default label complies" a
 * property the suite checks rather than a claim in a comment.
 */
export const US_FOOD_CONFORMANT: { data: UsFoodLabelData; stock: LabelStock } = {
  data: { ...BASE },
  stock: CONFORMING_STOCK,
}

/**
 * A panel small enough that 101.7(f) stops asking where the declaration sits.
 *
 * It is *not* otherwise clean: the declaration still sits on top of the
 * statement of identity, and the separation requirement in the same paragraph
 * still bites. The exemption covers placement within the bottom 30 percent and
 * nothing else, and the suite asserts both halves of that.
 */
export const US_FOOD_SMALL_PANEL: { data: UsFoodLabelData; stock: LabelStock } = {
  data: {
    ...BASE,
    container: { shape: 'rectangular', widthMm: 50, heightMm: 60 },
    netQuantityAnchor: 'top-centre',
  },
  stock: { widthMm: 50, heightMm: 60, marginMm: 4 },
}
