import { describe, expect, it } from 'vitest';

import {
  EM_DASH,
  EN_DASH,
  MINUS,
  clockTime,
  dateSpan,
  dateWithYear,
  dayDiff,
  dayNumber,
  formStripLabel,
  gameWhen,
  gradeWord,
  hoursBetween,
  isoDateKey,
  leagueClock,
  leagueClockPT,
  listWords,
  localDateKey,
  longDate,
  matchupJoiner,
  monthDay,
  numberWord,
  ordinal,
  ordinalPlace,
  ordinalWord,
  partialDate,
  partialDateKind,
  perGame,
  recordString,
  recordWords,
  renderScore,
  scoreGlyph,
  scoreSentence,
  shiftDateKey,
  shortDate,
  sideOutcome,
  signedGd,
  streakString,
  timeOfDay,
  timeOfDayPT,
  toLocalTimestamp,
  weekdayName,
  winPct,
} from '../lib/format';
import { game } from './helpers';

describe('format: dates and times are America/Los_Angeles', () => {
  it('formats a short date, a month-day and a long date', () => {
    expect(shortDate('2026-09-29T16:00:00')).toBe('Tue Sep 29');
    expect(monthDay('2026-09-29T16:00:00')).toBe('Sep 29');
    expect(longDate('2026-09-29T16:00:00')).toBe('Tuesday, September 29');
    expect(dateWithYear('2026-10-30T15:30:00')).toBe('Oct 30, 2026');
  });

  it('formats a time in 12-hour clock with a PT label', () => {
    expect(timeOfDay('2026-09-29T16:00:00')).toBe('4:00 PM');
    expect(timeOfDay('2026-09-12T11:00:00')).toBe('11:00 AM');
    expect(timeOfDay('2026-10-12T15:30:00')).toBe('3:30 PM');
    expect(timeOfDay('2026-09-26T00:00:00')).toBe('12:00 AM');
    expect(timeOfDay('2026-09-26T12:05:00')).toBe('12:05 PM');
    expect(timeOfDayPT('2026-09-29T16:00:00')).toBe('4:00 PM PT');
  });

  it('derives an ISO date key without touching the machine time zone', () => {
    expect(isoDateKey('2026-09-29T16:00:00')).toBe('2026-09-29');
    expect(isoDateKey('2026-09-29')).toBe('2026-09-29');
  });

  it('converts a UTC instant to the local date and stamp', () => {
    // 15:00Z on Sep 29 is 08:00 PDT the same day; 03:00Z on Sep 29 is 20:00 PDT on Sep 28.
    expect(localDateKey('2026-09-29T15:00:00.000Z')).toBe('2026-09-29');
    expect(localDateKey('2026-09-29T03:00:00.000Z')).toBe('2026-09-28');
    expect(toLocalTimestamp('2026-09-29T15:00:00.000Z')).toBe('2026-09-29T08:00:00');
    // And across the PST boundary in November.
    expect(localDateKey('2026-11-14T07:30:00.000Z')).toBe('2026-11-13');
  });

  it('measures hours between two instants', () => {
    expect(hoursBetween('2026-09-29T00:00:00Z', '2026-09-30T12:00:00Z')).toBe(36);
  });

  it('describes when a game is played, including TBA', () => {
    expect(gameWhen({ dateLocal: '2026-09-29T16:00:00', isTimeTba: false, isDateTba: false })).toBe(
      'Tue Sep 29, 4:00 PM PT',
    );
    expect(gameWhen({ dateLocal: '2026-09-29T16:00:00', isTimeTba: true, isDateTba: false })).toBe(
      'Tue Sep 29, time TBA',
    );
    expect(gameWhen({ dateLocal: '2026-09-29T16:00:00', isTimeTba: true, isDateTba: true })).toBe(
      'Date TBA',
    );
  });

  it('rejects a value that is not a local timestamp', () => {
    expect(() => shortDate('yesterday')).toThrow();
  });
});

describe('format: records and numbers', () => {
  it('writes a W-L-T record', () => {
    expect(recordString({ w: 4, l: 1, t: 0 })).toBe('4-1-0');
  });

  it('writes a record in words, singular for exactly one', () => {
    expect(recordWords({ w: 5, l: 1, t: 0 })).toBe('5 wins, 1 loss, 0 ties');
    expect(recordWords({ w: 1, l: 2, t: 1 })).toBe('1 win, 2 losses, 1 tie');
    expect(recordWords({ w: 0, l: 0, t: 0 })).toBe('0 wins, 0 losses, 0 ties');
  });

  it('always signs a goal differential and uses a real minus sign', () => {
    expect(signedGd(30)).toBe('+30');
    expect(signedGd(-24)).toBe(`${MINUS}24`);
    expect(signedGd(0)).toBe('0');
    expect(signedGd(null)).toBe(EM_DASH);
  });

  it('drops the leading zero from a win percentage', () => {
    expect(winPct(0.625)).toBe('.625');
    expect(winPct(1)).toBe('1.000');
    expect(winPct(0)).toBe('.000');
  });

  it('keeps a genuine zero as 0.0 per game and a null as an em dash', () => {
    expect(perGame(0, 5)).toBe('0.0');
    expect(perGame(9, 4)).toBe('2.3');
    expect(perGame(null, 4)).toBe(EM_DASH);
    expect(perGame(3, 0)).toBe(EM_DASH);
  });

  it('writes ordinals and an em dash for a team with no results', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st',
    ]);
    expect(ordinalPlace(3)).toBe('3rd');
    expect(ordinalPlace(8, false)).toBe(EM_DASH);
  });

  it('tells a real 0 apart from a missing score', () => {
    expect(scoreGlyph(0)).toBe('0');
    expect(scoreGlyph(null)).toBe(EN_DASH);
  });

  it('writes a streak and a form-strip sentence', () => {
    expect(streakString({ count: 5, result: 'W' })).toBe('W5');
    expect(streakString({ count: 1, result: 'L' })).toBe('L1');
    expect(streakString(null)).toBe(EM_DASH);
    expect(formStripLabel(['L', 'L', 'W'])).toBe(
      'Last 3 league games, oldest first: loss, loss, win.',
    );
    expect(formStripLabel([])).toBe('No league results yet.');
  });
});

describe('format: renderScore is the only place scores are read (DESIGN §5.2)', () => {
  it('returns a final with the outcome relative to the home side', () => {
    const view = renderScore(game({ home: 'saint-francis', away: 'homestead', hs: 7, as: 0 }));
    expect(view).toEqual({
      kind: 'final',
      home: 7,
      away: 0,
      outcome: 'W',
      decider: 'REG',
      shootout: null,
    });
  });

  it('returns a genuine 0-0 final as a tie, not as an empty state', () => {
    const view = renderScore(game({ home: 'cupertino', away: 'fremont', hs: 0, as: 0 }));
    expect(view.kind).toBe('final');
    if (view.kind === 'final') {
      expect([view.home, view.away]).toEqual([0, 0]);
      expect(view.outcome).toBe('T');
    }
  });

  it('marks an overtime final', () => {
    const view = renderScore(game({ home: 'los-gatos', away: 'mitty', hs: 2, as: 1, ot: 1 }));
    expect(view.kind === 'final' && view.decider).toBe('OT');
  });

  it('marks a forfeit', () => {
    const view = renderScore(
      game({ home: 'cupertino', away: 'fremont', hs: 1, as: 0, forfeit: true }),
    );
    expect(view.kind === 'final' && view.decider).toBe('FORFEIT');
  });

  it('never returns numbers for a scheduled, pending, live or postponed game', () => {
    for (const status of ['scheduled', 'score-pending', 'live', 'postponed'] as const) {
      const view = renderScore(game({ home: 'cupertino', away: 'fremont', status }));
      expect(view.kind).not.toBe('final');
      expect(JSON.stringify(view)).not.toMatch(/"home":0/);
    }
    const scheduled = renderScore(game({ home: 'cupertino', away: 'fremont', status: 'scheduled' }));
    expect(scheduled).toEqual({ kind: 'scheduled', time: '4:00 PM' });
    expect(renderScore(game({ home: 'cupertino', away: 'fremont', status: 'score-pending' }))).toEqual(
      { kind: 'unreported' },
    );
  });

  it('writes a screen-reader sentence for every state', () => {
    expect(scoreSentence(game({ home: 'saint-francis', away: 'homestead', hs: 7, as: 0 }))).toBe(
      'Saint Francis 7, Homestead 0, final.',
    );
    expect(
      scoreSentence(game({ home: 'cupertino', away: 'fremont', status: 'score-pending' })),
    ).toMatch(/score not reported/);
    expect(scoreSentence(game({ home: 'cupertino', away: 'fremont', status: 'scheduled' }))).toMatch(
      /4:00 PM PT/,
    );
  });

  it('joins away and home with at, or vs at a neutral site', () => {
    const g = game({ home: 'cupertino', away: 'fremont', hs: 1, as: 0 });
    expect(matchupJoiner(g)).toBe('at');
    expect(matchupJoiner({ ...g, site: 'neutral' })).toBe('vs');
  });
});

describe('format: sideOutcome, the one W/L/T derivation', () => {
  // Chico 1, Davis 1 on 2026-09-28, flagged Chico W / Davis L: a 1 v 1 win (decider 'SO', no tally).
  const oneVOne = game({ home: 'chico', away: 'davis', hs: 1, as: 1, date: '2026-09-28', results: { home: 'W', away: 'L' } });

  it('reads a decided final off the score, and a level one as a tie', () => {
    const g = game({ home: 'saint-francis', away: 'homestead', hs: 7, as: 0 });
    expect([sideOutcome(g, 'home'), sideOutcome(g, 'away')]).toEqual(['W', 'L']);
    const level = game({ home: 'cupertino', away: 'fremont', hs: 0, as: 0 });
    expect([sideOutcome(level, 'home'), sideOutcome(level, 'away')]).toEqual(['T', 'T']);
  });

  it('gives a 1 v 1 win to the flagged side, level goals and all', () => {
    expect(oneVOne.decider).toBe('SO');
    expect(oneVOne.shootout).toBeNull();
    expect([sideOutcome(oneVOne, 'home'), sideOutcome(oneVOne, 'away')]).toEqual(['W', 'L']);
    const awayWin = game({ home: 'chico', away: 'davis', hs: 1, as: 1, results: { home: 'L', away: 'W' } });
    expect([sideOutcome(awayWin, 'home'), sideOutcome(awayWin, 'away')]).toEqual(['L', 'W']);
  });

  it('lets a stored tally decide, and reads an SO decider without complementary flags off the score', () => {
    const tally = { ...oneVOne, shootout: { home: 2, away: 4 } };
    expect([sideOutcome(tally, 'home'), sideOutcome(tally, 'away')]).toEqual(['L', 'W']);
    const unflagged = { ...oneVOne, home: { ...oneVOne.home, result: 'T' as const }, away: { ...oneVOne.away, result: 'T' as const } };
    expect([sideOutcome(unflagged, 'home'), sideOutcome(unflagged, 'away')]).toEqual(['T', 'T']);
  });

  it('never reads flags without the SO decider: an MCAL 1-1 flagged W/L is a tie', () => {
    const mcal = game({ home: 'redwood', away: 'tamalpais', hs: 1, as: 1, results: { home: 'W', away: 'L' } });
    expect(mcal.decider).toBe('REG');
    expect([sideOutcome(mcal, 'home'), sideOutcome(mcal, 'away')]).toEqual(['T', 'T']);
  });

  it('is null unless the game is final with two scores', () => {
    for (const status of ['scheduled', 'score-pending', 'live', 'postponed'] as const) {
      expect(sideOutcome(game({ home: 'chico', away: 'davis', status }), 'home')).toBeNull();
    }
  });

  it('renders a 1 v 1 win as a level final the home side won, and says who won on 1 v 1s', () => {
    expect(renderScore(oneVOne)).toEqual({ kind: 'final', home: 1, away: 1, outcome: 'W', decider: 'SO', shootout: null });
    expect(scoreSentence(oneVOne)).toBe('Chico 1, Davis 1, final; Chico won on 1 v 1s.');
    const awayWin = game({ home: 'chico', away: 'davis', hs: 1, as: 1, results: { home: 'L', away: 'W' } });
    expect(renderScore(awayWin)).toMatchObject({ kind: 'final', outcome: 'L', decider: 'SO' });
    expect(scoreSentence(awayWin)).toBe('Chico 1, Davis 1, final; Davis won on 1 v 1s.');
  });

  it('drops “after overtime” when asked (an overtime count that cannot be right)', () => {
    // 2026-09-02 PV @ Chico: 1-0 with MaxPreps’ 3 overtime periods.
    const g = game({ home: 'chico', away: 'pleasant-valley', hs: 0, as: 1, ot: 3 });
    expect(scoreSentence(g)).toBe('Chico 0, Pleasant Valley 1, final after overtime.');
    expect(scoreSentence(g, { quietOvertime: true })).toBe('Chico 0, Pleasant Valley 1, final.');
    const forfeit = game({ home: 'cupertino', away: 'fremont', hs: 1, as: 0, forfeit: true });
    expect(scoreSentence(forfeit, { quietOvertime: true })).toBe('Cupertino 1, Fremont 0, final by forfeit.');
  });
});

describe('numberWord and dateSpan', () => {
  it('words zero to ten and prints anything else as digits', () => {
    expect([0, 1, 6, 10].map(numberWord)).toEqual(['zero', 'one', 'six', 'ten']);
    expect([11, 49, -1, 2.5].map(numberWord)).toEqual(['11', '49', '-1', '2.5']);
  });

  it('words an ordinal to tenth and prints anything past it as digits', () => {
    expect([1, 4, 7, 10, 11, 22].map(ordinalWord)).toEqual(['first', 'fourth', 'seventh', 'tenth', '11th', '22nd']);
  });

  it('words ordinals zeroth to tenth and falls back to ordinal() past them', () => {
    expect([0, 1, 4, 9, 10].map(ordinalWord)).toEqual(['zeroth', 'first', 'fourth', 'ninth', 'tenth']);
    expect([11, 21, 23].map(ordinalWord)).toEqual(['11th', '21st', '23rd']);
  });

  it('names the weekday of a date key or a local timestamp', () => {
    expect(weekdayName('2026-10-31')).toBe('Saturday');
    expect(weekdayName('2026-09-29T16:00:00')).toBe('Tuesday');
  });

  it('spans two dates with an en dash, naming the month once within a month', () => {
    expect(dateSpan('2026-10-30', '2026-10-31')).toBe('Oct 30–31');
    expect(dateSpan('2026-10-30', '2026-11-01')).toBe('Oct 30–Nov 1');
    expect(dateSpan('2026-10-30', '2026-10-30')).toBe('Oct 30');
    expect(dateSpan('2026-10-30', '2026-10-31')).toContain(EN_DASH);
  });
});

describe('leagueClock', () => {
  it('reads a config HH:MM, dropping :00 from a whole hour', () => {
    expect(leagueClock('11:00')).toBe('11 AM');
    expect(leagueClock('16:30')).toBe('4:30 PM');
    expect(leagueClock('12:05')).toBe('12:05 PM');
    expect(leagueClock('00:00')).toBe('12 AM');
    expect(leagueClockPT('11:00')).toBe('11 AM PT');
  });
});

describe('clockTime', () => {
  it('drops the meridiem for the dense row’s narrow leading column', () => {
    expect(clockTime('2026-09-24T17:30:00')).toBe('5:30');
    expect(clockTime('2026-09-24T16:00:00')).toBe('4:00');
    expect(clockTime('2026-09-24T12:05:00')).toBe('12:05');
    expect(clockTime('2026-09-24T00:15:00')).toBe('12:15');
    // The full time is still what every accessible sentence carries.
    expect(timeOfDayPT('2026-09-24T17:30:00')).toBe('5:30 PM PT');
  });
});

describe('partialDate: the five shapes of a hand-researched date (data/clubs.json asOf)', () => {
  it('words a day, a month, a year, a season and a range', () => {
    expect(partialDate('2026-07-08')).toBe('Jul 8, 2026');
    expect(partialDate('2025-10')).toBe('Oct 2025');
    expect(partialDate('2025')).toBe('2025');
    expect(partialDate('2025-26')).toBe('2025-26 season');
    expect(partialDate('2015-2018')).toBe(`2015${EN_DASH}2018`);
    expect(['2026-07-08', '2025-10', '2025', '2025-26', '2015-2018'].map(partialDateKind)).toEqual([
      'day',
      'month',
      'year',
      'season',
      'range',
    ]);
  });

  it('reads YYYY-MM as a month when MM is 01-12 (isAsOf’s order), a season only by the +1 rule', () => {
    expect(partialDateKind('2025-12')).toBe('month');
    expect(partialDateKind('1999-00')).toBe('season');
    expect(partialDate('2099-00')).toBe('2099-00 season');
  });

  it('throws on anything else, rather than printing a guess', () => {
    for (const bad of ['2025-27', '2025-13', '2025/26', '2018-2015', '2026-02-31x', '2026-13-01', 'Fall 2025', '']) {
      expect(() => partialDate(bad), bad).toThrow(/not a partial date/);
    }
  });
});

describe('gradeWord', () => {
  it('words grades 9-12 and prints any other as its number', () => {
    expect([9, 10, 11, 12].map(gradeWord)).toEqual(['Freshman', 'Sophomore', 'Junior', 'Senior']);
    expect(gradeWord(8)).toBe('Grade 8');
  });
});

describe('listWords', () => {
  it('joins names the way a sentence does, with "and" by default', () => {
    expect(listWords([])).toBe('');
    expect(listWords(['Cupertino'])).toBe('Cupertino');
    expect(listWords(['Cupertino', 'Homestead'])).toBe('Cupertino and Homestead');
    expect(listWords(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('joins every contender for one seat with "or"', () => {
    expect(listWords(['Cupertino'], 'or')).toBe('Cupertino');
    expect(listWords(['A', 'B'], 'or')).toBe('A or B');
    expect(listWords(['A', 'B', 'C'], 'or')).toBe('A, B or C');
  });

  it('joins a compact leader line with "&"', () => {
    expect(listWords([], '&')).toBe('');
    expect(listWords(['A', 'B'], '&')).toBe('A & B');
    expect(listWords(['A', 'B', 'C'], '&')).toBe('A, B & C');
  });
});

describe('day arithmetic on date keys', () => {
  it('counts whole days, ignoring a time suffix', () => {
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('2026-09-29T16:00:00')).toBe(dayNumber('2026-09-29'));
    expect(dayDiff('2026-09-30', '2026-10-01')).toBe(1);
    expect(dayDiff('2026-10-01', '2026-09-17')).toBe(-14);
  });

  it('shifts a key across month and year ends', () => {
    expect(shiftDateKey('2026-10-02', -14)).toBe('2026-09-18');
    expect(shiftDateKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDateKey('2027-01-01', -1)).toBe('2026-12-31');
  });
});
