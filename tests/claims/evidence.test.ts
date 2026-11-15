/**
 * The evidence-only sources' claims (docs/DATA-SOURCES.md §4.2): school calendars, cifsshome.org and
 * box scores. Each is seeded from what a snapshot's games show, written by a run, and read back: the VNN per-site
 * carry reads the calendars' claims, and step 11c weighs the cifss and box evidence the claims hold. None of them
 * ever creates a fixture.
 */

import { describe, expect, it } from 'vitest';

import { ledgerEditor } from '../../lib/claims/editor';
import { claimsFromSnapshot } from '../../lib/claims/from-snapshot';
import { boxClaimOfScore, boxEvidenceOf, recordBoxClaims } from '../../lib/claims/sources/box';
import { cifssEvidenceFrom, recordCifssClaims } from '../../lib/claims/sources/cifss';
import { storedVnnPublished, vnnPublishedFrom, writeBackVnnClaims } from '../../lib/claims/sources/vnn';
import { ClaimStore } from '../../lib/claims/store';
import { TransportError, resourcePath, type ResourceKey, type Transport } from '../../lib/pipeline/contract';
import { PipelineContext, SILENT_SINK } from '../../lib/pipeline/ledger';
import type { CifssCrossCheck, Game, Snapshot } from '../../lib/types';
import { game } from '../helpers';
import { testRunArgs } from '../pipeline/support/run-args';
import { stepSecondary } from '../support/list-steps';

const AT = '2026-10-01T14:00:00.000Z';
const NOW = '2026-10-02T15:00:00.000Z';
const editor = ledgerEditor(AT).view;

const paly: Game = game({ home: 'palo-alto', away: 'saratoga', status: 'scheduled', date: '2026-10-02' });
const annotated: Game = { ...paly, venue: { text: null, name: 'Paly Field' }, timeConfirmed: true };
const other: Game = game({ home: 'saratoga', away: 'lynbrook', hs: 2, as: 1, status: 'final', date: '2026-09-20' });
const snapshotOf = (games: Game[]) => ({ fetchedAt: AT, games, sources: [] }) as unknown as Snapshot;
const storeOf = (games: Game[]) => ClaimStore.fromFile(claimsFromSnapshot(snapshotOf(games), editor));

/** Every school calendar fails. */
const failing: Transport = {
  mode: 'fixture',
  async get(key: ResourceKey) {
    throw new TransportError('HTTP 500', `fixture:${resourcePath(key)}`, 500);
  },
};

describe('school calendars (VNN)', () => {
  it('seeds one claim per calendar school with what the game shows, and none for a game that shows nothing', () => {
    const store = storeOf([annotated, other]);
    expect(storedVnnPublished(store, paly.contestId)).toEqual({ venueName: 'Paly Field', timeConfirmed: true });
    expect(storedVnnPublished(store, other.contestId)).toBeUndefined();
    const id = store.fixtureOf('maxpreps', paly.contestId) as string;
    expect(store.get(id)?.claims.vnn?.map((c) => c.ref)).toEqual([`palo-alto:contest:${paly.contestId}`]);
  });

  it('the per-site carry reads the claims, not the previous snapshot’s games', async () => {
    // The previous snapshot shows nothing on the game; the claims the previous run wrote say what it published.
    const ctx = new PipelineContext({
      args: testRunArgs({ leagues: ['scval'], ccs: false }),
      transport: failing,
      previous: snapshotOf([paly]),
      sink: SILENT_SINK,
      claims: claimsFromSnapshot(snapshotOf([annotated]), editor),
    });
    const { games } = await stepSecondary(ctx, [paly]);
    expect(games.map((g) => [g.venue.name, g.timeConfirmed])).toEqual([['Paly Field', true]]);
    expect(ctx.logLines.some((l) => l.includes('carried 1 venue/start-time annotation'))).toBe(true);
  });

  it('a game with no MaxPreps fixture reads the previous snapshot', () => {
    const sblive: Game = { ...annotated, contestId: 'sblive:123' };
    const publishedOf = vnnPublishedFrom(new ClaimStore(), [sblive]);
    expect(publishedOf('sblive:123')).toEqual({ venueName: 'Paly Field', timeConfirmed: true });
  });

  it('is rewritten from the published games: a value gone loses its claim, a calendar not read keeps its seenAt', () => {
    const store = storeOf([annotated, other]);
    writeBackVnnClaims(store, [annotated], new Set(), NOW);
    const id = store.fixtureOf('maxpreps', paly.contestId) as string;
    expect(store.get(id)?.claims.vnn?.[0].seenAt).toBe(AT);
    writeBackVnnClaims(store, [annotated], new Set(['palo-alto']), NOW);
    expect(store.get(id)?.claims.vnn?.[0].seenAt).toBe(NOW);
    writeBackVnnClaims(store, [paly], new Set(['palo-alto']), NOW);
    expect(store.get(id)?.claims.vnn).toBeUndefined();
  });
});

describe('cifsshome.org', () => {
  const report = (contestId: string): CifssCrossCheck =>
    ({
      cifssFetchedAt: NOW,
      conflicts: [{ contestId, cifss: { home: 3, away: 1 }, cifssUrl: 'https://www.cifsshome.org/widget/x' }],
    }) as unknown as CifssCrossCheck;

  it('seeds the score a game shows as its fixture’s claim', () => {
    const shown: Game = { ...other, provenance: { ...other.provenance, cifssScore: { home: 3, away: 1, url: 'https://www.cifsshome.org/widget/x' } } };
    const store = storeOf([shown]);
    expect(cifssEvidenceFrom(store, undefined)(other.contestId)).toEqual({ cifss: { home: 3, away: 1 }, cifssUrl: 'https://www.cifsshome.org/widget/x' });
  });

  it('the published report replaces every stored claim; a row about a game with no fixture is read off the report', () => {
    const store = storeOf([other]);
    recordCifssClaims(store, report(other.contestId));
    const id = store.fixtureOf('maxpreps', other.contestId) as string;
    expect(store.get(id)?.claims.cifss?.map((c) => [c.ref, c.seenAt])).toEqual([[`contest:${other.contestId}`, NOW]]);
    expect(cifssEvidenceFrom(store, report('sblive:9'))('sblive:9')).toMatchObject({ cifss: { home: 3, away: 1 } });
    recordCifssClaims(store, undefined);
    expect(store.get(id)?.claims.cifss).toBeUndefined();
    expect(cifssEvidenceFrom(store, undefined)(other.contestId)).toBeUndefined();
  });
});

describe('box scores', () => {
  const evidence = (contestId: string) => new Map([[contestId, new Map([['saratoga', { goals: 2 }]])]]);

  it('seeds a game’s box score by team slug', () => {
    const shown: Game = { ...other, provenance: { ...other.provenance, boxScore: { home: { goals: 2 } } } };
    expect(boxClaimOfScore(shown, AT)).toEqual({ ref: other.contestId, seenAt: AT, sides: { saratoga: { goals: 2 } } });
    expect(boxClaimOfScore(other, AT)).toBeNull();
  });

  it('a run that reads the file replaces the claims; one that does not keeps them and leaves each game’s evidence as it is', () => {
    const store = storeOf([other]);
    const id = store.fixtureOf('maxpreps', other.contestId) as string;
    recordBoxClaims(store, evidence(other.contestId), NOW);
    expect(store.get(id)?.claims.box).toEqual({ ref: other.contestId, seenAt: NOW, sides: { saratoga: { goals: 2 } } });
    expect(boxEvidenceOf(store, evidence(other.contestId))(other.contestId)?.get(other.contestId)?.get('saratoga')).toEqual({ goals: 2 });
    recordBoxClaims(store, undefined, '2026-10-03T15:00:00.000Z');
    expect(store.get(id)?.claims.box?.seenAt).toBe(NOW);
    expect(boxEvidenceOf(store, undefined)(other.contestId)).toBeUndefined();
    // Read, with no entry for the game: an empty file's worth, so a stale box score comes off.
    recordBoxClaims(store, new Map(), NOW);
    expect(store.get(id)?.claims.box).toBeUndefined();
    expect(boxEvidenceOf(store, new Map())(other.contestId)?.size).toBe(0);
  });

  it('never creates a fixture', () => {
    const store = new ClaimStore();
    recordBoxClaims(store, evidence(other.contestId), NOW);
    recordCifssClaims(store, { cifssFetchedAt: NOW, conflicts: [{ contestId: other.contestId, cifss: { home: 1, away: 0 }, cifssUrl: 'u' }] } as unknown as CifssCrossCheck);
    writeBackVnnClaims(store, [annotated], new Set(), NOW);
    expect(store.ids()).toEqual([]);
  });
});
