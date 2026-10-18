import { defineConfig } from 'vitest/config';

export default defineConfig({
  // '@/' imports: Vite 8's native tsconfig.json `paths` resolver (README, "Local development").
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The end-to-end test shells out to tsx scripts/fetch-data.ts against the offline fixtures.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
