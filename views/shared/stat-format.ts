/**
 * How a MaxPreps stat prints, shared by the team page's stat tables (views/teams/player-stats.ts)
 * and the /leaders boards (views/leaders/board.ts, views/leaders/player-boards.ts), so both pages
 * print the same figure for the same stat and say the same thing about a team whose totals lag its
 * games.
 */

import type { Game } from '@/lib/model/game';

/** Whole numbers as they are; minutes rounded, since the column is a count of minutes. */
export function statText(value: number | null): string | null {
  return value === null ? null : String(Math.round(value));
}

/** "91.2%" — saves over shots that had to be saved (saves + goals against). */
export function savePercent(saves: number, goalsAgainst: number): string | null {
  const faced = saves + goalsAgainst;
  return faced > 0 ? `${((saves / faced) * 100).toFixed(1)}%` : null;
}

/**
 * Finals played after MaxPreps' "last updated" stamp: games the totals do not include yet. Both
 * stamps are naive local time in the same zone: on 2026-10-02 the finals at or before each team's
 * update matched MaxPreps' own games-played total on 9 of 10 teams (Palo Alto's total is one game
 * ahead of the snapshot). Compared whole, not by date, so a game later on the day of the update
 * counts (Santa Clara: updated 11:15, played at 16:00). Shared with the /leaders page, so both
 * pages say the same thing about the same team.
 */
export function gamesSinceUpdate(lastUpdated: string | null, games: readonly Game[]): number {
  const updatedAt = lastUpdated?.slice(0, 19) ?? null;
  if (!updatedAt) return 0;
  return new Set(
    games
      .filter((g) => g.status === 'final' && g.dateLocal.slice(0, 19) > updatedAt)
      .map((g) => g.contestId),
  ).size;
}
