import { expect, test, type Page } from '@playwright/test'

/**
 * The half of the numeric-input policy jsdom cannot state.
 *
 * A `type="number"` input sanitises its own value, so what the box shows and
 * what `input.value` reads back part company as soon as a figure is
 * incomplete. Measured in Chromium, `0.` shows the trailing dot and reads back
 * as `"0"`. jsdom does no such thing — it hands back whatever was set — so only
 * a real browser can say what the control is showing between keystrokes.
 *
 * **This header used to say two things that were wrong**, and both are kept
 * here because the next reader will reason their way to the same ones. It said
 * `0.` reads back as the empty string; it reads back as `"0"`. And it said a
 * field snapping back to blank on a refusal would make `0.5` untypable. It does
 * not: the old behaviour blanked the box on the `0` and left `.5` on screen,
 * which Chromium reads as `0.5`, so the figure landed and only the keystroke
 * was lost. That is why the test below asserts the box after every character —
 * a version checking only the figure at the end passed against the unfixed
 * code.
 */

const openFoodEditor = async (page: Page) => {
  await page.goto('/labels/new')
  await page.locator('#field-label-type').selectOption('us-food')
  await expect(page.locator('form[aria-label="Label details"]')).toBeVisible()
}

const PACKAGE_CONTENT = '#field-food-nf-package-content'

test('a figure under one can still be typed over one that was stated', async ({ page }) => {
  await openFoodEditor(page)
  const box = page.locator(PACKAGE_CONTENT)

  // **Asserted after every keystroke, over a stated figure.** Two earlier
  // versions of this test proved nothing, and a mutation run said so both
  // times. Starting from an empty box, `0.5` types fine either way — the bound
  // value never moves, so there is no patch to fight. Starting from 140 but
  // checking only the figure at the end also passes either way: the old
  // behaviour blanked the box on the refused `0` and left `.5` on screen, which
  // Chromium reads back as `0.5`, so the document was right and only the
  // keystroke was lost. The keystroke is the thing being fixed, so the
  // keystroke is the thing to assert.
  await box.fill('140')
  await expect(box).toHaveValue('140')
  await box.press('ControlOrMeta+a')

  // Measured rather than assumed, because a `type="number"` input sanitises its
  // own value and the guesses here were wrong twice. `0` is refused. `0.` still
  // reads back as `0` — Chromium keeps the trailing dot on screen and drops it
  // from `value`, so the model is handed a zero a second time and the field
  // stays refused, which is right: the label holds no figure yet. Only `0.5` is
  // a measurement.
  await box.press('0')
  await expect(box, 'the refused character must survive being refused').toHaveValue('0')
  await expect(box).toHaveAttribute('aria-invalid', 'true')

  await box.press('.')
  await expect(box, 'and must survive the next one too').toHaveValue('0')
  await expect(box).toHaveAttribute('aria-invalid', 'true')

  await box.press('5')
  await expect(box).toHaveValue('0.5')
  await expect(box, 'the guard took it, so nothing is refused').not.toHaveAttribute('aria-invalid')
})

test('a refused figure stays in the box and says why', async ({ page }) => {
  await openFoodEditor(page)
  const box = page.locator(PACKAGE_CONTENT)

  await box.fill('140')
  await expect(box).toHaveValue('140')

  // Over a stated figure — the case where the bound value really moves and the
  // element really is patched, so the keystroke used to vanish as it was typed.
  await box.fill('0')

  await expect(box, 'the box keeps what was typed').toHaveValue('0')
  await expect(box).toHaveAttribute('aria-invalid', 'true')

  const describedBy = await box.getAttribute('aria-describedby')
  expect(describedBy, 'an invalid field must name what explains it').toBeTruthy()
  const note = page.locator(`#${describedBy}`)
  await expect(note).toBeVisible()
  await expect(note).toContainText('is not in this label')
})

test('an empty box is an answer, not a mistake', async ({ page }) => {
  await openFoodEditor(page)
  const box = page.locator(PACKAGE_CONTENT)

  await box.fill('140')
  await box.fill('')

  await expect(box).toHaveValue('')
  await expect(box, 'declining to state a figure is not an error').not.toHaveAttribute(
    'aria-invalid',
  )
  expect(await box.getAttribute('aria-describedby')).toBeNull()
})
