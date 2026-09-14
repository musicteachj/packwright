import { expect, test } from '@playwright/test'

/**
 * Save a label, open it, export it — at the stock it was saved with.
 *
 * **This is the defect `docs/BACKLOG.md` said would become reachable here.** A
 * saved label holds `stock` beside `data`, while the export request takes them
 * flattened and defaults a missing `stock` to `DEFAULT_UPC_A_STOCK`. Handing an
 * export route the `data` of a saved label prints it at whatever the default
 * happens to be rather than at the size it was designed at — silently, and
 * invisible until somebody measures a printed sheet.
 *
 * Asserted end to end rather than in jsdom because the round trip crosses every
 * seam the defect could hide in: the store, the API client, the export request,
 * and PDFKit. The page box is the only place all four agree or do not.
 */

/** Deliberately not any `DEFAULT_*_STOCK`, so a default cannot pass for it. */
const SAVED_STOCK = { widthMm: 90, heightMm: 50, marginMm: 3 }

/** 90 mm in PostScript points, which is what a MediaBox is measured in. */
const EXPECTED_WIDTH_PT = (90 / 25.4) * 72

test('exports a saved label at the stock it was saved with', async ({ page, request }) => {
  const created = await request.post('/api/labels', {
    data: {
      name: 'Round trip',
      labelType: 'gs1-retail',
      stock: SAVED_STOCK,
      data: { gtin: '036000291452' },
    },
  })
  expect(created.status(), 'the premise: the label has to save').toBe(201)
  const { id } = (await created.json()) as { id: string }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/labels/${id}`)

  // The editor has to have opened *this* label, not a fresh document. Its own
  // dimension readout is derived from the resolved layout, so it is the page
  // saying which stock it is drawing rather than which one it was handed.
  await expect(page.getByText('90.00 mm × 50.00 mm').first()).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /export/i }).click()
  const stream = await (await download).createReadStream()
  const pdf = (await new Response(stream as never).arrayBuffer()).slice(0)

  const source = Buffer.from(pdf).toString('latin1')
  const mediaBox = source.match(/\/MediaBox\s*\[([^\]]+)\]/)?.[1] ?? ''
  const width = Number(mediaBox.trim().split(/\s+/)[2])

  expect(width, `MediaBox was [${mediaBox}]`).toBeCloseTo(EXPECTED_WIDTH_PT, 1)
})
