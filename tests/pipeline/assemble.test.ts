/**
 * lib/pipeline/steps/assemble.ts — `supersededGamesOf` (snapshot refinement 10): the map from a si.com fill's
 * `sblive:` id to the MaxPreps contest that later matched the same official fixture, carried while both ends
 * hold. The fills themselves are lib/crosscheck/backfill.ts's (tests/backfill.test.ts, rule 10).
 */

import { describe, expect, it } from 'vitest';

import { supersededGamesOf } from '../../lib/pipeline/steps/assemble';
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
