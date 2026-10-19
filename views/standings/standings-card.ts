/**
 * What the league standings OG card prints (components/og/LeagueStandingsCard.tsx, SPEC §8.4;
 * routes: app/standings/[league]/opengraph-image.tsx and app/schedule/[league]/opengraph-image.tsx):
 * `<SHORT> standings · through <date>`, then each division's top 4 with PTS and W-L-T (a
 * single-division league: one column, top 6), or `No league results yet`.
 *
 * A shared place prints as `T3`, the US sports-page mark the tables use: the league's last step is
 * the league's to run, and a card that silently picked a winner would be the one place on the site
 * that lies. Division labels come only from `divisionHeading()` (via the league summary): a
 * single-division league (PCAL, MCAL, EAL) gets none.
 */

import { getFetchedAt } from '@/lib/datasets/snapshot';
import { shortDate } from '@/lib/format/dates';
import { placeMark, recordString } from '@/lib/format/numbers';
import type { DivisionId, TeamId } from '@/lib/model/ids';
import { getLastLeagueResultDate } from '@/lib/queries/games';
import type { LeagueSummary } from '@/lib/queries/leagues';
import { getStandings } from '@/lib/queries/standings';
import { teamShortName } from '@/lib/registry/teams';
import { asOfLeagueGamesWords } from '@/views/site/og-theme';

export interface LeagueStandingsCardRow {
  id: TeamId;
  /** `1`, `T3` (placeMark's 'table' form). */
  place: string;
  /** The team's short name. */
  name: string;
  pts: number;
  /** `11-0-0` */
  record: string;
}

export interface LeagueStandingsCardColumn {
  id: DivisionId;
  /** The division heading; null for a single-division league. */
  heading: string | null;
  /** The teams with reported results, in place order: the top 6 of a single-division league, else the top 4. */
  rows: LeagueStandingsCardRow[];
}

export interface LeagueStandingsCardModel {
  /** The league's full name, for the kicker. */
  name: string;
  shortName: string;
  /** ` · through Fri Oct 2` after the latest counted league result, or '' before the first one. */
  throughWords: string;
  /** One division: its one column is as wide as a two-division card's (the card's layout reads it). */
  single: boolean;
  columns: LeagueStandingsCardColumn[];
  /** `As of … · league games only · unofficial` */
  asOf: string;
}

/** What the card reads of a league summary (the `[league]` OG routes hand it `leagueParam`'s). */
export type LeagueStandingsCardSource = Pick<LeagueSummary, 'id' | 'name' | 'shortName' | 'divisions'>;

/** The card for `league`, a league the route has already checked with `leagueParam`. */
export function leagueStandingsCardModel(league: LeagueStandingsCardSource): LeagueStandingsCardModel {
  const single = league.divisions.length === 1;
  const through = getLastLeagueResultDate({ league: league.id });
  return {
    name: league.name,
    shortName: league.shortName,
    throughWords: through ? ` · through ${shortDate(through)}` : '',
    single,
    columns: league.divisions.map((d) => ({
      id: d.id,
      heading: d.heading,
      rows: getStandings(d.id)
        .filter((s) => s.hasReportedResults)
        .slice(0, single ? 6 : 4)
        .map((s) => ({
          id: s.teamId,
          place: placeMark(s.computed.place, s.tiebreak.shared, 'table'),
          name: teamShortName(s.teamId, s.slug),
          pts: s.computed.pts,
          record: recordString(s.computed),
        })),
    })),
    asOf: asOfLeagueGamesWords(getFetchedAt()),
  };
}
