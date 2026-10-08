import { expect, test } from '@playwright/test'

/**
 * What every route shares, in a real browser against the built client.
 *
 * `App.test.ts` covers the same ground in jsdom, which has no layout and no
 * scrolling: this file is for what only a browser can say — that the skip link
 * is visible once focused, that a deep link the server answers with the client
 * reaches the 404, and that scroll is restored on the way back.
 */

for (const route of ['/', '/rules', '/labels/new'] as const) {
  test(`the first Tab on ${route} reaches a visible skip link that moves focus to the page`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(route)
    await expect(page.locator('main#main')).toBeVisible()

    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    const box = await skip.boundingBox()
    expect(box, 'the skip link must be drawn once it has focus').not.toBeNull()
    expect(box!.width).toBeGreaterThan(24)
    expect(box!.y).toBeGreaterThanOrEqual(0)

    await page.keyboard.press('Enter')
    await expect(page.locator('main#main')).toBeFocused()
    // A click handler, not a navigation: the address keeps no fragment.
    expect(new URL(page.url()).hash).toBe('')
  })
}

test('the skip link brings the page into view when used from far down it', async ({ page }) => {
  // It is `fixed` once focused, so it can be reached from anywhere — and focus
  // it moves to the top of a page scrolled away from would land out of sight.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/rules')
  await expect(page.locator('article').first()).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 2000))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(2000)

  await page.getByRole('link', { name: 'Skip to content' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('main#main')).toBeFocused()
  // The page's own top, not `main` merely intersecting the viewport — `main`
  // spans the whole page and intersects it at any scroll offset.
  await expect
    .poll(() => page.evaluate(() => document.getElementById('main')!.getBoundingClientRect().top))
    .toBeGreaterThanOrEqual(0)
})

test('an address with no page reaches the 404, inside the shell', async ({ page }) => {
  await page.goto('/labels/abc/edit')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('There is no page here')
  await expect(page.locator('header nav[aria-label="Sections"]')).toBeVisible()
  await expect(page).toHaveTitle('Page not found — packwright')
})

test('each route names the window', async ({ page }) => {
  await page.goto('/rules')
  await expect(page).toHaveTitle('Rules — packwright')
  await page.getByRole('link', { name: 'Saved', exact: true }).click()
  await expect(page).toHaveTitle('Saved labels — packwright')
})

test('back returns to where the reader was, and a new page starts at the top', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/rules')
  await expect(page.locator('article').first()).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 2000))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(2000)

  // Clicked by script, from where the reader is. The masthead is not sticky, and
  // Playwright scrolls a link into view before clicking it — which would move
  // the reader to the top first and leave nothing to restore.
  await page.evaluate(() => document.querySelector<HTMLAnchorElement>('a[href="/design"]')!.click())
  await expect(page).toHaveURL(/\/design$/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)

  await page.goBack()
  await expect(page).toHaveURL(/\/rules$/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(2000)
})

test('following a link moves focus to the new page', async ({ page }) => {
  await page.goto('/rules')
  await page.getByRole('link', { name: 'Saved', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Saved labels')
  await expect(page.locator('main#main')).toBeFocused()
})
