/**
 * The page data for /standings and /standings/<league>, assembled once from `lib/queries/`, plus the
 * `leaderLine` rows the root and /standings OG cards print.
 *
 * It is the `lib/queries/`-reading side of a split with the pure `standings-view.ts`: this module reads
 * the snapshot, and the view builders and components under `components/standings/` take what is
 * built here, so they can be reasoned about (and exercised from a test) without an `fs` read. It is not the only reader: the pages' `generateMetadata`, the
 * OG routes and the OG card models (views/standings/standings-card.ts, views/site/region-card.ts)
 * call `lib/queries/` directly too.
 *
 * "Today" is never `Date.now()`: the through-date comes from the games themselves and the stamp
 * comes from `snapshot.fetchedAt`, so two builds of the same snapshot are byte-identical.
 */

import {
  byRegion, getLeague, isIndependentLeague, leagueOfDivision, leaguePlayStarts,
} from '@/lib/config/leagues';
import { standaloneName } from '@/lib/config/leagues/labels';
import { getFetchedAt } from '@/lib/datasets/snapshot';
import { shortDate } from '@/lib/format/dates';
import { recordString } from '@/lib/format/numbers';
import { plural } from '@/lib/format/words';
import type { Game } from '@/lib/model/game';
import type { DivisionId, LeagueId, RegionId } from '@/lib/model/ids';
import type { RegionConfig } from '@/lib/model/league-config';
import { getGames, getLastLeagueResultDate, getNonLeagueFinalsPlayed } from '@/lib/queries/games';
import { type LeagueSummary, getLeagueSummaries, getLeagueSummary } from '@/lib/queries/leagues';
import { getCrossCheck } from '@/lib/queries/provenance';
import {
  getCoLeaders, getGamesPlayedSpread, getGoalDiffDomain, getMissingOfficialResults, getStandingContext,
  getStandings,
} from '@/lib/queries/standings';
import { getTeams } from '@/lib/queries/teams';

import { buildDivisionView } from './division';
import { coLeadersLine, rulesFootnote, unevenGpFootnote } from './footnotes';
import { biggestGoalDiff } from './goal-diff';
import type { LeaderLine } from './leader-lines';
import { buildOverviewDivision, overviewOutline, type OverviewSection } from './overview';
import type { DivisionView } from './types';

export interface StandingsPageView {
  asOf: string;
  league: LeagueSummary;
  /** `LeagueConfig.membershipNote`, printed under the page header (EAL); null for most leagues. */
  membershipNote: string | null;
  views: DivisionView[];
  leaders: LeaderLine[];
  /** The latest league-result date across the divisions (the metadata's "League games through …"), or null before any. */
  throughDate: string | null;
  /** The page disclosure's paragraphs, in order: the GD note with its scale in words, GP/LEFT/MAX, then each division's generic notes once. */
  legend: string[];
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

/**
 * The leaders of one table: every team at place 1 with results. Exported for the root OG card
 * (app/opengraph-image.tsx; words: views/site/region-card.ts), which prints the same row as the
 * /standings card through `leaderClause`.
 */
export function leaderLine(division: DivisionId, heading: string | null): LeaderLine {
  const teams = getTeams();
  const top = getStandings(division).filter((s) => s.hasReportedResults && s.computed.place === 1);
  return {
    division,
    heading,
    teams: top.map((s) => ({
      // shortName: "Convent of the Sacred Heart" wraps to three lines on an OG card.
      name: teams.find((t) => t.id === s.teamId)?.shortName ?? s.slug,
      record: recordString(s.computed),
      pts: s.computed.pts,
    })),
    tiedAtTop: top.length > 1,
  };
}

export function buildStandingsPageView(leagueId: LeagueId): StandingsPageView {
  const league = getLeagueSummary(leagueId);
  if (!league) throw new Error(`views/standings/standings-view.ts: unknown league ${leagueId}`);
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
    throughDate: views
      .map((v) => v.throughDate)
      .filter((d): d is string => d !== null)
      .sort()
      .at(-1) ?? null,
    legend: standingsLegend(league, views),
    rules: rulesFootnote(leagueId),
    unevenGp,
    coLeaders,
    notice: buildNotice(leagueId, views),
  };
}

/**
 * The page disclosure: the GD paragraph and each generic per-division sentence once. The GD
 * scale is in words ("De Anza's is 36"), not "|GD| max 36"; a single-division league names no
 * division (SPEC §10.3).
 * A division where every |GD| is 0 (Metro South Bay before its first game) is left out of the
 * list: its `gdDomain` is the bar floor of 1, not a goal difference (biggestGoalDiff).
 */
function standingsLegend(league: LeagueSummary, views: readonly DivisionView[]): string[] {
  const scaled = views.filter((v) => biggestGoalDiff(v.rows.map((r) => r.standing.computed.gd)) > 0);
  const gdScale =
    league.divisions.length > 1
      ? `Bars are scaled to each division’s own biggest goal difference${
          scaled.length > 0 ? ` (${scaled.map((v) => `${v.label}’s is ${v.gdDomain}`).join(', ')})` : ''
        }, so bars in different divisions are not comparable.`
      : `Bars are scaled to the league’s biggest goal difference${
          scaled.length > 0 ? ` (${scaled[0]!.gdDomain})` : ''
        }.`;
  return [
    `GD = league goals for minus goals against. ${gdScale} A real 0 shows as 0; a score we do not have shows as an em dash. Forfeits count in the win-loss-tie record, not in the goal columns.`,
    // A league with no fixed schedule (the Sunset, gamesPerTeam null) has no "of N", LEFT or MAX.
    views.every((view) => view.fixedSchedule)
      ? 'GP is league games counted of those scheduled. LEFT is league games with no counted result yet — still to play, or played and not reported. MAX is the most points a team could reach if it won all of them: a ceiling, not a projection.'
      : `GP is league games counted. ${league.shortName} has no fixed league schedule, so there is no LEFT or MAX column.`,
    ...new Set(views.flatMap((view) => view.legendNotes)),
  ];
}

/**
 * Before league play has produced a published result the tables are structurally complete but
 * numerically empty, and a reader deserves to be told why in a full sentence rather than left to
 * infer it from a table of em dashes (DESIGN §8, rows 1 and 2). Exported for
 * tests/ui/standings-view.test.ts, which pins the copy no league's live tables reach today.
 */
export function buildNotice(leagueId: LeagueId, views: DivisionView[]): StandingsPageView['notice'] {
  if (views.some((v) => v.leagueFinals > 0)) return null;
  // The start date is config's (validated, so always set) and the count is games played so far,
  // the same two facts the home PhaseLead reads (lib/config/leagues leaguePlayStarts, lib/queries/games
  // getNonLeagueFinalsPlayed), so the two notices cannot disagree.
  const nonLeagueFinals = getNonLeagueFinalsPlayed(leagueId);
  return {
    // A group of independents has no league play: its games against each other start (its short name is an
    // adjective, so the sentence names the group: standaloneName).
    heading: isIndependentLeague(leagueId)
      ? `The first game between two of ${standaloneName(leagueId)} is ${shortDate(leaguePlayStarts(leagueId))}.`
      : `${getLeague(leagueId).shortName} league play starts ${shortDate(leaguePlayStarts(leagueId))}.`,
    body: `These tables count league games only, so every record reads 0-0-0 until the first league result is published${
      nonLeagueFinals > 0
        ? `. The ${plural(nonLeagueFinals, 'non-league game')} played so far ${
            nonLeagueFinals === 1 ? 'is' : 'are'
          } on the schedule`
        : ''
    }.`,
  };
}

// ---------------------------------------------------------------- the /standings overview

/** One region's half of /standings (DESIGN-socal §2.4): its sections, wrapped in `<div id="<region>">`. */
export interface StandingsOverviewRegion {
  id: RegionId;
  name: RegionConfig['name'];
  shortName: RegionConfig['shortName'];
  leagues: LeagueSummary[];
  sections: OverviewSection[];
}

export interface StandingsOverviewView {
  asOf: string;
  leagues: LeagueSummary[];
  sections: OverviewSection[];
  /** NorCal, then SoCal: the same sections, split by region for the page's region wrappers. */
  regions: StandingsOverviewRegion[];
  /**
   * Per league, each table's leaders (OG card, metadata); the LA independents' table included.
   */
  leaders: Array<{ league: LeagueSummary; lines: LeaderLine[] }>;
  throughDate: string | null;
}

export function buildStandingsOverviewView(): StandingsOverviewView {
  const teams = getTeams();
  const leagues = getLeagueSummaries();
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
    regions: byRegion(leagues, (l) => l.region).map(({ region, items: mine }) => {
      const ids = new Set<string>(mine.map((l) => l.section.id));
      return {
        id: region.id,
        name: region.name,
        shortName: region.shortName,
        leagues: mine,
        sections: sections.filter((s) => ids.has(s.id)),
      };
    }),
    leaders: leagues
      .map((league) => ({
        league,
        lines: league.divisions.map((d) => leaderLine(d.id, d.heading)),
      })),
    throughDate: getLastLeagueResultDate(),
  };
}
