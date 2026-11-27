/**
 * Level finals in a sport that cannot end level: a MaxPreps JV or freshman final whose two scores are equal, in a
 * build whose sport has no ties (`Sport.scoring.allowsTies` false: basketball plays overtime until one team leads,
 * a volleyball match is won in sets), is not a result and is not taken on MaxPreps' word.
 *
 * Coaches leave a game MaxPreps lists as "final" with nothing entered, and the feed then carries 0-0 with both sides
 * marked T (read 2026-11-25 and 2026-11-27: Hollister at St. Francis (Watsonville), Nov 23, and Hollister at
 * Gonzales, Nov 21, both JV basketball). Each was once left out by hand (lib/jv/jv-corrections.ts); this rule covers
 * every such row instead. A level score marked W and L is no better: whoever won, the score is wrong. So the rule,
 * like lib/jv/jv-copied-scores.ts, withholds the score and never invents one:
 *
 *   - the row becomes a played game with no score before the other sources are merged (lib/jv/jv.ts), so si.com's
 *     JV page or a school's own site fills it where it has the game, and the game reads "score not reported" where
 *     none does, counting in no JV table;
 *   - `levelScoreNote` says what MaxPreps had and what is shown.
 *
 * Left alone: a forfeit (its score is not a game's), a final already settled as a tiebreak win (decider 'SO'), and
 * any score that is not MaxPreps' own (`provenance.scores` 'maxpreps-api'): si.com, a school's site or a hand
 * correction is another source. In a sport that allows ties nothing changes. Pure: no I/O.
 */

import { getTeamBySlug } from '../teams';
import type { ContestId, Game, GameSide } from '../types';

export interface LevelScore {
  /** MaxPreps' level score, as the row had it. */
  score: number;
}

/** Whether MaxPreps' own final is level in a sport with no ties, and so withheld. */
export function isWithheldLevelFinal(game: Game, allowsTies: boolean): boolean {
  return (
    !allowsTies &&
    game.status === 'final' &&
    game.provenance.scores === 'maxpreps-api' &&
    !game.isForfeit &&
    game.decider !== 'FORFEIT' &&
    game.decider !== 'SO' &&
    game.home.score !== null &&
    game.home.score === game.away.score
  );
}

/** The games with every withheld level final turned back into a played game with no score, and those by contest id. */
export function withholdLevelScores(
  games: readonly Game[],
  allowsTies: boolean,
): { games: Game[]; withheld: Map<ContestId, LevelScore> } {
  const withheld = new Map<ContestId, LevelScore>();
  const out = games.map((g) => {
    if (!isWithheldLevelFinal(g, allowsTies)) return g;
    withheld.set(g.contestId, { score: g.home.score as number });
    // A sentence calling the flags a contradiction is about the score withheld here.
    const provenance = { ...g.provenance };
    delete provenance.resultConflict;
    return {
      ...g,
      status: 'score-pending' as const,
      home: { ...g.home, score: null, result: null },
      away: { ...g.away, score: null, result: null },
      decider: null,
      provenance,
    };
  });
  return { games: out, withheld };
}

function shortName(side: GameSide): string {
  return (side.slug ? getTeamBySlug(side.slug)?.shortName : undefined) ?? side.name;
}

/**
 * The sentence beside a game whose MaxPreps level final was withheld: what MaxPreps had, and what is shown. `game` is
 * the game as the site lists it, after the other sources were merged; `sport` is the sport in a sentence
 * ('basketball').
 */
export function levelScoreNote(game: Game, level: LevelScore, sport: string): string {
  const had = `${level.score}-${level.score}`;
  if (game.status !== 'final' || game.home.score === null || game.away.score === null) {
    return `MaxPreps lists this game as a ${had} final, which a ${sport} game cannot be, and no other source has a score, so none is shown.`;
  }
  const source = game.provenance.scores === 'school-site' ? 'the school’s own results have' : 'si.com has';
  return `MaxPreps lists this game as a ${had} final, which a ${sport} game cannot be; ${source} ${shortName(game.away)} ${game.away.score}, ${shortName(game.home)} ${game.home.score}, which is shown.`;
}
