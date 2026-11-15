/**
 * The fixture of a published game (§7.13 read the other way): the claims an evidence source or a write-back keeps
 * about a game go to the fixture that game is. A MaxPreps contest is the fixture holding its MaxPreps claim; a
 * `cifsds:` game is the fixture the bracket sheet's stage created for it, found by the contest its sheet claim was
 * published on; an `official:` game (an editor's listing) is the editor's fixture, named by the listing's
 * fixtureKey, which is the contest id without its prefix. An si.com rule-2 game (`sblive:`) has no fixture until
 * the si.com stage keeps claims. Pure apart from `publishedFixture`, which may create a fixture in the store.
 */

import { GUID_RE, OFFICIAL_PREFIX, isCifsdsContestId, isOfficialContestId } from '../game-id';
import type { ContestId, Game } from '../types';
import { baseFixtureId, fixtureSideKey } from './identity';
import type { ClaimStore } from './store';
import type { FixtureId } from './types';

/** Whether fixture `id` exists and holds no MaxPreps claim: one a MaxPreps contest's claims never go to. */
function holdsNoContest(store: ClaimStore, id: FixtureId | undefined): id is FixtureId {
  return id !== undefined && store.get(id) !== undefined && store.get(id)?.claims.maxpreps === undefined;
}

/** The fixture the published game `contestId` is, if the store holds one. */
export function fixtureOfContest(store: ClaimStore, contestId: ContestId): FixtureId | undefined {
  if (GUID_RE.test(contestId)) return store.fixtureOf('maxpreps', contestId);
  if (isCifsdsContestId(contestId)) {
    return store.claimsOf('sdsSheet').find(({ id, claim }) => claim.published.contestId === contestId && holdsNoContest(store, id))?.id;
  }
  if (isOfficialContestId(contestId)) {
    const id = contestId.slice(OFFICIAL_PREFIX.length);
    return holdsNoContest(store, id) ? id : undefined;
  }
  return undefined;
}

/** The id a new fixture for `game` is minted from: its day and sides (§6.2). */
export function gameBaseId(game: Pick<Game, 'dateKey' | 'home' | 'away'>): FixtureId {
  return baseFixtureId(game.dateKey, fixtureSideKey(game.away), fixtureSideKey(game.home));
}

/**
 * The fixture a write-back keeps `game`'s claims on: the one it is, else `holder` (the fixture that held the same row
 * before, when it is not a MaxPreps contest's), else a new one minted from the game. None for an si.com rule-2
 * game: that stage does not keep claims yet.
 */
export function publishedFixture(store: ClaimStore, game: Game, holder?: FixtureId): FixtureId | undefined {
  if (game.contestId.startsWith('sblive:')) return undefined;
  const own = fixtureOfContest(store, game.contestId);
  if (own !== undefined) return own;
  if (holdsNoContest(store, holder)) return holder;
  return store.create(gameBaseId(game));
}
