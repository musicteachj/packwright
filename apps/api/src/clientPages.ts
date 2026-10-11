/**
 * Which addresses are the client's pages, read from the client build itself.
 *
 * The server hands the client's `index.html` to a browser asking for a page, and
 * answered 200 to every address it did not reserve — so `/labels/abc/edit`, which
 * no route matches, came back 200 and the page itself said there was nothing
 * there. Anything reading the status rather than the page — a crawler, a link
 * checker, an uptime monitor — took a mistyped address for a working one.
 *
 * The list is the client's: `apps/web/src/router/pages.ts`, held to the router by
 * its own test and written into the build as `routes.json` beside `index.html`.
 * Read from there rather than copied here, so a page added to the client reaches
 * the server with the build that serves it.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The file the client build writes its page addresses to. Mirrors `PAGE_PATHS_FILE`. */
export const PAGE_PATHS_FILE = 'routes.json'

/**
 * Whether a path is one of the client's pages, by the router's own reading: a
 * `:name` segment matches any one non-empty segment, *one* trailing slash is
 * ignored, and case is ignored — Vue Router's defaults, which `createAppRouter`
 * keeps, so `/Rules` loads the rules page and must not be answered 404. Any other
 * empty segment is a segment: the router sends `//rules` and `/rules//` to its
 * not-found page, so they are not pages here either.
 */
export function matchesClientPage(path: string, pages: readonly string[]): boolean {
  const segments = (address: string) => {
    const trimmed = address.length > 1 && address.endsWith('/') ? address.slice(0, -1) : address
    return trimmed.slice(1).split('/')
  }
  const asked = segments(path)
  return pages.some((page) => {
    const pattern = segments(page)
    return (
      pattern.length === asked.length &&
      pattern.every((segment, index) =>
        segment.startsWith(':')
          ? asked[index] !== ''
          : segment.toLowerCase() === asked[index]?.toLowerCase(),
      )
    )
  })
}

/**
 * The client build's page addresses, or a refusal to start without them.
 *
 * Refused rather than defaulted: a client build with no `routes.json` is the
 * deployment being wrong — a build from before this file existed, or one copied
 * in part — and the alternatives are both silent. Treating every address as a
 * page is the defect this module exists to end; treating none as one would answer
 * every page 404.
 */
export function loadClientPages(webRoot: string): readonly string[] {
  const file = join(webRoot, PAGE_PATHS_FILE)
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(
      `The client build at ${webRoot} has no readable ${PAGE_PATHS_FILE}, so the server cannot ` +
        'tell its pages from addresses that are not. It is most likely a build from before the ' +
        'file existed: rebuild it with `npm run build --workspace @packwright/web`, or delete it ' +
        'to serve the API alone.',
      { cause: error },
    )
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    !parsed.every((page) => typeof page === 'string' && page.startsWith('/'))
  ) {
    throw new Error(
      `${file} is not a list of page addresses beginning with "/". Rebuild the client.`,
    )
  }
  return parsed as string[]
}
