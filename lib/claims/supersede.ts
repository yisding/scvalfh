/**
 * A fixture's history of contest ids. A game is published under one contest id at a time, but not always the same
 * one: si.com's rule 2 publishes a game MaxPreps does not list as `sblive:<id>`, the San Diego bracket sheet one as
 * `cifsds:<pair>`, the editor's listing one as `official:<key>`, and when MaxPreps lists the game later its contest
 * takes the game over. The fixture records every contest id its game was published under (`Fixture.published`),
 * and when a MaxPreps contest takes over a game whose fixture another source created, the contest's claim joins that
 * fixture (ClaimStore.merge), so the fixture's id is the same before and after.
 *
 * Which contest takes a game over is the rule assembly has always published as `supersededGames` (lib/pipeline/
 * steps/assemble.ts supersededGamesOf), read here off the claims instead of the previous snapshot's games: an
 * `sblive:` game by the contest stamped with the official fixture its fill was published on; a `cifsds:` game or an
 * editor listing by the nearest contest of the same two schools within SDS_SHEET_DATE_TOLERANCE_DAYS of its day.
 */

import { dayDiff } from '../format';
import { isCifsdsContestId, isOfficialContestId, isSbliveContestId } from '../game-id';
import { SDS_SHEET_DATE_TOLERANCE_DAYS } from '../postseason/sds-sheet-results';
import type { ContestId, Game } from '../types';
import { fixtureOfContest } from './published';
import type { ClaimStore } from './store';
import { MULTI_CLAIM_SOURCES, type ClaimSource, type Fixture, type FixtureId } from './types';

/** Every published game onto its fixture's history, stamped `at` (the run that published it); a listing with the stamp it was built with. */
export function recordPublished(store: ClaimStore, games: readonly Game[], at: string): void {
  for (const g of games) {
    const id = fixtureOfContest(store, g.contestId);
    if (id !== undefined) store.markPublished(id, g.contestId, at, isOfficialContestId(g.contestId) ? g.provenance.fetchedAt : undefined);
  }
}

const pairOf = (slugs: ReadonlyArray<string | null>): string => [...slugs].sort().join('~');

/** The day and the two schools of a game the fixture published under `contestId`, as its claims hold them. */
function placeOf(f: Fixture, contestId: ContestId): { dateKey: string; pair: string } | null {
  if (isCifsdsContestId(contestId)) {
    const sheet = f.claims.sdsSheet;
    if (!sheet || sheet.published.contestId !== contestId) return null;
    const slugs = sheet.result ? [sheet.result.winner, sheet.result.loser] : sheet.fixture ? [...sheet.fixture.teams] : null;
    return slugs ? { dateKey: sheet.published.dateLocal.slice(0, 10), pair: pairOf(slugs) } : null;
  }
  const listing = f.claims.editor?.fixture;
  if (!listing || `official:${f.id}` !== contestId) return null;
  return { dateKey: listing.dateKey, pair: pairOf([listing.home, listing.away]) };
}

/**
 * The games of fixtures the last run (`lastRun`, the stamp of the claims the run read) published under an si.com,
 * sheet or listing id that a contest of `games` (this run's) has taken over: from each such id to the contest.
 */
export function supersededFromHistory(store: ClaimStore, games: readonly Game[], lastRun: string | null): Map<ContestId, ContestId> {
  const out = new Map<ContestId, ContestId>();
  if (lastRun === null) return out;
  const ids = new Set(games.map((g) => g.contestId));
  const byFixture = new Map<string, ContestId>();
  for (const g of games) if (g.official && !isSbliveContestId(g.contestId)) byFixture.set(g.official.fixtureId, g.contestId);
  const prefixed = (id: ContestId): boolean => isCifsdsContestId(id) || isOfficialContestId(id);
  for (const id of store.ids()) {
    const f = store.get(id) as Fixture;
    if (f.claims.maxpreps) continue;
    for (const { contestId, seenAt } of f.published ?? []) {
      if (seenAt !== lastRun || ids.has(contestId)) continue;
      if (isSbliveContestId(contestId)) {
        const fill = (f.claims.sblive ?? []).find((c) => c.fill?.rule === 'absent-fixture' && c.fill.contestId === contestId)?.fill;
        const fixtureId = fill?.rule === 'absent-fixture' ? fill.game.official?.fixtureId : undefined;
        const winner = fixtureId !== undefined ? byFixture.get(fixtureId) : undefined;
        if (winner) out.set(contestId, winner);
      } else if (prefixed(contestId)) {
        const place = placeOf(f, contestId);
        if (!place) continue;
        const now = games
          .filter(
            (c) =>
              !prefixed(c.contestId) &&
              !isSbliveContestId(c.contestId) &&
              pairOf([c.home.slug, c.away.slug]) === place.pair &&
              Math.abs(dayDiff(c.dateKey, place.dateKey)) <= SDS_SHEET_DATE_TOLERANCE_DAYS,
          )
          .sort((a, b) => Math.abs(dayDiff(a.dateKey, place.dateKey)) - Math.abs(dayDiff(b.dateKey, place.dateKey)) || a.contestId.localeCompare(b.contestId));
        if (now[0]) out.set(contestId, now[0].contestId);
      }
    }
  }
  return out;
}

/** The sources a fixture holds one claim of (lib/claims/types.ts MULTI_CLAIM_SOURCES holds the others). */
const ONE_CLAIM_SOURCES: readonly ClaimSource[] = (['maxpreps', 'editor', 'official', 'sdsSheet', 'box'] as const).filter((s) => !MULTI_CLAIM_SOURCES.has(s));

/**
 * Each contest that took over a game this run (`superseded`, from the game's old id to the contest) joins the fixture
 * of the game it took over, when the contest's fixture was created this run (it is not among `existing`, the fixtures
 * the run read): its claims move there (ClaimStore.merge, the new fixture's id becoming an alias), so the game keeps
 * its fixture id; `joined` hears of each merge (the run's view renames the fixture). A one-claim source both fixtures
 * hold keeps the contest's claim, the claim about the game as it is now; the old one was about the game the contest
 * replaced.
 */
export function joinSupersededFixtures(
  store: ClaimStore,
  superseded: ReadonlyMap<ContestId, ContestId>,
  existing: ReadonlySet<FixtureId>,
  joined: (from: FixtureId, into: FixtureId) => void = () => {},
): void {
  for (const [from, to] of superseded) {
    const old = fixtureOfHistory(store, from);
    const taker = store.fixtureOf('maxpreps', to);
    if (old === undefined || taker === undefined || taker === old || existing.has(taker)) continue;
    const a = store.get(taker) as Fixture;
    const b = store.get(old) as Fixture;
    if (b.claims.maxpreps) continue;
    for (const source of ONE_CLAIM_SOURCES) {
      const held = b.claims[source as keyof Fixture['claims']] as { ref: string } | undefined;
      if (held && a.claims[source as keyof Fixture['claims']] !== undefined) store.detach(source, held.ref);
    }
    store.merge(taker, old);
    joined(taker, old);
  }
}

/** The fixture whose history holds `contestId` and no MaxPreps claim. */
function fixtureOfHistory(store: ClaimStore, contestId: ContestId): FixtureId | undefined {
  return store.ids().find((id) => {
    const f = store.get(id) as Fixture;
    return f.claims.maxpreps === undefined && (f.published ?? []).some((p) => p.contestId === contestId);
  });
}
