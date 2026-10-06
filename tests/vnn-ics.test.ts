/**
 * lib/sources/vnn-ics.ts — the VNN / PlayOn "Mascot Media Bolt" school calendars (SPEC §1.5).
 *
 * `tests/fixtures/vnn/palo-alto-excerpt.ics` is a trimmed excerpt of the REAL Palo Alto feed
 * (siteId 2635290): four Varsity and two JV field-hockey VEVENTs plus the real VCALENDAR header.
 * The Los Gatos naming variant ("Santa Clara", not "Santa Clara High School") is covered inline.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  VNN_SITE_IDS,
  VNN_SUMMARY_RE,
  applyVnnEvents,
  carryVnnForward,
  icsInstant,
  parseVnnIcs,
  vnnIcsUrl,
} from '../lib/sources/vnn-ics';
import { REPO, game } from './helpers';

const paly = readFileSync(path.join(REPO, 'tests', 'fixtures', 'vnn', 'palo-alto-excerpt.ics'), 'utf8');
const events = parseVnnIcs(paly, 'palo-alto');

describe('vnn: constants', () => {
  it('knows only the two verified siteIds and builds the whole-school /0/ path', () => {
    expect(VNN_SITE_IDS.map((s) => [s.slug, s.siteId])).toEqual([
      ['palo-alto', '2635290'],
      ['los-gatos', '2634860'],
    ]);
    expect(vnnIcsUrl('2635290')).toBe(
      'https://mmboltapi.azurewebsites.net/api/v2/events/calendar/2635290/0/calendar.ics',
    );
  });
});

describe('vnn: the corrected SUMMARY regex', () => {
  it('matches JV, which the original "Junior Varsity" regex silently dropped', () => {
    // 🚨 The bug: 8 of Paly's 19 field-hockey events are JV, i.e. 42 % of the data.
    expect(VNN_SUMMARY_RE.test('Girls JV Field Hockey at Santa Clara High School')).toBe(true);
    expect(VNN_SUMMARY_RE.test('Girls Junior Varsity Field Hockey at Santa Clara High School')).toBe(false);
    expect(events.filter((e) => e.level === 'JV')).toHaveLength(2);
    expect(events.filter((e) => e.level === 'Varsity')).toHaveLength(4);
  });

  it('reads vs as home and at as away, relative to the calendar\'s own school', () => {
    const away = events.find((e) => e.opponentSlug === 'santa-clara' && e.level === 'Varsity');
    expect(away?.site).toBe('away');
    expect(away?.venue).toBe('Santa Clara High School');
    const home = events.find((e) => e.opponentSlug === 'monta-vista' && e.level === 'Varsity');
    expect(home?.site).toBe('home');
    expect(home?.venue).toBe('Palo Alto High School');
  });

  it('ignores every non-field-hockey event in a 160-event whole-school feed', () => {
    const mixed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART:20260929T230000Z',
      'SUMMARY:Girls Varsity Volleyball at Gunn High School',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTSTART:20260929T230000Z',
      'SUMMARY:Girls Varsity Field Hockey at Santa Clara High School',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(parseVnnIcs(mixed, 'palo-alto')).toHaveLength(1);
  });
});

describe('vnn: Zulu timestamps become Pacific', () => {
  it('converts DTSTART:20260929T230000Z to Sep 29, 4:00 PM PDT', () => {
    expect(icsInstant('20260929T230000Z')).toBe('2026-09-29T23:00:00.000Z');
    const first = events.find((e) => e.startUtc === '2026-09-29T23:00:00.000Z');
    expect(first?.startLocal).toBe('2026-09-29T16:00:00');
    expect(first?.dateKey).toBe('2026-09-29');
  });

  it('returns null for a date-only DTSTART rather than guessing midnight', () => {
    expect(icsInstant('20261107')).toBeNull();
  });
});

describe('vnn: opponent naming differs per school', () => {
  it('resolves both the Paly and the Los Gatos spelling', () => {
    const lg = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:1@mmboltapi.azurewebsites.net',
      'DTSTART:20261001T230000Z',
      'SUMMARY:Girls Varsity Field Hockey vs Santa Clara',
      'LOCATION:Los Gatos High School',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:2@mmboltapi.azurewebsites.net',
      'DTSTART:20261008T230000Z',
      'SUMMARY:Girls Varsity Field Hockey vs Archbishop Mitty',
      'LOCATION:Los Gatos High School',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const parsed = parseVnnIcs(lg, 'los-gatos');
    expect(parsed.map((e) => e.opponentSlug)).toEqual(['santa-clara', 'mitty']);
    expect(parsed.map((e) => e.site)).toEqual(['home', 'home']);
  });

  // La Jolla was the outsider here until the San Diego Section joined the registry: it now resolves to
  // its registry team, and a school outside the registry (Harvard-Westlake, a Southern Section
  // independent covered only as an opponent) stays a bare name.
  it('resolves a San Diego Section opponent and keeps a non-registry opponent as a name with no slug', () => {
    const ics = (summary: string) =>
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART:20260827T230000Z',
        `SUMMARY:Girls Varsity Field Hockey vs ${summary}`,
        'LOCATION:Palo Alto High School',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
    const [laJolla] = parseVnnIcs(ics('La Jolla High School'), 'palo-alto');
    expect(laJolla.opponentName).toBe('La Jolla High School');
    expect(laJolla.opponentSlug).toBe('la-jolla');
    const [outsider] = parseVnnIcs(ics('Harvard-Westlake School'), 'palo-alto');
    expect(outsider.opponentName).toBe('Harvard-Westlake School');
    expect(outsider.opponentSlug).toBeNull();
  });
});

describe('vnn: applying venue and start time', () => {
  const varsity = events.filter((e) => e.level === 'Varsity');

  it('fills venue.name where MaxPreps has none and confirms a matching time', () => {
    const g = game({ home: 'santa-clara', away: 'palo-alto', status: 'scheduled', date: '2026-09-29' });
    const res = applyVnnEvents([{ ...g, dateLocal: '2026-09-29T16:00:00' }], varsity);
    expect(res.venuesAdded).toBe(1);
    expect(res.timesConfirmed).toBe(1);
    expect(res.games[0].venue.name).toBe('Santa Clara High School');
    expect(res.games[0].timeConfirmed).toBe(true);
    // `venue.text` is MaxPreps' NOTE field and is left exactly as it was.
    expect(res.games[0].venue.text).toBeNull();
  });

  it('never overwrites a venue MaxPreps already has', () => {
    const g = game({ home: 'santa-clara', away: 'palo-alto', status: 'scheduled', date: '2026-09-29' });
    const withVenue = {
      ...g,
      dateLocal: '2026-09-29T16:00:00',
      venue: { text: null, name: 'Townsend Field' },
    };
    const res = applyVnnEvents([withVenue], varsity);
    expect(res.venuesAdded).toBe(0);
    expect(res.games[0].venue.name).toBe('Townsend Field');
  });

  it('reports a time disagreement instead of rewriting dateLocal', () => {
    const g = game({ home: 'santa-clara', away: 'palo-alto', status: 'scheduled', date: '2026-09-29' });
    const res = applyVnnEvents([{ ...g, dateLocal: '2026-09-29T15:30:00' }], varsity);
    expect(res.timesConfirmed).toBe(0);
    expect(res.games[0].timeConfirmed).toBeUndefined();
    expect(res.games[0].dateLocal).toBe('2026-09-29T15:30:00');
    expect(res.warnings.some((w) => /MaxPreps 15:30 PT/.test(w))).toBe(true);
  });

  it('reports, but does not fill, a TBA MaxPreps time', () => {
    const g = game({ home: 'santa-clara', away: 'palo-alto', status: 'scheduled', date: '2026-09-29' });
    const res = applyVnnEvents(
      [{ ...g, dateLocal: '2026-09-29T00:00:00', isTimeTba: true }],
      varsity,
    );
    expect(res.games[0].timeConfirmed).toBeUndefined();
    expect(res.games[0].dateLocal).toBe('2026-09-29T00:00:00');
    expect(res.warnings.some((w) => /time is TBA/.test(w))).toBe(true);
  });

  it('never applies a JV event to the varsity snapshot', () => {
    const jv = events.filter((e) => e.level === 'JV');
    const g = game({ home: 'santa-clara', away: 'palo-alto', status: 'scheduled', date: jv[0].dateKey });
    const res = applyVnnEvents([g], jv);
    expect(res.venuesAdded).toBe(0);
    expect(res.games[0].venue.name).toBeUndefined();
  });

  it('counts varsity events that matched no contest', () => {
    const res = applyVnnEvents([], varsity);
    expect(res.unmatched).toBe(varsity.length);
  });
});

describe('vnn-ics: SPEC §5.3 per-site carry-forward', () => {
  /** One Palo Alto game and one Los Gatos game, both already annotated from their own calendars. */
  const previousGames = [
    {
      ...game({ home: 'palo-alto', away: 'saratoga', status: 'scheduled', date: '2026-10-02' }),
      venue: { text: null, name: 'Paly Field' },
      timeConfirmed: true,
    },
    {
      ...game({ home: 'los-gatos', away: 'lynbrook', status: 'scheduled', date: '2026-10-03' }),
      venue: { text: null, name: 'Los Gatos Field' },
      timeConfirmed: true,
    },
  ];
  /** The SAME contests as a run whose calendars added nothing: no venue name, no confirmed time. */
  const freshGames = () =>
    previousGames.map((g) => ({ ...g, venue: { text: null }, timeConfirmed: undefined }));

  it('restores ONLY the school whose feed failed', () => {
    const res = carryVnnForward(['palo-alto'], previousGames, freshGames());
    expect(res.carried).toBe(1);
    const paly = res.games.find((g) => g.home.slug === 'palo-alto');
    const gatos = res.games.find((g) => g.home.slug === 'los-gatos');
    expect(paly?.venue.name).toBe('Paly Field');
    expect(paly?.timeConfirmed).toBe(true);
    // Los Gatos answered this run, so what this run said about it stands.
    expect(gatos?.venue.name).toBeUndefined();
    expect(gatos?.timeConfirmed).toBeUndefined();
  });

  it('restores both when neither calendar answered', () => {
    const res = carryVnnForward(['palo-alto', 'los-gatos'], previousGames, freshGames());
    expect(res.carried).toBe(2);
  });

  it('does nothing when both calendars answered', () => {
    const res = carryVnnForward([], previousGames, freshGames());
    expect(res.carried).toBe(0);
    expect(res.games.every((g) => g.venue.name === undefined)).toBe(true);
  });

  it('never overwrites a venue this run produced', () => {
    const thisRun = freshGames().map((g) =>
      g.home.slug === 'palo-alto' ? { ...g, venue: { text: null, name: 'Gunn Field' } } : g,
    );
    const res = carryVnnForward(['palo-alto'], previousGames, thisRun);
    expect(res.games.find((g) => g.home.slug === 'palo-alto')?.venue.name).toBe('Gunn Field');
    // …and the confirmed start time still comes back, because that hole is still a hole.
    expect(res.carried).toBe(1);
  });
});
