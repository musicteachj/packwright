/**
 * Renders a resolved layout to a PDF buffer.
 *
 * This is the only place PDFKit is constructed. `label-core` describes the
 * canvas it needs structurally and never imports the library, which is what lets
 * the same layout code run in the browser for live preview — so this module is
 * deliberately thin: build a document the right size, hand it to `toPDF`, and
 * collect the bytes.
 */

import { pageSizePoints, toPDF, type ResolvedLayout } from '@packwright/label-core'
import PDFDocument from 'pdfkit'

/**
 * Maps the layout's font families onto fonts the document can actually use.
 *
 * IBM Plex is not one of PDF's standard 14, and embedding it is phase 2 stage 3
 * work — it arrives with the design tokens. Until then the monospace request
 * resolves to Courier, which is metrically different but present in every
 * reader. Named here rather than hidden inside the renderer so the substitution
 * is visible: the human-readable digits will not be typeset in Plex yet.
 */
const STANDARD_FONTS: Record<string, string> = {
  'IBM Plex Mono': 'Courier',
  'IBM Plex Sans': 'Helvetica',
}

const fontFor = (family: string): string => STANDARD_FONTS[family] ?? family

export interface RenderPdfOptions {
  /**
   * Emits an uncompressed content stream.
   *
   * Only for tests, which read the drawing operators back out to prove the
   * exported geometry matches the millimetres that were requested. There is no
   * reason to ship uncompressed bytes to a user.
   */
  uncompressed?: boolean
}

export function renderLayoutToPdf(
  layout: ResolvedLayout,
  options: RenderPdfOptions = {},
): Promise<Buffer> {
  const document = new PDFDocument({
    size: pageSizePoints(layout),
    // The label is the page. Any margin would offset every millimetre the
    // layout engine resolved.
    margin: 0,
    compress: !options.uncompressed,
    info: { Title: 'packwright label', Creator: 'packwright' },
  })

  const chunks: Buffer[] = []
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on('data', (chunk: Buffer) => chunks.push(chunk))
    document.on('end', () => resolve(Buffer.concat(chunks)))
    document.on('error', reject)
  })

  toPDF(layout, document as never, { fontFor })
  document.end()

  return finished
}
