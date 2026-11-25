/**
 * The freshman pages' view models (components/freshman/freshman-view.ts) over the committed girls soccer and boys
 * basketball files: a team page's section, a day page's block, the /freshman hub, /freshman/<league> and a freshman
 * game's page. Every list is the freshman file's games, never a varsity or JV one, and carries no league chip.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type View = typeof import('../components/freshman/freshman-view');
type Freshman = typeof import('../lib/freshman/freshman');

async function load(sport: string): Promise<{ view: View; fr: Freshman; leagues: typeof import('../lib/leagues') }> {
  vi.stubEnv('SCVAL_SPORT', sport);
  vi.resetModules();
  return {
    view: await import('../components/freshman/freshman-view'),
    fr: await import('../lib/freshman/freshman'),
    leagues: await import('../lib/leagues'),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe.each(['soccer', 'basketball'])('the %s freshman views', (sport) => {
  it('give a team page a section only when the school has freshman games, each row linking its own page', async () => {
    const { view, fr } = await load(sport);
    const file = fr.getFreshmanFile()!;
    for (const team of file.teams) {
      const games = fr.getFreshmanGamesForTeam(team.slug);
      const section = view.buildTeamFreshmanView(team.slug);
      if (games.length === 0) {
        expect(section, team.slug).toBeNull();
        continue;
      }
      expect(section!.rows.map((r) => r.game)).toEqual(games);
      expect(section!.played + section!.toCome + section!.noScore).toBe(games.length);
      for (const row of section!.rows) {
        expect(row.chips).toBe(false);
        expect(row.href).toMatch(/^\/freshman\/game\//);
      }
      expect(section!.maxprepsUrl).toMatch(/\/freshman\/(winter\/)?schedule\/$/);
    }
  });

  it('list a day’s games once for every league and once per league, and the hub’s schools are the ones with games', async () => {
    const { view, fr, leagues } = await load(sport);
    for (const date of fr.getFreshmanDates()) {
      const all = view.buildDayFreshmanView(date).rows.map((r) => r.game.contestId);
      expect(all).toEqual(fr.getFreshmanGamesOn(date).map((g) => g.contestId));
      const perLeague = new Set(leagues.LEAGUE_IDS.flatMap((l) => view.buildDayFreshmanView(date, l).rows.map((r) => r.game.contestId)));
      expect([...perLeague].sort()).toEqual([...all].sort());
    }
    const withGames = view.freshmanLeagues(leagues.LEAGUE_IDS);
    expect(withGames.length).toBeGreaterThan(0);
    for (const league of leagues.LEAGUE_IDS) {
      const schedule = view.buildLeagueFreshmanScheduleView(league);
      expect(withGames.includes(league)).toBe(schedule.games > 0);
      expect(schedule.days.flatMap((d) => d.rows).length).toBe(schedule.games);
      for (const card of view.buildLeagueFreshmanTeams(league)) {
        expect(card.games).toBeGreaterThan(0);
        expect(card.href).toBe(`/teams/${card.team.slug}#freshman`);
      }
      const hub = view.buildLeagueFreshmanHubView(league);
      expect(hub.games).toBe(schedule.games);
      expect(hub.scheduleHref).toBe(`/freshman/${league}`);
    }
  });

  it('build every freshman game’s page, titled with the level and saying it counts in no table', async () => {
    const { view, fr } = await load(sport);
    const params = view.freshmanGameStaticParams();
    expect(params.map((p) => p.id)).toEqual(fr.getFreshmanGameSlugs());
    for (const { id } of params) {
      const model = view.buildFreshmanGameView(id)!;
      expect(model.canonical).toBe(`/freshman/game/${id}`);
      expect(model.param).toBe(id);
      expect(model.notes).toContain(view.FRESHMAN_COUNTS_NOTE);
      expect(model.dayHref).toMatch(/^\/scores\/\d{4}-\d{2}-\d{2}#freshman$|^\/freshman\//);
      const title = view.freshmanGameTitle(model);
      for (const side of [model.away, model.home]) {
        if (side.team) expect(title).toContain(`${side.label} freshman`);
      }
    }
    expect(view.buildFreshmanGameView('not-a-game')).toBeUndefined();
  });
});

describe('a build without the freshman level', () => {
  it('has no freshman views at all', async () => {
    const { view, leagues } = await load('field-hockey');
    expect(view.freshmanGameStaticParams()).toEqual([]);
    expect(view.freshmanLeagues(leagues.LEAGUE_IDS)).toEqual([]);
    expect(view.buildTeamFreshmanView('saint-francis')).toBeNull();
  });
});

describe('the cross-level placeholder on a freshman game page', () => {
  it('explains St. Ignatius’ game against a side MaxPreps does not name', async () => {
    const { view, fr } = await load('soccer');
    const game = fr.getFreshmanGamesForTeam('st-ignatius').find((g) => g.dateKey === '2026-11-19')!;
    const model = view.buildFreshmanGameView(fr.getFreshmanGameSlug(game.contestId)!)!;
    expect(model.notes[0]).toMatch(/^MaxPreps lists the opponent only as “Non Freshman Opponent”: St\. Ignatius/);
    expect(model.series).toHaveLength(1);
  });
});
