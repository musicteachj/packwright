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
  GHS_PICTOGRAM_CODES,
  GHS_SIGNAL_WORDS,
  LayoutError,
  getSymbologyConstraints,
  layOutGhsLabel,
  layOutUpcALabel,
  type ArtworkBlock,
  type DigitalLinkData,
  type GhsLabelData,
  type GhsSupplier,
  type UpcALabelData,
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
  productIdentifier: z.string().min(1),
  // Bounded below only, and required. Capacity selects the CLP Table 1.3 band
  // that every dimensional rule is measured against; defaulting it would invent
  // a requirement the caller never stated.
  capacityL: z.number().positive(),
  // Both enums are derived from `label-core`'s own lists rather than restated,
  // so a signal word or pictogram code cannot exist on one side and not the
  // other — the drift the UPC-A schema was already fixed for.
  signalWord: z.enum(GHS_SIGNAL_WORDS).optional(),
  pictograms: z.array(z.enum(GHS_PICTOGRAM_CODES)).optional(),
  hazardStatements: z.array(z.string()).optional(),
  precautionaryStatements: z.array(z.string()).optional(),
  supplier: GhsSupplierSchema.optional(),
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
      // Only an *absent element* makes the export worthless. A detail the
      // engine could not draw is recorded and shipped, because the label around
      // it is real — see `LayoutOmission.scope`.
      const blocking = layout.omissions.filter((omission) => omission.scope === 'element')
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
      productIdentifier: rest.productIdentifier,
      capacityL: rest.capacityL,
      ...(rest.signalWord === undefined ? {} : { signalWord: rest.signalWord }),
      ...(rest.pictograms === undefined ? {} : { pictograms: rest.pictograms }),
      ...(rest.hazardStatements === undefined ? {} : { hazardStatements: rest.hazardStatements }),
      ...(rest.precautionaryStatements === undefined
        ? {}
        : { precautionaryStatements: rest.precautionaryStatements }),
      ...(rest.supplier === undefined ? {} : { supplier: toSupplier(rest.supplier) }),
      ...(rest.pictogramSideMm === undefined ? {} : { pictogramSideMm: rest.pictogramSideMm }),
    }

    try {
      const layout = layOutGhsLabel({ data, stock })

      const blocking = layout.omissions.filter((omission) => omission.scope === 'element')
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
          `attachment; filename="${data.productIdentifier.replace(/[^a-zA-Z0-9._-]+/g, '-')}.pdf"`,
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
