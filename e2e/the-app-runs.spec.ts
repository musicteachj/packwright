import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * The application loads and runs, from the artifact that ships.
 *
 * This is the first time in six phases that a browser has opened this app. Every
 * other check runs in jsdom, which parses the bundle rather than executing it
 * under a security policy, has no layout engine, and would report all of the
 * following as fine whether or not a user could see a thing.
 *
 * The specific thing at stake is the Content-Security-Policy. `apps/api` mounts
 * helmet at its defaults but for one directive: `script-src` is `'self'` plus
 * `'wasm-unsafe-eval'`, which the barcode scanner needs and which was added
 * deliberately rather than inherited. Everything else — `default-src 'self'`,
 * `object-src 'none'`, `style-src 'self' https: 'unsafe-inline'` — is helmet's
 * own. Until stage 1 this server only ever returned JSON, so no browser had run a
 * page under any of it.
 */

/** Errors the browser reported, of the kinds that mean something is broken. */
function collectFailures(page: Page) {
  const failures: string[] = []

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') failures.push(`console.error: ${message.text()}`)
  })
  // An uncaught exception leaves the app half-mounted and is invisible to a
  // "did the page load" assertion, because the HTML loads perfectly well.
  page.on('pageerror', (error) => failures.push(`uncaught: ${error.message}`))
  page.on('requestfailed', (request) =>
    failures.push(`request failed: ${request.url()} ${request.failure()?.errorText ?? ''}`),
  )

  return failures
}

/** The binding `addInitScript` installs, seen from inside the page. */
interface ReportingWindow {
  __cspViolation?: (detail: string) => void
}

/**
 * CSP violations, collected from the document that raised them.
 *
 * `securitypolicyviolation` fires on the document, which is the authoritative
 * source; Chrome also logs to the console, but relying on that alone would tie
 * this to one browser's message wording.
 *
 * The returned `assertInstalled` is not ceremony. If `exposeFunction` or the init
 * script ever failed to bind, this collector would report zero violations
 * forever and the CSP assertion would pass by finding nothing rather than by
 * there being nothing — a harness certifying what it never checked, which is the
 * same defect as a rule doing it.
 */
async function collectCspViolations(page: Page) {
  const violations: string[] = []

  await page.exposeFunction('__cspViolation', (detail: string) => void violations.push(detail))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      ;(window as ReportingWindow).__cspViolation?.(
        `${event.violatedDirective} blocked ${event.blockedURI}`,
      )
    })
  })

  const assertInstalled = async () => {
    const installed = await page.evaluate(
      () => typeof (window as ReportingWindow).__cspViolation === 'function',
    )
    expect(installed, 'the CSP violation collector must actually be bound').toBe(true)
  }

  return { violations, assertInstalled }
}

test('the landing page mounts and renders a real label', async ({ page }) => {
  const failures = collectFailures(page)
  const { violations, assertInstalled } = await collectCspViolations(page)

  await page.goto('/')
  await assertInstalled()

  // `#app` having children is the claim that matters: the HTML shell is static
  // and would load identically with the bundle blocked. Vue having mounted into
  // it is what proves the script ran.
  const app = page.locator('#app')
  await expect(app).not.toBeEmpty()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // The landing page runs the real layout engine in the browser to draw a UPC-A.
  // If bwip-js or the engine failed under the policy, this is where it shows.
  await expect(page.locator('svg[role="img"]').first()).toBeVisible()

  expect(violations, 'the client must run under the CSP the server sends').toEqual([])
  expect(failures, 'the page must load without browser errors').toEqual([])
})

test('a deep link into the editor mounts the three panes', async ({ page }) => {
  const failures = collectFailures(page)
  const { violations, assertInstalled } = await collectCspViolations(page)

  // Straight to the deep link rather than navigating there, because that is the
  // path that goes through the server's history fallback rather than through the
  // router. A refresh on this URL is the case that 404s without it.
  await page.goto('/labels/new')
  await assertInstalled()

  await expect(page.locator('form[aria-label="Label details"]')).toBeVisible()
  await expect(page.locator('svg[role="img"]').first()).toBeVisible()
  await expect(page.locator('section[aria-labelledby="findings-heading"]')).toBeVisible()

  expect(violations).toEqual([])
  expect(failures).toEqual([])
})

test('the stylesheet is applied, not merely served', async ({ page }) => {
  await page.goto('/')

  // A CSP that blocked the stylesheet would leave a page that still passes every
  // assertion above — the elements exist and are "visible" — while rendering as
  // unstyled HTML. So this asks the browser what it actually computed.
  //
  // Read off `body`, which `main.css` themes directly, rather than off whichever
  // element happens to carry the page frame. It asked `main` once and broke when
  // the masthead moved out of it and the frame moved up a level — a structural
  // change with nothing to do with whether the stylesheet loaded, which is all
  // this is here to answer.
  const themed = await page.evaluate(() => {
    const style = getComputedStyle(document.body)
    return { background: style.backgroundColor, colour: style.color, font: style.fontFamily }
  })

  expect(themed.background, 'the graphite chrome must be applied').not.toBe('rgba(0, 0, 0, 0)')
  expect(themed.background).not.toBe('rgb(255, 255, 255)')
  // The self-hosted face, which is served under the same policy as the stylesheet
  // that names it.
  expect(themed.font, 'IBM Plex must be the resolved family').toMatch(/IBM Plex Sans/)
})
