/**
 * A barcode, as a video file a browser will accept as a camera.
 *
 * `docs/DESIGN.md` calls the scan-back test "the one that actually matters":
 * generate a label, scan it, confirm it decodes to the expected GTIN. A barcode
 * that validates but will not scan is a failure the unit tests cannot catch,
 * because every one of them measures the same geometry the renderer drew from.
 *
 * Chromium takes a Y4M as a fake camera, and Y4M is uncompressed — a short header
 * and raw planes — so the frames can be written here without ffmpeg or any image
 * library. The bars come from `layOutUpcALabel`, the engine the application draws
 * every label with, so what the camera sees is what the PDF would print.
 *
 * **It checks its own output before writing it.** The rasterisation turned out to
 * be fussier than expected: at four pixels per module nothing read it, and a
 * *larger* frame read worse than a smaller one. A fixture that silently stops
 * being decodable would surface as a browser test timing out for no stated
 * reason, twenty seconds at a time, so the frame is decoded here and a mismatch
 * throws with the number it actually read.
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as bwip from 'bwip-js/generic'
import { readBarcodes, setZXingModuleOverrides } from 'zxing-wasm/reader'
import { DEFAULT_UPC_A_STOCK, layOutUpcALabel } from '@packwright/label-core'

/**
 * The reader's WebAssembly, off the disk.
 *
 * zxing-wasm's default `locateFile` points at `fastly.jsdelivr.net`, and this
 * module runs at `playwright.config.ts` scope — so left alone, the whole browser
 * suite fetches a megabyte from a CDN before a single test starts and fails at
 * config load when that CDN or the network is unavailable. The client refuses to
 * do this for exactly the same reasons; the fixture that checks the client should
 * not be the one exception.
 *
 * `wasmBinary` rather than a `file://` URL: the overrides are spread into the
 * Emscripten module, which takes the bytes directly, and Node's `fetch` does not
 * read `file://`.
 */
setZXingModuleOverrides({
  wasmBinary: readFileSync(
    createRequire(import.meta.url).resolve('zxing-wasm/reader/zxing_reader.wasm'),
  ),
})

/** Y4M carries chroma at half resolution, so both dimensions must be even. */
const WIDTH = 1024
const HEIGHT = 384

/** Neutral chroma. The frame is greyscale, which is all a linear symbol needs. */
const NEUTRAL = 128

/** How much of the frame's width the symbol spans. The rest is quiet zone. */
const FILL = 0.8

interface Bar {
  readonly xMm: number
  readonly yMm: number
  readonly widthMm: number
  readonly heightMm: number
}

function barsFor(gtin: string): readonly Bar[] {
  const layout = layOutUpcALabel(bwip as never, { data: { gtin }, stock: DEFAULT_UPC_A_STOCK })
  // The bars, and only the bars. Human-readable digits are decoration to a
  // reader, and drawing text without a font would put blocks on the frame that
  // look like bars and are not.
  const bars = layout.primitives.filter(
    (primitive): primitive is typeof primitive & Bar =>
      primitive.kind === 'rect' && primitive.fill === '000000',
  )
  if (bars.length === 0) throw new Error('the engine drew no bars to scan')
  return bars
}

/**
 * Renders the symbol into a greyscale frame, scaled by width alone.
 *
 * **Width alone, and the bars clip.** Fitting the symbol's full height put a
 * module at four pixels, which nothing could read. A linear symbol is vertically
 * redundant — any scan line carries the whole code — so letting the bars run off
 * the bottom buys the horizontal resolution the reader actually needs.
 *
 * Edges are anti-aliased by coverage rather than rounded to whole pixels. The
 * browser's own render of this label decodes at under six pixels per module
 * because its edges are smooth; hard-rounded ones needed nine.
 */
function drawBarcode(bars: readonly Bar[]): Uint8Array {
  const left = Math.min(...bars.map((bar) => bar.xMm))
  const right = Math.max(...bars.map((bar) => bar.xMm + bar.widthMm))
  const top = Math.min(...bars.map((bar) => bar.yMm))

  const scale = (WIDTH * FILL) / (right - left)
  const offsetX = (WIDTH - (right - left) * scale) / 2 - left * scale
  const offsetY = HEIGHT * 0.15 - top * scale

  const luma = new Uint8Array(WIDTH * HEIGHT).fill(255)

  for (const bar of bars) {
    const x0 = offsetX + bar.xMm * scale
    const x1 = offsetX + (bar.xMm + bar.widthMm) * scale
    const y0 = Math.max(0, Math.round(offsetY + bar.yMm * scale))
    const y1 = Math.min(HEIGHT, Math.round(offsetY + (bar.yMm + bar.heightMm) * scale))

    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(WIDTH, Math.ceil(x1)); x += 1) {
      const coverage = Math.max(0, Math.min(x + 1, x1) - Math.max(x, x0))
      const value = Math.round(255 * (1 - coverage))
      for (let y = y0; y < y1; y += 1) {
        const index = y * WIDTH + x
        // Darkest wins, so a pixel two bars touch does not come out grey.
        if (value < luma[index]!) luma[index] = value
      }
    }
  }

  return luma
}

/** Reads the frame back, so an undecodable fixture fails here and not in a browser. */
async function assertDecodes(luma: Uint8Array, gtin: string): Promise<void> {
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4)
  for (let i = 0; i < luma.length; i += 1) {
    const value = luma[i]!
    rgba[i * 4] = value
    rgba[i * 4 + 1] = value
    rgba[i * 4 + 2] = value
    rgba[i * 4 + 3] = 255
  }

  // Node has no `ImageData`, and the reader's type wants one. The shape is what
  // it reads — `data`, `width`, `height` — so the cast says that rather than
  // pulling in a DOM shim for three fields.
  const image = { data: rgba, width: WIDTH, height: HEIGHT } as unknown as ImageData
  const results = await readBarcodes(image, { formats: ['UPC-A', 'EAN-13'], tryHarder: true })
  // A UPC-A read as an EAN-13 carries the leading zero, which is the same article
  // — the narrowing `normaliseScannedGtin` exists for. Stripped only from a
  // thirteen-digit read: applied to everything, a UPC-A result of `036000291452`
  // became `36000291452` and the check reported an undecodable frame that had
  // decoded perfectly well.
  const read = results.map((result) =>
    result.text.length === 13 && result.text.startsWith('0') ? result.text.slice(1) : result.text,
  )

  if (!read.includes(gtin)) {
    throw new Error(
      `The fake camera frame does not decode to ${gtin} — got ${JSON.stringify(read)}. ` +
        'The scanner tests would time out with no reason given, so this fails here instead.',
    )
  }
}

/**
 * Writes a Y4M holding one barcode, repeated.
 *
 * Several identical frames rather than one, because the scanner reads on an
 * interval and Chromium loops the file: a single frame is legal but leaves the
 * first read racing the first decode.
 */
export async function writeBarcodeVideo(path: string, gtin: string, frames = 8): Promise<void> {
  const luma = drawBarcode(barsFor(gtin))
  await assertDecodes(luma, gtin)

  const chroma = new Uint8Array((WIDTH / 2) * (HEIGHT / 2)).fill(NEUTRAL)
  const header = Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F25:1 Ip A1:1 C420\n`, 'ascii')
  const frameMarker = Buffer.from('FRAME\n', 'ascii')

  const parts: Buffer[] = [header]
  for (let n = 0; n < frames; n += 1) {
    parts.push(frameMarker, Buffer.from(luma), Buffer.from(chroma), Buffer.from(chroma))
  }

  // Written beside the target and renamed into place. Playwright re-imports the
  // config in every worker, so several of them generate this at once — and a
  // rename is atomic where a half-finished `writeFileSync` is a camera reading a
  // truncated file.
  const staging = `${path}.${process.pid}.tmp`
  writeFileSync(staging, Buffer.concat(parts))
  renameSync(staging, path)
}
