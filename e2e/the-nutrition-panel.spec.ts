import { expect, test, type Page } from '@playwright/test'

/**
 * The Nutrition Facts panel, seen rather than asserted.
 *
 * Phase 5 built this panel across two axes — three displays by two column modes
 * — and verified every one of them in jsdom, which has no layout engine. So the
 * assertions were about the resolved layout the engine returned, never about
 * what a browser drew from it. "Preview == print" has held by construction and
 * by test for a phase, and nobody has looked.
 *
 * The dual column is the case that most deserves looking at: it is the first
 * panel whose width varies with its contents, and the only one where two runs of
 * text have to line up in columns that the engine positions independently.
 */

/** Drives the editor to a US food label with the panel open. */
async function openFoodEditor(page: Page) {
  await page.goto('/labels/new')
  await page.selectOption('#field-label-type', 'us-food')
  await expect(page.locator('form[aria-label="Label details"]')).toBeVisible()
}

/** The canvas draws the label at true scale; this is the element to look at. */
const canvas = (page: Page) => page.locator('svg[role="img"]').first()

test('draws a single-column vertical panel with its rows aligned', async ({ page }) => {
  await openFoodEditor(page)

  const label = canvas(page)
  await expect(label).toBeVisible()

  // The heading is the panel's anchor and the largest type on it — 22 pt, the
  // one figure 101.9 sets that no rule here enforces.
  await expect(label.getByText('Nutrition Facts', { exact: true })).toBeVisible()
  await expect(label.getByText('Calories', { exact: true })).toBeVisible()

  await label.screenshot({ path: 'e2e/__screenshots__/panel-vertical-single.png' })
})

/**
 * Fills every second-column box the rail shows.
 *
 * The figures cannot be derived — doing so would mean this tool authoring part of
 * a regulated statement — so a dual-column panel is only a dual-column panel once
 * someone has typed fourteen numbers into it.
 */
async function fillSecondColumn(page: Page) {
  const boxes = page.locator('input[id^="field-food-nf2-"]')
  const count = await boxes.count()
  expect(count, 'the rail must offer a second-column box per nutrient').toBeGreaterThan(10)
  for (let index = 0; index < count; index += 1) {
    await boxes.nth(index).fill('12')
  }
}

test('draws the two column headings side by side, not on top of each other', async ({ page }) => {
  await openFoodEditor(page)

  await page.check('#field-food-nf-dual')
  await expect(page.locator('#field-food-nf-basis')).toBeVisible()
  // Headings are drawn for columns that exist, so the column has to exist first.
  await fillSecondColumn(page)

  const label = canvas(page)
  await label.screenshot({ path: 'e2e/__screenshots__/panel-vertical-dual.png' })

  // 101.9(e)(1) requires a heading over each column. That both exist is already
  // asserted in `label-core`; what only a browser can answer is whether they
  // occupy different horizontal space, because two headings drawn at the same x
  // are one heading on top of another — a panel that is unreadable rather than
  // non-compliant, and that every resolved-layout assertion would pass.
  const headings = label.locator('text', { hasText: /Per serving|Per container/ })
  await expect(headings).toHaveCount(2)

  const first = await headings.nth(0).boundingBox()
  const second = await headings.nth(1).boundingBox()
  expect(first, 'the first column heading must be drawn').not.toBeNull()
  expect(second, 'the second column heading must be drawn').not.toBeNull()

  const firstRight = first!.x + first!.width
  expect(
    second!.x,
    'the second heading must start to the right of where the first ends',
  ).toBeGreaterThanOrEqual(firstRight)
})

/**
 * **This test is named for what it checks, which the previous one was not.**
 *
 * An earlier version of the test above was called "draws the second column
 * beside the first" and measured the two *headings*. It passed — and looking at
 * the screenshot it produced showed a panel with two headings above a single
 * column of figures, because the rail's checkbox seeds headings and has no field
 * for the second column's amounts. A test that certifies a column the engine did
 * not draw is the same defect as a rule that does, in a different file.
 */
test('reports the second column as not drawn when it has no figures to draw', async ({ page }) => {
  await openFoodEditor(page)
  await page.check('#field-food-nf-dual')

  // No rule fires here and none should: nothing certifies a column that was not
  // drawn, and this package is not in the band that makes a second column
  // mandatory. The engine's omission is the only signal, and it has to reach the
  // reader or the label looks finished.
  const cannotCheck = page.locator('section[aria-labelledby="cannot-check-heading"]')
  await expect(cannotCheck).toBeVisible()
  await expect(cannotCheck).toContainText(/second column/i)
})

test('keeps the panel inside the label it is drawn on', async ({ page }) => {
  await openFoodEditor(page)
  await page.check('#field-food-nf-dual')
  // The case this was written for is the *wide* panel: a dual-column panel takes
  // the information panel's full width where a single-column one takes the
  // illustrations' 2.5 inches. Ticking the box alone no longer produces one, so
  // without filling the column this measured the narrow panel and proved nothing
  // about the case it exists for.
  await fillSecondColumn(page)

  const label = canvas(page)
  const box = await label.boundingBox()
  expect(box, 'the label must have been drawn').not.toBeNull()

  // The engine draws what it was asked for and records an omission rather than
  // clamping, so a panel wider than its stock is a real possibility and one the
  // resolved-layout tests measure in millimetres. This measures it in pixels,
  // on the artefact, which is the independent check.
  const panelText = label.getByText('Nutrition Facts', { exact: true })
  const panelBox = await panelText.boundingBox()
  expect(panelBox).not.toBeNull()

  expect(panelBox!.x).toBeGreaterThanOrEqual(box!.x - 1)
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(box!.x + box!.width + 1)
})

test('the tabular display is reachable, and says what it could not draw', async ({ page }) => {
  await openFoodEditor(page)

  await page.selectOption('#field-food-nf-format', 'tabular')
  await page.check('#field-food-nf-dual')

  const label = canvas(page)
  await label.screenshot({ path: 'e2e/__screenshots__/panel-tabular-dual.png' })

  // 101.9(e)(6)(ii) illustrates a dual-column *tabular* panel, and this engine
  // does not draw one: the tabular branch returns before the dual-column code.
  // The engine records a `LayoutOmission` saying so, and the rail surfaces it —
  // which is the behaviour under test. A panel that silently drew one column
  // while the label asked for two is the failure this whole project is about.
  const cannotCheck = page.locator('section[aria-labelledby="cannot-check-heading"]')
  await expect(cannotCheck).toBeVisible()
  await expect(cannotCheck).toContainText(/second column/i)
})
