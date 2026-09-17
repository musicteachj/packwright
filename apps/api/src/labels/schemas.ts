/**
 * What a label is, as a shape a request can be checked against.
 *
 * Extracted from `routes.ts` because the export routes are no longer the only
 * thing that needs it: a saved label is the same label, and validating it
 * against a second, separately-written description of the same fields would be
 * two sources of truth for one set of facts. That is the drift
 * `getSymbologyConstraints` was introduced below to end — each side used to
 * carry its own copy of the payload length and the magnification range, tested
 * against itself, so the two could disagree without a single test failing.
 *
 * The `toX` functions come with the schemas rather than staying with the routes.
 * They exist to reconcile Zod's `string | undefined` with `label-core`'s
 * genuinely-absent optionals under `exactOptionalPropertyTypes`, which is a fact
 * about the schema above them rather than about any particular route.
 */

import {
  ANCHORS,
  GHS_PICTOGRAM_CODES,
  GHS_REGIMES,
  HAZARD_CLASS_IDS,
  canonicalStatementCode,
  hazardStatementText,
  knownHazardStatementCodes,
  knownPrecautionaryStatementCodes,
  precautionaryStatementText,
  GHS_SIGNAL_WORDS,
  getSymbologyConstraints,
  INGREDIENT_THRESHOLD_PERCENTS,
  DUAL_COLUMN_BASES,
  NUTRITION_COLUMN_MODES,
  NUTRITION_FORMATS,
  MAJOR_FOOD_ALLERGEN_IDS,
  NUTRIENT_IDS,
  DAILY_VALUE_POPULATIONS,
  US_FOOD_INGREDIENTS_EXEMPTIONS_CLAIMED_ALONE,
  US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE,
  UNIT_CONTAINER_WORDINGS,
  US_FOOD_EGG_CARTON_PRESENTATIONS,
  US_FOOD_PACKAGINGS,
  type ArtworkBlock,
  type DigitalLinkData,
  type GhsRegime,
  type GhsSupplier,
  type UsFoodLabelData,
  type UsFoodNetQuantity,
  type UsFoodIngredient,
  type UsFoodNutritionFacts,
  type UsFoodResponsibleFirm,
} from '@packwright/label-core'
import { z } from 'zod'
import { EMBEDDED_FONT_FAMILIES } from './renderPdf'

/**
 * A GTIN-12 as printed on the pack — the eleven digits a user types plus the
 * check digit, which is now supplied rather than computed so that a wrong one
 * can be caught instead of silently corrected.
 *
 * Both figures come from `label-core` rather than being restated. Each side used
 * to carry its own copy of the payload length and the magnification range,
 * tested against itself — so the two could drift apart without a single test
 * failing.
 */
export const UPC_A_CONSTRAINTS = getSymbologyConstraints('UPC-A')
export const GTIN_LENGTH =
  (UPC_A_CONSTRAINTS?.payloadLength.min ?? 11) + (UPC_A_CONSTRAINTS?.appendsCheckDigit ? 1 : 0)

export const Artwork = z.object({
  text: z.string().min(1),
  anchor: z.enum(ANCHORS),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  fontSizeMm: z.number().positive().optional(),
  // Constrained to the faces the exporter actually embeds. Free text here
  // reached PDFKit's `document.font()`, which resolves an unknown name as a
  // filesystem path.
  fontFamily: z.enum(EMBEDDED_FONT_FAMILIES as [string, ...string[]]).optional(),
})

export const DigitalLink = z.object({
  domain: z.string().min(1),
  lot: z.string().optional(),
  serial: z.string().optional(),
  expiry: z.string().optional(),
  useConvenienceAlphas: z.boolean().optional(),
})

export const UpcARequest = z.object({
  gtin: z
    .string()
    .regex(
      new RegExp(`^[0-9]{${GTIN_LENGTH}}$`),
      `A GTIN-12 is exactly ${GTIN_LENGTH} digits, check digit included`,
    ),
  // Bounded below only. The specification's 0.8–2.0 range is a rule, reported
  // with its citation against the resolved layout; zero or negative is not a
  // symbol at all.
  magnification: z.number().positive().optional(),
  barHeightMm: z.number().positive().optional(),
  omitHri: z.boolean().optional(),
  symbolPlacement: z.enum(ANCHORS).optional(),
  artwork: Artwork.optional(),
  digitalLink: DigitalLink.optional(),
  stock: z
    .object({
      widthMm: z.number().positive(),
      heightMm: z.number().positive(),
      marginMm: z.number().min(0),
    })
    .optional(),
})

/**
 * Zod describes an absent optional as `string | undefined`; `label-core` declares
 * it as genuinely absent. Under `exactOptionalPropertyTypes` those are different
 * types, so the two shapes are reconciled here, once, by construction.
 *
 * Verbose, and worth it. The previous version reached for `as never`, which did
 * reconcile them — by switching off the only check that the request schema and
 * the engine's input still describe the same thing.
 */
export function toArtwork(artwork: z.infer<typeof Artwork>): ArtworkBlock {
  return {
    text: artwork.text,
    anchor: artwork.anchor,
    widthMm: artwork.widthMm,
    heightMm: artwork.heightMm,
    ...(artwork.fontSizeMm === undefined ? {} : { fontSizeMm: artwork.fontSizeMm }),
    ...(artwork.fontFamily === undefined ? {} : { fontFamily: artwork.fontFamily }),
  }
}

export function toDigitalLink(link: z.infer<typeof DigitalLink>): DigitalLinkData {
  return {
    domain: link.domain,
    ...(link.lot === undefined ? {} : { lot: link.lot }),
    ...(link.serial === undefined ? {} : { serial: link.serial }),
    ...(link.expiry === undefined ? {} : { expiry: link.expiry }),
    ...(link.useConvenienceAlphas === undefined
      ? {}
      : { useConvenienceAlphas: link.useConvenienceAlphas }),
  }
}

export const GhsSupplierSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  telephone: z.string().optional(),
})

/**
 * Statement codes, checked against the regime of the label carrying them.
 *
 * **The regime was sitting in the same object and was ignored.** Both arrays were
 * `z.enum(knownHazardStatementCodes('eu-clp'))` whatever `regime` said beside
 * them, so a `us-osha` label was validated against the EU table. An enum cannot
 * fix that: it is built once at module load and can never see a request's own
 * regime, and a regime-correct enum would be *empty* under `us-osha`, which
 * `z.enum` cannot express at all — the `as [string, ...string[]]` cast is what
 * used to hide that.
 *
 * So it is a refinement instead, asking the same question `apps/api/src/audit`
 * and the confirm screen already ask: is there verified text for this code under
 * this regime. Four validation sites, one mechanism.
 *
 * It also makes a sentence the audit endpoint already prints true. Its
 * `GHS_STATEMENT_TABLE_EMPTY` warning tells a user that “the saved-label and
 * export routes admit only codes with verified text”, which under `us-osha` was
 * exactly what this defect made false.
 *
 * Rejecting rather than dropping is deliberate and unchanged: the engine records
 * an omission for a code it cannot spell, so a silently-accepted one would leave
 * a label that looks complete and is not. Whether the two layers should agree the
 * other way — admit it and let the omission report it — is in `docs/BACKLOG.md`.
 */
const distinctCodes = (codes: string[]): string[] => [...new Set(codes.map(canonicalStatementCode))]

const STATEMENT_FIELDS = [
  {
    key: 'hazardStatementCodes',
    noun: 'hazard statement',
    textFor: hazardStatementText,
    known: knownHazardStatementCodes,
  },
  {
    key: 'precautionaryStatementCodes',
    noun: 'precautionary statement',
    textFor: precautionaryStatementText,
    known: knownPrecautionaryStatementCodes,
  },
] as const

interface StatementCodeCarrier {
  regime: GhsRegime
  hazardStatementCodes?: string[] | undefined
  precautionaryStatementCodes?: string[] | undefined
}

function statementCodesMatchRegime(value: StatementCodeCarrier, ctx: z.RefinementCtx): void {
  for (const field of STATEMENT_FIELDS) {
    const codes = value[field.key]
    if (codes === undefined || codes.length === 0) continue

    // Said once for the whole field rather than once per code. Under `us-osha`
    // every code lands here, and eleven identical sentences read like eleven
    // defects on the label instead of one gap in this build — the distinction
    // `apps/api/src/audit/extract.ts` draws for the same reason.
    if (field.known(value.regime).length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: [field.key],
        message:
          `This build carries no verified ${value.regime} ${field.noun} text, so no code can be ` +
          `saved or exported on a ${value.regime} label. That is a gap in this application, not a ` +
          'defect on the label.',
      })
      continue
    }

    // **The field, not an index.** These codes have been canonicalised and
    // deduplicated, so position no longer lines up with what the caller sent:
    // `['H225', 'h225', 'H999']` arrives here as two entries, and reporting
    // `hazardStatementCodes.1` points a client at its own `h225`, which is
    // fine. The code is named in the message, which is the part that locates it.
    for (const code of codes) {
      // Already reported by the entry's own `.trim().min(1)`. Zod runs an
      // object-level check even when a field raised a validation issue, so
      // without this a blank entry drew a second complaint — ““” has no verified
      // text” — naming a code the caller cannot go and look for.
      if (code === '') continue
      if (field.textFor(value.regime, code) !== undefined) continue
      ctx.addIssue({
        code: 'custom',
        path: [field.key],
        message:
          `“${code}” has no verified ${value.regime} ${field.noun} text in this build, so a label ` +
          'carrying it would print nothing for it.',
      })
    }
  }
}

/**
 * The fields of a GHS request, before the regime check is applied to them.
 *
 * Separate because `.omit()` throws at runtime on a Zod object carrying an
 * object-level refinement — “.omit() cannot be used on object schemas containing
 * refinements” — and `LabelDocumentInput` omits `stock` from this. TypeScript
 * does not catch it: `.omit` is still on the type. `UsFoodRequestBase` is split
 * for the same reason and its refinement is likewise applied after the omit.
 */
const GhsRequestShape = z.object({
  regime: z.enum(GHS_REGIMES),
  productIdentifier: z.string().min(1),
  // Bounded below only, and required. Capacity selects the CLP Table 1.3 band
  // that every dimensional rule is measured against; defaulting it would invent
  // a requirement the caller never stated.
  capacityL: z.number().positive(),
  // Both enums are derived from `label-core`'s own lists rather than restated,
  // so a signal word or pictogram code cannot exist on one side and not the
  // other — the drift the UPC-A schema was already fixed for.
  // Plural, so a label carrying both Danger and Warning is representable and
  // therefore checkable — see `GhsLabelData.signalWords`.
  signalWords: z.array(z.enum(GHS_SIGNAL_WORDS)).optional(),
  // Validated against label-core's own list rather than accepted as free
  // strings. An id one character off used to be discarded silently, so a label
  // drew no pictograms at all and the rules reported a green pass — a false
  // clearance produced by a typo.
  hazards: z.array(z.enum(HAZARD_CLASS_IDS as [string, ...string[]])).optional(),
  pictograms: z.array(z.enum(GHS_PICTOGRAM_CODES)).optional(),
  // Canonicalised on the way in, through `label-core`'s own function, because
  // the engine looks these up by exact key and every other layer already does
  // it. A caller sending `P337+P313` or `h225` — both of which the extraction
  // endpoint and the confirm screen accept — used to get a 400 from the enum
  // here, and a confirmed `p337+p313` that slipped through would have drawn
  // nothing and blamed the label for our punctuation. The refinement below reads
  // the canonical form, so the two cannot disagree about what a code is.
  //
  // **Distinct, and in the order they were sent**, which is the half of
  // `extract.ts`'s `resolvable()` that has to come with the canonicalising and
  // nearly did not. The engine draws one statement per entry, so `H225` twice is
  // the statement printed twice on the exported PDF. The old enum let exact
  // repeats through already; canonicalising without deduping would have added
  // `h225` beside `H225` to the ways of reaching it.
  //
  // `.trim().min(1)` rather than `.min(1)`: a whitespace-only entry has a length
  // and canonicalises to nothing, so the check below reported ““” has no verified
  // text” — a message naming no code, about a code the caller cannot find.
  hazardStatementCodes: z.array(z.string().trim().min(1)).transform(distinctCodes).optional(),
  precautionaryStatementCodes: z
    .array(z.string().trim().min(1))
    .transform(distinctCodes)
    .optional(),
  supplier: GhsSupplierSchema.optional(),
  smallContainerLabelling: z.boolean().optional(),
  outerPackageStatement: z.string().optional(),
  pictogramSideMm: z.number().positive().optional(),
  stock: z
    .object({
      widthMm: z.number().positive(),
      heightMm: z.number().positive(),
      marginMm: z.number().min(0),
    })
    .optional(),
})

export const GhsRequest = GhsRequestShape.superRefine(statementCodesMatchRegime)

/** The same key-by-key reconciliation `toArtwork` does, and for the same reason. */
export function toSupplier(supplier: z.infer<typeof GhsSupplierSchema>): GhsSupplier {
  return {
    name: supplier.name,
    address: supplier.address,
    ...(supplier.telephone === undefined ? {} : { telephone: supplier.telephone }),
  }
}

/**
 * The container, as a discriminated union matching `geometry/pdp`'s own.
 *
 * Three shapes with different dimensions rather than one object with everything
 * optional: 21 CFR 101.1 computes a different area for each, and a request
 * carrying a circumference *and* a total surface area describes two containers.
 * Zod's discriminated union rejects that at the boundary rather than letting the
 * engine pick.
 */
export const ContainerSchema = z.discriminatedUnion('shape', [
  z.object({
    shape: z.literal('rectangular'),
    widthMm: z.number().positive(),
    heightMm: z.number().positive(),
  }),
  z.object({
    shape: z.literal('cylindrical'),
    heightMm: z.number().positive(),
    circumferenceMm: z.number().positive(),
  }),
  z.object({
    shape: z.literal('other'),
    totalSurfaceAreaSqMm: z.number().positive(),
    obviousPanelAreaSqMm: z.number().positive().optional(),
  }),
])

/**
 * **A blank here is a compliance finding, not a malformed request.**
 *
 * These five fields were `z.string().min(1)`, which made the API reject label
 * documents the engine is built to draw and the rules to report — the editor's
 * own "Add an ingredient" button writes an entry with an empty name, so clicking
 * it turned Export into a raw-JSON 400. A `min(1)` standing in for a rule is a
 * schema deciding a regulatory question, and it decides it in the one place a
 * user cannot see a citation.
 *
 * Relaxed only once each had a rule behind it. Before this stage a blank
 * `statementOfIdentity`, ingredient name or `servingSize` was reported by
 * *nothing*, so relaxing them then would have traded a visible 400 for a silent
 * pass, which is the worse of the two failures by a long way. The GS1 and GHS
 * `min(1)`s stay: a blank `DigitalLink.domain` or `Artwork.text` is a malformed
 * request rather than a non-compliant label, and the schema is the right place
 * for those.
 */
export const NON_COMPLIANT_BUT_WELL_FORMED = z.string()

export const NetQuantitySchema = z.object({
  inchPound: NON_COMPLIANT_BUT_WELL_FORMED,
  metric: z.string().optional(),
  packaging: z.enum(US_FOOD_PACKAGINGS).optional(),
})

export const IngredientSchema = z.object({
  name: NON_COMPLIANT_BUT_WELL_FORMED,
  percentByWeight: z.number().min(0).max(100),
  // Derived from label-core's own list rather than restated. An allergen id one
  // character off would be discarded silently and the label would declare
  // nothing while reporting a clean allergen check — the exact false clearance
  // the GHS hazard-class enum was tightened for.
  allergen: z.enum(MAJOR_FOOD_ALLERGEN_IDS).optional(),
  allergenSpecificType: z.string().optional(),
  declareInline: z.boolean().optional(),
})

export const ResponsibleFirmSchema = z.object({
  name: NON_COMPLIANT_BUT_WELL_FORMED,
  isManufacturer: z.boolean(),
  qualifyingPhrase: z.string().optional(),
  streetAddress: z.string().optional(),
  streetAddressInDirectory: z.boolean().optional(),
  city: z.string(),
  state: z.string(),
  zip: z.string().optional(),
})

/**
 * The same key-by-key reconciliation the other nested objects get.
 *
 * Zod infers an optional key as `T | undefined`, and `exactOptionalPropertyTypes`
 * distinguishes "absent" from "present and undefined" — so the object is rebuilt
 * rather than spread.
 */
export function toColumns(
  columns: NonNullable<z.infer<typeof NutritionFactsSchema>['columns']>,
): NonNullable<UsFoodNutritionFacts['columns']> {
  return {
    mode: columns.mode,
    ...(columns.basis === undefined ? {} : { basis: columns.basis }),
    ...(columns.headings === undefined ? {} : { headings: columns.headings }),
    ...(columns.secondAmounts === undefined ? {} : { secondAmounts: columns.secondAmounts }),
    ...(columns.secondPercentDv === undefined ? {} : { secondPercentDv: columns.secondPercentDv }),
    ...(columns.separated === undefined ? {} : { separated: columns.separated }),
    ...(columns.secondColumnTypeScale === undefined
      ? {}
      : { secondColumnTypeScale: columns.secondColumnTypeScale }),
  }
}

/** The same key-by-key reconciliation the other nested objects get. */
export function toIngredient(ingredient: z.infer<typeof IngredientSchema>): UsFoodIngredient {
  return {
    name: ingredient.name,
    percentByWeight: ingredient.percentByWeight,
    ...(ingredient.allergen === undefined ? {} : { allergen: ingredient.allergen }),
    ...(ingredient.allergenSpecificType === undefined
      ? {}
      : { allergenSpecificType: ingredient.allergenSpecificType }),
    ...(ingredient.declareInline === undefined ? {} : { declareInline: ingredient.declareInline }),
  }
}

/** The same key-by-key reconciliation the other nested objects get. */
export function toNutritionFacts(
  panel: z.infer<typeof NutritionFactsSchema>,
): UsFoodNutritionFacts {
  return {
    servingSize: panel.servingSize,
    amounts: panel.amounts,
    ...(panel.servingsPerContainer === undefined
      ? {}
      : { servingsPerContainer: panel.servingsPerContainer }),
    ...(panel.declaredAmounts === undefined ? {} : { declaredAmounts: panel.declaredAmounts }),
    ...(panel.declaredPercentDv === undefined
      ? {}
      : { declaredPercentDv: panel.declaredPercentDv }),
    ...(panel.order === undefined ? {} : { order: panel.order }),
    ...(panel.representedFor === undefined ? {} : { representedFor: panel.representedFor }),
    ...(panel.typeScale === undefined ? {} : { typeScale: panel.typeScale }),
    ...(panel.format === undefined ? {} : { format: panel.format }),
    ...(panel.columns === undefined ? {} : { columns: toColumns(panel.columns) }),
    ...(panel.availableSurfaceSqInches === undefined
      ? {}
      : { availableSurfaceSqInches: panel.availableSurfaceSqInches }),
    ...(panel.cannotAccommodateVertical === undefined
      ? {}
      : { cannotAccommodateVertical: panel.cannotAccommodateVertical }),
    ...(panel.cannotAccommodateTabular === undefined
      ? {}
      : { cannotAccommodateTabular: panel.cannotAccommodateTabular }),
    ...(panel.continuousVerticalSpaceInches === undefined
      ? {}
      : { continuousVerticalSpaceInches: panel.continuousVerticalSpaceInches }),
    ...(panel.referenceAmount === undefined ? {} : { referenceAmount: panel.referenceAmount }),
    ...(panel.packageContent === undefined ? {} : { packageContent: panel.packageContent }),
    ...(panel.unitContent === undefined ? {} : { unitContent: panel.unitContent }),
    ...(panel.packagedAndSoldIndividually === undefined
      ? {}
      : { packagedAndSoldIndividually: panel.packagedAndSoldIndividually }),
    ...(panel.dualColumnExemption === undefined
      ? {}
      : {
          dualColumnExemption: {
            ...(panel.dualColumnExemption.rawCommodityVoluntary === undefined
              ? {}
              : { rawCommodityVoluntary: panel.dualColumnExemption.rawCommodityVoluntary }),
            ...(panel.dualColumnExemption.variedWeight === undefined
              ? {}
              : { variedWeight: panel.dualColumnExemption.variedWeight }),
          },
        }),
  }
}

/** The same key-by-key reconciliation the other nested objects get. */
export function toResponsibleFirm(
  firm: z.infer<typeof ResponsibleFirmSchema>,
): UsFoodResponsibleFirm {
  return {
    name: firm.name,
    isManufacturer: firm.isManufacturer,
    city: firm.city,
    state: firm.state,
    ...(firm.qualifyingPhrase === undefined ? {} : { qualifyingPhrase: firm.qualifyingPhrase }),
    ...(firm.streetAddress === undefined ? {} : { streetAddress: firm.streetAddress }),
    ...(firm.streetAddressInDirectory === undefined
      ? {}
      : { streetAddressInDirectory: firm.streetAddressInDirectory }),
    ...(firm.zip === undefined ? {} : { zip: firm.zip }),
  }
}

/**
 * Amounts keyed by nutrient id, with the ids derived from label-core's own list.
 * A key one character off would be dropped silently and the completeness rule
 * would then report the nutrient missing — a confusing finding produced by a
 * typo rather than by the label.
 */
export const NutrientAmounts = z.partialRecord(z.enum(NUTRIENT_IDS), z.number()).optional()

export const NutritionFactsSchema = z.object({
  servingSize: NON_COMPLIANT_BUT_WELL_FORMED,
  servingsPerContainer: z.number().positive().optional(),
  // `partialRecord`, not `record`. Zod 4 makes a record over an enum key
  // **exhaustive**, so `z.record` here demanded all fifteen nutrients and
  // rejected a panel declaring fourteen with a 400 — which is a compliance
  // finding the rules exist to report, not a malformed request. The same
  // mistake on `declaredAmounts` rejected any single-nutrient override.
  amounts: z.partialRecord(z.enum(NUTRIENT_IDS), z.number()),
  declaredAmounts: NutrientAmounts,
  declaredPercentDv: NutrientAmounts,
  order: z.array(z.enum(NUTRIENT_IDS)).optional(),
  // Whom the food is for, which moves it onto that group's Daily Values under
  // 101.9(c)(8)(i). Listed here and copied in `toNutritionFacts`, or Zod strips it
  // and the export prints adult percentages beside a preview showing toddler ones.
  representedFor: z.enum(DAILY_VALUE_POPULATIONS).optional(),
  typeScale: z.number().positive().optional(),
  format: z.enum(NUTRITION_FORMATS).optional(),
  // The second axis, derived from the same consts so a new column mode or basis
  // reaches the boundary without being restated. `headings` is a fixed pair
  // because 101.9(e)(3) presents the values "in two columns"; (e)(1)'s "two or
  // more" belongs to the aggregate display, which is not modelled yet.
  columns: z
    .object({
      mode: z.enum(NUTRITION_COLUMN_MODES),
      basis: z.enum(DUAL_COLUMN_BASES).optional(),
      headings: z.tuple([z.string(), z.string()]).optional(),
      // Zod **strips** unknown keys rather than rejecting them, so a field missing
      // here is silently dropped: a document carrying `secondAmounts` previewed
      // with a populated second column in the browser and exported a blank one,
      // which is the single thing this architecture exists to prevent. Omitting
      // `separated` also made `FDA_DUAL_COLUMN_NOT_SEPARATED` unprovokable through
      // the API — a rule with a fixture and no route to it.
      secondAmounts: NutrientAmounts,
      // The percentages that column prints, where it states its own rather than letting
      // them derive — which is the only way a food for children 1 through 3 can give the
      // protein percentage (c)(7)(i) requires of it in both columns.
      secondPercentDv: NutrientAmounts,
      separated: z.boolean().optional(),
      secondColumnTypeScale: z.number().positive().optional(),
    })
    .optional(),
  referenceAmount: z
    .object({ amount: z.number().positive(), unit: z.enum(['g', 'mL']), category: z.string() })
    .optional(),
  packageContent: z.number().positive().optional(),
  unitContent: z.number().positive().optional(),
  packagedAndSoldIndividually: z.boolean().optional(),
  dualColumnExemption: z
    .object({
      rawCommodityVoluntary: z.boolean().optional(),
      variedWeight: z.boolean().optional(),
    })
    .optional(),
  availableSurfaceSqInches: z.number().positive().optional(),
  cannotAccommodateVertical: z.boolean().optional(),
  cannotAccommodateTabular: z.boolean().optional(),
  continuousVerticalSpaceInches: z.number().positive().optional(),
})

export const UsFoodRequestBase = z.object({
  statementOfIdentity: NON_COMPLIANT_BUT_WELL_FORMED,
  netQuantity: NetQuantitySchema,
  // Required, and not defaulted. The container selects the 101.7(i) type-size
  // band; supplying one the caller never stated would invent the requirement
  // every finding on this label is measured against.
  container: ContainerSchema,
  markingMethod: z.enum(['printed', 'blown-embossed-or-molded']).optional(),
  netQuantityFontSizeMm: z.number().positive().optional(),
  netQuantityAnchor: z.enum(ANCHORS).optional(),
  informationPanelFontSizeMm: z.number().positive().optional(),
  ingredients: z.array(IngredientSchema).optional(),
  // The four figures 21 CFR 101.4(a)(2) permits, derived from label-core's own
  // list rather than restated — a fifth would be a compliance defect, so it is
  // rejected at the boundary rather than drawn and reported.
  ingredientThreshold: z
    .object({
      percent: z.union(
        INGREDIENT_THRESHOLD_PERCENTS.map((p) => z.literal(p)) as unknown as [
          z.ZodLiteral<2>,
          z.ZodLiteral<1.5>,
          z.ZodLiteral<1>,
          z.ZodLiteral<0.5>,
        ],
      ),
      count: z.number().int().min(0),
    })
    .optional(),
  // The paragraph claimed, from label-core's own list — a kind it does not name is an
  // exemption no rule could judge, so it is refused here rather than drawn.
  ingredientsExemption: z
    .union([
      z.object({ kind: z.enum(US_FOOD_INGREDIENTS_EXEMPTIONS_CLAIMED_ALONE) }),
      z.object({
        kind: z.literal('assortment'),
        statement: z.string(),
        mayBePresent: z.array(z.string()),
      }),
    ])
    .optional(),
  // Superseded, and accepted so a label saved with it still opens and exports.
  ingredientsExempt: z.boolean().optional(),
  containsStatement: z.array(z.enum(MAJOR_FOOD_ALLERGEN_IDS)).optional(),
  containsStatementFontSizeMm: z.number().positive().optional(),
  containsStatementGapMm: z.number().min(0).optional(),
  nutritionFacts: NutritionFactsSchema.optional(),
  // Claimed by paragraph alone; or the small package with the area that qualifies it
  // and the line (j)(13)(i)(A) puts on its label — a blank area is not accepted here,
  // since the rule would refuse it anyway and a saved label should not carry one; or
  // the unit container with the wording of (j)(15)(iii)'s statement it bears, from the
  // three the paragraph permits; or the egg carton with where (j)(14) has its nutrition
  // information presented, which it still declares in `nutritionFacts`.
  nutritionExemption: z
    .union([
      z.object({ kind: z.enum(US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE) }),
      z.object({
        kind: z.literal('small-package'),
        availableSurfaceSqInches: z.number().positive(),
        contactLine: z.string(),
      }),
      z.object({ kind: z.literal('unit-container'), wording: z.enum(UNIT_CONTAINER_WORDINGS) }),
      z.object({
        kind: z.literal('egg-carton'),
        presentedIn: z.enum(US_FOOD_EGG_CARTON_PRESENTATIONS),
      }),
    ])
    .optional(),
  // Superseded, as `ingredientsExempt` is.
  nutritionFactsExempt: z.boolean().optional(),
  responsibleFirm: ResponsibleFirmSchema.optional(),
  stock: z
    .object({
      widthMm: z.number().positive(),
      heightMm: z.number().positive(),
      marginMm: z.number().min(0),
    })
    .optional(),
})

/**
 * A quantifying statement cannot cover entries that are not on the list.
 *
 * An unbounded count drew a leading empty sentence and left the order rule with
 * nothing to examine, which it reported as a pass — so it is refused here rather
 * than clamped silently, the way an impermissible threshold is.
 *
 * Named rather than inlined so that a saved us-food document gets the same check
 * as one posted for export. `.refine` returns something that is no longer an
 * object, and `.omit` is an object method — so the saved-document shape has to
 * be built from the base and refined again, and building it from the base
 * without this would validate a stored label more weakly than the same label
 * sent to the exporter. Two paths disagreeing about what a valid label is, is
 * the condition this architecture exists to prevent.
 */
export const coversOnlyListedIngredients = (request: {
  ingredientThreshold?: { count?: number } | undefined
  ingredients?: readonly unknown[] | undefined
}): boolean => (request.ingredientThreshold?.count ?? 0) <= (request.ingredients?.length ?? 0)

export const COVERS_ONLY_LISTED_INGREDIENTS: { path: PropertyKey[]; message: string } = {
  path: ['ingredientThreshold', 'count'],
  message: 'cannot cover more entries than the ingredient list contains',
}

export const UsFoodRequest = UsFoodRequestBase.refine(
  coversOnlyListedIngredients,
  COVERS_ONLY_LISTED_INGREDIENTS,
)

/** The same key-by-key reconciliation `toArtwork` and `toSupplier` do. */
export function toNetQuantity(netQuantity: z.infer<typeof NetQuantitySchema>): UsFoodNetQuantity {
  return {
    inchPound: netQuantity.inchPound,
    ...(netQuantity.metric === undefined ? {} : { metric: netQuantity.metric }),
    ...(netQuantity.packaging === undefined ? {} : { packaging: netQuantity.packaging }),
  }
}

/**
 * And again for the container, whose optional member sits one level deeper.
 *
 * Only the `other` branch has one. Spreading the parsed object wholesale would
 * carry `obviousPanelAreaSqMm: undefined` into a type that says the property is
 * either present with a number or absent — which is the distinction
 * `exactOptionalPropertyTypes` exists to keep, and the one `as never` switched
 * off the last time this boundary was crossed carelessly.
 */
export function toContainer(
  container: z.infer<typeof ContainerSchema>,
): UsFoodLabelData['container'] {
  if (container.shape !== 'other') return container
  return {
    shape: 'other',
    totalSurfaceAreaSqMm: container.totalSurfaceAreaSqMm,
    ...(container.obviousPanelAreaSqMm === undefined
      ? {}
      : { obviousPanelAreaSqMm: container.obviousPanelAreaSqMm }),
  }
}

/**
 * The label types the editor can produce, in one place.
 *
 * The model and the routes both need this list. It is declared here because this
 * file is already where the shape of a label is decided, and a second copy is
 * the drift `getSymbologyConstraints` was introduced to end.
 */
export const LABEL_TYPES = ['gs1-retail', 'ghs-chemical', 'us-food'] as const

export const StockSchema = z.object({
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  marginMm: z.number().min(0),
})

/** Required, trimmed, and not unique — two drafts of the same product is normal. */
const SavedLabelName = z.string().trim().min(1).max(120)

/**
 * A saved label, as it arrives and as it comes back out.
 *
 * Discriminated on `labelType`, so a document claiming to be `us-food` while
 * carrying a `gtin` cannot be represented — which is also why the routes replace
 * rather than merge.
 *
 * **`stock` is required here and optional on the export request.** An export
 * borrows `DEFAULT_UPC_A_STOCK` and its siblings for one PDF; a saved label
 * records what it was designed at. Inheriting the default instead would mean
 * that changing one of those constants silently resizes every label already
 * stored against it, and the resize would first be visible in a PDF somebody had
 * already sent to a printer.
 */
export const LabelDocumentInput = z.discriminatedUnion('labelType', [
  z.object({
    name: SavedLabelName,
    labelType: z.literal('gs1-retail'),
    stock: StockSchema,
    data: UpcARequest.omit({ stock: true }),
  }),
  z.object({
    name: SavedLabelName,
    labelType: z.literal('ghs-chemical'),
    stock: StockSchema,
    // The shape, then the same check — not `GhsRequest.omit(...)`, which throws at
    // runtime on a refined object while still type-checking.
    data: GhsRequestShape.omit({ stock: true }).superRefine(statementCodesMatchRegime),
  }),
  z.object({
    name: SavedLabelName,
    labelType: z.literal('us-food'),
    stock: StockSchema,
    data: UsFoodRequestBase.omit({ stock: true }).refine(
      coversOnlyListedIngredients,
      COVERS_ONLY_LISTED_INGREDIENTS,
    ),
  }),
])

export type LabelDocumentInput = z.infer<typeof LabelDocumentInput>
