/**
 * The research reference cases (tests/fixtures/mcal/reference/mcal-bracket.test.ts.txt, 7 cases) ported onto
 * the 2025 MCAL bracket fixture (tests/fixtures/mcal/bracket-2025.json, MaxPreps season 25-26) and
 * lib/postseason.ts. The 2025 bracket is the regression test for the semifinal re-seeding rule:
 *  - QF 2025-10-28: University 1, Lick-Wilmerding 0; Marin Catholic 4, Convent of the Sacred Heart 1.
 *  - SF 2025-10-29: University 1 at Redwood 4; Marin Catholic 0 at Tamalpais 1.
 *  - F  2025-10-31: Redwood v Tamalpais at Tamalpais (MaxPreps 2-1; actually 0-0, Tam won the shootout).
 */

import { describe, expect, it } from 'vitest';

import bracket2025 from './fixtures/mcal/bracket-2025.json';
import { getLeague, type LeagueConfig } from '../lib/leagues';
import {
  SHOOTOUT_NOTE, buildLeagueTournament, finalGame, quarterfinals, seedsFromStandings, semifinals,
} from '../lib/postseason';
import { getTeamById } from '../lib/teams';
import type { Game, Standing, TournamentSlot } from '../lib/types';

const MCAL = getLeague('mcal');
const DIV = 'marin-county';

const slugOf = (teamId: string): string => {
  const t = getTeamById(teamId);
  if (!t) throw new Error(`2025 team ${teamId} is not in the registry`);
  return t.slug;
};
const RW = 'redwood', TM = 'tamalpais', MC = 'marin-catholic', LW = 'lick-wilmerding', UN = 'university-sf', CS = 'convent-sacred-heart';

const rec3 = { w: 0, l: 0, t: 0 };

/** The 2025 regular season as standings rows: places by points (3-1-0), as MCAL places them. */
function rowsOf(table: ReadonlyArray<{ teamId: string; w: number; l: number; t: number }>, places?: number[]): Standing[] {
  const pts = table.map((r) => 3 * r.w + r.t);
  return table.map((r, i) => {
    const place = places?.[i] ?? 1 + pts.filter((p) => p > pts[i]).length;
    const gp = r.w + r.l + r.t;
    const tied = table.filter((o, j) => j !== i && (places ? places[j] === place : pts[j] === pts[i])).map((o) => o.teamId);
    const computed = {
      gp, w: r.w, l: r.l, t: r.t, winPct: (r.w + r.t / 2) / gp, pts: pts[i], gf: 0, ga: 0, gd: 0,
      streak: null, last5: [], homeRecord: rec3, awayRecord: rec3, neutralRecord: rec3, place,
    };
    return {
      teamId: r.teamId, slug: slugOf(r.teamId), division: DIV, computed, overall: computed, reported: null,
      mismatch: false, tiebreak: { resolvedBy: 'points', note: '', tiedWith: tied, shared: tied.length > 0 },
      playoffStatus: place <= 2 ? 'bye' : place <= 6 ? 'tournament' : 'below-line', hasReportedResults: gp > 0,
    };
  });
}

const REGULAR_2025 = bracket2025.table;
const ROWS = rowsOf(REGULAR_2025);
const seeds = seedsFromStandings(ROWS, MCAL);
const seedOf = (slug: string) => {
  const s = seeds.find((x) => x.seat.some((t) => t.slug === slug));
  if (!s) throw new Error(`${slug} is not seeded`);
  return { seed: s.seed, slug };
};
const slugsIn = (slot: TournamentSlot): string[] => (slot.kind === 'seed' ? slot.seat.map((s) => s.slug) : []);
const seedIn = (slot: TournamentSlot): number | null => (slot.kind === 'seed' ? slot.seed : null);

describe('MCAL 2025 field hockey tournament', () => {
  it('seeds by points: Redwood 40, Tamalpais 39, Marin Catholic 34, Lick-Wilmerding 33, University 26, Convent 14', () => {
    expect(REGULAR_2025.map((r) => 3 * r.w + r.t)).toEqual([40, 39, 34, 33, 26, 14, 11, 10, 0]);
    expect(REGULAR_2025.map((r) => r.pts)).toEqual([40, 39, 34, 33, 26, 14, 11, 10, 0]);
    expect(seeds.map((s) => s.seat.map((t) => t.slug))).toEqual([[RW], [TM], [MC], [LW], [UN], [CS]]);
    expect(seeds.map((s) => s.seed)).toEqual(bracket2025.seeds.map((s) => s.seed));
    expect(seeds.map((s) => s.seat[0].teamId)).toEqual(bracket2025.seeds.map((s) => s.teamId));
  });

  it('seeds Redwood #1 on points although Tamalpais matched its winning percentage and swept it 2-0', () => {
    const pct = (r: (typeof REGULAR_2025)[number]) => (r.w + r.t / 2) / (r.w + r.l + r.t);
    expect(pct(REGULAR_2025[0])).toBe(pct(REGULAR_2025[1])); // 13.5/16 each
    expect(seedOf(RW).seed).toBe(1);
    expect(seedOf(TM).seed).toBe(2);
  });

  it('pairs the quarterfinals 5 at 4 and 6 at 3', () => {
    const [q1, q2] = quarterfinals(seeds, MCAL);
    expect([slugsIn(q1.away), slugsIn(q1.home)]).toEqual([[UN], [LW]]); // played at University in 2025 (51473ec5); the sheet's host rule says LW
    expect([slugsIn(q2.away), slugsIn(q2.home)]).toEqual([[CS], [MC]]); // 8ca393c6, Marin Catholic 4-1
  });

  it('sends the WORST remaining seed to #1 and the BEST remaining seed to #2', () => {
    // QF winners: #5 University (upset of #4 LW) and #3 Marin Catholic.
    const sf = semifinals(seeds, [seedOf(MC), seedOf(UN)], MCAL);
    expect(sf.map((p) => [seedIn(p.away), seedIn(p.home)])).toEqual([[5, 1], [3, 2]]);
    expect(sf.map((p) => [slugsIn(p.away), slugsIn(p.home)])).toEqual([
      [[UN], [RW]], // a3aee4a1 "MCAL Semi Finals": University 1 at Redwood 4
      [[MC], [TM]], // cb5f9d81: Marin Catholic 0 at Tamalpais 1
    ]);
    // The literal "smallest number at #1" reading would have produced Marin Catholic at Redwood.
    expect(slugsIn(sf[0].away)).not.toEqual([MC]);
  });

  it('is order-independent in the quarterfinal winners', () => {
    expect(semifinals(seeds, [seedOf(UN), seedOf(MC)], MCAL)).toEqual(semifinals(seeds, [seedOf(MC), seedOf(UN)], MCAL));
  });

  it('plays the final at Tamalpais even though Redwood was the #1 seed', () => {
    const f = finalGame([seedOf(RW), seedOf(TM)], MCAL);
    expect(f.site).toBe('Tamalpais');
    expect(f.site).toBe(MCAL.postseason.kind === 'league-tournament' ? MCAL.postseason.finalSite.label : null);
    expect([slugsIn(f.home), slugsIn(f.away)]).toEqual([[RW], [TM]]);
    // A fixed site, not "the higher seed hosts": the final's site is never null (null = the home seat's field).
    expect(f.site).not.toBeNull();
  });

  it('never seeds through a points tie on points alone', () => {
    // The reference threw on a points tie; here the table's tiebreak decides. TM to 40 points, level with RW.
    const tied = REGULAR_2025.map((r) => (slugOf(r.teamId) === TM ? { ...r, t: 4, l: 0 } : r));
    // Unresolved (shared 1st): both teams cover seats 1 and 2 — nobody is seeded by points alone.
    const shared = seedsFromStandings(rowsOf(tied), MCAL);
    expect(shared[0].seat.map((t) => t.slug).sort()).toEqual([RW, TM].sort());
    expect(shared[1].seat.map((t) => t.slug).sort()).toEqual([RW, TM].sort());
    // Resolved by MCAL criterion 1 (Tamalpais swept Redwood 2-0): Tamalpais 1st, Redwood 2nd.
    const resolved = seedsFromStandings(rowsOf(tied, [2, 1, 3, 4, 5, 6, 7, 8, 9]), MCAL);
    expect(resolved.slice(0, 2).map((s) => s.seat.map((t) => t.slug))).toEqual([[TM], [RW]]);
  });
});

describe('MCAL 2025 bracket, end to end with the 2025 results', () => {
  /** The 2026 config with the 2025 round dates (QF Tue Oct 28, SF Wed Oct 29, final Fri Oct 31). */
  const ps = MCAL.postseason;
  if (ps.kind !== 'league-tournament') throw new Error('MCAL has no league tournament');
  const dates: Record<string, string> = { 'play-in': '2025-10-24', 'qf-1': '2025-10-28', 'qf-2': '2025-10-28', 'sf-1': '2025-10-29', 'sf-2': '2025-10-29', final: '2025-10-31' };
  const MCAL_2025: LeagueConfig = { ...MCAL, postseason: { ...ps, rounds: ps.rounds.map((r) => ({ ...r, date: dates[r.id] })) } };

  const games: Game[] = bracket2025.postseason.map((c) => {
    const side = (s: (typeof c)['home']) => ({
      teamId: s.teamId, slug: slugOf(s.teamId), name: s.name, score: s.score, result: s.result as 'W' | 'L',
    });
    return {
      contestId: c.contestId, dateLocal: c.date, dateUtc: `${c.date}Z`, dateKey: c.date.slice(0, 10),
      isDateTba: false, isTimeTba: false, home: side(c.home), away: side(c.away), site: 'home', status: 'final',
      isLeague: false, leagueDivision: DIV, contestTypes: { home: c.contestType[0], away: c.contestType[1] },
      countsFor: null, postseason: { kind: 'mcal-tournament', leagueId: 'mcal', via: 'league-postseason-window' },
      otPeriods: c.overtimePeriodsPlayed, isOt: c.overtimePeriodsPlayed > 0, isForfeit: false, forfeitBy: null,
      decider: c.overtimePeriodsPlayed > 0 ? 'OT' : 'REG', shootout: null, venue: { text: c.location || null },
      recap: null, urls: { maxpreps: c.url, nfhsStream: null, goFan: null },
      provenance: { scores: 'maxpreps-api', schedule: 'maxpreps-api', fetchedAt: '2025-11-01T00:00:00Z' },
    };
  });

  it('rebuilds the 2025 bracket from the table and the five contests', () => {
    const p = buildLeagueTournament(MCAL_2025, ROWS, games, 'complete', '2025-11-01');
    expect(p.status).toBe('complete');
    expect(p.playIn).toBeNull();
    expect(p.games.map((g) => g.game?.contestId.slice(0, 8))).toEqual(['51473ec5', '8ca393c6', 'a3aee4a1', 'cb5f9d81', '3fb94e4a']);
    expect(p.games.map((g) => [slugsIn(g.away), slugsIn(g.home)])).toEqual([
      [[UN], [LW]], [[CS], [MC]], [[UN], [RW]], [[MC], [TM]], [[TM], [RW]],
    ]);
    // One-goal results (University 1-0, Tamalpais 1-0, the 2-1 final that was really a shootout) carry the caveat.
    expect(p.games.map((g) => g.note === SHOOTOUT_NOTE)).toEqual([true, false, false, true, true]);
  });
});
