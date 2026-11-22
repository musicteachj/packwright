/**
 * Every address the client answers with a page, as the server needs to know them.
 *
 * Plain data and no Vue, because three things read it: the router's own test,
 * which holds this list to the routes the router actually registers; the Vite
 * build, which writes it into the bundle as `routes.json`; and the API, which
 * reads that file from the client build it serves. The server answers any other
 * address with the client's own "page not found" and a 404 status — where it
 * used to answer every address 200 and leave the page to say there was nothing
 * there, so a mistyped link looked like a working page to anything that read the
 * status: a crawler, a link checker, a monitor.
 *
 * A `:name` segment matches any one segment, as the router's own parameter does.
 * `/labels/:id` therefore still answers 200 for an id no label has: whether one
 * exists is the database's to say, and the editor says it.
 */
export const PAGE_PATHS = [
  '/',
  '/labels',
  '/labels/new',
  '/labels/:id',
  '/audit',
  '/rules',
  '/design',
] as const

/** The design catalog's address, which a build without the catalog leaves out. */
export const DESIGN_PATH = '/design'

/**
 * The pages a build answers: every one, or every one but the design catalog when
 * the build has none (`designCatalog.ts`). This, not `PAGE_PATHS`, is what the
 * build writes, so the server 404s `/design` exactly when the router does.
 */
export function pagePaths(designCatalog: boolean): readonly string[] {
  return designCatalog ? PAGE_PATHS : PAGE_PATHS.filter((path) => path !== DESIGN_PATH)
}

/** The file the build writes `pagePaths(...)` to, beside `index.html`. */
export const PAGE_PATHS_FILE = 'routes.json'
