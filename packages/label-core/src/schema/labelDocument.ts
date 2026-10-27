/**
 * What a label is, as a shape a request can be checked against.
 *
 * **In `label-core` so that every door refuses the same documents in the same
 * words.** It began inside the API's export routes, moved beside them once saved
 * labels needed the same description, and moved here for the MCP server of
 * `docs/plans/2026-10-10-mcp.md`: a server that checked a label against its own
 * copy of these fields could accept a document the exporter refuses, or refuse
 * one with a different sentence, and nobody would notice until a user did. It
 * could not move while it took the embedded font list from the PDF renderer,
 * which loads PDFKit and Node; that list is now `text/faces.ts`.
 *
 * One description also ends the drift `getSymbologyConstraints` was introduced
 * below to end — each side used to carry its own copy of the payload length and
 * the magnification range, tested against itself, so the two could disagree
 * without a single test failing.
 *
 * **Reached through `@packwright/label-core/schema`, not the package root.** The
 * schemas are built when this module loads, which a bundler cannot prove free of
 * side effects, and the web app — which imports the root and validates nothing
 * with zod — would otherwise carry zod and every schema in its bundle.
 *
 * The `toX` functions come with the schemas. They exist to reconcile Zod's
 * `string | undefined` with `label-core`'s genuinely-absent optionals under
 * `exactOptionalPropertyTypes`, which is a fact about the schema above them
 * rather than about any particular route.
 */

import { z } from 'zod'
import {
  DUAL_COLUMN_BASES,
  NUTRITION_COLUMN_MODES,
  NUTRITION_FORMATS,
} from '../fda/nutritionFormats'
import { MAJOR_FOOD_ALLERGEN_IDS } from '../fda/allergens'
import { DAILY_VALUE_POPULATIONS, NUTRIENT_IDS } from '../fda/nutrients'
import { UNIT_CONTAINER_WORDINGS } from '../fda/unitContainerStatement'
import { HAZARD_CLASS_IDS } from '../ghs/classification'
import { GHS_PICTOGRAM_CODES } from '../ghs/pictograms'
import {
  GHS_REGIMES,
  canonicalStatementCode,
  hazardStatementText,
  knownHazardStatementCodes,
  knownPrecautionaryStatementCodes,
  precautionaryStatementText,
  type GhsRegime,
} from '../ghs/statements'
import { EDGELESS_MM, type JudgeRequest } from '../judge/judge'
import { LABEL_TYPES } from '../rules/types'
import { getSymbologyConstraints } from '../symbology/constraints'
import type { BarcodeEncoder } from '../symbology/layOutSymbol'
import {
  DEFAULT_GHS_STOCK,
  GHS_SIGNAL_WORDS,
  type GhsLabelData,
  type GhsSupplier,
} from '../templates/ghs'
import { ANCHORS, type ArtworkBlock, type LabelStock } from '../templates/stock'
import { DEFAULT_UPC_A_STOCK, type DigitalLinkData, type UpcALabelData } from '../templates/upcA'
import {
  DEFAULT_US_FOOD_STOCK,
  INGREDIENT_THRESHOLD_PERCENTS,
  US_FOOD_EGG_CARTON_PRESENTATIONS,
  US_FOOD_INGREDIENTS_EXEMPTIONS_CLAIMED_ALONE,
  US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE,
  US_FOOD_PACKAGINGS,
  type UsFoodIngredient,
  type UsFoodLabelData,
  type UsFoodNetQuantity,
  type UsFoodNutritionFacts,
  type UsFoodResponsibleFirm,
} from '../templates/usFood'
import { EMBEDDED_FONT_FAMILIES } from '../text/faces'

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

/**
 * **The bounds on what a label may hold**, added before deployment because none of these
 * fields had one: every free-text field took any length, every list any count, a stock
 * any size and a type size any smallness, and code that grows faster than its input then
 * blocked the server for up to five minutes on one request inside the 256 KB body limit
 * (`docs/security-review-2026-10-18.md`, finding 1). The superlinear code was rewritten as
 * well; these bounds are what keep the rest of the work in proportion to a real label.
 *
 * **Each sits far above anything a rule judges**, or for a floor far below it, so a label
 * that is merely non-compliant still reaches the rule and its citation rather than a 400.
 * The figures the rules judge, from their code: AI (10) and (21) values of 20 characters,
 * magnification from 0.8 to 2.0, net quantity type from 1/16 in and information panel type
 * from 1/32 in (21 CFR 101.7(i), 101.2(c)), and CLP Table 1.3's largest label, 148 × 210 mm.
 *
 * **Sized against the longest real values that could be found**, read on 2026-10-18; each
 * figure's reasoning is beside it. What a bound could still refuse that is lawful is in
 * `docs/WHAT-IS-NOT-CHECKED.md`, "Input limits".
 *
 * **Not bounded above:** `capacityL`, `servingsPerContainer`, `packageContent`,
 * `unitContent`, the nutrient amounts and the surface figures in inches. Each selects a
 * band or is printed as a number, and none becomes a coordinate; Zod 4 already refuses
 * anything not finite.
 */
export const INPUT_BOUNDS = {
  /**
   * An ingredient, or a name an assortment may contain. The longest whole ingredient lists
   * in Open Food Facts run to 3,576 characters on a US label (a Great Value brownie
   * variety pack) and 7,730 on a multilingual EU one, and in a variety pack one compound
   * ingredient can be nearly the whole list, so one entry is allowed twice the longest list.
   */
  ingredientName: 16_000,
  /**
   * Entries on an ingredient list. Open Food Facts' longest parsed lists reach about 400,
   * counting the sub-ingredients that here sit inside an entry's name.
   */
  ingredients: 1_000,
  /**
   * A GHS product identifier. IUPAC names reach 626 characters, and CLP Art. 18(3) wants up
   * to four chemical names on a mixture's label "unless more than four names are needed to
   * reflect the nature and the severity of the hazards", beside its trade name.
   */
  productIdentifier: 8_000,
  /** A food's statement of identity: about three times the longest product name found (177). */
  statementOfIdentity: 500,
  /** A name: a supplier or a responsible firm. No longest was found, so generous. */
  name: 300,
  /** A supplier's whole address, in one field. */
  address: 1_000,
  /** A telephone number, room left for an emergency number and its hours. */
  telephone: 200,
  /** "Manufactured for", "Distributed by" and the like. */
  qualifyingPhrase: 200,
  /** A street address line. */
  streetAddress: 500,
  /** A city: Bangkok's ceremonial name, the longest place name, is 168 letters. */
  city: 200,
  /** A state, province or region. */
  state: 100,
  /** A postal code: formats run to 10 characters (Iran's, and ZIP+4 with its hyphen). */
  zip: 20,
  /** A statement printed as prose: the outer package statement, an assortment's statement. */
  statement: 2_000,
  /** The small package's line under 101.9(j)(13)(i)(A): a telephone number, address or URL. */
  contactLine: 500,
  /** A serving size: the longest label statement in 21 CFR 101.12(b)'s tables is 245 characters. */
  servingSize: 300,
  /** A reference amount's category: the longest in 101.12(b) is 342 characters. */
  category: 500,
  /** One half of the net quantity, drawn unwrapped on one line: "NET WT 1 LB 4 OZ". */
  netQuantity: 200,
  /** A dual-column heading, drawn unwrapped: "Per serving", "Per container". */
  heading: 100,
  /** The specific allergen: the tree nuts or fish an ingredient names. */
  allergenSpecificType: 200,
  /** Artwork text on a retail label, drawn unwrapped on one line. */
  artworkText: 1_000,
  /** A resolver's origin and any path stem before the key. */
  domain: 1_000,
  /** A lot, serial or expiry date: ten times the 20 characters AI (10) and (21) allow, so a long one is reported by the rule. */
  aiValue: 200,
  /**
   * A Digital Link as printed: above the 2,953 bytes a QR Code holds at the most in binary
   * (Keyence, read 2026-10-18), so a link too long for any QR code is the only one refused.
   */
  printedUri: 4_096,
  /** One statement code, as `ghs_statement_text` already caps it in the MCP server. */
  statementCode: 100,
  /** Statement codes on a label: above the 129 precautionary codes of the EU table. */
  statementCodes: 500,
  /**
   * A list of values from a closed list (signal words, hazard classes, pictograms,
   * nutrients, allergens): above the 44 hazard classes, the longest of them, so only a
   * list repeating itself is refused.
   */
  closedList: 100,
  /** A label's stock, in millimeters: nearly five times the largest CLP Table 1.3 label (148 × 210 mm). */
  stockMm: 1_000,
  /** A label's margin: half the largest stock. */
  marginMm: 500,
  /**
   * The size of anything printed on the label, in millimeters (artwork, bar height,
   * pictograms, the gap before the Contains statement): no larger than the stock.
   */
  printedMm: 1_000,
  /** Magnification: five times the specification's largest, 2.0. The editor stops at 2.5. */
  magnification: 10,
  /**
   * The smallest type size, as an em in millimeters: the editor's own net quantity minimum,
   * and well under the 1/32 in (0.79 mm) letter the smallest regulated type is measured by.
   */
  fontSizeMinMm: 0.1,
  /** The largest type size, as an em in millimeters: the largest stock. */
  fontSizeMaxMm: 1_000,
  /** A type scale: the editor offers 10% to 300%. */
  typeScaleMin: 0.1,
  typeScaleMax: 10,
  /** A container's side or circumference, in millimeters: ten meters, past any food package. */
  containerMm: 10_000,
  /** A container's area, in square millimeters: ten meters square. */
  containerSqMm: 100_000_000,
} as const

const B = INPUT_BOUNDS

/** A type size, as an em in millimeters, between the floor and the ceiling above. */
const fontSizeMm = () => z.number().min(B.fontSizeMinMm).max(B.fontSizeMaxMm)

/** A size printed on the label, in millimeters. */
const printedMm = () => z.number().positive().max(B.printedMm)

/**
 * A label's stock. One shape for every door: the export requests carried three copies of
 * it, so a bound added here would have missed them.
 */
export const StockSchema = z.object({
  widthMm: z.number().positive().max(B.stockMm),
  heightMm: z.number().positive().max(B.stockMm),
  marginMm: z.number().min(0).max(B.marginMm),
})

export const Artwork = z.object({
  text: z.string().min(1).max(B.artworkText),
  anchor: z.enum(ANCHORS),
  widthMm: printedMm(),
  heightMm: printedMm(),
  fontSizeMm: fontSizeMm().optional(),
  // Constrained to the faces the exporter actually embeds. Free text here
  // reached PDFKit's `document.font()`, which resolves an unknown name as a
  // filesystem path.
  fontFamily: z.enum(EMBEDDED_FONT_FAMILIES).optional(),
})

// The descriptions below, and those on the GHS and US food fields, are what a model
// reading `check_label`'s schema is told about each field (they reach the advertised
// schema through `~standard.jsonSchema`). They change nothing accepted. Added on
// 2026-10-11 for the fields the 2026-10-10 evaluation found models getting wrong or
// could not have known: every model's first Digital Link sent a bare host name.
// Provisions named in them were read that day: FD&C Act §403(w)(1)(A) from govinfo
// (21 U.S.C. 343, 2023 edition); CLP Annex I 1.2.1.4 and 1.5 from the consolidated
// text 02008R1272-20260701 (EU Publications Office); 29 CFR 1910.1200(f)(12) from
// the eCFR as of 2026-10-01.
export const DigitalLink = z.object({
  domain: z
    .string()
    .min(1)
    .max(B.domain)
    .describe(
      'The resolver’s whole origin, scheme included — "https://id.example.com", not ' +
        '"id.example.com".',
    ),
  lot: z
    .string()
    .max(B.aiValue)
    .optional()
    .describe('Batch or lot number, GS1 Application Identifier (10).'),
  serial: z
    .string()
    .max(B.aiValue)
    .optional()
    .describe('Serial number, GS1 Application Identifier (21).'),
  expiry: z
    .string()
    .max(B.aiValue)
    .optional()
    .describe('Expiration date as YYMMDD, GS1 Application Identifier (17).'),
  useConvenienceAlphas: z
    .boolean()
    .optional()
    .describe(
      'Builds the link with /gtin/ where the standard writes /01/. Removed from GS1 Digital ' +
        'Link URI Syntax 1.3.0, and reported as such. For a link Packwright builds; check_label ' +
        'takes a printed link as its URI instead (PrintedDigitalLink).',
    ),
})

export const UpcARequest = z.object({
  gtin: z
    .string()
    .regex(
      new RegExp(`^[0-9]{${GTIN_LENGTH}}$`),
      `A GTIN-12 is exactly ${GTIN_LENGTH} digits, check digit included`,
    ),
  // The specification's 0.8–2.0 range is a rule, reported with its citation
  // against the resolved layout; zero or negative is not a symbol at all, and the
  // ceiling is far past the range (`INPUT_BOUNDS`).
  magnification: z
    .number()
    .positive()
    .max(B.magnification)
    .optional()
    .describe(
      'The symbol’s size as a factor of the nominal: 1 for 100%, 0.8 for 80% — not a ' +
        'percentage. Send it only if the user stated it: a value you supply yourself is judged ' +
        'as the printed label’s, 1 included. Omitted, check_label gives no verdict on ' +
        'magnification or bar height.',
    ),
  barHeightMm: printedMm()
    .optional()
    .describe(
      'The height of the bars in millimeters. Send it only if the user stated it: a value you ' +
        'supply yourself is judged as the printed label’s. Omitted, check_label gives no ' +
        'verdict on it.',
    ),
  omitHri: z
    .boolean()
    .optional()
    .describe(
      'false if the digits are printed beneath the barcode, true if they are not. Omitted, ' +
        'check_label gives no verdict on them.',
    ),
  symbolPlacement: z.enum(ANCHORS).optional(),
  artwork: Artwork.optional(),
  digitalLink: DigitalLink.optional(),
  stock: StockSchema.optional(),
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
  name: z.string().min(1).max(B.name),
  address: z.string().min(1).max(B.address),
  telephone: z.string().max(B.telephone).optional(),
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
  productIdentifier: z.string().min(1).max(B.productIdentifier),
  // Bounded below only, and required. Capacity selects the CLP Table 1.3 band
  // that every dimensional rule is measured against; defaulting it would invent
  // a requirement the caller never stated. No ceiling: it selects a band and is
  // never drawn (`INPUT_BOUNDS`).
  capacityL: z
    .number()
    .positive()
    .describe(
      'The capacity of the package in liters, not the size of the label. Selects the CLP ' +
        'Annex I Table 1.3 band the minimum label and pictogram sizes are taken from.',
    ),
  // Both enums are derived from `label-core`'s own lists rather than restated,
  // so a signal word or pictogram code cannot exist on one side and not the
  // other — the drift the UPC-A schema was already fixed for.
  // Plural, so a label carrying both Danger and Warning is representable and
  // therefore checkable — see `GhsLabelData.signalWords`.
  signalWords: z.array(z.enum(GHS_SIGNAL_WORDS)).max(B.closedList).optional(),
  // Validated against label-core's own list rather than accepted as free
  // strings. An id one character off used to be discarded silently, so a label
  // drew no pictograms at all and the rules reported a green pass — a false
  // clearance produced by a typo.
  hazards: z
    .array(z.enum(HAZARD_CLASS_IDS as [string, ...string[]]))
    .max(B.closedList)
    .optional(),
  pictograms: z.array(z.enum(GHS_PICTOGRAM_CODES)).max(B.closedList).optional(),
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
  hazardStatementCodes: z
    .array(z.string().trim().min(1).max(B.statementCode))
    .max(B.statementCodes)
    .transform(distinctCodes)
    .optional(),
  precautionaryStatementCodes: z
    .array(z.string().trim().min(1).max(B.statementCode))
    .max(B.statementCodes)
    .transform(distinctCodes)
    .optional(),
  supplier: GhsSupplierSchema.optional(),
  smallContainerLabelling: z
    .boolean()
    .optional()
    .describe(
      'True only if the supplier relies on the small-container provision — 29 CFR ' +
        '1910.1200(f)(12) on a US label, CLP Annex I section 1.5 on an EU one. Stated, not ' +
        'inferred from the capacity.',
    ),
  outerPackageStatement: z.string().max(B.statement).optional(),
  pictogramSideMm: printedMm()
    .optional()
    .describe(
      'The side of the smallest pictogram’s square in millimeters, not its diagonal: every ' +
        'pictogram is drawn at this one side, so give the smallest the label prints. Send it ' +
        'only if the user stated it. Omitted, the minimum for the capacity’s CLP Table 1.3 band ' +
        'is drawn, and on an EU label printed elsewhere the pictogram-size check gives no ' +
        'verdict and asks for it. OSHA sets no minimum pictogram size.',
    ),
  stock: StockSchema.optional(),
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
    widthMm: z.number().positive().max(B.containerMm),
    heightMm: z.number().positive().max(B.containerMm),
  }),
  z.object({
    shape: z.literal('cylindrical'),
    heightMm: z.number().positive().max(B.containerMm),
    circumferenceMm: z.number().positive().max(B.containerMm),
  }),
  z.object({
    shape: z.literal('other'),
    totalSurfaceAreaSqMm: z.number().positive().max(B.containerSqMm),
    obviousPanelAreaSqMm: z.number().positive().max(B.containerSqMm).optional(),
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
  inchPound: NON_COMPLIANT_BUT_WELL_FORMED.max(B.netQuantity),
  metric: z.string().max(B.netQuantity).optional(),
  packaging: z.enum(US_FOOD_PACKAGINGS).optional(),
})

export const IngredientSchema = z.object({
  name: NON_COMPLIANT_BUT_WELL_FORMED.max(B.ingredientName),
  // Optional, as in `UsFoodIngredient`: a percentage the labeller has not stated is
  // absent, not zero. The bounds still hold where one is given.
  percentByWeight: z.number().min(0).max(100).optional(),
  // Derived from label-core's own list rather than restated. An allergen id one
  // character off would be discarded silently and the label would declare
  // nothing while reporting a clean allergen check — the exact false clearance
  // the GHS hazard-class enum was tightened for.
  allergen: z.enum(MAJOR_FOOD_ALLERGEN_IDS).optional(),
  allergenSpecificType: z.string().max(B.allergenSpecificType).optional(),
  declareInline: z.boolean().optional(),
})

export const ResponsibleFirmSchema = z.object({
  name: NON_COMPLIANT_BUT_WELL_FORMED.max(B.name),
  isManufacturer: z.boolean(),
  qualifyingPhrase: z.string().max(B.qualifyingPhrase).optional(),
  streetAddress: z.string().max(B.streetAddress).optional(),
  streetAddressInDirectory: z.boolean().optional(),
  city: z.string().max(B.city),
  state: z.string().max(B.state),
  zip: z.string().max(B.zip).optional(),
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
    ...(ingredient.percentByWeight === undefined
      ? {}
      : { percentByWeight: ingredient.percentByWeight }),
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
  servingSize: NON_COMPLIANT_BUT_WELL_FORMED.max(B.servingSize),
  servingsPerContainer: z.number().positive().optional(),
  // `partialRecord`, not `record`. Zod 4 makes a record over an enum key
  // **exhaustive**, so `z.record` here demanded all fifteen nutrients and
  // rejected a panel declaring fourteen with a 400 — which is a compliance
  // finding the rules exist to report, not a malformed request. The same
  // mistake on `declaredAmounts` rejected any single-nutrient override.
  amounts: z.partialRecord(z.enum(NUTRIENT_IDS), z.number()),
  declaredAmounts: NutrientAmounts,
  declaredPercentDv: NutrientAmounts,
  order: z.array(z.enum(NUTRIENT_IDS)).max(B.closedList).optional(),
  // Whom the food is for, which moves it onto that group's Daily Values under
  // 101.9(c)(8)(i). Listed here and copied in `toNutritionFacts`, or Zod strips it
  // and the export prints adult percentages beside a preview showing toddler ones.
  representedFor: z.enum(DAILY_VALUE_POPULATIONS).optional(),
  typeScale: z.number().min(B.typeScaleMin).max(B.typeScaleMax).optional(),
  format: z.enum(NUTRITION_FORMATS).optional(),
  // The second axis, derived from the same consts so a new column mode or basis
  // reaches the boundary without being restated. `headings` is a fixed pair
  // because 101.9(e)(3) presents the values "in two columns"; (e)(1)'s "two or
  // more" belongs to the aggregate display, which is not modelled yet.
  columns: z
    .object({
      mode: z.enum(NUTRITION_COLUMN_MODES),
      basis: z.enum(DUAL_COLUMN_BASES).optional(),
      headings: z.tuple([z.string().max(B.heading), z.string().max(B.heading)]).optional(),
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
      secondColumnTypeScale: z.number().min(B.typeScaleMin).max(B.typeScaleMax).optional(),
    })
    .optional(),
  referenceAmount: z
    .object({
      amount: z.number().positive(),
      unit: z.enum(['g', 'mL']),
      category: z.string().max(B.category),
    })
    .optional(),
  packageContent: z.number().positive().optional(),
  unitContent: z.number().positive().optional(),
  packagedAndSoldIndividually: z.boolean().optional(),
  dualColumnExemption: z
    .object({
      rawCommodityVoluntary: z
        .boolean()
        .optional()
        .describe(
          'True for a raw fruit, vegetable or seafood whose nutrition labeling is voluntary, ' +
            'or about which a claim is made: either way 21 CFR 101.9(b)(12)(i)(B) excuses it ' +
            'from a second column. Leave it out for any other food.',
        ),
      variedWeight: z.boolean().optional(),
    })
    .optional(),
  availableSurfaceSqInches: z.number().positive().optional(),
  cannotAccommodateVertical: z.boolean().optional(),
  cannotAccommodateTabular: z.boolean().optional(),
  continuousVerticalSpaceInches: z.number().positive().optional(),
})

export const UsFoodRequestBase = z.object({
  statementOfIdentity: NON_COMPLIANT_BUT_WELL_FORMED.max(B.statementOfIdentity),
  netQuantity: NetQuantitySchema,
  // Required, and not defaulted. The container selects the 101.7(i) type-size
  // band; supplying one the caller never stated would invent the requirement
  // every finding on this label is measured against.
  container: ContainerSchema,
  markingMethod: z.enum(['printed', 'blown-embossed-or-molded']).optional(),
  netQuantityFontSizeMm: fontSizeMm().optional(),
  netQuantityAnchor: z.enum(ANCHORS).optional(),
  informationPanelFontSizeMm: fontSizeMm().optional(),
  ingredients: z.array(IngredientSchema).max(B.ingredients).optional(),
  singleIngredient: z
    .boolean()
    .optional()
    .describe(
      'Whether the food is made from a single ingredient (FD&C Act §403(i)(2) requires an ' +
        'ingredient statement only of a food made from two or more). Leave it out if the ' +
        'label lists its ingredients.',
    ),
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
        statement: z.string().max(B.statement),
        mayBePresent: z.array(z.string().max(B.ingredientName)).max(B.ingredients),
      }),
    ])
    .optional(),
  // Superseded, and accepted so a label saved with it still opens and exports.
  ingredientsExempt: z.boolean().optional(),
  containsStatement: z
    .array(z.enum(MAJOR_FOOD_ALLERGEN_IDS))
    .max(B.closedList)
    .optional()
    .describe(
      'The allergens the printed "Contains" statement names (FD&C Act §403(w)(1)(A)), as ' +
        'printed — not worked out from the ingredients. Leave it out entirely if the label ' +
        'has no "Contains" statement.',
    ),
  containsStatementFontSizeMm: fontSizeMm()
    .optional()
    .describe(
      'The "Contains" statement’s em size in millimeters. Omitted, it matches the ingredient ' +
        'list.',
    ),
  containsStatementGapMm: z.number().min(0).max(B.printedMm).optional(),
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
        contactLine: z.string().max(B.contactLine),
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
  stock: StockSchema.optional(),
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

/**
 * `stock` inside a check request's `data`, which is where the export requests keep
 * it and where a caller copying one of them would put it.
 *
 * Refused rather than stripped. Zod drops a key a schema does not list, so a stock
 * left inside `data` would vanish and the label be judged on the default stock —
 * every size and placement finding then about a label of a different size from the
 * one the caller described, with nothing to say so.
 */
const STOCK_BESIDE_DATA = z
  .never({ error: '`stock` goes beside `data` in a check request, not inside it' })
  .optional()

/**
 * Each label type's default stock, whose margin `checkedStock` applies where a check
 * request states none. Keyed on `LABEL_TYPES` rather than on the request's own type,
 * which is built from the schema below that reads this.
 */
const DEFAULT_STOCKS: Record<(typeof LABEL_TYPES)[number], LabelStock> = {
  'gs1-retail': DEFAULT_UPC_A_STOCK,
  'ghs-chemical': DEFAULT_GHS_STOCK,
  'us-food': DEFAULT_US_FOOD_STOCK,
}

/**
 * The default margins, as the `marginMm` description states them — read from
 * `DEFAULT_STOCKS`, the map `checkedStock` applies, so the figures a model is told are
 * the ones used, and a label type added there is added here. Found by review.
 */
const DEFAULT_MARGINS_TEXT = Object.entries(DEFAULT_STOCKS)
  .map(([labelType, stock]) => `${stock.marginMm} mm for ${labelType}`)
  .join(', ')

/**
 * The size of the label being checked, where the request states it.
 *
 * **Never borrowed.** An export draws the label, so the stock it borrows is the
 * true size of the PDF. A check judges a label that already exists, and a
 * borrowed size is a fact about some other label: with none given, the size rule
 * passed "The label is 74.00 mm × 105.00 mm" on labels nobody had measured, and a
 * 50 × 70 mm label too small for its package passed with it (the MCP evaluation
 * of 2026-10-10).
 *
 * **Optional since 2026-10-12.** Stage 20 made it required and told an assistant
 * to ask rather than guess, and the re-check of 2026-10-12 found that followed so
 * faithfully that 43 of 72 answers asked and checked nothing — a wrong check digit
 * left unreported for want of a label size it does not depend on. Left out now,
 * the label is judged on everything the size does not decide, and every check it
 * does decide waits for it under "checks that did not run" (`checkedStock`,
 * `LabelSubject`, James's decision of 2026-10-12). Nothing is assumed and passed.
 *
 * **The margin is optional**, because a person knows their label's size and
 * rarely its unprinted border. Absent, the label type's default margin is used,
 * and the answer says so (`checkedStock`, and `stockUsed` in the MCP server's
 * answer), so the assumption is stated rather than hidden. **The default is kept
 * on purpose** (decided 2026-10-11): a smaller assumed margin leaves more room,
 * and content that overruns at the label's real margin could then fit and pass —
 * a pass on geometry the label may not have. The default can only refuse, and a
 * refusal on an assumed margin says it was assumed.
 *
 * **Strict**, as the request around it is: a key it does not know is refused by
 * name rather than dropped. A `marginMM` dropped would have been judged at the
 * default margin with nothing to say the caller's figure was ignored.
 */
export const CheckStockSchema = z.strictObject(
  // `StockSchema`'s own fields, the margin made optional — derived rather than
  // restated, so a bound added there reaches the check request too.
  {
    ...StockSchema.shape,
    marginMm: StockSchema.shape.marginMm
      .optional()
      .describe(
        'The unprinted border in millimeters, if known. Omitted, the label type’s default is ' +
          `used — ${DEFAULT_MARGINS_TEXT} — and the answer says it was assumed.`,
      ),
  },
  {
    // Said for a stock sent in the wrong shape as well as for none at all, so an
    // assistant that sent "50 x 70 mm" is told the shape rather than told to ask. Not
    // for a key it does not know, which zod's own message names — this sentence in its
    // place told a caller who sent `marginMM` to ask for a size they had given.
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? undefined
        : '`stock` must be the printed label’s size: an object with widthMm and heightMm in ' +
          'millimeters, and marginMm if known. If the user has not said how big the label is, ' +
          'leave `stock` out rather than guess: the checks that depend on it will say so.',
  },
)

/**
 * A Digital Link on a label checked from its description: the URI as printed, and
 * nothing to infer. The editor's `DigitalLink` asks for a domain and whether the
 * convenience alphas are used, which is right for a link Packwright builds and wrong
 * for one a label already carries: a model reading `https://id.example.com/gtin/…` off
 * the label had to decide the flag itself, got it wrong in 5 of 12 answers in the
 * re-checks of 2026-10-16, and the rule then passed a `/01/` link the label does not
 * carry. James decided that day that `check_label` takes the printed URI only. Its
 * object is not strict, as nothing inside `data` is, so an old `{ domain }` is
 * refused for its missing `uri`, with this message.
 */
export const PrintedDigitalLink = z.object({
  uri: z
    .string({
      error:
        'Give the Digital Link exactly as the label prints it, in `uri`, for example ' +
        '"https://id.example.com/01/00036000291452". check_label takes no domain or ' +
        'convenience-alpha setting: it reads them from the URI.',
    })
    .trim()
    .min(1)
    .max(B.printedUri)
    .describe(
      'The Digital Link exactly as the label prints it (the text its QR code encodes), ' +
        'scheme, path and query included. Do not correct or rebuild it: it is judged as written.',
    ),
})

/** The UPC-A fields of a check request: the editor's, with the Digital Link as printed. */
export const UpcACheckRequest = UpcARequest.omit({ digitalLink: true }).extend({
  digitalLink: PrintedDigitalLink.optional(),
})

/**
 * A request to check a label: its type, its fields, and its stock.
 *
 * The saved-label shape without a name. Built from the same parts as
 * `LabelDocumentInput`, and refined the same way, so a document the exporter or the
 * saved-label routes refuse is refused here too, with the same issues. Two
 * differences: `STOCK_BESIDE_DATA`, and a stock that is never defaulted — stated,
 * or left out and then not assumed (`CheckStockSchema`, `checkedStock`), where the
 * export requests borrow a default. Read the stock through `checkedStock`, not
 * `request.stock`, which may be absent.
 *
 * **Strict at the top, and only there.** `{ labelType, data, stock }` refuses a key
 * it does not know — a `stok` would otherwise be dropped and the label judged as
 * one of unstated size, with the size the caller meant to give ignored in silence. Inside `data` unknown keys are
 * still stripped, as the exporter and the saved-label routes strip them: decision 4
 * of `docs/plans/2026-10-10-mcp.md` is that this door refuses what those refuse,
 * and the evaluation of 2026-10-10 found no model misspelling a key there.
 */
export const LabelCheckRequest = z.discriminatedUnion('labelType', [
  z.strictObject({
    labelType: z.literal('gs1-retail'),
    data: UpcACheckRequest.extend({ stock: STOCK_BESIDE_DATA }),
    stock: CheckStockSchema.optional(),
  }),
  z.strictObject({
    labelType: z.literal('ghs-chemical'),
    data: GhsRequestShape.extend({ stock: STOCK_BESIDE_DATA }).superRefine(
      statementCodesMatchRegime,
    ),
    stock: CheckStockSchema.optional(),
  }),
  z.strictObject({
    labelType: z.literal('us-food'),
    data: UsFoodRequestBase.extend({ stock: STOCK_BESIDE_DATA }).refine(
      coversOnlyListedIngredients,
      COVERS_ONLY_LISTED_INGREDIENTS,
    ),
    stock: CheckStockSchema.optional(),
  }),
])

export type LabelCheckRequest = z.output<typeof LabelCheckRequest>

/**
 * The check request as one object, **for describing it, not for checking it.**
 *
 * `LabelCheckRequest` is a union at its top, which JSON Schema writes as `oneOf`,
 * and Anthropic's API refuses a tool whose input schema has one there. Claude Code
 * says so and drops the tool — “Skipping tool "check_label": its input schema
 * uses top-level oneOf, which the Anthropic API does not accept”, from its own
 * debug log on 2026-10-10 — so a model would never see the one tool that matters.
 * This is the same request with the union moved down into `data`, where it is
 * accepted, for a client to read; a request is still validated against
 * `LabelCheckRequest`, which this cannot replace: it does not tie `data`'s form to
 * `labelType`, and it carries none of the refinements.
 */
export const LabelCheckRequestOutline = z.strictObject({
  labelType: z.enum(LABEL_TYPES).describe('Which kind of label `data` describes.'),
  data: z
    .union([
      UpcACheckRequest.omit({ stock: true }),
      GhsRequestShape.omit({ stock: true }),
      UsFoodRequestBase.omit({ stock: true }),
    ])
    .describe(
      "The label's fields, in the form `labelType` selects: the first for gs1-retail, the " +
        'second for ghs-chemical, the third for us-food.',
    ),
  stock: CheckStockSchema.optional().describe(
    'The printed label’s size in millimeters: widthMm and heightMm, and marginMm if known ' +
      '(the unprinted border; the label type’s default is used and said so if not). Beside ' +
      '`data`, not inside it. If the user has not said how big the label is, leave it out ' +
      'rather than guess: everything else is still checked, and the checks that depend on ' +
      'the size are listed under `declined`, asking for it.',
  ),
})

/**
 * A parsed UPC-A request as the engine's input.
 *
 * Built key by key rather than cast. Under `exactOptionalPropertyTypes` an
 * absent optional and one explicitly set to `undefined` are different types, so
 * a spread does not satisfy `UpcALabelData` — and the `as never` that silenced
 * it also switched off the only check that the request schema and the engine's
 * input still agree on.
 *
 * **Here rather than in each caller.** The export routes and the MCP server both
 * turn a parsed request into label data, and a field one of them forgot would be
 * stripped silently: a label previewed, or judged, with something the other door
 * never drew.
 */
export function toUpcALabelData(
  request: Omit<z.output<typeof UpcARequest>, 'stock'>,
): UpcALabelData {
  return {
    gtin: request.gtin,
    ...(request.magnification === undefined ? {} : { magnification: request.magnification }),
    ...(request.barHeightMm === undefined ? {} : { barHeightMm: request.barHeightMm }),
    ...(request.omitHri === undefined ? {} : { omitHri: request.omitHri }),
    ...(request.symbolPlacement === undefined ? {} : { symbolPlacement: request.symbolPlacement }),
    ...(request.artwork === undefined ? {} : { artwork: toArtwork(request.artwork) }),
    ...(request.digitalLink === undefined
      ? {}
      : { digitalLink: toDigitalLink(request.digitalLink) }),
  }
}

/**
 * A parsed UPC-A check request as the engine's input: the editor's fields by
 * `toUpcALabelData`, and the Digital Link as printed, judged as written.
 */
export function toUpcACheckLabelData(
  request: Omit<z.output<typeof UpcACheckRequest>, 'stock'>,
): UpcALabelData {
  const { digitalLink, ...rest } = request
  return {
    ...toUpcALabelData(rest),
    ...(digitalLink === undefined ? {} : { digitalLinkAsPrinted: digitalLink.uri }),
  }
}

/** A parsed GHS request as the engine's input, for the reasons `toUpcALabelData` gives. */
export function toGhsLabelData(
  request: Omit<z.output<typeof GhsRequestShape>, 'stock'>,
): GhsLabelData {
  return {
    regime: request.regime,
    productIdentifier: request.productIdentifier,
    capacityL: request.capacityL,
    ...(request.signalWords === undefined ? {} : { signalWords: request.signalWords }),
    ...(request.hazards === undefined ? {} : { hazards: request.hazards }),
    ...(request.pictograms === undefined ? {} : { pictograms: request.pictograms }),
    ...(request.hazardStatementCodes === undefined
      ? {}
      : { hazardStatementCodes: request.hazardStatementCodes }),
    ...(request.precautionaryStatementCodes === undefined
      ? {}
      : { precautionaryStatementCodes: request.precautionaryStatementCodes }),
    ...(request.supplier === undefined ? {} : { supplier: toSupplier(request.supplier) }),
    ...(request.smallContainerLabelling === undefined
      ? {}
      : { smallContainerLabelling: request.smallContainerLabelling }),
    ...(request.outerPackageStatement === undefined
      ? {}
      : { outerPackageStatement: request.outerPackageStatement }),
    ...(request.pictogramSideMm === undefined ? {} : { pictogramSideMm: request.pictogramSideMm }),
  }
}

/** A parsed US food request as the engine's input, for the reasons `toUpcALabelData` gives. */
export function toUsFoodLabelData(
  request: Omit<z.output<typeof UsFoodRequestBase>, 'stock'>,
): UsFoodLabelData {
  return {
    statementOfIdentity: request.statementOfIdentity,
    netQuantity: toNetQuantity(request.netQuantity),
    container: toContainer(request.container),
    ...(request.markingMethod === undefined ? {} : { markingMethod: request.markingMethod }),
    ...(request.netQuantityFontSizeMm === undefined
      ? {}
      : { netQuantityFontSizeMm: request.netQuantityFontSizeMm }),
    ...(request.netQuantityAnchor === undefined
      ? {}
      : { netQuantityAnchor: request.netQuantityAnchor }),
    ...(request.informationPanelFontSizeMm === undefined
      ? {}
      : { informationPanelFontSizeMm: request.informationPanelFontSizeMm }),
    ...(request.ingredients === undefined
      ? {}
      : { ingredients: request.ingredients.map(toIngredient) }),
    ...(request.singleIngredient === undefined
      ? {}
      : { singleIngredient: request.singleIngredient }),
    ...(request.ingredientThreshold === undefined
      ? {}
      : { ingredientThreshold: request.ingredientThreshold }),
    ...(request.ingredientsExemption === undefined
      ? {}
      : { ingredientsExemption: request.ingredientsExemption }),
    ...(request.ingredientsExempt === undefined
      ? {}
      : { ingredientsExempt: request.ingredientsExempt }),
    ...(request.containsStatement === undefined
      ? {}
      : { containsStatement: request.containsStatement }),
    ...(request.containsStatementFontSizeMm === undefined
      ? {}
      : { containsStatementFontSizeMm: request.containsStatementFontSizeMm }),
    ...(request.containsStatementGapMm === undefined
      ? {}
      : { containsStatementGapMm: request.containsStatementGapMm }),
    ...(request.nutritionFacts === undefined
      ? {}
      : { nutritionFacts: toNutritionFacts(request.nutritionFacts) }),
    ...(request.nutritionExemption === undefined
      ? {}
      : { nutritionExemption: request.nutritionExemption }),
    ...(request.nutritionFactsExempt === undefined
      ? {}
      : { nutritionFactsExempt: request.nutritionFactsExempt }),
    ...(request.responsibleFirm === undefined
      ? {}
      : { responsibleFirm: toResponsibleFirm(request.responsibleFirm) }),
  }
}

/**
 * The stock a check is judged on, and whether its margin was assumed.
 *
 * The one place that says so: `toJudgeRequest` draws on it, and a caller telling
 * the user what was judged reads `marginAssumed` here rather than working it out
 * again from the request.
 */
export function checkedStock(request: LabelCheckRequest): {
  stock: LabelStock
  marginAssumed: boolean
  /** False where the request stated no size: `stock` is then edgeless — see below. */
  sizeGiven: boolean
} {
  const defaultMarginMm = DEFAULT_STOCKS[request.labelType].marginMm
  if (request.stock === undefined) {
    return {
      stock: { widthMm: EDGELESS_MM, heightMm: EDGELESS_MM, marginMm: defaultMarginMm },
      marginAssumed: true,
      sizeGiven: false,
    }
  }
  const { widthMm, heightMm, marginMm } = request.stock
  return {
    stock: { widthMm, heightMm, marginMm: marginMm ?? defaultMarginMm },
    marginAssumed: marginMm === undefined,
    sizeGiven: true,
  }
}

// The edgeless side is the judge's, which enforces it; re-exported for the check request.
export { EDGELESS_MM } from '../judge/judge'

/**
 * A parsed check request as the judge's input, on the stock the request states,
 * with the label type's default margin where it states none.
 *
 * The encoder is the caller's, as `JudgeRequest` requires: `label-core` does not
 * import bwip-js.
 *
 * **Always `described`.** A check request is somebody's account of a label that
 * already exists, so the drawing is a reconstruction, and what the request cannot
 * carry — pictogram artwork, GHS type sizes — is not judged from it. See
 * `LabelSubject`.
 */
export function toJudgeRequest(request: LabelCheckRequest, barcode: BarcodeEncoder): JudgeRequest {
  const { stock, sizeGiven } = checkedStock(request)
  // Where no size was stated, the rules are told so and those it decides wait.
  const size = sizeGiven ? {} : { sizeUnstated: true as const }
  switch (request.labelType) {
    case 'gs1-retail':
      return {
        labelType: 'gs1-retail',
        data: toUpcACheckLabelData(request.data),
        stock,
        barcode,
        subject: 'described',
        ...size,
      }
    case 'ghs-chemical':
      return {
        labelType: 'ghs-chemical',
        data: toGhsLabelData(request.data),
        stock,
        subject: 'described',
        ...size,
      }
    case 'us-food':
      return {
        labelType: 'us-food',
        data: toUsFoodLabelData(request.data),
        stock,
        subject: 'described',
        ...size,
      }
  }
}
