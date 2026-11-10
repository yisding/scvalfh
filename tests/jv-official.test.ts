/**
 * lib/jv/jv-official.ts: the league's own JV schedule as JV games. Synthetic slots over two registry schools
 * (the default build's: Los Altos and Saratoga), with listed games made from a real JV row so every field a
 * reader touches is there.
 */
import { describe, expect, it } from 'vitest';

import { getJvFile } from '../lib/jv/jv';
import {
  JV_OFFICIAL_WINDOW_DAYS,
  OFFICIAL_JV_PREFIX,
  isOfficialJvContestId,
  jvSlotsOf,
  mergeJvOfficial,
  officialJvFixtureId,
  type JvSlot,
} from '../lib/jv/jv-official';
import { classifyJvGames, withJvClassification } from '../lib/jv/jv-standings';
import { getTeamBySlug } from '../lib/teams';
import type { Game, OfficialFixture } from '../lib/types';

const HOME = getTeamBySlug('los-altos')!;
const AWAY = getTeamBySlug('saratoga')!;
const TEMPLATE = getJvFile().games.find((g) => g.home.slug && g.away.slug)!;
const FETCHED_AT = '2026-11-10T14:00:00.000Z';

function listed(id: string, dateKey: string, opts: { swap?: boolean; timeTba?: boolean; final?: [number, number] } = {}): Game {
  const [home, away] = opts.swap ? [AWAY, HOME] : [HOME, AWAY];
  const side = (t: typeof HOME, score: number | null, other: number | null) => ({
    teamId: t.id, slug: t.slug, name: t.name, score,
    result: score === null || other === null ? null : score > other ? ('W' as const) : ('L' as const),
  });
  const [hs, as] = opts.final ?? [null, null];
  return {
    ...TEMPLATE,
    contestId: id,
    dateKey,
    dateLocal: `${dateKey}T${opts.timeTba ? '12:00' : '16:00'}:00`,
    isTimeTba: opts.timeTba ?? false,
    home: side(home, hs, as),
    away: side(away, as, hs),
    status: opts.final ? 'final' : 'scheduled',
    leagueDivision: HOME.division === AWAY.division ? HOME.division : null,
    countsFor: null,
    postseason: null,
  };
}

const slot = (dateKey: string, time: string | null = '17:30', swap = false): JvSlot => {
  const [home, away] = swap ? [AWAY, HOME] : [HOME, AWAY];
  return {
    fixtureId: `${home.division}:${dateKey}:${away.slug}@${home.slug}`,
    division: home.division, source: 'scval-pdf', homeSlug: home.slug, awaySlug: away.slug, dateKey, time,
  };
};

describe('mergeJvOfficial', () => {
  it('adds a scheduled game for a slot no source lists: the schedule’s date, time and host, no score', () => {
    const s = slot('2027-01-06');
    const out = mergeJvOfficial({ games: [], slots: [s], fetchedAt: FETCHED_AT });
    expect(out).toMatchObject({ slots: 1, matched: 0, moved: 0, timed: [] });
    expect(out.added).toEqual([`${OFFICIAL_JV_PREFIX}${s.fixtureId}`]);
    const [game] = out.games;
    expect(game).toMatchObject({
      contestId: `${OFFICIAL_JV_PREFIX}${s.fixtureId}`,
      dateKey: '2027-01-06',
      dateLocal: '2027-01-06T17:30:00',
      dateUtc: '2027-01-07T01:30:00Z',
      isTimeTba: false,
      status: 'scheduled',
      site: 'home',
      leagueDivision: HOME.division,
      home: { slug: HOME.slug, teamId: HOME.id, score: null, result: null },
      away: { slug: AWAY.slug, teamId: AWAY.id, score: null, result: null },
      provenance: { scores: 'scval-pdf', schedule: 'scval-pdf', fetchedAt: FETCHED_AT },
    });
    expect(isOfficialJvContestId(game.contestId)).toBe(true);
    expect(officialJvFixtureId(game.contestId)).toBe(s.fixtureId);
  });

  it('lists a slot with no time at noon, time to be announced', () => {
    const [game] = mergeJvOfficial({ games: [], slots: [slot('2027-01-06', null)], fetchedAt: FETCHED_AT }).games;
    expect(game).toMatchObject({ dateLocal: '2027-01-06T12:00:00', isTimeTba: true });
  });

  it('takes a listed game of the pair within the window as the slot’s game, whichever school hosts', () => {
    for (const dateKey of ['2027-01-06', '2027-01-07', '2027-01-09']) {
      const game = listed('g1', dateKey, { swap: true });
      const out = mergeJvOfficial({ games: [game], slots: [slot('2027-01-06')], fetchedAt: FETCHED_AT });
      expect(out, dateKey).toMatchObject({ matched: 1, moved: 0, added: [] });
      expect(out.games).toEqual([game]);
    }
    expect(JV_OFFICIAL_WINDOW_DAYS).toBe(3);
  });

  it('gives a listed game on the slot’s date the schedule’s time when its own is TBA, and never rewrites a final', () => {
    const tba = listed('g1', '2027-01-06', { timeTba: true });
    const out = mergeJvOfficial({ games: [tba], slots: [slot('2027-01-06', '15:00')], fetchedAt: FETCHED_AT });
    expect(out.timed).toEqual(['g1']);
    expect(out.games[0]).toMatchObject({ dateLocal: '2027-01-06T15:00:00', dateUtc: '2027-01-06T23:00:00Z', isTimeTba: false });

    const final = listed('g2', '2027-01-06', { timeTba: true, final: [40, 30] });
    const kept = mergeJvOfficial({ games: [final], slots: [slot('2027-01-06', '15:00')], fetchedAt: FETCHED_AT });
    expect(kept.timed).toEqual([]);
    expect(kept.games).toEqual([final]);
  });

  it('reads a same-host game on another day as the slot’s game moved, and adds nothing', () => {
    const moved = listed('g1', '2027-01-20');
    const out = mergeJvOfficial({ games: [moved], slots: [slot('2027-01-06')], fetchedAt: FETCHED_AT });
    expect(out).toMatchObject({ matched: 0, moved: 1, added: [] });
    expect(out.games).toEqual([moved]);
  });

  it('does not read the return fixture as a moved game: the other host’s game far away leaves the slot listed', () => {
    const returnGame = listed('g1', '2027-01-27', { swap: true });
    const out = mergeJvOfficial({ games: [returnGame], slots: [slot('2027-01-06')], fetchedAt: FETCHED_AT });
    expect(out).toMatchObject({ matched: 0, moved: 0 });
    expect(out.added).toHaveLength(1);
    expect(out.games.map((g) => g.dateKey)).toEqual(['2027-01-06', '2027-01-27']);
  });

  it('claims each listed game for one slot only: a double round robin with one game listed adds the other', () => {
    const first = listed('g1', '2027-01-06');
    const slots = [slot('2027-01-06'), slot('2027-01-27', '17:30', true)];
    const out = mergeJvOfficial({ games: [first], slots, fetchedAt: FETCHED_AT });
    expect(out).toMatchObject({ matched: 1, moved: 0 });
    expect(out.added).toEqual([`${OFFICIAL_JV_PREFIX}${slots[1].fixtureId}`]);
  });
});

describe('jvSlotsOf', () => {
  const fixture = (dateKey: string, jv?: OfficialFixture['jv']): OfficialFixture => ({
    id: `${HOME.division}:${dateKey}:${AWAY.slug}@${HOME.slug}`,
    league: HOME.league, division: HOME.division, dateKey, time: '19:00',
    awayName: AWAY.name, homeName: HOME.name, awaySlug: AWAY.slug, homeSlug: HOME.slug, source: 'scval-pdf',
    ...(jv ? { jv } : {}),
  });

  it('reads a slot from a matched varsity game’s stamp, keeping the fixture’s own host', () => {
    const f = fixture('2027-02-16', { dateKey: '2027-02-15', time: '19:00' });
    // The schools swapped the varsity host: the stamp still names the fixture, whose id carries away@home.
    const varsity: Game = {
      ...listed('v1', '2027-02-16', { swap: true }),
      official: { scheduledDate: f.dateKey, division: f.division, source: f.source, fixtureId: f.id, pass: 'same-date-swapped', jv: f.jv },
    };
    expect(jvSlotsOf([varsity], [])).toEqual([
      { fixtureId: f.id, division: f.division, source: 'scval-pdf', homeSlug: HOME.slug, awaySlug: AWAY.slug, dateKey: '2027-02-15', time: '19:00' },
    ]);
  });

  it('reads a slot from a fixture no contest matched, and none from a fixture without a JV game', () => {
    const withJv = fixture('2027-01-06', { dateKey: '2027-01-06', time: '17:30' });
    expect(jvSlotsOf([], [withJv, fixture('2027-01-27')]).map((s) => s.fixtureId)).toEqual([withJv.id]);
    expect(jvSlotsOf([listed('v1', '2027-01-06')], [])).toEqual([]);
  });
});

describe('a game listed from the schedule in the JV tables', () => {
  it('is a league game of the fixture’s division with no varsity counterpart at all', () => {
    const s = slot('2027-01-06');
    const { games } = mergeJvOfficial({ games: [], slots: [s], fetchedAt: FETCHED_AT });
    const classes = classifyJvGames(games, [], []);
    expect(classes.get(games[0].contestId)).toEqual({ kind: 'league', division: s.division, via: 'official-fixture', ref: s.fixtureId });
    expect(withJvClassification(games, classes)[0].countsFor).toBe(s.division);
  });

  it('counts a listed JV game on the schedule’s JV day when the varsity fixture is another day', () => {
    const f: OfficialFixture = {
      id: `${HOME.division}:2027-02-20:${AWAY.slug}@${HOME.slug}`,
      league: HOME.league, division: HOME.division, dateKey: '2027-02-20', time: '19:00',
      awayName: AWAY.name, homeName: HOME.name, awaySlug: AWAY.slug, homeSlug: HOME.slug, source: 'scval-pdf',
      jv: { dateKey: '2027-02-15', time: '19:00' },
    };
    // Five days before the varsity date: outside the ±3-day window of the fixture's own date, on its JV date.
    const jv = listed('g1', '2027-02-15');
    expect(classifyJvGames([jv], [], [f]).get('g1')).toEqual({ kind: 'league', division: f.division, via: 'official-fixture', ref: f.id });
  });
});
