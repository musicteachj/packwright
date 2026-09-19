import { expect, test } from '@playwright/test'

/**
 * The catalogue is generated from the same components the app renders, for the
 * reason `/rules` is generated from the rule registry: a page written alongside
 * the thing it documents drifts from it, and nothing fails when it does.
 *
 * It renders the awkward variants deliberately. Every hard call site lives in
 * `UsFoodFormRail`, which is the last file to be migrated — so without this page
 * the component API would not meet its hardest consumer until the end.
 */
test('the catalogue renders every control, including the awkward ones', async ({ page }) => {
  await page.goto('/design')
  for (const name of ['Statement of identity', 'Panel width (mm)', 'Container shape']) {
    await expect(page.getByLabel(name)).toBeVisible()
  }
  // Named but not shown — the seven hidden-label sites in UsFoodFormRail.
  await expect(page.getByLabel('Ingredient 1 percent by weight')).toBeVisible()
})

test('a select reserves room for its own chevron', async ({ page }) => {
  // Measured before this existed: padding-right 8px with the native arrow drawn
  // inside it, so a long option was clipped mid-word with no ellipsis.
  await page.goto('/design')
  const padding = await page
    .getByLabel('Container shape')
    .evaluate((el) => getComputedStyle(el).paddingRight)
  expect(Number.parseFloat(padding)).toBeGreaterThanOrEqual(28)
})

test('the chevron is inset as far from the right as the text is from the left', async ({
  page,
}) => {
  // The complaint this answers, in the words it was reported in: the chevron sat
  // too close to the right edge and did not have the same margin the text has on
  // the left. An earlier version of this test asserted the select's content box
  // was wider than zero, which was equally true of the 8px-both-sides styling it
  // was supposed to be catching — it passed on the defect.
  await page.goto('/design')
  const select = page.getByLabel('Container shape')

  const textInset = await select.evaluate((el) =>
    Number.parseFloat(getComputedStyle(el).paddingLeft),
  )
  const box = await select.boundingBox()
  const chevron = await page.locator('[data-chevron]').first().boundingBox()
  expect(box, 'the select must be laid out').not.toBeNull()
  expect(chevron, 'the chevron must be laid out').not.toBeNull()

  const chevronInset = box!.x + box!.width - (chevron!.x + chevron!.width)
  expect(
    Math.abs(chevronInset - textInset),
    `chevron sits ${chevronInset}px from the right, text ${textInset}px from the left`,
  ).toBeLessThanOrEqual(1)
})
