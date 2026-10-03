import { describe, expect, it } from 'vitest';

import {
  EM_DASH,
  EN_DASH,
  MINUS,
  clockTime,
  dateWithYear,
  formStripLabel,
  gameWhen,
  gradeWord,
  hoursBetween,
  isoDateKey,
  localDateKey,
  longDate,
  monthDay,
  ordinal,
  ordinalPlace,
  partialDate,
  partialDateKind,
  perGame,
  recordString,
  recordWords,
  renderScore,
  scoreGlyph,
  scoreSentence,
  shortDate,
  signedGd,
  streakString,
  timeOfDay,
  timeOfDayPT,
  toLocalTimestamp,
  versusLabel,
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

  it('says vs or at from one team point of view', () => {
    const g = game({ home: 'cupertino', away: 'fremont', hs: 1, as: 0 });
    expect(versusLabel(g, g.home.teamId!)).toBe('vs');
    expect(versusLabel(g, g.away.teamId!)).toBe('at');
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
