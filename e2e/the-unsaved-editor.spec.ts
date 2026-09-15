import { expect, test, type Page } from '@playwright/test'

/**
 * Unsaved work does not leave without being asked about.
 *
 * **Both cases here were invisible to the unit suite and visible in a browser in
 * about a minute.** `detach()` rebased the editor's baseline onto the document
 * in front of it, so every edit made before detaching was absorbed and stopped
 * counting as unsaved. The store's own tests passed either way, because the one
 * thing they could not assert is the thing a user actually meets: whether the
 * leave guard says anything.
 *
 * `docs/BACKLOG.md` asked a narrower version of this — could the route watcher
 * lose work at `/labels/new` with no audit involved. The first test is that
 * question and the answer is no. The second is the path the question missed.
 */

const STARTING_GTIN = '036000291452'
const EDITED_GTIN = '012345678905'

/** Records every leave prompt, and always stays on the page. */
function countPrompts(page: Page): () => number {
  let prompts = 0
  page.on('dialog', async (dialog) => {
    prompts += 1
    await dialog.dismiss()
  })
  return () => prompts
}

async function tryToLeave(page: Page): Promise<void> {
  await page.goBack()
  // The guard is synchronous but the navigation it blocks is not, and a
  // dismissed prompt leaves the URL unchanged — so there is nothing to await on
  // except the absence of a dialog.
  await page.waitForTimeout(500)
}

test('asks before leaving an edited new label', async ({ page }) => {
  const prompts = countPrompts(page)
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.goto('/labels')
  await page.getByRole('link', { name: 'Editor', exact: true }).click()
  await expect(page).toHaveURL(/\/labels\/new$/)
  await expect(page.locator('#field-gtin')).toHaveValue(STARTING_GTIN)

  await page.locator('#field-gtin').fill(EDITED_GTIN)
  await tryToLeave(page)

  expect(prompts(), 'an edited new label is unsaved work').toBe(1)
  await expect(page, 'and dismissing the prompt stays put').toHaveURL(/\/labels\/new$/)
})

test('asks before leaving a saved label that was edited and then switched type', async ({
  page,
  request,
}) => {
  // The reproduction, in the order a person does it. Switching the type detaches
  // the label — deliberately, because a stored record must not change kind — and
  // detaching used to take the unsaved edit with it. The header stopped saying
  // "Unsaved changes", leaving the page raised nothing at all, and closing the
  // tab would have lost the edit without a word.
  const name = `Type switch ${Date.now()}`
  const created = await request.post('/api/labels', {
    data: {
      name,
      labelType: 'gs1-retail',
      stock: { widthMm: 90, heightMm: 50, marginMm: 3 },
      data: { gtin: STARTING_GTIN },
    },
  })
  expect(created.status(), 'the premise: the label has to save').toBe(201)

  const prompts = countPrompts(page)
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.goto('/labels')
  await page.getByRole('link', { name }).click()
  await expect(page).toHaveURL(/\/labels\/[0-9a-f]{24}$/)

  // **The URL changes before the label arrives.** `GET /api/labels/:id` is still
  // in flight at that point, and `loadSaved` replaces the document and rebases
  // when it lands — so an edit typed in the gap is overwritten and the run goes
  // red reading exactly like the defect this pins. Waiting on the indicator is
  // waiting on `savedId`, which is set by the load and by nothing else. The
  // field's own value cannot serve: the seeded default is this same GTIN.
  await expect(
    page.locator('[data-save-state]'),
    'the premise: the saved label has to have arrived before it is edited',
  ).toHaveText('Saved')

  await page.locator('#field-gtin').fill(EDITED_GTIN)
  await expect(
    page.locator('[data-save-state]'),
    'the premise: the edit has to register',
  ).toHaveText('Unsaved changes')

  await page.locator('#field-label-type').selectOption('us-food')
  await tryToLeave(page)

  expect(prompts(), 'an edit nobody saved survives the switch that detached it').toBe(1)
})
