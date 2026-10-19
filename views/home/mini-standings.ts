/**
 * The home panel's mini standings (components/home/MiniStandings.tsx): one division's table rows,
 * as plain strings and numbers (each row's link sentence included), with the division's last
 * result day and its standings link.
 */

import { divisionHeading } from '@/lib/config/leagues/labels';
import { recordString, recordWords } from '@/lib/format/numbers';
import type { DivisionId } from '@/lib/model/ids';
import type { DivisionConfig, LeagueConfig } from '@/lib/model/league-config';
import { getLastLeagueResultDate } from '@/lib/queries/games';
import { getGoalDiffDomain, getStandings } from '@/lib/queries/standings';
import { getTeamById } from '@/lib/registry/teams';
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
  /** Every row, table order; the component shows `home.miniRows` of them. */
  rows: MiniRow[];
  total: number;
  gdDomain: number;
  /** THIS division's last league result day, or null. */
  throughDate: string | null;
  /** `/standings/<league>#<division>` */
  href: string;
  /** `getDivision(d).home`, never a map keyed by division id. */
  home: DivisionConfig['home'];
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
  return {
    id: division.id,
    heading: divisionHeading(division.id),
    leagueShort: league.shortName,
    rows,
    total: rows.length,
    gdDomain: getGoalDiffDomain(division.id),
    throughDate: getLastLeagueResultDate({ division: division.id }),
    href: `/standings/${league.id}#${division.id}`,
    home: division.home,
  };
}
