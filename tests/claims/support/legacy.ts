/**
 * The legacy rules of the stages moved onto claims, kept here for the shadow harness only (pipeline inversion
 * §10.0): each reads the previous snapshot's games where the pipeline now reads stored claims. They are the code
 * the steps ran before their phase, verbatim in what they decide, so tests/claims/support/shadow.ts can check the
 * claims path against them run by run.
 */

import { byDateThenId } from '../../../lib/format';
import { EXCLUSIONS } from '../../../lib/fixtures/ledger';
import { isSbliveContestId } from '../../../lib/game-id';
import { applyExclusions, dedupePhantomPairs, normalizeGames } from '../../../lib/pipeline/normalize';
import { isCifsdsContest } from '../../../lib/postseason/sds-sheet-results';
import type { ShadowStage } from '../../../lib/claims/types';
import { finalizeResults, withAddedGames } from '../../../lib/results/result';
import { applyVnnEvents, carryVnnForward } from '../../../lib/sources/vnn-ics';
import type { ContestId, Game, Snapshot } from '../../../lib/types';

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

/** Step 09's school calendars as they were before P3: the per-site carry read the previous snapshot's games. */
export function legacyVnn(input: Extract<ShadowStage, { stage: 'vnn' }>['input'], previous: Snapshot | null): Game[] {
  let games = [...input.games];
  if (input.events.length) games = applyVnnEvents(games, input.events).games;
  const missing = [...input.sites].filter(([, read]) => read === 'not-answered').map(([slug]) => slug);
  if (missing.length && previous) games = carryVnnForward(missing, previous.games, games).games;
  return games;
}

/** Step 11c as it was before P3: the cifss report's conflict rows and the box-score file, as given. */
export function legacyResults(input: Extract<ShadowStage, { stage: 'results' }>['input'], fetchedAt: string): Game[] {
  return finalizeResults(withAddedGames(input.games, fetchedAt), { cifssConflicts: input.cifssConflicts, box: input.box });
}
