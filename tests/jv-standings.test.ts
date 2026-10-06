/**
 * JV standings (lib/jv-standings.ts): which JV games are league games (by their varsity
 * counterpart, else an unmatched official fixture), how a JV table is ordered (points, level teams
 * share a place), when it is shown (the reported-share gate), and what the read API and the views
 * serve from the committed files.
 */

import { describe, expect, it } from 'vitest';

import {
  UNCOUNTED_REASON_WORDS,
  buildJvTablesView,
  jvTableTitle,
  teamJvStanding,
} from '../components/standings/jv-standings-view';
import { buildTeamJvView } from '../components/teams/jv-view';
import { getSnapshot } from '../lib/data';
import { getJvClassification, getJvGamesForTeam, getJvMerge, getJvTables } from '../lib/jv';
import {
  JV_COUNTERPART_WINDOW_DAYS,
  JV_STANDINGS_MIN_REPORTED_SHARE,
  classifyJvGames,
  computeJvStandings,
  withJvClassification,
} from '../lib/jv-standings';
import { LEAGUES } from '../lib/leagues';
import { TEAMS, teamsInDivision } from '../lib/teams';
import type { Game, OfficialFixture } from '../lib/types';
import { game } from './game-builder';

/** A JV game as lib/jv.ts receives it from the merge: unclassified. */
function jv(spec: Parameters<typeof game>[0]): Game {
  const { official: _official, ...g } = game({ league: false, official: null, ...spec });
  void _official;
  return { ...g, countsFor: null, postseason: null };
}

function fixture(division: 'de-anza' | 'el-camino', date: string, away: string, home: string): OfficialFixture {
  return {
    id: `${division}:${date}:${away}@${home}`,
    league: 'scval',
    division,
    dateKey: date,
    time: null,
    awayName: away.toUpperCase(),
    homeName: home.toUpperCase(),
    awaySlug: away,
    homeSlug: home,
    source: 'scval-pdf',
  };
}

describe('classifyJvGames: a JV game takes its varsity counterpart’s classification', () => {
  const varsityLeague = game({ home: 'saint-francis', away: 'fremont', date: '2026-09-14', hs: 3, as: 0 });

  it('counts a JV game for the division its varsity counterpart counts for, within the window', () => {
    expect(varsityLeague.countsFor).toBe('de-anza');
    const same = jv({ home: 'saint-francis', away: 'fremont', date: '2026-09-14' });
    const near = jv({ home: 'fremont', away: 'saint-francis', date: '2026-09-17' });
    const far = jv({ home: 'fremont', away: 'saint-francis', date: '2026-09-19' });
    const c = classifyJvGames([same, near, far], [varsityLeague], []);
    expect(c.get(same.contestId)).toEqual({ kind: 'league', division: 'de-anza', via: 'varsity-game', ref: varsityLeague.contestId });
    expect(c.get(near.contestId)?.kind).toBe('league');
    expect(JV_COUNTERPART_WINDOW_DAYS).toBe(3);
    expect(c.get(far.contestId)).toEqual({ kind: 'uncounted', reason: 'no-varsity-counterpart', division: 'de-anza' });
  });

  it('is non-league when the varsity game is, and uncounted when it is a postseason game', () => {
    const nonLeague = game({ home: 'saint-francis', away: 'fremont', date: '2026-08-28', league: false, official: null });
    // A postseason varsity game between two division mates (a synthetic case: counted for no table).
    const crossover: Game = {
      ...game({ home: 'saint-francis', away: 'cupertino', date: '2026-10-30', hs: 1, as: 0 }),
      countsFor: null,
      postseason: { kind: 'scval-crossover', leagueId: 'scval', via: 'config-pairing' },
    };
    expect(nonLeague.countsFor).toBeNull();
    const a = jv({ home: 'saint-francis', away: 'fremont', date: '2026-08-28' });
    const b = jv({ home: 'saint-francis', away: 'cupertino', date: '2026-10-30' });
    const c = classifyJvGames([a, b], [nonLeague, crossover], []);
    expect(c.get(a.contestId)).toEqual({ kind: 'non-league', reason: 'varsity-non-league' });
    expect(c.get(b.contestId)).toEqual({ kind: 'uncounted', reason: 'varsity-postseason', division: 'de-anza' });
  });

  it('decides nothing when two varsity games are equally near', () => {
    const before = game({ home: 'saint-francis', away: 'fremont', date: '2026-09-12', hs: 1, as: 0 });
    const after = game({ home: 'fremont', away: 'saint-francis', date: '2026-09-16', hs: 1, as: 0 });
    const g = jv({ home: 'saint-francis', away: 'fremont', date: '2026-09-14' });
    expect(classifyJvGames([g], [before, after], []).get(g.contestId)).toEqual({
      kind: 'uncounted',
      reason: 'ambiguous',
      division: 'de-anza',
    });
  });

  it('falls back to an official fixture no varsity contest matched', () => {
    const g = jv({ home: 'mitty', away: 'los-gatos', date: '2026-09-23' });
    const f = fixture('el-camino', '2026-09-22', 'los-gatos', 'mitty');
    expect(classifyJvGames([g], [], [f]).get(g.contestId)).toEqual({
      kind: 'league',
      division: 'el-camino',
      via: 'official-fixture',
      ref: f.id,
    });
  });

  it('is non-league across divisions or against a school outside the registry', () => {
    const cross = jv({ home: 'saint-francis', away: 'mitty', date: '2026-09-01' });
    const outside = { ...jv({ home: 'saint-francis', away: 'fremont', date: '2026-09-02' }) };
    outside.away = { teamId: null, slug: null, name: 'Stuart Hall', score: null, result: null };
    const c = classifyJvGames([cross, outside], [], []);
    expect(c.get(cross.contestId)).toEqual({ kind: 'non-league', reason: 'different-divisions' });
    expect(c.get(outside.contestId)).toEqual({ kind: 'non-league', reason: 'outside-registry' });
  });

  it('sets countsFor on league games only, and never a postseason tag', () => {
    const v = game({ home: 'saint-francis', away: 'fremont', date: '2026-09-14', hs: 3, as: 0 });
    const a = jv({ home: 'saint-francis', away: 'fremont', date: '2026-09-14' });
    const b = jv({ home: 'saint-francis', away: 'mitty', date: '2026-09-15' });
    const [ca, cb] = withJvClassification([a, b], classifyJvGames([a, b], [v], []));
    expect(ca.countsFor).toBe('de-anza');
    expect(cb.countsFor).toBeNull();
    expect([ca.postseason, cb.postseason]).toEqual([null, null]);
  });
});

describe('computeJvStandings', () => {
  const today = '2026-10-05';
  /** Classified El Camino JV league games, each counted through a matching official fixture. */
  function table(games: Game[]) {
    const fixtures = games.map((g) => fixture('el-camino', g.dateKey, g.away.slug!, g.home.slug!));
    const classes = classifyJvGames(games, [], fixtures);
    return computeJvStandings(withJvClassification(games, classes), classes, today).find((t) => t.division === 'el-camino')!;
  }

  it('orders on points, lets level teams share a place, and lists teams with no result last', () => {
    const t = table([
      jv({ home: 'mitty', away: 'los-gatos', date: '2026-09-01', hs: 2, as: 2 }),
      jv({ home: 'palo-alto', away: 'lynbrook', date: '2026-09-02', hs: 1, as: 0 }),
      jv({ home: 'santa-clara', away: 'saratoga', date: '2026-10-08' }),
    ]);
    const line = t.rows.map((r) => `${r.record.place}${r.shared ? '=' : ''} ${r.slug} ${r.record.pts}`);
    // Level teams share the place and are listed by full name (Archbishop Mitty, Los Gatos).
    expect(line.slice(0, 4)).toEqual(['1 palo-alto 3', '2= mitty 1', '2= los-gatos 1', '4 lynbrook 0']);
    expect(t.rows.slice(4).map((r) => r.record.gp)).toEqual([0, 0]);
    expect(t.absent.sort()).toEqual(['monta-vista', 'presentation']);
  });

  it('counts played games honestly: past unscored ones count, postponed and future ones do not', () => {
    const t = table([
      jv({ home: 'mitty', away: 'los-gatos', date: '2026-09-01', hs: 2, as: 1 }),
      jv({ home: 'palo-alto', away: 'lynbrook', date: '2026-09-02', status: 'score-pending' }),
      jv({ home: 'santa-clara', away: 'saratoga', date: '2026-09-03', status: 'postponed' }),
      jv({ home: 'monta-vista', away: 'presentation', date: '2026-10-09' }),
    ]);
    expect([t.played, t.reported, t.toCome]).toEqual([2, 1, 1]);
    expect(t.throughDate).toBe('2026-09-01');
  });

  it('shows a table only once enough of the played games have a score', () => {
    const scored = (n: number) =>
      Array.from({ length: n }, (_, i) => jv({ home: 'mitty', away: 'los-gatos', date: `2026-09-0${i + 1}`, hs: 1, as: 0 }));
    const pending = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        jv({ home: 'palo-alto', away: 'lynbrook', date: `2026-09-1${i + 1}`, status: 'score-pending' }),
      );
    expect(JV_STANDINGS_MIN_REPORTED_SHARE).toBe(0.6);
    expect(table([...scored(3), ...pending(2)]).status).toBe('shown');
    expect(table([...scored(2), ...pending(2)]).status).toBe('too-few');
    expect(table([jv({ home: 'mitty', away: 'los-gatos', date: '2026-10-09' })]).status).toBe('none-played');
  });
});

describe('the JV tables served from the committed files', () => {
  it('has one table per division, in config order, with consistent counts', () => {
    const tables = LEAGUES.flatMap((l) => getJvTables(l.id));
    expect(tables.map((t) => t.division)).toEqual(LEAGUES.flatMap((l) => l.divisions.map((d) => d.id)));
    for (const t of tables) {
      expect(t.reported).toBeLessThanOrEqual(t.played);
      const members = new Set(teamsInDivision(t.division).map((x) => x.slug));
      for (const r of t.rows) expect(members.has(r.slug)).toBe(true);
      expect(t.rows.length + t.absent.length).toBe(members.size);
      if (t.status === 'shown') expect(t.reported / t.played).toBeGreaterThanOrEqual(JV_STANDINGS_MIN_REPORTED_SHARE);
    }
  });

  it('gives every served JV game the classification it was given, and keeps JV out of the varsity games', () => {
    const varsity = new Set(getSnapshot().games.map((g) => g.contestId));
    for (const t of TEAMS) {
      for (const g of getJvGamesForTeam(t.slug)) {
        expect(varsity.has(g.contestId)).toBe(false);
        const c = getJvClassification(g.contestId);
        expect(g.countsFor).toBe(c?.kind === 'league' ? c.division : null);
        expect(g.postseason).toBeNull();
      }
    }
    for (const g of getJvMerge().games) expect(g.countsFor).toBeNull();
  });

  it('names a team’s JV place only where its table is shown', () => {
    for (const t of TEAMS) {
      // A team with no league games (the Southern Section independents) has no JV table to link.
      if (t.league === 'independents') {
        expect(teamJvStanding(t.slug), t.slug).toBeNull();
        continue;
      }
      const s = teamJvStanding(t.slug)!;
      const single = LEAGUES.find((l) => l.id === t.league)!.divisions.length === 1;
      expect(s.href).toBe(`/jv#${single ? t.league : t.division}`);
      const table = getJvTables(t.league).find((x) => x.division === t.division)!;
      const row = table.rows.find((r) => r.slug === t.slug);
      if (table.status === 'shown' && row && row.record.gp > 0) {
        expect(s.line).toMatch(new RegExp(`^(T-)?\\d+(st|nd|rd|th) in ${jvTableTitle(t.division)} · \\d+-\\d+-\\d+$`));
      } else {
        expect(s.line).toBeNull();
      }
    }
  });

  it('titles and anchors each block, and says why a block has no table', () => {
    expect(jvTableTitle('de-anza')).toBe('De Anza JV');
    expect(jvTableTitle('marin-county')).toBe('MCAL JV');
    for (const l of LEAGUES) {
      for (const v of buildJvTablesView(l.id)) {
        expect(v.anchor).toBe(l.divisions.length === 1 ? null : v.division);
        expect(v.emptyHeading === null).toBe(v.status === 'shown');
        expect(v.coverage.length).toBeGreaterThan(0);
      }
    }
  });

  it('names each uncounted game with its own reason, never a reason it does not have', () => {
    for (const l of LEAGUES) {
      const tables = getJvTables(l.id);
      for (const v of buildJvTablesView(l.id)) {
        const t = tables.find((x) => x.division === v.division)!;
        expect(v.uncountedNote === null).toBe(t.uncounted.length === 0);
        for (const g of t.uncounted) {
          const c = getJvClassification(g.contestId);
          expect(c?.kind).toBe('uncounted');
          if (c?.kind === 'uncounted') expect(v.uncountedNote).toContain(UNCOUNTED_REASON_WORDS[c.reason]);
        }
      }
    }
    expect(Object.keys(UNCOUNTED_REASON_WORDS).sort()).toEqual(['ambiguous', 'no-varsity-counterpart', 'varsity-postseason']);
  });

  it('chips a JV row by its classification, and none for an uncounted game', () => {
    for (const t of TEAMS) {
      for (const r of buildTeamJvView(t.slug)!.rows) {
        const kind = getJvClassification(r.game.contestId)?.kind;
        expect(r.chips).toBe(kind !== 'uncounted');
        expect(r.nonLeague).toBe(kind === 'non-league');
      }
    }
  });
});
