# IBM Plex

Vendored from IBM's own releases, under the SIL Open Font License 1.1 (see `LICENSE.txt`).

Four faces — regular and semibold in Sans and Mono. Two formats, for two consumers:

- `woff2/` — the browser, via `@font-face` in `apps/web/src/assets/main.css`
- `ttf/` — the PDF export, registered with PDFKit in `apps/api/src/labels/renderPdf.ts`

Both paths draw from these files rather than from separate copies. That matters more than it
looks: type is geometry, and a different face means different advance widths. Before this the
export substituted Courier, so "preview == print" was true of the bars and not quite true of the
human-readable digits.

Deliberately outside `packages/`, which is an npm workspace glob — these are shared assets, not a
package.
