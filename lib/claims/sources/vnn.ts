/**
 * VNN school calendars (§7.4, stage `vnn`, evidence only): what each school calendar showed on a game the last time
 * it was published, kept as one claim per calendar and game, and read back for the per-site carry when that school's
 * calendar does not answer.
 *
 * A claim is written for every published game a calendar's school plays in that shows a venue name or a confirmed
 * start time (`applied`), whatever put it there: the carry fills a hole with the value the game last showed, as
 * lib/sources/vnn-ics.ts carryVnnForward did with the previous snapshot's game. The claims are rewritten from the
 * published games at the end of every run, so they always hold the last publication. A VNN claim never creates a
 * fixture: it goes to the fixture the game is (lib/claims/published.ts: a MaxPreps contest's, a sheet game's, an
 * editor listing's); a game with none (an si.com rule-2 game) is not stored, and its carry reads the previous
 * snapshot until the stage that creates it keeps claims.
 */

import { stableStringify } from '../../stable-json';
import { VNN_SITE_IDS, vnnPublishedOf, type VnnPublished } from '../../sources/vnn-ics';
import type { Game, TeamSlug } from '../../types';
import { fixtureOfContest } from '../published';
import type { ClaimStore } from '../store';
import type { FixtureId, VnnClaim } from '../types';

/** A calendar's claim ref for a game: the school, then the game's contest. */
export const vnnClaimRef = (school: TeamSlug, contestId: string): string => `${school}:contest:${contestId}`;

/** The school calendars whose school plays in `game`, in VNN_SITE_IDS order. */
function schoolsOf(game: Pick<Game, 'home' | 'away'>): TeamSlug[] {
  return VNN_SITE_IDS.map((s) => s.slug).filter((slug) => game.home.slug === slug || game.away.slug === slug);
}

/** One claim per calendar whose school plays in `game`, holding what the game shows from the calendars; none when it shows nothing. */
export function vnnClaimsOf(game: Game, seenAt: (school: TeamSlug) => string): VnnClaim[] {
  const applied = vnnPublishedOf(game);
  if (!applied) return [];
  return schoolsOf(game).map((school) => ({ ref: vnnClaimRef(school, game.contestId), seenAt: seenAt(school), applied }));
}

/** What `contestId`'s fixture showed from the calendars when last published, from its stored claims. */
export function storedVnnPublished(store: ClaimStore, contestId: string): VnnPublished | undefined {
  const id = fixtureOfContest(store, contestId);
  if (id === undefined) return undefined;
  const claim = (store.get(id)?.claims.vnn ?? []).find((c) => c.ref.endsWith(`:contest:${contestId}`));
  return claim?.applied;
}

/**
 * What each game showed from the calendars when last published: a game with a fixture reads its stored claims; any
 * other game (an si.com rule-2 game, an editor-listed game whose fixture the ledger no longer has) reads
 * `previousGames`, the previous snapshot, until its own stage keeps claims.
 */
export function vnnPublishedFrom(store: ClaimStore, previousGames: readonly Game[]): (contestId: string) => VnnPublished | undefined {
  const prevById = new Map(previousGames.map((g) => [g.contestId, g]));
  return (contestId) => {
    if (fixtureOfContest(store, contestId) !== undefined) return storedVnnPublished(store, contestId);
    const prev = prevById.get(contestId);
    return prev ? vnnPublishedOf(prev) : undefined;
  };
}

/**
 * The calendars' claims rewritten from this run's published games: every stored VNN claim is replaced. A claim keeps
 * its stored seenAt while its school's calendar was not read this run and it shows the same; otherwise it is stamped
 * `fetchedAt`.
 */
export function writeBackVnnClaims(store: ClaimStore, published: readonly Game[], answered: ReadonlySet<TeamSlug>, fetchedAt: string): void {
  const stored = new Map(store.claimsOf('vnn').map(({ claim }) => [claim.ref, claim]));
  const fresh: VnnClaim[] = [];
  const place = new Map<string, FixtureId>();
  for (const game of published) {
    const id = fixtureOfContest(store, game.contestId);
    if (id === undefined) continue;
    for (const claim of vnnClaimsOf(game, () => fetchedAt)) {
      const was = stored.get(claim.ref);
      const school = claim.ref.slice(0, claim.ref.indexOf(':'));
      const same = was !== undefined && stableStringify(was.applied) === stableStringify(claim.applied);
      fresh.push(!answered.has(school) && same ? { ...claim, seenAt: was.seenAt } : claim);
      place.set(claim.ref, id);
    }
  }
  store.mergeRead('vnn', () => true, fresh, (c) => place.get(c.ref) as FixtureId);
}
