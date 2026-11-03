/**
 * The results block of an unbracketed league's /playoffs card (the EAL's Super Regional, `#eal`): its
 * postseason games by day, as MaxPreps lists them. Pure: the page hands the games down (lib/data stays in
 * app/), and nothing here imports lib/data.
 *
 * The Northern Section publishes no format, no pairings and no bracket (Guidelines 2026-28 §IV), so this
 * draws none and names no seed (SEED_CLAIM covers the card): it lists the games tagged 'league-postseason'
 * for the league (lib/classify.ts tags a game between two EAL teams on or after the Super Regional's first
 * day), grouped by day in date order. A day is headed by the rounds its games' own rows name
 * (`roundFromLocation(venue.text)`, lib/postseason/postseason-rounds.ts: MaxPreps' 2025 rows said "Semi Final" and
 * "Championship Final" in the location field, both on Sat Nov 1, so one day can hold two rounds: 'Semifinals
 * and final'), in round order, else by its date alone. With no game yet, one sentence says so and when 2025's
 * rows arrived (the day after: 2025-11-01's games were entered on 2025-11-02; docs/DATA-SOURCES.md §1.4). The
 * shape is the Tournament of Champions block's (OutsideTournament.tsx, buildOutsideTournamentView in
 * playoff-view.ts).
 */

import { byDateThenId, listWords, shootoutPhrases, shortDate } from '../../lib/format';
import { LOCATION_ROUND_HEADING, roundFromLocation, type LocationRound } from '../../lib/postseason/postseason-rounds';
import type { ShootoutInference } from '../../lib/leagues';
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

/**
 * The tournament's result, once its final is played: 'Pleasant Valley won the Super Regional, beating Chico on 1 v 1s
 * after a 0–0 tie in the final on Sat Oct 31.' The final is the one game whose own row names it
 * (`roundFromLocation`: MaxPreps' 2026 row says "Super regional championship"), with a final score and a winner;
 * anything else (no such row, two of them, no clean W/L pair, a result conflict) gives null, and the page names no champion. `shootout` is the
 * section's (SectionConfig.shootout: '1 v 1s', verified, for the Northern Section); null takes the generic words.
 */
export function unbracketedChampion(
  name: string,
  leagueId: LeagueId,
  games: readonly Game[],
  shootout: { words: string; inference: ShootoutInference } | null,
): string | null {
  const finals = games.filter(
    (g) =>
      g.postseason?.kind === 'league-postseason' &&
      g.postseason.leagueId === leagueId &&
      roundFromLocation(g.venue.text) === 'final' &&
      g.status === 'final',
  );
  if (finals.length !== 1) return null;
  const g = finals[0];
  // Only a clean W/L pair names a champion: a flagged result conflict, W/W or a missing flag names none.
  if (g.provenance.resultConflict) return null;
  const [winner, loser] =
    g.home.result === 'W' && g.away.result === 'L'
      ? [g.home, g.away]
      : g.away.result === 'W' && g.home.result === 'L'
        ? [g.away, g.home]
        : [null, null];
  if (!winner || !loser || winner.score === null || loser.score === null) return null;
  const score = `${winner.score}\u2013${loser.score}`;
  const how =
    g.decider === 'SO'
      ? `${shootoutPhrases(shootout?.words ?? 'a shootout', shootout?.inference).onPhrase} after a ${score} tie`
      : g.decider === 'OT' || g.decider === '2OT'
        ? `${score} in overtime`
        : score;
  return `${winner.name} won the ${name}, beating ${loser.name} ${how} in the final on ${shortDate(g.dateKey)}.`;
}
