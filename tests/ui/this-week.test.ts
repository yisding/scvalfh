/**
 * `components/playoffs/this-week.ts` buildThisWeek — the "This week in the postseason" strips on /playoffs
 * (plan final-03, 2026-10-29). Synthetic games from the shared builder (tests/game-builder.ts), with the
 * postseason tags set by hand as lib/classify.ts sets them, and `today = '2026-10-29'`, the day the 2026 week
 * looked like this: MCAL semifinals played Oct 28, SCVAL crossovers #1 and #3 on Thu Oct 29, #2 and the play-in
 * on Fri Oct 30 with the MCAL final, the BVAL play-in and the EAL's Super Regional on Sat Oct 31.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import ThisWeek from '../../components/playoffs/ThisWeek';
import { buildThisWeek, type ThisWeekEvent } from '../../components/playoffs/this-week';
import type { Game, PostseasonTag } from '../../lib/types';
import { game as built } from '../game-builder';
import { textOf } from './html-text';

const VIEW = 'components/playoffs/this-week.ts';
const TODAY = '2026-10-29';

/** A game on `date` at `time` (PT) carrying `tag`. */
function game(
  away: string,
  home: string,
  date: string,
  time: string,
  tag: PostseasonTag | null,
  score?: [number, number],
): Game {
  const g = built({ away, home, date, league: false, postseason: tag, official: null, ...(score ? { as: score[0], hs: score[1] } : {}) });
  return { ...g, dateLocal: `${date}T${time}:00` };
}

const crossover = (leagueId: 'scval' = 'scval'): PostseasonTag => ({ kind: 'scval-crossover', leagueId, via: 'config-pairing' });
const mcal: PostseasonTag = { kind: 'mcal-tournament', leagueId: 'mcal', via: 'league-postseason-window' };

const games: Game[] = [
  game('marin-catholic', 'tamalpais', '2026-10-28', '16:00', mcal, [1, 3]),
  game('st-ignatius', 'mitty', '2026-10-29', '16:00', crossover()),
  game('palo-alto', 'valley-christian', '2026-10-29', '18:00', crossover()),
  game('saint-francis', 'los-gatos', '2026-10-30', '15:30', crossover()),
  game('santa-clara', 'los-altos', '2026-10-30', '16:00', crossover()),
  game('redwood', 'tamalpais', '2026-10-30', '16:00', mcal),
  // Out: a CCS quarterfinal past the window, an untagged game, an 'other'-tagged game.
  game('los-gatos', 'mitty', '2026-11-07', '15:00', { kind: 'ccs', leagueId: null, via: 'contest-type-4' }),
  game('westmont', 'prospect', '2026-10-30', '16:00', null),
  game('bonita', 'huntington-beach', '2026-10-27', '16:00', { kind: 'other', leagueId: null, via: 'contest-type-4' }),
  // SoCal: the Tournament of Champions final.
  game('harvard-westlake', 'huntington-beach', '2026-10-29', '18:00', { kind: 'outside-tournament', leagueId: null, via: 'outside-tournament-window' }),
];

const [sf, x1, x3, x2, playIn, final] = games;
const labels = new Map([
  [sf.contestId, 'MCAL semifinal'],
  [x1.contestId, 'SCVAL crossover · #1 v #1'],
  [x3.contestId, 'SCVAL crossover · #3 v #3'],
  [x2.contestId, 'SCVAL crossover · #2 v #2'],
  [playIn.contestId, 'SCVAL play-in for the 7th CCS berth'],
  [final.contestId, 'MCAL final'],
]);

const bvalEvent: ThisWeekEvent = {
  dateKey: '2026-10-31', time: '11 AM PT', title: 'BVAL play-in',
  detail: 'Mt. Hamilton #4 at Santa Teresa #1 (host).', href: '/playoffs#bval', leagueId: 'bval',
};
const ealEvent: ThisWeekEvent = {
  dateKey: '2026-10-31', time: '8:30 AM PT', title: 'EAL Super Regional',
  detail: 'Pleasant Valley High School, Chico · streams 8:30 AM and 1:30 PM PT (NFHS Network)', href: '/playoffs#eal', leagueId: 'eal',
};
const sdsSeeding: ThisWeekEvent = {
  dateKey: '2026-10-31', time: null, title: 'San Diego Section playoffs', detail: 'Section seeding meeting',
  href: '/playoffs#sds-playoffs', leagueId: null,
};
const sdsPlayIn: ThisWeekEvent = {
  dateKey: '2026-11-02', time: null, title: 'San Diego Section playoffs', detail: 'Play-in games (only if needed)',
  href: '/playoffs#sds-playoffs', leagueId: null,
};

function norcal(extra: { games?: Game[]; cap?: number } = {}) {
  return buildThisWeek({
    games: [...games, ...(extra.games ?? [])], today: TODAY, region: 'norcal', labels,
    events: [bvalEvent, ealEvent], cap: extra.cap,
  });
}

describe('buildThisWeek — NorCal on Thu Oct 29', () => {
  it('lists the window by day: results, today, tomorrow and the weekend', () => {
    const view = norcal();
    expect(view.from, VIEW).toBe('2026-10-27');
    expect(view.to, VIEW).toBe('2026-11-05');
    expect(view.days.map((d) => d.dateLabel), VIEW).toEqual(['Wed Oct 28', 'Today · Thu Oct 29', 'Tomorrow · Fri Oct 30', 'Sat Oct 31']);
    expect(view.days.map((d) => d.rows.map((r) => r.label)), VIEW).toEqual([
      ['MCAL semifinal'],
      ['SCVAL crossover · #1 v #1', 'SCVAL crossover · #3 v #3'],
      ['SCVAL crossover · #2 v #2', 'SCVAL play-in for the 7th CCS berth', 'MCAL final'],
      // Events: 8:30 AM before 11 AM.
      ['EAL Super Regional', 'BVAL play-in'],
    ]);
    expect(view.more, VIEW).toBe(0);
  });

  it('reads a result as the site’s score sentence and a game to come as away at home, short names', () => {
    const view = norcal();
    const [result] = view.days[0].rows;
    expect(result.final, VIEW).toBe(true);
    expect(result.text, VIEW).toBe('Tamalpais 3, Marin Catholic 1, final.');
    expect(result.href, VIEW).toMatch(/^\/game\//);
    const [mittyRow] = view.days[1].rows;
    expect(mittyRow.text, VIEW).toBe('St. Ignatius at Mitty');
    expect(mittyRow.time, VIEW).toBe('4:00 PM PT');
    const [bvalRow] = view.days[3].rows.filter((r) => r.label === 'BVAL play-in');
    expect(bvalRow, VIEW).toMatchObject({ kind: 'event', time: '11 AM PT', href: '/playoffs#bval', text: bvalEvent.detail });
  });

  it('leaves out a game past the window, an untagged game, an "other"-tagged game and every SoCal game', () => {
    const texts = norcal().days.flatMap((d) => d.rows.map((r) => r.text)).join(' | ');
    expect(texts, VIEW).not.toMatch(/Los Gatos at Mitty|Westmont|Bonita|Huntington Beach|Harvard-Westlake/);
  });

  it('an event gives way to an unclaimed game of its league on its day, never to a game another slot claims', () => {
    // Saturday: MaxPreps lists the BVAL play-in (no pairing joined it yet) and a Super Regional game: both config
    // events go. Friday: the #2 crossover is listed and claimed by its pairing while the play-in is not listed, so
    // the play-in's event stands beside it (a pairing's event exists only while no game matches it).
    const bvalListed = game('silver-creek', 'prospect', '2026-10-31', '11:00', { kind: 'bval-play-in', leagueId: 'bval', via: 'config-pairing' });
    const ealListed = game('chico', 'pleasant-valley', '2026-10-31', '08:30', { kind: 'league-postseason', leagueId: 'eal', via: 'league-postseason-window' });
    const playInEvent: ThisWeekEvent = {
      dateKey: '2026-10-30', time: '6 PM PT', title: 'SCVAL play-in', detail: 'Santa Clara at Los Altos.', href: '/playoffs#scval', leagueId: 'scval',
    };
    const claimed = new Set([sf, x1, x3, x2, final].map((g) => g.contestId));
    const view = buildThisWeek({
      games: [...games.filter((g) => g !== playIn), bvalListed, ealListed], today: TODAY, region: 'norcal', labels,
      events: [bvalEvent, ealEvent, playInEvent], claimed,
    });
    const fri = view.days.find((d) => d.dateKey === '2026-10-30')!;
    expect(fri.rows.map((r) => [r.kind, r.label]), VIEW).toEqual([
      ['game', 'SCVAL crossover · #2 v #2'],
      ['game', 'MCAL final'],
      ['event', 'SCVAL play-in'],
    ]);
    const sat = view.days.find((d) => d.dateKey === '2026-10-31')!;
    expect(sat.rows.map((r) => r.kind), VIEW).toEqual(['game', 'game']);
    // Without the claimed set, every game of the league counts (the strip's older behaviour, still the default).
    const loose = buildThisWeek({ games: [...games, bvalListed], today: TODAY, region: 'norcal', labels, events: [bvalEvent, ealEvent, playInEvent] });
    expect(loose.days.find((d) => d.dateKey === '2026-10-30')!.rows.map((r) => r.kind), VIEW).toEqual(['game', 'game', 'game']);
  });

  it('caps the strip: the oldest results go first, and the rest is counted', () => {
    const view = norcal({ cap: 5 });
    const rows = view.days.flatMap((d) => d.rows);
    expect(rows, VIEW).toHaveLength(5);
    expect(view.more, VIEW).toBe(3);
    // The Oct 28 result went first, then the two Saturday rows at the end of the window.
    expect(view.days[0].dateLabel, VIEW).toBe('Today · Thu Oct 29');
    expect(rows.map((r) => r.label).at(-1), VIEW).toBe('MCAL final');
  });

  it('renders the strip: one link per row with its whole sentence, the badge, and the overflow link', () => {
    const html = renderToStaticMarkup(createElement(ThisWeek, { id: 'this-week-norcal', view: norcal({ cap: 5 }) }));
    const text = textOf(html);
    expect(html, 'components/playoffs/ThisWeek.tsx').toContain('id="this-week-norcal"');
    expect(text).toContain('This week in the postseason');
    expect(text).toContain('Tue Oct 27 – Thu Nov 5');
    expect(html).toContain('>4:00 PM PT · St. Ignatius at Mitty</a>');
    expect(html).toContain('<span class="sx-badge">SCVAL crossover · #1 v #1</span>');
    expect(html).toContain('href="/schedule"');
    expect(text).toContain('+3 more on the schedule');
    expect(text).not.toMatch(/\b(\d+(st|nd|rd|th)|top|first|second) seed(ed)?\b/i);
  });

  it('renders nothing for an empty window', () => {
    const empty = buildThisWeek({ games, today: '2026-10-02', region: 'norcal', labels, events: [] });
    expect(empty, VIEW).toEqual({ from: '2026-09-30', to: '2026-10-09', days: [], more: 0 });
    expect(renderToStaticMarkup(createElement(ThisWeek, { id: 'this-week-norcal', view: empty }))).toBe('');
  });
});

describe('buildThisWeek — SoCal', () => {
  it('holds only SoCal sides and SoCal events: the Tournament of Champions final, the seeding meeting, the play-ins', () => {
    const view = buildThisWeek({ games, today: TODAY, region: 'socal', labels, events: [sdsSeeding, sdsPlayIn] });
    expect(view.days.map((d) => [d.dateLabel, d.rows.map((r) => r.label)]), VIEW).toEqual([
      ['Today · Thu Oct 29', ['Tournament of Champions']],
      ['Sat Oct 31', ['San Diego Section playoffs']],
      ['Mon Nov 2', ['San Diego Section playoffs']],
    ]);
    expect(view.days[0].rows[0].text, VIEW).toBe('Harvard-Westlake at Huntington Beach');
    const html = renderToStaticMarkup(createElement(ThisWeek, { id: 'this-week-socal', view }));
    // An event with no time prints no "Time TBA"; a SoCal strip carries no CCS word and no seed word.
    expect(html).toContain('>Section seeding meeting</a>');
    expect(textOf(html)).not.toMatch(/\bCCS\b|\bseed(ed|s)?\b(?! ?ing meeting)/i);
  });
});
