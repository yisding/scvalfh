/**
 * The schedule and scores pages (SPEC §10.4, §8.1): league scoping (`/schedule/<league>`), the
 * light `/schedule` index, the `ScheduleFilters` props per league, the `/scores/[date]` league
 * groups and the client-boundary split of `components/schedule/filter-data.ts`.
 *
 * League-specific values run on the all-2026-10-02 CORPUS snapshot (SPEC §13.6): SCVAL_SNAPSHOT is
 * set before lib/data is imported (dynamic imports after `vi.resetModules()`). Every assertion
 * message names the module that produced the value.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { REPO, corpusSnapshotPath } from '../helpers';
import { textOf } from './html-text';

type Data = typeof import('../../lib/data');
type Server = typeof import('../../components/schedule/filter-data-server');
type Index = typeof import('../../components/schedule/schedule-view');
type Day = typeof import('../../components/schedule/day-summary');

const priorEnv = process.env.SCVAL_SNAPSHOT;
let data: Data;
let server: Server;
let index: Index;
let day: Day;
let Filters: typeof import('../../components/schedule/ScheduleFilters').ScheduleFilters;
let renderLeague: (league: string) => Promise<string>;
let renderIndex: () => string;
let renderDay: (date: string) => Promise<string>;

beforeAll(async () => {
  process.env.SCVAL_SNAPSHOT = corpusSnapshotPath('all-2026-10-02');
  vi.resetModules();
  data = await import('../../lib/data');
  server = await import('../../components/schedule/filter-data-server');
  index = await import('../../components/schedule/schedule-view');
  day = await import('../../components/schedule/day-summary');
  Filters = (await import('../../components/schedule/ScheduleFilters')).ScheduleFilters;
  const leaguePage = (await import('../../app/schedule/[league]/page')).default;
  const indexPage = (await import('../../app/schedule/page')).default;
  const dayPage = (await import('../../app/scores/[date]/page')).default;
  renderLeague = async (league) =>
    renderToStaticMarkup((await leaguePage({ params: Promise.resolve({ league }) } as never)) as ReactElement);
  renderIndex = () => renderToStaticMarkup(createElement(indexPage));
  renderDay = async (date) =>
    renderToStaticMarkup((await dayPage({ params: Promise.resolve({ date }) } as never)) as ReactElement);
}, 600_000);

afterAll(() => {
  if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
  else process.env.SCVAL_SNAPSHOT = priorEnv;
  vi.resetModules();
});

const leagueOfSlug = (slug: string | null) => (slug ? data.getTeamBySlug(slug)?.league : undefined);

describe('league scoping (/schedule/<league>)', () => {
  it('lists every game with a side in the league exactly once, and a cross-league game in both leagues', () => {
    const lists = new Map<string, string[]>();
    for (const id of data.getLeagueIds()) {
      const ids = data.getGamesByDate({ league: id }).flatMap((g) => g.games.map((x) => x.contestId));
      expect(new Set(ids).size, `lib/data.ts getGamesByDate(${id}): duplicates`).toBe(ids.length);
      lists.set(id, ids);
      for (const g of data.getGames({ league: id })) {
        expect(
          [leagueOfSlug(g.home.slug), leagueOfSlug(g.away.slug)],
          `lib/data.ts getGames({league:${id}}) ${g.contestId}`,
        ).toContain(id);
      }
    }
    const cross = data.getGames().filter((g) => {
      const a = leagueOfSlug(g.away.slug);
      const h = leagueOfSlug(g.home.slug);
      return a && h && a !== h;
    });
    for (const g of cross) {
      expect(lists.get(leagueOfSlug(g.away.slug)!), `cross-league ${g.contestId}`).toContain(g.contestId);
      expect(lists.get(leagueOfSlug(g.home.slug)!), `cross-league ${g.contestId}`).toContain(g.contestId);
    }
  });

  it('renders each of the league’s games once, tags the other league, and ends the rail with its own postseason', async () => {
    for (const id of data.getLeagueIds()) {
      const html = await renderLeague(id);
      const rendered = [...html.matchAll(/data-game="([^"]+)"/g)].map((m) => m[1]);
      const expected = data.getGames({ league: id }).map((g) => g.contestId);
      expect(rendered.length, `app/schedule/[league]/page.tsx ${id}: rows`).toBe(expected.length);
      expect(new Set(rendered)).toEqual(new Set(expected));
      expect(textOf(html), `app/schedule/[league]/page.tsx ${id}`).not.toContain('Gabilan');
    }
    const mcal = await renderLeague('mcal');
    expect(mcal, 'components/schedule/TimelineRail.tsx mcal chip').toContain('href="/playoffs/mcal"');
    expect(textOf(mcal)).toContain('MCAL tournament Oct 26–30');
    expect(textOf(mcal)).not.toMatch(/CCS Nov/);
    const scval = await renderLeague('scval');
    expect(scval, 'components/schedule/TimelineRail.tsx scval chip').toContain('href="/playoffs#scval"');
    // No article before the initialism ('a MCAL team' is wrong; 'an SCVAL team' reads oddly too).
    expect(textOf(mcal), 'app/schedule/[league]/page.tsx header').toContain('every contest involving MCAL teams');
    expect(textOf(mcal)).not.toMatch(/\ba (MCAL|SCVAL|BVAL|PCAL|EAL)\b/);
    // The EAL's Super Regional publishes no bracket: the chip goes to its card on /playoffs.
    const eal = await renderLeague('eal');
    expect(eal, 'components/schedule/TimelineRail.tsx eal chip').toContain('href="/playoffs#eal"');
    expect(textOf(eal), 'components/schedule/TimelineRail.tsx eal chip').toContain('Super Regional Oct 30–31');
    expect(eal, 'components/schedule/TimelineRail.tsx eal chip sr').toContain('Super Regional, Oct 30 to 31');
    expect(textOf(eal)).not.toMatch(/CCS Nov|\bCCS\b/);
    expect(textOf(eal)).not.toMatch(/\ba (MCAL|SCVAL|BVAL|PCAL|EAL)\b/);
  });

  it('lands the Scores tab on a date group the league’s list lays out (lib/data getScoresLandingDate)', async () => {
    for (const id of data.getLeagueIds()) {
      const landing = data.getScoresLandingDate({ league: id });
      expect(landing, `lib/data.ts getScoresLandingDate(${id})`).not.toBeNull();
      expect(data.getGameDates({ league: id }), `lib/data.ts getScoresLandingDate(${id})`).toContain(landing);
      expect(landing, `lib/data.ts getScoresLandingDate(${id})`).toBe(data.getLatestResultsDate({ league: id }));
      const html = await renderLeague(id);
      expect(html, `components/schedule/ScheduleList.tsx ${id}: #${landing}`).toContain(`id="${landing}"`);
    }
  });
});

describe('ScheduleFilters props', () => {
  it('single-division leagues get no divisions and no division labels', () => {
    for (const id of ['pcal', 'mcal', 'eal']) {
      const summary = data.getLeagueSummary(id)!;
      const props = server.scheduleFilterProps(summary, data.getTeams({ league: id }));
      expect(props.divisions, `components/schedule/filter-data-server.ts ${id}`).toEqual([]);
      expect(props.teams.every((t) => t.divisionLabel === null)).toBe(true);
      expect(props.teams.length).toBe(summary.teamCount);
      const html = renderToStaticMarkup(
        createElement(Filters, { ...props, counts: { total: 1, final: 1, upcoming: 0, pending: 0 }, listId: 'x' }),
      );
      expect(html, `components/schedule/ScheduleFilters.tsx ${id}: division select`).not.toContain('>Division<');
      expect(html, `components/schedule/ScheduleFilters.tsx ${id}: optgroup`).not.toContain('<optgroup');
    }
  });

  it('multi-division leagues get one optgroup per division and a division select', () => {
    const summary = data.getLeagueSummary('bval')!;
    const props = server.scheduleFilterProps(summary, data.getTeams({ league: 'bval' }));
    expect(props.divisions).toEqual([
      { id: 'mt-hamilton', label: 'Mt. Hamilton' },
      { id: 'santa-teresa', label: 'Santa Teresa' },
    ]);
    const html = renderToStaticMarkup(
      createElement(Filters, { ...props, counts: { total: 1, final: 1, upcoming: 0, pending: 0 }, listId: 'x' }),
    );
    expect(html).toContain('<optgroup label="Mt. Hamilton Division">');
    expect(html).toContain('<optgroup label="Santa Teresa Division">');
    expect(html).toContain('>Division<');
  });

  it('marks league games from countsFor', () => {
    for (const g of data.getGames()) {
      expect(server.gameFilterAttrs(g)['data-league'], `components/schedule/filter-data-server.ts ${g.contestId}`).toBe(
        g.countsFor !== null ? '1' : '0',
      );
    }
  });

  it('keeps the client module free of the registry (client boundary)', () => {
    const src = readFileSync(path.join(REPO, 'components/schedule/filter-data.ts'), 'utf8');
    expect(src, 'components/schedule/filter-data.ts').not.toMatch(/from ['"][^'"]*lib\/(teams|data|leagues)['"]/);
  });
});

describe('the /schedule index', () => {
  it('has one row per game day with id=YYYY-MM-DD linking the day page', () => {
    const html = renderIndex();
    for (const date of data.getGameDates()) {
      expect(html, `components/schedule/ScheduleIndex.tsx #${date}`).toContain(`id="${date}"`);
      expect(html).toContain(`href="/scores/${date}"`);
    }
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i), 'app/schedule/page.tsx duplicate ids').toEqual([]);
    const text = textOf(html);
    for (const kicker of ['Recent', 'Next', 'Every game day']) expect(text).toContain(kicker);
  });

  it('builds Recent and Next around today, at most three rows per league, and per-league day counts', () => {
    const today = data.getToday();
    const built = index.buildScheduleIndex({
      games: data.getGames(),
      leagues: data.getLeagueSummaries(),
      leagueOf: (slug) => data.getTeamBySlug(slug)?.league,
      today,
    });
    expect(built.recent.length).toBeLessThanOrEqual(3);
    expect(built.next.length).toBeLessThanOrEqual(3);
    expect(built.recent.every((d) => d.date <= today), 'components/schedule/schedule-view.ts recent').toBe(true);
    expect(built.next.every((d) => d.date > today), 'components/schedule/schedule-view.ts next').toBe(true);
    for (const d of built.days) {
      const games = data.getGames({ date: d.date });
      expect(d.total).toBe(games.length);
      for (const l of d.byLeague) {
        const id = data.getLeagueSummaries().find((x) => x.shortName === l.shortName)!.id;
        expect(l.games, `components/schedule/schedule-view.ts ${d.date} ${id}`).toBe(
          games.filter((g) => leagueOfSlug(g.home.slug) === id || leagueOfSlug(g.away.slug) === id).length,
        );
      }
    }
    expect(built.cards.map((c) => c.id)).toEqual(data.getLeagueIds());
    for (const card of built.cards) {
      expect(card.games, `components/schedule/schedule-view.ts card ${card.id}`).toBe(
        data.getGames({ league: card.id }).length,
      );
    }
  });
});

describe('/scores/[date]', () => {
  it('groups a day by league then Non-league, each game once, with real plurals', async () => {
    for (const date of data.getGameDates()) {
      const games = data.getGames({ date });
      const groups = day.dayGroups(games);
      const ids = groups.flatMap((g) => g.games.map((x) => x.contestId));
      expect(ids.length, `components/schedule/day-summary.ts dayGroups ${date}`).toBe(games.length);
      expect(new Set(ids).size).toBe(games.length);
      for (const group of groups) {
        expect(group.kicker).not.toMatch(/\(s\)/);
        if (group.leagueId) {
          const n = group.games.length;
          expect(group.kicker.endsWith(n === 1 ? '· 1 league game' : `· ${n} league games`)).toBe(true);
        } else {
          expect(group.kicker).toBe(`Non-league · ${group.games.length}`);
        }
      }
    }
    const busiest = data
      .getGameDates()
      .map((date) => ({ date, groups: day.dayGroups(data.getGames({ date })) }))
      .sort((a, b) => b.groups.length - a.groups.length)[0];
    const html = await renderDay(busiest.date);
    for (const group of busiest.groups) {
      expect(html, `app/scores/[date]/page.tsx #${group.id}`).toContain(`id="${group.id}"`);
    }
    if (busiest.groups.length >= 2) expect(html).toContain('aria-label="Leagues on this day"');
  });

  it('describes the day with no league name and titles the card with the league count', () => {
    const date = data.getGameDates()[0];
    const games = data.getGames({ date });
    expect(day.daySummary(games, 'Monday, August 24, 2026').sentence).toMatch(
      /^\d+ girls varsity field hockey games? on Monday, August 24, 2026\./,
    );
    const k = day.leaguesInvolved(games).length;
    expect(day.dayCardTitle('Mon Aug 24', games)).toBe(
      `Mon Aug 24 · ${games.length} ${games.length === 1 ? 'game' : 'games'} in ${k} ${k === 1 ? 'league' : 'leagues'}`,
    );
  });
});

describe('fixture status and slate records (UI pass, league-aware)', () => {
  it('an official fixture reads "Upcoming" on or after today and "No result" before it', async () => {
    const { OfficialFixtures } = await import('../../components/schedule/OfficialFixtures');
    const team = data.getTeams({ league: 'bval' })[0];
    const today = data.getToday();
    const fixture = (dateKey: string) => ({
      id: `${team.division}:${dateKey}:Somewhere@${team.slug}`,
      league: team.league,
      division: team.division,
      dateKey,
      time: null,
      awayName: 'Somewhere',
      homeName: team.name,
      awaySlug: null,
      homeSlug: team.slug,
      source: 'bval-docx' as const,
    });
    const render = (dateKey: string) =>
      textOf(
        renderToStaticMarkup(
          createElement(OfficialFixtures, { fixtures: [fixture(dateKey)], leagueId: team.league, today }),
        ),
      );
    const future = render('2099-10-30');
    expect(future, 'components/schedule/OfficialFixtures.tsx future').toContain('Upcoming');
    expect(future).toContain('On BVAL’s schedule only, not played yet');
    expect(future).not.toContain('No result');
    expect(future).not.toMatch(/not reported/i);
    expect(future).toContain('1 official BVAL fixture with no published result');
    const past = render('2000-09-01');
    expect(past, 'components/schedule/OfficialFixtures.tsx past').toContain('No result');
    expect(past).toContain('On BVAL’s schedule only, no result');
    expect(past).not.toContain('Upcoming');
  });

  it('an upcoming league game on a slate names both sides’ league records in words, never 0-0-0', async () => {
    const { GameRow } = await import('../../components/ui/GameRow');
    const { recordWords } = await import('../../lib/format');
    const today = data.getToday();
    const upcoming = data
      .getGames()
      .filter((g) => g.status === 'scheduled' && g.dateKey >= today);
    const league = upcoming.find((g) => g.countsFor !== null);
    expect(league, 'corpus has an upcoming league game').toBeDefined();
    const text = textOf(renderToStaticMarkup(createElement(GameRow, { game: league!, showRecords: true })));
    let checked = 0;
    for (const side of [league!.away, league!.home]) {
      const standing = side.slug ? data.getStandingFor(side.slug) : undefined;
      if (standing?.hasReportedResults) {
        checked += 1;
        expect(text, `components/ui/GameRow.tsx records: ${side.slug}`).toContain(
          `${recordWords(standing.computed)} in league`,
        );
      }
    }
    expect(checked, 'a side with a record was checked').toBeGreaterThan(0);
    expect(text).not.toContain('0-0-0');
    const nonLeague = upcoming.find((g) => g.countsFor === null);
    if (nonLeague) {
      const nl = textOf(renderToStaticMarkup(createElement(GameRow, { game: nonLeague, showRecords: true })));
      expect(nl, 'components/ui/GameRow.tsx: no records on a non-league game').not.toContain(' in league');
    }
  });
});
