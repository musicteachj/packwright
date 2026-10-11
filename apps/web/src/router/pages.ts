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

/** The file the build writes `PAGE_PATHS` to, beside `index.html`. */
export const PAGE_PATHS_FILE = 'routes.json'
