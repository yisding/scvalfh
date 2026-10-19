import { defineConfig } from 'vitest/config';

/**
 * Test files that spawn a repo script under tsx (runScript / runRepoScript / runFixtureCli /
 * buildFixtureSnapshot / buildFixturePlayerStats from tests/support/cli.ts). They are the slow,
 * process-bound files, kept in their own project so `vitest run --project spawn` runs just them.
 * tests/arch/spawn-project.test.ts fails when this list and the files importing those helpers differ.
 */
const SPAWN = [
  'tests/data/official-files.test.ts',
  'tests/data/player-stats.test.ts',
  'tests/data/rosters-enrichment.test.ts',
  'tests/data/rosters.test.ts',
  'tests/integration/eal.test.ts',
  'tests/integration/end-to-end.test.ts',
  'tests/integration/socal.test.ts',
  'tests/lib/datasets/history.test.ts',
  'tests/lib/datasets/jv.test.ts',
  'tests/lib/engine/note-stats.test.ts',
  'tests/lib/pipeline/fetch-scope.test.ts',
  'tests/scripts/fetch-data.test.ts',
  'tests/scripts/maxpreps-leagues.test.ts',
  'tests/views/teams/player-stats.test.ts',
];

export default defineConfig({
  // '@/' imports: Vite 8's native tsconfig.json `paths` resolver (docs/DEVELOPMENT.md "Imports").
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
