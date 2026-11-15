/**
 * lib/claims/store.ts and lib/claims/file.ts: a source's read replaces exactly the scopes it read (`mergeRead`), a
 * claim stays on the fixture its ref names, and the file round-trips byte for byte, with `seenAt` written only where
 * it is not the file's own stamp.
 */

import { describe, expect, it } from 'vitest';

import { claimsFileOnDisk, claimsFileText, parseClaimsText } from '../../lib/claims/file';
import { ClaimStore } from '../../lib/claims/store';
import type { ClaimsFile, EditorClaim, MaxprepsClaim, MaxprepsGame, VnnClaim } from '../../lib/claims/types';

const OLD = '2026-10-01T15:00:00.000Z';
const NOW = '2026-10-02T15:00:00.000Z';

function game(contestId: string, dateKey: string, home: string, away: string, teamIds: [string, string], fetchedAt: string): MaxprepsGame {
  return {
    contestId,
    dateLocal: `${dateKey}T16:00:00`,
    dateUtc: `${dateKey}T23:00:00Z`,
    dateKey,
    isDateTba: false,
    isTimeTba: false,
    home: { teamId: teamIds[0], slug: home, name: home, score: null, result: null },
    away: { teamId: teamIds[1], slug: away, name: away, score: null, result: null },
    site: 'home',
    status: 'scheduled',
    isLeague: true,
    leagueDivision: null,
    contestTypes: { home: 0, away: 0 },
    countsFor: null,
    postseason: null,
    otPeriods: 0,
    isOt: false,
    isForfeit: false,
    forfeitBy: null,
    decider: null,
    shootout: null,
    venue: { text: null },
    urls: { maxpreps: null, nfhsStream: null, goFan: null },
    provenance: { scores: 'maxpreps-api', schedule: 'maxpreps-api', fetchedAt },
  };
}

const guid = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;
function claim(n: number, seenAt: string, teamIds: [string, string] = ['t-home', `t-away-${n}`]): MaxprepsClaim {
  return { ref: guid(n), seenAt, game: game(guid(n), `2026-09-0${n}`, `home-${n}`, `away-${n}`, teamIds, seenAt) };
}

function storeOf(claims: MaxprepsClaim[]): ClaimStore {
  const store = new ClaimStore();
  store.mergeRead('maxpreps', () => false, claims, (c) => store.create(`${c.game.dateKey}-${c.game.away.slug}-at-${c.game.home.slug}`));
  return store;
}

describe('mergeRead', () => {
  it('replaces the read scopes, keeps the unread ones with their older seenAt, and places new rows', () => {
    const store = storeOf([claim(1, OLD), claim(2, OLD, ['t-failed', 't-x']), claim(3, OLD)]);
    const before = store.fixtureOf('maxpreps', guid(1));
    // Team t-failed's feed was not read: its contest is out of scope. Contest 3 is no longer listed; 4 is new.
    const inScope = (c: MaxprepsClaim) => c.game.home.teamId !== 't-failed';
    const placed: string[] = [];
    const vanished = store.mergeRead('maxpreps', inScope, [claim(1, NOW), claim(4, NOW)], (c) => {
      placed.push(c.ref);
      return store.create('new');
    });
    expect(vanished).toEqual([guid(3)]);
    expect(placed).toEqual([guid(4)]);
    expect(store.fixtureOf('maxpreps', guid(1))).toBe(before);
    expect(store.get(before!)?.claims.maxpreps?.seenAt).toBe(NOW);
    expect(store.get(store.fixtureOf('maxpreps', guid(2))!)?.claims.maxpreps?.seenAt).toBe(OLD);
    expect(store.fixtureOf('maxpreps', guid(3))).toBeUndefined();
    expect(store.fixtureOf('maxpreps', guid(4))).toBe('new');
  });

  it('refuses a new row with nowhere to go', () => {
    const store = new ClaimStore();
    expect(() => store.mergeRead('maxpreps', () => true, [claim(1, NOW)])).toThrow(/no fixture for the new maxpreps claim/);
  });
});

describe('attach, detach, merge and gc', () => {
  it('moves a ref between fixtures, keeps a multi-claim source sorted by ref, and drops emptied fixtures', () => {
    const store = storeOf([claim(1, NOW), claim(2, NOW)]);
    const [a, b] = store.ids();
    const vnn = (ref: string): VnnClaim => ({ ref, seenAt: NOW, applied: { timeConfirmed: true } });
    store.attach(a, 'vnn', vnn('z:1'));
    store.attach(a, 'vnn', vnn('a:1'));
    expect(store.get(a)?.claims.vnn?.map((c) => c.ref)).toEqual(['a:1', 'z:1']);
    store.attach(b, 'vnn', vnn('z:1'));
    expect(store.fixtureOf('vnn', 'z:1')).toBe(b);
    expect(store.get(a)?.claims.vnn?.map((c) => c.ref)).toEqual(['a:1']);
    store.detach('maxpreps', guid(2));
    store.detach('vnn', 'z:1');
    store.gc();
    expect(store.ids()).toEqual([a]);
  });

  it('merges one fixture into another under an alias, and never mints the merged id again', () => {
    const store = storeOf([claim(1, NOW)]);
    const [a] = store.ids();
    const b = store.create('other');
    store.attach(b, 'vnn', { ref: 's:1', seenAt: NOW });
    store.merge(b, a);
    expect(store.get(a)?.aliases).toEqual(['other']);
    expect(store.fixtureOf('vnn', 's:1')).toBe(a);
    expect(store.get('other')).toBeUndefined();
    expect(store.create('other')).toBe('other~2');
    expect(() => store.merge(store.create('x'), 'nope')).toThrow(/no such fixture/);
  });

  it('fromFile discards the editor’s claims (rebuilt every run) and the fixtures they alone held', () => {
    const store = storeOf([claim(1, NOW)]);
    const editor: EditorClaim = {
      ref: '2026-09-09-a-at-b',
      seenAt: NOW,
      fixture: { dateKey: '2026-09-09', home: 'b', away: 'a', sources: {}, listing: { source: 's', url: null } as never },
    };
    store.attach(store.create(editor.ref), 'editor', editor);
    store.attach(store.ids()[0], 'editor', { ...editor, ref: 'linked' });
    const back = ClaimStore.fromFile(store.toFile(NOW, 'field-hockey'));
    expect(back.ids()).toEqual([store.fixtureOf('maxpreps', guid(1))]);
    expect(back.fixtureOf('editor', 'linked')).toBeUndefined();
    // The listing fixture's id is free again, so this run rebuilds it under the same name.
    expect(back.create(editor.ref)).toBe(editor.ref);
  });
});

describe('the file', () => {
  function file(): ClaimsFile {
    return storeOf([claim(1, NOW), claim(2, OLD)]).toFile(NOW, 'field-hockey');
  }

  it('leaves out seenAt where it is the file’s stamp, and every MaxPreps game’s provenance.fetchedAt; reading restores both', () => {
    const disk = claimsFileOnDisk(file()) as { fixtures: Array<{ claims: { maxpreps: { seenAt?: string; game: { provenance: object } } } }> };
    expect(disk.fixtures.map((f) => f.claims.maxpreps.seenAt)).toEqual([undefined, OLD]);
    for (const f of disk.fixtures) expect(f.claims.maxpreps.game.provenance).not.toHaveProperty('fetchedAt');
    expect(parseClaimsText(claimsFileText(file()))).toEqual(file());
  });

  it('writes the same bytes again after a round trip, and sorts fixtures by code unit', () => {
    const text = claimsFileText(file());
    const again = claimsFileText(ClaimStore.fromFile(parseClaimsText(text)).toFile(NOW, 'field-hockey'));
    expect(again).toBe(text);
    const store = new ClaimStore();
    for (const id of ['b', 'B', 'a~2', 'a']) store.attach(store.create(id), 'vnn', { ref: id, seenAt: NOW });
    expect(store.toFile(NOW, 'soccer').fixtures.map((f) => f.id)).toEqual(['B', 'a', 'a~2', 'b']);
  });
});
