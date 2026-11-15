/**
 * claimsFromSnapshot (lib/claims/from-snapshot.ts, §9): each MaxPreps row of the table, undone from a stored game.
 *
 *  - The committed snapshot's games the ledger corrects (date fc8be1f8, host 8f8d3fe5, result 7d6e0426, the result
 *    a bracket sheet gave dba373ca): the seeded claim, resolved through the `maxpreps` stage under the ledger, is
 *    the stored game's day, host and sides again, and names what it could not recover.
 *  - Every MaxPreps game of the committed snapshot: the same, for day and sides.
 *  - One case per row of the table: a clean contest, merged by the step that writes the row, comes back as it was,
 *    apart from the fields the row says are lost, which the claim names in `reconstructed`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { claimsFromSnapshot, maxprepsClaimFromGame } from '../../lib/claims/from-snapshot';
import { resolveMaxprepsClaim } from '../../lib/claims/resolve';
import type { MaxprepsClaim, Reconstructed } from '../../lib/claims/types';
import { datesAtLocal } from '../../lib/format';
import { LEDGER_VIEW } from '../../lib/fixtures/ledger';
import { GUID_RE } from '../../lib/game-id';
import { applyDateCorrection, pacificMidnightUtc } from '../../lib/pipeline/normalize';
import { flagConflictSentence, settleLevelFinal } from '../../lib/postseason/level-final';
import { applyHostCorrection } from '../../lib/results/host-correction';
import { applyResultCorrection } from '../../lib/results/result';
import { loadSnapshot } from '../../lib/snapshot/snapshot-load';
import type { Game, Snapshot } from '../../lib/types';
import { REPO } from '../helpers';

const snapshot: Snapshot = loadSnapshot(JSON.parse(readFileSync(path.join(REPO, 'data', 'snapshot.json'), 'utf8')) as unknown);
const LATER = '2026-11-20T15:00:00.000Z';

const stored = (prefix: string): Game => {
  const g = snapshot.games.find((x) => x.contestId.startsWith(prefix));
  if (!g) throw new Error(`no game ${prefix}`);
  return g;
};
const seeded = (g: Game, at = snapshot.fetchedAt): MaxprepsClaim => maxprepsClaimFromGame(g, at);
const where = (g: Pick<Game, 'dateKey' | 'dateLocal' | 'dateUtc' | 'isTimeTba' | 'site' | 'home' | 'away'>) => ({
  dateKey: g.dateKey, dateLocal: g.dateLocal, dateUtc: g.dateUtc, isTimeTba: g.isTimeTba, site: g.site, home: g.home.slug, away: g.away.slug,
});

describe('the committed snapshot’s ledger games', () => {
  it('date fc8be1f8: MaxPreps’ day and time come back; resolving puts the ledger’s day back', () => {
    const g = stored('fc8be1f8');
    const c = seeded(g);
    expect(c.game.dateLocal).toBe(g.provenance.dateCorrection?.maxprepsDateLocal);
    expect(c.game.isTimeTba).toBe(false);
    expect(c.game.provenance).not.toHaveProperty('dateCorrection');
    expect(c.reconstructed).toEqual(['dateUtc', 'isDateTba']);
    expect(where(resolveMaxprepsClaim(c, LEDGER_VIEW))).toEqual(where(g));
  });

  it('host 8f8d3fe5: MaxPreps’ host comes back; resolving swaps the sides again', () => {
    const g = stored('8f8d3fe5');
    const c = seeded(g);
    expect(c.game.home.slug).toBe('tamalpais');
    expect(c.game.away.slug).toBe('redwood');
    expect(c.game.home.score).toBe(g.away.score);
    const r = resolveMaxprepsClaim(c, LEDGER_VIEW);
    expect(where(r)).toEqual(where(g));
    expect(r.home).toEqual(g.home);
    expect(r.away).toEqual(g.away);
  });

  it('result 7d6e0426: MaxPreps’ level score comes back, its flags and ending marked as reconstructed', () => {
    const g = stored('7d6e0426');
    const c = seeded(g);
    expect([c.game.home.score, c.game.away.score]).toEqual([1, 1]);
    expect(c.game.shootout).toBeNull();
    expect(c.game.provenance).not.toHaveProperty('resultCorrection');
    expect(c.reconstructed).toEqual(expect.arrayContaining(['flags', 'decider', 'forfeit', 'shootout', 'resultConflict']));
    expect(where(resolveMaxprepsClaim(c, LEDGER_VIEW))).toEqual(where(g));
  });

  it('sheet result dba373ca: MaxPreps listed it with no score, so the claim has none', () => {
    const g = stored('dba373ca');
    const c = seeded(g);
    expect(c.game.status).toBe('score-pending');
    expect([c.game.home.score, c.game.away.score, c.game.decider]).toEqual([null, null, null]);
    expect(where(resolveMaxprepsClaim(c, LEDGER_VIEW))).toEqual(where(g));
  });
});

describe('every MaxPreps game of the committed snapshot', () => {
  const file = claimsFromSnapshot(snapshot, LEDGER_VIEW)!;
  const byRef = new Map(file.fixtures.flatMap((f) => (f.claims.maxpreps ? [[f.claims.maxpreps.ref, f.claims.maxpreps] as const] : [])));

  it('has a claim, stamped with the snapshot', () => {
    const guids = snapshot.games.filter((g) => GUID_RE.test(g.contestId));
    expect(byRef.size).toBe(guids.length);
    expect(file.fetchedAt).toBe(snapshot.fetchedAt);
  });

  it('resolves to the stored game’s day and sides, and its site unless a round’s site replaced it', () => {
    for (const g of snapshot.games.filter((x) => GUID_RE.test(x.contestId))) {
      const c = byRef.get(g.contestId)!;
      const r = resolveMaxprepsClaim(c, LEDGER_VIEW);
      expect([r.dateKey, r.home.slug, r.away.slug, r.home.teamId, r.away.teamId], g.contestId).toEqual([
        g.dateKey, g.home.slug, g.away.slug, g.home.teamId, g.away.teamId,
      ]);
      if (!c.reconstructed?.includes('site')) expect(r.site, g.contestId).toBe(g.site);
      // A time the bracket sheet wrote onto a time-TBA contest is the sheet's, not MaxPreps'.
      if (g.provenance.schedule !== 'cifsds-sheet') expect(r.dateLocal, g.contestId).toBe(g.dateLocal);
    }
  });
});

describe('each MaxPreps row of §9, undone', () => {
  // A plain contest: a final decided in play between two CCS teams (no shootout section), with nothing merged in.
  const base: Game = (() => {
    const g = snapshot.games.find(
      (x) =>
        GUID_RE.test(x.contestId) && x.status === 'final' && x.decider === 'REG' && x.home.score !== x.away.score &&
        ['de-anza', 'el-camino'].includes(x.leagueDivision ?? '') && !x.venue.name && !x.isTimeTba &&
        Object.keys(x.provenance).every((k) => ['scores', 'schedule', 'fetchedAt', 'maxprepsModifiedOn', 'contentChangedAt'].includes(k)),
    );
    if (!g) throw new Error('no plain SCVAL final in the committed snapshot');
    return g;
  })();
  const clean = seeded(base);
  const pending: Game = {
    ...base, status: 'score-pending', decider: null, home: { ...base.home, score: null, result: null }, away: { ...base.away, score: null, result: null },
    result: undefined,
  };
  const cleanPending = seeded(pending);
  /** The seeded claim of `merged`, after checking it names exactly `lost` as reconstructed. */
  const expectBack = (merged: Game, lost: Reconstructed[] = [], at = snapshot.fetchedAt) => {
    const c = seeded(merged, at);
    expect(c.reconstructed ?? []).toEqual(lost);
    return c;
  };

  it('a plain contest is its own claim: nothing reconstructed, nothing a later stage writes', () => {
    expect(clean.reconstructed).toBeUndefined();
    expect(clean.game).not.toHaveProperty('slug');
    expect(clean.game).not.toHaveProperty('result');
    expect(clean.game.countsFor).toBeNull();
    expect(clean.seenAt).toBe(base.provenance.fetchedAt);
    expect(Object.keys(clean.game.provenance).sort()).toEqual(['fetchedAt', 'maxprepsModifiedOn', 'schedule', 'scores'].filter((k) => k in base.provenance));
  });

  it('a tally read from another source’s score is dropped', () => {
    const merged: Game = { ...base, decider: 'SO', shootout: { home: 3, away: 2 }, provenance: { ...base.provenance, shootoutSource: { source: 'sblive', score: { home: 4, away: 3 } } } };
    expect(expectBack(merged).game.shootout).toBeNull();
  });

  it('a settled level final: the overtime decider and the flag sentence come back', () => {
    const level: Game = {
      ...base,
      home: { ...base.home, score: 1, result: 'W' },
      away: { ...base.away, score: 1, result: 'L' },
      postseason: { kind: 'ccs' } as Game['postseason'],
      provenance: { ...base.provenance, resultConflict: `${flagConflictSentence({ ...base.home, score: 1, result: 'W' }, { ...base.away, score: 1, result: 'L' })} MaxPreps' two team feeds disagree.` },
    };
    const settled = settleLevelFinal(level);
    expect(settled.decider).toBe('SO');
    const c = expectBack(settled);
    expect(c.game.decider).toBe('REG');
    expect(c.game.provenance.resultConflict).toBe(level.provenance.resultConflict);
  });

  it('box-score overtime goes, and an adjudicated score is MaxPreps’ again', () => {
    const boxed: Game = { ...base, otPeriods: 1, isOt: true, decider: 'OT', provenance: { ...base.provenance, overtimeEvidence: 'box-score' } };
    expect(expectBack(boxed).game).toEqual(clean.game);
    const adjudicated: Game = {
      ...base,
      home: { ...base.home, score: 9, result: 'W' },
      away: { ...base.away, score: 0, result: 'L' },
      provenance: {
        ...base.provenance,
        adjudicated: { maxpreps: { home: base.home.score!, away: base.away.score!, homeResult: base.home.result, awayResult: base.away.result }, by: ['si.com', 'a box score'] },
      },
    };
    expect(expectBack(adjudicated).game).toEqual(clean.game);
  });

  it('a ledger result: MaxPreps’ score and overtime come back; flags, ending, forfeit, tally and conflict are reconstructed', () => {
    const corrected = applyResultCorrection(base, {
      [base.contestId]: { goals: { [base.home.slug!]: 2, [base.away.slug!]: 2 }, otPeriods: 1, shootout: { [base.home.slug!]: 4, [base.away.slug!]: 3 }, source: 'a press report', url: null },
    });
    expect(corrected.provenance.resultCorrection).toBeDefined();
    const c = expectBack(corrected, ['flags', 'decider', 'forfeit', 'resultConflict', 'shootout']);
    expect(c.game).toEqual(clean.game);
  });

  it('a winner reported for a game with no score: the flags go', () => {
    const reported: Game = {
      ...pending,
      home: { ...pending.home, result: 'W' },
      away: { ...pending.away, result: 'L' },
      provenance: { ...pending.provenance, reportedWinner: { source: 's', url: null } },
    };
    expect(expectBack(reported).game).toEqual(cleanPending.game);
  });

  it('si.com rule 3 (a score for a pending contest) and rule 4 (a score over MaxPreps’ own)', () => {
    const rule3: Game = {
      ...pending, status: 'final', decider: 'REG',
      home: { ...pending.home, score: 2, result: 'W' }, away: { ...pending.away, score: 0, result: 'L' },
      urls: { ...pending.urls, sblive: 'https://www.si.com/high-school/stats/x' },
      provenance: { ...pending.provenance, scores: 'sblive', backfill: { rule: 'score-pending', sbliveGameId: '1', maxpreps: null, note: 'n' } },
    };
    expect(expectBack(rule3).game).toEqual(cleanPending.game);
    const rule4: Game = {
      ...base,
      home: { ...base.home, score: 7, result: 'W' }, away: { ...base.away, score: 6, result: 'L' },
      urls: { ...base.urls, sblive: 'https://www.si.com/high-school/stats/x' },
      provenance: {
        ...base.provenance, scores: 'sblive',
        backfill: { rule: 'contradictory-result', sbliveGameId: '1', maxpreps: { home: base.home.score!, away: base.away.score! }, note: 'n' },
        scoreConflict: { sblive: { home: base.home.score!, away: base.away.score! }, note: 'n' },
      },
    };
    expect(expectBack(rule4, ['flags', 'decider']).game).toEqual(clean.game);
  });

  it('a bracket-sheet score on a contest MaxPreps had pending: the status and seenAt are reconstructed', () => {
    const sheetRun = '2026-11-14T15:00:00.000Z';
    const filled: Game = {
      ...pending, status: 'final', decider: 'REG',
      home: { ...pending.home, score: 3, result: 'W' }, away: { ...pending.away, score: 1, result: 'L' },
      urls: { ...pending.urls, cifsds: 'https://docs.google.com/spreadsheets/d/x' },
      provenance: { ...pending.provenance, scores: 'cifsds-sheet', sectionSheet: { rule: 'score-pending', note: 'n' }, fetchedAt: sheetRun },
    };
    const c = expectBack(filled, ['status', 'seenAt'], LATER);
    expect(c.seenAt).toBe(sheetRun);
    expect(c.game).toEqual({ ...cleanPending.game, provenance: { ...cleanPending.game.provenance, fetchedAt: sheetRun } });
  });

  it('a bracket-sheet time on a time-TBA contest: MaxPreps’ time TBA comes back', () => {
    const tba: Game = { ...pending, dateLocal: `${pending.dateKey}T00:00:00`, dateUtc: pacificMidnightUtc(pending.dateKey), isTimeTba: true };
    const timed: Game = {
      ...tba, ...datesAtLocal(tba.dateKey, '15:30'),
      urls: { ...tba.urls, cifsds: 'https://docs.google.com/spreadsheets/d/x' },
      provenance: { ...tba.provenance, schedule: 'cifsds-sheet' },
    };
    expect(expectBack(timed).game).toEqual(seeded(tba).game);
  });

  it('a ledger host and day: MaxPreps’ sides and day come back, dateUtc and isDateTba reconstructed', () => {
    const swapped = applyHostCorrection(base, { [base.contestId]: { home: base.away.slug!, source: 'a source', url: null } });
    expect(expectBack(swapped).game).toEqual(clean.game);
    const moved = applyDateCorrection(base, { dateKey: '2026-09-30', source: 'a source' });
    const c = expectBack(moved, ['dateUtc', 'isDateTba']);
    expect(c.game).toEqual(clean.game);
  });

  it('the official step’s league-flag note is not the contest’s; normalize’s own is kept', () => {
    const official: Game = { ...base, provenance: { ...base.provenance, leagueFlagConflict: 'Not on the official schedule' } };
    expect(expectBack(official).game.provenance).not.toHaveProperty('leagueFlagConflict');
    const own: Game = { ...base, provenance: { ...base.provenance, leagueFlagConflict: 'contestType disagrees between team rows (A:0, B:1)' } };
    expect(expectBack(own).game.provenance.leagueFlagConflict).toBe(own.provenance.leagueFlagConflict);
  });

  it('a venue name: kept, and marked, since MaxPreps’ note and a school calendar both write it', () => {
    const named: Game = { ...base, venue: { ...base.venue, name: 'Field 2' }, timeConfirmed: true };
    const c = expectBack(named, ['venue']);
    expect(c.game.venue.name).toBe('Field 2');
    expect(c.game).not.toHaveProperty('timeConfirmed');
  });
});
