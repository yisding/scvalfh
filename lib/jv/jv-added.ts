/**
 * JV games that come with a varsity game no feed lists (DataQualityConfig.addedGames, `AddedGame.jv`): the fifth
 * JV layer, after the league's own schedule (lib/jv/jv-official.ts).
 *
 * A game the owner reports before its day often names the JV game too (Cupertino hosts Santa Teresa on Tue Nov 24,
 * 2026: JV 5:30, varsity 7:00). Each such JV game is listed under the same terms as the varsity game it comes with:
 *   1. only in a file stamped on or after the day it was reported (`reportedOn`), or else its own day;
 *   2. while no JV game of the two schools is listed within ±JV_OFFICIAL_WINDOW_DAYS of its date (MaxPreps has it
 *      after all, and its row, with its score, is the game);
 *   3. as a scheduled game with the source's date, start and host, no score, contest id
 *      `added-jv:<date>-<away>-at-<home>`, a league game only when the two schools share a division and the varsity
 *      game is not marked `nonLeague`, and
 *      `provenance.schedule` the source.
 *
 * Pure: no I/O, no clock.
 */

import { byDateThenId, datesAtLocal, dayDiff } from '../format';
import { getTeamBySlug } from '../teams';
import type { AddedGame, ContestId, Game, GameSide, Team } from '../types';
import { JV_OFFICIAL_WINDOW_DAYS } from './jv-official';

export const ADDED_JV_PREFIX = 'added-jv:';

export const isAddedJvContestId = (id: ContestId): boolean => id.startsWith(ADDED_JV_PREFIX);

const sideOf = (team: Team): GameSide => ({ teamId: team.id, slug: team.slug, name: team.name, score: null, result: null });

const pairKey = (a: string | null, b: string | null): string => [a ?? '', b ?? ''].sort().join('~');

/** The JV game an added game lists, or null when it names none or a school is outside the registry. */
export function addedJvGame(a: AddedGame, today: string, fetchedAt: string): Game | null {
  if (!a.jv) return null;
  const home = getTeamBySlug(a.home);
  const away = getTeamBySlug(a.away);
  if (!home || !away) return null;
  const sameDivision = home.division === away.division && !a.nonLeague;
  return {
    contestId: `${ADDED_JV_PREFIX}${a.jv.dateKey}-${away.slug}-at-${home.slug}`,
    ...datesAtLocal(a.jv.dateKey, a.jv.time),
    isDateTba: false,
    home: sideOf(home),
    away: sideOf(away),
    site: a.neutral ? 'neutral' : 'home',
    // Never 0-0: still to play before its day, played with no score published after it.
    status: a.jv.dateKey < today ? 'score-pending' : 'scheduled',
    isLeague: sameDivision,
    leagueDivision: sameDivision ? home.division : null,
    contestTypes: { home: null, away: null },
    countsFor: null,
    postseason: null,
    otPeriods: 0,
    isOt: false,
    isForfeit: false,
    forfeitBy: null,
    decider: null,
    shootout: null,
    venue: { text: null, ...(a.venue ? { name: a.venue } : {}) },
    urls: { maxpreps: null, nfhsStream: null, goFan: null },
    provenance: { scores: a.from, schedule: a.from, fetchedAt },
  };
}

export interface JvAddedMergeResult {
  /** Every JV game, the listed ones and the added ones, by date. */
  games: Game[];
  /** The JV games this layer added. */
  added: ContestId[];
}

/** `games` with the JV game of every added game that names one and that no listed JV game of the pair is near. */
export function mergeJvAdded(input: {
  games: readonly Game[];
  added: readonly AddedGame[];
  /** The JV file's day ('YYYY-MM-DD'). */
  today: string;
  fetchedAt: string;
}): JvAddedMergeResult {
  const ids = new Set(input.games.map((g) => g.contestId));
  const more: Game[] = [];
  for (const a of input.added) {
    if (!a.jv || (a.reportedOn ?? a.jv.dateKey) > input.today) continue;
    const jv = a.jv;
    const listed = input.games.some(
      (g) => pairKey(g.home.slug, g.away.slug) === pairKey(a.home, a.away) && Math.abs(dayDiff(g.dateKey, jv.dateKey)) <= JV_OFFICIAL_WINDOW_DAYS,
    );
    if (listed) continue;
    const g = addedJvGame(a, input.today, input.fetchedAt);
    if (!g || ids.has(g.contestId)) continue;
    ids.add(g.contestId);
    more.push(g);
  }
  return {
    games: more.length > 0 ? [...input.games, ...more].sort(byDateThenId) : [...input.games],
    added: more.map((g) => g.contestId),
  };
}
