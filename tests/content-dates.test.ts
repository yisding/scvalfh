/**
 * lib/content-dates.ts — the sitemap's per-page `lastmod` (app/sitemap.ts): MaxPreps' contest stamp
 * read as UTC and clamped to the fetch, the snapshot stamp where the page's version of the game is
 * not MaxPreps', and the sets of games a game page and a score-day page are built from.
 */
import { describe, expect, it } from 'vitest';

import { gameContentStamp, gamePageInputs, latestContentDate, scoreDayInputs } from '../lib/content-dates';
import type { Game } from '../lib/types';
import { game } from './game-builder';

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
    expect(nonLeague.countsFor, 'tests/game-builder.ts: a non-league game').toBeNull();
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
    expect(upcoming.countsFor, 'tests/game-builder.ts: a counted league game').not.toBeNull();
    expect(scoreDayInputs([final, upcoming], [fremontEarlier, final, upcoming, unrelated])).toEqual([
      fremontEarlier,
      final,
      upcoming,
    ]);
  });
});
