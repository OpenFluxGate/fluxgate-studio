import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Vitest runs the server-side units of the console - today the BFF proxy route handler, which is the
 * only place where a browser request is turned into an Admin API request.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
