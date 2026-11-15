/**
 * lib/game-slug.ts and lib/game-urls.ts — a game's URL segment and the segments it had (SPEC §8.1): what a slug
 * says, which game keeps a shared one, what becomes an alias and whose it is, and the upgrade of a file written
 * before slugs. proxy.ts's matcher is held to `isLegacyGameParam` here. The table the servers answer from is
 * tests/game-aliases.test.ts.
 */

import { describe, expect, it } from 'vitest';

import { gameHref } from '../lib/game-id';
import { GAME_SLUG_RE, baseGameSlug, gameSlug, slugifyName } from '../lib/game-slug';
import {
  addGameUrls,
  gameAliasTable,
  isGameUrlSegment,
  isLegacyGameParam,
  needsGameUrls,
  withGameAliases,
  withGameSlugs,
  withLegacyGameUrls,
  type UrlGame,
} from '../lib/game-urls';
import { config as proxyConfig } from '../proxy';

const GUID_A = '30e15701-fddc-4695-9f1c-148e19f58ca5';
const GUID_B = '8ed6f41f-8746-462e-8e12-bbe2509aa47d';
const GUID_C = 'b8ac93c0-885d-4998-bda4-aabc8b083a85';

/** A game of the URL rules: `away at home` on `date`, at `time` (UTC hour). */
function g(contestId: string, date: string, away: string, home: string, rest: Partial<UrlGame> & { hour?: number } = {}): UrlGame {
  const { hour = 23, ...more } = rest;
  return {
    contestId,
    dateKey: date,
    dateUtc: `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`,
    site: 'home',
    away: { slug: away, name: away },
    home: { slug: home, name: home },
    ...more,
  };
}
const urls = (games: readonly UrlGame[]) => Object.fromEntries(games.map((x) => [x.contestId, [x.slug, ...(x.aliases ?? [])]]));

describe('the slug (lib/game-slug.ts)', () => {
  it('is the date, then away at home; vs at a neutral site', () => {
    expect(baseGameSlug(g(GUID_A, '2026-10-06', 'santa-catalina', 'greenfield'))).toBe('2026-10-06-santa-catalina-at-greenfield');
    expect(baseGameSlug(g(GUID_A, '2026-09-12', 'pinewood', 'san-francisco-waldorf', { site: 'neutral' }))).toBe(
      '2026-09-12-pinewood-vs-san-francisco-waldorf',
    );
    expect(baseGameSlug(g(GUID_A, '2026-10-06', 'a', 'b', { site: 'away' }))).toBe('2026-10-06-a-at-b');
  });

  it('names a school outside the registry by its name', () => {
    const game = g(GUID_A, '2026-08-27', 'mt-pleasant', 'x', { home: { slug: null, name: 'KIPP San Jose Collegiate' } });
    expect(baseGameSlug(game)).toBe('2026-08-27-mt-pleasant-at-kipp-san-jose-collegiate');
    expect(slugifyName("St. Mary's (Stockton)")).toBe('st-marys-stockton');
    expect(slugifyName('Bishop’s')).toBe('bishops');
    expect(slugifyName('Lycée Français & Co.')).toBe('lycee-francais-and-co');
    expect(slugifyName('—')).toBe('tbd');
  });

  it('every slug matches GAME_SLUG_RE and no legacy param does', () => {
    for (const slug of ['2026-10-06-santa-catalina-at-greenfield', '2026-09-12-a-vs-b-2']) {
      expect(GAME_SLUG_RE.test(slug), slug).toBe(true);
      expect(isLegacyGameParam(slug), slug).toBe(false);
    }
    for (const param of [GUID_A, GUID_A.toUpperCase(), 'sblive-6543072', 'cifsds-poway-at-clairemont', 'official-2026-10-06-santa-catalina-at-greenfield']) {
      expect(GAME_SLUG_RE.test(param), param).toBe(false);
      expect(isLegacyGameParam(param), param).toBe(true);
      expect(isGameUrlSegment(param), param).toBe(true);
    }
    for (const junk of ['', 'nope', '2026-10-06', '2026-10-06-A-at-b', '2026-10-06-a--b', 'a/b', '2026-10-06-a-at-b/x', ':id', 'sblive-', '(.*)']) {
      expect(isGameUrlSegment(junk), junk).toBe(false);
    }
  });

  it('gameHref is /game/<slug>: the stored slug, else what the game would be called', () => {
    const game = g(GUID_A, '2026-10-06', 'santa-catalina', 'greenfield');
    expect(gameHref(game)).toBe('/game/2026-10-06-santa-catalina-at-greenfield');
    expect(gameHref({ ...game, slug: '2026-10-06-santa-catalina-at-greenfield-2' })).toBe('/game/2026-10-06-santa-catalina-at-greenfield-2');
    expect(gameSlug({ ...game, slug: 'x' })).toBe('x');
  });
});

describe('rule 1: slugs are unique, and a number stays with its game', () => {
  const first = g(GUID_A, '2026-09-12', 'pinewood', 'waldorf', { hour: 16 });
  const second = g(GUID_B, '2026-09-12', 'pinewood', 'waldorf', { hour: 23 });

  it('the later game of a same-day pair is -2; the same start falls back to the contest id', () => {
    expect(urls(withGameSlugs([second, first]))).toEqual({
      [GUID_A]: ['2026-09-12-pinewood-at-waldorf'],
      [GUID_B]: ['2026-09-12-pinewood-at-waldorf-2'],
    });
    const tied = withGameSlugs([{ ...second, dateUtc: first.dateUtc }, first]);
    expect(tied.find((x) => x.contestId === GUID_A)!.slug).toBe('2026-09-12-pinewood-at-waldorf');
  });

  it('a game keeps the slug it had while it still names it, whatever joins or leaves', () => {
    const previous = withGameSlugs([first, second]);
    // The first game is gone: the second keeps -2 rather than taking over the bare slug.
    expect(withGameSlugs([second], { previous })[0].slug).toBe('2026-09-12-pinewood-at-waldorf-2');
    // An earlier game of the pair appears: it takes the next free number, and nobody moves.
    const early = g(GUID_C, '2026-09-12', 'pinewood', 'waldorf', { hour: 10 });
    expect(urls(withGameSlugs([early, first, second], { previous }))).toEqual({
      [GUID_A]: ['2026-09-12-pinewood-at-waldorf'],
      [GUID_B]: ['2026-09-12-pinewood-at-waldorf-2'],
      [GUID_C]: ['2026-09-12-pinewood-at-waldorf-3'],
    });
  });

  it('a slug left free for a page outside the games is not newly taken, but a game that has it keeps it', () => {
    // A schedule-only game is called by the plain slug: a feed game of the same day and pair that turns up gets -2…
    const leaveFree = ['2026-09-12-pinewood-at-waldorf'];
    expect(withGameSlugs([first], { leaveFree })[0].slug).toBe('2026-09-12-pinewood-at-waldorf-2');
    // …unless it had the slug already (the schedule-only game then takes the next one: lib/results/fixture-games.ts).
    const previous = withGameSlugs([first]);
    expect(withGameSlugs([first], { previous, leaveFree })[0].slug).toBe('2026-09-12-pinewood-at-waldorf');
    // Another day's games are untouched.
    expect(withGameSlugs([g(GUID_C, '2026-09-13', 'pinewood', 'waldorf')], { leaveFree })[0].slug).toBe('2026-09-13-pinewood-at-waldorf');
  });

  it('a game that supersedes another takes over its slug, number included', () => {
    const fill = { ...second, contestId: 'sblive:7000001' };
    const previous = withGameSlugs([first, fill]);
    const now = withGameSlugs([first, second], { previous, superseded: { 'sblive:7000001': GUID_B } });
    expect(now.find((x) => x.contestId === GUID_B)!.slug).toBe('2026-09-12-pinewood-at-waldorf-2');
  });
});

describe('rules 2-4: aliases', () => {
  it('a rescheduled game is at its new date, and the slug it had redirects', () => {
    const before = withGameSlugs([g(GUID_A, '2026-10-06', 'a', 'b')]);
    const moved = [g(GUID_A, '2026-10-13', 'a', 'b')];
    const now = withGameAliases(withGameSlugs(moved, { previous: before }), { previous: before });
    expect(urls(now)).toEqual({ [GUID_A]: ['2026-10-13-a-at-b', '2026-10-06-a-at-b'] });
    // …and keeps redirecting when it moves again; moving back makes the first slug the slug again, not an alias.
    const again = [g(GUID_A, '2026-10-20', 'a', 'b')];
    const third = withGameAliases(withGameSlugs(again, { previous: now }), { previous: now });
    expect(urls(third)).toEqual({ [GUID_A]: ['2026-10-20-a-at-b', '2026-10-06-a-at-b', '2026-10-13-a-at-b'] });
    const back = [g(GUID_A, '2026-10-06', 'a', 'b')];
    expect(urls(withGameAliases(withGameSlugs(back, { previous: third }), { previous: third }))).toEqual({
      [GUID_A]: ['2026-10-06-a-at-b', '2026-10-13-a-at-b', '2026-10-20-a-at-b'],
    });
  });

  it('a flipped host, a neutral site and a renamed opponent each leave the old slug as an alias', () => {
    const before = withGameSlugs([g(GUID_A, '2026-10-06', 'a', 'x', { home: { slug: null, name: 'Lincoln' } })]);
    for (const [change, slug] of [
      [g(GUID_A, '2026-10-06', 'x', 'a', { away: { slug: null, name: 'Lincoln' } }), '2026-10-06-lincoln-at-a'],
      [g(GUID_A, '2026-10-06', 'a', 'x', { home: { slug: null, name: 'Lincoln' }, site: 'neutral' }), '2026-10-06-a-vs-lincoln'],
      [g(GUID_A, '2026-10-06', 'a', 'x', { home: { slug: null, name: 'Lincoln (San Jose)' } }), '2026-10-06-a-at-lincoln-san-jose'],
      [g(GUID_A, '2026-10-06', 'a', 'lincoln-sj'), '2026-10-06-a-at-lincoln-sj'],
    ] as const) {
      const now = withGameAliases(withGameSlugs([change], { previous: before }), { previous: before });
      expect(urls(now), slug).toEqual({ [GUID_A]: [slug, '2026-10-06-a-at-lincoln'] });
    }
  });

  it('a slug always beats an alias, and an alias has one owner: the game that had it last', () => {
    // A moved off Oct 6 (alias oct-6); then B is scheduled on Oct 6: the segment is B's page, nobody's alias.
    const a1 = withGameSlugs([g(GUID_A, '2026-10-06', 'a', 'b')]);
    const a2 = withGameAliases(withGameSlugs([g(GUID_A, '2026-10-13', 'a', 'b')], { previous: a1 }), { previous: a1 });
    const withB = [g(GUID_A, '2026-10-13', 'a', 'b'), g(GUID_B, '2026-10-06', 'a', 'b')];
    const third = withGameAliases(withGameSlugs(withB, { previous: a2 }), { previous: a2 });
    expect(urls(third)).toEqual({ [GUID_A]: ['2026-10-13-a-at-b'], [GUID_B]: ['2026-10-06-a-at-b'] });
    // B moves away too: the segment is the alias of B, who had it last.
    const bMoved = [g(GUID_A, '2026-10-13', 'a', 'b'), g(GUID_B, '2026-10-27', 'a', 'b')];
    const fourth = withGameAliases(withGameSlugs(bMoved, { previous: third }), { previous: third });
    expect(urls(fourth)).toEqual({ [GUID_A]: ['2026-10-13-a-at-b'], [GUID_B]: ['2026-10-27-a-at-b', '2026-10-06-a-at-b'] });
    // A page that is not one of the games (a schedule-only game lib/data.ts adds) is protected the same way.
    const reserved = withGameAliases(withGameSlugs([g(GUID_A, '2026-10-13', 'a', 'b')], { previous: a1 }), {
      previous: a1,
      reserved: ['2026-10-06-a-at-b'],
    });
    expect(urls(reserved)).toEqual({ [GUID_A]: ['2026-10-13-a-at-b'] });
  });

  it('a game that supersedes another inherits its slug, its legacy param and its aliases', () => {
    // A schedule-only game (official:, its slug its id without the prefix) that MaxPreps lists a day later.
    const fixture = { ...g('official:2026-11-24-a-at-b', '2026-11-24', 'a', 'b'), slug: '2026-11-24-a-at-b', aliases: ['2026-11-17-a-at-b'] };
    const contest = g(GUID_A, '2026-11-25', 'a', 'b');
    const superseded = { 'official:2026-11-24-a-at-b': GUID_A };
    const now = withGameAliases(withGameSlugs([contest], { previous: [fixture], superseded }), { previous: [fixture], superseded });
    expect(urls(now)).toEqual({
      [GUID_A]: ['2026-11-25-a-at-b', '2026-11-17-a-at-b', '2026-11-24-a-at-b', 'official-2026-11-24-a-at-b'],
    });
    // On the same day the page does not move at all: the slug is the one the fixture had.
    const sameDay = g(GUID_A, '2026-11-24', 'a', 'b');
    const kept = withGameAliases(withGameSlugs([sameDay], { previous: [fixture], superseded }), { previous: [fixture], superseded });
    expect(urls(kept)).toEqual({ [GUID_A]: ['2026-11-24-a-at-b', '2026-11-17-a-at-b', 'official-2026-11-24-a-at-b'] });
    // A superseded id with no game behind it (carried from an earlier run) still gives its legacy param.
    const carried = withGameAliases(withGameSlugs([sameDay]), { superseded: { 'sblive:6543072': GUID_A, 'cifsds:a-at-b': GUID_A } });
    expect(carried[0].aliases).toEqual(['cifsds-a-at-b', 'sblive-6543072']);
  });

  it('a superseded id recorded in an earlier run never takes a segment another game has had since', () => {
    // Run 1: A (the lower contest id) supersedes the schedule-only game official:X on another day, so X is A's alias.
    const superseded = { 'official:2026-11-24-a-at-b': GUID_A };
    const fixture = { ...g('official:2026-11-24-a-at-b', '2026-11-24', 'a', 'b'), slug: '2026-11-24-a-at-b' };
    const a = g(GUID_A, '2026-11-25', 'a', 'b');
    const run = (games: UrlGame[], previous: UrlGame[]) =>
      withGameAliases(withGameSlugs(games, { previous, superseded }), { previous, superseded });
    const one = run([a], [fixture]);
    expect(one[0].aliases).toEqual(['2026-11-24-a-at-b', 'official-2026-11-24-a-at-b']);
    // Run 2: B is scheduled on the 24th, at the slug: it is B's page, nobody's alias.
    const two = run([a, g(GUID_B, '2026-11-24', 'a', 'b')], one);
    expect(urls(two)).toEqual({ [GUID_A]: ['2026-11-25-a-at-b', 'official-2026-11-24-a-at-b'], [GUID_B]: ['2026-11-24-a-at-b'] });
    // Run 3: B moves away. The slug it just left is B's alias, though A's carried supersede names the segment too.
    const three = run([a, g(GUID_B, '2026-12-01', 'a', 'b')], two);
    expect(urls(three)).toEqual({
      [GUID_A]: ['2026-11-25-a-at-b', 'official-2026-11-24-a-at-b'],
      [GUID_B]: ['2026-12-01-a-at-b', '2026-11-24-a-at-b'],
    });
    // Run 4 and after: it stays B's, an alias B holds against a claim A's supersede repeats on every run.
    expect(urls(run([a, g(GUID_B, '2026-12-01', 'a', 'b')], three))).toEqual(urls(three));
  });

  it('a game seen for the first time by the pipeline has no alias: its id was never a URL', () => {
    const now = withGameAliases(withGameSlugs([g(GUID_A, '2026-10-06', 'a', 'b')]));
    expect(now[0]).not.toHaveProperty('aliases');
    expect(() => withGameAliases([g(GUID_A, '2026-10-06', 'a', 'b')])).toThrow(/has no slug/);
  });
});

describe('the load upgrade: a file written before slugs', () => {
  const file = {
    schemaVersion: 2,
    games: [
      g(GUID_A, '2026-10-06', 'a', 'b'),
      g('sblive:6575658', '2026-10-07', 'c', 'd'),
      g('official:2026-10-29-e-at-f', '2026-10-29', 'e', 'f', { site: 'neutral' }),
      g('official:2026-10-30-e-at-f', '2026-10-30', 'e', 'f'),
    ],
    supersededGames: { 'cifsds:a-at-b': GUID_A, 'sblive:6543072': GUID_A },
    playoffs: { games: [g(GUID_A, '2026-10-06', 'a', 'b')] },
  };

  it('every game gets its slug and keeps the URL it was published at, as do the ids it superseded', () => {
    expect(needsGameUrls(file)).toBe(true);
    const upgraded = addGameUrls(file) as typeof file;
    expect(urls(upgraded.games)).toEqual({
      [GUID_A]: ['2026-10-06-a-at-b', GUID_A, 'cifsds-a-at-b', 'sblive-6543072'],
      'sblive:6575658': ['2026-10-07-c-at-d', 'sblive-6575658'],
      // A neutral-site official game: proxy.ts sends `official-<x>` to `<x>`, which is not its slug, so `<x>` is an alias too.
      'official:2026-10-29-e-at-f': ['2026-10-29-e-vs-f', '2026-10-29-e-at-f', 'official-2026-10-29-e-at-f'],
      'official:2026-10-30-e-at-f': ['2026-10-30-e-at-f', 'official-2026-10-30-e-at-f'],
    });
    // playoffs.games holds the same game again: it is the upgraded one.
    expect(upgraded.playoffs.games[0].slug).toBe('2026-10-06-a-at-b');
    expect(needsGameUrls(upgraded)).toBe(false);
    expect(needsGameUrls({ games: file.games })).toBe(false); // not a v2 file
    expect(needsGameUrls(null)).toBe(false);
  });

  it('a game that has a slug is left exactly as it is, even when its facts no longer say so', () => {
    const named = { ...g(GUID_A, '2026-10-06', 'a', 'b', { site: 'neutral' }), slug: '2026-10-06-a-at-b', aliases: [GUID_A] };
    const added = g('official:2026-10-06-a-at-b', '2026-10-06', 'a', 'b');
    const out = withLegacyGameUrls([named, added]);
    expect(out[0]).toBe(named);
    // The added game cannot take a slug in use, and an alias in use is not claimed twice.
    expect(urls([out[1]])).toEqual({ 'official:2026-10-06-a-at-b': ['2026-10-06-a-at-b-2', 'official-2026-10-06-a-at-b'] });
    expect(withLegacyGameUrls([named])).toEqual([named]);
    // Nor a segment that is a named game's ALIAS: that game is left as it is, so the alias cannot be given up.
    const moved = { ...g(GUID_B, '2026-10-13', 'a', 'b'), slug: '2026-10-13-a-at-b', aliases: ['2026-10-06-a-at-b'] };
    const late = withLegacyGameUrls([moved, added]);
    expect(late[0]).toBe(moved);
    expect(late[1].slug).toBe('2026-10-06-a-at-b-2');
    expect(gameAliasTable(late).get('2026-10-06-a-at-b')).toBe('2026-10-13-a-at-b');
  });
});

describe('gameAliasTable', () => {
  it('maps each alias to its game’s slug; a slug in use and a second owner are dropped', () => {
    const games: UrlGame[] = [
      { ...g(GUID_A, '2026-10-13', 'a', 'b'), slug: '2026-10-13-a-at-b', aliases: ['2026-10-06-a-at-b', GUID_A, '2026-10-27-a-at-b', 'not a segment'] },
      { ...g(GUID_B, '2026-10-27', 'a', 'b'), slug: '2026-10-27-a-at-b', aliases: ['2026-10-06-a-at-b', GUID_B] },
      g(GUID_C, '2026-10-28', 'a', 'b'),
    ];
    expect(Object.fromEntries(gameAliasTable(games))).toEqual({
      '2026-10-06-a-at-b': '2026-10-13-a-at-b',
      [GUID_A]: '2026-10-13-a-at-b',
      [GUID_B]: '2026-10-27-a-at-b',
    });
  });
});

describe('proxy.ts matcher', () => {
  // Next compiles the matcher with path-to-regexp; the `:id(...)` group is a plain regular expression, read here
  // as one. It must accept exactly what isLegacyGameParam accepts, or an old URL would miss the proxy (a 404) or a
  // live slug would run it.
  const source = proxyConfig.matcher[0];
  const group = /^\/game\/:id\((.+)\)\/:rest\*$/.exec(source)?.[1];
  const matches = (param: string) => new RegExp(`^(?:${group})$`).test(param);

  it('is one pattern under /game/, and matches exactly the legacy params', () => {
    expect(proxyConfig.matcher).toHaveLength(1);
    expect(group, source).toBeDefined();
    for (const param of [
      GUID_A, GUID_A.toUpperCase(), 'sblive-6543072', 'sblive-0', 'cifsds-poway-at-clairemont', 'official-2026-10-06-santa-catalina-at-greenfield',
      '2026-10-06-santa-catalina-at-greenfield', '2026-09-12-a-vs-b-2', 'nope', 'sblive-abc', 'sblive-', `x${GUID_A}`, `${GUID_A}x`, '2026-10-06',
    ]) {
      expect(matches(param), param).toBe(isLegacyGameParam(param));
    }
  });
});
