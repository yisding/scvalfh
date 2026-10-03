/**
 * `components/teams/player-stats-view.ts` and `TeamPlayerStats` — the team page's player stats.
 *
 * The section's promises: a column appears only when the team tracks that stat, a tracked stat a
 * player has no entry for is a dash (never a 0), a team with no stats says so, and the reader is
 * told when MaxPreps' totals are behind the games already played.
 *
 * Two data sets. The rules are asserted over the COMMITTED data/player-stats.json, since they must
 * hold for whatever the scheduled refresh writes. Specific numbers and teams are asserted over a
 * build from the frozen 2026-10-02 captures (buildFixturePlayerStats): the committed file moves
 * whenever a coach enters a game, and a test pinned to it would fail the refresh's own test step
 * and block that day's scores.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import TeamPlayerStats from '../../components/teams/TeamPlayerStats';
import {
  buildPlayerStatsView,
  goalieFiguresDisagree,
  savePercent,
  statText,
  type PlayerStatsView,
} from '../../components/teams/player-stats-view';
import { buildTeamPageView } from '../../components/teams/team-view';
import { getPlayerStats } from '../../lib/player-stats';
import { LEAGUE_IDS } from '../../lib/leagues';
import type {
  GoalieStatKey,
  PlayerStatLine,
  PlayerStatsFile,
  TeamPlayerStats as TeamStats,
} from '../../lib/player-stats-schema';
import { TEAMS, teamsInLeague } from '../../lib/teams';
import type { Game } from '../../lib/types';
import { buildFixturePlayerStats } from '../helpers';

interface Case {
  slug: string;
  data: TeamStats;
  games: Game[];
  view: PlayerStatsView;
}

function casesFor(file: PlayerStatsFile): Case[] {
  return TEAMS.map((t) => {
    const page = buildTeamPageView(t.slug)!;
    const games = [...page.leagueLog, ...page.nonLeagueLog];
    const data = file.teams.find((x) => x.slug === t.slug)!;
    return { slug: t.slug, data, games, view: buildPlayerStatsView(t.slug, games, data)! };
  });
}

const live = casesFor(getPlayerStats());
const fixture = casesFor(buildFixturePlayerStats());
const at = (slug: string) => fixture.find((c) => c.slug === slug)!;

describe('buildPlayerStatsView — rules, over the committed file', () => {
  it('reads the committed file by default', () => {
    for (const { slug, games, view } of live) {
      expect(buildPlayerStatsView(slug as never, games), slug).toEqual(view);
    }
  });

  it('builds a view for every team of every league, and null only for a slug that is no team', () => {
    expect(live).toHaveLength(43);
    for (const id of LEAGUE_IDS) {
      for (const t of teamsInLeague(id)) {
        const page = buildTeamPageView(t.slug)!;
        expect(buildPlayerStatsView(t.slug, [...page.leagueLog, ...page.nonLeagueLog]), `${id} / ${t.slug}`).not.toBeNull();
      }
    }
    expect(buildPlayerStatsView('not-a-school' as never)).toBeNull();
  });

  it('builds a view for every team; a team with no stats has no tables', () => {
    for (const { slug, data, view } of live) {
      expect(view, slug).toBeTruthy();
      if (data.players.length === 0) {
        expect(view.scoring, slug).toBeNull();
        expect(view.more, slug).toBeNull();
        expect(view.goalies, slug).toEqual([]);
      }
    }
  });

  it('shows a column only when the team tracks that stat', () => {
    for (const { slug, data, view } of live) {
      const tracked = new Set<string>(data.tracked.field);
      for (const c of [...(view.scoring?.columns ?? []), ...(view.more?.columns ?? [])]) {
        expect(tracked.has(c.key), `${slug} ${c.key}`).toBe(true);
      }
    }
  });

  it('lists every field player once on Scoring, best first by points', () => {
    for (const { slug, data, view } of live) {
      if (!view.scoring) continue;
      expect(view.scoring.rows.length, slug).toBe(data.players.filter((p) => p.field).length);
      const pts = view.scoring.columns.findIndex((c) => c.key === 'points');
      if (pts < 0) continue;
      const values = view.scoring.rows.map((r) => r.values[pts] ?? -1);
      expect(values, slug).toEqual([...values].sort((a, b) => b - a));
    }
  });

  it('keeps only players with at least one of its stats on the second table', () => {
    for (const { slug, view } of live) {
      for (const r of view.more?.rows ?? []) {
        expect(r.values.some((v) => v !== null && v > 0), `${slug} ${r.name}`).toBe(true);
      }
    }
  });

  it('computes save % only where both saves and goals against are tracked and the entries agree', () => {
    for (const { slug, data, view } of live) {
      const both = data.tracked.goalkeeping.includes('saves') && data.tracked.goalkeeping.includes('goalsAgainst');
      for (const card of view.goalies) {
        const goalie = data.players.find((p) => p.fullName === card.name && p.goalkeeping)!.goalkeeping!;
        const expected = both && goalie.saves !== null && goalie.goalsAgainst !== null && !goalieFiguresDisagree(goalie)
          ? savePercent(goalie.saves, goalie.goalsAgainst)
          : null;
        expect(card.stats.find((s) => s.label === 'Save %')?.text ?? null, `${slug} ${card.name}`).toBe(expected);
        // A card whose entries contradict each other says so, and only then.
        expect(card.flag !== null, `${slug} ${card.name}`).toBe(goalieFiguresDisagree(goalie));
      }
      expect(view.showsSavePercent, slug).toBe(view.goalies.some((c) => c.stats.some((s) => s.label === 'Save %')));
    }
  });

  it('never calls the coach’s opponent shots on goal "shots faced", and explains the one computed figure', () => {
    for (const { slug, view } of live) {
      for (const card of view.goalies) {
        expect(card.stats.map((s) => s.label), slug).not.toContain('Shots faced');
      }
      const html = renderToStaticMarkup(createElement(TeamPlayerStats, { view }));
      expect(html, slug).not.toContain('Shots faced');
      if (view.showsSavePercent) expect(html, slug).toContain('Save % is the one figure worked out here');
      else expect(html, slug).not.toContain('Save % is the one figure');
    }
  });

  it('counts the finals played after the last MaxPreps update, to the minute', () => {
    for (const { slug, data, games, view } of live) {
      const at = data.lastUpdated?.slice(0, 19);
      const expected = at ? games.filter((g) => g.status === 'final' && g.dateLocal.slice(0, 19) > at).length : 0;
      expect(view.gamesSince, slug).toBe(expected);
    }
  });

  it('renders every row, spells out each column head, and never prints null', () => {
    for (const { slug, view } of live) {
      const html = renderToStaticMarkup(createElement(TeamPlayerStats, { view }));
      expect(html, slug).not.toMatch(/>(null|undefined|NaN)</);
      for (const r of [...(view.scoring?.rows ?? []), ...(view.more?.rows ?? [])]) {
        expect(html, `${slug} ${r.name}`).toContain(r.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'));
      }
      for (const c of [...(view.scoring?.columns ?? []), ...(view.more?.columns ?? [])]) {
        expect(html, `${slug} ${c.key}`).toContain(`<span class="sr-only">${c.title}</span>`);
      }
      if (!view.scoring && !view.more && view.goalies.length === 0) expect(html, slug).not.toContain('<table');
    }
  });
});

describe('buildPlayerStatsView — the 2026-10-02 captures', () => {
  it('drops a column the coach does not fill in: Homestead has goals and points, no assists', () => {
    expect(at('homestead').view.scoring!.columns.map((c) => c.label)).toEqual(['GP', 'G', 'Pts']);
  });

  it('orders Valley Christian by points, and works out its keeper’s save %', () => {
    const vc = at('valley-christian').view;
    expect(vc.scoring!.rows[0].name).toBe('Grace Frieder');
    const paredes = vc.goalies.find((g) => g.name === 'Shyla Paredes')!;
    expect(paredes.stats.find((s) => s.label === 'Save %')!.text).toBe(savePercent(122, 20));
  });

  it('marks a missing entry as missing: two Palo Alto players are only in the overflow table', () => {
    const pa = at('palo-alto').view.scoring!;
    const assists = pa.columns.findIndex((c) => c.key === 'assists');
    expect(pa.rows.filter((r) => r.values[assists] === null).map((r) => r.name).sort()).toEqual([
      'Maiya Pegg',
      'Yoyo Cai',
    ]);
  });

  it('says a team with no stats has none, rather than rendering an empty table', () => {
    const html = renderToStaticMarkup(createElement(TeamPlayerStats, { view: at('saratoga').view }));
    expect(html).toContain('No player stats for Saratoga.');
    expect(html).toContain('Nobody has entered any on MaxPreps this season.');
    expect(html).not.toContain('<table');
  });

  it('says a team no update has covered is not collected, and never that its coach entered none', () => {
    // The build covers SCVAL only, so every other league's team is pending.
    const pending = fixture.filter((c) => !teamsInLeague('scval').some((t) => t.slug === c.slug));
    expect(pending).toHaveLength(28);
    for (const { slug, data, view } of pending) {
      expect(data.status, slug).toBe('pending');
      expect(view.status, slug).toBe('pending');
      const html = renderToStaticMarkup(createElement(TeamPlayerStats, { view }));
      expect(html, slug).toContain('player stats have not been collected yet');
      expect(html, slug).not.toContain('No player stats for');
      expect(html, slug).not.toContain('<table');
    }
  });

  it('says a failed read with nothing to fall back on could not be read', () => {
    const view = { ...at('saratoga').view, status: 'error' as const };
    const html = renderToStaticMarkup(createElement(TeamPlayerStats, { view }));
    expect(html).toContain('player stats could not be read');
  });

  it('counts a game played later on the day of the update (Santa Clara: 11:15, then a 4 PM final)', () => {
    const sc = at('santa-clara');
    expect(sc.data.lastUpdated).toBe('2026-10-01T11:15:44');
    const sameDay = sc.games.filter((g) => g.status === 'final' && g.dateKey === '2026-10-01' && g.dateLocal > sc.data.lastUpdated!);
    expect(sameDay.length).toBeGreaterThan(0);
    expect(sc.view.gamesSince).toBeGreaterThanOrEqual(sameDay.length);
  });

  it('warns when the totals are behind the games played (Presentation stops on Sep 10)', () => {
    const presentation = at('presentation').view;
    expect(presentation.updated).toBe('Thu Sep 10');
    expect(presentation.gamesSince).toBeGreaterThan(0);
    const html = renderToStaticMarkup(createElement(TeamPlayerStats, { view: presentation }));
    expect(html.replace(/<!-- -->/g, '')).toMatch(/Presentation has played \d+ games? since then/);
  });
});

describe('goalkeeping — entered figures, a computed save %, and the keeper first', () => {
  const goalie = (over: Partial<NonNullable<PlayerStatLine['goalkeeping']>>) => ({
    gamesPlayed: null,
    minutes: null,
    overtimeMinutes: null,
    opponentShotsOnGoal: null,
    saves: null,
    goalsAgainst: null,
    shutouts: null,
    wins: null,
    losses: null,
    ties: null,
    ...over,
  });
  const line = (fullName: string, g: NonNullable<PlayerStatLine['goalkeeping']>, field = false): PlayerStatLine => ({
    careerId: fullName.toLowerCase().replace(/\W+/g, ''),
    careerUrl: null,
    athleteId: null,
    fullName,
    shortName: fullName,
    jersey: null,
    onRoster: true,
    field: field
      ? { gamesPlayed: g.gamesPlayed, goals: 12, assists: null, points: 24, shots: null, shotsOnGoal: null, gameWinningGoals: null, steals: null, minutes: null }
      : null,
    goalkeeping: g,
  });
  /** A team built on a real registry slug, so the view builds; the stats are invented for the test. */
  const team = (tracked: GoalieStatKey[], players: PlayerStatLine[]): TeamStats => {
    const real = at('valley-christian').data;
    const field: TeamStats['tracked']['field'] = players.some((p) => p.field) ? ['gamesPlayed', 'goals', 'points'] : [];
    return {
      ...real,
      tracked: { field, goalkeeping: tracked },
      players,
    };
  };

  it('leaves out save % and flags the card when opponent shots on goal is below saves plus goals against', () => {
    // Leland, 2026-10-03: 10 opponent shots on goal, 36 saves, 9 goals against.
    const data = team(['gamesPlayed', 'minutes', 'opponentShotsOnGoal', 'saves', 'goalsAgainst'], [
      line('Aastha Dhandha', goalie({ gamesPlayed: 3, minutes: 45, opponentShotsOnGoal: 10, saves: 36, goalsAgainst: 9 })),
      line('Isabella Yu', goalie({ gamesPlayed: 3, minutes: 15, opponentShotsOnGoal: 4, saves: 3, goalsAgainst: 1 })),
    ]);
    const view = buildPlayerStatsView('valley-christian', [], data)!;
    const [dhandha, yu] = view.goalies;
    expect(dhandha.name).toBe('Aastha Dhandha');
    expect(dhandha.stats.find((s) => s.label === 'Save %')).toBeUndefined();
    expect(dhandha.stats.find((s) => s.label === 'Opp. shots on goal')!.text).toBe('10');
    expect(dhandha.flag).toBe('As entered, these cannot all be right: 10 opponent shots on goal, but 45 saves plus goals against. No save % is worked out.');
    // 4 on goal, 3 saved, 1 scored: consistent, so the percentage stands.
    expect(yu.flag).toBeNull();
    expect(yu.stats.find((s) => s.label === 'Save %')!.text).toBe(savePercent(3, 1));
    const html = renderToStaticMarkup(createElement(TeamPlayerStats, { view })).replace(/<!-- -->/g, '');
    expect(html).toContain('No save % is worked out.');
    expect(html).not.toContain('80.0%');
  });

  it('flags saves above shots on goal even where goals against is not tracked (no save % to hide)', () => {
    // University, 2026-10-03: a keeper with 10 opponent shots on goal and 18 saves.
    const data = team(['gamesPlayed', 'opponentShotsOnGoal', 'saves', 'wins', 'losses', 'ties'], [
      line('Corina Law', goalie({ gamesPlayed: 11, opponentShotsOnGoal: 10, saves: 18, wins: 8, losses: 1, ties: 2 })),
    ]);
    const [law] = buildPlayerStatsView('valley-christian', [], data)!.goalies;
    expect(law.flag).toBe('As entered, these cannot all be right: 10 opponent shots on goal, but 18 saves.');
  });

  it('puts the keeper first, not a field player MaxPreps lists in the goalie group with the full game count', () => {
    // University: a forward (12 goals, 2 saves, 16 games) sorted ahead of the keeper by name.
    const data = team(['gamesPlayed', 'opponentShotsOnGoal', 'saves', 'shutouts', 'wins', 'losses', 'ties'], [
      line('Anoushka Gollerkeri', goalie({ gamesPlayed: 16, opponentShotsOnGoal: 0, saves: 2 }), true),
      line('Corina Law', goalie({ gamesPlayed: 11, opponentShotsOnGoal: 10, saves: 18, shutouts: 5, wins: 8, losses: 1, ties: 2 })),
      line('Lucelia Wolff', goalie({ gamesPlayed: 16, opponentShotsOnGoal: 4, saves: 16, shutouts: 7, wins: 10, losses: 1, ties: 2 })),
    ]);
    expect(buildPlayerStatsView('valley-christian', [], data)!.goalies.map((g) => g.name)).toEqual([
      'Lucelia Wolff',
      'Corina Law',
      'Anoushka Gollerkeri',
    ]);
    // Convent: five players with 9-12 games; the keeper is the one with the decisions and the saves.
    const convent = team(['gamesPlayed', 'opponentShotsOnGoal', 'saves', 'goalsAgainst', 'shutouts', 'wins', 'losses', 'ties'], [
      line('Claire Woodard', goalie({ gamesPlayed: 12, opponentShotsOnGoal: 0, saves: 2, goalsAgainst: 0 }), true),
      line('Julia Ahlstrand', goalie({ gamesPlayed: 12, opponentShotsOnGoal: 0, saves: 5, goalsAgainst: 0 })),
      line('Olivia Lieberman', goalie({ gamesPlayed: 12, opponentShotsOnGoal: 5, saves: 65, goalsAgainst: 17, shutouts: 5, wins: 4, losses: 6, ties: 2 })),
    ]);
    expect(buildPlayerStatsView('valley-christian', [], convent)!.goalies[0].name).toBe('Olivia Lieberman');
    // Minutes in goal lead where a team enters them.
    const minutes = team(['gamesPlayed', 'minutes', 'saves'], [
      line('A Field Player', goalie({ gamesPlayed: 12, minutes: 20, saves: 30 })),
      line('The Keeper', goalie({ gamesPlayed: 6, minutes: 300, saves: 26 })),
    ]);
    expect(buildPlayerStatsView('valley-christian', [], minutes)!.goalies[0].name).toBe('The Keeper');
  });

  it('prints a tracked goalie stat with no entry as a dash a screen reader hears as "not recorded"', () => {
    const data = team(['gamesPlayed', 'minutes', 'saves'], [line('Stella Strain', goalie({ gamesPlayed: 6, saves: 7 }))]);
    const view = buildPlayerStatsView('valley-christian', [], data)!;
    expect(view.goalies[0].stats.find((s) => s.label === 'Minutes')!.text).toBeNull();
    const html = renderToStaticMarkup(createElement(TeamPlayerStats, { view }));
    expect(html).toContain('<dd class="sx-num m-0 text-lead font-semibold text-ink"><span aria-hidden="true">—</span><span class="sr-only">not recorded</span></dd>');
    expect(html).not.toMatch(/>—<\/dd>/);
  });

  it('finds the contradictions in the committed file only where the entered figures cannot add up', () => {
    for (const { slug, data } of live) {
      for (const p of data.players.filter((x) => x.goalkeeping)) {
        const g = p.goalkeeping!;
        const expected = g.opponentShotsOnGoal !== null && (g.saves ?? 0) + (g.goalsAgainst ?? 0) > g.opponentShotsOnGoal;
        expect(goalieFiguresDisagree(g), `${slug} ${p.fullName}`).toBe(expected && (g.saves !== null || g.goalsAgainst !== null));
      }
    }
  });
});

describe('formatting', () => {
  it('prints counts as whole numbers and save % to one decimal', () => {
    expect(statText(null)).toBeNull();
    expect(statText(0)).toBe('0');
    expect(statText(134.6)).toBe('135');
    expect(savePercent(9, 1)).toBe('90.0%');
    expect(savePercent(0, 0)).toBeNull();
  });
});
