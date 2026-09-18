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
  DEFAULT_GHS_STOCK,
  DEFAULT_UPC_A_STOCK,
  DEFAULT_US_FOOD_STOCK,
  LayoutError,
  blockingOmissions,
  labelFilename,
  layOutGhsLabel,
  layOutUpcALabel,
  layOutUsFoodLabel,
  type GhsLabelData,
  type UpcALabelData,
  type UsFoodLabelData,
} from '@packwright/label-core'
import * as bwip from 'bwip-js/generic'
import { Router, type Request, type RequestHandler, type Response } from 'express'
import rateLimit from 'express-rate-limit'

import { renderLayoutToPdf } from './renderPdf'
import {
  GhsRequest,
  UpcARequest,
  UsFoodRequest,
  toArtwork,
  toContainer,
  toDigitalLink,
  toIngredient,
  toNetQuantity,
  toNutritionFacts,
  toResponsibleFirm,
  toSupplier,
} from './schemas'

/**
 * What one client may render in an hour.
 *
 * Every call here lays out a label and renders a PDF, which is CPU this process
 * has only one of — a handful of concurrent callers is enough to make the server
 * unresponsive to everyone else, and unlike the audit route there is no bill to
 * notice it on. The figure is generous for the work: a person exporting labels
 * does it a few times an hour, and a proof cycle that needed sixty would be an
 * unusual afternoon.
 *
 * Deliberately per client and not per process. An export costs this server time
 * and nothing else, so one caller going too fast is the whole problem — where
 * the audit route also needed a process-wide cap, because there the cost is
 * money and it is shared.
 */
export const DEFAULT_EXPORT_LIMIT = { perHour: 60 } as const

export interface ExportLimit {
  /** PDF renders per client per hour. */
  perHour: number
}

export function createLabelRouter(
  options: { limit?: ExportLimit | false | undefined } = {},
): Router {
  const router = Router()
  const { limit } = options

  // Stated rather than defaulted, as the audit route's quotas are and for the
  // same reason: `createApp` builds the same application every time it is called.
  //
  // Held as a handler and attached to each route rather than `router.use`d, for
  // the reason the audit route's quotas are: mounted on the router it counted
  // every path beneath it, so a 404 spent an allowance denominated in renders.
  const guards: RequestHandler[] =
    limit === false || limit === undefined
      ? []
      : [
          rateLimit({
            windowMs: 60 * 60 * 1000,
            limit: limit.perHour,
            standardHeaders: 'draft-7',
            legacyHeaders: false,
            message: { error: 'Too many exports — try again later' },
          }),
        ]

  router.post('/upc-a/export', ...guards, async (request: Request, response: Response) => {
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

  router.post('/ghs/export', ...guards, async (request: Request, response: Response) => {
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

  router.post('/us-food/export', ...guards, async (request: Request, response: Response) => {
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
      ...(rest.ingredientsExemption === undefined
        ? {}
        : { ingredientsExemption: rest.ingredientsExemption }),
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
      ...(rest.nutritionExemption === undefined
        ? {}
        : { nutritionExemption: rest.nutritionExemption }),
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
