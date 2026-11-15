/**
 * lib/sources/vnn-ics.ts — decideVnn + applyVnnDecision against the composed applyVnnEvents, on the scenarios
 * tests/vnn-ics.test.ts runs.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyVnnDecision, applyVnnEvents, decideVnn, parseVnnIcs } from '../lib/sources/vnn-ics';
import type { Game } from '../lib/types';
import { REPO, game } from './helpers';

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

describe('decideVnn + applyVnnDecision equal applyVnnEvents', () => {
  for (const [name, games] of Object.entries(scenarios)) {
    it(`for ${name}`, () => {
      const d = decideVnn(games, varsity);
      const whole = applyVnnEvents(games, varsity);
      const composed = games.map((g) => {
        const decision = d.decisions.get(g.contestId);
        return decision ? applyVnnDecision(g, decision) : g;
      });
      expect(composed).toEqual(whole.games);
      expect(d.warnings).toEqual(whole.warnings);
      expect([d.venuesAdded, d.timesConfirmed, d.unmatched]).toEqual([whole.venuesAdded, whole.timesConfirmed, whole.unmatched]);
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
