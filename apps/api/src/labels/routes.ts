/**
 * Label export routes.
 *
 * The API's job here is narrow: validate the request, ask `label-core` to
 * resolve a layout, and stream the PDF. It computes no geometry of its own —
 * every millimetre comes from the same engine the browser preview uses, which is
 * the entire reason the export can be trusted to match what the user saw.
 */

import {
  DEFAULT_UPC_A_STOCK,
  LayoutError,
  MAX_MAGNIFICATION,
  MIN_MAGNIFICATION,
  getSymbologyConstraints,
  layOutUpcALabel,
} from '@packwright/label-core'
import * as bwip from 'bwip-js/generic'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { renderLayoutToPdf } from './renderPdf'

/**
 * A UPC-A payload is the eleven digits a user types; the twelfth is computed.
 * Validated here as well as in the engine so a bad request is a 400 rather than
 * a 500 — the engine throws because it is a library, not because it is an API.
 */
// Bounds come from `label-core` rather than being restated. Each side used to
// carry its own copy of the payload length and the magnification range, tested
// against itself — so the two could drift apart without a single test failing.
const UPC_A_PAYLOAD_LENGTH = getSymbologyConstraints('UPC-A')?.payloadLength.min ?? 11

const UpcARequest = z.object({
  gtinPayload: z
    .string()
    .regex(
      new RegExp(`^[0-9]{${UPC_A_PAYLOAD_LENGTH}}$`),
      `A UPC-A payload is exactly ${UPC_A_PAYLOAD_LENGTH} digits`,
    ),
  magnification: z.number().min(MIN_MAGNIFICATION).max(MAX_MAGNIFICATION).optional(),
  barHeightMm: z.number().positive().optional(),
  stock: z
    .object({
      widthMm: z.number().positive(),
      heightMm: z.number().positive(),
      marginMm: z.number().min(0),
    })
    .optional(),
})

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

    const { stock = DEFAULT_UPC_A_STOCK, gtinPayload, magnification, barHeightMm } = parsed.data

    // Built key by key rather than spread: under `exactOptionalPropertyTypes` an
    // absent optional and one explicitly set to `undefined` are different types,
    // and a spread produces the second.
    const data = {
      gtinPayload,
      ...(magnification === undefined ? {} : { magnification }),
      ...(barHeightMm === undefined ? {} : { barHeightMm }),
    }

    try {
      const layout = layOutUpcALabel(bwip as never, { data, stock })
      const pdf = await renderLayoutToPdf(layout)

      response
        .status(200)
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Length', String(pdf.length))
        .setHeader(
          'Content-Disposition',
          `attachment; filename="${layout.symbols[0]?.value ?? 'label'}.pdf"`,
        )
      response.end(pdf)
    } catch (error) {
      // A layout that cannot be produced is the caller's problem, not the
      // server's — asking for a 2x symbol on stock too small to carry its quiet
      // zone is a 422, and the message says exactly what would not fit.
      if (error instanceof LayoutError) {
        response.status(422).json({ error: 'Label cannot be laid out', detail: error.message })
        return
      }
      throw error
    }
  })

  return router
}
