import { expect, test, type Page } from '@playwright/test'

/**
 * A label opens out loud.
 *
 * A screen reader announces a *change* to a live region it is already
 * observing; a region created with its text already in it usually says
 * nothing. So the claim is not that a region exists while a saved label is
 * being fetched — the first version of the editor's wait satisfied that and
 * still went silent — but that the region speaking during the wait is the very
 * node that speaks after it, with different words.
 *
 * The unit tests prove the same node in jsdom. This proves it in the shipped
 * build, where the region is the announcer `App.vue` mounts at the root and the
 * route actually changes beneath it — at a width where the findings rail is
 * `display: none`, and one where it is on screen.
 */

const SAVED = {
  id: 'abc123',
  name: 'Granola 340g',
  labelType: 'gs1-retail',
  stock: { widthMm: 90, heightMm: 50, marginMm: 3 },
  data: { gtin: '012000161155' },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
}

/** Holds the read for `/labels/abc123` open until the returned function is called. */
async function holdTheRead(page: Page) {
  let release: () => void = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/labels/abc123', async (route) => {
    await released
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SAVED),
    })
  })
  return release
}

/** What every perceivable live region is saying. Never throws, so it can be polled. */
const whatIsHeard = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[aria-live]')]
      .filter((el) => (el as HTMLElement).checkVisibility?.() ?? true)
      .map((el) => el.textContent?.trim() ?? ''),
  )

/** The one live region a reader could be hearing, as a handle that survives re-renders. */
const theRegionSpeaking = (page: Page) =>
  page.evaluateHandle(() => {
    const speaking = [...document.querySelectorAll('[aria-live]')].filter(
      (el) => (el as HTMLElement).checkVisibility?.() ?? true,
    )
    if (speaking.length !== 1) throw new Error(`${speaking.length} live regions are perceivable`)
    return speaking[0]!
  })

for (const width of [375, 1440] as const) {
  test(`the region that says the wait is the one that says the result, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const release = await holdTheRead(page)
    await page.goto('/labels/abc123')

    // Through the perceivable regions, not `[aria-live]` with the text. When
    // this spec was written two nodes carried these words below `lg` — the
    // editor's own region and the rail's, inside a pane that was `display: none`
    // — and a first draft counted both. The rail has no region now, but the
    // invariant was always about what can be heard, so that is what is read.
    // Polled through a reader that cannot throw: before the first render there
    // are no regions at all, and a helper that throws on "not exactly one" ends
    // a poll on its first attempt rather than retrying.
    await expect.poll(() => whatIsHeard(page)).toEqual(['Opening this label…'])
    const region = await theRegionSpeaking(page)

    release()
    await expect
      .poll(() => region.evaluate((el) => el.textContent))
      .not.toContain('Opening this label')

    const after = await region.evaluate((el) => ({
      connected: el.isConnected,
      perceivable: (el as HTMLElement).checkVisibility?.() ?? true,
      text: el.textContent ?? '',
    }))
    expect(after.connected, 'the same node, still in the document').toBe(true)
    expect(after.perceivable, 'and still the one a reader hears').toBe(true)
    expect(after.text, 'saying what the opened label found').toContain('checks passed')

    const now = await theRegionSpeaking(page)
    expect(
      await page.evaluate(([a, b]) => a === b, [region, now] as const),
      'no second region has taken its place',
    ).toBe(true)
  })
}
