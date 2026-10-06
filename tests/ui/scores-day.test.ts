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
