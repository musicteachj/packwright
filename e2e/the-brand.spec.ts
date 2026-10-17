import { expect, test } from '@playwright/test'

/**
 * The mark is drawn, and every icon the page names is served.
 *
 * Asserted against the built server rather than in jsdom because the failures are all at the seams a unit test
 * cannot see: a file left out of `apps/web/public/`, a `<link>` naming a path the build does not have (which the
 * server answers 404, not with the page), and the favicon's theme switch, which Claude Design's own export
 * described and did not contain (`docs/design/logo/README.md`).
 */

test('every icon and manifest the page links to is served, as what it claims to be', async ({
  page,
  request,
}) => {
  await page.goto('/')
  const links = await page
    .locator('head link[rel="icon"], head link[rel="apple-touch-icon"], head link[rel="manifest"]')
    .evaluateAll((elements) => elements.map((el) => el.getAttribute('href')!))
  expect(links.sort()).toEqual(
    ['/apple-touch-icon.png', '/favicon.svg', '/icon-32.png', '/site.webmanifest'].sort(),
  )

  // The raster icon first and the SVG last: a browser that can draw an SVG icon takes the last one it can use,
  // and the SVG is the one that switches ink with the theme.
  const icons = await page
    .locator('head link[rel="icon"]')
    .evaluateAll((elements) => elements.map((el) => el.getAttribute('href')))
  expect(icons).toEqual(['/icon-32.png', '/favicon.svg'])

  const expected: Record<string, RegExp> = {
    '/favicon.svg': /^image\/svg\+xml/,
    '/icon-32.png': /^image\/png/,
    '/apple-touch-icon.png': /^image\/png/,
    '/site.webmanifest': /^application\/manifest\+json/,
  }
  for (const href of links) {
    const response = await request.get(href)
    expect(response.status(), href).toBe(200)
    expect(response.headers()['content-type'], href).toMatch(expected[href]!)
  }

  // The manifest's own icons, which no `<link>` names. And the share image, which Phase 8 points at.
  const manifest = (await (await request.get('/site.webmanifest')).json()) as {
    icons: { src: string }[]
  }
  for (const src of [...manifest.icons.map((icon) => icon.src), '/og-image.png']) {
    const response = await request.get(src)
    expect(response.status(), src).toBe(200)
    expect(response.headers()['content-type'], src).toMatch(/^image\/png/)
  }
})

test('the favicon changes ink with the browser theme, so it shows on a dark tab bar', async ({
  request,
}) => {
  const svg = await (await request.get('/favicon.svg')).text()
  expect(svg).toMatch(/path\{fill:#14120f\}/)
  expect(svg).toMatch(/@media \(prefers-color-scheme:dark\)\{path\{fill:#ebe7e0\}\}/)
})

for (const route of ['/', '/labels/new'] as const) {
  test(`${route} draws the mark beside the name, not the old glyph`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(route)
    const home = page.getByRole('link', { name: 'Packwright' }).first()
    const mark = home.locator('svg[data-brand-mark]')
    await expect(mark).toBeVisible()
    const box = await mark.boundingBox()
    expect(box).toEqual(expect.objectContaining({ width: 16, height: 16 }))
    await expect(home).not.toContainText('⊕')
  })
}
