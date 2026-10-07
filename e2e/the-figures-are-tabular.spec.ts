import { expect, test, type Locator } from '@playwright/test'

/**
 * The class is present; does it style anything?
 *
 * That question is the whole reason this file exists. `LabelsView` carried
 * `text-danger-300` for a phase and Tailwind generated no rule for it, because
 * `main.css` declares a flat `--color-danger` and no scale — and the test that
 * touched it selected on the class name, which is present whether or not it
 * styles anything. jsdom applies no stylesheet, so a unit test cannot tell the
 * two apart at all.
 *
 * `numeric` is three declarations, and the hand-rolled spelling it replaces was
 * two of them: `font-mono tabular-nums` has no `font-feature-settings: 'tnum' 1`,
 * which is the one that fixes the advance width. A figure without it moves under
 * the reader on every keystroke, by a fraction of a character, which is exactly
 * the kind of thing nobody reports and nobody can un-see.
 */

/** What `@utility numeric` declares in `main.css`. All three, or it is not the utility. */
async function expectNumeric(target: Locator, what: string) {
  const style = await target.evaluate((element) => {
    const computed = getComputedStyle(element)
    return {
      fontFamily: computed.fontFamily,
      fontVariantNumeric: computed.fontVariantNumeric,
      fontFeatureSettings: computed.fontFeatureSettings,
    }
  })

  expect(style.fontFamily, `${what} must be set in the mono face`).toContain('IBM Plex Mono')
  expect(style.fontVariantNumeric, `${what} must use tabular figures`).toContain('tabular-nums')
  expect(style.fontFeatureSettings, `${what} must fix the advance width`).toContain('tnum')
}

test('the canvas dimension callout is drawn in the numeric face', async ({ page }) => {
  await page.goto('/labels/new')

  // A retail label, because the callout annotates `layout.symbols` and a food
  // label carries no barcode to annotate.
  await page.getByLabel('Dimensions').check()

  // The overlay SVG, not the label. The label's own `<text>` comes from
  // `toSVG` and takes its family from the layout primitive, which is a
  // different mechanism with its own test in `fontFamilies.test.ts`.
  const callout = page.locator('#pane-preview svg[aria-hidden="true"] text').first()
  await expect(callout).toBeAttached()
  await expectNumeric(callout, 'the dimension callout')
})

test('a declined check states its citation in the numeric face', async ({ page }) => {
  await page.goto('/labels/new')
  await page.locator('#field-label-type').selectOption('us-food')

  // The starting food document states no reference amount, so the two
  // dual-column provisions decline rather than run — which is the block this
  // citation sits in.
  const heading = page.getByRole('heading', { name: 'Checks that did not run' })
  await expect(heading).toBeVisible()

  /*
   * Found by the `aria-labelledby` the block actually carries, not by
   * `filter({ has: heading })`. That form matched **two** sections — the
   * declined block and the whole rail, which encloses it — so `p` collected
   * five paragraphs across both and `nth(1)` landed on the count strip, which
   * has carried `numeric` since the previous stage. The assertion passed while
   * the citation was still hand-rolled, and only the mutation test said so.
   */
  const labelledBy = await heading.getAttribute('id')
  expect(labelledBy, 'the declined heading must have an id to be pointed at').toBeTruthy()
  const block = page.locator(`section[aria-labelledby="${labelledBy}"]`)
  await expect(block).toHaveCount(1)

  // Scoped to one entry, not to the block. Counting the block's paragraphs
  // instead would pin this typography test to how many rules happen to decline
  // on the starting food document — one today — and the day a second one did,
  // `nth(1)` would quietly become a reason rather than a citation.
  const entry = block.locator('div').first()
  const paragraphs = entry.locator('p')
  await expect(paragraphs, 'a declined check: its reason, then its citation').toHaveCount(2)

  const citation = paragraphs.nth(1)
  await expect(citation).toBeVisible()
  await expectNumeric(citation, "a declined check's citation")
})
