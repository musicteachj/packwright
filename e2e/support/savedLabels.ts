/**
 * Labels a spec saved, deleted once the test is over.
 *
 * The API keeps at most twenty labels, and Playwright reuses a server already
 * listening on the port (`reuseExistingServer` outside CI) — database and all. A
 * spec that leaves its labels behind costs nothing on a fresh server and fills
 * a long-lived one by about three a run, until every save in the suite answers
 * 409 and the specs fail on a premise rather than on anything they test. Found
 * by review when the cap arrived.
 *
 * Registered per file and run after each test, failed ones included, so a test
 * that stops halfway still gives back what it saved.
 */
import { test } from '@playwright/test'

export function deletesWhatItSaves(): (id: string) => void {
  const saved: string[] = []
  test.afterEach(async ({ request }) => {
    for (const id of saved.splice(0)) await request.delete(`/api/labels/${id}`)
  })
  return (id) => {
    saved.push(id)
  }
}

/** The id the editor's URL names once a save has attached it, as `/labels/:id`. */
export const savedIdFrom = (url: string): string => {
  const id = /\/labels\/([0-9a-f]{24})$/.exec(new URL(url).pathname)?.[1]
  if (id === undefined) throw new Error(`No saved label in ${url}`)
  return id
}
