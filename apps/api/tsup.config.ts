import { cpSync, existsSync } from 'node:fs'
import { defineConfig } from 'tsup'

/** `apps/web`'s build output, and where it has to land inside this bundle. */
const WEB_DIST = '../web/dist'
const BUNDLED_CLIENT = 'dist/public'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  clean: true,
  sourcemap: true,
  // label-core is a source-only workspace package, so bundle it in rather than
  // maintaining a second compile step and a dist/ to keep in sync. This is also
  // what keeps production a single container: one bundled server artifact.
  noExternal: ['@packwright/label-core'],
  // The PDF export embeds IBM Plex, so the font files have to travel with the
  // bundle. Without this a dist-only container has a server that starts fine and
  // fails on the first export — which is exactly what happened before the
  // resolver in renderPdf.ts was corrected.
  //
  // `publicDir` takes one path and this is it, which is why the client is copied
  // in `onSuccess` below rather than declared here alongside the fonts.
  publicDir: '../../assets/fonts/ttf',

  /**
   * Copies the built client into the bundle, so `dist/` is the whole artifact.
   *
   * It has to run here rather than before the build: `clean: true` empties
   * `dist/` when tsup starts, so a client copied in earlier would be deleted by
   * the very next build. And it copies rather than resolving `../../web/dist` at
   * runtime, because a path reaching across the repository works from a checkout
   * and finds nothing in a container that ships `dist/` alone — the assumption
   * phase 8 rests on, checked now while checking it is free.
   */
  onSuccess: async () => {
    if (!existsSync(WEB_DIST)) {
      // Not an error. `npm run build` at the root builds the client first, but
      // building this workspace alone is a reasonable thing to do while working
      // on the API, and the server serves JSON perfectly well without a client.
      console.log('tsup: no client build at ../web/dist — API-only bundle')
      return
    }
    cpSync(WEB_DIST, BUNDLED_CLIENT, { recursive: true })
    console.log(`tsup: copied the client into ${BUNDLED_CLIENT}`)
  },
})
