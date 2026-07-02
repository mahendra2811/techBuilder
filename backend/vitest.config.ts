import { defineConfig } from 'vitest/config';

/** Unit tests only (pure modules — no DB). Integration lives in vitest.integration.config.ts. */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
