/**
 * `/scores/[date]` keeps the regions apart (DESIGN §24.3; owner decision, 2026-10-06): a NorCal block
 * (`#norcal`, h2 "Northern California"), then, only on a day that has one, the unscoped NorCal vs SoCal
 * block (`#between-regions`), then the SoCal block (`#socal`), each region's league groups and
 * Non-league group inside it as h3s; a region with no game keeps its block with one sentence; the JV
 * games split into `#jv` and `#jv-socal`; the header badges and the description go per region only
 * when both regions have a game.
 *
 * On the committed snapshot (data/snapshot.json), as tests/ui/render-score.test.ts walks it: no corpus
 * holds both regions (socal-2026-10-06 has only the Southern California schedules, all-2026-10-02 only
 * the NorCal ones), and a day with NorCal games, SoCal games and a NorCal vs SoCal game needs both. The
 * dates are found from the data (dayRegions), never hard-coded, and only the shape is asserted, so a
 * refresh cannot move a number under the test; the cases it needs are past days (NorCal vs SoCal games
 * on Sep 18, Sep 19, Oct 2 and Oct 3; SoCal-only days in August), which a later snapshot still holds. A
 * case the data loses fails naming it.
 *
 * The groups themselves (final-09, 2026-10-29): a league's group counts league games and postseason
 * games apart, and a postseason game no league owns is filed under its event, never under
 * "<league> · N league games" (the dayGroups describe at the end).
 */

import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import { longDate, parseLocal } from '../../lib/format';
import type { Game } from '../../lib/types';
import { textOf } from './html-text';

type Data = typeof import('../../lib/data');
type Day = typeof import('../../components/schedule/day-summary');

let data: Data;
let day: Day;
let jvView: typeof import('../../components/teams/jv-view');
let renderDay: (date: string) => Promise<string>;
let describeDay: (date: string) => Promise<string>;

beforeAll(async () => {
  data = await import('../../lib/data');
  day = await import('../../components/schedule/day-summary');
  jvView = await import('../../components/teams/jv-view');
  const page = await import('../../app/scores/[date]/page');
  renderDay = async (date) =>
    renderToStaticMarkup((await page.default({ params: Promise.resolve({ date }) } as never)) as ReactElement);
  describeDay = async (date) => {
    const meta = await page.generateMetadata({ params: Promise.resolve({ date }) } as never);
    return String(meta.description);
  };
}, 600_000);

/** The first date whose day matches, or a failure naming the case the corpus no longer has. */
function dateWhere(what: string, test: (regions: ReturnType<Day['dayRegions']>) => boolean): string {
  const date = data.getGameDates().find((d) => test(day.dayRegions(data.getGames({ date: d }))));
  expect(date, `data/snapshot.json: a date with ${what}`).toBeDefined();
  return date!;
}

/** The page's slice from `id="<from>"` up to the next marker (or the JV blocks / the closing line). */
function block(html: string, from: string, to: readonly string[]): string {
  const start = html.indexOf(`id="${from}"`);
  expect(start, `app/scores/[date]/page.tsx: id="${from}"`).toBeGreaterThan(-1);
  const ends = to.map((id) => html.indexOf(`id="${id}"`, start + 1)).filter((i) => i > -1);
  const close = html.indexOf('All times Pacific.', start);
  return html.slice(start, Math.min(...ends, close));
}

const gameIn = (html: string, game: Game) => html.includes(`data-game="${game.contestId}"`);

describe('/scores/[date] by region (app/scores/[date]/page.tsx, components/schedule/day-summary.ts)', () => {
  it('places every game exactly once: one region block, or NorCal vs SoCal', () => {
    for (const date of data.getGameDates()) {
      const games = data.getGames({ date });
      const { regions, between } = day.dayRegions(games);
      expect(regions.map((r) => r.id)).toEqual(['norcal', 'socal']);
      const placed = [...regions.flatMap((r) => r.groups.flatMap((g) => g.games)), ...between].map((g) => g.contestId);
      expect(placed.length, `dayRegions ${date}`).toBe(games.length);
      expect(new Set(placed).size).toBe(games.length);
      for (const game of between) expect(game.countsFor, `${date} ${game.contestId}: a NorCal vs SoCal game is non-league`).toBeNull();
      for (const region of regions) {
        expect(region.withSide.length).toBe(region.games.length + between.length);
      }
    }
  });

  it('renders NorCal, then NorCal vs SoCal once, then SoCal, with the cross-region game in the middle block only', async () => {
    const date = dateWhere('games in both regions and a NorCal vs SoCal game', ({ regions, between }) =>
      between.length > 0 && regions.every((r) => r.games.length > 0),
    );
    const { regions, between } = day.dayRegions(data.getGames({ date }));
    const html = await renderDay(date);
    const at = (id: string) => html.indexOf(`id="${id}"`);
    expect(at('norcal')).toBeGreaterThan(-1);
    expect(at('norcal')).toBeLessThan(at('between-regions'));
    expect(at('between-regions')).toBeLessThan(at('socal'));
    expect(html.split('id="between-regions"').length - 1, 'one NorCal vs SoCal block').toBe(1);
    expect(html).toMatch(/<section data-region-scope="norcal" id="norcal"|<section id="norcal" data-region-scope="norcal"/);
    expect(html).toMatch(/<section id="socal" data-region-scope="socal"/);
    expect(html, 'the NorCal vs SoCal block is shown in both views').toMatch(/<section id="between-regions" aria-labelledby/);

    const norcal = block(html, 'norcal', ['between-regions']);
    const middle = block(html, 'between-regions', ['socal']);
    const socal = block(html, 'socal', ['jv', 'jv-socal']);
    expect(textOf(norcal)).toContain('Northern California');
    expect(textOf(middle)).toContain('NorCal vs SoCal');
    expect(textOf(socal)).toContain('Southern California');
    for (const game of between) {
      expect(gameIn(middle, game), `${date} ${game.contestId} in NorCal vs SoCal`).toBe(true);
      expect(gameIn(norcal, game), `${date} ${game.contestId} not in NorCal`).toBe(false);
      expect(gameIn(socal, game), `${date} ${game.contestId} not in SoCal`).toBe(false);
      expect(html.split(`data-game="${game.contestId}"`).length - 1).toBe(1);
    }
    for (const [region, slice] of [
      [regions[0], norcal],
      [regions[1], socal],
    ] as const) {
      for (const game of region.games) expect(gameIn(slice, game), `${date} ${game.contestId} in ${region.id}`).toBe(true);
      // The region heading is an h2; its league and Non-league groups are h3s under it.
      expect(slice).toMatch(new RegExp(`<h2[^>]*>${region.name}</h2>`));
      for (const group of region.groups) {
        expect(slice, `${region.id} group ${group.id}`).toMatch(new RegExp(`<section id="${group.id}"`));
        expect(slice).toContain(`<h3 class="m-0 text-lead text-ink">${group.kicker}</h3>`);
      }
    }
  });

  it('keeps every id unique, NorCal’s as they were and SoCal’s repeats suffixed -socal', async () => {
    const date = dateWhere('Non-league games in both regions', ({ regions }) =>
      regions.every((r) => r.groups.some((g) => g.leagueId === null)),
    );
    const html = await renderDay(date);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const seen = new Set<string>();
    for (const id of ids) {
      expect(seen.has(id), `app/scores/[date]/page.tsx ${date}: duplicate id="${id}"`).toBe(false);
      seen.add(id);
    }
    expect(seen.has('non-league')).toBe(true);
    expect(seen.has('non-league-socal')).toBe(true);
    // Two "Non-league · n" sections must not share an accessible name with JS off.
    expect(html).toContain('aria-labelledby="non-league-socal-heading socal-heading"');
    expect(html).toContain('aria-labelledby="non-league-heading"');
  });

  it('says so in one sentence when a region has no game that day', async () => {
    const socalOnly = data.getGameDates().find((d) => {
      const { regions, between } = day.dayRegions(data.getGames({ date: d }));
      return between.length === 0 && regions[0].games.length === 0 && jvView.buildDayJvView(d, 'norcal').rows.length === 0;
    });
    expect(socalOnly, 'data/snapshot.json: a date with SoCal games only, varsity and JV').toBeDefined();
    const html = await renderDay(socalOnly!);
    expect(textOf(block(html, 'norcal', ['socal']))).toContain('No Northern California games on this day.');
    expect(html.indexOf('id="norcal"'), 'the empty NorCal block still comes first').toBeLessThan(html.indexOf('id="socal"'));
    expect(html).not.toContain('id="between-regions"');

    const norcalOnly = data
      .getGameDates()
      .find((d) => {
        const { regions, between } = day.dayRegions(data.getGames({ date: d }));
        return between.length === 0 && regions[1].games.length === 0;
      });
    if (norcalOnly) {
      const one = await renderDay(norcalOnly);
      const socal = textOf(block(one, 'socal', ['jv', 'jv-socal']));
      expect(socal).toMatch(
        jvView.buildDayJvView(norcalOnly, 'socal').rows.length === 0
          ? /No Southern California games on this day\./
          : /No Southern California varsity games on this day; the JV games? (is|are) below\./,
      );
    }

    // A region with JV games but no varsity game says "varsity", never "no games" above its JV list.
    const jvOnly = data.getGameDates().find((d) => {
      const { regions, between } = day.dayRegions(data.getGames({ date: d }));
      return between.length === 0 && regions[0].games.length === 0 && jvView.buildDayJvView(d, 'norcal').rows.length > 0;
    });
    if (jvOnly) {
      const n = jvView.buildDayJvView(jvOnly, 'norcal').rows.length;
      const html = await renderDay(jvOnly);
      expect(textOf(block(html, 'norcal', ['socal']))).toContain(
        `No Northern California varsity games on this day; the JV ${n === 1 ? 'game is' : 'games are'} below.`,
      );
      expect(html.indexOf('id="jv"')).toBeGreaterThan(html.indexOf('id="norcal"'));
    }
  });

  it('counts per region in the header and the description only when both regions have a game', async () => {
    const both = dateWhere('games in both regions', ({ regions }) => regions.every((r) => r.withSide.length > 0));
    const games = data.getGames({ date: both });
    const { regions } = day.dayRegions(games);
    const html = await renderDay(both);
    for (const region of regions) {
      const n = region.withSide.length;
      expect(html).toContain(
        `<span data-region-scope="${region.id}" class="sx-badge tabular-nums">${region.shortName}: ${n} ${n === 1 ? 'game' : 'games'}</span>`,
      );
    }
    const description = await describeDay(both);
    expect(description).toMatch(/^Girls varsity field hockey on \w+day, \w+ \d+, 2026\. NorCal: \d+ games?[;.]/);
    expect(description.indexOf('NorCal: ')).toBeLessThan(description.indexOf(' SoCal: '));

    const one = dateWhere('games in one region only', ({ regions }) => regions.some((r) => r.withSide.length === 0));
    const oneGames = data.getGames({ date: one });
    const oneHtml = await renderDay(one);
    expect(oneHtml, 'a one-region day keeps the whole-day badge').toContain(
      `<span class="sx-badge tabular-nums">${oneGames.length} ${oneGames.length === 1 ? 'game' : 'games'}</span>`,
    );
    expect(oneHtml).not.toMatch(/(NorCal|SoCal): \d+ games?<\/span>/);
    expect(await describeDay(one), 'a one-region day keeps daySummary’s sentence').toBe(
      day.daySummary(oneGames, `${longDate(one)}, ${parseLocal(one).year}`).sentence,
    );
  });

  it('splits the JV games into #jv and #jv-socal, each region-scoped and omitted when empty', async () => {
    const date = data.getGameDates().find(
      (d) => jvView.buildDayJvView(d, 'norcal').rows.length > 0 && jvView.buildDayJvView(d, 'socal').rows.length > 0,
    );
    expect(date, 'data/snapshot.json: a date with JV games in both regions').toBeDefined();
    const html = await renderDay(date!);
    expect(html).toMatch(/<section id="jv" data-region-scope="norcal" aria-labelledby="jv-heading"/);
    expect(html).toMatch(/<section id="jv-socal" data-region-scope="socal" aria-labelledby="jv-socal-heading"/);
    expect(html.indexOf('id="jv"')).toBeGreaterThan(html.indexOf('id="socal"'));
    const all = jvView.buildDayJvView(date!).rows.length;
    expect(jvView.buildDayJvView(date!, 'norcal').rows.length + jvView.buildDayJvView(date!, 'socal').rows.length).toBe(all);

    const socalJvOnly = data.getGameDates().find(
      (d) => jvView.buildDayJvView(d, 'norcal').rows.length === 0 && jvView.buildDayJvView(d, 'socal').rows.length > 0,
    );
    if (socalJvOnly) {
      const one = await renderDay(socalJvOnly);
      expect(one).not.toContain('id="jv"');
      expect(one).toContain('id="jv-socal"');
    }
  });
});

// ---------------------------------------------------------------- dayGroups: league games vs postseason games

/** A final between two registry teams, on `dateKey`, counted for no table: the shape of every postseason game. */
function postseasonGame(
  id: string,
  dateKey: string,
  homeSlug: string,
  awaySlug: string,
  postseason: NonNullable<Game['postseason']>,
): Game {
  const side = (slug: string, score: number) => ({ teamId: `${slug}-id`, slug, name: slug, score, result: null }) as Game['home'];
  return {
    contestId: id,
    dateLocal: `${dateKey}T16:00:00`,
    dateUtc: `${dateKey}T23:00:00Z`,
    dateKey,
    isDateTba: false,
    isTimeTba: false,
    home: side(homeSlug, 2),
    away: side(awaySlug, 1),
    site: 'home',
    status: 'final',
    isLeague: false,
    leagueDivision: null,
    contestTypes: { home: 4, away: 4 },
    countsFor: null,
    postseason,
    otPeriods: 0,
    isOt: false,
    isForfeit: false,
    forfeitBy: null,
    decider: 'REG',
    shootout: null,
    venue: { text: null },
    urls: { maxpreps: null, nfhsStream: null, goFan: null },
    provenance: { scores: 'maxpreps-api', schedule: 'maxpreps-api', fetchedAt: '2026-10-29T00:00:00.000Z' },
  };
}

const kickers = (games: readonly Game[]) => day.dayGroups(games).map((g) => g.kicker);

describe('dayGroups: a postseason game is never a "league game" (components/schedule/day-summary.ts)', () => {
  it('files the Oct 27 Huntington Beach game under the Tournament of Champions, not "Sunset · 1 league game"', async () => {
    const games = data.getGames({ date: '2026-10-27' });
    const hb = games.find((g) => g.contestId.startsWith('1f555407'));
    expect(hb, 'data/snapshot.json: the Oct 27 Huntington Beach v Newport Harbor game').toBeDefined();
    // The tag names the shared league (sunset), so it is the kind, not a null leagueId, that routes it.
    expect(hb!.postseason).toMatchObject({ kind: 'outside-tournament' });
    const groups = day.dayGroups(games);
    expect(groups.map((g) => g.kicker)).toContain('Tournament of Champions · 2');
    expect(groups.some((g) => g.kicker.startsWith('Sunset'))).toBe(false);
    const toc = groups.find((g) => g.kicker.startsWith('Tournament of Champions'))!;
    expect(toc.leagueId).toBeNull();
    expect(toc.id).toBe('postseason-tournament-of-champions');
    expect(toc.games.map((g) => g.contestId)).toContain(hb!.contestId);
    // The page renders the group as its own h3 and keeps every id unique.
    const html = await renderDay('2026-10-27');
    expect(html).toContain(`<h3 class="m-0 text-lead text-ink">${toc.kicker}</h3>`);
    expect(html).not.toMatch(/Sunset · \d+ league games?/);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size, 'unique ids').toBe(ids.length);
  });

  it('counts one MCAL tournament day as postseason games, not league games', () => {
    const games = data.getGames({ date: '2026-10-28' });
    expect(games.filter((g) => g.postseason?.kind === 'mcal-tournament')).toHaveLength(2);
    expect(kickers(games)).toContain('MCAL · 2 postseason games');
    expect(kickers(games.filter((g) => g.contestId.startsWith('7bb048ba')))).toEqual(['MCAL · 1 postseason game']);
    expect(kickers(games).join('|')).not.toMatch(/MCAL · \d+ league game/);
  });

  it('says both when a league has both on one day, league clause first, and drops either at zero', () => {
    const date = data.getGameDates().find((d) =>
      data.getGames({ date: d }).filter((g) => g.countsFor !== null && g.countsFor.startsWith('de-anza')).length > 0,
    );
    expect(date, 'data/snapshot.json: a date with a De Anza league game').toBeDefined();
    const league = data.getGames({ date: date! }).filter((g) => g.countsFor !== null && day.dayGroups([g])[0]?.leagueId === 'scval');
    expect(league.length).toBeGreaterThan(0);
    const crossover = postseasonGame('synthetic-crossover', date!, 'los-gatos', 'saint-francis', {
      kind: 'scval-crossover',
      leagueId: 'scval',
      via: 'config-pairing',
    });
    const n = league.length;
    expect(kickers([...league, crossover])).toEqual([`SCVAL · ${n} league ${n === 1 ? 'game' : 'games'} · 1 postseason game`]);
    expect(kickers(league)).toEqual([`SCVAL · ${n} league ${n === 1 ? 'game' : 'games'}`]);
    expect(kickers([crossover])).toEqual(['SCVAL · 1 postseason game']);
  });

  it('files a synthetic Nov 5 City v Metro section-playoffs game under the San Diego Section playoffs', () => {
    const game = postseasonGame('synthetic-sds', '2026-11-05', 'bishops', 'helix', {
      kind: 'section-playoffs',
      leagueId: null,
      via: 'section-postseason-window',
    });
    expect(kickers([game])).toEqual(['San Diego Section playoffs · 1']);
    const [group] = day.dayGroups([game]);
    expect(group.id).toBe('postseason-san-diego-section-playoffs');
    expect(group.leagueId).toBeNull();
    const socal = day.dayRegions([game]).regions[1];
    expect(socal.groups.map((g) => g.kicker)).toEqual(['San Diego Section playoffs · 1']);
    expect(socal.groups[0].id).toBe('postseason-san-diego-section-playoffs-socal');
    expect(day.dayRegions([game]).regions[0].groups).toEqual([]);
  });

  it('files a Nov 7 ccs SCVAL v BVAL game under CCS, in the NorCal block', () => {
    const game = postseasonGame('synthetic-ccs', '2026-11-07', 'los-gatos', 'gilroy', {
      kind: 'ccs',
      leagueId: null,
      via: 'ccs-window',
    });
    expect(kickers([game])).toEqual(['CCS · 1']);
    const { regions } = day.dayRegions([game]);
    expect(regions[0].groups.map((g) => g.kicker)).toEqual(['CCS · 1']);
    expect(regions[1].groups).toEqual([]);
  });

  it('puts the events after the league groups and before Non-league, the CCS first', () => {
    const league = postseasonGame('synthetic-mcal', '2026-11-07', 'tamalpais', 'redwood', {
      kind: 'mcal-tournament',
      leagueId: 'mcal',
      via: 'league-postseason-window',
    });
    const ccs = (id: string) =>
      postseasonGame(id, '2026-11-07', 'los-gatos', 'gilroy', { kind: 'ccs', leagueId: null, via: 'ccs-window' });
    const nonLeague = { ...postseasonGame('synthetic-nl', '2026-11-07', 'los-gatos', 'gilroy', { kind: 'other', leagueId: null, via: 'contest-type-4' }) };
    const sds = postseasonGame('synthetic-sds', '2026-11-07', 'bishops', 'helix', {
      kind: 'section-playoffs',
      leagueId: null,
      via: 'section-postseason-window',
    });
    expect(kickers([nonLeague, sds, ccs('a'), ccs('b'), league])).toEqual([
      'MCAL · 1 postseason game',
      'CCS · 2',
      'San Diego Section playoffs · 1',
      'Non-league · 1',
    ]);
  });
});
