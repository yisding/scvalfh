/**
 * The season phase (SPEC §5.9) as pure functions: one league's phase on a day from its configured
 * steps and its played window, and the phase of a set of leagues taken together. The snapshot's
 * windows and the day come in as arguments (lib/queries/phase.ts reads them).
 */

import { leaguePlayEnds } from '@/lib/config/leagues';
import type { LeagueConfig } from '@/lib/model/league-config';
import type { SeasonPhase, SeasonWindow } from '@/lib/model/season';
import { isoDateKey, localDateKey } from '@/lib/shared/dates';

/**
 * A league's phase on the day of `asOf`. `window` is the league's played window in the snapshot
 * (`season.leagues[].window`); without one, or before its first game, the league is in preseason.
 */
export function seasonPhase(league: LeagueConfig, window: SeasonWindow | undefined, asOf: string): SeasonPhase {
  const today = localDateKey(asOf);
  const w = window;
  if (!w || !w.firstGame) return 'preseason';
  const first = isoDateKey(w.firstGame);
  if (today < first) return 'preseason';
  for (const step of league.phases) {
    let end: string;
    if (step.through === 'data') {
      // Today's SCVAL formula: the later of the last game and the last league game.
      const lastPlayed = [w.lastGame, w.lastLeagueGame]
        .filter((v): v is string => !!v)
        .map(isoDateKey)
        .sort();
      end = lastPlayed[lastPlayed.length - 1] ?? first;
    } else if (step.through === 'league-play') {
      const ends = [leaguePlayEnds(league.id), ...(w.lastLeagueGame ? [isoDateKey(w.lastLeagueGame)] : [])].sort();
      end = ends[ends.length - 1];
    } else {
      end = step.through;
    }
    if (today <= end) return step.phase;
  }
  return 'complete';
}

export const PHASE_RANK: Readonly<Record<SeasonPhase, number>> = {
  preseason: 0,
  regular: 1,
  crossover: 2,
  'play-in': 2,
  tournament: 2,
  playoffs: 3,
  complete: 4,
};

/**
 * The phase of a set of leagues taken together, given each league's phase in config order:
 * 'preseason' only when every league is in its preseason,
 * 'complete' only when every league is complete, and otherwise the least advanced phase among the leagues
 * that have started (config order breaks a tie). When every league that has started is complete and another
 * has not started yet, the answer is 'preseason': what happens next is that league's first game.
 *
 * Why the leagues that have STARTED, not every league (the rule before the Southern California leagues): the
 * leagues do not start together. The San Diego Section's Metro South Bay plays its first league game on Oct 7
 * (Hilltop v Southwest) and the Metro Conference's first game of any kind can come weeks after the NorCal
 * leagues' first, so "the least advanced league" read 'preseason' for the whole site deep into the NorCal
 * season. The two consumers that matter (Attribution and SiteHeader's "season complete" stamp) ask only
 * whether EVERY league is done, which this keeps exact.
 */
export function combinedPhase(phases: readonly SeasonPhase[]): SeasonPhase {
  if (phases.every((p) => p === 'preseason')) return 'preseason';
  if (phases.every((p) => p === 'complete')) return 'complete';
  let best: SeasonPhase | null = null;
  for (const phase of phases) {
    if (phase === 'preseason' || phase === 'complete') continue;
    if (best === null || PHASE_RANK[phase] < PHASE_RANK[best]) best = phase;
  }
  return best ?? 'preseason';
}
