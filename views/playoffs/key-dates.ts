/**
 * The CCS key-dates list on /playoffs (SPEC §6.1, §10.7): every CCS date plus each CCS league's own
 * postseason date, in date order.
 *
 * Pure, like every playoffs view module (key-dates, projection, pairings, tournament): no `fs` and no
 * `lib/queries/`. The pages read the snapshot and hand plain records down, so every builder here is
 * testable and safe anywhere. Server-only: no client component imports this module.
 */

import { leagueClockPT, shortDate, timeOfDayPT } from '@/lib/format/dates';
import type { CcsKeyDates } from '@/lib/model/postseason';

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

export type KeyDateKey =
  | 'entries'
  | 'seeding'
  | 'quarterfinals'
  | 'semifinals'
  | 'finals'
  | 'evaluation'
  | 'end-of-league-season'
  | `league:${string}`;

export interface KeyDateRow {
  key: KeyDateKey;
  /** 'YYYY-MM-DD' — the `<time datetime>` value. */
  dateKey: string;
  /** 'Sat Nov 7' */
  dateLabel: string;
  /** '1:00 PM PT', or null for an all-day date. */
  time: string | null;
  /** The league a date belongs to ('SCVAL', 'BVAL'); null for a CCS date. */
  leagueShort: string | null;
  label: string;
  detail: string;
  /** One of the three tournament rounds (set in ink and semibold). */
  isRound: boolean;
}

/** One league-owned date on the CCS calendar (a crossover, a play-in), from config pairings. */
export interface LeagueKeyDate {
  /** Stable key part, e.g. the league id. */
  id: string;
  /** 'SCVAL' */
  leagueShort: string;
  /** YYYY-MM-DD */
  date: string;
  /** League clock 'HH:MM' or null. */
  time: string | null;
  label: string;
  detail: string;
}

/**
 * Every CCS key date plus each CCS league's own postseason date, in date order. The CCS dates come
 * from the CCS playoff-dates release (cross-confirmed by the CCS iCal feed once it is polled); the
 * league dates come from the official league schedules and by-laws (config pairings).
 */
export function keyDateRows(k: CcsKeyDates, leagueDates: readonly LeagueKeyDate[] = []): KeyDateRow[] {
  const ccs = (
    key: KeyDateKey,
    iso: string,
    label: string,
    detail: string,
    opts: { time?: boolean; isRound?: boolean } = {},
  ): KeyDateRow => ({
    key,
    dateKey: dateOnly(iso),
    dateLabel: shortDate(iso),
    time: opts.time ? timeOfDayPT(iso) : null,
    leagueShort: null,
    label,
    detail,
    isRound: opts.isRound ?? false,
  });
  const rows: KeyDateRow[] = [
    ccs('end-of-league-season', k.endOfLeagueSeason, 'CCS end of league season', 'The last day a league game or league postseason game may be played.'),
    ccs('entries', k.entriesDue, 'CCS entries due', 'Leagues submit their qualifiers and at-large candidates.', { time: true }),
    ccs('seeding', k.seedingMeeting, 'CCS seeding meeting', 'The committee seeds both CCS divisions. This page fills in that evening.', { time: true }),
    ccs('quarterfinals', k.quarterfinals, 'Quarterfinals', 'Higher seed hosts.', { isRound: true }),
    ccs('semifinals', k.semifinals, 'Semifinals', 'Higher seed hosts.', { isRound: true }),
    ccs('finals', k.finals, 'Finals', 'Site set by CCS.', { isRound: true }),
    ccs('evaluation', k.evaluationMeeting, 'CCS evaluation meeting', 'The season review that closes the tournament.', { time: true }),
    ...leagueDates.map(
      (d): KeyDateRow => ({
        key: `league:${d.id}`,
        dateKey: dateOnly(d.date),
        dateLabel: shortDate(d.date),
        time: d.time ? leagueClockPT(d.time) : null,
        leagueShort: d.leagueShort,
        label: d.label,
        detail: d.detail,
        isRound: false,
      }),
    ),
  ];
  // Stable: date, then the published order above (a league date before CCS dates on the same day
  // never happens today, but the order must not depend on the sort implementation).
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.dateKey.localeCompare(b.row.dateKey) || a.index - b.index)
    .map(({ row }) => row);
}
