/**
 * The bounds on what a label may hold (`INPUT_BOUNDS`), each accepted at its figure and
 * refused one step past it, at the path the field sits at.
 *
 * Added with the bounds (`docs/security-review-2026-10-18.md`, finding 1). Every case is
 * run through the saved-label schema, which is built from the same shapes as the export
 * requests and the check request, so a bound missing from a shape fails here whichever
 * door it was meant for. The check request's own fields are tested beside them.
 */
import { describe, expect, it } from 'vitest'
import { MAJOR_FOOD_ALLERGEN_IDS } from '../fda/allergens'
import { NUTRIENT_IDS } from '../fda/nutrients'
import { HAZARD_CLASS_IDS } from '../ghs/classification'
import { GHS_PICTOGRAM_CODES } from '../ghs/pictograms'
import {
  GHS_REGIMES,
  knownHazardStatementCodes,
  knownPrecautionaryStatementCodes,
} from '../ghs/statements'
import { GHS_SIGNAL_WORDS } from '../templates/ghs'
import { INPUT_BOUNDS as B, LabelCheckRequest, LabelDocumentInput } from './labelDocument'

const HAZARD = knownHazardStatementCodes('eu-clp')[0]!
const PRECAUTION = knownPrecautionaryStatementCodes('eu-clp')[0]!
const STOCK = { widthMm: 74, heightMm: 105, marginMm: 3 }

const BASES = {
  'gs1-retail': {
    gtin: '036000291452',
    magnification: 1,
    barHeightMm: 22.85,
    artwork: { text: 'Granola', anchor: 'top-left', widthMm: 20, heightMm: 5, fontSizeMm: 3 },
    digitalLink: { domain: 'https://id.example.com', lot: 'L1', serial: 'S1', expiry: '271231' },
  },
  'ghs-chemical': {
    regime: 'eu-clp',
    productIdentifier: 'Example degreaser',
    capacityL: 1,
    signalWords: ['Danger'],
    hazards: [HAZARD_CLASS_IDS[0]],
    pictograms: ['GHS02'],
    hazardStatementCodes: [HAZARD],
    precautionaryStatementCodes: [PRECAUTION],
    supplier: { name: 'Example BV', address: 'Rotterdam', telephone: '+31 10 000 0000' },
    outerPackageStatement: 'See outer packaging',
    pictogramSideMm: 16,
  },
  'us-food': {
    statementOfIdentity: 'Granola',
    netQuantity: { inchPound: 'NET WT 12 OZ', metric: '340 g' },
    container: { shape: 'rectangular', widthMm: 120, heightMm: 170 },
    netQuantityFontSizeMm: 3,
    informationPanelFontSizeMm: 2,
    ingredients: [{ name: 'Oats', allergen: 'wheat', allergenSpecificType: 'wheat' }],
    ingredientsExemption: { kind: 'assortment', statement: 'Assorted', mayBePresent: ['Nuts'] },
    containsStatement: ['wheat'],
    containsStatementFontSizeMm: 2,
    containsStatementGapMm: 1,
    nutritionFacts: {
      servingSize: '1 cup (40g)',
      amounts: { calories: 150 },
      order: ['calories'],
      typeScale: 1,
      columns: { mode: 'dual', headings: ['As packaged', 'As prepared'], secondColumnTypeScale: 1 },
      referenceAmount: { amount: 40, unit: 'g', category: 'Cereal' },
    },
    nutritionExemption: {
      kind: 'small-package',
      availableSurfaceSqInches: 10,
      contactLine: 'Call',
    },
    responsibleFirm: {
      name: 'Example Foods',
      isManufacturer: true,
      qualifyingPhrase: 'Distributed by',
      streetAddress: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
    },
  },
} as const

type LabelType = keyof typeof BASES
type Path = readonly (string | number)[]

/** A copy of `value` with `path` set, creating nothing: every path below exists in a base. */
function withValue(value: unknown, path: Path, replacement: unknown): unknown {
  if (path.length === 0) return replacement
  const [key, ...rest] = path
  const copy = (Array.isArray(value) ? [...value] : { ...(value as object) }) as Record<
    string | number,
    unknown
  >
  copy[key!] = withValue(copy[key!], rest, replacement)
  return copy
}

const baseDocument = (labelType: LabelType) => ({
  name: 'Bounds',
  labelType,
  stock: STOCK,
  data: BASES[labelType],
})

const documentWith = (labelType: LabelType, path: Path, value: unknown) =>
  withValue(baseDocument(labelType), path, value)

/** Where a case is set, what it holds at its bound, and what it holds one step past it. */
interface Case {
  labelType: LabelType
  path: Path
  at: unknown
  past: unknown
  /**
   * Refused at the bound for another reason, by a check that is not this field's: a
   * statement code a hundred characters long has no verified text. Only the field's own
   * issue is then looked for.
   */
  refusedOtherwise?: true
}

const text = (labelType: LabelType, path: Path, max: number): Case => ({
  labelType,
  path,
  at: 'x'.repeat(max),
  past: 'x'.repeat(max + 1),
})
const list = (labelType: LabelType, path: Path, max: number, item: unknown): Case => ({
  labelType,
  path,
  at: Array.from({ length: max }, () => item),
  past: Array.from({ length: max + 1 }, () => item),
})
const ceiling = (labelType: LabelType, path: Path, max: number): Case => ({
  labelType,
  path,
  at: max,
  past: max * (1 + 1e-9),
})
const floor = (labelType: LabelType, path: Path, min: number): Case => ({
  labelType,
  path,
  at: min,
  past: min * (1 - 1e-9),
})

const D = ['data'] as const
const FOOD = 'us-food'
const GHS = 'ghs-chemical'
const UPC = 'gs1-retail'
const NUTRITION = [...D, 'nutritionFacts'] as const
const FIRM = [...D, 'responsibleFirm'] as const

const CASES: Case[] = [
  // Strings.
  text(FOOD, [...D, 'ingredients', 0, 'name'], B.ingredientName),
  text(FOOD, [...D, 'ingredientsExemption', 'mayBePresent', 0], B.ingredientName),
  text(GHS, [...D, 'productIdentifier'], B.productIdentifier),
  text(FOOD, [...D, 'statementOfIdentity'], B.statementOfIdentity),
  text(GHS, [...D, 'supplier', 'name'], B.name),
  text(GHS, [...D, 'supplier', 'address'], B.address),
  text(GHS, [...D, 'supplier', 'telephone'], B.telephone),
  text(FOOD, [...FIRM, 'name'], B.name),
  text(FOOD, [...FIRM, 'qualifyingPhrase'], B.qualifyingPhrase),
  text(FOOD, [...FIRM, 'streetAddress'], B.streetAddress),
  text(FOOD, [...FIRM, 'city'], B.city),
  text(FOOD, [...FIRM, 'state'], B.state),
  text(FOOD, [...FIRM, 'zip'], B.zip),
  text(GHS, [...D, 'outerPackageStatement'], B.statement),
  text(FOOD, [...D, 'ingredientsExemption', 'statement'], B.statement),
  text(FOOD, [...D, 'nutritionExemption', 'contactLine'], B.contactLine),
  text(FOOD, [...NUTRITION, 'servingSize'], B.servingSize),
  text(FOOD, [...NUTRITION, 'referenceAmount', 'category'], B.category),
  text(FOOD, [...D, 'netQuantity', 'inchPound'], B.netQuantity),
  text(FOOD, [...D, 'netQuantity', 'metric'], B.netQuantity),
  text(FOOD, [...NUTRITION, 'columns', 'headings', 0], B.heading),
  text(FOOD, [...NUTRITION, 'columns', 'headings', 1], B.heading),
  text(FOOD, [...D, 'ingredients', 0, 'allergenSpecificType'], B.allergenSpecificType),
  text(UPC, [...D, 'artwork', 'text'], B.artworkText),
  text(UPC, [...D, 'digitalLink', 'domain'], B.domain),
  text(UPC, [...D, 'digitalLink', 'lot'], B.aiValue),
  text(UPC, [...D, 'digitalLink', 'serial'], B.aiValue),
  text(UPC, [...D, 'digitalLink', 'expiry'], B.aiValue),
  { ...text(GHS, [...D, 'hazardStatementCodes', 0], B.statementCode), refusedOtherwise: true },
  {
    ...text(GHS, [...D, 'precautionaryStatementCodes', 0], B.statementCode),
    refusedOtherwise: true,
  },
  // Lists.
  list(FOOD, [...D, 'ingredients'], B.ingredients, { name: 'Oats' }),
  list(FOOD, [...D, 'ingredientsExemption', 'mayBePresent'], B.ingredients, 'Nuts'),
  list(GHS, [...D, 'hazardStatementCodes'], B.statementCodes, HAZARD),
  list(GHS, [...D, 'precautionaryStatementCodes'], B.statementCodes, PRECAUTION),
  list(GHS, [...D, 'signalWords'], B.closedList, 'Danger'),
  list(GHS, [...D, 'hazards'], B.closedList, HAZARD_CLASS_IDS[0]),
  list(GHS, [...D, 'pictograms'], B.closedList, 'GHS02'),
  list(FOOD, [...NUTRITION, 'order'], B.closedList, 'calories'),
  list(FOOD, [...D, 'containsStatement'], B.closedList, 'wheat'),
  // Numbers.
  ceiling(UPC, ['stock', 'widthMm'], B.stockMm),
  ceiling(GHS, ['stock', 'heightMm'], B.stockMm),
  ceiling(FOOD, ['stock', 'marginMm'], B.marginMm),
  ceiling(UPC, [...D, 'artwork', 'widthMm'], B.printedMm),
  ceiling(UPC, [...D, 'artwork', 'heightMm'], B.printedMm),
  ceiling(UPC, [...D, 'barHeightMm'], B.printedMm),
  ceiling(GHS, [...D, 'pictogramSideMm'], B.printedMm),
  ceiling(FOOD, [...D, 'containsStatementGapMm'], B.printedMm),
  ceiling(UPC, [...D, 'magnification'], B.magnification),
  ceiling(UPC, [...D, 'artwork', 'fontSizeMm'], B.fontSizeMaxMm),
  floor(UPC, [...D, 'artwork', 'fontSizeMm'], B.fontSizeMinMm),
  ceiling(FOOD, [...D, 'netQuantityFontSizeMm'], B.fontSizeMaxMm),
  floor(FOOD, [...D, 'netQuantityFontSizeMm'], B.fontSizeMinMm),
  ceiling(FOOD, [...D, 'informationPanelFontSizeMm'], B.fontSizeMaxMm),
  floor(FOOD, [...D, 'informationPanelFontSizeMm'], B.fontSizeMinMm),
  ceiling(FOOD, [...D, 'containsStatementFontSizeMm'], B.fontSizeMaxMm),
  floor(FOOD, [...D, 'containsStatementFontSizeMm'], B.fontSizeMinMm),
  ceiling(FOOD, [...NUTRITION, 'typeScale'], B.typeScaleMax),
  floor(FOOD, [...NUTRITION, 'typeScale'], B.typeScaleMin),
  ceiling(FOOD, [...NUTRITION, 'columns', 'secondColumnTypeScale'], B.typeScaleMax),
  floor(FOOD, [...NUTRITION, 'columns', 'secondColumnTypeScale'], B.typeScaleMin),
  ceiling(FOOD, [...D, 'container', 'widthMm'], B.containerMm),
  ceiling(FOOD, [...D, 'container', 'heightMm'], B.containerMm),
  {
    labelType: FOOD,
    path: [...D, 'container'],
    at: { shape: 'cylindrical', heightMm: 100, circumferenceMm: B.containerMm },
    past: { shape: 'cylindrical', heightMm: 100, circumferenceMm: B.containerMm + 1 },
  },
  {
    labelType: FOOD,
    path: [...D, 'container'],
    at: { shape: 'cylindrical', heightMm: B.containerMm, circumferenceMm: 300 },
    past: { shape: 'cylindrical', heightMm: B.containerMm + 1, circumferenceMm: 300 },
  },
  {
    labelType: FOOD,
    path: [...D, 'container'],
    at: { shape: 'other', totalSurfaceAreaSqMm: B.containerSqMm, obviousPanelAreaSqMm: 1 },
    past: { shape: 'other', totalSurfaceAreaSqMm: B.containerSqMm + 1, obviousPanelAreaSqMm: 1 },
  },
  {
    labelType: FOOD,
    path: [...D, 'container'],
    at: { shape: 'other', totalSurfaceAreaSqMm: 1e6, obviousPanelAreaSqMm: B.containerSqMm },
    past: { shape: 'other', totalSurfaceAreaSqMm: 1e6, obviousPanelAreaSqMm: B.containerSqMm + 1 },
  },
]

const issuePaths = (result: ReturnType<typeof LabelDocumentInput.safeParse>) =>
  result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))

describe('every bound in INPUT_BOUNDS', () => {
  it('accepts every base document, so each refusal below is the bound’s', () => {
    for (const labelType of Object.keys(BASES) as LabelType[]) {
      const result = LabelDocumentInput.safeParse(baseDocument(labelType))
      expect(result.success, `${labelType}: ${issuePaths(result).join(', ')}`).toBe(true)
    }
  })

  it.each(CASES.map((c) => [c.path.join('.'), c] as const))(
    'accepts %s at its bound and refuses it past it',
    (_name, { labelType, path, at, past, refusedOtherwise }) => {
      // The issue names the field, or the list, it was raised for: a container's shape
      // replaces the whole object, so its issue sits one level down.
      const field = path.join('.')
      const raisedHere = (result: ReturnType<typeof LabelDocumentInput.safeParse>) =>
        issuePaths(result).some((p) => p === field || p.startsWith(`${field}.`))

      const accepted = LabelDocumentInput.safeParse(documentWith(labelType, path, at))
      if (refusedOtherwise) expect(raisedHere(accepted)).toBe(false)
      else expect(accepted.success, issuePaths(accepted).join(', ')).toBe(true)

      const refused = LabelDocumentInput.safeParse(documentWith(labelType, path, past))
      expect(refused.success).toBe(false)
      expect(raisedHere(refused), issuePaths(refused).join(', ')).toBe(true)
    },
  )

  it('lets a label name every statement code the tables hold', () => {
    for (const regime of GHS_REGIMES) {
      expect(knownHazardStatementCodes(regime).length).toBeLessThan(B.statementCodes)
      expect(knownPrecautionaryStatementCodes(regime).length).toBeLessThan(B.statementCodes)
    }
  })

  it('lets a closed list name every value it is drawn from', () => {
    for (const values of [
      GHS_SIGNAL_WORDS,
      HAZARD_CLASS_IDS,
      GHS_PICTOGRAM_CODES,
      NUTRIENT_IDS,
      MAJOR_FOOD_ALLERGEN_IDS,
    ]) {
      expect(values.length).toBeLessThan(B.closedList)
    }
  })
})

describe('the bounds on a check request', () => {
  const check = (data: object, stock?: object) =>
    LabelCheckRequest.safeParse({
      labelType: 'gs1-retail',
      data: { gtin: '036000291452', ...data },
      ...(stock === undefined ? {} : { stock }),
    })

  it('accepts a printed Digital Link at its bound and refuses it past it', () => {
    const uri = (length: number) => {
      const stem = 'https://id.example.com/'
      return stem + 'a'.repeat(length - stem.length)
    }
    expect(check({ digitalLink: { uri: uri(B.printedUri) } }).success).toBe(true)
    const refused = check({ digitalLink: { uri: uri(B.printedUri + 1) } })
    expect(refused.success).toBe(false)
    expect(refused.error?.issues[0]?.path).toEqual(['data', 'digitalLink', 'uri'])
  })

  it('takes the stock bounds, which it derives from the saved label’s stock', () => {
    expect(check({}, { widthMm: B.stockMm, heightMm: B.stockMm }).success).toBe(true)
    const refused = check({}, { widthMm: B.stockMm + 1, heightMm: 50 })
    expect(refused.success).toBe(false)
    expect(refused.error?.issues[0]?.path).toEqual(['stock', 'widthMm'])
  })
})
