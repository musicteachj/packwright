import { glyphHeightMm } from '@packwright/label-core'
import { expect, test, type Page } from '@playwright/test'

/**
 * The canvas's apparatus — what it draws and offers around the label, rather
 * than the label itself — measured where jsdom cannot see.
 *
 * Both of these were found by screenshotting the preview and looking at it,
 * which is the method that found every finding that mattered in the interface
 * phase. Neither had a test, because every existing assertion about the callout
 * was about its text or its typeface, and every one about the toggles was about
 * whether they toggled.
 */

const openRetail = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/labels/new')
  await expect(page.locator('#pane-preview svg[role="img"]')).toBeVisible()
}

test('the dimension callout does not sit on the barcode’s own digits', async ({ page }) => {
  // Measured before the fix: the figure's ink started at 33.39 mm and the
  // human-readable digits' ended at 33.85 mm, so it was set between `36000`
  // and `29145`. The rule was 2 mm below the symbol and the figure *above* it, and
  // an SVG `<text>`'s `y` is its baseline, so the glyphs reached back up into
  // the band the digits print in.
  //
  // **Asserted on ink, not on boxes.** A text element's box includes the
  // font's ascent above the capitals and its descent below the baseline, both
  // empty here — digits have no descenders — so comparing boxes demands room
  // the ink does not need. Both texts carry their baseline and size in the
  // label's own millimetres, and the engine measures Plex Mono's capital height
  // from the TTF, so the ink can be located exactly.
  await openRetail(page)
  await page.getByLabel('Dimensions').check()

  const texts = await page.evaluate(() => {
    const read = (el: Element) => ({
      family: getComputedStyle(el).fontFamily,
      baselineMm: Number(el.getAttribute('y')),
      fontSizeMm: Number(el.getAttribute('font-size')),
    })
    const label = document.querySelector('#pane-preview svg[role="img"]')!
    return {
      digits: [...label.querySelectorAll('text')].map(read),
      callout: read(document.querySelector('#pane-preview svg[aria-hidden="true"] text')!),
    }
  })

  expect(texts.digits.length, 'the label must print its digits for this to mean anything').toBe(4)
  for (const text of [...texts.digits, texts.callout]) {
    expect(text.family, 'cap height below is Plex Mono’s, so the face must be').toMatch(
      /IBM Plex Mono/,
    )
  }

  // Digits stand on their baseline and do not descend, so the lowest ink of
  // the printed digits is the lowest baseline among them.
  const digitsInkBottomMm = Math.max(...texts.digits.map((d) => d.baselineMm))
  const calloutInkTopMm =
    texts.callout.baselineMm -
    glyphHeightMm(texts.callout.fontSizeMm, 'IBM Plex Mono', 'cap-height')

  expect(
    calloutInkTopMm,
    `the figure's ink starts at ${calloutInkTopMm.toFixed(2)} mm; the digits' ink ends at ${digitsInkBottomMm.toFixed(2)} mm`,
  ).toBeGreaterThan(digitsInkBottomMm)
})

test('the overlay toggles are the component layer’s checkboxes, not bare inputs', async ({
  page,
}) => {
  // Measured before the fix: a 13×13 box in a 17px row with 0px between box
  // and word — the shape `CheckboxField` exists to end, on the two checkboxes
  // the stage 1 spec listed as closed by it and the migration, scoped to the
  // form rails, never reached.
  await openRetail(page)

  for (const name of ['Quiet zones', 'Dimensions']) {
    const geometry = await page.getByLabel(name).evaluate((input) => {
      const box = input.getBoundingClientRect()
      const row = input.closest('label')!.getBoundingClientRect()
      const word = input.closest('label')!.querySelector('span')!.getBoundingClientRect()
      return { box: box.width, row: row.height, gap: word.left - box.right }
    })
    expect(geometry.box, `${name}: the box`).toBeGreaterThanOrEqual(16)
    expect(geometry.row, `${name}: the row, against WCAG 2.2's 24px target`).toBeGreaterThanOrEqual(
      24,
    )
    expect(geometry.gap, `${name}: the gap between box and word`).toBeGreaterThanOrEqual(8)
  }
})
