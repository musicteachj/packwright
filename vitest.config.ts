import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `scripts` for the font-metrics generator's measurements, which the table every
    // line break reads is produced by; `deploy` for the ECS files and the deploy script.
    projects: ['packages/*', 'apps/*', 'scripts', 'deploy'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    },
  },
})
