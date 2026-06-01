import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: [
      'e2e/**',
      '.next/**',
      'node_modules/**',
      'spikes/**/node_modules/**',
      'coverage/**',
    ],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      exclude: [
        'lib/db.ts',
        'lib/paths.ts',
        'lib/migrate.ts',
        'lib/logger.ts',
        'lib/openrouter.ts',
        'lib/vault.ts',
        'lib/memory-service.ts',
        'lib/notes-service.ts',
        'lib/render-service.ts',
        'lib/settings.ts',
        'lib/config.ts',
      ],
      thresholds: {
        global: { lines: 55, functions: 55, branches: 45 },
        'lib/source-index.ts': { lines: 80, functions: 80, branches: 70 },
        'lib/format-utils.ts': { lines: 90, functions: 90 },
        'lib/relative-time.ts': { lines: 80, functions: 80 },
      },
    },
  },
});
