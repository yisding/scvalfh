/**
 * lib/sources/vnn-ics.ts — decideVnn's decisions, and applyVnnEvents applying them, on the scenarios
 * tests/vnn-ics.test.ts runs.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { decideVnn, parseVnnIcs } from '../lib/sources/vnn-ics';
import type { Game } from '../lib/types';
import { REPO, game } from './helpers';
import { applyVnnEvents } from './support/list-steps';

const events = parseVnnIcs(readFileSync(path.join(REPO, 'tests', 'fixtures', 'vnn', 'palo-alto-excerpt.ics'), 'utf8'), 'palo-alto');
const varsity = events.filter((e) => e.level === 'Varsity');

const base = game({ home: 'santa-clara', away: 'palo-alto', status: 'scheduled', date: '2026-09-29' });
const scenarios: Record<string, Game[]> = {
  'venue and a confirmed time': [{ ...base, dateLocal: '2026-09-29T16:00:00' }],
  'a venue MaxPreps already has': [{ ...base, dateLocal: '2026-09-29T16:00:00', venue: { text: null, name: 'Townsend Field' } }],
  'a time disagreement': [{ ...base, dateLocal: '2026-09-29T15:30:00' }],
  'a TBA time': [{ ...base, dateLocal: '2026-09-29T00:00:00', isTimeTba: true }],
  'no matching event': [game({ home: 'saratoga', away: 'lynbrook', status: 'scheduled', date: '2026-10-02' })],
  'several games, one matched': [
    game({ home: 'saratoga', away: 'lynbrook', status: 'scheduled', date: '2026-10-02' }),
    { ...base, dateLocal: '2026-09-29T16:00:00' },
    game({ home: 'monta-vista', away: 'saratoga', status: 'scheduled', date: '2026-10-05' }),
  ],
  'no games': [],
};

/** What each scenario decides, written out from the fixture: the Santa Clara home game of 2026-09-29 is the one the calendar lists. */
const venue = 'Santa Clara High School';
const expected: Record<string, { decided: Array<[number, { venueName?: string; timeConfirmed?: true }]>; venues: number; times: number; unmatched: number; warnings: RegExp[] }> = {
  'venue and a confirmed time': { decided: [[0, { venueName: venue, timeConfirmed: true }]], venues: 1, times: 1, unmatched: 3, warnings: [] },
  'a venue MaxPreps already has': { decided: [[0, { timeConfirmed: true }]], venues: 0, times: 1, unmatched: 3, warnings: [] },
  'a time disagreement': { decided: [[0, { venueName: venue }]], venues: 1, times: 0, unmatched: 3, warnings: [/MaxPreps 15:30 PT, palo-alto's calendar 16:00 PT$/] },
  'a TBA time': { decided: [[0, { venueName: venue }]], venues: 1, times: 0, unmatched: 3, warnings: [/MaxPreps time is TBA; palo-alto's calendar says 16:00 PT$/] },
  'no matching event': { decided: [], venues: 0, times: 0, unmatched: 4, warnings: [] },
  'several games, one matched': { decided: [[1, { venueName: venue, timeConfirmed: true }]], venues: 1, times: 1, unmatched: 3, warnings: [] },
  'no games': { decided: [], venues: 0, times: 0, unmatched: 4, warnings: [] },
};

describe('decideVnn decides what the calendar fixture says, and applyVnnEvents applies it', () => {
  for (const [name, games] of Object.entries(scenarios)) {
    it(`for ${name}`, () => {
      const want = expected[name];
      const d = decideVnn(games, varsity);
      expect([...d.decisions]).toEqual(want.decided.map(([i, decision]) => [games[i].contestId, decision]));
      expect([d.venuesAdded, d.timesConfirmed, d.unmatched]).toEqual([want.venues, want.times, want.unmatched]);
      expect(d.warnings).toHaveLength(want.warnings.length);
      want.warnings.forEach((re, i) => expect(d.warnings[i]).toMatch(re));

      const whole = applyVnnEvents(games, varsity);
      expect(whole.games).toHaveLength(games.length);
      games.forEach((g, i) => {
        const decided = want.decided.find(([j]) => j === i);
        if (!decided) return expect(whole.games[i]).toBe(g);
        expect(whole.games[i].timeConfirmed === true).toBe(decided[1].timeConfirmed === true);
        expect(whole.games[i].venue.name).toBe(decided[1].venueName ?? g.venue.name);
        // MaxPreps' own time is never rewritten.
        expect(whole.games[i].dateLocal).toBe(g.dateLocal);
      });
      expect([whole.venuesAdded, whole.timesConfirmed, whole.unmatched]).toEqual([want.venues, want.times, want.unmatched]);
      expect(whole.warnings).toEqual(d.warnings);
    });
  }

  it('for JV events, which decide nothing', () => {
    const jv = events.filter((e) => e.level === 'JV');
    const games = [game({ home: 'santa-clara', away: 'palo-alto', status: 'scheduled', date: jv[0].dateKey })];
    expect(decideVnn(games, jv).decisions.size).toBe(0);
    expect(applyVnnEvents(games, jv).games[0]).toBe(games[0]);
  });
});

describe('a game with no decision', () => {
  it('is returned as the same object', () => {
    const games = scenarios['several games, one matched'];
    const out = applyVnnEvents(games, varsity).games;
    expect(out[0]).toBe(games[0]);
    expect(out[2]).toBe(games[2]);
    expect(out[1]).not.toBe(games[1]);
    // A game whose time disagrees and whose venue is set has a warning but no decision.
    const kept = scenarios['a time disagreement'].map((g) => ({ ...g, venue: { text: null, name: 'Field' } }));
    expect(decideVnn(kept, varsity).decisions.size).toBe(0);
    expect(applyVnnEvents(kept, varsity).games[0]).toBe(kept[0]);
  });
});

describe('decideVnn', () => {
  it('does not mutate its input', () => {
    const games = scenarios['several games, one matched'];
    const before = structuredClone({ games, varsity });
    decideVnn(games, varsity);
    expect({ games, varsity }).toEqual(before);
  });

  it('decides a venue name and a confirmed time as data', () => {
    const d = decideVnn(scenarios['venue and a confirmed time'], varsity);
    expect([...d.decisions.values()]).toEqual([{ venueName: 'Santa Clara High School', timeConfirmed: true }]);
  });
});
