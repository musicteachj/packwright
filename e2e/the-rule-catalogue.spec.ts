import { expect, test } from '@playwright/test'
import { LABEL_TYPES, listRules } from '@packwright/label-core'

/**
 * Counted from the registry, not typed in. A spec asserting "34" would pass a
 * page that had stopped rendering one and been updated to match — the same
 * failure as a hand-written catalogue, moved into the test.
 */
const RULE_COUNT = listRules().length

/**
 * `/rules` in a real browser, against the built artifact.
 *
 * The jsdom tests prove the page lists the registry. This proves the route
 * exists in the shipped bundle, that the server's history fallback serves it —
 * `/rules` was the deep link `verify-build.sh` has been asserting since stage 1,
 * at a time when the router had no such route — and that a reader can get to it
 * by clicking rather than by typing a URL.
 */

test('is reachable from the landing page and lists the registry', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Rules' }).click()

  await expect(page).toHaveURL(/\/rules$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('rules this tool encodes')

  // Three sections, one per label type, each headed with its own count.
  await expect(page.locator('section[aria-labelledby^="section-"]')).toHaveCount(LABEL_TYPES.length)
  await expect(page.locator('article')).toHaveCount(RULE_COUNT)
})

test('survives a refresh, which is the server fallback rather than the router', async ({
  page,
}) => {
  await page.goto('/rules')
  await expect(page.locator('article').first()).toBeVisible()
  await page.reload()
  await expect(page.locator('article')).toHaveCount(RULE_COUNT)
})

test('shows a rule with the provisions it reports under', async ({ page }) => {
  await page.goto('/rules')

  const signalWord = page.locator('article').filter({ hasText: 'ghs/signal-word-precedence' })
  await expect(signalWord).toContainText('29 CFR 1910.1200')
  await expect(signalWord).toContainText('Regulation (EC) No 1272/2008')

  await page.locator('article').first().screenshot({ path: 'e2e/__screenshots__/rule-entry.png' })
  await page.screenshot({ path: 'e2e/__screenshots__/rules-page.png', fullPage: false })
})
