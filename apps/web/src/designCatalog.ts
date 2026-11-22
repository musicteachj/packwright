/**
 * Whether this build has the design catalog at `/design`.
 *
 * The catalog is a workbench for the interface's own components, not a page for
 * a visitor, so a production build leaves it out unless it is built with
 * `VITE_DESIGN_CATALOG=true`: the router does not register it, the masthead does
 * not link to it, and the build's page list (`routes.json`, written in
 * `vite.config.ts` from the same variable through Vite's `loadEnv`) does not name
 * it, so the server answers it with a 404 as the client does. The dev server and
 * the tests always have it.
 *
 * The browser specs build with the flag, because the catalog's own specs need it.
 */
export const DESIGN_CATALOG: boolean =
  import.meta.env.DEV || import.meta.env.VITE_DESIGN_CATALOG === 'true'
