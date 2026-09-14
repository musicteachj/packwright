import { expect, test, type Page } from '@playwright/test'
import { SCANNED_GTIN } from '../playwright.config'

/**
 * Scan a barcode, and put the GTIN in the form.
 *
 * **The scan-back test `docs/DESIGN.md` calls the one that actually matters.** The
 * symbol the camera reads is drawn by `layOutUpcALabel` — the engine this
 * application draws every label with — rasterised into the frames Chromium
 * serves as a camera. So it asserts the thing no unit test can: that what the
 * engine draws is what a reader can read back. Every other check in this
 * repository measures the same geometry the renderer measured.
 *
 * **Every test moves the field off its default first.** The editor opens on
 * `036000291452`, which is the GTIN the fake camera carries — so "the field
 * contains the scanned value" is true before the camera is ever opened. Two
 * earlier versions of these tests passed in 590ms without a single frame being
 * decoded.
 */

/**
 * Room for the assertions to expire inside.
 *
 * Every test here spends its first eight seconds on the native trial before zxing
 * is offered a frame, and then asserts with a 25 s budget. Inside Playwright's
 * default 30 s a slow cold-start navigation eats the difference, and a useful
 * "expected 036000291452, got 012000161155" becomes a bare test timeout naming
 * nothing.
 */
test.describe.configure({ timeout: 60_000 })

/** Anything but the GTIN the camera carries, and a real one so the label draws. */
const DECOY = '012000161155'

const scanFrom = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/labels/new')
  await page.locator('#field-gtin').fill(DECOY)
  await expect(page.locator('#field-gtin')).toHaveValue(DECOY)
  await page.getByRole('button', { name: 'Scan a barcode' }).click()
}

test('reads the engine’s own barcode back into the form', async ({ page }) => {
  await scanFrom(page)

  await expect(page.locator('#field-gtin')).toHaveValue(SCANNED_GTIN, { timeout: 25_000 })

  // The camera is released once a read is taken. A scanner still running after it
  // has what it came for leaves the light on, which is how the person holding the
  // phone knows whether they are being watched.
  await expect(page.getByRole('button', { name: 'Scan a barcode' })).toBeVisible()
  await expect(page.locator('video')).toHaveCount(0)
})

test('reads whichever engine this platform gives it', async ({ page }) => {
  // **Deliberately does not assert which one.** Chromium exposes
  // `BarcodeDetector` on macOS, Android and ChromeOS and not on Linux, so an
  // earlier version of this asserting `native` first passed here and would have
  // timed out on `ubuntu-latest` — written on a Mac and never run anywhere else.
  //
  // That the *fallback* happens is asserted in `useBarcodeScanner.test.ts`, where
  // both detectors are injected and the outcome does not depend on the operating
  // system the tests happen to run on.
  await scanFrom(page)

  const status = page.locator('[data-scan-state]')
  await expect(status).toHaveAttribute('data-scan-engine', /^(native|zxing)$/)
  await expect(page.locator('#field-gtin')).toHaveValue(SCANNED_GTIN, { timeout: 25_000 })
})

test('runs its WebAssembly under the policy the server sends', async ({ page }) => {
  const blocked: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') blocked.push(message.text())
  })

  await scanFrom(page)
  await expect(page.locator('#field-gtin')).toHaveValue(SCANNED_GTIN, { timeout: 25_000 })

  // `script-src 'self'` forbids `WebAssembly.instantiate`, so the scanner needs
  // `'wasm-unsafe-eval'` — and not `'unsafe-eval'`, which would re-enable `eval`
  // for the whole application. A read proves the module instantiated.
  expect(
    blocked.filter((text) => /Content Security Policy|wasm/i.test(text)),
    'the reader must run under the policy rather than around it',
  ).toEqual([])
})

test('serves the WebAssembly from the bundle, not a CDN', async ({ page }) => {
  // zxing resolves its `.wasm` from jsdelivr by default. A label editor that stops
  // scanning when a CDN has a bad day is not a single artifact, and it puts a
  // third party in the path of a shopper's camera.
  const wasmRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('.wasm')) wasmRequests.push(request.url())
  })

  // **Which engines actually ran, recorded as they run.** The premise below —
  // that zxing loaded a module at all — is only true where the platform detector
  // failed to read, and which engine a browser starts with is decided by the
  // operating system. Asserting it outright is the mistake the sibling test at
  // the top of this file documents. It cannot be read afterwards either: a
  // successful scan closes the panel and takes the status element with it.
  await page.addInitScript(() => {
    const seen = new Set<string>()
    Object.defineProperty(window, '__enginesSeen', { value: seen })
    new MutationObserver(() => {
      for (const element of document.querySelectorAll('[data-scan-engine]')) {
        const engine = element.getAttribute('data-scan-engine')
        if (engine !== null && engine !== '') seen.add(engine)
      }
      // `document`, not `document.documentElement`: an init script runs before the
      // document has an element to observe, and `observe` throws on a null node.
      // That failure is silent — an empty set reads as "zxing never ran", so the
      // premise below skips itself and the test goes quiet instead of red.
    }).observe(document, { subtree: true, childList: true, attributes: true })
  })

  await scanFrom(page)
  await expect(page.locator('#field-gtin')).toHaveValue(SCANNED_GTIN, { timeout: 25_000 })

  const engines = await page.evaluate(() => [
    ...(window as unknown as { __enginesSeen: Set<string> }).__enginesSeen,
  ])
  if (engines.includes('zxing')) {
    expect(wasmRequests.length, 'zxing ran, so it must have loaded a module').toBeGreaterThan(0)
  }

  // True on every platform, including one whose own detector reads the frame and
  // never reaches for zxing: whatever WebAssembly was fetched came from here.
  const base = new URL(page.url()).origin
  for (const url of wasmRequests) expect(new URL(url).origin).toBe(base)
})
