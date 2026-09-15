/**
 * Rasterises the hand-authored GHS label into the photograph the audit fixtures
 * are recorded against.
 *
 * Chromium rather than a raster library, because Playwright is already a
 * dependency of this repository and adding an image toolchain for one asset
 * would be the larger change. It lives in `scripts/` rather than in
 * `apps/api/src/` for the same reason `generate-font-metrics.mjs` does: it uses
 * a root devDependency that `apps/api` does not declare, and a workspace should
 * not import what its own manifest does not list.
 *
 * Deterministic on purpose — fixed viewport, no device scale factor, no
 * animation — so re-running it produces the same bytes and a diff means somebody
 * changed the label.
 *
 *   node scripts/make-audit-sample.mjs
 */
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, '..', 'apps', 'api', 'src', 'audit', 'fixtures')
const source = join(fixtures, 'sampleLabel.html')
const target = join(fixtures, 'sampleLabel.png')

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 840, height: 1100 } })
  await page.setContent(readFileSync(source, 'utf8'), { waitUntil: 'load' })
  const label = page.locator('.label')
  const shot = await label.screenshot({ type: 'png' })
  writeFileSync(target, shot)
  const { width, height } = await label.boundingBox()
  console.log(`${target}\n${Math.round(width)} x ${Math.round(height)} px, ${shot.length} bytes`)
} finally {
  await browser.close()
}
