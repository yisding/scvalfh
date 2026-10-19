/**
 * The schedule and scores pages (SPEC §10.4, §8.1): league scoping (`/schedule/<league>`), the
 * light `/schedule` index, the `ScheduleFilters` props per league, the `/scores/[date]` league
 * groups and the client-boundary split of `views/schedule/filters-client.ts`.
 *
 * League-specific values run on the all-2026-10-02 CORPUS snapshot (SPEC §13.6): useCorpusModules
 * points lib/datasets/snapshot.ts at it before lib/queries/ is imported. Every assertion
 * message names the module that produced the value.
 */

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LEAGUE_IDS } from '@/lib/config/leagues';
import { getTeamBySlug } from '@/lib/registry/teams';
import { useCorpusModules } from '@/tests/support/corpus-modules';
import { textOf } from '@/tests/support/html-text';
import { loadQueries } from '@/tests/support/queries';

const m = useCorpusModules('all-2026-10-02', {
  data: loadQueries,
  server: () => import('@/views/schedule/filters'),
  index: () => import('@/views/schedule/schedule-view'),
  day: () => import('@/views/schedule/day-summary'),
  filters: () => import('@/components/schedule/ScheduleFilters'),
  leaguePage: () => import('@/app/schedule/[league]/page'),
  indexPage: () => import('@/app/schedule/page'),
  dayPage: () => import('@/app/scores/[date]/page'),
});

async function renderLeague(league: string): Promise<string> {
  return renderToStaticMarkup((await m.leaguePage.default({ params: Promise.resolve({ league }) } as never)) as ReactElement);
}

function renderIndex(): string {
  return renderToStaticMarkup(createElement(m.indexPage.default));
}

async function renderDay(date: string): Promise<string> {
  return renderToStaticMarkup((await m.dayPage.default({ params: Promise.resolve({ date }) } as never)) as ReactElement);
}

const leagueOfSlug = (slug: string | null) => (slug ? getTeamBySlug(slug)?.league : undefined);

describe('league scoping (/schedule/<league>)', () => {
  it('lists every game with a side in the league exactly once, and a cross-league game in both leagues', () => {
    const lists = new Map<string, string[]>();
    for (const id of LEAGUE_IDS) {
      const ids = m.data.getGamesByDate({ league: id }).flatMap((g) => g.games.map((x) => x.contestId));
      expect(new Set(ids).size, `lib/queries/games.ts getGamesByDate(${id}): duplicates`).toBe(ids.length);
      lists.set(id, ids);
      for (const g of m.data.getGames({ league: id })) {
        expect(
          [leagueOfSlug(g.home.slug), leagueOfSlug(g.away.slug)],
          `lib/queries/games.ts getGames({league:${id}}) ${g.contestId}`,
        ).toContain(id);
      }
    }
    const cross = m.data.getGames().filter((g) => {
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
    for (const id of LEAGUE_IDS) {
      const html = await renderLeague(id);
      const rendered = [...html.matchAll(/data-game="([^"]+)"/g)].map((m) => m[1]);
      const expected = m.data.getGames({ league: id }).map((g) => g.contestId);
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
    expect(textOf(mcal), 'app/schedule/[league]/page.tsx header').toContain('every game involving MCAL teams');
    expect(textOf(mcal)).not.toMatch(/\ba (MCAL|SCVAL|BVAL|PCAL|EAL)\b/);
    // The EAL's Super Regional publishes no bracket: the chip goes to its card on /playoffs.
    const eal = await renderLeague('eal');
    expect(eal, 'components/schedule/TimelineRail.tsx eal chip').toContain('href="/playoffs#eal"');
    expect(textOf(eal), 'components/schedule/TimelineRail.tsx eal chip').toContain('Super Regional Oct 30–31');
    expect(eal, 'components/schedule/TimelineRail.tsx eal chip sr').toContain('Super Regional, Oct 30 to 31');
    expect(textOf(eal)).not.toMatch(/CCS Nov|\bCCS\b/);
    expect(textOf(eal)).not.toMatch(/\ba (MCAL|SCVAL|BVAL|PCAL|EAL)\b/);
  });

  it('lands the Scores tab on a date group the league’s list lays out (lib/queries/games getScoresLandingDate)', async () => {
    // The all-2026-10-02 corpus predates the four Southern California leagues, which it carries as
    // "not fetched in this run" with no games, so a league with no game date in it has no landing
    // date to check. The five leagues the corpus does cover must all be checked.
    const covered = LEAGUE_IDS.filter((id) => m.data.getGameDates({ league: id }).length > 0);
    expect(covered, 'corpus leagues with games').toEqual(expect.arrayContaining(['scval', 'bval', 'pcal', 'mcal', 'eal']));
    for (const id of covered) {
      const landing = m.data.getScoresLandingDate({ league: id });
      expect(landing, `lib/queries/games.ts getScoresLandingDate(${id})`).not.toBeNull();
      expect(m.data.getGameDates({ league: id }), `lib/queries/games.ts getScoresLandingDate(${id})`).toContain(landing);
      expect(landing, `lib/queries/games.ts getScoresLandingDate(${id})`).toBe(m.data.getLatestResultsDate({ league: id }));
      const html = await renderLeague(id);
      expect(html, `components/schedule/ScheduleList.tsx ${id}: #${landing}`).toContain(`id="${landing}"`);
    }
  });
});

describe('ScheduleFilters props', () => {
  it('single-division leagues get no divisions and no division labels', () => {
    for (const id of ['pcal', 'mcal', 'eal']) {
      const summary = m.data.getLeagueSummary(id)!;
      const props = m.server.scheduleFilterProps(summary, m.data.getTeams({ league: id }));
      expect(props.divisions, `views/schedule/filters.ts ${id}`).toEqual([]);
      expect(props.teams.every((t) => t.divisionLabel === null)).toBe(true);
      expect(props.teams.length).toBe(summary.teamCount);
      const html = renderToStaticMarkup(
        createElement(m.filters.ScheduleFilters, { ...props, counts: { total: 1, final: 1, upcoming: 0, pending: 0 }, listId: 'x' }),
      );
      expect(html, `components/schedule/ScheduleFilters.tsx ${id}: division select`).not.toContain('>Division<');
      expect(html, `components/schedule/ScheduleFilters.tsx ${id}: optgroup`).not.toContain('<optgroup');
    }
  });

  it('multi-division leagues get one optgroup per division and a division select', () => {
    const summary = m.data.getLeagueSummary('bval')!;
    const props = m.server.scheduleFilterProps(summary, m.data.getTeams({ league: 'bval' }));
    expect(props.divisions).toEqual([
      { id: 'mt-hamilton', label: 'Mt. Hamilton' },
      { id: 'santa-teresa', label: 'Santa Teresa' },
    ]);
    const html = renderToStaticMarkup(
      createElement(m.filters.ScheduleFilters, { ...props, counts: { total: 1, final: 1, upcoming: 0, pending: 0 }, listId: 'x' }),
    );
    expect(html).toContain('<optgroup label="Mt. Hamilton Division">');
    expect(html).toContain('<optgroup label="Santa Teresa Division">');
    expect(html).toContain('>Division<');
  });

  it('marks league games from countsFor', () => {
    for (const g of m.data.getGames()) {
      expect(m.server.gameFilterAttrs(g)['data-league'], `views/schedule/filters.ts ${g.contestId}`).toBe(
        g.countsFor !== null ? '1' : '0',
      );
    }
  });
});

describe('the /schedule index', () => {
  it('has one row per game day with id=YYYY-MM-DD linking the day page', () => {
    const html = renderIndex();
    for (const date of m.data.getGameDates()) {
      expect(html, `components/schedule/ScheduleIndex.tsx #${date}`).toContain(`id="${date}"`);
      expect(html).toContain(`href="/scores/${date}"`);
    }
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i), 'app/schedule/page.tsx duplicate ids').toEqual([]);
    const text = textOf(html);
    for (const kicker of ['Recent', 'Next', 'Every game day']) expect(text).toContain(kicker);
  });

  it('names the region wherever both regions’ copies would otherwise read the same with JS off', async () => {
    const html = renderIndex();
    // The SoCal Recent / Next / day sections carry 'Southern California' in their names; the NorCal
    // ones keep their headings (axe landmark-unique, review 2026-10-06).
    expect(html, 'components/schedule/ScheduleIndex.tsx').not.toMatch(/<section aria-labelledby="[^"]*-socal"/);
    const labels = [...html.matchAll(/<section aria-label="([^"]+)"/g)].map((m) => m[1]);
    for (const label of labels) expect(label, 'components/schedule/ScheduleIndex.tsx').toMatch(/, Southern California$/);
    expect(new Set(labels).size, 'components/schedule/ScheduleIndex.tsx unique').toBe(labels.length);
    // The corpus has no SoCal game day, so the SoCal copies are rendered here from a hand-built view.
    const { ScheduleIndex } = await import('@/components/schedule/ScheduleIndex');
    const day = (date: string) => ({ date, total: 0, leagues: [] });
    const both = renderToStaticMarkup(
      createElement(ScheduleIndex, {
        cards: [],
        recent: [],
        next: [],
        days: [],
        regions: [
          { id: 'norcal', idSuffix: '', recent: [day('2026-10-02')], next: [day('2026-10-06')] },
          { id: 'socal', idSuffix: '-socal', recent: [day('2026-10-02')], next: [day('2026-10-06')] },
        ],
      }),
    );
    expect([...both.matchAll(/<section aria-label="([^"]+)"/g)].map((m) => m[1])).toEqual([
      'Recent, Southern California',
      'Friday, October 2, Southern California',
      'Next, Southern California',
      'Tuesday, October 6, Southern California',
    ]);
    expect(both).toContain('<section aria-labelledby="schedule-recent"');
    expect(both).toContain('<section aria-labelledby="recent-2026-10-02"');
    // Every game day: each region's count names its region ('NorCal: 4 games · SCVAL 1 …').
    const rows = [...html.matchAll(/<li id="\d{4}-\d{2}-\d{2}">([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1]));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row, 'components/schedule/ScheduleIndex.tsx day row').not.toMatch(/· \d+ games?\b/);
      expect(row).toMatch(/· (NorCal: \d+ games?|no NorCal games)\b/);
      expect(row).toMatch(/· (SoCal: \d+ games?|no SoCal games)\b/);
    }
  });

  it('builds Recent and Next around today, at most three rows per league, and per-league day counts', () => {
    const today = m.data.getToday();
    const built = m.index.buildScheduleIndex({
      games: m.data.getGames(),
      leagues: m.data.getLeagueSummaries(),
      leagueOf: (slug) => getTeamBySlug(slug)?.league,
      today,
    });
    expect(built.recent.length).toBeLessThanOrEqual(3);
    expect(built.next.length).toBeLessThanOrEqual(3);
    expect(built.recent.every((d) => d.date <= today), 'views/schedule/schedule-view.ts recent').toBe(true);
    expect(built.next.every((d) => d.date > today), 'views/schedule/schedule-view.ts next').toBe(true);
    for (const d of built.days) {
      const games = m.data.getGames({ date: d.date });
      expect(d.total).toBe(games.length);
      for (const l of d.byLeague) {
        const id = m.data.getLeagueSummaries().find((x) => x.shortName === l.shortName)!.id;
        expect(l.games, `views/schedule/schedule-view.ts ${d.date} ${id}`).toBe(
          games.filter((g) => leagueOfSlug(g.home.slug) === id || leagueOfSlug(g.away.slug) === id).length,
        );
      }
    }
    expect(built.cards.map((c) => c.id)).toEqual(LEAGUE_IDS);
    for (const card of built.cards) {
      expect(card.games, `views/schedule/schedule-view.ts card ${card.id}`).toBe(
        m.data.getGames({ league: card.id }).length,
      );
    }
    // Per region (DESIGN-socal §2.4): each region's Recent and Next are its own game days, and each
    // day row counts the games with a side in the region.
    expect(built.regions.map((r) => [r.id, r.idSuffix])).toEqual([['norcal', ''], ['socal', '-socal']]);
    for (const r of built.regions) {
      for (const d of [...r.recent, ...r.next]) {
        expect(d.leagues.length, `views/schedule/schedule-view.ts ${r.id} ${d.date}`).toBeGreaterThan(0);
        expect(d.leagues.every((l) => l.region === r.id)).toBe(true);
      }
    }
    for (const d of built.days) {
      expect(d.byRegion.map((r) => r.region)).toEqual(['norcal', 'socal']);
      expect(d.byRegion.reduce((n, r) => n + r.total, 0)).toBeGreaterThanOrEqual(d.total);
    }
  });

  it('renders the cards and Recent/Next per region, one day index, and the region control', () => {
    const html = renderIndex();
    expect(html, 'app/schedule/page.tsx region control').toContain('data-region-option="socal"');
    expect(html).toContain('<div data-region-scope="norcal">');
    expect(html).toContain('<div data-region-scope="socal">');
    // A card grid holding a jump target is never itself region-scoped (the deep-link rule would unset its grid).
    expect(html).not.toMatch(/<ul data-region-scope[^>]*grid/);
    for (const id of LEAGUE_IDS) expect(html, `components/schedule/ScheduleIndex.tsx #${id}`).toContain(`id="${id}"`);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i), 'app/schedule/page.tsx duplicate ids').toEqual([]);
  });
});

describe('the timeline rail’s today chip (components/schedule/TimelineRail.tsx)', () => {
  type Chip = { date: string; kind: string; href: string; label: string; sr: string; current: boolean };
  const chips = async (dates: string[], today: string): Promise<Chip[]> => {
    const { TimelineRail } = await import('@/components/schedule/TimelineRail');
    const html = renderToStaticMarkup(createElement(TimelineRail, { dates, today, leagueId: 'scval' }));
    return [...html.matchAll(/<a href="#([^"]+)" data-rail-date="([^"]+)" data-rail-kind="([^"]+)" class="([^"]*)">([\s\S]*?)<\/a>/g)].map(
      (m) => ({
        href: m[1],
        date: m[2],
        kind: m[3],
        current: m[4].includes('bg-accent-wash'),
        label: textOf(m[5].match(/data-rail-label="[^"]*">([^<]*)</)![1]),
        sr: textOf(m[5].match(/data-rail-sr="[^"]*">([^<]*)</)![1]),
      }),
    );
  };

  it('reads Today, with the wash, on a game day', async () => {
    const rail = await chips(['2026-09-01', '2026-10-06', '2026-10-30'], '2026-10-06');
    const today = rail.find((c) => c.kind === 'today')!;
    expect(today).toMatchObject({ date: '2026-10-06', href: '2026-10-06', label: 'Today', current: true });
    expect(today.sr).toBe('Today, Tuesday, October 6');
  });

  it('reads Next on a day with no game, aimed at the next game day, and keeps the month chip', async () => {
    const rail = await chips(['2026-09-01', '2026-10-01', '2026-10-13', '2026-10-30'], '2026-10-12');
    const next = rail.find((c) => c.kind === 'today')!;
    // `data-rail-date` stays today, so rail-targets.ts's `today` rule still measures from today.
    expect(next).toMatchObject({ date: '2026-10-12', href: '2026-10-13', label: 'Next', current: false });
    expect(next.sr).toBe('Next game day, Tuesday, October 13');
    expect(rail.map((c) => c.kind)).toEqual(['up', 'month', 'today', 'down']);
    // A Next chip on the month's first game day sits beside it rather than swallowing it.
    const onMonth = await chips(['2026-09-01', '2026-10-01', '2026-10-30'], '2026-09-30');
    expect(onMonth.map((c) => [c.kind, c.href])).toEqual([
      ['up', '2026-09-01'], ['month', '2026-10-01'], ['today', '2026-10-01'], ['down', '2026-10-30'],
    ]);
  });

  it('keeps the ↑ chip when the next game day is the first, and drops the chip once none is left', async () => {
    const dates = ['2026-09-01', '2026-10-01', '2026-10-30'];
    const pre = await chips(dates, '2026-08-20');
    expect(pre.map((c) => [c.kind, c.href, c.label])).toEqual([
      ['up', '2026-09-01', 'Sep 1'], ['today', '2026-09-01', 'Next'], ['month', '2026-10-01', 'Oct'], ['down', '2026-10-30', 'Oct 30'],
    ]);
    const post = await chips(dates, '2026-11-02');
    expect(post.map((c) => c.kind)).toEqual(['up', 'month', 'down']);
  });
});

describe('Southern California schedule pages (DESIGN-socal §2.4)', () => {
  it('the rail’s postseason chip: the Section’s playoffs for a San Diego league, none for the Sunset', async () => {
    // The rail itself, over two game days (it draws nothing for a league with no dates yet).
    const { TimelineRail } = await import('@/components/schedule/TimelineRail');
    const rail = (leagueId: string) =>
      renderToStaticMarkup(createElement(TimelineRail, { dates: ['2026-09-01', '2026-10-30'], today: '2026-10-06', leagueId }));
    const city = rail('city');
    expect(city, 'components/schedule/TimelineRail.tsx city chip').toContain('href="/playoffs#city"');
    expect(textOf(city)).toContain('Section playoffs Nov 2–14');
    expect(city).toContain('San Diego Section playoffs, Monday, November 2 to Saturday, November 14');
    const sunset = rail('sunset');
    expect(sunset, 'components/schedule/TimelineRail.tsx no Sunset chip').not.toContain('/playoffs');
    expect(textOf(sunset)).not.toMatch(/\bCCS\b|playoffs/);
  });

  it('a league page’s chips are its region’s leagues plus All', async () => {
    const html = await renderLeague('sunset');
    const nav = html.match(/<nav aria-label="Leagues"[\s\S]*?<\/nav>/)![0];
    const hrefs = [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([
      '/schedule', '/schedule/sunset', '/schedule/independents', '/schedule/city', '/schedule/north-county', '/schedule/metro',
    ]);
  });
});

describe('/scores/[date]', () => {
  it('groups a day by league then Non-league, each game once, with real plurals', async () => {
    for (const date of m.data.getGameDates()) {
      const games = m.data.getGames({ date });
      const groups = m.day.dayGroups(games);
      const ids = groups.flatMap((g) => g.games.map((x) => x.contestId));
      expect(ids.length, `views/schedule/day-summary.ts dayGroups ${date}`).toBe(games.length);
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
    const busiest = m.data
      .getGameDates()
      .map((date) => ({ date, groups: m.day.dayGroups(m.data.getGames({ date })) }))
      .sort((a, b) => b.groups.length - a.groups.length)[0];
    const html = await renderDay(busiest.date);
    for (const group of busiest.groups) {
      expect(html, `app/scores/[date]/page.tsx #${group.id}`).toContain(`id="${group.id}"`);
    }
    if (busiest.groups.length >= 2) expect(html).toContain('aria-label="Leagues on this day"');
  });

  it('describes the day with no league name and titles the card with the league count', () => {
    const date = m.data.getGameDates()[0];
    const games = m.data.getGames({ date });
    expect(m.day.daySummary(games, 'Monday, August 24, 2026').sentence).toMatch(
      /^\d+ girls varsity field hockey games? on Monday, August 24, 2026\./,
    );
    const k = m.day.leaguesInvolved(games).length;
    expect(m.day.dayCardTitle('Mon Aug 24', games)).toBe(
      `Mon Aug 24 · ${games.length} ${games.length === 1 ? 'game' : 'games'} in ${k} ${k === 1 ? 'league' : 'leagues'}`,
    );
  });
});

describe('fixture status and slate records (UI pass, league-aware)', () => {
  it('an official fixture reads "Upcoming" on or after today and "No result" before it', async () => {
    const { OfficialFixtures } = await import('@/components/schedule/OfficialFixtures');
    const team = m.data.getTeams({ league: 'bval' })[0];
    const today = m.data.getToday();
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
    const { GameRow } = await import('@/components/ui/GameRow');
    const { recordWords } = await import('@/lib/format/numbers');
    const today = m.data.getToday();
    const upcoming = m.data
      .getGames()
      .filter((g) => g.status === 'scheduled' && g.dateKey >= today);
    const league = upcoming.find((g) => g.countsFor !== null);
    expect(league, 'corpus has an upcoming league game').toBeDefined();
    const text = textOf(renderToStaticMarkup(createElement(GameRow, { game: league!, showRecords: true })));
    let checked = 0;
    for (const side of [league!.away, league!.home]) {
      const standing = side.slug ? m.data.getStandingFor(side.slug) : undefined;
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
