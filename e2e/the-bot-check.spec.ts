import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The bot check, loaded by the built page under the server's own
 * Content-Security-Policy.
 *
 * jsdom has no CSP, so whether helmet's `script-src` and `frame-src` admit
 * Cloudflare's script and its challenge frame can only be seen here, against
 * the built server (`apps/api/src/app.ts` names both grants).
 *
 * **Nothing reaches Cloudflare.** Every `challenges.cloudflare.com` request is
 * fulfilled by a route: the script is a fake that draws an iframe from that
 * origin and hands back Cloudflare's published test token,
 * `XXXX.DUMMY.TOKEN.XXXX`, with its always-passing test site key
 * `1x00000000000000000000AA` (both from Cloudflare's "Testing" page, as
 * recorded in `apps/api/src/audit/turnstile.ts`). The read itself is answered
 * from the recorded reply, as in `the-label-audit.spec.ts`.
 */
const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'apps',
  'api',
  'src',
  'audit',
  'fixtures',
)

const recorded = JSON.parse(readFileSync(join(fixtures, 'recorded.json'), 'utf8')) as {
  content: { type: string; text?: string }[]
  model: string
}

const readFields = JSON.parse(
  recorded.content.find((block) => block.type === 'text')!.text!,
) as Record<string, unknown>

const SAMPLE = join(fixtures, 'sampleLabel.png')

const TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'

/** Cloudflare's script, as little of it as the page uses. */
const FAKE_TURNSTILE = `
window.turnstile = {
  render(container, options) {
    const frame = document.createElement('iframe')
    frame.src = 'https://challenges.cloudflare.com/fake-frame'
    frame.title = 'Bot check'
    container.appendChild(frame)
    setTimeout(() => options.callback(${JSON.stringify(TEST_TOKEN)}), 50)
    return 'fake-widget'
  },
  reset() {},
  remove() {},
}
`

test.describe.configure({ timeout: 60_000 })

test('the bot check loads under the CSP and its token goes with the read', async ({ page }) => {
  await page.addInitScript(() => {
    const violations: string[] = []
    Object.assign(window, { __cspViolations: violations })
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.violatedDirective} ${event.blockedURI}`)
    })
  })

  const reached: string[] = []
  await page.route('https://challenges.cloudflare.com/**', (route) => {
    reached.push(route.request().url())
    return route.fulfill({ status: 404, body: '' })
  })
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_TURNSTILE }),
  )
  await page.route('https://challenges.cloudflare.com/fake-frame', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Bot check</title><p>Checked.</p>',
    }),
  )

  const sentTokens: (string | undefined)[] = []
  await page.route('**/api/audit/ghs', (route) => {
    sentTokens.push(route.request().headers()['x-turnstile-token'])
    return route.fulfill({
      status: 200,
      json: { extraction: { fields: readFields, warnings: [] }, model: recorded.model },
    })
  })
  await page.route('**/api/audit/status', (route) =>
    route.fulfill({
      status: 200,
      json: { available: true, reason: null, siteKey: '1x00000000000000000000AA' },
    }),
  )

  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto('/audit')
  await page.selectOption('[data-test="regime"]', 'eu-clp')
  await page.setInputFiles('[data-test="photo-file"]', SAMPLE)
  await expect(page.locator('[data-test="photo-preview"]')).toBeVisible()

  // The widget drew its frame, from Cloudflare's origin, inside the page's box.
  await expect(
    page.locator(
      '[data-test="bot-check"] iframe[src="https://challenges.cloudflare.com/fake-frame"]',
    ),
  ).toBeAttached()
  await expect(page.frameLocator('[data-test="bot-check"] iframe').locator('p')).toHaveText(
    'Checked.',
  )

  const read = page.locator('[data-test="read"]')
  await expect(read).toBeEnabled()
  await read.click()
  await expect(page.locator('[data-field="signalWords"]')).toBeVisible()

  expect(sentTokens).toEqual([TEST_TOKEN])
  // Spent: the next read needs a new token, and the fake hands out no second one.
  await expect(read).toBeDisabled()

  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  )
  expect(violations, 'nothing the page loaded was refused by its own policy').toEqual([])
  // Every request to Cloudflare was one of the two the routes above answer.
  expect(reached).toEqual([])
})
