/**
 * lib/content-dates.ts — the sitemap's per-page `lastmod` (app/sitemap.ts): MaxPreps' contest stamp
 * read as UTC and clamped to the fetch, the snapshot stamp where the page's version of the game is
 * not MaxPreps', the pipeline's own `contentChangedAt` over both, and the sets of games a game page
 * and a score-day page are built from.
 */
import { describe, expect, it } from 'vitest';

import {
  contentRemovalsOf,
  gameContentStamp,
  gamePageInputs,
  latestContentDate,
  removalsForGame,
  removalsOnDay,
  scoreDayInputs,
  stampContentChanges,
} from '@/lib/content-dates';
import type { Game } from '@/lib/model/game';
import { game } from './support/game-builder';

const FETCHED = '2026-09-29T15:00:00.000Z';

function stamped(g: Game, modifiedOn: string | undefined, extra: Partial<Game['provenance']> = {}): Game {
  return { ...g, provenance: { ...g.provenance, fetchedAt: FETCHED, maxprepsModifiedOn: modifiedOn, ...extra } };
}

describe('gameContentStamp', () => {
  const base = game({ home: 'cupertino', away: 'fremont', hs: 2, as: 1, date: '2026-09-09' });

  it('reads MaxPreps’ offset-less modifiedOn as UTC', () => {
    expect(new Date(gameContentStamp(stamped(base, '2026-09-10T19:51:44'))).toISOString()).toBe(
      '2026-09-10T19:51:44.000Z',
    );
  });

  it('never claims a change after the data was read', () => {
    expect(gameContentStamp(stamped(base, '2026-09-30T08:00:00'))).toBe(Date.parse(FETCHED));
  });

  it('falls back to the fetch when MaxPreps published no stamp, or the score shown is not MaxPreps’', () => {
    expect(gameContentStamp(stamped(base, undefined))).toBe(Date.parse(FETCHED));
    expect(gameContentStamp(stamped(base, 'not a date'))).toBe(Date.parse(FETCHED));
    const backfill = { rule: 'score-pending', sbliveGameId: '1', maxpreps: null, note: 'n' } as const;
    expect(gameContentStamp(stamped(base, '2026-09-10T19:51:44', { backfill }))).toBe(Date.parse(FETCHED));
    const scoreConflict = { sblive: { home: 1, away: 1 }, note: 'n' };
    expect(gameContentStamp(stamped(base, '2026-09-10T19:51:44', { scoreConflict }))).toBe(Date.parse(FETCHED));
  });
});

describe('gameContentStamp with the pipeline’s contentChangedAt', () => {
  const base = game({ home: 'cupertino', away: 'fremont', hs: 2, as: 1, date: '2026-09-09' });

  it('is the stamp whenever it is set, even on a si.com score MaxPreps’ stamp cannot date', () => {
    const backfill = { rule: 'score-pending', sbliveGameId: '1', maxpreps: null, note: 'n' } as const;
    const g = stamped(base, '2026-09-10T19:51:44', { backfill, contentChangedAt: '2026-09-20T03:00:00.000Z' });
    expect(new Date(gameContentStamp(g)).toISOString()).toBe('2026-09-20T03:00:00.000Z');
  });
});

describe('stampContentChanges (lib/pipeline/steps/assemble.ts)', () => {
  const RUN = '2026-10-05T12:00:00.000Z';
  // With an official stamp (SCVAL's are only set when passed), so the test can move it.
  const a = stamped(game({ home: 'cupertino', away: 'fremont', hs: 2, as: 1, date: '2026-09-09', official: {} }), '2026-09-10T01:00:00');
  const b = stamped(game({ home: 'cupertino', away: 'los-altos', hs: 0, as: 1, date: '2026-09-16' }), '2026-09-17T01:00:00');

  it('stamps nothing without a previous snapshot to compare with', () => {
    expect(stampContentChanges([a, b], null, RUN).map((g) => g.provenance.contentChangedAt)).toEqual([undefined, undefined]);
  });

  it('leaves an unchanged game unstamped on the field’s first run, and keeps a stamp it already had', () => {
    const refetched = { ...a, provenance: { ...a.provenance, fetchedAt: RUN, maxprepsModifiedOn: '2026-10-01T00:00:00' } };
    expect(stampContentChanges([refetched], [a], RUN)[0].provenance.contentChangedAt, 'a re-fetch or a MaxPreps re-save is no change').toBeUndefined();
    const prior = { ...a, provenance: { ...a.provenance, contentChangedAt: '2026-09-11T00:00:00.000Z' } };
    expect(stampContentChanges([refetched], [prior], RUN)[0].provenance.contentChangedAt).toBe('2026-09-11T00:00:00.000Z');
  });

  it('stamps this run on a game whose shown content changed, or that is new', () => {
    expect(a.official, 'tests/support/game-builder.ts: the official stamp').toBeDefined();
    const moved = { ...a, official: { ...a.official!, scheduledDate: '2026-09-02' } };
    const noted = { ...b, provenance: { ...b.provenance, hostConflict: 'The official schedule has Los Altos hosting.' } };
    const fresh = game({ home: 'fremont', away: 'los-altos', date: '2026-10-21' });
    const out = stampContentChanges([moved, noted, fresh], [a, b], RUN);
    expect(out.map((g) => g.provenance.contentChangedAt)).toEqual([RUN, RUN, RUN]);
  });
});

describe('contentRemovalsOf (lib/pipeline/steps/assemble.ts) and the pages a removal touched', () => {
  const RUN = '2026-10-05T12:00:00.000Z';
  const kept = game({ home: 'cupertino', away: 'fremont', hs: 2, as: 1, date: '2026-09-09' });
  const deleted = game({ home: 'cupertino', away: 'los-altos', date: '2026-09-16' });
  const before = game({ home: 'fremont', away: 'los-altos', date: '2026-09-23' });
  const moved = { ...before, dateKey: '2026-09-30', dateLocal: '2026-09-30T16:00:00', dateUtc: '2026-09-30T23:00:00Z' };

  it('records nothing without a previous snapshot, or when every contest stayed on its date', () => {
    expect(contentRemovalsOf([kept], null, RUN)).toEqual([]);
    expect(contentRemovalsOf([kept, deleted], { games: [kept, deleted] }, RUN)).toEqual([]);
  });

  it('records a contest gone from the snapshot, and one that left its old date', () => {
    expect(contentRemovalsOf([kept, moved], { games: [kept, deleted, before] }, RUN)).toEqual([
      { contestId: deleted.contestId, dateKey: '2026-09-16', slugs: ['cupertino', 'los-altos'], removedAt: RUN },
      { contestId: before.contestId, dateKey: '2026-09-23', slugs: ['fremont', 'los-altos'], removedAt: RUN },
    ]);
  });

  it('carries the season’s earlier removals and keeps the later stamp of a repeat', () => {
    const earlier = { contestId: deleted.contestId, dateKey: '2026-09-16', slugs: ['cupertino', 'los-altos'], removedAt: '2026-09-20T00:00:00.000Z' };
    const old = { contestId: 'x', dateKey: '2026-08-30', slugs: ['carmel'], removedAt: '2026-09-01T00:00:00.000Z' };
    const out = contentRemovalsOf([kept], { games: [kept, deleted], contentRemovals: [earlier, old] }, RUN);
    expect(out.map((r) => [r.contestId, r.removedAt])).toEqual([
      ['x', '2026-09-01T00:00:00.000Z'],
      [deleted.contestId, RUN],
    ]);
  });

  it('dates the day the contest left and the game pages of its sides, not other days or teams', () => {
    const removals = contentRemovalsOf([kept, moved], { games: [kept, deleted, before] }, RUN);
    expect(removalsOnDay(removals, '2026-09-16').map((r) => r.contestId)).toEqual([deleted.contestId]);
    expect(removalsOnDay(removals, '2026-09-30')).toEqual([]);
    const other = game({ home: 'carmel', away: 'salinas', hs: 2, as: 1, date: '2026-09-02' });
    expect(removalsForGame(removals, kept)).toHaveLength(2);
    expect(removalsForGame(removals, other)).toEqual([]);
    expect(latestContentDate([stamped(other, '2026-09-03T00:00:00')], RUN, removalsOnDay(removals, '2026-09-16')).toISOString()).toBe(RUN);
  });
});

describe('latestContentDate', () => {
  it('is the newest stamp of the games, or the fallback for none', () => {
    const a = stamped(game({ home: 'cupertino', away: 'fremont', hs: 2, as: 1 }), '2026-09-10T01:00:00');
    const b = stamped(game({ home: 'cupertino', away: 'fremont', hs: 2, as: 1 }), '2026-09-12T01:00:00');
    expect(latestContentDate([a, b], FETCHED).toISOString()).toBe('2026-09-12T01:00:00.000Z');
    expect(latestContentDate([], FETCHED).toISOString()).toBe(FETCHED);
  });
});

describe('gamePageInputs', () => {
  const early = game({ home: 'cupertino', away: 'los-altos', hs: 1, as: 0, date: '2026-09-02' });
  const self = game({ home: 'fremont', away: 'cupertino', hs: 2, as: 1, date: '2026-09-09' });
  const laterLeg = game({ home: 'cupertino', away: 'fremont', date: '2026-10-07' });
  const laterOther = game({ home: 'cupertino', away: 'los-altos', date: '2026-10-09' });
  const unrelated = game({ home: 'carmel', away: 'salinas', hs: 2, as: 1, date: '2026-09-02' });
  const all = [early, self, laterLeg, laterOther, unrelated];

  it('takes the game, both sides’ earlier games and every meeting of the two, nothing else', () => {
    expect(gamePageInputs(self, all)).toEqual([early, self, laterLeg]);
  });

  it('takes every game of both sides when the scoreboard shows today’s records (non-league, postponed)', () => {
    const nonLeague = game({
      home: 'fremont',
      away: 'cupertino',
      hs: 2,
      as: 1,
      date: '2026-09-09',
      league: false,
      division: null,
      official: null,
    });
    expect(nonLeague.countsFor, 'tests/support/game-builder.ts: a non-league game').toBeNull();
    const withNonLeague = [early, nonLeague, laterLeg, laterOther, unrelated];
    expect(gamePageInputs(nonLeague, withNonLeague)).toEqual([early, nonLeague, laterLeg, laterOther]);
    const postponed = { ...self, status: 'postponed' as const };
    expect(gamePageInputs(postponed, [early, postponed, laterLeg, laterOther, unrelated])).toEqual([
      early,
      postponed,
      laterLeg,
      laterOther,
    ]);
  });
});

describe('scoreDayInputs', () => {
  const final = game({ home: 'cupertino', away: 'los-altos', hs: 1, as: 0, date: '2026-10-07' });
  const upcoming = game({ home: 'fremont', away: 'cupertino', date: '2026-10-07' });
  const fremontEarlier = game({ home: 'fremont', away: 'los-altos', hs: 1, as: 1, date: '2026-09-02' });
  const unrelated = game({ home: 'carmel', away: 'salinas', hs: 2, as: 1, date: '2026-09-02' });

  it('is the day’s games when every row is a final (a final prints no record)', () => {
    expect(scoreDayInputs([final], [fremontEarlier, final, unrelated])).toEqual([final]);
  });

  it('adds every game of an upcoming league row’s sides, whose current records the row prints', () => {
    expect(upcoming.countsFor, 'tests/support/game-builder.ts: a counted league game').not.toBeNull();
    expect(scoreDayInputs([final, upcoming], [fremontEarlier, final, upcoming, unrelated])).toEqual([
      fremontEarlier,
      final,
      upcoming,
    ]);
  });
});
