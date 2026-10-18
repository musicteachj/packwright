/**
 * Labels a spec saved, deleted once the test is over.
 *
 * Playwright reuses a server already listening on the port (`reuseExistingServer`
 * outside CI), database and all. A spec that leaves its labels behind costs
 * nothing on a fresh server and fills a long-lived one by about three a run, and
 * the application keeps at most 200, so in the end every save in the suite would
 * answer 409 and the specs fail on a premise rather than on anything they test.
 * Found by review when the cap arrived.
 *
 * A label can be deleted only with the edit token its creator was handed
 * (`docs/security-review-2026-10-18.md`, finding 4), so each label is recorded
 * with its token, and a cleanup the server refuses fails the test rather than
 * leaving the label behind in silence.
 *
 * Registered per file and run after each test, failed ones included, so a test
 * that stops halfway still gives back what it saved.
 */
import { expect, test, type Page } from '@playwright/test'

/** Where the editor keeps the labels this browser saved. See `apps/web/src/api/heldLabels.ts`. */
export const HELD_LABELS_STORAGE = 'packwright.savedLabels'

export function deletesWhatItSaves(): (id: string, editToken: string) => void {
  const saved: { id: string; editToken: string }[] = []
  test.afterEach(async ({ request }) => {
    for (const { id, editToken } of saved.splice(0)) {
      const response = await request.delete(`/api/labels/${id}`, {
        headers: { 'X-Edit-Token': editToken },
      })
      // 404 is a label the test deleted itself.
      expect([204, 404], `cleaning up label ${id}`).toContain(response.status())
    }
  })
  return (id, editToken) => {
    saved.push({ id, editToken })
  }
}

/** The id the editor's URL names once a save has attached it, as `/labels/:id`. */
export const savedIdFrom = (url: string): string => {
  const id = /\/labels\/([0-9a-f]{24})$/.exec(new URL(url).pathname)?.[1]
  if (id === undefined) throw new Error(`No saved label in ${url}`)
  return id
}

/** The label the editor has just saved, with the token this browser kept for it. */
export async function savedFrom(page: Page): Promise<{ id: string; editToken: string }> {
  const id = savedIdFrom(page.url())
  const held = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? '[]') as { id: string; editToken: string }[],
    HELD_LABELS_STORAGE,
  )
  const editToken = held.find((label) => label.id === id)?.editToken
  if (editToken === undefined) throw new Error(`This browser holds no token for label ${id}`)
  return { id, editToken }
}

/**
 * Makes this page's browser hold a label created through the API, as though it
 * had saved it there itself. Needs a page already on the application's origin.
 */
export const holdInBrowser = (page: Page, label: { id: string; editToken: string }) =>
  page.evaluate(([key, held]) => localStorage.setItem(key, JSON.stringify([held])), [
    HELD_LABELS_STORAGE,
    label,
  ] as const)
