import { defineConfig, type Plugin } from 'vitest/config'

// Vite v5 doesn't recognise node:sqlite (added in Node 22.5) and can't load it.
// We resolve it to a virtual module that re-exports the native binding via CJS require,
// bypassing Vite's ESM transform pipeline.
const VIRTUAL_SQLITE = '\0virtual:node-sqlite'

const nodeSqlitePlugin: Plugin = {
  name: 'node-sqlite-shim',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'sqlite' || id === 'node:sqlite') {
      return VIRTUAL_SQLITE
    }
  },
  load(id) {
    if (id === VIRTUAL_SQLITE) {
      return `
import { createRequire } from 'node:module';
const _req = createRequire(import.meta.url);
const _sqlite = _req('node:sqlite');
export const DatabaseSync = _sqlite.DatabaseSync;
export const StatementSync = _sqlite.StatementSync;
export default _sqlite;
`
    }
  },
}

export default defineConfig({
  plugins: [nodeSqlitePlugin],
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['dist/**', '**/*.test.ts', '**/*.spec.ts', 'vitest.config.ts', 'tsup.config.ts'],
    },
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
})
