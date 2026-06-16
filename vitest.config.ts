import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['dist/**', '**/*.test.ts', '**/*.spec.ts', 'vitest.config.ts', 'tsup.config.ts'],
    },
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
})
