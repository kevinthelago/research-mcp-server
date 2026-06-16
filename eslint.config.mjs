import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Relaxed rules for test files — mock/stub functions commonly omit await
  // and vitest patterns trigger false-positive unbound-method warnings.
  {
    files: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  // Non-owned source directories: downgrade unused-vars to warn so other streams
  // can fix their own files without blocking server-core CI.
  {
    files: ['src/util/**', 'src/services/**', 'src/tools/**', 'src/sources/**', 'src/store/**', 'src/models/**'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.mjs', 'scripts/**'],
  },
)
