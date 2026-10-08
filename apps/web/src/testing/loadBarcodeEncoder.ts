/**
 * The barcode encoder, loaded before any web test runs.
 *
 * The app loads bwip-js on demand and judges nothing about a GS1 label until it has
 * (`barcodeEncoder.ts`). The tests that mount the editor are about what it does with a
 * label, not about the wait, so they start with the encoder already here. The wait is
 * tested where it can be made real — `e2e/the-barcode-encoder.spec.ts` holds the chunk
 * back in a browser.
 */
import { loadBarcodeEncoder } from '../barcodeEncoder'

await loadBarcodeEncoder()
