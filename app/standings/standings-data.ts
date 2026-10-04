import type { LeagueChip } from '../../components/layout/LeagueSwitcher';
import {
  buildDivisionView,
  buildOverviewDivision,
  coLeadersLine,
  overviewOutline,
  rulesFootnote,
  unevenGpFootnote,
  type DivisionView,
  type LeaderLine,
  type OverviewSection,
} from '../../components/standings/standings-view';
import {
  getCoLeaders,
  getCrossCheck,
  getFetchedAt,
  getGames,
  getGamesPlayedSpread,
  getGoalDiffDomain,
  getLastLeagueResultDate,
  getLeagueIds,
  getLeagueSummary,
  getMissingOfficialResults,
  getStandingContext,
  getStandings,
  getTeams,
  type LeagueSummary,
} from '../../lib/data';
import { recordString, shortDate } from '../../lib/format';
import { getLeague, leagueOfDivision } from '../../lib/leagues';
import type { DivisionId, Game, LeagueId } from '../../lib/types';

/**
 * Everything /standings, /standings/<league> and their OG cards read, assembled once.
 *
 * This is the only module in the route that touches `lib/data`; the components under
 * `components/standings/` take what is built here, so they can be reasoned about (and exercised
 * from a test) without an `fs` read.
 *
 * "Today" is never `Date.now()`: the through-date comes from the games themselves and the stamp
 * comes from `snapshot.fetchedAt`, so two builds of the same snapshot are byte-identical.
 */
export interface StandingsPageData {
  asOf: string;
  league: LeagueSummary;
  /** `LeagueConfig.membershipNote`, printed under the page header (EAL); null for most leagues. */
  membershipNote: string | null;
  views: DivisionView[];
  leaders: LeaderLine[];
  /** The rules footnote under the last table. */
  rules: string;
  /** Uneven-GP footnotes, one per table that needs one (`<heading>: ` prefixed when there are several tables). */
  unevenGp: string[];
  /** Co-leaders lines, one per table with ≥2 teams level on the top points. */
  coLeaders: string[];
  /** Set only before league play has produced a result — DESIGN §8's preseason / non-league state. */
  notice: { heading: string; body: string } | null;
}

/** Counted finals of a division whose score came from si.com (the † footnote's n). */
function backfilledGames(division: DivisionId): number {
  return getGames({ division, leagueOnly: true, status: 'final' }).filter(
    (g: Game) => g.countsFor === division && g.provenance.scores === 'sblive',
  ).length;
}

/** League games of this division's table in one status. */
function divisionGames(division: DivisionId, status: Game['status']): number {
  return getGames({ division, leagueOnly: true, status }).filter((g) => g.countsFor === division).length;
}

function buildDivisionStandingsView(division: DivisionId): DivisionView {
  return buildDivisionView({
    division,
    standings: getStandings(division),
    teams: getTeams(),
    crossCheck: getCrossCheck({ league: leagueOfDivision(division).id }),
    context: getStandingContext(division),
    missing: getMissingOfficialResults(division),
    backfilledGames: backfilledGames(division),
    gdDomain: getGoalDiffDomain(division),
    throughDate: getLastLeagueResultDate({ division }),
    leagueFinals: divisionGames(division, 'final'),
    pendingLeagueGames: divisionGames(division, 'score-pending'),
  });
}

/** The leaders of one table: every team at place 1 with results. */
function leaderLine(division: DivisionId, heading: string | null): LeaderLine {
  const teams = getTeams();
  const top = getStandings(division).filter((s) => s.hasReportedResults && s.computed.place === 1);
  return {
    division,
    heading,
    teams: top.map((s) => ({
      // shortName: "St. Ignatius College Preparatory" wraps to three lines on an OG card.
      name: teams.find((t) => t.id === s.teamId)?.shortName ?? s.slug,
      record: recordString(s.computed),
      pts: s.computed.pts,
    })),
    tiedAtTop: top.length > 1,
  };
}

export function getStandingsPageData(leagueId: LeagueId): StandingsPageData {
  const league = getLeagueSummary(leagueId);
  if (!league) throw new Error(`app/standings/standings-data.ts: unknown league ${leagueId}`);
  const views = league.divisions.map((d) => buildDivisionStandingsView(d.id));
  const several = league.divisions.length > 1;

  const unevenGp: string[] = [];
  const coLeaders: string[] = [];
  for (const d of league.divisions) {
    const prefix = several && d.heading ? `${d.heading}: ` : '';
    const uneven = unevenGpFootnote(leagueId, getGamesPlayedSpread(d.id));
    if (uneven) unevenGp.push(`${prefix}${uneven}`);
    const co = coLeadersLine(getCoLeaders(d.id));
    if (co) coLeaders.push(`${prefix}${co}`);
  }

  return {
    asOf: getFetchedAt(),
    league,
    membershipNote: getLeague(leagueId).membershipNote,
    views,
    leaders: league.divisions.map((d) => leaderLine(d.id, d.heading)),
    rules: rulesFootnote(leagueId),
    unevenGp,
    coLeaders,
    notice: buildNotice(leagueId, views),
  };
}

/**
 * Before league play has produced a published result the tables are structurally complete but
 * numerically empty, and a reader deserves to be told why in a full sentence rather than left to
 * infer it from a table of em dashes (DESIGN §8, rows 1 and 2).
 */
function buildNotice(leagueId: LeagueId, views: DivisionView[]): StandingsPageData['notice'] {
  if (views.some((v) => v.leagueFinals > 0)) return null;
  const summary = getLeagueSummary(leagueId);
  const firstLeague = getGames({ league: leagueId, leagueOnly: true })
    .map((g) => g.dateKey)
    .sort()[0];
  const nonLeagueFinals = getGames({ league: leagueId, status: 'final' }).filter(
    (g) => g.countsFor === null,
  ).length;
  const short = summary?.shortName ?? leagueId;
  return {
    heading: firstLeague
      ? `${short} league play starts ${shortDate(firstLeague)}.`
      : `${short} league play has not started.`,
    body: `These tables count league games only, so every record reads 0-0-0 until the first league result is published${
      nonLeagueFinals > 0
        ? `. The ${nonLeagueFinals} non-league ${nonLeagueFinals === 1 ? 'game' : 'games'} played so far ${
            nonLeagueFinals === 1 ? 'is' : 'are'
          } on the schedule`
        : ''
    }.`,
  };
}

// ---------------------------------------------------------------- the /standings overview

export interface StandingsOverviewData {
  asOf: string;
  leagues: LeagueSummary[];
  sections: OverviewSection[];
  /** Per league, each table's leaders (OG card, metadata). */
  leaders: Array<{ league: LeagueSummary; lines: LeaderLine[] }>;
  throughDate: string | null;
}

export function getStandingsOverviewData(): StandingsOverviewData {
  const teams = getTeams();
  const leagues = getLeagueIds()
    .map((id) => getLeagueSummary(id))
    .filter((l): l is LeagueSummary => l !== undefined);
  const sections = overviewOutline(
    leagues.map((l) => l.id),
    (division) =>
      buildOverviewDivision({
        division,
        standings: getStandings(division),
        teams,
        throughDate: getLastLeagueResultDate({ division }),
      }),
  );
  return {
    asOf: getFetchedAt(),
    leagues,
    sections,
    leaders: leagues.map((league) => ({
      league,
      lines: league.divisions.map((d) => leaderLine(d.id, d.heading)),
    })),
    throughDate: getLastLeagueResultDate(),
  };
}

/**
 * One league's leaders as a single OG / metadata clause (SPEC §8.4): `De Anza: St Ignatius 18 pts
 * · El Camino: Los Gatos 21 pts`; co-leaders at most two names joined with " & ", then ` +<n>`;
 * `No league results yet` before any result.
 */
export function leaderClause(lines: readonly LeaderLine[]): string {
  if (lines.every((line) => line.teams.length === 0)) return 'No league results yet';
  return lines
    .map((line) => {
      const names =
        line.teams.length === 0
          ? 'no results yet'
          : `${line.teams
              .slice(0, 2)
              .map((t) => t.name)
              .join(' & ')}${line.teams.length > 2 ? ` +${line.teams.length - 2}` : ''} ${line.teams[0].pts} pts`;
      return line.heading ? `${line.heading}: ${names}` : names;
    })
    .join(' · ');
}

/** The `LeagueSwitcher` chips, config order (shared by the standings and schedule pages). */
export function leagueChips(): LeagueChip[] {
  return getLeagueIds()
    .map((id) => getLeagueSummary(id))
    .filter((l): l is LeagueSummary => l !== undefined)
    .map((l) => ({ id: l.id, shortName: l.shortName, sectionShort: l.section.shortName }));
}

/** `{ all: base, <id>: base/<id> }` for a link-mode switcher, or `{ <id>: '#<id>' }` for anchor mode. */
export function leagueHrefs(base: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (base) out.all = base;
  for (const id of getLeagueIds()) out[id] = base ? `${base}/${id}` : `#${id}`;
  return out;
}
