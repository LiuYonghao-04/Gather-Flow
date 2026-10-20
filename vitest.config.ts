import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./apps/miniapp/src', import.meta.url)) } },
  test: {
    include: [
      'apps/api/tests/**/*.test.ts',
      'apps/miniapp/tests/**/*.test.ts',
      'packages/shared/tests/**/*.test.ts',
    ],
    testTimeout: 15000,
  },
});
