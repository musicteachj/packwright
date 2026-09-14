/**
 * Reading a linear symbol, by whichever engine this browser has.
 *
 * **The fallback is the main path.** `BarcodeDetector` is a Chromium API: Firefox
 * does not implement it and Safari has had it under consideration since 2024.
 * Every browser on iOS is WebKit, and scanning a pack is a phone task — so the
 * zxing-wasm ponyfill is what most people who ever use this will run, and calling
 * it a fallback would be a comment that misleads the next reader about which code
 * matters.
 *
 * The ponyfill rather than the polyfill: the polyfill assigns
 * `globalThis.BarcodeDetector`, and a library that patches a global is a library
 * whose absence is untestable and whose presence is invisible. This selects an
 * implementation and hands it back.
 */

// Bundled, not fetched. zxing resolves its `.wasm` from a CDN by default, which
// would make a label editor stop scanning when jsdelivr has a bad day, put a
// third party in the path of a shopper's camera, and breach the
// Content-Security-Policy the API serves this client under. `?url` puts the file
// in `apps/web/dist/assets` and hands back a same-origin path.
//
// The `reader` build, because that is the one the ponyfill loads — pointing
// `locateFile` at `zxing_full.wasm` would ship a larger module that the reader
// then fails to find under the name it asked for.
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

/**
 * The symbologies a retail pack carries.
 *
 * `upc_e` and `ean_8` are read even though `normaliseScannedGtin` refuses both:
 * detecting them and explaining why they cannot become a GTIN-12 is a better
 * answer than a camera that appears not to see the barcode at all.
 */
export const SCANNED_FORMATS = ['upc_a', 'upc_e', 'ean_13', 'ean_8'] as const

/** One read, reduced to what this application needs from it. */
export interface DetectedSymbol {
  readonly rawValue: string
  readonly format: string
}

/**
 * The seam. jsdom has neither `BarcodeDetector` nor `getUserMedia`, so a scanner
 * that reached for either directly could only be tested in a browser — and the
 * decisions worth testing here are about what happens to a *value* after it is
 * read, which needs no camera at all.
 */
export interface SymbolDetector {
  detect(source: ImageBitmapSource): Promise<readonly DetectedSymbol[]>
}

export type DetectorEngine = 'native' | 'zxing'

export interface SelectedDetector {
  readonly detector: SymbolDetector
  readonly engine: DetectorEngine
}

interface NativeDetectorConstructor {
  new (options?: { formats?: readonly string[] }): SymbolDetector
  getSupportedFormats?: () => Promise<readonly string[]>
}

/**
 * Whether this browser's own detector can read the symbols a pack carries.
 *
 * The constructor existing is not the question. Chromium exposes
 * `BarcodeDetector` on platforms where the underlying platform library supports
 * nothing useful, and `getSupportedFormats` is how it says so — a detector that
 * constructs and then never matches is worse than no detector, because it looks
 * like a camera that cannot see.
 */
async function nativeDetector(): Promise<SymbolDetector | undefined> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorConstructor }).BarcodeDetector
  if (Native === undefined) return undefined

  try {
    const supported = (await Native.getSupportedFormats?.()) ?? []
    const usable = SCANNED_FORMATS.filter((format) => supported.includes(format))
    if (usable.length === 0) return undefined
    return new Native({ formats: usable })
  } catch {
    // A constructor that throws on this platform is one this browser does not
    // really have. The ponyfill is a working answer, so there is nothing to
    // report and nowhere useful to report it.
    return undefined
  }
}

let wasmConfigured = false

/**
 * The ponyfill, pointed at the copy of its WebAssembly that ships with the app.
 *
 * **Imported dynamically, so the glue and the megabyte it loads arrive with the
 * camera.** Neither `ponyfill-*.js` nor `zxing_reader.wasm` is requested until
 * someone opens the scanner, which is the majority of visits saved a fetch for a
 * feature they never use.
 *
 * **The binary resolved here and the glue that loads it must be one copy of
 * `zxing-wasm`.** `locateFile` hands over a URL resolved from *this* package,
 * while the Emscripten glue reading it comes from whichever copy
 * `barcode-detector` resolved — and `barcode-detector` pins an exact version, so
 * any range elsewhere in the workspace that resolves higher splits the two apart.
 * They are not interchangeable and they do not complain: the module instantiates,
 * and the first `detect()` spins in WebAssembly for ever, taking the page's main
 * thread with it. Both manifests therefore pin `zxing-wasm` to the version
 * `barcode-detector` pins rather than to a range, and `wasmPairing.test.ts`
 * asserts the single copy.
 *
 * An earlier note here blamed that hang on *this import being dynamic* — the
 * ponyfill was said to resolve its WebAssembly during initialisation, so an
 * override applied in the same tick arrived after the module had already gone to
 * a CDN. It reads plausibly and it was wrong: the ponyfill requests nothing until
 * a `BarcodeDetector` is constructed, which is after the override is set either
 * way. The mismatched pair was the cause, and a static import only relocated it.
 */
async function zxingDetector(): Promise<SymbolDetector> {
  const { BarcodeDetector, setZXingModuleOverrides } = await import('barcode-detector/ponyfill')
  if (!wasmConfigured) {
    setZXingModuleOverrides({ locateFile: () => zxingWasmUrl })
    wasmConfigured = true
  }
  return new BarcodeDetector({ formats: [...SCANNED_FORMATS] })
}

/**
 * The browser's detector where it has a usable one, zxing where it does not.
 *
 * Both are reported, because which engine read a symbol is the first thing worth
 * knowing when a scan behaves oddly on one device and not another.
 */
export async function createDetector(): Promise<SelectedDetector> {
  const native = await nativeDetector()
  if (native !== undefined) return { detector: native, engine: 'native' }
  return createZxingDetector()
}

/**
 * zxing, asked for by name.
 *
 * Exported because the scanner reaches for it when the browser's own detector has
 * spent eight seconds reading nothing — `getSupportedFormats` is a claim rather
 * than a demonstration, and a detector that reports support and never matches
 * looks exactly like a camera that cannot focus.
 */
export async function createZxingDetector(): Promise<SelectedDetector> {
  return { detector: await zxingDetector(), engine: 'zxing' }
}
