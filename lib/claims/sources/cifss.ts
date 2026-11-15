/**
 * cifsshome.org (§7.9, evidence only): the score cross-check's conflict rows, kept as claims on the fixtures of the
 * games they are about, and read back as the evidence the results step weighs (lib/results/result.ts
 * withCifssScore).
 *
 * The report the snapshot publishes is the scope: read fresh when every Section listing was read, else the previous
 * report carried over this run's games (lib/pipeline/steps/cifss.ts). Each run its conflict rows replace every stored
 * cifss claim, so the claims hold exactly the evidence the published report holds. A row goes to the fixture its game
 * is (lib/claims/published.ts: a MaxPreps contest's, a sheet game's, an editor listing's); a row about a game with
 * none (an si.com rule-2 game) is not stored, and its evidence is read off the report itself until the stage that
 * creates that game keeps claims.
 */

import type { CifssConflictRow, CifssCrossCheck, ContestId } from '../../types';
import { fixtureOfContest } from '../published';
import type { ClaimStore } from '../store';
import type { CifssClaim, FixtureId } from '../types';

export type CifssEvidence = Pick<CifssConflictRow, 'cifss' | 'cifssUrl'>;

/** A conflict row's claim ref: the game's contest (the rows carry no cifsshome.org id of their own). */
export const cifssClaimRef = (contestId: ContestId): string => `contest:${contestId}`;

/** The published report's conflict rows onto the fixtures they are about, replacing every stored cifss claim. */
export function recordCifssClaims(store: ClaimStore, report: CifssCrossCheck | undefined): void {
  const fresh: CifssClaim[] = [];
  const place = new Map<string, FixtureId>();
  for (const row of report?.conflicts ?? []) {
    const id = fixtureOfContest(store, row.contestId);
    if (id === undefined) continue;
    const ref = cifssClaimRef(row.contestId);
    fresh.push({ ref, seenAt: report!.cifssFetchedAt, conflict: { contestId: row.contestId, cifss: row.cifss, cifssUrl: row.cifssUrl } });
    place.set(ref, id);
  }
  store.mergeRead('cifss', () => true, fresh, (c) => place.get(c.ref) as FixtureId);
}

/** The cifss evidence for a game: its fixture's claim, else (a game with no fixture) the report's row. */
export function cifssEvidenceFrom(store: ClaimStore, report: CifssCrossCheck | undefined): (contestId: ContestId) => CifssEvidence | undefined {
  const rows = new Map((report?.conflicts ?? []).map((r) => [r.contestId, r]));
  return (contestId) => {
    const id = fixtureOfContest(store, contestId);
    if (id === undefined) return rows.get(contestId);
    const claim = (store.get(id)?.claims.cifss ?? []).find((c) => c.ref === cifssClaimRef(contestId));
    return claim?.conflict ? { cifss: claim.conflict.cifss, cifssUrl: claim.conflict.cifssUrl } : undefined;
  };
}
