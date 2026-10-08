import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `scripts` for the font-metrics generator's measurements, which the table every
    // line break reads is produced by.
    projects: ['packages/*', 'apps/*', 'scripts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    },
  },
})
