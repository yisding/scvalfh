/**
 * The bracket sheet's claims (pipeline inversion P4, §7.6): seeded from a snapshot's games and rewritten from each
 * run's published games, read back as the rows a tab the run does not read carries. The rows are the ones the
 * previous snapshot's games show (lib/postseason/sds-sheet-results.ts sheetResultsFromGames), in that snapshot's
 * order and with the host it published, and each `cifsds:` game is a fixture of its own, which the evidence-only
 * sources' claims about it go to.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ledgerEditor } from '../../lib/claims/editor';
import { claimsFromSnapshot } from '../../lib/claims/from-snapshot';
import { fixtureOfContest } from '../../lib/claims/published';
import { cifssEvidenceFrom, recordCifssClaims } from '../../lib/claims/sources/cifss';
import { sheetClaimRef, storedSheetRows, writeBackSheetClaims } from '../../lib/claims/sources/sds-sheet';
import { ClaimStore } from '../../lib/claims/store';
import { SDS_BRACKETS_FILE } from '../../lib/postseason/sds-brackets-file';
import { decideSdsSheet, sheetFixturesFromGames, sheetResultsFromGames } from '../../lib/postseason/sds-sheet-results';
import { loadSnapshot } from '../../lib/snapshot/snapshot-load';
import type { CifssCrossCheck, Game, Snapshot } from '../../lib/types';
import { REPO } from '../helpers';

const committed = loadSnapshot(JSON.parse(readFileSync(path.join(REPO, 'data', 'snapshot.json'), 'utf8')) as unknown);
const editor = ledgerEditor(committed.fetchedAt).view;
const file = SDS_BRACKETS_FILE;
const NOW = '2026-11-16T15:00:00.000Z';
const seeded = (snapshot: Snapshot) => ClaimStore.fromFile(claimsFromSnapshot(snapshot, editor));
const sheetGames = (snapshot: Snapshot) => snapshot.games.filter((g) => g.contestId.startsWith('cifsds:'));

describe('the bracket sheet’s claims', () => {
  it('the committed snapshot has sheet games to carry', () => {
    expect(sheetGames(committed).length).toBeGreaterThan(0);
  });

  it('a carried tab from the claims is the tab carried from the snapshot: the same rows, hosts and order', () => {
    const stored = storedSheetRows(seeded(committed));
    expect(stored.results).toEqual(sheetResultsFromGames(committed.games, file));
    expect(stored.fixtures).toEqual(sheetFixturesFromGames(committed.games, file));
  });

  it('each sheet game is a fixture of its own, holding its row and published host', () => {
    const store = seeded(committed);
    for (const g of sheetGames(committed)) {
      const id = fixtureOfContest(store, g.contestId);
      expect(id, g.contestId).toBeDefined();
      const f = store.get(id as string)!;
      expect(f.claims.maxpreps).toBeUndefined();
      expect(f.claims.sdsSheet).toMatchObject({ host: g.home.slug, published: { contestId: g.contestId, dateLocal: g.dateLocal } });
    }
  });

  it('the host survives a carry: a game the sheet hosts away from the better place keeps its home side', () => {
    const [g] = sheetGames(committed);
    // Each side keeps its own score and result; only which school hosts changes.
    const swapped: Game = { ...g, contestId: `cifsds:${g.home.slug}-at-${g.away.slug}`, home: { ...g.away }, away: { ...g.home } };
    const snapshot = { ...committed, games: [swapped] };
    const { results } = storedSheetRows(seeded(snapshot));
    expect(results.map((r) => r.host)).toEqual([swapped.home.slug]);
    const decided = decideSdsSheet({ games: [], results, file, windowFirst: '2026-11-02', sheetUrl: 'u', fetchedAt: NOW });
    expect(decided.added.map((a) => [a.contestId, a.home.slug])).toEqual([[swapped.contestId, swapped.home.slug]]);
  });

  it('is rewritten from the published games: a row gone loses its claim, and an unread tab’s row keeps its seenAt', () => {
    const store = seeded(committed);
    const [g] = sheetGames(committed);
    const ref = sheetClaimRef(sheetResultsFromGames([g], file)[0]);
    const id = store.fixtureOf('sdsSheet', ref) as string;
    writeBackSheetClaims(store, committed.games, file, () => false, NOW);
    expect(store.get(id)?.claims.sdsSheet?.seenAt).toBe(committed.fetchedAt);
    writeBackSheetClaims(store, committed.games, file, () => true, NOW);
    expect(store.get(id)?.claims.sdsSheet?.seenAt).toBe(NOW);
    writeBackSheetClaims(store, committed.games.filter((x) => x !== g), file, () => true, NOW);
    expect(store.fixtureOf('sdsSheet', ref)).toBeUndefined();
    store.gc();
    expect(store.get(id)).toBeUndefined();
  });

  it('a cifsshome.org row about a sheet game goes to the game’s fixture and is read back from it', () => {
    const store = seeded(committed);
    const [g] = sheetGames(committed);
    const report = { cifssFetchedAt: NOW, conflicts: [{ contestId: g.contestId, cifss: { home: 1, away: 0 }, cifssUrl: 'u' }] } as unknown as CifssCrossCheck;
    recordCifssClaims(store, report);
    expect(store.get(fixtureOfContest(store, g.contestId) as string)?.claims.cifss?.map((c) => c.ref)).toEqual([`contest:${g.contestId}`]);
    // No report given: the evidence comes from the claim alone.
    expect(cifssEvidenceFrom(store, undefined)(g.contestId)).toEqual({ cifss: { home: 1, away: 0 }, cifssUrl: 'u' });
  });
});
