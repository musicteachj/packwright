import { expect, test } from '@playwright/test'

/**
 * The masthead belongs to the page, not to the window.
 *
 * `AuditView` put `SiteHeader` outside `PAGE_INNER` while every other reading
 * route puts it inside, so on `/audit` the masthead got neither the page's
 * horizontal gutter nor its maximum width: the wordmark sat hard against the
 * left edge of the glass and the last nav link against the right, while the
 * content beneath them was inset and centred.
 *
 * **Measured on content, not on boxes.** The first version of this compared the
 * `<header>`'s bounding box with `<main>`'s, and passed on the broken page at
 * 375px: `PAGE_INNER`'s `px-8` is padding *inside* main's box and its
 * `max-w-5xl` does not bind below 1024, so both boxes were flush to the viewport
 * and identical while the visible content was inset by 32px on one and by
 * nothing on the other. What a reader sees is where the ink starts, so that is
 * what is asserted.
 */

const ROUTES = ['/', '/labels', '/rules', '/audit', '/design'] as const
const MASTHEAD = 'header:has(nav[aria-label="Sections"])'

for (const width of [375, 1440] as const) {
  for (const route of ROUTES) {
    test(`${route} sets its masthead in the page's column at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(route)
      await expect(page.locator(MASTHEAD)).toBeVisible()

      const wordmark = await page.locator(`${MASTHEAD} a`).first().boundingBox()
      const nav = await page.locator(`${MASTHEAD} nav`).boundingBox()
      const heading = await page.locator('main h1').first().boundingBox()
      expect(wordmark, 'the wordmark must be laid out').not.toBeNull()
      expect(nav, 'the nav must be laid out').not.toBeNull()
      expect(heading, 'the heading must be laid out').not.toBeNull()

      // Whatever the width resolves the page gutter to.
      const gutter = heading!.x

      // The laid-out width, not the requested one. A visible scrollbar takes
      // real layout width, so on a headed run the page is narrower than the
      // viewport and every right-edge sum is off by however wide the scrollbar
      // is — green in CI, failing on the machine of whoever runs it to look.
      const laidOut = await page.evaluate(() => document.documentElement.clientWidth)

      expect(
        Math.abs(wordmark!.x - gutter),
        'the wordmark must start where the page content starts',
      ).toBeLessThanOrEqual(1)

      // Inside the column at every width — which is what clipping broke.
      expect(nav!.x, 'the nav must not start left of the column').toBeGreaterThanOrEqual(gutter - 1)
      expect(
        nav!.x + nav!.width,
        'the nav must not run past the right edge of the column',
      ).toBeLessThanOrEqual(laidOut - gutter + 1)

      // And aligned to one of the column's edges: beside the wordmark it ends at
      // the right gutter; where the width is too narrow for that it takes a row
      // of its own and starts at the left one, under the wordmark. Either way
      // it lines up with something on the page rather than floating.
      const besideTheWordmark = Math.abs(nav!.y - wordmark!.y) < wordmark!.height
      if (besideTheWordmark) {
        expect(
          Math.abs(laidOut - (nav!.x + nav!.width) - gutter),
          'beside the wordmark, the nav must end as far from the right edge as the content is from the left',
        ).toBeLessThanOrEqual(1)
      } else {
        expect(
          Math.abs(nav!.x - gutter),
          'on a row of its own, the nav must start where the content starts',
        ).toBeLessThanOrEqual(1)
      }
    })
  }
}
