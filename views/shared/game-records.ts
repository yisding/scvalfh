/**
 * The league records a slate prints beside a game's sides (GameList's `records`: GameRow and
 * GameCard on /schedule/<league> and /scores/[date]), resolved here so no game-row component reads
 * lib/queries. Today's standings, not the record as of the game: the row is a reader sizing up a
 * game before kickoff, and the faces print records only for a league game with no score yet
 * (components/game-row/parts/sentence-tails.ts `printedRecords`).
 *
 * Server-only: it reads the standings through lib/queries/standings.ts.
 */

import type { Game, Record3 } from '@/lib/model/game';
import type { TeamSlug } from '@/lib/model/ids';
import { getStandingFor } from '@/lib/queries/standings';

/** Each side's current league record, or null where none should print (see leagueStanding). */
export interface GameRecords {
  away: Record3 | null;
  home: Record3 | null;
}

/** The records of a list's games by `contestId`: plain data, so a view can carry it. */
export type RecordsByGame = Readonly<Record<string, GameRecords>>;

/**
 * A side's current league record ("1-4-0") for a slate, or null when it should not print: a side
 * outside the registry has no record on this site (DESIGN §8), and a team with no reported result
 * would read 0-0-0, which the never-0-0 posture forbids for a record as much as for a score.
 */
function leagueStanding(slug: TeamSlug | null): Record3 | null {
  if (!slug) return null;
  const standing = getStandingFor(slug);
  return standing && standing.hasReportedResults ? standing.computed : null;
}

/** Both sides' current league records (`GameViewProps.records`). */
export function recordsFor(game: Game): GameRecords {
  return { away: leagueStanding(game.away.slug), home: leagueStanding(game.home.slug) };
}

/**
 * `recordsFor` over a list's games, keyed by `contestId`. Only a league game (one that counts for a
 * league table, `countsFor`) can print records, so the others are left out.
 */
export function recordsByGame(games: readonly Game[]): RecordsByGame {
  const out: Record<string, GameRecords> = {};
  for (const game of games) {
    if (game.countsFor !== null) out[game.contestId] = recordsFor(game);
  }
  return out;
}
