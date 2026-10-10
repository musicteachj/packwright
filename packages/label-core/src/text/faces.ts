/**
 * The faces this project embeds, by the family names a layout uses.
 *
 * Moved here from `apps/api`'s PDF renderer, which still maps each name to its
 * TTF. The names had to leave that file: the label schema constrains a request's
 * `fontFamily` to this list, and the schema lives in `label-core` so that the
 * export routes and the MCP server refuse the same documents in the same words —
 * which it could not do while importing the list from a module that loads PDFKit
 * and Node.
 *
 * **The list is a security boundary as well as a fact.** PDFKit's
 * `document.font(name)` treats a name it does not recognise as a filesystem path,
 * so an unregistered family from a request body was an arbitrary local file read
 * — `fontFamily: 'Arial'` returned a 500 naming the working directory, and a real
 * path was opened. The schema admits these names and no others, and the renderer
 * falls back to the body face for anything else.
 *
 * Written out rather than derived from `FONT_METRICS`, because that table is
 * generated and a face measured is not thereby a face embedded;
 * `measure.test.ts` holds every name here to having metrics. The order is the
 * renderer's, and it is the order a refused request's error message lists the
 * options in.
 */
export const EMBEDDED_FONT_FAMILIES = [
  'IBM Plex Mono',
  'IBM Plex Mono SemiBold',
  'IBM Plex Sans',
  'IBM Plex Sans SemiBold',
] as const

export type EmbeddedFontFamily = (typeof EMBEDDED_FONT_FAMILIES)[number]
