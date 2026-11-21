/**
 * lib/sources/teamsideline.ts against three captured valleyal.org pages (2026-11-21): the girls soccer 7th/8th and
 * 6th/7th schedules before a game is played, and the 8th grade boys basketball schedule after its playoffs, the one
 * with scores, bold winners, comments and a filled bracket.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { clock24, parseTeamsidelinePage, seasonDate, TeamsidelineParseError } from '../lib/sources/teamsideline';

const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures/teamsideline', name), 'utf8');

const SOCCER_78 = parseTeamsidelinePage(fixture('val-girls-soccer-7th8th-2026-11-21.html'));
const SOCCER_67 = parseTeamsidelinePage(fixture('val-girls-soccer-6th7th-2026-11-21.html'));
const BASKETBALL = parseTeamsidelinePage(fixture('val-boys-basketball-8th-2026-11-21.html'));

describe('parseTeamsidelinePage: a schedule before play', () => {
  it('reads the heading, the level and an empty table with the points column', () => {
    expect(SOCCER_78.title).toBe("Girls' Soccer 26-27");
    expect(SOCCER_78.subtitle).toBe('7th/8th Grade');
    expect(SOCCER_67.subtitle).toBe('6th/7th Grade');
    expect(SOCCER_78.standings).toHaveLength(11);
    expect(SOCCER_78.standings[0]).toEqual({ place: null, team: 'Blach Falcons', w: 0, l: 0, t: 0, gp: 0, pts: 0 });
  });

  it('reads one row per game, the wide grid only: a single round robin of the eleven schools', () => {
    expect(SOCCER_78.games).toHaveLength(55);
    const pairs = new Set(SOCCER_78.games.map((g) => [g.home.name, g.away.name].sort().join('~')));
    expect(pairs.size).toBe(55);
    expect(SOCCER_78.games[0]).toEqual({
      band: 'Week 1',
      monthDay: '12/14',
      time: '16:00',
      home: { name: 'Lawson Lightning', score: null, bold: false },
      away: { name: 'Sunnyvale Spartans', score: null, bold: false },
      location: 'Lawson Field',
      locationUrl: 'http://maps.google.com/maps?li=rwp&q=10401%20Vista%20Drive%2CCupertino%2CCA%2095014',
      comments: [],
      gameLabel: null,
    });
  });

  it('keeps a comment with the game it is printed under', () => {
    const moved = SOCCER_78.games.filter((g) => g.comments.length > 0);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ monthDay: '1/13', home: { name: 'Cupertino Bears' }, away: { name: 'Lawson Lightning' }, comments: ['Moved to 1/13.'] });
  });

  it('reads the playoff schedule with its seeds and placeholders', () => {
    expect(SOCCER_78.playoffs.map((g) => [g.band, g.gameLabel, g.monthDay, g.home.name, g.away.name])).toEqual([
      ['Playoff Round 1', 'G1', '2/1', '4th', '5th'],
      ['Playoff Round 1', 'G2', '2/1', '3rd', '6th'],
      ['Playoff Round 2', 'G3', '2/2', '1st', 'G1 Winner'],
      ['Playoff Round 2', 'G4', '2/2', '2nd', 'G2 Winner'],
      ['Playoff Round 3 - Championship Round', 'G5', '2/4', 'G3 Winner', 'G4 Winner'],
    ]);
  });

  it('the two levels play the same games on the same days, each with the other home', () => {
    const key = (d: string, home: string, away: string) => `${d}|${home}|${away}`;
    const younger = new Set(SOCCER_67.games.map((g) => key(g.monthDay, g.home.name, g.away.name)));
    expect(SOCCER_78.games.every((g) => younger.has(key(g.monthDay, g.away.name, g.home.name)))).toBe(true);
  });
});

describe('parseTeamsidelinePage: a finished schedule', () => {
  it('reads scores, the bold winner, the place column and the tiebreak list', () => {
    expect(BASKETBALL.tieBreakers).toEqual(['Head-To-Head', 'Coin Toss']);
    expect(BASKETBALL.standings[0]).toEqual({ place: 1, team: 'Egan Vikings', w: 9, l: 1, t: 0, gp: 10, pts: null });
    expect(BASKETBALL.games[0]).toMatchObject({
      monthDay: '9/1',
      home: { name: 'Crittenden Panthers', score: 30, bold: false },
      away: { name: 'Sunnyvale Spartans', score: 44, bold: true },
      location: 'Crittenden Gym',
    });
    expect(BASKETBALL.playoffs.at(-1)).toMatchObject({
      gameLabel: 'G5',
      home: { name: 'Egan Vikings', score: 39, bold: false },
      away: { name: 'Blach Falcons', score: 43, bold: true },
    });
  });
});

describe('parseTeamsidelinePage: refusals', () => {
  it('refuses a page with no heading, and one whose row cannot be read', () => {
    expect(() => parseTeamsidelinePage('<html><body>Not found</body></html>')).toThrow(TeamsidelineParseError);
    const html = fixture('val-boys-basketball-8th-2026-11-21.html').replace('>30</span>', '>3O</span>');
    expect(() => parseTeamsidelinePage(html)).toThrow(/not a score/);
  });
});

describe('dates and times', () => {
  it('puts a month before August in the next calendar year', () => {
    expect(seasonDate('12/14', 2026)).toBe('2026-12-14');
    expect(seasonDate('2/4', 2026)).toBe('2027-02-04');
    expect(seasonDate('8/24', 2026)).toBe('2026-08-24');
    expect(() => seasonDate('13/1', 2026)).toThrow(TeamsidelineParseError);
  });

  it('reads a 12-hour clock', () => {
    expect(clock24('4:00 PM')).toBe('16:00');
    expect(clock24('12:15 PM')).toBe('12:15');
    expect(clock24('12:00 AM')).toBe('00:00');
    expect(clock24('TBA')).toBeNull();
  });
});
