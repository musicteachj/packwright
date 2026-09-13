/**
 * Label export routes.
 *
 * The API's job here is narrow: validate the request, ask `label-core` to
 * resolve a layout, and stream the PDF. It computes no geometry of its own —
 * every millimetre comes from the same engine the browser preview uses, which is
 * the entire reason the export can be trusted to match what the user saw.
 *
 * It deliberately does **not** refuse a non-compliant label. A 2.5x symbol or a
 * quiet zone lost to artwork is a finding, not a bad request: the engine draws
 * what it was asked for and the rules say what is wrong with it. Exporting a
 * label you have been told is non-compliant is the user's call to make, and the
 * client warns before it does. What still earns a 400 is a request that
 * describes no drawing — a magnification of zero, stock with no area.
 */

import {
  ANCHORS,
  DEFAULT_GHS_STOCK,
  DEFAULT_UPC_A_STOCK,
  DEFAULT_US_FOOD_STOCK,
  GHS_PICTOGRAM_CODES,
  GHS_REGIMES,
  HAZARD_CLASS_IDS,
  knownHazardStatementCodes,
  knownPrecautionaryStatementCodes,
  GHS_SIGNAL_WORDS,
  LayoutError,
  blockingOmissions,
  labelFilename,
  getSymbologyConstraints,
  INGREDIENT_THRESHOLD_PERCENTS,
  NUTRITION_FORMATS,
  MAJOR_FOOD_ALLERGEN_IDS,
  NUTRIENT_IDS,
  US_FOOD_PACKAGINGS,
  layOutGhsLabel,
  layOutUpcALabel,
  layOutUsFoodLabel,
  type ArtworkBlock,
  type DigitalLinkData,
  type GhsLabelData,
  type GhsSupplier,
  type UpcALabelData,
  type UsFoodLabelData,
  type UsFoodNetQuantity,
  type UsFoodIngredient,
  type UsFoodNutritionFacts,
  type UsFoodResponsibleFirm,
} from '@packwright/label-core'
import * as bwip from 'bwip-js/generic'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { EMBEDDED_FONT_FAMILIES, renderLayoutToPdf } from './renderPdf'

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
const UPC_A_CONSTRAINTS = getSymbologyConstraints('UPC-A')
const GTIN_LENGTH =
  (UPC_A_CONSTRAINTS?.payloadLength.min ?? 11) + (UPC_A_CONSTRAINTS?.appendsCheckDigit ? 1 : 0)

const Artwork = z.object({
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

const DigitalLink = z.object({
  domain: z.string().min(1),
  lot: z.string().optional(),
  serial: z.string().optional(),
  expiry: z.string().optional(),
  useConvenienceAlphas: z.boolean().optional(),
})

const UpcARequest = z.object({
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
function toArtwork(artwork: z.infer<typeof Artwork>): ArtworkBlock {
  return {
    text: artwork.text,
    anchor: artwork.anchor,
    widthMm: artwork.widthMm,
    heightMm: artwork.heightMm,
    ...(artwork.fontSizeMm === undefined ? {} : { fontSizeMm: artwork.fontSizeMm }),
    ...(artwork.fontFamily === undefined ? {} : { fontFamily: artwork.fontFamily }),
  }
}

function toDigitalLink(link: z.infer<typeof DigitalLink>): DigitalLinkData {
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

const GhsSupplierSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  telephone: z.string().optional(),
})

const GhsRequest = z.object({
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
  hazardStatementCodes: z
    .array(z.enum(knownHazardStatementCodes('eu-clp') as [string, ...string[]]))
    .optional(),
  precautionaryStatementCodes: z
    .array(z.enum(knownPrecautionaryStatementCodes('eu-clp') as [string, ...string[]]))
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

/** The same key-by-key reconciliation `toArtwork` does, and for the same reason. */
function toSupplier(supplier: z.infer<typeof GhsSupplierSchema>): GhsSupplier {
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
const ContainerSchema = z.discriminatedUnion('shape', [
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
const NON_COMPLIANT_BUT_WELL_FORMED = z.string()

const NetQuantitySchema = z.object({
  inchPound: NON_COMPLIANT_BUT_WELL_FORMED,
  metric: z.string().optional(),
  packaging: z.enum(US_FOOD_PACKAGINGS).optional(),
})

const IngredientSchema = z.object({
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

const ResponsibleFirmSchema = z.object({
  name: NON_COMPLIANT_BUT_WELL_FORMED,
  isManufacturer: z.boolean(),
  qualifyingPhrase: z.string().optional(),
  streetAddress: z.string().optional(),
  streetAddressInDirectory: z.boolean().optional(),
  city: z.string(),
  state: z.string(),
  zip: z.string().optional(),
})

/** The same key-by-key reconciliation the other nested objects get. */
function toIngredient(ingredient: z.infer<typeof IngredientSchema>): UsFoodIngredient {
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
function toNutritionFacts(panel: z.infer<typeof NutritionFactsSchema>): UsFoodNutritionFacts {
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
    ...(panel.typeScale === undefined ? {} : { typeScale: panel.typeScale }),
    ...(panel.format === undefined ? {} : { format: panel.format }),
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
  }
}

/** The same key-by-key reconciliation the other nested objects get. */
function toResponsibleFirm(firm: z.infer<typeof ResponsibleFirmSchema>): UsFoodResponsibleFirm {
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
const NutrientAmounts = z.partialRecord(z.enum(NUTRIENT_IDS), z.number()).optional()

const NutritionFactsSchema = z.object({
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
  typeScale: z.number().positive().optional(),
  format: z.enum(NUTRITION_FORMATS).optional(),
  availableSurfaceSqInches: z.number().positive().optional(),
  cannotAccommodateVertical: z.boolean().optional(),
  cannotAccommodateTabular: z.boolean().optional(),
  continuousVerticalSpaceInches: z.number().positive().optional(),
})

const UsFoodRequest = z
  .object({
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
    ingredientsExempt: z.boolean().optional(),
    containsStatement: z.array(z.enum(MAJOR_FOOD_ALLERGEN_IDS)).optional(),
    containsStatementFontSizeMm: z.number().positive().optional(),
    containsStatementGapMm: z.number().min(0).optional(),
    nutritionFacts: NutritionFactsSchema.optional(),
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
  // A quantifying statement cannot cover entries that are not on the list. An
  // unbounded count drew a leading empty sentence and left the order rule with
  // nothing to examine, which it reported as a pass — so it is refused here
  // rather than clamped silently, the way an impermissible threshold is.
  .refine(
    (request) => (request.ingredientThreshold?.count ?? 0) <= (request.ingredients?.length ?? 0),
    {
      path: ['ingredientThreshold', 'count'],
      message: 'cannot cover more entries than the ingredient list contains',
    },
  )

/** The same key-by-key reconciliation `toArtwork` and `toSupplier` do. */
function toNetQuantity(netQuantity: z.infer<typeof NetQuantitySchema>): UsFoodNetQuantity {
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
function toContainer(container: z.infer<typeof ContainerSchema>): UsFoodLabelData['container'] {
  if (container.shape !== 'other') return container
  return {
    shape: 'other',
    totalSurfaceAreaSqMm: container.totalSurfaceAreaSqMm,
    ...(container.obviousPanelAreaSqMm === undefined
      ? {}
      : { obviousPanelAreaSqMm: container.obviousPanelAreaSqMm }),
  }
}

export function createLabelRouter(): Router {
  const router = Router()

  router.post('/upc-a/export', async (request: Request, response: Response) => {
    const parsed = UpcARequest.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        error: 'Invalid label request',
        detail: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
      return
    }

    const { stock = DEFAULT_UPC_A_STOCK, ...rest } = parsed.data

    // Built key by key rather than cast. Under `exactOptionalPropertyTypes` an
    // absent optional and one explicitly set to `undefined` are different types,
    // so a spread does not satisfy `UpcALabelData` — and the `as never` that
    // silenced it also switched off the only check that the request schema and
    // the engine's input still agree on.
    const data: UpcALabelData = {
      gtin: rest.gtin,
      ...(rest.magnification === undefined ? {} : { magnification: rest.magnification }),
      ...(rest.barHeightMm === undefined ? {} : { barHeightMm: rest.barHeightMm }),
      ...(rest.omitHri === undefined ? {} : { omitHri: rest.omitHri }),
      ...(rest.symbolPlacement === undefined ? {} : { symbolPlacement: rest.symbolPlacement }),
      ...(rest.artwork === undefined ? {} : { artwork: toArtwork(rest.artwork) }),
      ...(rest.digitalLink === undefined ? {} : { digitalLink: toDigitalLink(rest.digitalLink) }),
    }

    try {
      const layout = layOutUpcALabel(bwip as never, { data, stock })

      // A label whose barcode could not be drawn is a blank page, and a blank
      // page is not an export. The browser warns before it gets here; a script
      // or a partner integration got 200 and 1,145 bytes of nothing, with the
      // reason recorded only in a field it never reads.
      const blocking = blockingOmissions(layout)
      if (blocking.length > 0) {
        response.status(422).json({
          error: 'Label cannot be exported',
          detail: blocking.map((omission) => omission.reason),
        })
        return
      }

      const pdf = await renderLayoutToPdf(layout)

      response
        .status(200)
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Length', String(pdf.length))
        .setHeader('Content-Disposition', `attachment; filename="${data.gtin}.pdf"`)
      response.end(pdf)
    } catch (error) {
      // A layout that cannot be produced at all is the caller's problem, not the
      // server's, and the message says exactly what could not be drawn.
      if (error instanceof LayoutError) {
        response.status(422).json({ error: 'Label cannot be laid out', detail: error.message })
        return
      }
      throw error
    }
  })

  router.post('/ghs/export', async (request: Request, response: Response) => {
    const parsed = GhsRequest.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        error: 'Invalid label request',
        detail: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
      return
    }

    const { stock = DEFAULT_GHS_STOCK, ...rest } = parsed.data

    const data: GhsLabelData = {
      regime: rest.regime,
      productIdentifier: rest.productIdentifier,
      capacityL: rest.capacityL,
      ...(rest.signalWords === undefined ? {} : { signalWords: rest.signalWords }),
      ...(rest.hazards === undefined ? {} : { hazards: rest.hazards }),
      ...(rest.pictograms === undefined ? {} : { pictograms: rest.pictograms }),
      ...(rest.hazardStatementCodes === undefined
        ? {}
        : { hazardStatementCodes: rest.hazardStatementCodes }),
      ...(rest.precautionaryStatementCodes === undefined
        ? {}
        : { precautionaryStatementCodes: rest.precautionaryStatementCodes }),
      ...(rest.supplier === undefined ? {} : { supplier: toSupplier(rest.supplier) }),
      ...(rest.smallContainerLabelling === undefined
        ? {}
        : { smallContainerLabelling: rest.smallContainerLabelling }),
      ...(rest.outerPackageStatement === undefined
        ? {}
        : { outerPackageStatement: rest.outerPackageStatement }),
      ...(rest.pictogramSideMm === undefined ? {} : { pictogramSideMm: rest.pictogramSideMm }),
    }

    try {
      const layout = layOutGhsLabel({ data, stock })

      const blocking = blockingOmissions(layout)
      if (blocking.length > 0) {
        response.status(422).json({
          error: 'Label cannot be exported',
          detail: blocking.map((omission) => omission.reason),
        })
        return
      }

      const pdf = await renderLayoutToPdf(layout)

      response
        .status(200)
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Length', String(pdf.length))
        .setHeader(
          'Content-Disposition',
          `attachment; filename="${labelFilename(data.productIdentifier)}"`,
        )
      response.end(pdf)
    } catch (error) {
      if (error instanceof LayoutError) {
        response.status(422).json({ error: 'Label cannot be laid out', detail: error.message })
        return
      }
      throw error
    }
  })

  router.post('/us-food/export', async (request: Request, response: Response) => {
    const parsed = UsFoodRequest.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        error: 'Invalid label request',
        detail: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
      return
    }

    const { stock = DEFAULT_US_FOOD_STOCK, ...rest } = parsed.data

    const data: UsFoodLabelData = {
      statementOfIdentity: rest.statementOfIdentity,
      netQuantity: toNetQuantity(rest.netQuantity),
      container: toContainer(rest.container),
      ...(rest.markingMethod === undefined ? {} : { markingMethod: rest.markingMethod }),
      ...(rest.netQuantityFontSizeMm === undefined
        ? {}
        : { netQuantityFontSizeMm: rest.netQuantityFontSizeMm }),
      ...(rest.netQuantityAnchor === undefined
        ? {}
        : { netQuantityAnchor: rest.netQuantityAnchor }),
      ...(rest.informationPanelFontSizeMm === undefined
        ? {}
        : { informationPanelFontSizeMm: rest.informationPanelFontSizeMm }),
      ...(rest.ingredients === undefined
        ? {}
        : { ingredients: rest.ingredients.map(toIngredient) }),
      ...(rest.ingredientThreshold === undefined
        ? {}
        : { ingredientThreshold: rest.ingredientThreshold }),
      ...(rest.ingredientsExempt === undefined
        ? {}
        : { ingredientsExempt: rest.ingredientsExempt }),
      ...(rest.containsStatement === undefined
        ? {}
        : { containsStatement: rest.containsStatement }),
      ...(rest.containsStatementFontSizeMm === undefined
        ? {}
        : { containsStatementFontSizeMm: rest.containsStatementFontSizeMm }),
      ...(rest.containsStatementGapMm === undefined
        ? {}
        : { containsStatementGapMm: rest.containsStatementGapMm }),
      ...(rest.nutritionFacts === undefined
        ? {}
        : { nutritionFacts: toNutritionFacts(rest.nutritionFacts) }),
      ...(rest.nutritionFactsExempt === undefined
        ? {}
        : { nutritionFactsExempt: rest.nutritionFactsExempt }),
      ...(rest.responsibleFirm === undefined
        ? {}
        : { responsibleFirm: toResponsibleFirm(rest.responsibleFirm) }),
    }

    try {
      const layout = layOutUsFoodLabel({ data, stock })

      const blocking = blockingOmissions(layout)
      if (blocking.length > 0) {
        response.status(422).json({
          error: 'Label cannot be exported',
          detail: blocking.map((omission) => omission.reason),
        })
        return
      }

      const pdf = await renderLayoutToPdf(layout)

      response
        .status(200)
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Length', String(pdf.length))
        .setHeader(
          'Content-Disposition',
          `attachment; filename="${labelFilename(data.statementOfIdentity)}"`,
        )
      response.end(pdf)
    } catch (error) {
      if (error instanceof LayoutError) {
        response.status(422).json({ error: 'Label cannot be laid out', detail: error.message })
        return
      }
      throw error
    }
  })

  return router
}
