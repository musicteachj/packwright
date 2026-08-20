import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'label-core',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
