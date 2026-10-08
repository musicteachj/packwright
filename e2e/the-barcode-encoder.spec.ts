import { expect, test, type Page } from '@playwright/test'

/**
 * bwip-js — 934 KB — loads when a barcode is first drawn, not with the page.
 *
 * It was imported statically by the landing page and by the editor's store, so `/`,
 * `/audit` and the editor fetched it before rendering anything. These hold the chunk
 * back in a real browser and watch what the page does meanwhile: render, hold the
 * barcode's box with the engine's own placeholder, and judge nothing until the bars are
 * here. Measured on 2026-10-08 at 1440×900, where the landing barcode is above the fold.
 */

const BWIP = '**/bwip-js-gen-*.js'

/** Holds the encoder's chunk until `release` is called. */
async function holdEncoder(page: Page) {
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  let requested = false
  await page.route(BWIP, async (route) => {
    requested = true
    await released
    await route.continue()
  })
  return { release, requested: () => requested }
}

test('the landing page renders first and holds the barcode’s box while the bars load', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const encoder = await holdEncoder(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const figure = page.locator('figure').first()
  const label = figure.locator('[role="img"]')
  const next = page.getByText('GHS chemical', { exact: false }).first()
  // The premises: the page is up, the encoder asked for and not yet here.
  await expect(label).toHaveAccessibleName(/its bars still loading/)
  expect(encoder.requested()).toBe(true)
  const before = { figure: await figure.boundingBox(), next: await next.boundingBox() }

  encoder.release()
  await expect(label).toHaveAccessibleName('UPC-A label for GTIN 036000291452')
  const after = { figure: await figure.boundingBox(), next: await next.boundingBox() }

  // The same box, and nothing below it moved.
  expect(after.figure).toEqual(before.figure)
  expect(after.next).toEqual(before.next)
})

for (const route of ['/rules', '/labels', '/audit'] as const) {
  test(`${route} never asks for the encoder`, async ({ page }) => {
    let requested = false
    page.on('request', (request) => {
      if (request.url().includes('bwip-js-gen')) requested = true
    })
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    expect(requested).toBe(false)
  })
}

test('the editor judges nothing about a barcode until its encoder is here', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const encoder = await holdEncoder(page)
  await page.goto('/labels/new')
  const checks = page.locator('#pane-checks')
  await expect(checks).toContainText('Loading the barcode encoder…')
  // Nothing judged against a symbol with no bars.
  await expect(checks).not.toContainText('PASS')
  await expect(checks).not.toContainText('checks passed')
  // And nothing exported from it: with findings held back, the "non-compliant as drawn"
  // confirm would be skipped while the server printed the label anyway. Found by review.
  const exportButton = page.getByRole('button', { name: 'Export PDF' })
  await expect(exportButton).toBeDisabled()
  await expect(page.locator('#pane-preview [role="img"]')).toHaveAccessibleName(
    /its bars still loading/,
  )

  encoder.release()
  await expect(checks).toContainText('Every check passed.')
  await expect(exportButton).toBeEnabled()
})

test('a failed load says so, rather than waiting for ever', async ({ page }) => {
  // A browser keeps a failed module fetch, so asking for the chunk again in the same page
  // does not fetch it. The first version forgot the failure and asked again; the editor
  // then said "Loading the barcode encoder…" indefinitely. Now it says what happened.
  await page.route(BWIP, (route) => route.abort())
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('figure').first().locator('[role="img"]')).toHaveAccessibleName(
    /its bars could not be loaded/,
  )
  // In the application, not a reload, so the page that saw the failure is the one asked.
  await page.getByRole('link', { name: 'New label', exact: true }).click()
  await expect(page.locator('#pane-checks')).toContainText(
    'The barcode encoder could not be loaded. Reload the page to try again.',
  )
  // And Export says the same, rather than suggesting that waiting will help.
  await expect(page.getByRole('button', { name: 'Export PDF' })).toHaveAttribute(
    'title',
    /could not be loaded.*Reload the page/,
  )
})
