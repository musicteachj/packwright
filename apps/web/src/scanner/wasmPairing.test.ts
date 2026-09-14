/**
 * The ponyfill's WebAssembly must be the ponyfill's own.
 *
 * `detector.ts` imports `zxing-wasm/reader/zxing_reader.wasm?url` and hands the
 * result to `setZXingModuleOverrides`, so the binary the browser fetches is the
 * one *this package* resolves — while the glue that loads it comes from whichever
 * `zxing-wasm` copy `barcode-detector` resolves. Those are two separate
 * resolutions, and npm will happily make them two separate copies:
 * `barcode-detector@3.2.2` pins `zxing-wasm` to an exact `3.1.3`, so any range
 * elsewhere in the workspace that resolves higher splits the tree and leaves one
 * version's Emscripten glue driving another version's module.
 *
 * **It does not fail loudly when that happens, which is the whole reason for this
 * test.** The pair is not interchangeable — 3.1.3's reader is 1,093,289 bytes and
 * 3.1.4's is 953,527 — but the import and export names still line up, so the
 * module instantiates without complaint and the first `detect()` call spins in
 * WebAssembly for ever: no exception, no console output, no failed request. The
 * page's whole main thread stops. It presents as a camera that has gone quiet,
 * and it cost most of a session to find, twice — once misread as a
 * `WebAssembly.instantiate` hang and once as a Content-Security-Policy refusal.
 *
 * Asserting the resolved paths rather than the versions is deliberate: one copy
 * is the actual invariant, and it keeps holding when `barcode-detector` next
 * moves its pin. A version assertion would have to be edited to stay true.
 */

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const WASM = 'zxing-wasm/reader/zxing_reader.wasm'

describe('the zxing binary and the glue that loads it', () => {
  it('resolves to a single copy from both the app and the ponyfill', () => {
    // From here, which is where `detector.ts` sits — so this is the file Vite
    // bundles and serves.
    const fromTheApp = createRequire(import.meta.url)
    // From the ponyfill's own module, which is what picks up a nested copy.
    const fromThePonyfill = createRequire(fromTheApp.resolve('barcode-detector/ponyfill'))

    expect(
      fromTheApp.resolve(WASM),
      'the app serves one zxing_reader.wasm and the ponyfill loads another — ' +
        'the first detect() will hang the main thread with no error',
    ).toBe(fromThePonyfill.resolve(WASM))
  })
})
