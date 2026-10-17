import { expect, test } from '@playwright/test'

/**
 * Checkboxes are square, like the fields beside them, and still say when they are ticked.
 *
 * The browser's own checkbox draws rounded corners that `border-radius` cannot reach, so the box is
 * drawn by `CHECKBOX_INPUT` instead and the tick is an SVG shown by `peer-checked`. Only a browser can
 * say either: jsdom computes no `appearance` and applies no `:checked` variant.
 */

test('a checkbox is drawn square, and its tick shows only when it is ticked', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/labels/new')

  const box = page.locator('#field-omit-hri')
  const tick = page.locator('label[for="field-omit-hri"] [data-tick]')
  await expect(box).toBeAttached()

  const style = await box.evaluate((el) => {
    const s = getComputedStyle(el)
    return { appearance: s.appearance, radius: s.borderTopLeftRadius }
  })
  expect(style, 'the native, rounded box must be off').toEqual({
    appearance: 'none',
    radius: '0px',
  })

  await expect(box).not.toBeChecked()
  await expect(tick).toBeHidden()

  await page.getByText('Omit the human-readable digits').click()
  await expect(box).toBeChecked()
  await expect(tick).toBeVisible()
})
