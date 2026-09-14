import { expect, test, type Page } from '@playwright/test'

/**
 * The three panes collapse to a segmented control below 1024px.
 *
 * **This is the file jsdom could not have written.** It has no layout engine, so
 * `toBeVisible` there means "is in the document and not `display: none` by an
 * inline style" — it cannot evaluate a media query, cannot resolve a Tailwind
 * `lg:` variant, and would report all three panes visible at every width. The
 * claim being made here is about what a browser at a given viewport actually
 * puts on screen.
 *
 * The four widths come from `docs/DESIGN.md`. They are verification widths rather
 * than four breakpoints: there is one threshold — "Below 1024px the three panes
 * collapse to a segmented control" — and `lg` is exactly 1024 in Tailwind v4, so
 * no custom breakpoint token was needed.
 */

const FORM = '#pane-form'
const PREVIEW = '#pane-preview'
const CHECKS = '#pane-checks'
const SWITCHER = '[role="tablist"][aria-label="Editor panes"]'

const openEditor = async (page: Page, width: number) => {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/labels/new')
  await expect(page.locator('form[aria-label="Label details"]')).toBeAttached()
}

test.describe('narrow — the panes take turns', () => {
  for (const width of [375, 768, 1023]) {
    test(`at ${width}px one pane is shown and the switcher is offered`, async ({ page }) => {
      await openEditor(page, width)

      await expect(page.locator(SWITCHER)).toBeVisible()

      // Opens on the preview: the form and the findings are legible in a list
      // anywhere, and the label is the thing the tool exists to draw.
      await expect(page.locator(PREVIEW)).toBeVisible()
      await expect(page.locator(FORM)).toBeHidden()
      await expect(page.locator(CHECKS)).toBeHidden()

      await page.getByRole('tab', { name: 'Form' }).click()
      await expect(page.locator(FORM)).toBeVisible()
      await expect(page.locator(PREVIEW)).toBeHidden()

      await page.getByRole('tab', { name: 'Checks' }).click()
      await expect(page.locator(CHECKS)).toBeVisible()
      await expect(page.locator(FORM)).toBeHidden()

      // **Nothing may run off the side.** Found by mutation: removing the `lg:`
      // from the grid's column template left every visibility assertion above
      // passing, because the panes are shown and hidden by their own classes —
      // while the single visible pane sat in a 380px column on a 375px screen and
      // the whole editor scrolled sideways. Visibility and fit are two claims.
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
      expect(overflows, `the editor must not scroll sideways at ${width}px`).toBe(false)
    })
  }
})

test.describe('wide — all three at once', () => {
  for (const width of [1024, 1440]) {
    test(`at ${width}px every pane is on screen and the switcher is gone`, async ({ page }) => {
      await openEditor(page, width)

      await expect(page.locator(SWITCHER)).toBeHidden()
      for (const pane of [FORM, PREVIEW, CHECKS]) {
        await expect(page.locator(pane), pane).toBeVisible()
      }

      // Side by side, not stacked — the thing a class-name assertion cannot tell
      // you. Each pane's box starts to the right of the one before it.
      const boxes = await Promise.all(
        [FORM, PREVIEW, CHECKS].map((pane) => page.locator(pane).boundingBox()),
      )
      expect(boxes[0]!.x + boxes[0]!.width).toBeLessThanOrEqual(boxes[1]!.x + 1)
      expect(boxes[1]!.x + boxes[1]!.width).toBeLessThanOrEqual(boxes[2]!.x + 1)
    })
  }
})

test('the pane the switcher shows survives being made wide and narrow again', async ({ page }) => {
  await openEditor(page, 375)
  await page.getByRole('tab', { name: 'Form' }).click()
  await expect(page.locator(FORM)).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator(CHECKS)).toBeVisible()

  await page.setViewportSize({ width: 375, height: 900 })
  await expect(page.locator(FORM), 'it returns to the pane it was on').toBeVisible()
  await expect(page.locator(PREVIEW)).toBeHidden()
})

test('following a finding goes to the canvas it outlines', async ({ page }) => {
  // The interaction this editor is built around. On a narrow screen the canvas is
  // not on screen when the findings are, so following the link has to go there —
  // otherwise clicking a finding silently does nothing, which is worse than not
  // offering it.
  await openEditor(page, 375)
  await page.getByRole('tab', { name: 'Checks' }).click()

  // The default label is compliant, so every finding is a pass and the passes are
  // collapsed — "18 checks passed" is reassuring and takes one line. Opening them
  // is what a reader does to get at one, and a pass carries an `elementId` just
  // as a violation does, so it is the same link.
  await page.locator(`${CHECKS} summary`).click()

  const finding = page.locator(`${CHECKS} button`).first()
  await expect(finding).toBeVisible()
  await finding.click()

  await expect(page.locator(PREVIEW), 'the canvas must come into view').toBeVisible()
  await expect(page.locator('svg[role="img"]').first()).toBeVisible()
})

test('the masthead fits the narrowest screen rather than clipping', async ({ page }) => {
  // Found by looking at a screenshot: at 375px the label-type select and the
  // export button did not fit on one line, and "Export PDF" was cut off at the
  // right edge of the window. Every assertion in this file passed while it was
  // happening, because a clipped button is still visible and still clickable by
  // its accessible name.
  await openEditor(page, 375)

  for (const name of [/Export PDF/, /Label type/]) {
    const control = page.getByRole(name === undefined ? 'button' : 'button', { name })
    if ((await control.count()) === 0) continue
    const box = await control.first().boundingBox()
    expect(box, 'the control must be laid out').not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width, `${name} runs off the right edge`).toBeLessThanOrEqual(375)
  }
})

test('each pane scrolls on its own at every width', async ({ page }) => {
  // The `h-screen` / `min-h-0` / `overflow-y-auto` contract. If a pane grows the
  // page instead of scrolling inside itself, the editor's header leaves the
  // screen and the canvas goes with it.
  for (const width of [375, 1440]) {
    await openEditor(page, width)
    if (width < 1024) await page.getByRole('tab', { name: 'Form' }).click()

    const pageGrew = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 1,
    )
    expect(pageGrew, `the page must not scroll as a whole at ${width}px`).toBe(false)
  }
})

/**
 * What the collapse owes assistive technology.
 *
 * Every one of these was measured in a browser before it was written, because
 * none of them is visible to jsdom and two of them are invisible to a sighted
 * check as well: a live region inside a `display: none` pane still reads as
 * present, and a tab panel with no tab still renders.
 */
test.describe('the collapse and assistive technology', () => {
  test('keeps exactly one live region perceivable at each width', async ({ page }) => {
    // The findings rail carries the application's only `aria-live` region, and
    // below `lg` that rail is `display: none` unless Checks is on screen — so a
    // screen-reader user got no compliance announcements at all on a narrow
    // window. Measured: one region in the document, zero client rects.
    const perceivable = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('[aria-live]')].filter(
            (el) => (el as HTMLElement).checkVisibility?.() ?? true,
          ).length,
      )

    await openEditor(page, 375)
    await expect(page.locator(PREVIEW)).toBeVisible()
    expect(await perceivable(), 'narrow: one region, and not the hidden one').toBe(1)

    await page.setViewportSize({ width: 1440, height: 900 })
    // Wait on the switcher, not on a pane. The panes change with the CSS the
    // moment the viewport does; the shell's live region is removed by a
    // `matchMedia` listener a tick later, so waiting for a pane races it.
    await expect(page.locator(SWITCHER)).toHaveCount(0)
    expect(await perceivable(), 'wide: the rail speaks for itself').toBe(1)
  })

  test('leaves no tab panel without a tab to own it', async ({ page }) => {
    // A role cannot be set by a media query, so hiding the tablist with
    // `lg:hidden` left three `tabpanel`s and no visible `tab` at 1440 — a promise
    // to assistive technology that nothing keeps.
    await openEditor(page, 1440)
    expect(await page.locator('[role="tab"]').count()).toBe(0)
    expect(await page.locator('[role="tabpanel"]').count()).toBe(0)

    await page.setViewportSize({ width: 375, height: 900 })
    await expect(page.locator(SWITCHER)).toBeVisible()
    expect(await page.locator('[role="tab"]').count()).toBe(3)
    expect(await page.locator('[role="tabpanel"]').count()).toBe(3)
  })

  test('does not drop focus when following a finding', async ({ page }) => {
    // Switching panes hides the button that was just activated, and a focused
    // element inside a `display: none` subtree is dropped by the browser —
    // measured as `document.activeElement` becoming BODY. Following the link and
    // landing nowhere is the same silent nothing the switch exists to prevent.
    await openEditor(page, 375)
    await page.getByRole('tab', { name: 'Checks' }).click()
    await page.locator(`${CHECKS} summary`).click()
    await page.locator(`${CHECKS} button`).first().focus()
    await page.keyboard.press('Enter')

    await expect(page.locator(PREVIEW)).toBeVisible()
    const focused = await page.evaluate(
      () => document.activeElement?.id ?? document.activeElement?.tagName,
    )
    expect(focused, 'focus must land on the pane that was opened').toBe('pane-preview')
  })

  test('moves between tabs with the arrow keys it promised', async ({ page }) => {
    // Having announced `role="tablist"`, it owes the keyboard contract: arrows
    // move, Home and End jump, and only the selected tab is in the tab order so
    // that Tab leaves the control rather than walking it.
    await openEditor(page, 375)
    await page.getByRole('tab', { name: 'Form' }).click()

    await page.keyboard.press('ArrowRight')
    await expect(page.locator(PREVIEW)).toBeVisible()
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('tab-preview')

    await page.keyboard.press('End')
    await expect(page.locator(CHECKS)).toBeVisible()
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('tab-checks')

    await page.keyboard.press('Home')
    await expect(page.locator(FORM)).toBeVisible()

    const tabindexes = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')].map((el) => el.getAttribute('tabindex')),
    )
    expect(
      tabindexes.filter((value) => value === '0'),
      'one tab stop, not three',
    ).toHaveLength(1)
  })
})
