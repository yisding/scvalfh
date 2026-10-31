/**
 * "Where every league stands" (DESIGN §32.2): the first block of each region on /playoffs, one row per league in
 * the order the page prints the leagues' sections, so a fan answers "what is my league's postseason, and what
 * happens next?" in one screen and taps through to the league's section.
 *
 * A row is three facts and a link:
 * - `path`: the league's postseason in a phrase, from config ('CCS championship · 7 of 16 berths',
 *   'MCAL tournament · 6 teams', 'Super Regional, Oct 30–31 · the top six qualify', 'San Diego Section playoffs,
 *   Nov 2–14 · placed by the Section', 'No section playoffs').
 * - `latest`: the league's most recent postseason result in the "This week" window, or its tournament champion.
 * - `next`: the league's postseason games and dated events on its next day in the window.
 * Both read the same rows as the "This week" strip (this-week.ts, every row tagged with its leagues), so the board
 * and the strip cannot disagree. Nothing here is new copy for a league: each phrase is the config's own name,
 * count or note, and the copy rules hold (no CCS word on a non-CCS row, no seed word, never "eliminated").
 *
 * Pure: the page hands down the leagues, their configs and the strip's rows; "today" is the caller's.
 */

import { dateSpan, numberWord, shiftDateKey, shortDate } from '../../lib/format';
import type { LeagueConfig } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

import type { ThisWeekRow } from './this-week';

export interface BoardLine {
  /** 'Today · 4:00 PM PT', 'Sat Oct 31 · 11 AM PT', 'Thu Oct 29' (a final), 'Champion'. */
  when: string;
  /** The row's sentence ('Santa Clara at Los Altos', 'Archbishop Mitty 0, St. Ignatius 3, final.'). */
  text: string;
  /** The round word, when the row has one ('SCVAL play-in for the 7th CCS berth'); '' otherwise. */
  label: string;
  href: string | null;
}

export interface BoardRow {
  leagueId: LeagueId;
  /** 'SCVAL' */
  shortName: string;
  /** The league's section on the page: '#scval', '#mcal'. */
  href: string;
  path: string;
  latest: BoardLine | null;
  /** Every row of the league's next day (at most `NEXT_CAP`): SCVAL's crossover and play-in on one afternoon. */
  next: BoardLine[];
}

/** A league's next day rarely holds more than two rows; past three the "This week" strip below has them all. */
export const NEXT_CAP = 3;

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

function dayWords(dateKey: string, today: string): string {
  if (dateKey === today) return 'Today';
  if (dateKey === shiftDateKey(today, 1)) return 'Tomorrow';
  return shortDate(dateKey);
}

function line(row: ThisWeekRow, today: string): BoardLine {
  const day = dayWords(row.dateKey, today);
  return {
    when: row.final || row.time === null ? day : `${day} · ${row.time}`,
    text: row.text,
    label: row.label,
    href: row.href,
  };
}

/**
 * The board's rows, in the order given. `rows` are the region's "This week" rows, uncapped and in time order
 * (buildThisWeek); a league's `latest` is its last
 * final row (or, for a league tournament, the champion sentence once there is one), and `next` every row of the
 * first later-or-today day that holds one that is not final.
 */
export function buildBoard(leagues: readonly BoardLeagueInput[], rows: readonly ThisWeekRow[], today: string): BoardRow[] {
  return leagues.map((input) => {
    const mine = rows.filter((r) => r.leagueIds.includes(input.leagueId));
    const finals = mine.filter((r) => r.final);
    const ahead = mine.filter((r) => !r.final && r.dateKey >= today);
    const nextDay = ahead[0]?.dateKey;
    const upcoming = ahead.filter((r) => r.dateKey === nextDay).slice(0, NEXT_CAP);
    const lastFinal = finals[finals.length - 1];
    const latest: BoardLine | null = input.champion
      ? { when: 'Champion', text: input.champion, label: '', href: lastFinal?.href ?? null }
      : lastFinal
        ? line(lastFinal, today)
        : null;
    return {
      leagueId: input.leagueId,
      shortName: input.shortName,
      href: `#${input.leagueId}`,
      path: pathPhrase(input),
      latest,
      next: input.champion ? [] : upcoming.map((r) => line(r, today)),
    };
  });
}
