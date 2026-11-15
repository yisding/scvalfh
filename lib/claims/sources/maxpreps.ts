/**
 * MaxPreps (§7.1, stage `maxpreps`): COLLECT the team feeds' rows as one claim per contest, and MATCH them against
 * the stored claims, with the same pure functions step 06 (lib/pipeline/steps/normalize.ts) publishes from.
 *
 * COLLECT is normalize with no ledger fact: the contest exactly as toGame builds it. MATCH applies the editor's day
 * and host (resolve), drops the editor's rejected and duplicate rows and the ghost teams' contests, dedupes
 * phantom pairs, and carries a stored claim forward only while a side's feed was not read this run: the step-06
 * carry predicate, over claims instead of the previous snapshot's games.
 */

import { byDateThenId } from '../../format';
import { applyExclusions, dedupePhantomPairs, normalizeGames, type NormalizeResult } from '../../pipeline/normalize';
import type { ScheduleRow } from '../../sources/maxpreps';
import type { ContestId, DroppedContest, Game, TeamId, TeamSlug } from '../../types';
import { exclusionsOf, type EditorView } from '../editor';
import { byDateKeyThenRef, maxprepsBaseId } from '../from-snapshot';
import { resolveMaxprepsClaim } from '../resolve';
import type { ClaimStore } from '../store';
import type { FixtureId, MaxprepsClaim, MaxprepsGame } from '../types';

/** One team feed's read this run, as step 05 records it (lib/pipeline/ledger.ts TeamFeedInfo). */
export interface FeedRead {
  teamId: TeamId;
  status: 'ok' | 'failed' | 'skipped' | 'not-fetched';
}

/** The contests the feeds read this run, as claims stamped `fetchedAt`, and normalize's result (warnings, stats, TBA drops). */
export function collectMaxprepsClaims(rows: readonly ScheduleRow[], fetchedAt: string): { claims: MaxprepsClaim[]; norm: NormalizeResult } {
  const norm = normalizeGames(rows, { fetchedAt, dates: {}, hosts: {} });
  const claims = norm.games.map((g): MaxprepsClaim => ({ ref: g.contestId, seenAt: fetchedAt, game: g as MaxprepsGame }));
  return { claims, norm };
}

/** The team ids whose feed this run did not read: failed, or its league not in the run. */
function missingTeams(feeds: ReadonlyMap<TeamSlug, FeedRead>): Set<TeamId> {
  return new Set([...feeds.values()].filter((f) => f.status === 'failed' || f.status === 'not-fetched').map((f) => f.teamId));
}

/** Whether a stored claim's scope was read this run: neither side's team feed failed or went unfetched. */
export function maxprepsReadScope(feeds: ReadonlyMap<TeamSlug, FeedRead>): (claim: MaxprepsClaim) => boolean {
  const missing = missingTeams(feeds);
  return (claim) => {
    const { home, away } = claim.game;
    return !((home.teamId !== null && missing.has(home.teamId)) || (away.teamId !== null && missing.has(away.teamId)));
  };
}

export interface MaxprepsMatch {
  /** byDateThenId order of the corrected games (the legacy order after step 06). */
  view: FixtureId[];
  /** Exclusions, dedupe, carry-dedupe; plus TBA rows not published. In step 06's ctx.drop order. */
  dropped: DroppedContest[];
  unusedExclusions: ContestId[];
  /** Contest ids of the stored claims carried forward this run (a side's feed not read). */
  carried: ContestId[];
  /** Each view fixture's game at this stage, in view order. */
  games: Game[];
}

/**
 * MATCH for MaxPreps (§7.1): the store updated with this run's read (fresh claims attached by stored ref, else to a
 * new fixture; dropped and vanished contests detached; claims of unread feeds kept), and the view order of the
 * contests published at this stage.
 */
export function matchMaxpreps(input: {
  store: ClaimStore;
  fresh: readonly MaxprepsClaim[];
  editor: EditorView;
  feeds: ReadonlyMap<TeamSlug, FeedRead>;
  deletedThisRun: ReadonlySet<ContestId>;
  tbaDropped: readonly DroppedContest[];
  normDropped: readonly DroppedContest[];
}): MaxprepsMatch {
  const { store, fresh, editor } = input;
  const freshRefs = new Set(fresh.map((c) => c.ref));

  // Fresh claims through the editor's day and host, in normalize's order.
  const view1 = fresh.map((c) => resolveMaxprepsClaim(c, editor)).sort(byDateThenId);
  const excluded = applyExclusions(view1, exclusionsOf(editor));
  const deduped = dedupePhantomPairs(excluded.games);
  const dropped: DroppedContest[] = [];
  // A TBA row whose contest another feed published with both sides named is not a dropped contest.
  for (const row of [...input.tbaDropped, ...input.normDropped]) if (!freshRefs.has(row.contestId)) dropped.push(row);
  dropped.push(...excluded.dropped, ...deduped.dropped);

  // Carry: stored claims of an unread feed that this run neither has, dropped nor saw deleted.
  const readScope = maxprepsReadScope(input.feeds);
  const kept = new Set(deduped.games.map((g) => g.contestId));
  const droppedIds = new Set([...excluded.dropped, ...deduped.dropped].map((d) => d.contestId));
  const stored = store.claimsOf('maxpreps').map(({ claim }) => claim);
  const candidates = missingTeams(input.feeds).size === 0
    ? []
    : stored.filter((c) => !readScope(c) && !kept.has(c.ref) && !droppedIds.has(c.ref) && !input.deletedThisRun.has(c.ref));
  const candidateGames = candidates.map((c) => resolveMaxprepsClaim(c, editor));
  const merged = dedupePhantomPairs([...deduped.games, ...candidateGames], { preferred: (g) => freshRefs.has(g.contestId) });
  dropped.push(...merged.dropped);
  const losers = new Set(merged.dropped.map((d) => d.contestId));
  const carried = candidateGames.filter((g) => !losers.has(g.contestId));
  for (const g of carried) kept.add(g.contestId);

  // The store: fresh claims kept this run in; every other MaxPreps claim not carried out.
  const keptFresh = fresh.filter((c) => kept.has(c.ref)).sort(byDateKeyThenRef);
  store.mergeRead('maxpreps', readScope, keptFresh, (c) => store.create(maxprepsBaseId(c, editor)));
  for (const { claim } of store.claimsOf('maxpreps')) if (!kept.has(claim.ref)) store.detach('maxpreps', claim.ref);

  const games = [...deduped.games, ...carried].sort(byDateThenId);
  const view = games.map((g) => store.fixtureOf('maxpreps', g.contestId) as FixtureId);
  return { view, dropped, unusedExclusions: excluded.unused, carried: carried.map((g) => g.contestId), games };
}
