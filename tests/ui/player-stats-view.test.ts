/**
 * `components/teams/player-stats-view.ts` and `TeamPlayerStats` — the team page's player stats,
 * over the committed data/player-stats.json and snapshot.
 *
 * The section's promises: a column appears only when the team tracks that stat, a tracked stat a
 * player has no entry for is a dash (never a 0), a team with no stats says so, and the reader is
 * told when MaxPreps' totals are behind the games already played.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import TeamPlayerStats from '../../components/teams/TeamPlayerStats';
import {
  buildPlayerStatsView,
  savePercent,
  statText,
} from '../../components/teams/player-stats-view';
import { buildTeamPageView } from '../../components/teams/team-view';
import { getTeamPlayerStats } from '../../lib/player-stats';
import { TEAMS } from '../../lib/teams';

const views = TEAMS.map((t) => {
  const page = buildTeamPageView(t.slug)!;
  return {
    slug: t.slug,
    data: getTeamPlayerStats(t.slug)!,
    games: [...page.leagueLog, ...page.nonLeagueLog],
    view: buildPlayerStatsView(t.slug, [...page.leagueLog, ...page.nonLeagueLog])!,
  };
});

describe('buildPlayerStatsView', () => {
  it('builds a view for every team; a team with no stats has no tables', () => {
    for (const { slug, data, view } of views) {
      expect(view, slug).toBeDefined();
      if (data.players.length === 0) {
        expect(view.scoring, slug).toBeNull();
        expect(view.more, slug).toBeNull();
        expect(view.goalies, slug).toEqual([]);
      } else {
        expect(view.scoring, slug).not.toBeNull();
      }
    }
  });

  it('shows a column only when the team tracks that stat', () => {
    for (const { slug, data, view } of views) {
      const tracked = new Set<string>(data.tracked.field);
      for (const c of [...(view.scoring?.columns ?? []), ...(view.more?.columns ?? [])]) {
        expect(tracked.has(c.key), `${slug} ${c.key}`).toBe(true);
      }
    }
    // Homestead's coach enters goals and points but no assists.
    const homestead = views.find((v) => v.slug === 'homestead')!.view;
    expect(homestead.scoring!.columns.map((c) => c.label)).toEqual(['GP', 'G', 'Pts']);
  });

  it('lists every field player once on Scoring, best first by points', () => {
    for (const { slug, data, view } of views) {
      if (!view.scoring) continue;
      expect(view.scoring.rows.length, slug).toBe(data.players.filter((p) => p.field).length);
      const pts = view.scoring.columns.findIndex((c) => c.key === 'points');
      if (pts < 0) continue;
      const values = view.scoring.rows.map((r) => r.values[pts] ?? -1);
      expect(values, slug).toEqual([...values].sort((a, b) => b - a));
    }
  });

  it('keeps only players with at least one of its stats on the second table', () => {
    for (const { slug, view } of views) {
      for (const r of view.more?.rows ?? []) {
        expect(r.values.some((v) => v !== null && v > 0), `${slug} ${r.name}`).toBe(true);
      }
    }
  });

  it('computes save % only where both saves and goals against are tracked', () => {
    for (const { slug, data, view } of views) {
      const both = data.tracked.goalkeeping.includes('saves') && data.tracked.goalkeeping.includes('goalsAgainst');
      for (const card of view.goalies) {
        expect(card.stats.some((s) => s.label === 'Save %'), `${slug} ${card.name}`).toBe(both);
      }
    }
    const paredes = views
      .find((v) => v.slug === 'valley-christian')!
      .view.goalies.find((g) => g.name === 'Shyla Paredes')!;
    expect(paredes.stats.find((s) => s.label === 'Save %')!.text).toBe(savePercent(122, 20));
  });

  it('counts the finals played after the last MaxPreps update', () => {
    for (const { slug, data, games, view } of views) {
      const day = data.lastUpdated?.slice(0, 10);
      const expected = day ? games.filter((g) => g.status === 'final' && g.dateKey > day).length : 0;
      expect(view.gamesSince, slug).toBe(expected);
    }
    // Presentation's stats stop on Sep 10.
    expect(views.find((v) => v.slug === 'presentation')!.view.gamesSince).toBeGreaterThan(0);
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

describe('TeamPlayerStats', () => {
  it('renders every stat row, spells out each column head, and never prints null', () => {
    for (const { slug, view } of views) {
      const html = renderToStaticMarkup(createElement(TeamPlayerStats, { view }));
      expect(html, slug).not.toMatch(/>(null|undefined|NaN)</);
      for (const r of [...(view.scoring?.rows ?? []), ...(view.more?.rows ?? [])]) {
        expect(html, `${slug} ${r.name}`).toContain(r.name.replace(/'/g, '&#x27;'));
      }
      for (const c of [...(view.scoring?.columns ?? []), ...(view.more?.columns ?? [])]) {
        expect(html, `${slug} ${c.key}`).toContain(`<span class="sr-only">${c.title}</span>`);
      }
    }
  });

  it('says a team has no stats, rather than rendering an empty table', () => {
    const saratoga = views.find((v) => v.slug === 'saratoga')!.view;
    const html = renderToStaticMarkup(createElement(TeamPlayerStats, { view: saratoga }));
    expect(html).toContain('No player stats for Saratoga.');
    expect(html).not.toContain('<table');
  });

  it('warns when the totals are behind the games played', () => {
    const presentation = views.find((v) => v.slug === 'presentation')!.view;
    const html = renderToStaticMarkup(createElement(TeamPlayerStats, { view: presentation }));
    expect(html.replace(/<!-- -->/g, '')).toMatch(/Presentation has played \d+ games? since then/);
  });
});
