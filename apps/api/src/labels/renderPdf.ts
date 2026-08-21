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
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'

/**
 * IBM Plex, embedded.
 *
 * The browser draws the label in Plex; without this the PDF drew it in Courier,
 * a substitution that was named in the code rather than hidden but was still a
 * gap in the promise this phase exists to make. Type is geometry too — a
 * different face is different advance widths, so "preview == print" was true of
 * the bars and not quite true of the digits.
 *
 * The TTFs are the ones vendored for the web build, so both paths draw from one
 * set of files rather than two copies that could drift.
 */
/**
 * Locates the vendored fonts from either the source tree or the bundle.
 *
 * A single relative path cannot serve both. From `src/labels/` the repo root is
 * four levels up; from the tsup bundle at `dist/server.js` it is three, and the
 * four-segment path resolved *outside the repository entirely*. Nothing caught
 * it, because every test runs from source — the built artifact answered
 * `npm start` with a 500 and `ENOENT` on the first export request.
 *
 * So the candidates are explicit and checked, and a container image only needs
 * `dist/` because the build copies the fonts beside the bundle.
 */
function resolveFontDir(): string {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const candidates = [
    // Bundled: tsup's publicDir copies the fonts beside server.js in dist/.
    here,
    // Running from source, via tsx or vitest.
    join(here, '../../../../assets/fonts/ttf'),
  ]

  const found = candidates.find((candidate) =>
    existsSync(join(candidate, 'IBMPlexMono-Regular.ttf')),
  )
  if (!found) {
    throw new Error(
      `IBM Plex was not found. Looked in:\n${candidates.map((c) => `  ${c}`).join('\n')}\n` +
        'The PDF export embeds these fonts, so it cannot run without them.',
    )
  }
  return found
}

/**
 * IBM Plex, embedded.
 *
 * The browser draws the label in Plex; without this the PDF drew it in Courier,
 * a substitution that was named in the code rather than hidden but was still a
 * gap in the promise this phase exists to make. Type is geometry too — a
 * different face is different advance widths, so "preview == print" was true of
 * the bars and not quite true of the digits.
 *
 * The TTFs are the ones vendored for the web build, so both paths draw from one
 * set of files rather than two copies that could drift.
 */
const PLEX_FACES: Record<string, string> = {
  'IBM Plex Mono': 'IBMPlexMono-Regular.ttf',
  'IBM Plex Mono SemiBold': 'IBMPlexMono-SemiBold.ttf',
  'IBM Plex Sans': 'IBMPlexSans-Regular.ttf',
  'IBM Plex Sans SemiBold': 'IBMPlexSans-SemiBold.ttf',
}

/** Resolved once, so a missing font directory surfaces on first use, not per request. */
let fontDir: string | undefined

/**
 * Registers each face under the family name the layout asks for, so the
 * renderer needs no translation table.
 */
function registerPlex(document: PDFKit.PDFDocument): void {
  fontDir ??= resolveFontDir()
  for (const [family, file] of Object.entries(PLEX_FACES)) {
    document.registerFont(family, join(fontDir, file))
  }
}

/** Exposed so a test can assert the fonts are reachable in this build. */
export function plexFontDirectory(): string {
  return resolveFontDir()
}

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

  registerPlex(document)
  toPDF(layout, document as never)
  document.end()

  return finished
}
