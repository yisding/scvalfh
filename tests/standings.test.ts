import { describe, expect, it } from 'vitest';

import { classifyGames } from '../lib/classify';
import { ALL_DIVISIONS, divisionsOf } from '../lib/leagues';
import { normalizeGames } from '../lib/normalize';
import {
  computeStandings,
  divisionGames,
  leaguePairings,
  missingOfficialResults,
  outcomesFor,
  playoffOutcomeLabel,
  playoffOutcomes,
  playoffStatusFor,
} from '../lib/standings';
import { TEAMS, resolveTeam, teamsInLeague } from '../lib/teams';
import type { Game, Standing } from '../lib/types';
import { game } from './game-builder';
import { allScheduleRows } from './helpers';

/** The SCVAL corpus (15 schedules, 2026-09-29), classified exactly as the pipeline does. */
const live = classifyGames(
  normalizeGames(allScheduleRows(), { fetchedAt: '2026-09-29T15:00:00.000Z' }).games,
);
const liveStandings = computeStandings(live);
const SCVAL_DIVISIONS = new Set(divisionsOf('scval').map((d) => d.id));
const scvalStandings = liveStandings.filter((s) => SCVAL_DIVISIONS.has(s.division));

function row(rows: Standing[], slug: string): Standing {
  const found = rows.find((r) => r.slug === slug);
  if (!found) throw new Error(`no standings row for ${slug}`);
  return found;
}

function order(rows: Standing[], division: string): string[] {
  return rows
    .filter((r) => r.division === division)
    .sort((a, b) => a.computed.place - b.computed.place || a.slug.localeCompare(b.slug))
    .map((r) => r.slug);
}

describe('standings: Article VI §1-2 (division games only, 3 pts a win, 1 a tie)', () => {
  it('includes every registry team once, and all 15 SCVAL teams', () => {
    expect(liveStandings.length).toBe(TEAMS.length);
    for (const team of TEAMS) {
      expect(liveStandings.filter((s) => s.teamId === team.id), team.slug).toHaveLength(1);
    }
    expect(scvalStandings).toHaveLength(teamsInLeague('scval').length);
    expect(scvalStandings).toHaveLength(15);
    for (const d of ALL_DIVISIONS) {
      expect(liveStandings.filter((s) => s.division === d.id), d.id).toHaveLength(d.expectedTeams);
    }
  });

  it('awards 3 points per win and 1 per tie', () => {
    for (const s of scvalStandings) {
      expect(s.computed.pts).toBe(3 * s.computed.w + s.computed.t);
    }
    const mitty = row(liveStandings, 'mitty');
    expect(mitty.computed.w).toBe(5);
    expect(mitty.computed.pts).toBe(15);
    const fremont = row(liveStandings, 'fremont');
    expect([fremont.computed.w, fremont.computed.l, fremont.computed.t]).toEqual([1, 1, 2]);
    expect(fremont.computed.pts).toBe(5);
  });

  it('counts only division games that are final', () => {
    const counted = divisionGames(live, 'de-anza');
    for (const g of counted) {
      expect(g.isLeague).toBe(true);
      expect(g.leagueDivision).toBe('de-anza');
      expect(g.countsFor).toBe('de-anza');
      expect(g.status).toBe('final');
    }
    const losAltos = row(liveStandings, 'los-altos');
    // The 2026-09-28 Valley Christian game is score-pending, so it is not in the record.
    expect(losAltos.computed.gp).toBe(4);
  });

  it('orders the division by points, descending', () => {
    for (const division of ['de-anza', 'el-camino'] as const) {
      const rows = liveStandings
        .filter((s) => s.division === division && s.hasReportedResults)
        .sort((a, b) => a.computed.place - b.computed.place);
      for (let i = 1; i < rows.length; i += 1) {
        expect(rows[i - 1].computed.pts).toBeGreaterThanOrEqual(rows[i].computed.pts);
      }
    }
  });

  it('computes win pct with a tie as half a win', () => {
    const losAltos = row(liveStandings, 'los-altos');
    expect(losAltos.computed.winPct).toBeCloseTo(0.625, 3);
  });

  it('excludes non-league games from the division record but keeps them in overall', () => {
    const losAltos = row(liveStandings, 'los-altos');
    expect(losAltos.overall.gp).toBeGreaterThan(losAltos.computed.gp);
  });

  it('tracks streak, last 5, and home/away/neutral splits', () => {
    const sf = row(liveStandings, 'saint-francis');
    expect(sf.computed.last5.length).toBeLessThanOrEqual(5);
    expect(sf.computed.streak).not.toBeNull();
    const splits =
      sf.computed.homeRecord.w +
      sf.computed.homeRecord.l +
      sf.computed.homeRecord.t +
      sf.computed.awayRecord.w +
      sf.computed.awayRecord.l +
      sf.computed.awayRecord.t +
      sf.computed.neutralRecord.w +
      sf.computed.neutralRecord.l +
      sf.computed.neutralRecord.t;
    expect(splits).toBe(sf.computed.gp);
  });

  it('reads last 5 and streak in date order, whatever order the games arrive in', () => {
    // Santa Catalina's season as of 2026-10-02: a si.com-only 9/4 win (appended by lib/backfill.ts,
    // after every MaxPreps contest), then five losses.
    const losses = ['2026-09-10', '2026-09-14', '2026-09-23', '2026-09-24', '2026-09-30'].map((date) =>
      game({ home: 'santa-catalina', away: 'carmel', hs: 0, as: 3, date }),
    );
    const win = game({ home: 'santa-catalina', away: 'greenfield', hs: 1, as: 0, date: '2026-09-04' });
    for (const games of [[win, ...losses], [...losses, win]]) {
      const sc = row(computeStandings(games), 'santa-catalina');
      expect(sc.overall.last5).toEqual(['L', 'L', 'L', 'L', 'L']);
      expect(sc.overall.streak).toEqual({ count: 5, result: 'L' });
      expect(sc.computed.last5).toEqual(sc.overall.last5);
      expect(sc.computed.streak).toEqual(sc.overall.streak);
    }
  });
});

describe('standings: Wilcox is not fielding a team', () => {
  it('has no row, and De Anza is seven teams', () => {
    expect(liveStandings.find((r) => (r.slug as string) === 'wilcox')).toBeUndefined();
    expect(order(liveStandings, 'de-anza')).toHaveLength(7);
    expect(resolveTeam('wilcox')).toBeUndefined();
  });
});

/**
 * One constructed scenario per Article VI step. Each uses De Anza teams only, so every other
 * De Anza team has zero games and sorts last.
 */
describe('standings: Article VI tiebreakers, one scenario per step', () => {
  it('§3 head-to-head brings a team out of a points tie', () => {
    // Both finish 1-1-0 (3 pts) with one division win each. Cupertino beat Fremont head to head.
    const games: Game[] = [
      game({ home: 'cupertino', away: 'fremont', hs: 2, as: 1, date: '2026-09-09' }),
      game({ home: 'cupertino', away: 'homestead', hs: 0, as: 1, date: '2026-09-11' }),
      game({ home: 'fremont', away: 'los-altos', hs: 2, as: 1, date: '2026-09-14' }),
    ];
    const rows = computeStandings(games);
    expect(row(rows, 'cupertino').computed.pts).toBe(3);
    expect(row(rows, 'fremont').computed.pts).toBe(3);
    expect(row(rows, 'cupertino').computed.place).toBeLessThan(row(rows, 'fremont').computed.place);
    expect(row(rows, 'cupertino').tiebreak.resolvedBy).toBe('head-to-head');
    expect(row(rows, 'cupertino').tiebreak.shared).toBe(false);
    expect(row(rows, 'cupertino').tiebreak.note).toMatch(/Article VI §3/);
  });

  it('§4 division wins separates teams tied on points with an equal head-to-head', () => {
    // Cupertino 2-1-0 = 6 pts (2 wins); Fremont 1-1-3 = 6 pts (1 win). They split their two
    // meetings, so the head-to-head record is level (3 pts each) and §4 must separate them.
    const games: Game[] = [
      game({ home: 'cupertino', away: 'fremont', hs: 2, as: 1, date: '2026-09-09' }),
      game({ home: 'fremont', away: 'cupertino', hs: 1, as: 0, date: '2026-09-11' }),
      game({ home: 'cupertino', away: 'homestead', hs: 3, as: 0, date: '2026-09-14' }),
      game({ home: 'fremont', away: 'los-altos', hs: 1, as: 1, date: '2026-09-16' }),
      game({ home: 'fremont', away: 'saint-francis', hs: 2, as: 2, date: '2026-09-18' }),
      game({ home: 'fremont', away: 'st-ignatius', hs: 1, as: 1, date: '2026-09-21' }),
    ];
    const rows = computeStandings(games);
    const cu = row(rows, 'cupertino');
    const fr = row(rows, 'fremont');
    expect(cu.computed.pts).toBe(6);
    expect(fr.computed.pts).toBe(6);
    expect(cu.computed.w).toBe(2);
    expect(fr.computed.w).toBe(1);
    expect(cu.computed.place).toBeLessThan(fr.computed.place);
    expect(cu.tiebreak.resolvedBy).toBe('division-wins');
    expect(cu.tiebreak.note).toMatch(/Article VI §4/);
  });

  it('§5 fewest goals allowed head-to-head separates a split pair', () => {
    // They split: Cupertino won 3-0, Fremont won 1-0. Identical points (3) and division wins (1);
    // Cupertino conceded 1 in the pair, Fremont conceded 3.
    const games: Game[] = [
      game({ home: 'cupertino', away: 'fremont', hs: 3, as: 0, date: '2026-09-09' }),
      game({ home: 'fremont', away: 'cupertino', hs: 1, as: 0, date: '2026-09-23' }),
    ];
    const rows = computeStandings(games);
    const cu = row(rows, 'cupertino');
    const fr = row(rows, 'fremont');
    expect(cu.computed.pts).toBe(3);
    expect(fr.computed.pts).toBe(3);
    expect(cu.computed.w).toBe(1);
    expect(fr.computed.w).toBe(1);
    expect(cu.computed.place).toBe(1);
    expect(fr.computed.place).toBe(2);
    expect(cu.tiebreak.resolvedBy).toBe('h2h-goals-against');
    expect(cu.tiebreak.note).toMatch(/Article VI §5/);
  });

  it('§6 head-to-head goal differential separates a three-way tie', () => {
    // A perfect cycle: every team 1-1-0 (3 pts, 1 win), every team concedes exactly 3 in the
    // group, so only the head-to-head differential is left: CU +1, FR 0, HM −1.
    const games: Game[] = [
      game({ home: 'cupertino', away: 'fremont', hs: 3, as: 1, date: '2026-09-09' }),
      game({ home: 'fremont', away: 'homestead', hs: 2, as: 0, date: '2026-09-11' }),
      game({ home: 'homestead', away: 'cupertino', hs: 2, as: 1, date: '2026-09-14' }),
    ];
    const rows = computeStandings(games);
    for (const slug of ['cupertino', 'fremont', 'homestead']) {
      expect(row(rows, slug).computed.pts, slug).toBe(3);
      expect(row(rows, slug).computed.w, slug).toBe(1);
      expect(row(rows, slug).computed.ga, slug).toBe(3);
    }
    expect(order(rows, 'de-anza').slice(0, 3)).toEqual(['cupertino', 'fremont', 'homestead']);
    expect(row(rows, 'cupertino').tiebreak.resolvedBy).toBe('h2h-goal-diff');
    expect(row(rows, 'cupertino').tiebreak.note).toMatch(/Article VI §6/);
  });

  it('§7 leaves a genuinely unresolvable tie level and flags the coin flip', () => {
    // A symmetric cycle: identical points, wins, head-to-head goals against and differential.
    const games: Game[] = [
      game({ home: 'cupertino', away: 'fremont', hs: 2, as: 0, date: '2026-09-09' }),
      game({ home: 'fremont', away: 'homestead', hs: 2, as: 0, date: '2026-09-11' }),
      game({ home: 'homestead', away: 'cupertino', hs: 2, as: 0, date: '2026-09-14' }),
    ];
    const rows = computeStandings(games);
    const tied = ['cupertino', 'fremont', 'homestead'].map((s) => row(rows, s));
    for (const s of tied) {
      expect(s.computed.place).toBe(1);
      expect(s.tiebreak.resolvedBy).toBe('coin-flip');
      expect(s.tiebreak.shared).toBe(true);
      expect(s.tiebreak.tiedWith.length).toBe(2);
      expect(s.tiebreak.note).toMatch(/Article VI §7/);
    }
    // A shared place consumes its slots: the next team down is 4th, not 2nd.
    const next = rows
      .filter((r) => r.division === 'de-anza' && r.computed.place > 1)
      .sort((a, b) => a.computed.place - b.computed.place)[0];
    expect(next.computed.place).toBe(4);
  });

  it('restarts the chain once a team is brought out (Article VI §3)', () => {
    // Three teams on 6 points. Cupertino beat both of the others, so §3 brings it out; Fremont and
    // Homestead never met, so restarting the chain for the pair ends in §7 and they stay level.
    const games: Game[] = [
      game({ home: 'cupertino', away: 'fremont', hs: 2, as: 0, date: '2026-09-09' }),
      game({ home: 'cupertino', away: 'homestead', hs: 2, as: 0, date: '2026-09-11' }),
      game({ home: 'fremont', away: 'los-altos', hs: 1, as: 0, date: '2026-09-14' }),
      game({ home: 'fremont', away: 'saint-francis', hs: 1, as: 0, date: '2026-09-16' }),
      game({ home: 'homestead', away: 'los-altos', hs: 1, as: 0, date: '2026-09-18' }),
      game({ home: 'homestead', away: 'saint-francis', hs: 1, as: 0, date: '2026-09-21' }),
    ];
    const rows = computeStandings(games);
    const cu = row(rows, 'cupertino');
    const fr = row(rows, 'fremont');
    const hm = row(rows, 'homestead');
    for (const s of [cu, fr, hm]) expect(s.computed.pts).toBe(6);
    expect(cu.computed.place).toBe(1);
    expect(cu.tiebreak.resolvedBy).toBe('head-to-head');
    // The remaining pair restarts the chain and lands on the coin flip, sharing 2nd.
    expect(fr.computed.place).toBe(2);
    expect(hm.computed.place).toBe(2);
    expect(fr.tiebreak.resolvedBy).toBe('coin-flip');
    expect(fr.tiebreak.tiedWith).toEqual([hm.teamId]);
    for (const slug of ['cupertino', 'fremont', 'homestead', 'los-altos']) {
      expect(row(rows, slug).tiebreak.note.length).toBeGreaterThan(10);
    }
  });

  it('a forfeit counts in W-L-T but not in goals (DESIGN §11.6)', () => {
    const games: Game[] = [
      game({ home: 'cupertino', away: 'fremont', hs: 1, as: 0, date: '2026-09-09', forfeit: true }),
    ];
    const rows = computeStandings(games);
    expect(row(rows, 'cupertino').computed.w).toBe(1);
    expect(row(rows, 'cupertino').computed.gf).toBe(0);
    expect(row(rows, 'fremont').computed.ga).toBe(0);
  });
});

describe('standings: Article VII projections', () => {
  it('maps place to a qualification status', () => {
    for (const division of ['de-anza', 'el-camino']) {
      expect(playoffStatusFor(division, 1)).toBe('aq');
      expect(playoffStatusFor(division, 3)).toBe('aq');
      expect(playoffStatusFor(division, 4)).toBe('play-in');
      expect(playoffStatusFor(division, 5)).toBe('at-large');
      expect(playoffStatusFor(division, 6)).toBe('out');
      expect(playoffStatusFor(division, 8)).toBe('out');
    }
  });

  it('attaches the status to every standings row', () => {
    for (const s of liveStandings) {
      expect(s.playoffStatus).toBe(playoffStatusFor(s.division, s.computed.place));
    }
  });

  it('pairs the crossover by seed and marks the #4 play-in', () => {
    const pairings = leaguePairings(liveStandings, live, 'scval');
    expect(pairings.map((p) => p.id)).toEqual([
      'scval-crossover-1', 'scval-crossover-2', 'scval-crossover-3', 'scval-crossover-4',
    ]);
    expect(pairings.filter((p) => p.isPlayIn).length).toBe(1);
    expect(pairings[3].isPlayIn).toBe(true);
    expect(pairings[0].seats[0]).toHaveLength(1);
    expect(pairings[0].seats[1]).toHaveLength(1);
    expect(pairings[0].seatLabels).toEqual(['De Anza #1', 'El Camino #1']);
    expect(pairings[0].date).toBe('2026-10-30');
    expect(pairings[0].game).toBeNull();
    expect(pairings[3].label).toMatch(/7th automatic qualifier/);
  });

  it('spreads a level place across every slot it occupies', () => {
    expect(playoffOutcomes('de-anza', 1)).toEqual(['aq']);
    expect(playoffOutcomes('de-anza', 3, 2)).toEqual(['aq', 'play-in']);
    expect(playoffOutcomes('de-anza', 4, 2)).toEqual(['play-in', 'at-large']);
    expect(playoffOutcomes('de-anza', 5, 2)).toEqual(['at-large', 'out']);
    expect(playoffOutcomes('de-anza', 2, 3)).toEqual(['aq', 'play-in']);
    expect(playoffOutcomeLabel('de-anza', ['aq'])).toBe('Automatic qualifier');
    expect(playoffOutcomeLabel('de-anza', ['aq', 'play-in'])).toMatch(
      /^Automatic qualifier or the Oct 30 play-in — Article VI §7/,
    );
  });

  /**
   * Standard competition ranking means a two-way tie for 3rd produces places 1,2,3,3,5 — nobody
   * carries place 4. Reading the raw place would label both tied teams "AQ", drop the play-in
   * status from the division entirely and leave the Oct 30 play-in pairing empty.
   */
  it('keeps the play-in slot alive when a tie straddles the 3rd/4th boundary', () => {
    // De Anza: 9, 6, then Fremont and Cupertino level on 3 with no head-to-head between them,
    // so Article VI §3-6 cannot separate them and §7's coin flip leaves them sharing 3rd.
    const games: Game[] = [
      game({ home: 'st-ignatius', away: 'los-altos', hs: 1, as: 0, date: '2026-09-01' }),
      game({ home: 'st-ignatius', away: 'valley-christian', hs: 1, as: 0, date: '2026-09-02' }),
      game({ home: 'st-ignatius', away: 'homestead', hs: 1, as: 0, date: '2026-09-03' }),
      game({ home: 'saint-francis', away: 'los-altos', hs: 1, as: 0, date: '2026-09-04' }),
      game({ home: 'saint-francis', away: 'valley-christian', hs: 1, as: 0, date: '2026-09-05' }),
      game({ home: 'fremont', away: 'homestead', hs: 1, as: 0, date: '2026-09-06' }),
      game({ home: 'cupertino', away: 'homestead', hs: 1, as: 0, date: '2026-09-07' }),
    ];
    const rows = computeStandings(games);
    const fremont = row(rows, 'fremont');
    const cupertino = row(rows, 'cupertino');
    expect(fremont.computed.place).toBe(3);
    expect(cupertino.computed.place).toBe(3);
    expect(fremont.tiebreak.shared).toBe(true);

    // Nobody carries place 4, so the raw place says 'aq' for both. The union keeps the
    // 4th-place play-in spot — and the Oct 30 pairing built from it — on the table.
    expect(fremont.playoffStatus).toBe('aq');
    expect(outcomesFor(fremont)).toEqual(['aq', 'play-in']);
    expect(outcomesFor(cupertino)).toEqual(['aq', 'play-in']);

    const playIn = leaguePairings(rows, games, 'scval').find((p) => p.isPlayIn)!;
    expect(playIn.seats[0].map((seat) => seat.slug).sort()).toEqual(['cupertino', 'fremont']);
  });

  it('keeps the at-large slot alive when a tie straddles the 4th/5th boundary', () => {
    const games: Game[] = [
      game({ home: 'st-ignatius', away: 'saint-francis', hs: 1, as: 0, date: '2026-09-01' }),
      game({ home: 'st-ignatius', away: 'los-altos', hs: 1, as: 0, date: '2026-09-02' }),
      game({ home: 'st-ignatius', away: 'valley-christian', hs: 1, as: 0, date: '2026-09-03' }),
      game({ home: 'st-ignatius', away: 'homestead', hs: 1, as: 0, date: '2026-09-04' }),
      game({ home: 'saint-francis', away: 'los-altos', hs: 1, as: 0, date: '2026-09-05' }),
      game({ home: 'saint-francis', away: 'valley-christian', hs: 1, as: 0, date: '2026-09-06' }),
      game({ home: 'saint-francis', away: 'homestead', hs: 1, as: 0, date: '2026-09-07' }),
      game({ home: 'los-altos', away: 'valley-christian', hs: 1, as: 0, date: '2026-09-08' }),
      game({ home: 'los-altos', away: 'homestead', hs: 1, as: 0, date: '2026-09-09' }),
      game({ home: 'fremont', away: 'homestead', hs: 1, as: 0, date: '2026-09-10' }),
      game({ home: 'cupertino', away: 'valley-christian', hs: 1, as: 0, date: '2026-09-11' }),
    ];
    const rows = computeStandings(games);
    const fremont = row(rows, 'fremont');
    const cupertino = row(rows, 'cupertino');
    expect(fremont.computed.place).toBe(4);
    expect(cupertino.computed.place).toBe(4);
    expect(outcomesFor(fremont)).toEqual(['play-in', 'at-large']);
    expect(outcomesFor(cupertino)).toEqual(['play-in', 'at-large']);
  });
});

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
