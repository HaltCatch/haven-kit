import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@haven\/schema\/editing$/,
        replacement: fileURLToPath(
          new URL('./packages/schema/src/editing/index.ts', import.meta.url),
        ),
      },
      {
        find: /^@haven\/runtime\/editing$/,
        replacement: fileURLToPath(
          new URL('./packages/runtime/src/editing/index.ts', import.meta.url),
        ),
      },
      {
        find: /^@haven\/schema\/localization$/,
        replacement: fileURLToPath(
          new URL('./packages/schema/src/localization.ts', import.meta.url),
        ),
      },
      {
        find: /^@haven\/schema$/,
        replacement: fileURLToPath(new URL('./packages/schema/src/index.ts', import.meta.url)),
      },
      {
        find: /^@haven\/runtime$/,
        replacement: fileURLToPath(new URL('./packages/runtime/src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: { statements: 80, branches: 70, functions: 75, lines: 80 },
      include: ['packages/schema/src/**/*.ts', 'packages/runtime/src/**/*.ts'],
      exclude: ['**/generated/**'],
    },
  },
});
