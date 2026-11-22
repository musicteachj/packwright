import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { PAGE_PATHS_FILE, pagePaths } from './src/router/pages'

/**
 * Where the `.env` files are read from, for the client and for `writePagePaths`
 * alike. Named here rather than left to default to the working directory, so the
 * two cannot read different files.
 */
const ENV_DIR = fileURLToPath(new URL('.', import.meta.url))

/**
 * Writes the client's page addresses into the build, beside `index.html`.
 *
 * The API serves this build and answers any address that is not a page with a
 * 404; it learns which addresses are pages from this file rather than from a
 * copy of the list, so the router, its test and the server read one table. See
 * `src/router/pages.ts`. A build without the design catalog leaves `/design` out
 * of it, as its router does (`src/designCatalog.ts`).
 */
function writePagePaths(designCatalog: boolean): Plugin {
  return {
    name: 'packwright-page-paths',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: PAGE_PATHS_FILE,
        source: `${JSON.stringify(pagePaths(designCatalog))}\n`,
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  // `loadEnv` reads the `.env` files and the `VITE_` variables of the process that
  // fill the client's `import.meta.env`, so `routes.json` and `DESIGN_CATALOG` read
  // one source. A bare `process.env` would miss `VITE_DESIGN_CATALOG=true` in an
  // `.env` file, and the server would 404 a page the client routes.
  envDir: ENV_DIR,
  plugins: [
    vue(),
    tailwindcss(),
    writePagePaths(loadEnv(mode, ENV_DIR, 'VITE_').VITE_DESIGN_CATALOG === 'true'),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // In development the client and API run as separate processes; in
    // production the API serves this build as static files from one container.
    // Proxying keeps the origin identical across both, so nothing has to know
    // which mode it is in.
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
}))
