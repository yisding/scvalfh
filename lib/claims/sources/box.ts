/**
 * Box scores (evidence only): the player-stats file's box-score evidence (lib/results/box-evidence.ts), one
 * claim per contest that has a fixture, read back as the evidence the results step weighs
 * (lib/results/result.ts withBoxScore).
 *
 * The scope is the whole file: when the run reads it, its entries replace every stored box claim; when it does not (a
 * corpus run, or the file unreadable), the results step leaves each game's box evidence as the game holds it, as
 * finalizeResult does with no evidence. At the end of every run the claims are rewritten from the published games, so a
 * carried contest, folded from its claims (lib/claims/resolve.ts resolveCarriedClaims), shows the box score it was last
 * published with. An entry goes to the fixture its game is (lib/claims/published.ts); one for a game with none (a
 * frozen league's game as last published, whose contest MaxPreps no longer lists) is not stored, and its evidence is
 * read off the file itself.
 */

import type { BoxEvidence } from '../../results/box-evidence';
import type { BoxSide, ContestId, Game } from '../../types';
import { stableStringify } from '../../stable-json';
import { fixtureOfContest } from '../published';
import type { ClaimStore } from '../store';
import type { BoxClaim, FixtureId } from '../types';

/** The box claim a published game's `provenance.boxScore` implies (claims seeded from a snapshot), or null. */
export function boxClaimOfScore(g: Game, seenAt: string): BoxClaim | null {
  const box = g.provenance.boxScore;
  if (!box) return null;
  const sides: Record<string, BoxSide> = {};
  if (box.home && g.home.slug) sides[g.home.slug] = box.home;
  if (box.away && g.away.slug) sides[g.away.slug] = box.away;
  return Object.keys(sides).length > 0 ? { ref: g.contestId, seenAt, sides } : null;
}

/** The run's box evidence onto the fixtures it is about; with no evidence read, the stored claims stay. */
export function recordBoxClaims(store: ClaimStore, evidence: BoxEvidence | undefined, fetchedAt: string): void {
  if (!evidence) return;
  const fresh: BoxClaim[] = [];
  const place = new Map<string, FixtureId>();
  for (const [contestId, sides] of evidence) {
    const id = fixtureOfContest(store, contestId);
    if (id === undefined) continue;
    fresh.push({ ref: contestId, seenAt: fetchedAt, sides: Object.fromEntries(sides) });
    place.set(contestId, id);
  }
  store.mergeRead('box', () => true, fresh, (c) => place.get(c.ref) as FixtureId);
}

/**
 * The box claims rewritten from the published games: each game that shows a box score keeps it as its fixture's
 * claim, so the claims hold what the last publication showed, as the other sources' do; a game that shows none (its
 * contest read this run while the player-stats file was not, or a corrected result) has none. A claim keeps its stored
 * seenAt while it holds the same.
 */
export function writeBackBoxClaims(store: ClaimStore, published: readonly Game[], fetchedAt: string): void {
  const stored = new Map(store.claimsOf('box').map(({ claim }) => [claim.ref, claim]));
  const fresh: BoxClaim[] = [];
  const place = new Map<string, FixtureId>();
  for (const g of published) {
    const id = fixtureOfContest(store, g.contestId);
    const claim = id === undefined ? null : boxClaimOfScore(g, fetchedAt);
    if (!claim) continue;
    const was = stored.get(claim.ref);
    fresh.push(was && stableStringify(was.sides) === stableStringify(claim.sides) ? { ...claim, seenAt: was.seenAt } : claim);
    place.set(claim.ref, id as FixtureId);
  }
  store.mergeRead('box', () => true, fresh, (c) => place.get(c.ref) as FixtureId);
}

/**
 * The box evidence for a game, as finalizeResult takes it: undefined when the run read none (each game keeps what it
 * holds), else its fixture's claim, or the file's entry for a game with no fixture.
 */
export function boxEvidenceOf(store: ClaimStore, evidence: BoxEvidence | undefined): (contestId: ContestId) => BoxEvidence | undefined {
  if (!evidence) return () => undefined;
  return (contestId) => {
    const id = fixtureOfContest(store, contestId);
    const sides = id === undefined ? evidence.get(contestId) : store.get(id)?.claims.box?.ref === contestId ? new Map(Object.entries(store.get(id)!.claims.box!.sides)) : undefined;
    return new Map(sides ? [[contestId, sides]] : []);
  };
}
