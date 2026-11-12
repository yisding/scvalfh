/**
 * The schedule and scores pages (SPEC §10.4, §8.1; DESIGN §33): league scoping (`/schedule/<league>`),
 * `/schedule` as the Scores page for today (date bar, calendar anchors, region and league scopes), the
 * `ScheduleFilters` props per league, the `/scores/[date]` league groups and the client-boundary split
 * of `components/schedule/filter-data.ts`.
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
/** 'YYYY-MM-DD' plus `n` days. */
const shiftDays = (key: string, n: number) => new Date(Date.parse(`${key}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

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
    // The title is the page's identity, and nothing sits under it: no summary sentence (DESIGN §33).
    expect(mcal, 'app/schedule/[league]/page.tsx h1').toMatch(/<h1[^>]*>MCAL schedule<\/h1>/);
    expect(mcal.split('<h1').length - 1, 'app/schedule/[league]/page.tsx: one h1').toBe(1);
    expect(textOf(mcal), 'app/schedule/[league]/page.tsx: no sentence under the title').not.toContain('every game involving');
    // No article before the initialism ('a MCAL team' is wrong; 'an SCVAL team' reads oddly too).
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
    // The all-2026-10-02 corpus predates the four Southern California leagues, which it carries as
    // "not fetched in this run" with no games, so a league with no game date in it has no landing
    // date to check. The five leagues the corpus does cover must all be checked.
    const covered = data.getLeagueIds().filter((id) => data.getGameDates({ league: id }).length > 0);
    expect(covered, 'corpus leagues with games').toEqual(expect.arrayContaining(['scval', 'bval', 'pcal', 'mcal', 'eal']));
    for (const id of covered) {
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

describe('/schedule: the Scores page for today (components/schedule/ScoreDay.tsx)', () => {
  it('carries id=YYYY-MM-DD for every game day, each linking its day page, in the calendar', () => {
    const html = renderIndex();
    for (const date of data.getGameDates()) {
      expect(html, `components/schedule/SeasonCalendar.tsx #${date}`).toContain(`id="${date}"`);
      expect(html).toContain(`href="/scores/${date}"`);
      // The anchor IS the link to that day: an old /schedule#<date> link lands on it.
      expect(html, `components/schedule/SeasonCalendar.tsx #${date} is the link`).toMatch(
        new RegExp(`<a id="${date}" (aria-current="date" )?(aria-label="[^"]*" )?(data-today="" )?href="/scores/${date}"|<a [^>]*id="${date}"[^>]*href="/scores/${date}"|<a [^>]*href="/scores/${date}"[^>]*id="${date}"`),
      );
    }
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i), 'app/schedule/page.tsx duplicate ids').toEqual([]);
    // The old index is gone: no Recent / Next / Every game day sections, no league card grid.
    const text = textOf(html);
    for (const kicker of ['Recent', 'Every game day', 'League schedules']) expect(text).not.toContain(kicker);
    // The calendar exists once, inside the date bar's native <details>, summary first.
    expect(html.split('class="sx-cal').length - 1).toBe(new Set(data.getGameDates().map((d) => d.slice(0, 7))).size);
    expect(html).toMatch(/<details class="sx-disclosure[^"]*"><summary class="sx-btn">/);
  });

  it('is the day view for the snapshot’s own day: a hidden h1, the date bar with today selected, no date headline', () => {
    const html = renderIndex();
    const today = data.getToday();
    expect(html.split('<h1').length - 1, 'one h1').toBe(1);
    expect(html).toMatch(/<h1 class="sr-only">Scores, \w+day, \w+ \d+<\/h1>/);
    expect(html).toContain('<nav class="sx-datebar sx-print-hide" data-sticky="true" aria-label="Game days">');
    // Today's cell is the selected one in every region's set, reads "Today" and links to /.
    const cells = [...html.matchAll(/<a class="sx-day"([^>]*)>([^<]*)<b>/g)].map((m) => ({
      href: m[1].match(/ href="([^"]+)"/)?.[1],
      current: m[1].includes(' aria-current="date"'),
      today: m[1].includes(' data-today=""'),
      word: m[2],
    }));
    const current = cells.filter((cell) => cell.current);
    // One selected cell per region's set.
    expect(current.length).toBe(2);
    for (const cell of current) {
      expect(cell, 'components/schedule/DayNav.tsx selected cell').toEqual({ href: '/', current: true, today: true, word: 'Today' });
    }
    // Every other cell is a game day's own page.
    for (const cell of cells.filter((c) => !c.current)) expect(cell.href).toMatch(/^\/scores\/\d{4}-\d{2}-\d{2}$/);
    // Only the games of that day are listed (a game's row carries its contest id once per scope copy).
    const listed = new Set([...html.matchAll(/data-game="([^"]+)"/g)].map((m) => m[1]));
    expect(listed).toEqual(new Set(data.getGames({ date: today }).map((g) => g.contestId)));
  });

  it('keeps each region’s block apart and named, so the two copies never read the same with JS off', () => {
    const html = renderIndex();
    expect(html).toMatch(/<section id="norcal" data-region-scope="norcal" aria-labelledby="norcal-heading"/);
    expect(html).toMatch(/<section id="socal" data-region-scope="socal" aria-labelledby="socal-heading"/);
    expect(html).toMatch(/<h2 id="norcal-heading"[^>]*>Northern California<\/h2>/);
    expect(html).toMatch(/<h2 id="socal-heading"[^>]*>Southern California<\/h2>/);
    // No section is labelled by an id that does not exist, and no two labelled sections share a label.
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const labels = [...html.matchAll(/<section[^>]* aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    for (const label of labels) for (const id of label.split(' ')) expect(ids.has(id), `aria-labelledby="${label}"`).toBe(true);
    expect(new Set(labels).size, 'unique section labels').toBe(labels.length);
    // The date bar walks each region's own game days: its cells and arrows are region-scoped.
    for (const region of ['norcal', 'socal']) {
      expect(html, `components/schedule/DayNav.tsx ${region} cells`).toContain(`<li data-region-scope="${region}">`);
      expect(html).toMatch(new RegExp(`class="sx-iconbtn"[^>]*data-region-scope="${region}"`));
    }
  });

  it('builds Recent and Next around today, at most three rows per league, and per-league day counts', async () => {
    const today = data.getToday();
    const { postseasonPlace } = await import('../../components/schedule/day-summary');
    const built = index.buildScheduleIndex({
      games: data.getGames(),
      leagues: data.getLeagueSummaries(),
      leagueOf: (slug) => data.getTeamBySlug(slug)?.league,
      today,
      placeOf: postseasonPlace,
    });
    expect(built.recent.length).toBeLessThanOrEqual(3);
    expect(built.next.length).toBeLessThanOrEqual(3);
    expect(built.recent.every((d) => d.date <= today), 'components/schedule/schedule-view.ts recent').toBe(true);
    expect(built.next.every((d) => d.date > today), 'components/schedule/schedule-view.ts next').toBe(true);
    for (const d of built.days) {
      const games = data.getGames({ date: d.date });
      expect(d.total).toBe(games.length);
      for (const l of d.byLeague) {
        const id = data.getLeagueSummaries().find((x) => x.shortName === l.shortName)?.id;
        if (!id) continue; // an event's group ('CCS'): checked below
        // A league's count: its sides' games, less the postseason games listed once elsewhere.
        expect(l.games, `components/schedule/schedule-view.ts ${d.date} ${id}`).toBe(
          games.filter((g) => {
            const place = postseasonPlace(g);
            if (place) return place.kind === 'league' && place.id === id;
            return leagueOfSlug(g.home.slug) === id || leagueOfSlug(g.away.slug) === id;
          }).length,
        );
      }
    }
    // A postseason game is listed once on a Recent or Next day (2026-11-03: a CCS game between two leagues was
    // listed under both): the corpus is from before the postseason, so a cross-league game is re-tagged as a
    // CCS game, which goes to the 'CCS' group alone, while the game left as it was stays under both leagues.
    const cross = data.getGames().filter((g) => {
      const a = leagueOfSlug(g.away.slug);
      const h = leagueOfSlug(g.home.slug);
      return a && h && a !== h && g.dateKey > today;
    });
    expect(cross.length, 'the corpus has a cross-league game to come').toBeGreaterThan(1);
    const [asCcs, asIs] = cross.filter((g) => g.dateKey === cross[0].dateKey).length > 1 ? cross : [cross[0], cross[0]];
    const ccs = { ...asCcs, countsFor: null, postseason: { kind: 'ccs' as const, leagueId: null, via: 'maxpreps-bracket' as const } };
    const withCcs = index.buildScheduleIndex({
      games: data.getGames().map((g) => (g === asCcs ? ccs : g)),
      leagues: data.getLeagueSummaries(),
      leagueOf: (slug) => data.getTeamBySlug(slug)?.league,
      today: shiftDays(asCcs.dateKey, -1),
      placeOf: postseasonPlace,
    });
    const first = withCcs.next[0];
    expect(first.leagues.filter((l) => l.games.includes(ccs)).map((l) => l.id)).toEqual(['postseason-ccs']);
    expect(first.leagues.find((l) => l.id === 'postseason-ccs')).toMatchObject({ leagueId: null, shortName: 'CCS' });
    if (asIs !== asCcs) expect(first.leagues.filter((l) => l.games.includes(asIs)).length).toBe(2);
    expect(built.cards.map((c) => c.id)).toEqual(data.getLeagueIds());
    for (const card of built.cards) {
      expect(card.games, `components/schedule/schedule-view.ts card ${card.id}`).toBe(
        data.getGames({ league: card.id }).length,
      );
    }
    // Per region (DESIGN-socal §2.4): each region's Recent and Next are its own game days, and each
    // day row counts the games with a side in the region.
    expect(built.regions.map((r) => [r.id, r.idSuffix])).toEqual([['norcal', ''], ['socal', '-socal']]);
    for (const r of built.regions) {
      for (const d of [...r.recent, ...r.next]) {
        expect(d.leagues.length, `components/schedule/schedule-view.ts ${r.id} ${d.date}`).toBeGreaterThan(0);
        expect(d.leagues.every((l) => l.region === r.id)).toBe(true);
      }
    }
    for (const d of built.days) {
      expect(d.byRegion.map((r) => r.region)).toEqual(['norcal', 'socal']);
      expect(d.byRegion.reduce((n, r) => n + r.total, 0)).toBeGreaterThanOrEqual(d.total);
    }
  });

  it('renders the league row and the region control, and one scope per league in the list and the rail', () => {
    const html = renderIndex();
    expect(html, 'app/schedule/page.tsx region control').toContain('data-region-option="socal"');
    expect(html).toContain('data-league-option="all"');
    // A flex or grid container is never itself region-scoped by a block that holds a jump target
    // (the deep-link rule would unset its layout).
    expect(html).not.toMatch(/<ul data-region-scope[^>]*grid/);
    for (const id of data.getLeagueIds()) {
      expect(html, `components/prefs/LeagueSwitcher.tsx ${id} tab`).toContain(`data-league-option="${id}"`);
      // The day's games for that league (or the sentence that it has none), and its standings in the rail.
      expect(html, `components/schedule/ScoresRegionBlock.tsx data-scope=${id}`).toContain(`<div data-scope="${id}">`);
      expect(html, `components/schedule/ScoreRail.tsx data-scope=${id}`).toMatch(
        new RegExp(`<section class="sx-section" data-scope="${id}" aria-labelledby="rail-${id}">`),
      );
    }
    // The every-league copies keep home's anchors.
    expect(html).toContain('<div data-scope="none" id="latest-every-league">');
    expect(html).toContain('<div data-scope="none" id="latest-every-league-socal">');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i), 'app/schedule/page.tsx duplicate ids').toEqual([]);
  });
});

describe('the timeline rail’s today chip (components/schedule/TimelineRail.tsx)', () => {
  type Chip = { date: string; kind: string; href: string; label: string; sr: string; current: boolean };
  const chips = async (dates: string[], today: string): Promise<Chip[]> => {
    const { TimelineRail } = await import('../../components/schedule/TimelineRail');
    const html = renderToStaticMarkup(createElement(TimelineRail, { dates, today, leagueId: 'scval' }));
    // The attribute order href, data-rail-date, data-rail-kind, class is what ScheduleFilters and this test read.
    // A plain link (`sx-action`), no fill: today's is marked `aria-current="date"`, after the class.
    return [...html.matchAll(/<a href="#([^"]+)" data-rail-date="([^"]+)" data-rail-kind="([^"]+)" class="sx-action relative"( aria-current="date")?>([\s\S]*?)<\/a>/g)].map(
      (m) => ({
        href: m[1],
        date: m[2],
        kind: m[3],
        current: m[4] !== undefined,
        label: textOf(m[5].match(/data-rail-label="[^"]*">([^<]*)</)![1]),
        sr: textOf(m[5].match(/data-rail-sr="[^"]*">([^<]*)</)![1]),
      }),
    );
  };

  it('reads Today, marked current and first in the row, on a game day', async () => {
    const rail = await chips(['2026-09-01', '2026-10-06', '2026-10-30'], '2026-10-06');
    const today = rail.find((c) => c.kind === 'today')!;
    expect(today).toMatchObject({ date: '2026-10-06', href: '2026-10-06', label: 'Today', current: true });
    expect(today.sr).toBe('Today, Tuesday, October 6');
    // Today first (DESIGN §33), then the rest in date order; one row of links, no glyphs.
    expect(rail.map((c) => c.kind)).toEqual(['today', 'up', 'down']);
    expect(rail.map((c) => c.label)).toEqual(['Today', 'Sep 1', 'Oct 30']);
  });

  it('reads Next on a day with no game, first in the row, aimed at the next game day, and keeps the month chip', async () => {
    const rail = await chips(['2026-09-01', '2026-10-01', '2026-10-13', '2026-10-30'], '2026-10-12');
    const next = rail.find((c) => c.kind === 'today')!;
    // `data-rail-date` stays today, so rail-targets.ts's `today` rule still measures from today.
    expect(next).toMatchObject({ date: '2026-10-12', href: '2026-10-13', label: 'Next', current: false });
    expect(next.sr).toBe('Next game day, Tuesday, October 13');
    expect(rail.map((c) => c.kind)).toEqual(['today', 'up', 'month', 'down']);
    // A Next chip on the month's first game day does not swallow the month's own chip.
    const onMonth = await chips(['2026-09-01', '2026-10-01', '2026-10-30'], '2026-09-30');
    expect(onMonth.map((c) => [c.kind, c.href])).toEqual([
      ['today', '2026-10-01'], ['up', '2026-09-01'], ['month', '2026-10-01'], ['down', '2026-10-30'],
    ]);
  });

  it('keeps the first-day chip when the next game day is the first, and drops the Next chip once none is left', async () => {
    const dates = ['2026-09-01', '2026-10-01', '2026-10-30'];
    const pre = await chips(dates, '2026-08-20');
    expect(pre.map((c) => [c.kind, c.href, c.label])).toEqual([
      ['today', '2026-09-01', 'Next'], ['up', '2026-09-01', 'Sep 1'], ['month', '2026-10-01', 'Oct'], ['down', '2026-10-30', 'Oct 30'],
    ]);
    const post = await chips(dates, '2026-11-02');
    expect(post.map((c) => c.kind)).toEqual(['up', 'month', 'down']);
  });
});

describe('Southern California schedule pages (DESIGN-socal §2.4)', () => {
  it('the rail’s postseason chip: the Section’s playoffs for a San Diego league, none for the Sunset', async () => {
    // The rail itself, over two game days (it draws nothing for a league with no dates yet).
    const { TimelineRail } = await import('../../components/schedule/TimelineRail');
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
    // No jump pills over the groups (DESIGN §33): the strips are the outline.
    expect(html).not.toContain('aria-label="Leagues on this day"');
    // Each group is a strip: its name as the h3, its count at the strip's right end.
    for (const group of day.dayRegions(data.getGames({ date: busiest.date })).regions.flatMap((r) => r.groups)) {
      const n = group.games.length;
      expect(html, `components/schedule/ScoresRegionBlock.tsx strip ${group.id}`).toContain(
        `<div class="sx-strip" id="${group.id}-heading"><h3 class="m-0 text-lead text-ink">${group.name}</h3><div class="sx-strip-end"><span>${n} ${n === 1 ? 'game' : 'games'}</span>`,
      );
    }
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

  it('an upcoming league game prints no pre-game record at all, so never 0-0-0 (showRecords is ignored)', async () => {
    // DESIGN §33: a row is a status, two names (seed, star) and the scores. The league records that
    // used to sit beside the names of an upcoming league game are on the standings table instead.
    const { GameRow } = await import('../../components/game-row/GameRow');
    const { recordWords } = await import('../../lib/format');
    const today = data.getToday();
    const upcoming = data
      .getGames()
      .filter((g) => g.status === 'scheduled' && g.dateKey >= today);
    const league = upcoming.find((g) => g.countsFor !== null);
    expect(league, 'corpus has an upcoming league game').toBeDefined();
    const html = renderToStaticMarkup(createElement(GameRow, { game: league!, showRecords: true }));
    const text = textOf(html);
    expect(html, 'components/game-row/GameRow.tsx: showRecords changes nothing').toBe(
      renderToStaticMarkup(createElement(GameRow, { game: league! })),
    );
    let checked = 0;
    for (const side of [league!.away, league!.home]) {
      const standing = side.slug ? data.getStandingFor(side.slug) : undefined;
      if (standing?.hasReportedResults) {
        checked += 1;
        expect(html, `components/game-row/GameRow.tsx records: ${side.slug}`).not.toContain(recordWords(standing.computed));
      }
    }
    expect(checked, 'a side with a record was checked').toBeGreaterThan(0);
    expect(html).not.toContain(' in league');
    expect(html).not.toMatch(/\b\d+-\d+-\d+\b/);
    expect(text).not.toContain('0-0-0');
    const nonLeague = upcoming.find((g) => g.countsFor === null);
    if (nonLeague) {
      const nl = textOf(renderToStaticMarkup(createElement(GameRow, { game: nonLeague, showRecords: true })));
      expect(nl, 'components/game-row/GameRow.tsx: no records on a non-league game').not.toContain(' in league');
    }
  });
});
