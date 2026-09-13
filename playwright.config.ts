import { defineConfig, devices } from '@playwright/test'

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
    command: `npm run build && PORT=${PORT} NODE_ENV=production node apps/api/dist/server.js`,
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    // The build is a Vite production build plus a tsup bundle; on a cold cache
    // that is comfortably more than the 60s default.
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },

  projects: [
    // One browser. The claims being made here are about layout and about the
    // engine's own output, not about vendor differences, and a matrix would
    // triple the runtime to re-answer the same questions.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
