import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { writeBarcodeVideo } from './e2e/support/barcodeVideo'

/**
 * A barcode the browser will accept as a camera.
 *
 * `docs/DESIGN.md` calls the scan-back test "the one that actually matters": a
 * symbol that validates but will not scan is a failure no unit test can catch,
 * because they all measure the geometry the renderer drew from. Chromium takes a
 * Y4M as a fake camera, and the file has to exist before the browser launches —
 * so it is written here rather than in a fixture.
 *
 * Written to a temporary directory rather than committed: eight uncompressed
 * frames is five megabytes, and it is derived from the engine in this repository,
 * so committing it would be storing a slow copy of something the build already
 * knows how to make.
 */
const SCAN_VIDEO = join(tmpdir(), 'packwright-e2e', 'upc-a.y4m')
/** The GTIN the fake camera carries. Asserted by `the-scanner.spec.ts`. */
export const SCANNED_GTIN = '036000291452'

mkdirSync(join(tmpdir(), 'packwright-e2e'), { recursive: true })
// Awaited at module scope: the file has to exist before Chromium launches, and
// `writeBarcodeVideo` decodes what it wrote before writing it, so a fixture that
// has stopped being readable fails here rather than as a browser test timing out.
await writeBarcodeVideo(SCAN_VIDEO, SCANNED_GTIN)

/**
 * Critical paths in a real browser. Not a suite.
 *
 * Everything else in this repository is checked in jsdom, which has no layout
 * engine: it cannot say whether an element is visible, what it measures, or
 * whether a media query matched. So "preview == print" has held by construction
 * and by assertion for five phases without anyone having seen it, and the
 * dual-column nutrition panel — the first whose width varies — has never been
 * looked at.
 *
 * `docs/DESIGN.md` scopes this deliberately to four things: the responsive
 * collapse at each breakpoint, a keyboard-only walk of the editor, the finding →
 * canvas highlight, and a PDF export whose page box is asserted after download.
 * A browser test is slow and flaky in proportion to how much of it there is, and
 * the value here is entirely in the handful of claims jsdom cannot make.
 */

/** The built server, on a port nothing else in this repository uses. */
const PORT = 4173

export default defineConfig({
  testDir: './e2e',
  // Two of these tests exist to look at geometry, and geometry does not race.
  // Anything flaky here is a real defect in the page rather than a timing
  // artefact, so a retry would hide exactly what this is for.
  retries: 0,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  /**
   * Against the built artifact, not the dev server — which is the whole point.
   *
   * The dev server is Vite: it serves unbundled modules over its own origin with
   * its own headers, and it is not what ships. What ships is `apps/api` serving
   * `apps/web`'s build from one origin under helmet's Content-Security-Policy,
   * and that combination has never been loaded by a browser. If the CSP blocks
   * the bundle, this is where it surfaces.
   */
  webServer: {
    // Through the same wrapper `verify:build` uses, which starts a `mongod` and
    // then imports the built `server.js`. The database lives and dies with the
    // server process Playwright already manages, so there is no second lifetime
    // to get right: no mongod started by `--list`, none left behind when the
    // server fails to boot, and no teardown racing the thing it is tearing down.
    command: `npm run build && PORT=${PORT} NODE_ENV=production node scripts/serve-with-memory-mongo.mjs`,
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    // The build is a Vite production build plus a tsup bundle; on a cold cache
    // that is comfortably more than the 60s default. The command also starts a
    // `mongod` before it listens, which is seconds rather than minutes — the
    // binary is fetched by mongodb-memory-server's `postinstall` during
    // `npm ci`, not here. Widening this further only delays a real hang.
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },

  projects: [
    // One browser. The claims being made here are about layout and about the
    // engine's own output, not about vendor differences, and a matrix would
    // triple the runtime to re-answer the same questions.
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The camera is faked from the Y4M above. `use-fake-ui` grants the
        // permission prompt, which is a dialog no test can click; the refusal
        // path is covered in jsdom with an injected `getUserMedia` that rejects,
        // where it can be asserted rather than driven.
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            `--use-file-for-fake-video-capture=${SCAN_VIDEO}`,
          ],
        },
      },
    },
  ],
})
