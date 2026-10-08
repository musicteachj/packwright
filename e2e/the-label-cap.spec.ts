import { expect, test, type Page } from '@playwright/test'

/**
 * The twenty-label cap, as the pages say it.
 *
 * **The API is faked here, not filled.** Every spec in this suite shares one
 * database and runs in parallel, so standing it at twenty would make every other
 * spec's save answer 409. The server's half — the count, the recount, the 409 —
 * is held by `apps/api/src/labels/labelDocumentRoutes.test.ts`; what is asked
 * here is what a reader sees and hears once the server has said it.
 */

const FULL =
  'There are already 20 saved labels, which is as many as this app keeps. Delete one from Saved labels before saving another.'

const SAVED = {
  id: 'abc123abc123abc123abc123',
  name: 'Granola 340g',
  labelType: 'gs1-retail',
  stock: { widthMm: 60, heightMm: 40, marginMm: 3 },
  data: { gtin: '036000291452' },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

/** The list and the count, at whatever figure the test asks for. */
const fakeList = (page: Page, count: number) =>
  page.route(/\/api\/labels\?limit=\d+$/, (route) =>
    route.fulfill({
      json: {
        cap: 20,
        count,
        labels: Array.from({ length: Math.min(count, 20) }, (_, index) => ({
          ...SAVED,
          id: `${String(index).padStart(2, '0')}${SAVED.id.slice(2)}`,
          name: `Label ${index + 1}`,
        })),
      },
    }),
  )

/** Every region a reader can hear, whatever made it one. */
const heard = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[aria-live], [role="alert"], [role="status"]')]
      .filter((element) => (element as HTMLElement).checkVisibility?.() ?? true)
      .map((element) => element.textContent?.trim() ?? ''),
  )

test('the list says how many are saved, and at twenty that one has to go', async ({ page }) => {
  await fakeList(page, 20)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/labels')
  await expect(page.locator('[data-label-count]')).toHaveText(
    '20 of 20 saved — as many as this app keeps. Delete one before saving another.',
  )
  await expect(page.locator('[aria-live]')).toContainText('20 of 20 labels saved.')
})

test('a list that could not be loaded is said once', async ({ page }) => {
  // The error line was `role="alert"` as well as being said by the announcer.
  await page.route(/\/api\/labels\?limit=\d+$/, (route) =>
    route.fulfill({ status: 500, json: { error: 'The database is not answering.' } }),
  )
  await page.goto('/labels')
  await expect(page.locator('[data-labels-error]')).toContainText('The database is not answering.')
  const regions = await heard(page)
  expect(
    regions.filter((text) => text.includes('The database is not answering.')),
    `heard in: ${JSON.stringify(regions)}`,
  ).toHaveLength(1)
})

test('the editor holds back Save as new at the cap, and Save says the server’s sentence', async ({
  page,
}) => {
  await fakeList(page, 20)
  await page.route(`**/api/labels/${SAVED.id}`, (route) => route.fulfill({ json: SAVED }))
  await page.route(/\/api\/labels$/, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 409, json: { error: FULL } })
      : route.fallback(),
  )
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.goto(`/labels/${SAVED.id}`)
  await expect(page.locator('[data-save-state]')).toHaveText('Saved')
  await expect(page.locator('[data-save-as]')).toBeDisabled()
  await expect(page.locator('[data-save-as-reason]')).toHaveText(
    '20 of 20 saved. Delete one to save as new.',
  )

  // A new label's Save is a POST, and is refused in the server's words.
  await page.goto('/labels/new')
  await page.locator('#field-label-name').fill('One too many')
  await page.locator('[data-save]').click()
  await expect(page.getByText(FULL)).toBeVisible()
})

test('the reason wraps in the header on a phone rather than pushing Export off it', async ({
  page,
}) => {
  // Measured before the fix: the editor's button group did not wrap, so the
  // reason ran past the right edge at 375 px and took Export PDF with it.
  await fakeList(page, 20)
  await page.route(`**/api/labels/${SAVED.id}`, (route) => route.fulfill({ json: SAVED }))
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto(`/labels/${SAVED.id}`)
  await expect(page.locator('[data-save-as-reason]')).toBeVisible()
  for (const selector of ['[data-save-as-reason]', 'button:has-text("Export PDF")']) {
    const box = await page.locator(selector).boundingBox()
    expect(box, selector).not.toBeNull()
    expect(box!.x + box!.width, `${selector} ends inside the screen`).toBeLessThanOrEqual(375)
  }
})
