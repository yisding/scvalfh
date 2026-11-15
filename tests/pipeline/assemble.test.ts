/**
 * lib/pipeline/steps/assemble.ts — `supersededGamesOf` (snapshot refinement 10): the map from a si.com fill's
 * `sblive:` id to the MaxPreps contest that later matched the same official fixture, carried while both ends
 * hold. The fills themselves are lib/crosscheck/backfill.ts's (tests/backfill.test.ts, rule 10).
 */

import { describe, expect, it } from 'vitest';

import { gameUrlsOf, supersededGamesOf } from '../../lib/pipeline/steps/assemble';
import { withLegacyGameUrls } from '../../lib/game-urls';
import { withFixtureGames } from '../../lib/results/fixture-games';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, OfficialFixture, Snapshot } from '../../lib/types';
import { game } from '../game-builder';

/** A snapshot carrying only what supersededGamesOf reads (games, supersededGames, officialFixtures, fetchedAt). */
function previousWith(games: Game[], supersededGames: Record<string, string> = {}, officialFixtures: OfficialFixture[] = []): Snapshot {
  return { games, supersededGames, officialFixtures, fetchedAt: '2026-11-14T15:00:00.000Z' } as unknown as Snapshot;
}

/** A PCAL fixture no source lists, as the official-schedule step stores it. */
function pcalFixture(date: string, away: string, home: string): OfficialFixture {
  return {
    id: `pcal:${date}:${away}@${home}`,
    league: 'pcal',
    division: 'pcal',
    dateKey: date,
    time: '16:00',
    awayName: getTeamBySlug(away)!.name,
    homeName: getTeamBySlug(home)!.name,
    awaySlug: away,
    homeSlug: home,
    source: 'pcal-pdf',
  } as OfficialFixture;
}

describe('supersededGamesOf (backfill rule 10: supersede and carry-forward)', () => {
  // The si.com fill of PCAL's Greenfield @ Santa Catalina fixture (Sep 4), as applyBackfill writes it: the
  // si.com game's id, stamped with the fixture it filled.
  const filled = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', hs: 1, as: 0, contestId: 'sblive:6541425' });

  it('a MaxPreps contest that now matches the filled fixture wins; the sblive: id maps to it', () => {
    const contest = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', hs: 1, as: 0, official: { fixtureId: filled.official!.fixtureId } });
    expect(supersededGamesOf([contest], previousWith([filled]))).toEqual({ 'sblive:6541425': contest.contestId });
  });

  it('carries the previous map while both ends hold', () => {
    const contest = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', hs: 1, as: 0 });
    const prev = previousWith([], { 'sblive:6541425': contest.contestId, 'sblive:1': 'gone' });
    expect(supersededGamesOf([contest], prev)).toEqual({ 'sblive:6541425': contest.contestId });
  });
});

describe('supersededGamesOf: a game added from DATA_QUALITY.addedGames that a feed lists now', () => {
  it('maps the earlier run’s official: id to the feed’s contest of the same pair', () => {
    const added = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-11-24', contestId: 'official:2026-11-24-greenfield-at-santa-catalina', official: null });
    const contest = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-11-24', official: null });
    expect(supersededGamesOf([contest], previousWith([added]))).toEqual({ [added.contestId]: contest.contestId });
    // Not while the added game is still listed.
    expect(supersededGamesOf([added, contest], previousWith([added]))).toEqual({});
  });
});

describe('supersededGamesOf: a game the previous build listed from a league’s own schedule', () => {
  // lib/results/fixture-games.ts made /game/official-2026-11-24-greenfield-at-santa-catalina from this fixture; it is
  // not stored, only the fixture is (in officialFixtures).
  const fixture = pcalFixture('2026-11-24', 'greenfield', 'santa-catalina');
  const pageId = 'official:2026-11-24-greenfield-at-santa-catalina';

  it('maps the fixture game’s id to the game that carries the fixture’s stamp now', () => {
    const contest = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-11-24', official: { fixtureId: fixture.id } });
    expect(supersededGamesOf([contest], previousWith([], {}, [fixture]))).toEqual({ [pageId]: contest.contestId });
  });

  it('prefers the MaxPreps contest to an si.com fill of the same fixture', () => {
    const contest = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-11-24', official: { fixtureId: fixture.id } });
    const fill = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-11-24', contestId: 'sblive:7000001', official: { fixtureId: fixture.id } });
    expect(supersededGamesOf([fill, contest], previousWith([], {}, [fixture]))).toEqual({ [pageId]: contest.contestId });
    // An si.com fill alone takes the page.
    expect(supersededGamesOf([fill], previousWith([], {}, [fixture]))).toEqual({ [pageId]: 'sblive:7000001' });
  });

  it('nothing while no game carries the fixture, or when the fixture made no page (a school outside the division)', () => {
    const other = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-10-06' });
    expect(supersededGamesOf([other], previousWith([], {}, [fixture]))).toEqual({});
    const outside = { ...fixture, id: 'pcal:2026-11-24:nowhere@santa-catalina', awaySlug: null, awayName: 'Nowhere' };
    const contest = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-11-24', official: { fixtureId: outside.id } });
    expect(supersededGamesOf([contest], previousWith([], {}, [outside]))).toEqual({});
  });

  it('a carried target superseded since is followed: official → si.com fill → MaxPreps', () => {
    const fill = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-11-24', contestId: 'sblive:7000001', official: { fixtureId: fixture.id } });
    const contest = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-11-24', official: { fixtureId: fixture.id } });
    const prev = previousWith([fill], { [pageId]: fill.contestId });
    expect(supersededGamesOf([contest], prev)).toEqual({ [pageId]: contest.contestId, 'sblive:7000001': contest.contestId });
  });
});

describe('gameUrlsOf: each game’s slug and aliases, against the previous snapshot (lib/game-urls.ts)', () => {
  const AT = '2026-11-15T15:00:00.000Z';
  const urls = (games: Game[]) => Object.fromEntries(games.map((g) => [g.contestId, [g.slug, ...(g.aliases ?? [])]]));
  /** The previous snapshot as readPrevious gives it: a file from before slugs, upgraded on load. */
  const loaded = (games: Game[], fixtures: OfficialFixture[] = [], superseded: Record<string, string> = {}): Snapshot =>
    previousWith(withLegacyGameUrls(games, superseded), superseded, fixtures);

  it('the first run after slugs: a game published at its id keeps that URL as an alias; a new game has none', () => {
    const old = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', hs: 1, as: 0 });
    const fresh = game({ home: 'greenfield', away: 'santa-catalina', date: '2026-10-06' });
    const out = gameUrlsOf([old, fresh], loaded([old]), [], {}, AT);
    expect(urls(out)).toEqual({
      [old.contestId]: ['2026-09-04-greenfield-at-santa-catalina', old.contestId],
      [fresh.contestId]: ['2026-10-06-santa-catalina-at-greenfield'],
    });
  });

  it('with nothing to vouch for a game, its id stays reachable: no previous snapshot, or a contest that left and is back', () => {
    const old = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', hs: 1, as: 0 });
    const other = game({ home: 'greenfield', away: 'santa-catalina', date: '2026-10-06' });
    // No previous snapshot (a first run, or a file that would not load): one bad run must not drop every old URL.
    expect(urls(gameUrlsOf([old], null, [], {}, AT))).toEqual({ [old.contestId]: ['2026-09-04-greenfield-at-santa-catalina', old.contestId] });
    // Gone for a run (the previous snapshot records the removal), then back: its id URL answers again.
    const gone = { ...loaded([other]), contentRemovals: [{ contestId: old.contestId, dateKey: '2026-09-04', slugs: [], removedAt: AT }] } as Snapshot;
    expect(urls(gameUrlsOf([old, other], gone, [], {}, AT))).toEqual({
      [old.contestId]: ['2026-09-04-greenfield-at-santa-catalina', old.contestId],
      [other.contestId]: ['2026-10-06-santa-catalina-at-greenfield', other.contestId],
    });
    // The record keeps where the page was (lib/snapshot/content-dates.ts): a contest back on another day has its
    // old slug and aliases as aliases again, unless a game has that slug now.
    const kept = { ...gone, contentRemovals: [{ ...gone.contentRemovals![0], slug: '2026-09-04-greenfield-at-santa-catalina', aliases: ['2026-08-28-greenfield-at-santa-catalina'] }] } as Snapshot;
    const back = { ...game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-11', official: null }), contestId: old.contestId };
    expect(urls(gameUrlsOf([back, other], kept, [], {}, AT))[old.contestId]).toEqual([
      '2026-09-11-greenfield-at-santa-catalina',
      ...['2026-08-28-greenfield-at-santa-catalina', '2026-09-04-greenfield-at-santa-catalina', old.contestId].sort(),
    ]);
    const taker = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', official: null });
    expect(urls(gameUrlsOf([back, taker], kept, [], {}, AT))[old.contestId]).toEqual([
      '2026-09-11-greenfield-at-santa-catalina',
      ...['2026-08-28-greenfield-at-santa-catalina', old.contestId].sort(),
    ]);
    // …and unless a game used that slug while the contest was away and has since left it: the alias is that
    // game's, whichever contest id sorts first (the returning contest's does here).
    const leaver = { ...game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-18', official: null }), contestId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' };
    const used = { ...kept, games: [...kept.games, { ...leaver, slug: '2026-09-18-greenfield-at-santa-catalina', aliases: ['2026-09-04-greenfield-at-santa-catalina'] }] } as Snapshot;
    expect(old.contestId < leaver.contestId, 'tests: the returning contest sorts first').toBe(true);
    const both = urls(gameUrlsOf([back, leaver], used, [], {}, AT));
    expect(both[leaver.contestId]).toEqual(['2026-09-18-greenfield-at-santa-catalina', '2026-09-04-greenfield-at-santa-catalina']);
    expect(both[old.contestId]).toEqual(['2026-09-11-greenfield-at-santa-catalina', ...['2026-08-28-greenfield-at-santa-catalina', old.contestId].sort()]);
    // A removal of a game that is still there (it only changed its date) vouches for nothing new.
    const moved = { ...loaded([old]), contentRemovals: [{ contestId: old.contestId, dateKey: '2026-08-28', slugs: [], removedAt: AT }] } as Snapshot;
    expect(urls(gameUrlsOf([old, other], moved, [], {}, AT))[other.contestId]).toEqual(['2026-10-06-santa-catalina-at-greenfield']);
  });

  it('a schedule-only game keeps its page: a feed game of the same day and pair that turns up beside it is -2', () => {
    // The league lists Greenfield at Santa Catalina on Nov 24; a feed game of that day is not matched to the fixture.
    const fixture = pcalFixture('2026-11-24', 'greenfield', 'santa-catalina');
    const unmatched = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-11-24', official: null });
    const previous = loaded([], [fixture]);
    const out = gameUrlsOf([unmatched], previous, [fixture], {}, AT);
    expect(urls(out)).toEqual({ [unmatched.contestId]: ['2026-11-24-greenfield-at-santa-catalina-2'] });
    // The site then lists the fixture at the plain slug, where proxy.ts sends its old official- URL.
    const site = withFixtureGames(out, [fixture], '2026-11-15', AT).listed;
    expect(site.map((g) => g.slug)).toEqual(['2026-11-24-greenfield-at-santa-catalina']);
    // A feed game that had the slug before the league listed the fixture keeps it; the fixture is the -2.
    const first = previousWith(gameUrlsOf([unmatched], loaded([]), [], {}, AT));
    const kept = gameUrlsOf([unmatched], first, [fixture], {}, AT);
    expect(kept[0].slug).toBe('2026-11-24-greenfield-at-santa-catalina');
    expect(withFixtureGames(kept, [fixture], '2026-11-15', AT).listed.map((g) => g.slug)).toEqual(['2026-11-24-greenfield-at-santa-catalina-2']);
  });

  it('a rescheduled game is at its new date, and the old slug stays an alias run after run', () => {
    const before = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-10-06' });
    const first = previousWith(gameUrlsOf([before], loaded([]), [], {}, AT));
    const moved = { ...before, ...game({ home: 'santa-catalina', away: 'greenfield', date: '2026-10-13', official: null }), contestId: before.contestId };
    const second = gameUrlsOf([moved], first, [], {}, AT);
    expect(urls(second)).toEqual({ [before.contestId]: ['2026-10-13-greenfield-at-santa-catalina', '2026-10-06-greenfield-at-santa-catalina'] });
    expect(urls(gameUrlsOf([moved], previousWith(second), [], {}, AT))).toEqual(urls(second));
  });

  it('a schedule-only game a feed lists now: the MaxPreps game takes over its slug and its old official- URL', () => {
    const fixture = pcalFixture('2026-11-24', 'greenfield', 'santa-catalina');
    const previous = loaded([], [fixture]);
    // Same day: the page does not move, and only the old id URL is an alias.
    const contest = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-11-24', official: { fixtureId: fixture.id } });
    const superseded = supersededGamesOf([contest], previous);
    expect(urls(gameUrlsOf([contest], previous, [], superseded, AT))).toEqual({
      [contest.contestId]: ['2026-11-24-greenfield-at-santa-catalina', 'official-2026-11-24-greenfield-at-santa-catalina'],
    });
    // Played a day late: the fixture's slug redirects too.
    const late = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-11-25', official: { fixtureId: fixture.id, scheduledDate: '2026-11-24', pass: 'rescheduled' } });
    expect(urls(gameUrlsOf([late], previous, [], supersededGamesOf([late], previous), AT))).toEqual({
      [late.contestId]: ['2026-11-25-greenfield-at-santa-catalina', '2026-11-24-greenfield-at-santa-catalina', 'official-2026-11-24-greenfield-at-santa-catalina'],
    });
  });

  it('no alias is the slug of a schedule-only game this run lists: that page is not stored, and is still a page', () => {
    // The MaxPreps game moved off Nov 24 (and is not matched to the fixture), which the league still lists that day.
    const fixture = pcalFixture('2026-11-24', 'greenfield', 'santa-catalina');
    const before = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-11-24', official: null });
    const first = previousWith(gameUrlsOf([before], loaded([]), [], {}, AT));
    const moved = { ...game({ home: 'santa-catalina', away: 'greenfield', date: '2026-12-01', official: null }), contestId: before.contestId };
    expect(urls(gameUrlsOf([moved], first, [fixture], {}, AT))).toEqual({ [before.contestId]: ['2026-12-01-greenfield-at-santa-catalina'] });
    expect(urls(gameUrlsOf([moved], first, [], {}, AT))).toEqual({
      [before.contestId]: ['2026-12-01-greenfield-at-santa-catalina', '2026-11-24-greenfield-at-santa-catalina'],
    });
  });

  it('an si.com fill MaxPreps supersedes hands over its slug and every alias', () => {
    const fill = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', hs: 1, as: 0, contestId: 'sblive:6541425' });
    const previous = loaded([fill]);
    const contest = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', hs: 1, as: 0, official: { fixtureId: fill.official!.fixtureId } });
    const superseded = supersededGamesOf([contest], previous);
    expect(urls(gameUrlsOf([contest], previous, [], superseded, AT))).toEqual({
      [contest.contestId]: ['2026-09-04-greenfield-at-santa-catalina', 'sblive-6541425'],
    });
  });
});
