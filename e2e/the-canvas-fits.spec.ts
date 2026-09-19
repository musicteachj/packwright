import { expect, test } from '@playwright/test'

/**
 * `the-responsive-collapse.spec.ts` asserts the *document* does not scroll
 * sideways, and that passed throughout: the overflow was inside the preview
 * pane, not the page. So the US food label sat 453 CSS pixels wide in a 375px
 * window with its first and last characters off both edges, and every existing
 * assertion was green.
 */
test('the label fits its pane at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('/labels/new')
  await page.locator('#field-label-type').selectOption('us-food')

  const pane = page.locator('#pane-preview')
  await expect(pane).toBeVisible()

  const svg = page.locator('#pane-preview svg[role="img"]').first()
  await expect(svg).toBeVisible()

  const drawn = await svg.boundingBox()
  const box = await pane.boundingBox()
  expect(drawn, 'the label must be laid out').not.toBeNull()
  expect(box, 'the pane must be laid out').not.toBeNull()
  expect(drawn!.width, 'the label is wider than the pane it is drawn in').toBeLessThanOrEqual(
    box!.width,
  )
  expect(drawn!.x, 'the label starts off the left edge').toBeGreaterThanOrEqual(box!.x - 1)
})

/**
 * The other half of making Fit the default, and the half a reviewer had to find.
 *
 * `preview == print` is the property this whole project rests on, and the zoom
 * control is the one place it can be broken by presentation alone. Fit's ceiling
 * used to be `widthMm * 4` px against a real 3.7795 px per millimetre — 5.8%
 * over, which cost nothing while Fit was something a user chose, and would have
 * meant every desktop preview opening at 106% of true scale the moment it became
 * the default. So Fit shrinks and never enlarges, and on a pane with room to
 * spare it draws exactly what 100% draws.
 */
test('the label opens at true scale where there is room for it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/labels/new')
  await page.locator('#field-label-type').selectOption('us-food')

  const svg = page.locator('#pane-preview svg[role="img"]').first()
  await expect(svg).toBeVisible()

  // 120 mm of stock at 96 dpi. Asserted from the figure rather than from a
  // number read off the running page, which would only prove it is repeatable.
  const CSS_PX_PER_MM = 96 / 25.4
  const expected = 120 * CSS_PX_PER_MM

  const drawn = await svg.boundingBox()
  expect(drawn, 'the label must be laid out').not.toBeNull()
  expect(
    Math.abs(drawn!.width - expected),
    `a 120 mm label must draw ${expected.toFixed(2)} px wide, not ${drawn!.width.toFixed(2)}`,
  ).toBeLessThanOrEqual(1)
})
