import { defineConfig } from 'vitest/config';

/**
 * Test files that spawn a repo script under tsx (runScript / runRepoScript / runFixtureCli /
 * buildFixtureSnapshot / buildFixturePlayerStats from tests/support/cli.ts). They are the slow,
 * process-bound files, kept in their own project so `vitest run --project spawn` runs just them.
 */
const SPAWN = [
  'tests/fetch-data.test.ts',
  'tests/fetch-scope.test.ts',
  'tests/history.test.ts',
  'tests/jv.test.ts',
  'tests/maxpreps-leagues.test.ts',
  'tests/note-stats.test.ts',
  'tests/official-files.test.ts',
  'tests/pipeline/eal.test.ts',
  'tests/pipeline/end-to-end.test.ts',
  'tests/pipeline/socal.test.ts',
  'tests/player-stats-file.test.ts',
  'tests/rosters-enrichment.test.ts',
  'tests/rosters-file.test.ts',
  'tests/ui/player-stats-view.test.ts',
];

export default defineConfig({
  // '@/' imports: Vite 8's native tsconfig.json `paths` resolver (README, "Local development").
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    // The end-to-end test shells out to tsx scripts/fetch-data.ts against the offline fixtures.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Builds the corpus snapshots once per run and provides their paths to every test file.
    globalSetup: ['tests/support/global-setup.ts'],
    projects: [
      // The architecture rules: source-tree scans and the workflow-file checks (the latter spawns two CI scripts).
      { extends: true, test: { name: 'arch', include: ['tests/arch/**/*.test.ts'] } },
      { extends: true, test: { name: 'spawn', include: SPAWN } },
      // Everything else.
      { extends: true, test: { name: 'unit', include: ['tests/**/*.test.ts'], exclude: ['tests/arch/**', ...SPAWN] } },
    ],
  },
});
