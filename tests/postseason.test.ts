/** lib/postseason.ts — the MCAL tournament (SPEC §6.2): every sixthPlaceRule branch, the builders and status. */

import { describe, expect, it } from 'vitest';

import { getLeague } from '../lib/leagues';
import {
  EARLIER_MEETING_NOTE, SHOOTOUT_NOTE, buildLeagueTournament, finalGame, matchTournamentGames, quarterfinals,
  seedsFromStandings, semifinals, sixthPlaceRule,
} from '../lib/postseason';
import { getTeamBySlug } from '../lib/teams';
import type { Game, Standing, TiebreakStage } from '../lib/types';

const MCAL = getLeague('mcal');
const DIV = 'marin-county';

// Draw numbers: AW 1, R 2, T 3, B 4, LW 5, U 6, MC 7, CSH 8, MA 9.
const AW = 'archie-williams', RW = 'redwood', TM = 'tamalpais', BK = 'berkeley', LW = 'lick-wilmerding';
const UN = 'university-sf', MC = 'marin-catholic', CS = 'convent-sacred-heart', MA = 'marin-academy';

const idOf = (slug: string): string => {
  const t = getTeamBySlug(slug);
  if (!t) throw new Error(`no team ${slug}`);
  return t.id;
};

const rec3 = { w: 0, l: 0, t: 0 };

/** A standings row with `pts` points at `place`; `tiedWith` slugs share the place. */
function row(slug: string, pts: number, place: number, opts: { tiedWith?: string[]; resolvedBy?: TiebreakStage; gp?: number } = {}): Standing {
  const gp = opts.gp ?? 16;
  const w = Math.floor(pts / 3);
  const t = pts % 3;
  const computed = {
    gp, w, l: Math.max(0, gp - w - t), t, winPct: gp ? (w + t / 2) / gp : 0, pts, gf: 0, ga: 0, gd: 0,
    streak: null, last5: [], homeRecord: rec3, awayRecord: rec3, neutralRecord: rec3, place,
  };
  const tiedWith = (opts.tiedWith ?? []).map(idOf);
  return {
    teamId: idOf(slug), slug, division: DIV, computed, overall: computed, reported: null, mismatch: false,
    tiebreak: { resolvedBy: opts.resolvedBy ?? 'points', note: '', tiedWith, shared: tiedWith.length > 0 },
    playoffStatus: place <= 2 ? 'bye' : place <= 6 ? 'tournament' : 'below-line',
    hasReportedResults: gp > 0,
  };
}

let seq = 0;
/** A game; `hs`/`as` null = not played. Regular-season league game unless `postseason` is given. */
function game(home: string, away: string, hs: number | null, as: number | null, date: string,
  opts: { postseason?: boolean; status?: Game['status'] } = {}): Game {
  const played = hs !== null && as !== null;
  const status = opts.status ?? (played ? 'final' : 'scheduled');
  const side = (slug: string, mine: number | null, theirs: number | null) => ({
    teamId: idOf(slug), slug, name: getTeamBySlug(slug)!.name, score: mine,
    result: status === 'final' && mine !== null && theirs !== null ? (mine > theirs ? 'W' as const : mine < theirs ? 'L' as const : 'T' as const) : null,
  });
  seq += 1;
  return {
    contestId: `c-${seq}`, dateLocal: `${date}T16:00:00`, dateUtc: `${date}T23:00:00Z`, dateKey: date,
    isDateTba: false, isTimeTba: false,
    home: side(home, hs, as), away: side(away, as, hs), site: 'home', status,
    isLeague: !opts.postseason, leagueDivision: DIV, contestTypes: { home: 0, away: 0 },
    countsFor: opts.postseason ? null : DIV,
    postseason: opts.postseason ? { kind: 'mcal-tournament', leagueId: 'mcal', via: 'league-postseason-window' } : null,
    otPeriods: 0, isOt: false, isForfeit: false, forfeitBy: null, decider: played ? 'REG' : null, shootout: null,
    venue: { text: null }, recap: null, urls: { maxpreps: null, nfhsStream: null, goFan: null },
    provenance: { scores: 'maxpreps-api', schedule: 'maxpreps-api', fetchedAt: '2026-10-02T15:00:00Z' },
  };
}

/** Both league meetings of a pair: [home score, away score] twice (first meeting in September). */
const pair = (a: string, b: string, first: [number, number] | null, second: [number, number] | null): Game[] => [
  first ? game(a, b, first[0], first[1], '2026-09-10') : game(a, b, null, null, '2026-09-10'),
  second ? game(b, a, second[0], second[1], '2026-10-15') : game(b, a, null, null, '2026-10-15'),
];

/** Five clear leaders with 40..28 points: AW, RW, TM, BK, LW at places 1-5. */
const TOP5 = [row(AW, 40, 1), row(RW, 37, 2), row(TM, 34, 3), row(BK, 31, 4), row(LW, 28, 5)];

describe('seedsFromStandings', () => {
  it('fills seeds 1..6 by place with the "cluster covers the slot" rule', () => {
    const rows = [...TOP5, row(UN, 20, 6, { tiedWith: [MC], resolvedBy: 'play-in' }), row(MC, 20, 6, { tiedWith: [UN], resolvedBy: 'play-in' }), row(CS, 10, 8), row(MA, 0, 9, { gp: 0 })];
    const seeds = seedsFromStandings(rows, MCAL);
    expect(seeds.map((s) => s.seed)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seeds.slice(0, 5).map((s) => s.seat.map((x) => x.slug))).toEqual([[AW], [RW], [TM], [BK], [LW]]);
    expect(seeds[5].seat.map((x) => x.slug)).toEqual([UN, MC]);
    expect(seeds[0].seat[0].teamId).toBe(idOf(AW));
  });

  it('never seeds a team with no results', () => {
    const rows = [AW, RW, TM, BK, LW, UN, MC, CS, MA].map((s) => row(s, 0, 1, { gp: 0 }));
    expect(seedsFromStandings(rows, MCAL).every((s) => s.seat.length === 0)).toBe(true);
  });
});

describe('sixthPlaceRule', () => {
  it('no play-in when the points bucket of 6th lies within 1..6', () => {
    const rows = [...TOP5.slice(0, 4), row(LW, 20, 5), row(UN, 20, 5), row(MC, 10, 7), row(CS, 5, 8), row(MA, 0, 9)];
    expect(sixthPlaceRule(rows, [], MCAL)).toEqual({ playInNeeded: 'no', contenders: [], host: null, seats: [], note: null });
  });

  it('no play-in when nobody has results', () => {
    const rows = [AW, RW, TM, BK, LW, UN, MC, CS, MA].map((s) => row(s, 0, 1, { gp: 0 }));
    expect(sixthPlaceRule(rows, [], MCAL).playInNeeded).toBe('no');
  });

  const twoWay = [...TOP5, row(UN, 20, 6), row(MC, 20, 6), row(CS, 10, 8), row(MA, 0, 9)];

  it('two-way 6-7: a 2-0 sweep places the winner 6th, no play-in', () => {
    // UN won 1-0 at home and 2-0 away.
    const d = sixthPlaceRule(twoWay, pair(UN, MC, [1, 0], [0, 2]), MCAL);
    expect(d).toEqual({
      playInNeeded: 'no', contenders: [], host: null, seats: [],
      note: 'San Francisco University won both meetings with Marin Catholic, so no play-in is needed.',
    });
    expect(sixthPlaceRule(twoWay, pair(UN, MC, [0, 1], [1, 0]), MCAL).note)
      .toBe('Marin Catholic won both meetings with San Francisco University, so no play-in is needed.');
  });

  it('two-way 6-7: a split means a play-in hosted by the HIGHER draw number', () => {
    const d = sixthPlaceRule(twoWay, pair(UN, MC, [2, 1], [3, 0]), MCAL);
    expect(d.playInNeeded).toBe('yes');
    expect([...d.contenders].sort()).toEqual([MC, UN].sort());
    expect(d.host).toBe(MC); // draw 7 > 6
    expect(d.seats).toEqual([6]);
    expect(d.note).toBeNull();
  });

  it('two-way 6-7: a win and a tie is not a sweep', () => {
    const d = sixthPlaceRule(twoWay, pair(UN, MC, [2, 1], [1, 1]), MCAL);
    expect(d.playInNeeded).toBe('yes');
    expect(d.host).toBe(MC);
  });

  it('two-way 6-7: an unplayed meeting makes it possible (host the higher draw number if it comes to that)', () => {
    const d = sixthPlaceRule(twoWay, pair(UN, MC, [0, 1], null), MCAL);
    expect(d.playInNeeded).toBe('possible');
    expect([...d.contenders].sort()).toEqual([MC, UN].sort());
    expect(d.host).toBe(MC);
  });

  const threeFive = [...TOP5.slice(0, 4), row(LW, 20, 5), row(UN, 20, 5), row(MC, 20, 5), row(CS, 10, 8), row(MA, 0, 9)];

  it('three-way 5-7: the lowest draw number is 5th; the winner of the other two’s earlier meeting hosts', () => {
    const games = [
      ...pair(LW, UN, [1, 1], [1, 1]), ...pair(LW, MC, [1, 1], [1, 1]),
      // UN (draw 6) won the earlier meeting with MC (draw 7) and lost the later one.
      ...pair(UN, MC, [2, 0], [1, 0]),
    ];
    const d = sixthPlaceRule(threeFive, games, MCAL);
    expect(d.playInNeeded).toBe('yes');
    expect([...d.contenders].sort()).toEqual([MC, UN].sort());
    expect(d.contenders).not.toContain(LW);
    expect(d.host).toBe(UN);
    expect(d.seats).toEqual([6]);
    expect(d.note).toBeNull();
  });

  it('three-way 5-7: a tied earlier meeting falls back to the higher draw number, with the note', () => {
    const games = [...pair(LW, UN, [1, 1], [1, 1]), ...pair(LW, MC, [1, 1], [1, 1]), ...pair(UN, MC, [0, 0], [0, 1])];
    const d = sixthPlaceRule(threeFive, games, MCAL);
    expect(d.playInNeeded).toBe('yes');
    expect(d.host).toBe(MC);
    expect(d.note).toBe(
      'The higher draw number hosts because their earlier meeting did not produce a winner (MCAL Tie-Breaking Criteria: "or # if needed").',
    );
    expect(d.note).toBe(EARLIER_MEETING_NOTE);
  });

  it('three-way 5-7: possible while a league game between any two of the three is unplayed', () => {
    const games = [...pair(LW, UN, [1, 1], null), ...pair(LW, MC, [1, 1], [1, 1]), ...pair(UN, MC, [2, 0], [1, 0])];
    const d = sixthPlaceRule(threeFive, games, MCAL);
    expect(d.playInNeeded).toBe('possible');
    expect(d.host).toBe(UN);
  });

  it('three-way 5-7: a 2-0 sweep between the two remaining teams settles 6th (as the table does)', () => {
    const games = [...pair(LW, UN, [1, 1], [1, 1]), ...pair(LW, MC, [1, 1], [1, 1]), ...pair(UN, MC, [2, 0], [0, 1])];
    const d = sixthPlaceRule(threeFive, games, MCAL);
    expect(d.playInNeeded).toBe('no');
    expect(d.note).toBe('San Francisco University won both meetings with Marin Catholic, so no play-in is needed.');
  });

  const threeSix = [...TOP5, row(UN, 20, 6), row(MC, 20, 6), row(CS, 20, 6), row(MA, 0, 9)];

  it('three-way 6-8: head-to-head picks the first play-in team, the criteria restart for the second', () => {
    // H2H among the three: CS 3-1, MC 2-2, UN 1-3 → CS first; restart between MC and UN: MC won both → MC.
    const games = [...pair(CS, UN, [1, 0], [0, 1]), ...pair(CS, MC, [1, 0], [0, 1]), ...pair(MC, UN, [1, 0], [0, 1])];
    // CS v UN: CS won both (home 1-0 at CS, then away 1-0); CS v MC: CS won both; MC v UN: MC won both.
    const d = sixthPlaceRule(threeSix, games, MCAL);
    expect(d.playInNeeded).toBe('yes');
    expect([...d.contenders].sort()).toEqual([CS, MC].sort());
    expect(d.host).toBe(CS); // draw 8 > 7
    expect(d.seats).toEqual([6]);
  });

  it('three-way 6-8: all level on head-to-head and above → draw numbers pick both (lowest first)', () => {
    const games = [...pair(CS, UN, [1, 1], [1, 1]), ...pair(CS, MC, [1, 1], [1, 1]), ...pair(MC, UN, [1, 1], [1, 1])];
    const d = sixthPlaceRule(threeSix, games, MCAL);
    expect([...d.contenders].sort()).toEqual([MC, UN].sort());
    expect(d.host).toBe(MC);
    expect(d.playInNeeded).toBe('yes');
  });

  it('three-way 6-8: record against the teams above decides when head-to-head is incomplete', () => {
    const games = [
      ...pair(CS, UN, [1, 1], null), ...pair(CS, MC, [1, 1], [1, 1]), ...pair(MC, UN, [1, 1], [1, 1]),
      // vs the top five: CS beat Archie Williams twice; nobody else has a result above the tie.
      ...pair(CS, AW, [2, 0], [0, 2]), ...pair(MC, AW, [0, 1], [1, 0]), ...pair(UN, AW, [0, 1], [1, 0]),
    ];
    const d = sixthPlaceRule(threeSix, games, MCAL);
    expect(d.contenders[0]).toBe(CS);
    expect(d.playInNeeded).toBe('possible'); // CS v UN unplayed
  });

  it('four-way 4-7: seeds one team with the chain, then the three-way 5-7 rule', () => {
    const rows = [...TOP5.slice(0, 3), row(BK, 20, 4), row(LW, 20, 4), row(UN, 20, 4), row(MC, 20, 4), row(CS, 10, 8), row(MA, 0, 9)];
    // BK won every meeting among the four → 4th. Then LW (draw 5) is 5th; UN and MC play in.
    const games = [
      ...pair(BK, LW, [1, 0], [0, 1]), ...pair(BK, UN, [1, 0], [0, 1]), ...pair(BK, MC, [1, 0], [0, 1]),
      ...pair(LW, UN, [1, 1], [1, 1]), ...pair(LW, MC, [1, 1], [1, 1]), ...pair(UN, MC, [0, 1], [0, 0]),
    ];
    const d = sixthPlaceRule(rows, games, MCAL);
    expect(d.playInNeeded).toBe('yes');
    expect([...d.contenders].sort()).toEqual([MC, UN].sort());
    expect(d.host).toBe(MC); // won the earlier meeting
  });

  it('four-way 6-9: two play-in teams, the other two placed below', () => {
    const rows = [...TOP5, row(UN, 20, 6), row(MC, 20, 6), row(CS, 20, 6), row(MA, 20, 6)];
    const games = [
      ...pair(MA, UN, [1, 0], [0, 1]), ...pair(MA, MC, [1, 0], [0, 1]), ...pair(MA, CS, [1, 0], [0, 1]),
      ...pair(UN, MC, [1, 1], [1, 1]), ...pair(UN, CS, [1, 0], [0, 1]), ...pair(MC, CS, [1, 1], [1, 1]),
    ];
    // MA 6-0 → first; restart among UN, MC, CS: UN 3-0-1 → second.
    const d = sixthPlaceRule(rows, games, MCAL);
    expect([...d.contenders].sort()).toEqual([MA, UN].sort());
    expect(d.host).toBe(MA); // draw 9
  });

  it('throws for a league without a tournament', () => {
    expect(() => sixthPlaceRule(twoWay, [], getLeague('scval'))).toThrow(/no league tournament/);
  });
});

const SEEDS = seedsFromStandings([...TOP5, row(UN, 20, 6), row(MC, 10, 7), row(CS, 5, 8), row(MA, 0, 9)], MCAL);
const one = (slot: unknown) => (slot as { seat: Array<{ slug: string }> }).seat.map((s) => s.slug);

describe('bracket builders', () => {
  it('quarterfinals: 5 at 4 and 6 at 3, Mon Oct 26 16:00, at the higher seed', () => {
    const [q1, q2] = quarterfinals(SEEDS, MCAL);
    expect([q1.id, q1.round, q1.date, q1.time, q1.site]).toEqual(['qf-1', 'quarterfinal', '2026-10-26', '16:00', null]);
    expect([one(q1.home), one(q1.away)]).toEqual([[BK], [LW]]);
    expect([one(q2.home), one(q2.away)]).toEqual([[TM], [UN]]);
    expect(q1.home).toMatchObject({ kind: 'seed', seed: 4 });
    expect(q2.away).toMatchObject({ kind: 'seed', seed: 6 });
  });

  it('quarterfinals: an undecided 6th seat waits for the play-in', () => {
    const seeds = seedsFromStandings([...TOP5, row(UN, 20, 6, { tiedWith: [MC] }), row(MC, 20, 6, { tiedWith: [UN] })], MCAL);
    expect(quarterfinals(seeds, MCAL)[1].away).toEqual({ kind: 'winner-of', gameId: 'play-in', label: 'Play-in winner' });
  });

  it('semifinals: rule slots until both quarterfinals are decided, then re-seeded', () => {
    const [s1, s2] = semifinals(SEEDS, null, MCAL);
    expect([s1.id, s1.date, s2.id]).toEqual(['sf-1', '2026-10-28', 'sf-2']);
    expect(one(s1.home)).toEqual([AW]);
    expect(s1.away).toEqual({ kind: 'rule', text: 'Lowest-ranked remaining seed' });
    expect(one(s2.home)).toEqual([RW]);
    expect(s2.away).toEqual({ kind: 'rule', text: 'Highest-ranked remaining seed of 3-6' });

    const [r1, r2] = semifinals(SEEDS, [{ seed: 3, slug: TM }, { seed: 5, slug: LW }], MCAL);
    expect(r1.away).toEqual({ kind: 'seed', seed: 5, seat: [{ teamId: idOf(LW), slug: LW }] });
    expect(r2.away).toEqual({ kind: 'seed', seed: 3, seat: [{ teamId: idOf(TM), slug: TM }] });
    expect(() => semifinals(SEEDS, [{ seed: 1, slug: AW }, { seed: 5, slug: LW }], MCAL)).toThrow();
  });

  it('final: Fri Oct 30 at Tamalpais, a fixed site', () => {
    const f = finalGame(null, MCAL);
    expect([f.id, f.round, f.date, f.time, f.site]).toEqual(['final', 'final', '2026-10-30', '16:00', 'Tamalpais']);
    expect(f.home).toEqual({ kind: 'winner-of', gameId: 'sf-1', label: 'Semifinal 1 winner' });
    const g = finalGame([{ seed: 5, slug: LW }, { seed: 2, slug: RW }], MCAL);
    expect([one(g.home), one(g.away)]).toEqual([[RW], [LW]]);
    expect(g.site).toBe('Tamalpais');
  });
});

describe('matchTournamentGames', () => {
  const [q1] = quarterfinals(SEEDS, MCAL);

  it('matches by unordered pair on or after the round date, tournament games only', () => {
    const regular = game(BK, LW, 3, 0, '2026-10-26');
    const early = game(LW, BK, 2, 0, '2026-10-20', { postseason: true });
    const real = game(LW, BK, 0, 3, '2026-10-26', { postseason: true });
    const [m] = matchTournamentGames([regular, early, real], [q1]);
    expect(m.game?.contestId).toBe(real.contestId);
    expect(m.note).toBeNull();
  });

  it('carries the shootout caveat on a one-goal result', () => {
    const [m] = matchTournamentGames([game(BK, LW, 2, 1, '2026-10-26', { postseason: true })], [q1]);
    expect(m.note).toBe('MCAL tournament games tied after overtime are decided by a shootout, and MaxPreps may record the shootout as goals.');
    expect(m.note).toBe(SHOOTOUT_NOTE);
  });

  it('leaves unresolved slots unmatched', () => {
    const [s1] = semifinals(SEEDS, null, MCAL);
    const [m] = matchTournamentGames([game(AW, LW, 2, 0, '2026-10-28', { postseason: true })], [s1]);
    expect(m.game).toBeNull();
  });
});

describe('buildLeagueTournament', () => {
  const rows = [...TOP5, row(UN, 20, 6, { tiedWith: [MC], resolvedBy: 'play-in' }), row(MC, 20, 6, { tiedWith: [UN], resolvedBy: 'play-in' }), row(CS, 10, 8), row(MA, 0, 9)];
  const league = pair(UN, MC, [2, 1], [3, 0]);

  it('projects during the regular season, with the play-in hosted by the higher draw number', () => {
    const p = buildLeagueTournament(MCAL, rows, league, 'regular', '2026-10-02');
    expect(p).toMatchObject({ leagueId: 'mcal', asOf: '2026-10-02', status: 'projected', playInNeeded: 'yes', notes: [] });
    expect(p.seeds[5].seat.map((s) => s.slug).sort()).toEqual([MC, UN].sort());
    expect(p.playIn).toMatchObject({ id: 'play-in', round: 'play-in', date: '2026-10-23', time: '16:00', site: null });
    expect(one(p.playIn!.home)).toEqual([MC]);
    expect(one(p.playIn!.away)).toEqual([UN]);
    expect(p.games.map((g) => g.id)).toEqual(['qf-1', 'qf-2', 'sf-1', 'sf-2', 'final']);
    expect(p.games[1].away).toMatchObject({ kind: 'winner-of', gameId: 'play-in' });
  });

  it('has no play-in game when none is needed', () => {
    const clear = [...TOP5, row(UN, 20, 6), row(MC, 10, 7), row(CS, 5, 8), row(MA, 0, 9)];
    const p = buildLeagueTournament(MCAL, clear, [], 'tournament', '2026-10-24');
    expect(p.playIn).toBeNull();
    expect(p.playInNeeded).toBe('no');
    expect(p.status).toBe('seeded');
  });

  it('walks seeded → in-progress → complete as results arrive, re-seeding the semifinals', () => {
    expect(buildLeagueTournament(MCAL, rows, league, 'tournament', '2026-10-23').status).toBe('seeded');

    const playIn = game(MC, UN, 1, 2, '2026-10-23', { postseason: true });
    let p = buildLeagueTournament(MCAL, rows, [...league, playIn], 'tournament', '2026-10-24');
    expect(p.status).toBe('in-progress');
    expect(p.playIn!.game?.contestId).toBe(playIn.contestId);
    expect(p.playIn!.note).toBe(SHOOTOUT_NOTE);
    expect(p.seeds[5].seat.map((s) => s.slug)).toEqual([UN]);
    expect(one(p.games[1].away)).toEqual([UN]);

    // QFs: #5 LW upsets #4 BK; #3 TM beats #6 UN → sf-1: #5 LW at #1 AW; sf-2: #3 TM at #2 RW.
    const qfs = [game(BK, LW, 0, 2, '2026-10-26', { postseason: true }), game(TM, UN, 3, 0, '2026-10-26', { postseason: true })];
    p = buildLeagueTournament(MCAL, rows, [...league, playIn, ...qfs], 'tournament', '2026-10-27');
    expect([one(p.games[2].home), one(p.games[2].away)]).toEqual([[AW], [LW]]);
    expect([one(p.games[3].home), one(p.games[3].away)]).toEqual([[RW], [TM]]);
    expect(p.games[4].home.kind).toBe('winner-of');

    const sfs = [game(AW, LW, 2, 0, '2026-10-28', { postseason: true }), game(RW, TM, 0, 1, '2026-10-28', { postseason: true })];
    p = buildLeagueTournament(MCAL, rows, [...league, playIn, ...qfs, ...sfs], 'tournament', '2026-10-29');
    expect([one(p.games[4].home), one(p.games[4].away)]).toEqual([[AW], [TM]]);
    expect(p.games[4].site).toBe('Tamalpais');
    expect(p.status).toBe('in-progress');

    const fin = game(TM, AW, 2, 1, '2026-10-30', { postseason: true });
    p = buildLeagueTournament(MCAL, rows, [...league, playIn, ...qfs, ...sfs, fin], 'complete', '2026-10-31');
    expect(p.status).toBe('complete');
    expect(p.games[4].game?.contestId).toBe(fin.contestId);
    expect(p.games[4].note).toBe(SHOOTOUT_NOTE);
  });

  it('notes a 2-0 sweep that settles 6th', () => {
    const p = buildLeagueTournament(MCAL, rows, pair(UN, MC, [1, 0], [0, 1]), 'regular', '2026-10-02');
    expect(p.playInNeeded).toBe('no');
    expect(p.notes).toEqual(['San Francisco University won both meetings with Marin Catholic, so no play-in is needed.']);
  });
});
