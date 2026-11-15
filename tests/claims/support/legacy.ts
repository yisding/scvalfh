/**
 * The pre-claims rules of the carries the pipeline now reads from stored claims, as the code was before the claims
 * existed (commit cf443cd): step 06's carry of the previous snapshot's games for a feed not read, step 07's carry of
 * a division not read (`carryOfficialForward`), step 08's carry of the previous snapshot's si.com disagreements, the
 * bracket sheet's carried and partly read tabs (rows read back from the previous snapshot's games, `keepUnread`), and
 * step 10's classification over the game list. Each reads the previous snapshot where the pipeline reads claims, and
 * tests/claims/support/shadow.ts checks the pipeline's per-stage trace against them. Nothing here calls the decide or
 * apply functions the pipeline itself runs, so each comparison is between two different implementations.
 */

import { classifyGames } from '../../../lib/classify';
import { byDateThenId } from '../../../lib/format';
import { EXCLUSIONS } from '../../../lib/fixtures/ledger';
import { isSbliveContestId } from '../../../lib/game-id';
import { applyExclusions, dedupePhantomPairs, normalizeGames } from '../../../lib/pipeline/normalize';
import { settleLevelFinal } from '../../../lib/postseason/level-final';
import { SDS_BRACKETS_FILE } from '../../../lib/postseason/sds-brackets-file';
import { isCifsdsContest, sheetFixturesFromGames, sheetResultsFromGames } from '../../../lib/postseason/sds-sheet-results';
import { keepUnread } from '../../../lib/pipeline/steps/sds-sheet';
import type { SdsSheetFixture, SdsSheetResult } from '../../../lib/sources/sds-bracket-sheet';
import type { StageTrace } from '../../../lib/claims/types';
import { carryOfficialForward } from '../../../lib/sources/scval-pdf';
import type { ContestId, Game, OfficialFixture, Snapshot } from '../../../lib/types';

/** A carried game with the earlier run's classification cleared, so this run decides it again. */
function unclassified(g: Game): Game {
  const { official: _official, ...rest } = g;
  void _official;
  const { classificationNote: _note, hostConflict: _host, ...provenance } = g.provenance;
  void [_note, _host];
  return { ...rest, countsFor: null, postseason: null, provenance };
}

/** Step 06 before the claims: the previous snapshot's merged games carried for a feed this run did not read. */
export function legacyMaxpreps(
  input: Extract<StageTrace, { stage: 'maxpreps' }>['input'],
  previous: Snapshot | null,
  fetchedAt: string,
): { games: Game[]; carried: ContestId[] } {
  const norm = normalizeGames(input.rows, { fetchedAt });
  const excluded = applyExclusions(norm.games, EXCLUSIONS);
  const deduped = dedupePhantomPairs(excluded.games);
  let games = deduped.games;
  const missing = input.feeds.filter((f) => f.status === 'failed' || f.status === 'not-fetched');
  if (missing.length === 0 || !previous) return { games, carried: [] };
  const ids = new Set(missing.map((f) => f.teamId));
  const have = new Set(games.map((g) => g.contestId));
  const droppedIds = new Set([...excluded.dropped, ...deduped.dropped].map((d) => d.contestId));
  const deleted = new Set(input.rows.filter((r) => r.calculatedFields.contestState === 1).map((r) => r.contest.contestId));
  const candidates = previous.games
    .filter(
      (g) =>
        !isSbliveContestId(g.contestId) &&
        !isCifsdsContest(g.contestId) &&
        !have.has(g.contestId) &&
        !droppedIds.has(g.contestId) &&
        !deleted.has(g.contestId) &&
        ((g.home.teamId !== null && ids.has(g.home.teamId)) || (g.away.teamId !== null && ids.has(g.away.teamId))),
    )
    .map(unclassified);
  const fresh = new Set(games.map((g) => g.contestId));
  const merged = dedupePhantomPairs([...games, ...candidates], { preferred: (g) => fresh.has(g.contestId) });
  const losers = new Set(merged.dropped.map((d) => d.contestId));
  const carried = candidates.filter((g) => !losers.has(g.contestId));
  if (carried.length > 0) games = [...games, ...carried].sort(byDateThenId);
  return { games, carried: carried.map((g) => g.contestId) };
}

/**
 * Step 07's carry of one division not read, before the claims: the previous snapshot's stamps by contest and its
 * unmatched official fixtures (nothing with no previous snapshot).
 */
export function legacyOfficialCarry(
  record: Extract<StageTrace, { stage: 'official'; kind: 'carry' }>,
  previous: Snapshot | null,
): { fixtures: OfficialFixture[]; games: Game[]; carried: number } {
  if (!previous) return { fixtures: [], games: [...record.games], carried: 0 };
  return carryOfficialForward([record.division], previous, record.games);
}

/** Step 10 over the game list: classifyGames, then settleLevelFinal on each game. */
export function legacyClassify(input: Extract<StageTrace, { stage: 'classify' }>['input']): Game[] {
  return classifyGames(input.games, { degradedDivisions: input.degradedDivisions }).map(settleLevelFinal);
}

/**
 * The bracket sheet's rows before the claims: a tab not read carried the rows read back from the previous snapshot's
 * games, and a tab read with warnings kept them for the pairs it did not read.
 */
export function legacySheetRows(
  input: Extract<StageTrace, { stage: 'sdsSheet' }>['input'],
  previous: Snapshot | null,
): { results: SdsSheetResult[]; fixtures: SdsSheetFixture[] } {
  const file = SDS_BRACKETS_FILE;
  if (file.divisions.length === 0) return { results: [], fixtures: [] };
  const prevResults = previous ? sheetResultsFromGames(previous.games, file) : [];
  const prevFixtures = previous ? sheetFixturesFromGames(previous.games, file) : [];
  const results: SdsSheetResult[] = [];
  const fixtures: SdsSheetFixture[] = [];
  for (const tab of input.tabs) {
    const mine = <T extends { division: string }>(rows: readonly T[]) => rows.filter((r) => r.division === tab.division);
    if (tab.read === 'carried') {
      results.push(...mine(prevResults));
      fixtures.push(...mine(prevFixtures));
      continue;
    }
    results.push(...tab.results);
    fixtures.push(...tab.fixtures);
    if (tab.read === 'read-with-warnings') {
      const fresh = [...tab.results, ...tab.fixtures];
      results.push(...keepUnread(mine(prevResults), fresh));
      fixtures.push(...keepUnread(mine(prevFixtures), fresh));
    }
  }
  return { results, fixtures };
}

/** Step 08's carry of the disagreements before the claims: a run without si.com data kept the previous snapshot's. */
export function legacyCarryConflicts(games: readonly Game[], previous: Snapshot | null): Game[] {
  const prev = new Map((previous?.games ?? []).map((g) => [g.contestId, g]));
  return games.map((g) => {
    const p = prev.get(g.contestId);
    if (!p?.provenance.scoreConflict || g.provenance.scoreConflict || g.provenance.backfill) return g;
    if (p.provenance.backfill) return g;
    if (p.home.score !== g.home.score || p.away.score !== g.away.score) return g;
    return { ...g, provenance: { ...g.provenance, scoreConflict: p.provenance.scoreConflict } };
  });
}
