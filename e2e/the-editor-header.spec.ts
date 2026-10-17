import { expect, test, type Page } from '@playwright/test'

/**
 * The editor header's controls are one height and sit on one line.
 *
 * Each used to bring its own padding inside groups aligned by baseline, so the type select, the name
 * box, Save and Export had four different heights and no shared top or bottom edge. Found by eye, not
 * by any test: jsdom has no layout, so this can only be measured here.
 */

const CONTROLS = {
  type: '#field-label-type',
  name: '#field-label-name',
  save: '[data-save]',
  export: 'button:has-text("Export PDF")',
} as const

const boxes = async (page: Page) => {
  const out: Record<string, { top: number; height: number; middle: number }> = {}
  for (const [key, selector] of Object.entries(CONTROLS)) {
    const box = await page.locator(`main#main > header ${selector}`).boundingBox()
    expect(box, `${key} must be laid out`).not.toBeNull()
    out[key] = { top: box!.y, height: box!.height, middle: box!.y + box!.height / 2 }
  }
  return out
}

for (const width of [375, 1440] as const) {
  test(`every header control is the same height at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/labels/new')
    await expect(page.locator('form[aria-label="Label details"]')).toBeAttached()

    const measured = await boxes(page)
    const heights = Object.values(measured).map((b) => b.height)
    expect(
      Math.max(...heights) - Math.min(...heights),
      `heights were ${JSON.stringify(measured)}`,
    ).toBeLessThanOrEqual(0.5)

    // The name box, Save and Export share a row at every width; the type select joins them when the
    // header fits on one line.
    const row =
      width >= 1024 ? Object.values(measured) : [measured.name!, measured.save!, measured.export!]
    const middles = row.map((b) => b.middle)
    expect(
      Math.max(...middles) - Math.min(...middles),
      `centers were ${JSON.stringify(measured)}`,
    ).toBeLessThanOrEqual(1)
  })
}
