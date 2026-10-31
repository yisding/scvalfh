/**
 * "Where every league stands" (DESIGN §32.2): the first block of each region on /playoffs, one row per postseason
 * in the order the page prints the sections, so a fan answers "what is my league's postseason, and what happens
 * next?" in one short list and taps through to the section. A status list, not a second "This week": the strip right
 * under it has every game and result by day, so a row says only what the postseason is and when its next thing is.
 *
 * A row is:
 * - `names`: the league's short name, or the leagues one postseason shares ('City · North · Metro', the San Diego
 *   Section playoffs, which place teams across the three);
 * - `path`: the postseason in a phrase, from config ('CCS championship · 7 of 16 berths', 'MCAL tournament · 6
 *   teams', 'Super Regional, Oct 30–31 · the top six qualify', 'San Diego Section playoffs, Nov 2–14 · placed by the
 *   Section', 'No section playoffs');
 * - `next`: the first day from today on that holds one of its rows that is not final, always dated ('Fri Oct 30 ·
 *   4:00 PM PT · SCVAL play-in for the 7th CCS berth', or 'Fri Oct 30 · 2 games' when the day holds more than one);
 *   a decided league tournament's champion sentence instead. Never "Today": the page is a snapshot, read on later
 *   days too.
 * The rows are the strip's own (this-week.ts, each tagged with its leagues), so the board never names a game or date
 * the strip does not. Nothing here is new copy for a league: each phrase is the config's own name, count or note,
 * and the copy rules hold (no CCS word on a non-CCS row, no seed word, never "eliminated").
 *
 * Pure: the page hands down the leagues, their configs and the strip's rows; "today" is the caller's.
 */

import { dateSpan, numberWord, shortDate } from '../../lib/format';
import type { LeagueConfig } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

import type { ThisWeekRow } from './this-week';

export interface BoardNext {
  /** 'Next', or 'Result' for a decided tournament's champion. */
  term: 'Next' | 'Result';
  /** 'Fri Oct 30 · 4:00 PM PT · SCVAL play-in for the 7th CCS berth', 'Fri Oct 30 · 2 games', or a champion sentence. */
  text: string;
  /** The one row's game page or place; the section when the day holds several rows. */
  href: string;
}

export interface BoardRow {
  /** The first league's id: the row's React key. */
  key: LeagueId;
  /** 'SCVAL', or 'City · North · Metro' for a postseason three leagues share. */
  names: string;
  /** The postseason's section on the page: '#scval', '#mcal', '#sds-playoffs'. */
  href: string;
  path: string;
  next: BoardNext | null;
}

export interface BoardLeagueInput {
  leagueId: LeagueId;
  shortName: string;
  config: LeagueConfig;
  /** CCS leagues: the league's automatic berths and the field's size. */
  berths?: { auto: number; total: number };
  /** A league tournament's champion sentence ('Tamalpais won the MCAL tournament, beating …'), when decided. */
  champion?: string | null;
}

/** The league's postseason in a phrase, from config. */
export function pathPhrase(input: BoardLeagueInput): string {
  const ps = input.config.postseason;
  switch (ps.kind) {
    case 'ccs-ladder':
      return input.berths ? `CCS championship · ${input.berths.auto} of ${input.berths.total} berths` : 'CCS championship';
    case 'league-tournament':
      return `${ps.name} · ${ps.qualifiers} teams`;
    case 'unbracketed-tournament':
      return `${ps.name}, ${dateSpan(ps.dates.first, ps.dates.last)} · the top ${numberWord(ps.qualifiers)} qualify`;
    case 'section-playoffs':
      return `${ps.name}, ${dateSpan(ps.dates.first, ps.dates.last)} · placed by the Section`;
    case 'no-postseason':
      return 'No section playoffs';
  }
}

/**
 * One row's words: its date, its time when it has one, and its round word ('SCVAL play-in for the 7th CCS berth', 'CCS
 * seeding meeting'), else its own sentence. A label that only repeats the postseason's name, which the row's path
 * already says ('San Diego Section playoffs'), gives way to the sentence ('Section seeding meeting').
 */
function rowWords(row: ThisWeekRow, path: string): string {
  const what = row.label && !path.startsWith(row.label) ? row.label : row.text.replace(/\.$/, '');
  return [shortDate(row.dateKey), row.time, what].filter(Boolean).join(' · ');
}

/** 'games' when every row of the day is a game, 'dates' otherwise (a seeding meeting beside a play-in). */
function countWords(rows: readonly ThisWeekRow[]): string {
  return `${rows.length} ${rows.every((r) => r.kind === 'game') ? 'games' : 'postseason dates'}`;
}

/**
 * The board's rows, in the order given. `rows` are the region's "This week" rows, uncapped and in time order
 * (buildThisWeek). Leagues whose postseason is the San Diego Section's share one row (the Section places teams
 * across them; their rows and dates are the same).
 */
export function buildBoard(leagues: readonly BoardLeagueInput[], rows: readonly ThisWeekRow[], today: string): BoardRow[] {
  const groups: BoardLeagueInput[][] = [];
  for (const input of leagues) {
    const shared = input.config.postseason.kind === 'section-playoffs';
    const group = shared ? groups.find((g) => g[0].config.postseason.kind === 'section-playoffs') : undefined;
    if (group) group.push(input);
    else groups.push([input]);
  }
  return groups.map((group) => {
    const [first] = group;
    const ids = new Set<LeagueId>(group.map((g) => g.leagueId));
    const shared = group.length > 1;
    const href = shared ? '#sds-playoffs' : `#${first.leagueId}`;
    const path = pathPhrase(first);
    const ahead = rows.filter((r) => !r.final && r.dateKey >= today && r.leagueIds.some((id) => ids.has(id)));
    const day = ahead.filter((r) => r.dateKey === ahead[0]?.dateKey);
    let next: BoardNext | null = null;
    if (first.champion) next = { term: 'Result', text: first.champion, href };
    else if (day.length === 1) next = { term: 'Next', text: rowWords(day[0], path), href: day[0].href ?? href };
    else if (day.length > 1) next = { term: 'Next', text: `${shortDate(day[0].dateKey)} · ${countWords(day)}`, href };
    return {
      key: first.leagueId,
      names: group.map((g) => g.shortName).join(' · '),
      href,
      path,
      next,
    };
  });
}
