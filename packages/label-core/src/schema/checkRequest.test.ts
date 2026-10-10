/**
 * The check request, and the conversions every door shares.
 *
 * The export routes and the MCP server both turn a parsed request into the
 * engine's input. A field the schema accepts and the conversion forgets is
 * stripped without a word — previewed in one place and never drawn in another,
 * which is the failure this architecture exists to prevent and the one the
 * comments in `labelDocument.ts` record happening more than once. So the cases
 * below fill in every field, nested ones included, and check that each one the
 * schema keeps arrives in the label data.
 */
import { describe, expect, it } from 'vitest'
import { HAZARD_CLASS_IDS } from '../ghs/classification'
import { knownHazardStatementCodes, knownPrecautionaryStatementCodes } from '../ghs/statements'
import { DEFAULT_GHS_STOCK } from '../templates/ghs'
import { DEFAULT_UPC_A_STOCK } from '../templates/upcA'
import { DEFAULT_US_FOOD_STOCK } from '../templates/usFood'
import type { BarcodeEncoder } from '../symbology/layOutSymbol'
import {
  Artwork,
  ContainerSchema,
  DigitalLink,
  GhsRequest,
  GhsSupplierSchema,
  IngredientSchema,
  LabelCheckRequest,
  LabelDocumentInput,
  NetQuantitySchema,
  NutritionFactsSchema,
  ResponsibleFirmSchema,
  UpcARequest,
  UsFoodRequestBase,
  toGhsLabelData,
  toJudgeRequest,
  toUpcALabelData,
  toUsFoodLabelData,
} from './labelDocument'

const HAZARD = knownHazardStatementCodes('eu-clp')[0]!
const PRECAUTION = knownPrecautionaryStatementCodes('eu-clp')[0]!

/** Every field a UPC-A request can carry, stock aside. */
const EVERY_UPC_A_FIELD = {
  gtin: '036000291452',
  magnification: 1,
  barHeightMm: 22.85,
  omitHri: false,
  symbolPlacement: 'centre',
  artwork: {
    text: 'Granola',
    anchor: 'top-left',
    widthMm: 20,
    heightMm: 5,
    fontSizeMm: 3,
    fontFamily: 'IBM Plex Sans',
  },
  digitalLink: {
    domain: 'https://example.com',
    lot: 'L1',
    serial: 'S1',
    expiry: '271231',
    useConvenienceAlphas: true,
  },
}

/** Every field a GHS request can carry, stock aside. */
const EVERY_GHS_FIELD = {
  regime: 'eu-clp',
  productIdentifier: 'Example degreaser',
  capacityL: 1,
  signalWords: ['Danger'],
  hazards: [HAZARD_CLASS_IDS[0]],
  pictograms: ['GHS02'],
  hazardStatementCodes: [HAZARD],
  precautionaryStatementCodes: [PRECAUTION],
  supplier: { name: 'Example BV', address: 'Rotterdam', telephone: '+31 10 000 0000' },
  smallContainerLabelling: false,
  outerPackageStatement: 'See outer packaging',
  pictogramSideMm: 16,
}

/** Every field a nutrition panel can carry. */
const EVERY_NUTRITION_FIELD = {
  servingSize: '1 cup (40g)',
  servingsPerContainer: 8,
  amounts: { calories: 150 },
  declaredAmounts: { calories: 150 },
  declaredPercentDv: { 'total-fat': 3 },
  order: ['calories'],
  representedFor: 'adults-and-children-4-plus',
  typeScale: 1,
  format: 'vertical',
  columns: {
    mode: 'dual',
    basis: 'as-prepared',
    headings: ['As packaged', 'As prepared'],
    secondAmounts: { calories: 200 },
    secondPercentDv: { 'total-fat': 4 },
    separated: true,
    secondColumnTypeScale: 1,
  },
  referenceAmount: { amount: 40, unit: 'g', category: 'Cereal' },
  packageContent: 320,
  unitContent: 40,
  packagedAndSoldIndividually: false,
  dualColumnExemption: { rawCommodityVoluntary: false, variedWeight: false },
  availableSurfaceSqInches: 30,
  cannotAccommodateVertical: false,
  cannotAccommodateTabular: false,
  continuousVerticalSpaceInches: 3,
}

/** Every field a US food request can carry, stock aside. */
const EVERY_US_FOOD_FIELD = {
  statementOfIdentity: 'Granola',
  netQuantity: { inchPound: 'NET WT 12 OZ', metric: '340 g', packaging: 'standard' },
  container: { shape: 'other', totalSurfaceAreaSqMm: 40000, obviousPanelAreaSqMm: 12000 },
  markingMethod: 'printed',
  netQuantityFontSizeMm: 3,
  netQuantityAnchor: 'bottom-left',
  informationPanelFontSizeMm: 2,
  ingredients: [
    {
      name: 'Oats',
      percentByWeight: 60,
      allergen: 'wheat',
      allergenSpecificType: 'wheat',
      declareInline: false,
    },
  ],
  ingredientThreshold: { percent: 2, count: 1 },
  ingredientsExemption: { kind: 'assortment', statement: 'Assorted', mayBePresent: ['Nuts'] },
  ingredientsExempt: false,
  containsStatement: ['wheat'],
  containsStatementFontSizeMm: 2,
  containsStatementGapMm: 1,
  nutritionFacts: EVERY_NUTRITION_FIELD,
  nutritionExemption: { kind: 'small-package', availableSurfaceSqInches: 10, contactLine: 'Call' },
  nutritionFactsExempt: false,
  responsibleFirm: {
    name: 'Example Foods',
    isManufacturer: true,
    qualifyingPhrase: 'Distributed by',
    streetAddress: '1 Main St',
    streetAddressInDirectory: false,
    city: 'Springfield',
    state: 'IL',
    zip: '62701',
  },
}

/** Every path to a value, so a key dropped at any depth is a path that goes missing. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => keyPaths(item, `${prefix}[${i}]`))
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => {
      const path = prefix === '' ? key : `${prefix}.${key}`
      return [path, ...keyPaths(child, path)]
    })
  }
  return []
}

const fieldsOf = (shape: object): string[] =>
  Object.keys(shape)
    .filter((key) => key !== 'stock')
    .sort()

describe('the documents below fill in every field', () => {
  // Without these, a field added to a schema and not to these documents would go
  // unchecked, and the conversions could forget it with every case still green.
  it('every top-level field', () => {
    expect(Object.keys(EVERY_UPC_A_FIELD).sort()).toEqual(fieldsOf(UpcARequest.shape))
    expect(Object.keys(EVERY_GHS_FIELD).sort()).toEqual(fieldsOf(GhsRequest.shape))
    expect(Object.keys(EVERY_US_FOOD_FIELD).sort()).toEqual(fieldsOf(UsFoodRequestBase.shape))
  })

  // Every nested object a conversion rebuilds key by key, rather than passes on
  // whole — a key it forgets there is stripped as surely as one at the top.
  it.each([
    ['artwork', EVERY_UPC_A_FIELD.artwork, Artwork.shape],
    ['digitalLink', EVERY_UPC_A_FIELD.digitalLink, DigitalLink.shape],
    ['supplier', EVERY_GHS_FIELD.supplier, GhsSupplierSchema.shape],
    ['netQuantity', EVERY_US_FOOD_FIELD.netQuantity, NetQuantitySchema.shape],
    ['container', EVERY_US_FOOD_FIELD.container, ContainerSchema.options[2].shape],
    ['ingredients', EVERY_US_FOOD_FIELD.ingredients[0]!, IngredientSchema.shape],
    ['nutritionFacts', EVERY_NUTRITION_FIELD, NutritionFactsSchema.shape],
    [
      'nutritionFacts.columns',
      EVERY_NUTRITION_FIELD.columns,
      NutritionFactsSchema.shape.columns.unwrap().shape,
    ],
    [
      'nutritionFacts.dualColumnExemption',
      EVERY_NUTRITION_FIELD.dualColumnExemption,
      NutritionFactsSchema.shape.dualColumnExemption.unwrap().shape,
    ],
    ['responsibleFirm', EVERY_US_FOOD_FIELD.responsibleFirm, ResponsibleFirmSchema.shape],
  ] as const)('every %s field', (_name, document, shape) => {
    expect(Object.keys(document).sort()).toEqual(fieldsOf(shape))
  })
})

describe('every field the schema keeps reaches the engine', () => {
  it.each([
    ['gs1-retail', EVERY_UPC_A_FIELD, toUpcALabelData, UpcARequest],
    ['ghs-chemical', EVERY_GHS_FIELD, toGhsLabelData, GhsRequest],
    ['us-food', EVERY_US_FOOD_FIELD, toUsFoodLabelData, UsFoodRequestBase],
  ] as const)('%s', (_labelType, document, convert, schema) => {
    const parsed = schema.parse(document)
    const converted = (convert as (request: unknown) => unknown)(parsed)
    const missing = keyPaths(parsed).filter((path) => !keyPaths(converted).includes(path))
    expect(missing).toEqual([])
  })
})

describe('LabelCheckRequest', () => {
  it('accepts each label type without a stock', () => {
    for (const [labelType, data] of [
      ['gs1-retail', { gtin: '036000291452' }],
      ['ghs-chemical', { regime: 'eu-clp', productIdentifier: 'X', capacityL: 1 }],
      [
        'us-food',
        {
          statementOfIdentity: 'Granola',
          netQuantity: { inchPound: 'NET WT 12 OZ' },
          container: { shape: 'rectangular', widthMm: 100, heightMm: 150 },
        },
      ],
    ] as const) {
      expect(LabelCheckRequest.safeParse({ labelType, data }).success, labelType).toBe(true)
    }
  })

  it('refuses a stock inside `data`, rather than judging on the default one', () => {
    // Where the export requests keep it. Stripped, it would leave every size and
    // placement finding about a label of the default size.
    const stock = { widthMm: 50, heightMm: 40, marginMm: 2 }
    const checked = LabelCheckRequest.safeParse({
      labelType: 'gs1-retail',
      data: { gtin: '036000291452', stock },
    })
    expect(checked.success).toBe(false)
    expect(checked.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['data.stock', '`stock` goes beside `data` in a check request, not inside it'],
    ])
  })

  it('refuses a label type it does not know', () => {
    expect(LabelCheckRequest.safeParse({ labelType: 'eu-food', data: {} }).success).toBe(false)
  })

  it('refuses with the issues the saved-label schema raises for the same data', () => {
    // The two are built from the same parts. If one stopped applying a refinement
    // the other applies, a document would be checkable and not savable, or the
    // reverse, with different words for the same fault.
    const malformed = [
      ['gs1-retail', { gtin: '03600029145' }],
      [
        'ghs-chemical',
        { regime: 'us-osha', productIdentifier: 'X', capacityL: 1, hazardStatementCodes: ['H225'] },
      ],
      [
        'ghs-chemical',
        { regime: 'eu-clp', productIdentifier: 'X', capacityL: 1, hazardStatementCodes: ['H999'] },
      ],
      [
        'us-food',
        {
          statementOfIdentity: 'X',
          netQuantity: { inchPound: '1 oz' },
          container: { shape: 'rectangular', widthMm: 50, heightMm: 50 },
          ingredientThreshold: { percent: 2, count: 3 },
        },
      ],
    ] as const
    for (const [labelType, data] of malformed) {
      const checked = LabelCheckRequest.safeParse({ labelType, data })
      const saved = LabelDocumentInput.safeParse({
        name: 'A label',
        labelType,
        stock: DEFAULT_UPC_A_STOCK,
        data,
      })
      expect(checked.success, labelType).toBe(false)
      expect(checked.error?.issues, labelType).toEqual(saved.error?.issues)
    }
  })
})

describe('toJudgeRequest', () => {
  // Never called: these cases build a request and do not lay it out.
  const encoder: BarcodeEncoder = {
    render: (_options, drawing) => drawing.end(),
  }

  it('borrows the label type’s default stock, as an export does', () => {
    const judge = (labelType: string, data: object) =>
      toJudgeRequest(LabelCheckRequest.parse({ labelType, data }), encoder)
    expect(judge('gs1-retail', { gtin: '036000291452' }).stock).toBe(DEFAULT_UPC_A_STOCK)
    expect(
      judge('ghs-chemical', { regime: 'eu-clp', productIdentifier: 'X', capacityL: 1 }).stock,
    ).toBe(DEFAULT_GHS_STOCK)
    expect(
      judge('us-food', {
        statementOfIdentity: 'X',
        netQuantity: { inchPound: '1 oz' },
        container: { shape: 'rectangular', widthMm: 50, heightMm: 50 },
      }).stock,
    ).toBe(DEFAULT_US_FOOD_STOCK)
  })

  it('keeps a stock the request states, and hands a UPC-A label its encoder', () => {
    const stock = { widthMm: 50, heightMm: 40, marginMm: 2 }
    const request = toJudgeRequest(
      LabelCheckRequest.parse({ labelType: 'gs1-retail', data: { gtin: '036000291452' }, stock }),
      encoder,
    )
    expect(request.stock).toEqual(stock)
    expect(request.labelType === 'gs1-retail' && request.barcode).toBe(encoder)
  })
})
