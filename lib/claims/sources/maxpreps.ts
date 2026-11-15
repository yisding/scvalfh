/**
 * MaxPreps (§7.1, stage `maxpreps`): COLLECT the team feeds' rows as one claim per contest, and MATCH them against
 * the stored claims. Step 06 (lib/pipeline/steps/normalize.ts) publishes the view this returns, resolved.
 *
 * COLLECT is normalize with no ledger fact: the contest exactly as toGame builds it. MATCH applies the editor's day
 * and host (resolve), drops the editor's rejected and duplicate rows and the ghost teams' contests, dedupes
 * phantom pairs, and carries a stored claim forward only while a side's feed was not read this run. A carried
 * contest enters the view as the previous run published it, classification cleared (`published`, §11 R3's
 * zero-deviation carry), so it keeps what the other sources added to it then; given no publication, it is the
 * contest MaxPreps last listed, on today's editor day and host, and the other stages decide it again (§0.3).
 */

import { byDateThenId } from '../../format';
import { isOfficialContestId } from '../../game-id';
import { applyExclusions, dedupePhantomPairs, normalizeGames, type NormalizeResult } from '../../pipeline/normalize';
import type { ScheduleRow } from '../../sources/maxpreps';
import type { ContestId, DroppedContest, Game, TeamId, TeamSlug } from '../../types';
import { exclusionsOf, type EditorView } from '../editor';
import { byDateKeyThenRef, maxprepsBaseId } from '../from-snapshot';
import { resolveMaxprepsClaim } from '../resolve';
import type { ClaimStore } from '../store';
import type { FeedRead, FixtureDecisions, FixtureId, MaxprepsClaim, MaxprepsGame } from '../types';

export type { FeedRead } from '../types';

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
function maxprepsReadScope(feeds: ReadonlyMap<TeamSlug, FeedRead>): (claim: MaxprepsClaim) => boolean {
  const missing = missingTeams(feeds);
  return (claim) => {
    const { home, away } = claim.game;
    return !((home.teamId !== null && missing.has(home.teamId)) || (away.teamId !== null && missing.has(away.teamId)));
  };
}

/**
 * A game as the previous run published it, carried for a feed this run did not read: the earlier run's classification
 * is cleared (official stamp and its notes, countsFor, postseason), so the official and classify stages decide it
 * again exactly as they decide a fresh one.
 */
export function asLastPublished(g: Game): Game {
  const { official: _official, ...rest } = g;
  void _official;
  const { classificationNote: _note, hostConflict: _host, ...provenance } = g.provenance;
  void [_note, _host];
  return { ...rest, countsFor: null, postseason: null, provenance };
}

export interface MaxprepsMatch {
  /** byDateThenId order of the corrected games (the legacy order after step 06). */
  view: FixtureId[];
  /** Exclusions, dedupe, carry-dedupe; plus TBA rows not published. In step 06's ctx.drop order. */
  dropped: DroppedContest[];
  unusedExclusions: ContestId[];
  /** How many of this run's contests the exclusions and the phantom dedupe dropped (step 06's log line). */
  droppedByConfig: number;
  /** Contest ids carried forward this run (a side's feed not read): stored claims, and editor-listed games last published. */
  carried: ContestId[];
  /** The carried fixtures' decisions: the game each enters the view with. Every other view fixture is its claim's. */
  decisions: Map<FixtureId, FixtureDecisions>;
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
  /**
   * The previous publication's games by contest id (§11 R3's zero-deviation carry): a carried contest publishes as
   * it was last published, classification cleared, so it keeps what the other sources added to it rather than
   * having this run's reads decide it again. Absent: a carried contest is its MaxPreps claim alone.
   */
  published?: ReadonlyMap<ContestId, Game>;
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
  const missing = missingTeams(input.feeds);
  const kept = new Set(deduped.games.map((g) => g.contestId));
  const droppedIds = new Set([...excluded.dropped, ...deduped.dropped].map((d) => d.contestId));
  const stored = store.claimsOf('maxpreps').map(({ claim }) => claim);
  const candidates = missing.size === 0
    ? []
    : stored.filter((c) => !readScope(c) && !kept.has(c.ref) && !droppedIds.has(c.ref) && !input.deletedThisRun.has(c.ref));
  const published = input.published ?? new Map<ContestId, Game>();
  const carriedGames = new Map<ContestId, Game>(
    candidates.map((c) => {
      const last = published.get(c.ref);
      return [c.ref, last ? asLastPublished(last) : resolveMaxprepsClaim(c, editor)];
    }),
  );
  // An editor-listed game published last run that touches an unread feed is carried as published (passthrough).
  const touchesMissing = (g: Game) => (g.home.teamId !== null && missing.has(g.home.teamId)) || (g.away.teamId !== null && missing.has(g.away.teamId));
  const listed = missing.size === 0
    ? []
    : [...published.values()].filter((g) => isOfficialContestId(g.contestId) && touchesMissing(g) && !droppedIds.has(g.contestId) && !input.deletedThisRun.has(g.contestId));
  for (const g of listed) carriedGames.set(g.contestId, asLastPublished(g));
  // In the previous publication's order, as the snapshot carry read it; a contest it lacks after them, by day.
  const rank = new Map([...published.keys()].map((id, i) => [id, i]));
  const candidateGames = [...carriedGames.values()].sort(
    (x, y) => (rank.get(x.contestId) ?? Infinity) - (rank.get(y.contestId) ?? Infinity) || byDateThenId(x, y),
  );
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
  const decisions = new Map<FixtureId, FixtureDecisions>();
  const view = games.map((g) => {
    // An editor listing carried as published holds no claim of its own here: a passthrough fixture, never stored.
    const id = store.fixtureOf('maxpreps', g.contestId) ?? `passthrough:${g.contestId}`;
    const last = carriedGames.get(g.contestId);
    if (last && published.has(g.contestId)) decisions.set(id, { from: 'maxpreps', enters: last });
    return id;
  });
  return { view, decisions, dropped, unusedExclusions: excluded.unused, droppedByConfig: excluded.dropped.length + deduped.dropped.length, carried: carried.map((g) => g.contestId), games };
}
