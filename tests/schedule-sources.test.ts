/**
 * Games the feeds do not carry (owner decisions of 2026-11-14): a league's official fixture no source lists is on
 * the schedule as a game (lib/results/fixture-games.ts), a game an official source has is added from config
 * (DATA_QUALITY.addedGames), a Section final is at the Section's site, and a playoff game is filed under its event.
 */

import { describe, expect, it } from 'vitest';

import { dayGroups } from '../components/schedule/day-summary';
import { describeGame } from '../components/ui/describe-game';
import { classifyGame } from '../lib/classify';
import * as data from '../lib/data';
import { gameHref, gameIdToParam, isOfficialContestId, officialContestId, paramToGameId } from '../lib/game-id';
import { DATA_QUALITY } from '../lib/league-config/data-quality';
import { roundSiteOf, withRoundSite } from '../lib/postseason/round-site';
import { fixtureGame, withFixtureGames } from '../lib/results/fixture-games';
import { addedGame, applyResultCorrection, resolveResult, withAddedGames } from '../lib/results/result';
import type { AddedGame, OfficialFixture } from '../lib/types';
import { game } from './game-builder';

const FETCHED = '2026-11-14T12:00:00.000Z';

describe('an official fixture no source lists is a game on the schedule', () => {
  // PCAL's schedule has Santa Catalina at Greenfield on Oct 6; no source has a contest for it.
  const fixture: OfficialFixture = {
    id: 'pcal:2026-10-06:santa-catalina@greenfield', league: 'pcal', division: 'pcal', dateKey: '2026-10-06', time: '16:00',
    awayName: 'Santa Catalina', homeName: 'Greenfield', awaySlug: 'santa-catalina', homeSlug: 'greenfield', source: 'pcal-pdf',
  } as OfficialFixture;

  it('lists it with the schedule’s date, start and host, counted for its division, with no score', () => {
    const g = fixtureGame(fixture, '2026-11-14', FETCHED)!;
    expect(g.contestId).toBe('official:2026-10-06-santa-catalina-at-greenfield');
    expect([g.dateKey, g.dateLocal, g.isTimeTba]).toEqual(['2026-10-06', '2026-10-06T16:00:00', false]);
    expect([g.home.slug, g.away.slug, g.home.score, g.away.score]).toEqual(['greenfield', 'santa-catalina', null, null]);
    // Its day has passed: no score from any source, never 0-0.
    expect([g.status, g.countsFor, g.official?.fixtureId]).toEqual(['score-pending', 'pcal', fixture.id]);
    expect(classifyGame(g), 'lib/classify.ts: it is the league’s own fixture').toBe('pcal');
    expect(describeGame(g).note).toBe('On the league’s schedule for this day; no source has listed the game or a score.');
    expect(fixtureGame(fixture, '2026-10-01', FETCHED)!.status, 'before its day').toBe('scheduled');
    expect(resolveResult(g), 'no result until a source has a score').toBeNull();
  });

  it('has a URL of its own, and leaves a fixture with a school outside the registry a fixture', () => {
    expect(isOfficialContestId(officialContestId('2026-10-06', 'santa-catalina', 'greenfield'))).toBe(true);
    expect(gameHref('official:2026-10-06-santa-catalina-at-greenfield')).toBe('/game/official-2026-10-06-santa-catalina-at-greenfield');
    expect(paramToGameId(gameIdToParam('official:2026-10-06-santa-catalina-at-greenfield'))).toBe('official:2026-10-06-santa-catalina-at-greenfield');
    const outside = { ...fixture, id: 'x', awaySlug: null } as OfficialFixture;
    const out = withFixtureGames([], [fixture, outside], '2026-11-14', FETCHED);
    expect(out.listed.map((g) => g.contestId)).toEqual(['official:2026-10-06-santa-catalina-at-greenfield']);
    expect(out.rest).toEqual([outside]);
    // Once a game carries the fixture's stamp, the fixture adds nothing.
    const matched = { ...fixtureGame(fixture, '2026-11-14', FETCHED)!, contestId: '00000000-0000-4000-8000-00000000abcd' };
    expect(withFixtureGames([matched], [fixture], '2026-11-14', FETCHED).listed).toEqual([]);
  });

  it('is how the site reads the committed snapshot: no bare fixture is left', () => {
    expect(data.getOfficialFixtures()).toEqual([]);
    const listed = data.getGames().filter((g) => isOfficialContestId(g.contestId) && g.official);
    for (const g of listed) expect([g.home.score, g.countsFor], g.contestId).toEqual([null, g.official!.division]);
  });
});

describe('a game an official source has and no feed lists (DATA_QUALITY.addedGames)', () => {
  const forfeit: AddedGame = {
    dateKey: '2026-10-30', time: '18:00', home: 'poway', away: 'valley-center', goals: { poway: 0, 'valley-center': 1 },
    forfeitBy: 'poway', otPeriods: 0, from: 'cifss', source: 'the Section’s listing', url: null,
  };

  it('records a forfeit as the Section lists it: counted in the league table, with its citation', () => {
    const g = addedGame(forfeit, FETCHED)!;
    expect([g.status, g.isForfeit, g.forfeitBy, g.decider, g.countsFor]).toEqual(['final', true, 'home', 'FORFEIT', 'palomar']);
    expect([g.home.result, g.away.result]).toEqual(['L', 'W']);
    expect(resolveResult(g)).toMatchObject({ winner: 'away', ending: 'forfeit', certainty: 'reported', basis: 'the Section’s listing' });
    expect(describeGame(g).sentence).toBe('Poway 0, Valley Center 1, final by forfeit.');
  });

  it('lists a game with no published score without one, and files a postseason game as postseason', () => {
    const semi: AddedGame = { dateKey: '2026-10-31', time: null, home: 'davis', away: 'chico', goals: null, forfeitBy: null, otPeriods: 0, from: 'derived', neutral: true, note: 'Chico won', source: 's', url: null };
    const g = addedGame(semi, FETCHED)!;
    expect([g.status, g.home.score, g.away.score, g.site, g.venue.text]).toEqual(['score-pending', null, null, 'neutral', 'Chico won']);
    expect(g.postseason?.kind, 'lib/classify.ts: the EAL’s postseason window').toBe('league-postseason');
    expect(g.countsFor).toBeNull();
    expect(resolveResult(g)).toBeNull();
  });

  it('goes only into a file that could hold it, and steps aside when a feed lists the pair that day', () => {
    const poway = game({ home: 'poway', away: 'del-norte', hs: 1, as: 0, date: '2026-10-20' });
    const vc = game({ home: 'valley-center', away: 'del-norte', hs: 0, as: 1, date: '2026-10-21' });
    expect(withAddedGames([poway, vc], FETCHED, [forfeit]).map((g) => g.contestId)).toContain('official:2026-10-30-valley-center-at-poway');
    // A capture from before the game, or one without both schools' games, is left alone.
    const early = [poway, vc];
    expect(withAddedGames(early, '2026-10-22T12:00:00.000Z', [forfeit])).toBe(early);
    const partial = [poway];
    expect(withAddedGames(partial, FETCHED, [forfeit])).toBe(partial);
    const listed = [poway, vc, game({ home: 'poway', away: 'valley-center', hs: 0, as: 1, date: '2026-10-30' })];
    expect(withAddedGames(listed, FETCHED, [forfeit])).toBe(listed);
  });

  it('puts the 2026 EAL Super Regional’s four unlisted games on the schedule, none with a score', () => {
    const day = data.getGames({ date: '2026-10-31' }).filter((g) => g.postseason?.kind === 'league-postseason');
    expect(day.map((g) => [g.away.slug, g.home.slug].join(' v ')).sort()).toEqual([
      'bella-vista v davis', 'bella-vista v pleasant-valley', 'chico v davis', 'chico v pleasant-valley', 'corning v chico', 'lassen v bella-vista',
    ]);
    for (const g of day.filter((x) => isOfficialContestId(x.contestId))) expect([g.status, g.home.score], g.contestId).toEqual(['score-pending', null]);
    expect(DATA_QUALITY.addedGames.every((a) => a.source.trim() !== '')).toBe(true);
  });
});

describe('a result whose source names the tiebreak winner and no tally', () => {
  // Granite Hills 1, Hilltop 0 on MaxPreps (Oct 30); East County Sports: won in the overtime procedure.
  it('is level in play, won in the shootout, with no tally read in from another listing', () => {
    const id = 'dbac5f77-1d98-4463-9b49-739a7943446b';
    const mp = game({ home: 'granite-hills', away: 'hilltop', hs: 1, as: 0, league: false, date: '2026-10-30', contestId: id });
    const withSi = { ...mp, provenance: { ...mp.provenance, scoreConflict: { sblive: { home: 2, away: 1 }, note: 'Sources disagree.' } } };
    const g = data.getGameById(id) ?? applyResultCorrection(withSi);
    expect([g.home.score, g.away.score, g.otPeriods, g.decider, g.shootout]).toEqual([0, 0, 1, 'SO', null]);
    expect([g.home.result, g.away.result]).toEqual(['W', 'L']);
    expect(describeGame(g).sentence).toBe('Granite Hills 0, Hilltop 0, final; Granite Hills won in a shootout.');
  });
});

describe('where a postseason game is, and where it is filed', () => {
  it('puts a San Diego Section final at La Jolla High School, a neutral site, whoever a feed lists as host', () => {
    const final = game({
      home: 'bishops', away: 'canyon-hills', date: '2026-11-14', league: false, contestTypes: { home: 4, away: 4 },
      postseason: { kind: 'section-playoffs', leagueId: 'city', via: 'contest-type-4' },
    });
    expect(roundSiteOf(final)).toBe('La Jolla High School');
    const placed = withRoundSite(final);
    expect([placed.site, placed.venue.text]).toEqual(['neutral', 'La Jolla High School']);
    expect(withRoundSite(placed)).toBe(placed);
    // An earlier round has no single site: it stays where the feed has it.
    const semi = { ...final, dateKey: '2026-11-10' };
    expect(withRoundSite(semi)).toBe(semi);
  });

  it('files a playoff game between two teams of one conference under the Section’s playoffs, not the conference', () => {
    const groups = dayGroups(data.getGames({ date: '2026-11-14' }));
    const playoffs = groups.find((g) => g.name === 'San Diego Section playoffs');
    expect(playoffs?.games.some((g) => g.home.slug === 'bishops' && g.away.slug === 'canyon-hills')).toBe(true);
    expect(groups.find((g) => g.leagueId === 'city')).toBeUndefined();
  });

  it('counts a game the config names a league game though MaxPreps types it a tournament game', () => {
    // Granite Hills at Southwest, Oct 16 (ee4e4cd0): on the Metro Conference schedule, typed tournament.
    const g = data.getGameById('ee4e4cd0-2ca9-4134-a6d8-af29ca742019')!;
    expect([g.contestTypes.home, g.countsFor]).toEqual([2, 'metro-south-bay']);
    const rows = data.getSnapshot().standings.filter((r) => r.division === 'metro-south-bay');
    expect(Object.fromEntries(rows.map((r) => [r.slug, `${r.computed.w}-${r.computed.l}`]))).toEqual({
      'granite-hills': '6-0', hilltop: '4-2', 'el-capitan': '2-4', southwest: '0-6',
    });
  });
});
