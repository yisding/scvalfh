/**
 * lib/engine/standings.ts: Article VI's records on the SCVAL corpus (division games only, 3 points a win, 1 a tie).
 * The stages, ladders, pairings, cross-check and missing results are tested in standings/*.test.ts.
 */

import { describe, expect, it } from 'vitest';

import { ALL_DIVISIONS } from '@/lib/config/leagues';
import { computeStandings, divisionGames } from '@/lib/engine/standings';
import { resolveTeam } from '@/lib/registry/resolve';
import { TEAMS, teamsInLeague } from '@/lib/registry/teams';
import { game } from '@/tests/support/game-builder';
import { live, liveStandings, scvalStandings } from '@/tests/support/scval-standings';
import { row, order } from '@/tests/support/standings';

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
    // Santa Catalina's season as of 2026-10-02: a si.com-only 9/4 win (appended by lib/pipeline/reconcile/backfill.ts,
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
