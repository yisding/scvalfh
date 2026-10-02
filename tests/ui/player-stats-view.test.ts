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
  savePercent,
  statText,
  type PlayerStatsView,
} from '../../components/teams/player-stats-view';
import { buildTeamPageView } from '../../components/teams/team-view';
import { getPlayerStats } from '../../lib/player-stats';
import type { PlayerStatsFile, TeamPlayerStats as TeamStats } from '../../lib/player-stats-schema';
import { TEAMS } from '../../lib/teams';
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

  it('builds a view for every team; a team with no stats has no tables', () => {
    for (const { slug, data, view } of live) {
      expect(view, slug).toBeDefined();
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

  it('computes save % only where both saves and goals against are tracked', () => {
    for (const { slug, data, view } of live) {
      const both = data.tracked.goalkeeping.includes('saves') && data.tracked.goalkeeping.includes('goalsAgainst');
      for (const card of view.goalies) {
        const goalie = data.players.find((p) => p.fullName === card.name && p.goalkeeping)!.goalkeeping!;
        const expected = both && goalie.saves !== null && goalie.goalsAgainst !== null
          ? savePercent(goalie.saves, goalie.goalsAgainst)
          : null;
        expect(card.stats.find((s) => s.label === 'Save %')?.text ?? null, `${slug} ${card.name}`).toBe(expected);
      }
    }
  });

  it('counts the finals played after the last MaxPreps update', () => {
    for (const { slug, data, games, view } of live) {
      const day = data.lastUpdated?.slice(0, 10);
      const expected = day ? games.filter((g) => g.status === 'final' && g.dateKey > day).length : 0;
      expect(view.gamesSince, slug).toBe(expected);
    }
  });

  it('renders every row, spells out each column head, and never prints null', () => {
    for (const { slug, view } of live) {
      const html = renderToStaticMarkup(createElement(TeamPlayerStats, { view }));
      expect(html, slug).not.toMatch(/>(null|undefined|NaN)</);
      for (const r of [...(view.scoring?.rows ?? []), ...(view.more?.rows ?? [])]) {
        expect(html, `${slug} ${r.name}`).toContain(r.name.replace(/'/g, '&#x27;'));
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
    expect(html).not.toContain('<table');
  });

  it('warns when the totals are behind the games played (Presentation stops on Sep 10)', () => {
    const presentation = at('presentation').view;
    expect(presentation.updated).toBe('Thu Sep 10');
    expect(presentation.gamesSince).toBeGreaterThan(0);
    const html = renderToStaticMarkup(createElement(TeamPlayerStats, { view: presentation }));
    expect(html.replace(/<!-- -->/g, '')).toMatch(/Presentation has played \d+ games? since then/);
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
