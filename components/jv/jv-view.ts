/**
 * The JV lists' view model: a team page's "JV games" section and a day page's JV block.
 *
 * Every game comes from lib/jv/jv.ts (MaxPreps' JV schedules, supplemented by si.com under
 * lib/jv/jv-merge.ts), classified by lib/jv/jv-standings.ts: a JV league game is one whose varsity
 * counterpart counts. JV games stay apart from varsity: these views feed no varsity record, form
 * strip, margin chart or table, so a JV result is never mistaken for a varsity one.
 *
 * SERVER-ONLY: reads lib/jv/jv, which imports data/jv.json.
 */

import { localDateKey } from '../../lib/format';
import {
  getJvClassification,
  getJvFetchedAt,
  getJvGamesForOutsideTeam,
  getJvGamesForTeam,
  getJvGamesOn,
  getJvSchoolSiteDiffersNote,
  getJvTeam,
} from '../../lib/jv/jv';
import { jvSlotTeamFor } from '../../lib/jv/jv-teams';
import { regionOf } from '../../lib/leagues';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, GameSide, RegionId, TeamSlug } from '../../lib/types';
import type { Perspective } from '../ui/describe-game';

export interface JvRowView {
  game: Game;
  /** "si.com has Santa Clara 0, Monta Vista 4; MaxPreps’ score is shown." when the two disagree. */
  differsNote: string | null;
  /** Show the league / NL chip: false for a same-division game no varsity game matched (uncounted). */
  chips: boolean;
  /** Draw the non-league rule: the game is classified non-league. */
  nonLeague: boolean;
}

export interface JvListSummary {
  /** Games with a score from si.com (the † rows). */
  sbliveScores: number;
  /** Games with a score from a school's own athletics site (also †; lib/jv/jv-school-sites.ts). */
  schoolSiteScores: number;
  /** MaxPreps finals si.com reports differently. */
  differs: number;
}

export interface TeamJvView extends JvListSummary {
  teamName: string;
  /**
   * The team whose games these are, when it is not this school: York on Santa Catalina's page, since
   * PCAL pairs the two in one schedule slot (lib/jv/jv-teams.ts JV_OUTSIDE_TEAMS). `note` says so.
   */
  slot: { name: string; note: string } | null;
  /** Whose side the rows read from: the school, or its slot team by MaxPreps id. */
  perspective: Perspective;
  rows: JvRowView[];
  /** Finals. */
  played: number;
  /** Not final, dated today or later. */
  toCome: number;
  /**
   * Not final, dated before today: the day has passed with no score reported. With `played` and
   * `toCome` it accounts for every row, so the section header's counts add up to the list.
   */
  noScore: number;
  /** The MaxPreps source's status for this school in the latest run. */
  status: 'ok' | 'carried-forward' | 'error' | 'pending';
  maxprepsUrl: string | null;
  sbliveUrl: string | null;
  emptyHeading: string;
  emptyBody: string;
}

function shortName(side: GameSide): string {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  return team ? team.shortName : side.name;
}

/** The sentence beside a MaxPreps JV final si.com, or a school's own site, reports differently, or null. */
export function jvDiffersNote(game: Game): string | null {
  const conflict = game.provenance.scoreConflict;
  if (!conflict || game.provenance.scores === 'sblive') return getJvSchoolSiteDiffersNote(game.contestId);
  return (
    `si.com has ${shortName(game.away)} ${conflict.sblive.away}, ${shortName(game.home)} ${conflict.sblive.home}; ` +
    'MaxPreps’ score is shown.'
  );
}

function summarize(games: readonly Game[]): JvListSummary {
  return {
    sbliveScores: games.filter((g) => g.provenance.scores === 'sblive').length,
    schoolSiteScores: games.filter((g) => g.provenance.scores === 'school-site').length,
    differs: games.filter((g) => jvDiffersNote(g) !== null).length,
  };
}

const rowsOf = (games: readonly Game[]): JvRowView[] =>
  games.map((game) => {
    const kind = getJvClassification(game.contestId)?.kind;
    return { game, differsNote: jvDiffersNote(game), chips: kind !== 'uncounted', nonLeague: kind === 'non-league' };
  });

/**
 * A team page's JV section; null only for a slug that is not a registry team. A school that fields no
 * JV team of its own but whose league slot another team plays at JV level (Santa Catalina, whose PCAL
 * JV games are York's) lists that team's games, read from its side, with a sentence saying whose they
 * are: PCAL's schedule names the slot "CAT/YOR", so the school's page is where its JV fixtures are.
 */
export function buildTeamJvView(slug: TeamSlug): TeamJvView | null {
  const team = getTeamBySlug(slug);
  const entry = getJvTeam(slug);
  if (!team || !entry) return null;
  const slot = jvSlotTeamFor(slug);
  const games = slot ? getJvGamesForOutsideTeam(slot.maxprepsTeamId) : getJvGamesForTeam(slug);
  const today = localDateKey(getJvFetchedAt());
  const status = entry.maxpreps.status === 'unavailable' ? 'ok' : entry.maxpreps.status;
  const emptyHeading = slot
    ? `${team.name} fields no JV team, and no ${slot.name} JV game is listed yet.`
    : status === 'error'
      ? `${team.name}’s JV games could not be read.`
      : status === 'pending'
        ? `${team.name}’s JV games have not been read yet.`
        : `MaxPreps lists no JV games for ${team.name}.`;
  const emptyBody = slot
    ? slot.source
    : status === 'error'
      ? 'The last update could not reach MaxPreps for them and had nothing earlier to fall back on.'
      : status === 'pending'
        ? 'No update has covered this team’s JV schedule yet.'
        : 'The school may not field a JV team this season, or no JV schedule has been entered.';
  return {
    teamName: team.name,
    slot: slot
      ? {
          name: slot.name,
          note: `${slot.source} These are ${slot.name}’s JV games, each result from ${slot.name}’s side.`,
        }
      : null,
    perspective: slot ? { teamId: slot.maxprepsTeamId } : slug,
    rows: rowsOf(games),
    played: games.filter((g) => g.status === 'final').length,
    toCome: games.filter((g) => g.status !== 'final' && g.dateKey >= today).length,
    noScore: games.filter((g) => g.status !== 'final' && g.dateKey < today).length,
    status,
    maxprepsUrl: slot ? slot.maxprepsJvScheduleUrl : entry.maxprepsScheduleUrl,
    sbliveUrl: slot ? slot.sbliveJvGamesUrl : entry.sbliveUrl,
    emptyHeading,
    emptyBody,
    ...summarize(games),
  };
}

/**
 * One day's JV games, by time; with `region`, only those with a registry side in that region (the day
 * page's `#jv` and `#jv-socal` blocks, DESIGN §24.3), and the footnote's counts over those alone. A JV
 * game with a side in each region would be listed in both blocks, each the JV schedule of that region's
 * team: data/jv.json of 2026-10-06 has none (every JV game in it is between two schools of one region), and
 * the varsity page's NorCal vs SoCal block is for varsity alone.
 */
export function buildDayJvView(dateKey: string, region?: RegionId): JvListSummary & { rows: JvRowView[] } {
  const inRegion = (side: GameSide) => {
    const team = side.slug ? getTeamBySlug(side.slug) : undefined;
    return team !== undefined && regionOf(team.league) === region;
  };
  const games = getJvGamesOn(dateKey).filter((g) => region === undefined || inRegion(g.home) || inRegion(g.away));
  return { rows: rowsOf(games), ...summarize(games) };
}
