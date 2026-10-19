/**
 * The home panel's mini standings (components/home/MiniStandings.tsx): one division's table rows,
 * as plain strings and numbers (each row's link sentence included), with the division's last
 * result day, its standings link, its kicker and caption words and how many rows it shows.
 */

import { divisionHeading } from '@/lib/config/leagues/labels';
import { recordString, recordWords } from '@/lib/format/numbers';
import type { DivisionId } from '@/lib/model/ids';
import type { DivisionConfig, LeagueConfig } from '@/lib/model/league-config';
import { getLastLeagueResultDate } from '@/lib/queries/games';
import { getGoalDiffDomain, getStandings } from '@/lib/queries/standings';
import { getTeamById } from '@/lib/registry/teams';
import { standingsHref } from '@/lib/shared/routes';
import { tableSubject } from '@/views/standings/division';
import { standingRowLabel, tableName } from '@/views/standings/table-notes';

export interface MiniRow {
  slug: string;
  name: string;
  shortName: string;
  place: number;
  shared: boolean;
  hasResults: boolean;
  gp: number;
  record: string;
  /** '7 wins, 1 loss, 0 ties' — the record for the row link's accessible name. */
  recordWords: string;
  pts: number;
  gd: number;
  /** The row link's accessible name, as on the standings tables (`standingRowLabel`). */
  label: string;
}

export interface MiniDivisionView {
  id: DivisionId;
  /** null for a single-division league: no division label anywhere. */
  heading: string | null;
  leagueShort: string;
  /**
   * The section kicker: the division heading; `League table` for a single-division league (it shows
   * NO division label); `Table` for a group of independents (the LA independents, DESIGN §24.10),
   * which is in no league.
   */
  kicker: string;
  /**
   * The sr-only caption's subject, as the full table names it (views/standings/division.ts
   * `tableSubject`): 'De Anza Division league standings', 'Palomar league standings', and a group
   * named in full, 'LA independents standings', never 'LA league standings'. The component adds the
   * date and the `top N of M` count.
   */
  captionSubject: string;
  /** Every row, table order; the component shows the first `shown` of them. */
  rows: MiniRow[];
  /** How many rows the card shows (`miniShownCount` over `home.miniRows`). */
  shown: number;
  total: number;
  gdDomain: number;
  /** THIS division's last league result day, or null. */
  throughDate: string | null;
  /** `/standings/<league>#<division>` */
  href: string;
  /** `getDivision(d).home`, never a map keyed by division id. */
  home: DivisionConfig['home'];
}

/**
 * How many rows the mini table shows: `miniRows`, stretched to keep a place shared AT the cutoff
 * whole — a parent never sees a rival in "T4" and their own team, equally 4th, missing. Only
 * teams with results and the SAME shared place extend it, so an unplayed table (or the next tied
 * cluster) never stretches the card.
 */
export function miniShownCount(
  rows: readonly Pick<MiniRow, 'hasResults' | 'shared' | 'place'>[],
  miniRows: number,
): number {
  let n = Math.min(miniRows, rows.length);
  const last = rows[n - 1];
  if (!last || !last.hasResults || !last.shared) return n;
  while (n < rows.length && rows[n].hasResults && rows[n].shared && rows[n].place === last.place) n++;
  return n;
}

export function miniDivision(league: LeagueConfig, division: DivisionConfig): MiniDivisionView {
  const where = tableName(division.id);
  const rows = getStandings(division.id).map((s): MiniRow => {
    const team = getTeamById(s.teamId);
    const row = {
      slug: s.slug,
      name: team?.name ?? s.slug,
      shortName: team?.shortName ?? s.slug,
      place: s.computed.place,
      shared: s.tiebreak.shared,
      hasResults: s.hasReportedResults,
      gp: s.computed.gp,
      record: recordString(s.computed),
      recordWords: recordWords(s.computed),
      pts: s.computed.pts,
      gd: s.computed.gd,
    };
    return { ...row, label: standingRowLabel(row, where) };
  });
  const heading = divisionHeading(division.id);
  return {
    id: division.id,
    heading,
    leagueShort: league.shortName,
    kicker: heading ? heading : league.independents ? 'Table' : 'League table',
    captionSubject: tableSubject(league, heading),
    rows,
    shown: miniShownCount(rows, division.home.miniRows),
    total: rows.length,
    gdDomain: getGoalDiffDomain(division.id),
    throughDate: getLastLeagueResultDate({ division: division.id }),
    href: standingsHref(league.id, division.id),
    home: division.home,
  };
}
