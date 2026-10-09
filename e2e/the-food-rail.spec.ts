import { expect, test, type Page } from '@playwright/test'
import { deletesWhatItSaves, savedIdFrom } from './support/savedLabels'

/**
 * Five defects in the US food rail, reported by review and each reproduced here
 * before it was fixed, on 2026-10-08. Every one is a disagreement between what the
 * form shows and what the document holds, so each is asserted on what a user sees.
 *
 * The editor opens on oats 90%, almonds 7% (tree nuts, named inline), sugar 2% and
 * salt 1%, the last two grouped behind a 2 percent statement.
 */

async function openFoodEditor(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/labels/new')
  await page.selectOption('#field-label-type', 'us-food')
  await expect(page.locator('form[aria-label="Label details"]')).toBeVisible()
}

const checks = (page: Page) => page.locator('#pane-checks')

const saved = deletesWhatItSaves()

test('a hand-set type size can be cleared and retyped without the box leaving', async ({
  page,
}) => {
  // Emptying the box deleted the size, the checkbox read the same key, and the
  // box unmounted under the cursor — measured: count 0, override unticked.
  await openFoodEditor(page)
  const override = page.locator('#field-food-override-type')
  await override.check()
  const box = page.locator('#field-food-type-size')
  await box.fill('')
  await expect(box).toBeVisible()
  await expect(override).toBeChecked()
  await box.pressSequentially('3')
  await expect(box).toHaveValue('3')
})

test('a cleared percentage is not stated, rather than zero', async ({ page }) => {
  // It read back as 0 and drew "almonds is 7% … listed after whole grain rolled
  // oats at 0%", a violation from a figure nobody gave.
  await openFoodEditor(page)
  const oats = page.locator('#field-food-ing-pct-0')
  await oats.fill('')
  await expect(oats).toHaveValue('')
  await expect(checks(page)).not.toContainText('at 0%')
  await expect(checks(page)).toContainText(
    '"whole grain rolled oats" states no percentage by weight',
  )
  // And the link to state it lands on the box that is empty, not on the first name.
  await checks(page).getByRole('button', { name: 'Ingredients (percentages)', exact: true }).click()
  await expect(oats).toBeFocused()

  // And a new row starts with nothing, not with 0.
  await page.locator('#field-food-ing-add').click()
  await expect(page.locator('#field-food-ing-pct-4')).toHaveValue('')
})

test('a percentage out of range is refused in the form, not by the server', async ({ page }) => {
  // Save answered "Invalid label document: data.ingredients.1.percentByWeight Too
  // big: expected number to be <=100" — a raw 400 on the one screen a user meets it.
  await openFoodEditor(page)
  const almonds = page.locator('#field-food-ing-pct-1')
  await almonds.fill('150')
  await expect(almonds).toHaveValue('150')
  await expect(almonds).toHaveAttribute('aria-invalid', 'true')
  // The box is described by the sentence, which runs under its row.
  const describedBy = await almonds.getAttribute('aria-describedby')
  await expect(page.locator(`#${describedBy}`)).toContainText('between 0 and 100')
  // Beside the box, in the form — the announcer says it again off screen.
  await expect(
    page.locator('#pane-form').getByText('A percentage by weight is between 0 and 100'),
  ).toBeVisible()
  // Said aloud too, through the one announcer, naming the box it is about.
  await expect(page.locator('[aria-live]').filter({ hasText: 'Ingredient 2 percent' })).toHaveCount(
    1,
  )

  // Typing in another row leaves this one alone. A single refusal slot cleared it,
  // and the 150 vanished from a box the user had not touched — seen in a screenshot.
  await page.locator('#field-food-ing-pct-0').fill('')
  await expect(almonds).toHaveValue('150')
  await expect(almonds).toHaveAttribute('aria-invalid', 'true')

  await page.locator('#field-label-name').fill('Refused percentage')
  await page.locator('[data-save]').click()
  await expect(page.locator('[data-save-state]')).toHaveText('Saved')
  // "Saved" is shown before the URL is moved to the new record, so it is waited for.
  await expect(page).toHaveURL(/\/labels\/[0-9a-f]{24}$/)
  saved(savedIdFrom(page.url()))
  await expect(page.getByText('Invalid label document')).toHaveCount(0)

  // Adding a row moves no row, so the refusal stays. The first version cleared every
  // refusal on any structural change, adding included. Found by review.
  await page.locator('#field-food-ing-add').click()
  await expect(almonds).toHaveValue('150')

  // A figure in range clears the refusal.
  await almonds.fill('7')
  await expect(almonds).not.toHaveAttribute('aria-invalid', 'true')
})

test('correcting an allergen keeps the choice about naming its source', async ({ page }) => {
  // Every allergen change set the parenthetical back on.
  await openFoodEditor(page)
  const inline = page.locator('#field-food-ing-inline-1')
  await expect(inline).toBeChecked()
  await inline.uncheck()
  await page.selectOption('#field-food-ing-allergen-1', 'peanuts')
  await expect(page.locator('#field-food-ing-inline-1')).not.toBeChecked()
})

test('turning the second column off and on again keeps what was typed into it', async ({
  page,
}) => {
  // Unticking deleted the columns, figures and all.
  await openFoodEditor(page)
  const dual = page.locator('#field-food-nf-dual')
  await dual.check()
  await page.locator('#field-food-nf2-calcium').fill('520')
  // A percentage too: a second-column percentage the panel will not print is what the
  // engine reports, so this is what a leftover in the document would show up as.
  await page.locator('#field-food-nf-override').check()
  await page.locator('#field-food-nf2-dv-calcium').fill('40')
  await dual.uncheck()
  // Off is off: the second column's boxes go with it, and so do its figures from the
  // document — kept by the rail, not left for the engine to report as unprinted.
  await expect(page.locator('#field-food-nf2-calcium')).toHaveCount(0)
  await expect(checks(page)).not.toContainText('second-column')
  await dual.check()
  await expect(page.locator('#field-food-nf2-calcium')).toHaveValue('520')
  await expect(page.locator('#field-food-nf2-dv-calcium')).toHaveValue('40')
})

test.describe('found by the review of these fixes', () => {
  test('a refused figure stays with its row when rows move or go', async ({ page }) => {
    // Moving or removing any row forgot every refusal — even a move past the top,
    // which moves nothing.
    await openFoodEditor(page)
    await page.locator('#field-food-ing-pct-1').fill('150')
    // Moved up, the refusal goes with almonds to the top.
    await page.getByRole('button', { name: 'Move almonds up' }).click()
    await expect(page.locator('#field-food-ing-pct-0')).toHaveValue('150')
    // Up again from the top moves nothing, and the refusal stays where it is.
    await page.getByRole('button', { name: 'Move almonds up' }).click()
    await expect(page.locator('#field-food-ing-pct-0')).toHaveValue('150')
    // Another row going leaves it alone.
    await page.getByRole('button', { name: 'Remove salt' }).click()
    await expect(page.locator('#field-food-ing-pct-0')).toHaveValue('150')
    await expect(page.locator('#field-food-ing-pct-0')).toHaveAttribute('aria-invalid', 'true')
  })

  test('a box that does not parse is refused, not cleared in silence', async ({ page }) => {
    // "7e" reads back as '' and was taken for a cleared box: the 7 went and nothing said
    // so. Ignoring it instead left "-" on screen while the label printed 7. It is a
    // refusal: the box keeps its text, is marked, and says the figure is not in the label.
    await openFoodEditor(page)
    const almonds = page.locator('#field-food-ing-pct-1')
    await almonds.focus()
    await page.keyboard.press('End')
    await page.keyboard.type('e')
    await expect(almonds).toHaveAttribute('aria-invalid', 'true')
    await expect(
      page.locator('#pane-form').getByText('A percentage by weight is between 0 and 100'),
    ).toBeVisible()
    await expect(checks(page)).toContainText('"almonds" states no percentage by weight')

    // Moved, its text and its refusal arrive together. Rows were keyed by index, so the
    // text stayed behind in the old position while the refusal moved. Read from the
    // browser's own `badInput`, because a box holding "7e" reports its value as `''` and
    // an assertion on the value could not tell it from an empty box. Found by review.
    await page.getByRole('button', { name: 'Move almonds up' }).click()
    const top = page.locator('#field-food-ing-pct-0')
    await expect(top).toHaveAttribute('aria-invalid', 'true')
    expect(await top.evaluate((el) => (el as HTMLInputElement).validity.badInput)).toBe(true)
    // And the row it swapped with is a plain box again.
    const second = page.locator('#field-food-ing-pct-1')
    await expect(second).toHaveValue('90')
    expect(await second.evaluate((el) => (el as HTMLInputElement).validity.badInput)).toBe(false)

    // Removed, its text goes with it, rather than staying on whichever row moves up.
    await page.getByRole('button', { name: 'Remove almonds' }).click()
    const stuck = await page
      .locator('[id^="field-food-ing-pct-"]')
      .evaluateAll(
        (boxes) => boxes.filter((box) => (box as HTMLInputElement).validity.badInput).length,
      )
    expect(stuck).toBe(0)
  })

  test('the link lands on the box the check that did not run needs', async ({ page }) => {
    // The order check judges rather than declines — oats 5 under almonds 7 is out of
    // order whatever the blank between them holds — so only the threshold check is
    // waiting, for salt. The link went to the first blank, then to the ordered run's.
    await openFoodEditor(page)
    await page.getByRole('button', { name: 'Add an ingredient' }).click()
    await page.locator('#field-food-ing-name-4').fill('honey')
    await page.getByRole('button', { name: 'Move honey up' }).click()
    await page.getByRole('button', { name: 'Move honey up' }).click()
    // oats, almonds, honey (no figure), sugar, salt — the last two grouped.
    await page.locator('#field-food-ing-pct-0').fill('5')
    await page.locator('#field-food-ing-pct-4').fill('')
    await expect(checks(page)).toContainText('listed after "whole grain rolled oats" at 5%')
    await checks(page)
      .getByRole('button', { name: 'Ingredients (percentages)', exact: true })
      .click()
    await expect(page.locator('#field-food-ing-pct-4')).toBeFocused()
  })

  test('a panel thrown away takes its set-aside second column with it', async ({ page }) => {
    await openFoodEditor(page)
    const dual = page.locator('#field-food-nf-dual')
    await dual.check()
    await page.locator('#field-food-nf2-calcium').fill('520')
    await dual.uncheck()
    await page.locator('#field-food-nf-present').uncheck()
    await page.locator('#field-food-nf-present').check()
    await page.locator('#field-food-nf-dual').check()
    await expect(page.locator('#field-food-nf2-calcium')).toHaveValue('')
  })
})
