/**
 * The site read API as ONE object, for tests: lib/datasets/snapshot.ts and the lib/queries/ modules
 * that read it (provenance, leagues, teams, games, standings, phase, postseason), imported in that
 * fixed order and merged. Tests pass `loadQueries` as a module loader (`data: loadQueries` in
 * useCorpusModules / useSnapshotModules, tests/support/corpus-modules.ts), so a fresh module graph
 * reads the snapshot SCVAL_SNAPSHOT points at, and call `m.data.getStandings(…)`. Pages
 * and components import the one module they need instead; nothing outside tests/ imports this.
 */

/** Imports the snapshot dataset, then each query module, and returns their exports merged. */
export async function loadQueries() {
  const snapshot = await import('@/lib/datasets/snapshot');
  const provenance = await import('@/lib/queries/provenance');
  const leagues = await import('@/lib/queries/leagues');
  const teams = await import('@/lib/queries/teams');
  const games = await import('@/lib/queries/games');
  const standings = await import('@/lib/queries/standings');
  const phase = await import('@/lib/queries/phase');
  const postseason = await import('@/lib/queries/postseason');
  return { ...snapshot, ...provenance, ...leagues, ...teams, ...games, ...standings, ...phase, ...postseason };
}

/** What {@link loadQueries} resolves to. */
export type Queries = Awaited<ReturnType<typeof loadQueries>>;
