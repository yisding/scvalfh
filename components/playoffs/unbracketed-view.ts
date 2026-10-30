/**
 * The results block of an unbracketed league's /playoffs card (the EAL's Super Regional, `#eal`): its
 * postseason games by day, as MaxPreps lists them. Pure: the page hands the games down (lib/data stays in
 * app/), and nothing here imports lib/data.
 *
 * The Northern Section publishes no format, no pairings and no bracket (Guidelines 2026-28 §IV), so this
 * draws none and names no seed (SEED_CLAIM covers the card): it lists the games tagged 'league-postseason'
 * for the league (lib/classify.ts tags a game between two EAL teams on or after the Super Regional's first
 * day), grouped by day in date order. A day is headed by the rounds its games' own rows name
 * (`roundFromLocation(venue.text)`, lib/postseason-rounds.ts: MaxPreps' 2025 rows said "Semi Final" and
 * "Championship Final" in the location field, both on Sat Nov 1, so one day can hold two rounds: 'Semifinals
 * and final'), in round order, else by its date alone. With no game yet, one sentence says so and when 2025's
 * rows arrived (the day after: 2025-11-01's games were entered on 2025-11-02; docs/DATA-SOURCES.md §1.4). The
 * shape is the Tournament of Champions block's (OutsideTournament.tsx, buildOutsideTournamentView in
 * playoff-view.ts).
 */

import { byDateThenId, listWords, shortDate } from '../../lib/format';
import { LOCATION_ROUND_HEADING, roundFromLocation, type LocationRound } from '../../lib/postseason-rounds';
import type { Game, LeagueId } from '../../lib/types';

export interface UnbracketedDayView {
  dateKey: string;
  /** 'Sat Oct 31' */
  dateLabel: string;
  /** 'Semifinals', 'Final', 'Semifinals and final', or null when no row that day names a round. */
  label: string | null;
  games: Game[];
}

export interface UnbracketedResultsView {
  days: UnbracketedDayView[];
  /** How many of the listed games have a final score. */
  finals: number;
  /** How many are still to be played. */
  toCome: number;
  /** The sentence printed when no game is listed yet; null once one is. */
  empty: string | null;
}

/** Printed when MaxPreps lists no Super Regional game yet (2025's rows were entered the day after). */
export const NO_UNBRACKETED_GAME = 'No Super Regional game is on MaxPreps yet; in 2025 the results were entered the day after.';

const ROUND_ORDER: readonly LocationRound[] = ['quarterfinal', 'semifinal', 'third-place', 'final'];

/** The rounds one day's rows name, in round order, as a heading ('Semifinals and final'); null when none does. */
function dayLabel(games: readonly Game[]): string | null {
  const named = new Set(games.map((g) => roundFromLocation(g.venue.text)));
  const rounds = ROUND_ORDER.filter((r) => named.has(r));
  if (rounds.length === 0) return null;
  const words = rounds.map((r, i) => (i === 0 ? LOCATION_ROUND_HEADING[r] : LOCATION_ROUND_HEADING[r].toLowerCase()));
  return listWords(words);
}

export function buildUnbracketedResults(leagueId: LeagueId, games: readonly Game[]): UnbracketedResultsView {
  const own = games
    .filter((g) => g.postseason?.kind === 'league-postseason' && g.postseason.leagueId === leagueId)
    .sort(byDateThenId);
  const days: UnbracketedDayView[] = [];
  for (const g of own) {
    let day = days.find((d) => d.dateKey === g.dateKey);
    if (!day) {
      day = { dateKey: g.dateKey, dateLabel: shortDate(g.dateKey), label: null, games: [] };
      days.push(day);
    }
    day.games.push(g);
  }
  for (const day of days) day.label = dayLabel(day.games);
  return {
    days,
    finals: own.filter((g) => g.status === 'final').length,
    toCome: own.filter((g) => g.status === 'scheduled').length,
    empty: own.length === 0 ? NO_UNBRACKETED_GAME : null,
  };
}
