import { buildDivisionView, type DivisionView, type LeaderLine } from '@/components/standings/standings-view';
import {
  getCrossCheck,
  getFetchedAt,
  getGames,
  getGoalDiffDomain,
  getLastLeagueResultDate,
  getOfficialFixtures,
  getPlayoffs,
  getStandings,
  getTeams,
} from '@/lib/data';
import { recordString, shortDate } from '@/lib/format';
import { DIVISION_LABELS, DIVISIONS, leagueStandingsUrl, SOURCE_LINKS } from '@/lib/season';
import type { Division } from '@/lib/types';

/**
 * Everything /standings and its OG card read, assembled once.
 *
 * This is the only module in the route that touches `lib/data`; the components under
 * `components/standings/` are pure and take what is built here, so they can be reasoned about (and
 * exercised from a script) without an `fs` read.
 *
 * "Today" is never `Date.now()`: the through-date comes from the games themselves and the stamp
 * comes from `snapshot.fetchedAt`, so two builds of the same snapshot are byte-identical.
 */
export interface StandingsPageData {
  asOf: string;
  views: DivisionView[];
  leaders: LeaderLine[];
  playInDate: string;
  /** Set only before league play has produced a result — DESIGN §8's preseason / non-league state. */
  notice: { heading: string; body: string } | null;
}

const SCHEDULE_URLS: Record<Division, string> = {
  'de-anza': SOURCE_LINKS.scvalDeAnzaSchedule,
  'el-camino': SOURCE_LINKS.scvalElCaminoSchedule,
};


export function getStandingsPageData(): StandingsPageData {
  const teams = getTeams();
  const crossCheck = getCrossCheck();
  const playInDate = getPlayoffs().keyDates.crossover;

  const views = DIVISIONS.map((division) =>
    buildDivisionView({
      division,
      standings: getStandings(division),
      teams,
      crossCheck,
      officialFixtures: getOfficialFixtures({ division }),
      gdDomain: getGoalDiffDomain(division),
      playInDate,
      sourceUrl: leagueStandingsUrl(division),
      scheduleUrl: SCHEDULE_URLS[division],
      throughDate: getLastLeagueResultDate(division),
      leagueFinals: getGames({ division, leagueOnly: true, status: 'final' }).length,
      pendingLeagueGames: getGames({ division, leagueOnly: true, status: 'score-pending' }).length,
    }),
  );

  const leaders: LeaderLine[] = DIVISIONS.map((division) => {
    const top = getStandings(division).filter(
      (s) => s.hasReportedResults && s.computed.place === 1,
    );
    return {
      division,
      label: DIVISION_LABELS[division],
      teams: top.map((s) => ({
        // shortName: "St. Ignatius College Preparatory" wraps to three lines on an OG card.
        name: teams.find((t) => t.id === s.teamId)?.shortName ?? s.slug,
        record: recordString(s.computed),
        pts: s.computed.pts,
      })),
      // Article VI §2: "if there is a tie at the top both teams shall be declared champions".
      tiedAtTop: top.length > 1,
    };
  });

  return {
    asOf: getFetchedAt(),
    views,
    leaders,
    playInDate,
    notice: buildNotice(views),
  };
}

/**
 * Before league play has produced a published result the tables are structurally complete but
 * numerically empty, and a reader deserves to be told why in a full sentence rather than left to
 * infer it from a table of em dashes (DESIGN §8, rows 1 and 2).
 */
function buildNotice(views: DivisionView[]): StandingsPageData['notice'] {
  if (views.some((v) => v.leagueFinals > 0)) return null;
  const firstLeague = getGames({ leagueOnly: true })
    .map((g) => g.dateKey)
    .sort()[0];
  const nonLeagueFinals = getGames({ status: 'final' }).filter((g) => !g.isLeague).length;
  return {
    heading: firstLeague
      ? `League play starts ${shortDate(firstLeague)}.`
      : 'League play has not started.',
    body: `These tables count league games only, so every record reads 0-0-0 until the first league result is published${
      nonLeagueFinals > 0
        ? `. The ${nonLeagueFinals} non-league ${
            nonLeagueFinals === 1 ? 'game' : 'games'
          } played so far are on the schedule`
        : ''
    }.`,
  };
}
