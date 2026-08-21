import { defineConfig } from 'tsup'

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
  publicDir: '../../assets/fonts/ttf',
})
