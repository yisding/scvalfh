/**
 * The legacy rules of the stages moved onto claims, kept here for the shadow harness only (pipeline inversion
 * §10.0): each reads the previous snapshot's games where the pipeline now reads stored claims. They are the code
 * the steps ran before their phase, verbatim in what they decide, so tests/claims/support/shadow.ts can check the
 * claims path against them run by run.
 */

import { classifyGames } from '../../../lib/classify';
import { applyBackfill } from '../../../lib/crosscheck/backfill';
import { carryCrossCheck, emptyCrossCheck, reconcile, withBackfill } from '../../../lib/crosscheck/crosscheck';
import { byDateThenId } from '../../../lib/format';
import { EXCLUSIONS } from '../../../lib/fixtures/ledger';
import { isSbliveContestId } from '../../../lib/game-id';
import { applyExclusions, dedupePhantomPairs, normalizeGames } from '../../../lib/pipeline/normalize';
import { SDS_BRACKET_SHEET_URL } from '../../../lib/league-config/sections';
import { settleLevelFinals } from '../../../lib/postseason/level-final';
import { SDS_BRACKETS_FILE } from '../../../lib/postseason/sds-brackets-file';
import { sdsPlayoffWindow } from '../../../lib/postseason/sds-brackets-schema';
import { applySdsSheetResults, isCifsdsContest, sheetFixturesFromGames, sheetResultsFromGames } from '../../../lib/postseason/sds-sheet-results';
import { keepUnread } from '../../../lib/pipeline/steps/sds-sheet';
import type { SdsSheetFixture, SdsSheetResult } from '../../../lib/sources/sds-bracket-sheet';
import type { ShadowStage } from '../../../lib/claims/types';
import { finalizeResults, withAddedGames } from '../../../lib/results/result';
import { carryOfficialForward } from '../../../lib/sources/scval-pdf';
import { applyVnnEvents, carryVnnForward } from '../../../lib/sources/vnn-ics';
import type { ContestId, Game, OfficialFixture, SbliveCrossCheck, Snapshot } from '../../../lib/types';

/** A carried game with the earlier run's classification cleared, so this run decides it again. */
function unclassified(g: Game): Game {
  const { official: _official, ...rest } = g;
  void _official;
  const { classificationNote: _note, hostConflict: _host, ...provenance } = g.provenance;
  void [_note, _host];
  return { ...rest, countsFor: null, postseason: null, provenance };
}

/** Step 06 as it was before P2: the previous snapshot's merged games carried for a feed this run did not read. */
export function legacyMaxpreps(
  input: Extract<ShadowStage, { stage: 'maxpreps' }>['input'],
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
 * Step 07's carry of one division not read, as it was before P5: the previous snapshot's stamps by contest and its
 * unmatched official fixtures (nothing with no previous snapshot).
 */
export function legacyOfficialCarry(
  record: Extract<ShadowStage, { stage: 'official'; kind: 'carry' }>,
  previous: Snapshot | null,
): { fixtures: OfficialFixture[]; games: Game[]; carried: number } {
  if (!previous) return { fixtures: [], games: [...record.games], carried: 0 };
  return carryOfficialForward([record.division], previous, record.games);
}

/** Step 09's school calendars as they were before P3: the per-site carry read the previous snapshot's games. */
export function legacyVnn(input: Extract<ShadowStage, { stage: 'vnn' }>['input'], previous: Snapshot | null): Game[] {
  let games = [...input.games];
  if (input.events.length) games = applyVnnEvents(games, input.events).games;
  const missing = [...input.sites].filter(([, read]) => read === 'not-answered').map(([slug]) => slug);
  if (missing.length && previous) games = carryVnnForward(missing, previous.games, games).games;
  return games;
}

/** Step 10 as it was before P7: classifyGames, then settleLevelFinals, over the stage's game list. */
export function legacyClassify(input: Extract<ShadowStage, { stage: 'classify' }>['input']): Game[] {
  return settleLevelFinals(classifyGames(input.games, { degradedDivisions: input.degradedDivisions }));
}

/** Step 11c as it was before P3: the cifss report's conflict rows and the box-score file, as given. */
export function legacyResults(input: Extract<ShadowStage, { stage: 'results' }>['input'], fetchedAt: string): Game[] {
  return finalizeResults(withAddedGames(input.games, fetchedAt), { cifssConflicts: input.cifssConflicts, box: input.box });
}

/**
 * Step 09's bracket sheet as it was before P4: a tab not read carried the rows read back from the previous snapshot's
 * games, and a tab read with warnings kept them for the pairs it did not read.
 */
export function legacySdsSheet(
  input: Extract<ShadowStage, { stage: 'sdsSheet' }>['input'],
  previous: Snapshot | null,
  run: { today: string; fetchedAt: string },
): { results: SdsSheetResult[]; fixtures: SdsSheetFixture[]; games: Game[]; disagreements: string[] } {
  const file = SDS_BRACKETS_FILE;
  if (file.divisions.length === 0) return { results: [], fixtures: [], games: [...input.games], disagreements: [] };
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
  const applied = applySdsSheetResults({
    games: input.games,
    results,
    fixtures,
    today: run.today,
    file,
    windowFirst: sdsPlayoffWindow().first,
    sheetUrl: SDS_BRACKET_SHEET_URL,
    fetchedAt: run.fetchedAt,
  });
  return { results, fixtures, games: applied.games, disagreements: applied.disagreements };
}

/** Step 08's carry of the disagreements as it was before P6: a run without si.com data kept the previous snapshot's. */
function legacyCarryConflicts(games: readonly Game[], previous: Snapshot | null): Game[] {
  const prev = new Map((previous?.games ?? []).map((g) => [g.contestId, g]));
  return games.map((g) => {
    const p = prev.get(g.contestId);
    if (!p?.provenance.scoreConflict || g.provenance.scoreConflict || g.provenance.backfill) return g;
    if (p.provenance.backfill) return g;
    if (p.home.score !== g.home.score || p.away.score !== g.away.score) return g;
    return { ...g, provenance: { ...g.provenance, scoreConflict: p.provenance.scoreConflict } };
  });
}

/**
 * Step 08 as it was before P6: D2's rule 10 carried the previous snapshot's fills, and a run without si.com data
 * kept the previous snapshot's disagreements; the ledger's own moves.
 */
export function legacySblive(
  input: Extract<ShadowStage, { stage: 'sblive'; kind: 'decide' }>['input'],
  previous: Snapshot | null,
): { games: Game[]; unmatched: OfficialFixture[]; crossCheck: SbliveCrossCheck | undefined } {
  const base = { games: input.games, unmatched: input.unmatched, today: input.today, previous, fetchedAt: input.fetchedAt };
  if (input.sblive === null) {
    const result = applyBackfill({ ...base, sblive: [], sbliveFailed: true });
    const games = legacyCarryConflicts(result.games, previous);
    const prior = previous?.sbliveCrossCheck;
    const crossCheck = prior
      ? carryCrossCheck(prior, games, result.rows)
      : result.rows.length
        ? { ...emptyCrossCheck(input.fetchedAt), backfilled: result.rows }
        : undefined;
    return { games, unmatched: result.unmatched, crossCheck };
  }
  const result = applyBackfill({ ...base, sblive: input.sblive, sbliveFailed: false, consulted: input.consulted });
  const rec = reconcile(result.games, input.relevant, { sbliveFetchedAt: input.fetchedAt, today: input.today, skipped: result.skipped });
  return { games: rec.games, unmatched: result.unmatched, crossCheck: withBackfill(rec.report, result) };
}
