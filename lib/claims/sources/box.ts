/**
 * Box scores (§7.10, evidence only): the player-stats file's box-score evidence (lib/results/box-evidence.ts), one
 * claim per contest that has a fixture, read back as the evidence the results step weighs
 * (lib/results/result.ts withBoxScore).
 *
 * The scope is the whole file: when the run reads it, its entries replace every stored box claim; when it does not
 * (a corpus run, or the file unreadable), the stored claims stay and the results step leaves each game's box
 * evidence as the game holds it, as finalizeResult does with no evidence. A carried contest publishes as it was last
 * published (lib/claims/sources/maxpreps.ts), box score included, so no stored box claim is applied to it. An entry
 * goes to the fixture its game is (lib/claims/published.ts); one for a game with none (an si.com rule-2 game) is not
 * stored, and its evidence is read off the file itself.
 */

import type { BoxEvidence } from '../../results/box-evidence';
import type { BoxSide, ContestId, Game } from '../../types';
import { fixtureOfContest } from '../published';
import type { ClaimStore } from '../store';
import type { BoxClaim, FixtureId } from '../types';

/** The box claim a published game's `provenance.boxScore` implies (claims seeded from a snapshot, §9), or null. */
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
