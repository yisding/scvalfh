/**
 * lib/engine/standings/missing.ts: missingOfficialResults (SPEC §5.2): official fixtures with no result in a
 * league with no official schedule (EAL), and on synthetic fixtures.
 */

import { describe, expect, it } from 'vitest';

import { getLeague } from '@/lib/config/leagues';
import { missingOfficialResults } from '@/lib/engine/standings';
import type { OfficialFixture } from '@/lib/model/fixture';
import { game } from '@/tests/support/game-builder';

describe('standings: league results missing in a league with no official schedule (EAL)', () => {
  const TODAY = '2026-10-04';
  const pendingA = game({ home: 'corning', away: 'pleasant-valley', date: '2026-09-29', status: 'score-pending' });
  const pendingB = game({ home: 'chico', away: 'corning', date: '2026-10-01', status: 'score-pending' });
  const postponed = game({ home: 'lassen', away: 'bella-vista', date: '2026-09-30', status: 'postponed' });
  const played = game({ home: 'chico', away: 'davis', hs: 1, as: 1, date: '2026-09-28', results: { home: 'W', away: 'L' } });
  const future = game({ home: 'davis', away: 'pleasant-valley', date: '2026-10-28' });
  const todays = game({ home: 'lassen', away: 'davis', date: TODAY });
  const nonLeague = game({ home: 'chico', away: 'davis', date: '2026-09-01', league: false });
  const crossLeague = game({ home: 'chico', away: 'tamalpais', date: '2026-09-02', status: 'score-pending' });
  const all = [pendingA, pendingB, postponed, played, future, todays, nonLeague, crossLeague];

  it('lists the counted EAL games dated before today with no result, and postponed ones apart', () => {
    for (const g of [pendingA, pendingB, postponed, future, todays]) expect(g.countsFor).toBe('eal');
    const rows = missingOfficialResults(all, [], 'eal', TODAY);
    expect(rows.map((r) => [r.kind, r.dateKey, r.game?.contestId])).toEqual([
      ['missing', '2026-09-29', pendingA.contestId],
      ['postponed', '2026-09-30', postponed.contestId],
      ['missing', '2026-10-01', pendingB.contestId],
    ]);
    expect(rows[0]).toMatchObject({
      awayName: 'Pleasant Valley', homeName: 'Corning', awaySlug: 'pleasant-valley', homeSlug: 'corning',
    });
  });

  it('needs no official fixture, and ignores any passed for another division', () => {
    const stray = {
      id: 'pcal:2026-09-20:carmel@salinas', league: 'pcal', division: 'pcal', dateKey: '2026-09-20', time: null,
      awayName: 'Carmel', homeName: 'Salinas', awaySlug: 'carmel', homeSlug: 'salinas', source: 'pcal-pdf',
    } as const;
    expect(missingOfficialResults(all, [stray], 'eal', TODAY)).toEqual(missingOfficialResults(all, [], 'eal', TODAY));
    // A future game is not missing; on its own date it is not missing yet either.
    expect(missingOfficialResults([future, todays], [], 'eal', TODAY)).toEqual([]);
  });

  it('leaves fixture-backed divisions on their official schedule', () => {
    // An unstamped, past, score-pending game between two PCAL teams is not a missing official result.
    const pcal = game({ home: 'carmel', away: 'salinas', date: '2026-09-20', status: 'score-pending', official: null });
    expect(missingOfficialResults([pcal], [], 'pcal', TODAY)).toEqual([]);
  });
});

describe('missingOfficialResults (§5.2)', () => {
  const fixture = (over: Partial<OfficialFixture>): OfficialFixture => ({
    id: 'santa-teresa:2026-09-24:prospect@del-mar',
    league: 'bval',
    division: 'santa-teresa',
    dateKey: '2026-09-24',
    time: null,
    awayName: 'Prospect',
    homeName: 'Del Mar',
    awaySlug: 'prospect',
    homeSlug: 'del-mar',
    source: 'bval-docx',
    ...over,
  });

  it('lists past unmatched fixtures and matched contests with no result; postponed separately', () => {
    const pending = game({ home: 'live-oak', away: 'westmont', date: '2026-09-25', status: 'score-pending' });
    const postponed = game({ home: 'sobrato', away: 'silver-creek', date: '2026-09-26', status: 'postponed' });
    const finalGame = game({ home: 'live-oak', away: 'prospect', hs: 1, as: 0, date: '2026-09-23' });
    const future = game({ home: 'del-mar', away: 'westmont', date: '2026-10-05' });
    const other = game({ home: 'leigh', away: 'leland', date: '2026-09-20' });
    const rows = missingOfficialResults(
      [pending, postponed, finalGame, future, other],
      [
        fixture({}),
        fixture({ id: 'santa-teresa:2026-10-09:x@y', dateKey: '2026-10-09' }),
        fixture({ id: 'mt-hamilton:2026-09-01:a@b', division: 'mt-hamilton' }),
      ],
      'santa-teresa',
      '2026-10-02',
    );
    expect(rows.map((r) => [r.kind, r.dateKey])).toEqual([
      ['missing', '2026-09-24'],
      ['missing', '2026-09-25'],
      ['postponed', '2026-09-26'],
    ]);
    expect(rows[0].game).toBeNull();
    expect(rows[1].game?.contestId).toBe(pending.contestId);
    expect(rows[1].homeSlug).toBe('live-oak');
    // 'today' itself is not in the past.
    expect(missingOfficialResults([pending], [], 'santa-teresa', '2026-09-25')).toEqual([]);
  });

  it('is the same function for every league’s config (SCVAL included)', () => {
    expect(getLeague('scval').divisions.map((d) => missingOfficialResults([], [], d.id, '2026-12-01'))).toEqual([[], []]);
  });
});
