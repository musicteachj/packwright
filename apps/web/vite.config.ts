import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'
import { PAGE_PATHS, PAGE_PATHS_FILE } from './src/router/pages'

/**
 * Writes the client's page addresses into the build, beside `index.html`.
 *
 * The API serves this build and answers any address that is not a page with a
 * 404; it learns which addresses are pages from this file rather than from a
 * copy of the list, so the router, its test and the server read one table. See
 * `src/router/pages.ts`.
 */
function pagePaths(): Plugin {
  return {
    name: 'packwright-page-paths',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: PAGE_PATHS_FILE,
        source: `${JSON.stringify(PAGE_PATHS)}\n`,
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), pagePaths()],
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
})
