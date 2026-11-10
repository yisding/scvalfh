/**
 * The JV pages' view models (components/jv/jv-view.ts, jv-standings-view.ts) over the bundled JV file: what
 * /jv and /jv/<league> print must add up to the games lib/jv/jv.ts serves, whatever day the file was read.
 */
import { describe, expect, it } from 'vitest';

import { buildJvTablesView } from '../components/jv/jv-standings-view';
import {
  JV_HUB_MAX_ROWS,
  buildLeagueJvHubView,
  buildLeagueJvScheduleView,
  buildLeagueJvTeams,
  buildTeamJvView,
} from '../components/jv/jv-view';
import { localDateKey } from '../lib/format';
import { getJvFetchedAt, getJvGames, getJvTables } from '../lib/jv/jv';
import { LEAGUE_IDS } from '../lib/leagues';
import { getTeamBySlug, teamsInLeague } from '../lib/teams';

const today = localDateKey(getJvFetchedAt());
const leagueOf = (slug: string | null) => (slug ? getTeamBySlug(slug)?.league : undefined);

describe.each(LEAGUE_IDS.map((id) => [id]))('the JV pages of %s', (league) => {
  const all = getJvGames().filter((g) => leagueOf(g.home.slug) === league || leagueOf(g.away.slug) === league);

  it('lists every JV game of the league once on its calendar, by date, and its counts add up', () => {
    const view = buildLeagueJvScheduleView(league);
    const ids = view.days.flatMap((d) => d.rows.map((r) => r.game.contestId));
    expect([...ids].sort()).toEqual(all.map((g) => g.contestId).sort());
    expect(view.days.map((d) => d.dateKey)).toEqual([...new Set(all.map((g) => g.dateKey))].sort());
    for (const day of view.days) expect(day.rows.every((r) => r.game.dateKey === day.dateKey)).toBe(true);
    expect(view.games).toBe(all.length);
    expect(view.finals + view.noScore + view.toCome).toBe(view.games);
    expect(view.nextDateKey === null || view.nextDateKey >= today).toBe(true);
  });

  it('shows only finals as latest results and only games still to come as next games, in whole days', () => {
    const hub = buildLeagueJvHubView(league);
    const latest = hub.latest.flatMap((d) => d.rows.map((r) => r.game));
    const next = hub.next.flatMap((d) => d.rows.map((r) => r.game));
    expect(latest.every((g) => g.status === 'final')).toBe(true);
    expect(next.every((g) => g.status !== 'final' && g.dateKey >= today)).toBe(true);
    // Newest day first, soonest day first.
    expect(hub.latest.map((d) => d.dateKey)).toEqual(hub.latest.map((d) => d.dateKey).sort().reverse());
    expect(hub.next.map((d) => d.dateKey)).toEqual(hub.next.map((d) => d.dateKey).sort());
    // The cap cuts between days, never inside one, and always leaves the first day whole.
    for (const days of [hub.latest, hub.next]) {
      const rows = days.reduce((n, d) => n + d.rows.length, 0);
      expect(days.length <= 1 || rows <= JV_HUB_MAX_ROWS).toBe(true);
      for (const day of days) {
        expect(day.rows).toHaveLength(all.filter((g) => g.dateKey === day.dateKey && (days === hub.latest ? g.status === 'final' : g.status !== 'final' && g.status !== 'postponed')).length);
      }
    }
    expect(hub.games).toBe(all.length);
    expect(hub.finals).toBe(all.filter((g) => g.status === 'final').length);
    expect(hub.scheduleHref).toBe(`/jv/${league}`);
    // A league with finals shows some; a league with games to come shows some.
    expect(hub.latest.length > 0).toBe(hub.finals > 0);
    expect(hub.next.length > 0).toBe(all.some((g) => g.status !== 'final' && g.status !== 'postponed' && g.dateKey >= today));
  });

  it('gives every school of the league a JV card that agrees with its team page', () => {
    const cards = buildLeagueJvTeams(league);
    expect(cards.map((c) => c.team.slug)).toEqual(teamsInLeague(league).map((t) => t.slug));
    for (const card of cards) {
      const view = buildTeamJvView(card.team.slug)!;
      expect(card.href).toBe(`/teams/${card.team.slug}#jv`);
      expect(card.games).toBe(view.rows.length);
      expect(card.finals).toBe(view.played);
      expect(card.record).toBe(view.record?.overall ?? null);
      // A record exists exactly when the team has a final, and its numbers are that many games.
      expect(view.record !== null).toBe(view.played > 0);
      if (view.record) {
        expect(view.record.overall.split('-').reduce((n, x) => n + Number(x), 0)).toBe(view.played);
      }
      expect(view.played + view.toCome + view.noScore).toBe(view.rows.length);
    }
  });

  it('heads each JV table the league’s and the sport’s way, and lists its teams before the first league game', () => {
    const tables = getJvTables(league);
    const views = buildJvTablesView(league);
    expect(views).toHaveLength(tables.length);
    views.forEach((view, i) => {
      const table = tables[i];
      expect(view.preseason).toBe(table.status === 'none-played' && table.rows.length > 0);
      expect(view.scheduleNote !== null).toBe(table.fromSchedule > 0);
      expect(view.rows.map((r) => r.row.teamId)).toEqual(table.rows.map((r) => r.teamId));
      expect(view.heads.gpTitle.includes('each team plays')).toBe(table.gamesPerTeam !== null);
      // No order cell is ever empty or a bare NaN: points as an integer, or a percentage like '.750'.
      for (const r of view.rows) expect(r.orderText).toMatch(/^(\d+|1?\.\d{3})$/);
    });
  });
});
