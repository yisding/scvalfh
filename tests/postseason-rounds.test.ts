/**
 * `lib/postseason-rounds.ts` roundFromLocation, and the EAL card's results block that reads it
 * (`components/playoffs/unbracketed-view.ts` buildUnbracketedResults; plan final-04, 2026-10-29). The location
 * strings are MaxPreps' own: the 2025 Super Regional rows said "Semi Final" and "Championship Final" (both on
 * Sat Nov 1, entered the day after; docs/DATA-SOURCES.md §1.4), and the field is a note field, so "Senior Night"
 * and "SCVAL Crossover Game" name no round.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import UnbracketedResults from '../components/playoffs/UnbracketedResults';
import { NO_UNBRACKETED_GAME, buildUnbracketedResults } from '../components/playoffs/unbracketed-view';
import { roundFromLocation, withLocationRound } from '../lib/postseason-rounds';
import type { Game, PostseasonTag } from '../lib/types';
import { game as built } from './game-builder';
import { textOf } from './ui/html-text';

const LIB = 'lib/postseason-rounds.ts';
const VIEW = 'components/playoffs/unbracketed-view.ts';

describe('roundFromLocation', () => {
  it('reads the four rounds MaxPreps’ location field can name', () => {
    expect(roundFromLocation('Semi Final'), LIB).toBe('semifinal');
    expect(roundFromLocation('Semifinal'), LIB).toBe('semifinal');
    expect(roundFromLocation('Quarter Final'), LIB).toBe('quarterfinal');
    expect(roundFromLocation('quarterfinals'), LIB).toBe('quarterfinal');
    expect(roundFromLocation('Championship Final'), LIB).toBe('final');
    expect(roundFromLocation('Championship'), LIB).toBe('final');
    expect(roundFromLocation('Final'), LIB).toBe('final');
    expect(roundFromLocation('Third Place'), LIB).toBe('third-place');
    expect(roundFromLocation('Consolation Final'), LIB).toBe('third-place');
  });

  it('adds the round to a tournament’s label, as the game page’s kicker and the "This week" strip print it', () => {
    expect(withLocationRound('EAL Super Regional', 'Semi Final'), LIB).toBe('EAL Super Regional semifinal');
    expect(withLocationRound('EAL Super Regional', 'Championship Final'), LIB).toBe('EAL Super Regional final');
    expect(withLocationRound('EAL Super Regional', 'Consolation'), LIB).toBe('EAL Super Regional third-place game');
    expect(withLocationRound('EAL Super Regional', 'Senior Night'), LIB).toBe('EAL Super Regional');
    expect(withLocationRound('EAL Super Regional', null), LIB).toBe('EAL Super Regional');
  });

  it('reads a note that names no round as null', () => {
    for (const text of ['Senior Night', 'SCVAL Crossover Game', 'Too be rescheduled', '', '   ', null, undefined]) {
      expect(roundFromLocation(text), `${LIB}: ${JSON.stringify(text)}`).toBeNull();
    }
  });
});

const SR: PostseasonTag = { kind: 'league-postseason', leagueId: 'eal', via: 'league-postseason-window' };

function eal(away: string, home: string, date: string, location: string | null, score?: [number, number]): Game {
  const g = built({ away, home, date, league: false, postseason: SR, official: null, ...(score ? { as: score[0], hs: score[1] } : {}) });
  return { ...g, venue: { text: location } };
}

describe('buildUnbracketedResults (the EAL card on /playoffs)', () => {
  it('says no game is listed yet, in one sentence, when MaxPreps has none', () => {
    const view = buildUnbracketedResults('eal', []);
    expect(view, VIEW).toEqual({ days: [], finals: 0, toCome: 0, empty: NO_UNBRACKETED_GAME });
    expect(NO_UNBRACKETED_GAME).toBe('No Super Regional game is on MaxPreps yet; in 2025 the results were entered the day after.');
    const html = renderToStaticMarkup(createElement(UnbracketedResults, { view, idPrefix: 'eal' }));
    expect(textOf(html).trim(), 'components/playoffs/UnbracketedResults.tsx').toBe(NO_UNBRACKETED_GAME);
  });

  it('lists the league’s Super Regional games by day, headed by the rounds their rows name', () => {
    const semi1 = eal('chico', 'davis', '2026-10-31', 'Semi Final', [1, 2]);
    const semi2 = eal('corning', 'pleasant-valley', '2026-10-31', 'Semi Final');
    const fin = eal('davis', 'pleasant-valley', '2026-10-31', 'Championship Final');
    const unnamed = eal('chico', 'corning', '2026-11-01', null);
    // Not the EAL's: an untagged game between two EAL teams, and another league's postseason game.
    const untagged = { ...built({ away: 'chico', home: 'davis', date: '2026-10-30', league: false, postseason: null, official: null }) };
    const other = built({ away: 'redwood', home: 'tamalpais', date: '2026-10-30', league: false, official: null,
      postseason: { kind: 'mcal-tournament', leagueId: 'mcal', via: 'league-postseason-window' } });
    const view = buildUnbracketedResults('eal', [fin, unnamed, semi2, semi1, untagged, other]);
    expect(view.days.map((d) => [d.dateLabel, d.label, d.games.length]), VIEW).toEqual([
      ['Sat Oct 31', 'Semifinals and final', 3],
      ['Sun Nov 1', null, 1],
    ]);
    expect(view.finals, VIEW).toBe(1);
    expect(view.toCome, VIEW).toBe(3);
    expect(view.empty, VIEW).toBeNull();
    const html = renderToStaticMarkup(createElement(UnbracketedResults, { view, idPrefix: 'eal' }));
    const text = textOf(html);
    expect(text, 'components/playoffs/UnbracketedResults.tsx').toContain('Semifinals and final · Sat Oct 31');
    expect(text).toContain('Sun Nov 1');
    expect(html).toContain('id="eal-results-2026-10-31"');
    expect(text).not.toMatch(/\bCCS\b|\b(\d+(st|nd|rd|th)|No\. ?\d+|top|first|second) seed(ed)?\b/i);
  });

  it('heads a day by its one round when every row names it', () => {
    const view = buildUnbracketedResults('eal', [eal('chico', 'davis', '2026-10-31', 'Semi Final')]);
    expect(view.days[0].label, VIEW).toBe('Semifinals');
  });
});
