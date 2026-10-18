import { expect, test, type Page } from '@playwright/test'
import { holdInBrowser } from './support/savedLabels'

/**
 * The 200-label cap, as the pages say it.
 *
 * **The API is faked here, not filled.** Every spec in this suite shares one
 * database and runs in parallel, so standing it at 200 would make every other
 * spec's save answer 409. The server's half (the count, the recount, the 409) is
 * held by `apps/api/src/labels/labelDocumentRoutes.test.ts`; what is asked here
 * is what a reader sees and hears once the server has said it.
 */

const FULL =
  'There are already 200 saved labels, which is as many as this app keeps. Labels are removed 30 days after their last change, so try again later, or delete one of yours from Saved labels.'

const SAVED = {
  id: 'abc123abc123abc123abc123',
  name: 'Granola 340g',
  labelType: 'gs1-retail',
  stock: { widthMm: 60, heightMm: 40, marginMm: 3 },
  data: { gtin: '036000291452' },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

/**
 * The count, at whatever figure the test asks for, and a list of the labels this
 * browser holds, which is none unless a test gives it one.
 */
const fakeList = (page: Page, count: number, labels: unknown[] = []) =>
  page.route(/\/api\/labels(\?ids=[0-9a-f,]*)?$/, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { cap: 200, count, labels } })
      : route.fallback(),
  )

/** Every region a reader can hear, whatever made it one. */
const heard = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[aria-live], [role="alert"], [role="status"]')]
      .filter((element) => (element as HTMLElement).checkVisibility?.() ?? true)
      .map((element) => element.textContent?.trim() ?? ''),
  )

test('the list says when the app is full, though none of the labels are this browser’s', async ({
  page,
}) => {
  await fakeList(page, 200)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/labels')
  const said =
    'No labels saved in this browser yet. This app keeps 200 labels and has 200, so nothing new can be saved until one is deleted or expires.'
  await expect(page.locator('[data-label-count]')).toHaveText(said)
  await expect(page.locator('[aria-live]')).toContainText(said)
})

test('a list that could not be loaded is said once', async ({ page }) => {
  // The error line was `role="alert"` as well as being said by the announcer.
  await page.route(/\/api\/labels(\?ids=[0-9a-f,]*)?$/, (route) =>
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
  await fakeList(page, 200)
  await page.route(`**/api/labels/${SAVED.id}`, (route) => route.fulfill({ json: SAVED }))
  await page.route(/\/api\/labels$/, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 409, json: { error: FULL } })
      : route.fallback(),
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  // This browser saved the label, so the cap is the only thing holding a save back.
  await page.goto('/')
  await holdInBrowser(page, { id: SAVED.id, editToken: 'held' })

  await page.goto(`/labels/${SAVED.id}`)
  await expect(page.locator('[data-save-state]')).toHaveText('Saved')
  await expect(page.locator('[data-save-as]')).toBeDisabled()
  await expect(page.locator('[data-save-as-reason]')).toHaveText(
    '200 of 200 saved, as many as this app keeps. Delete one of yours from Saved labels, or try again later.',
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
  await fakeList(page, 200)
  await page.route(`**/api/labels/${SAVED.id}`, (route) => route.fulfill({ json: SAVED }))
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto(`/labels/${SAVED.id}`)
  await expect(page.locator('[data-save-as-reason]')).toBeVisible()
  // Opened from a link this browser did not save, so the reason Save is held back
  // shows as well, and has to wrap the same way.
  await expect(page.locator('[data-save-reason]')).toBeVisible()
  for (const selector of [
    '[data-save-as-reason]',
    '[data-save-reason]',
    'button:has-text("Export PDF")',
  ]) {
    const box = await page.locator(selector).boundingBox()
    expect(box, selector).not.toBeNull()
    expect(box!.x + box!.width, `${selector} ends inside the screen`).toBeLessThanOrEqual(375)
  }
})
