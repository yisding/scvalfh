/**
 * The JV lists' view model: a team page's "JV games" section and a day page's JV block.
 *
 * Every game comes from lib/jv.ts (MaxPreps' JV schedules, supplemented by si.com under
 * lib/jv-merge.ts). JV games stay apart from varsity: these views feed no varsity record, form
 * strip, margin chart or table, so a JV result is never mistaken for a varsity one.
 *
 * SERVER-ONLY: reads lib/jv, which imports data/jv.json.
 */

import { localDateKey } from '../../lib/format';
import { getJvFetchedAt, getJvGamesForTeam, getJvGamesOn, getJvTeam } from '../../lib/jv';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, GameSide, TeamSlug } from '../../lib/types';

export interface JvRowView {
  game: Game;
  /** "si.com has Santa Clara 0, Monta Vista 4; MaxPreps’ score is shown." when the two disagree. */
  differsNote: string | null;
}

export interface JvListSummary {
  /** Games with a score from si.com (the † rows). */
  sbliveScores: number;
  /** MaxPreps finals si.com reports differently. */
  differs: number;
}

export interface TeamJvView extends JvListSummary {
  teamName: string;
  rows: JvRowView[];
  /** Finals. */
  played: number;
  /** Not final, dated today or later. */
  toCome: number;
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

/** The sentence beside a MaxPreps JV final si.com reports differently, or null. */
export function jvDiffersNote(game: Game): string | null {
  const conflict = game.provenance.scoreConflict;
  if (!conflict || game.provenance.scores === 'sblive') return null;
  return (
    `si.com has ${shortName(game.away)} ${conflict.sblive.away}, ${shortName(game.home)} ${conflict.sblive.home}; ` +
    'MaxPreps’ score is shown.'
  );
}

function summarize(games: readonly Game[]): JvListSummary {
  return {
    sbliveScores: games.filter((g) => g.provenance.scores === 'sblive').length,
    differs: games.filter((g) => jvDiffersNote(g) !== null).length,
  };
}

const rowsOf = (games: readonly Game[]): JvRowView[] => games.map((game) => ({ game, differsNote: jvDiffersNote(game) }));

/** A team page's JV section; null only for a slug that is not a registry team. */
export function buildTeamJvView(slug: TeamSlug): TeamJvView | null {
  const team = getTeamBySlug(slug);
  const entry = getJvTeam(slug);
  if (!team || !entry) return null;
  const games = getJvGamesForTeam(slug);
  const today = localDateKey(getJvFetchedAt());
  const status = entry.maxpreps.status === 'unavailable' ? 'ok' : entry.maxpreps.status;
  const emptyHeading =
    status === 'error'
      ? `${team.name}’s JV games could not be read.`
      : status === 'pending'
        ? `${team.name}’s JV games have not been read yet.`
        : `MaxPreps lists no JV games for ${team.name}.`;
  const emptyBody =
    status === 'error'
      ? 'The last update could not reach MaxPreps for them and had nothing earlier to fall back on.'
      : status === 'pending'
        ? 'No update has covered this team’s JV schedule yet.'
        : 'The school may not field a JV team this season, or no JV schedule has been entered.';
  return {
    teamName: team.name,
    rows: rowsOf(games),
    played: games.filter((g) => g.status === 'final').length,
    toCome: games.filter((g) => g.status !== 'final' && g.dateKey >= today).length,
    status,
    maxprepsUrl: entry.maxprepsScheduleUrl,
    sbliveUrl: entry.sbliveUrl,
    emptyHeading,
    emptyBody,
    ...summarize(games),
  };
}

/** One day's JV games, by time. */
export function buildDayJvView(dateKey: string): JvListSummary & { rows: JvRowView[] } {
  const games = getJvGamesOn(dateKey);
  return { rows: rowsOf(games), ...summarize(games) };
}
