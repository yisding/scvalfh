/**
 * JV scores that are the varsity game's score: a MaxPreps JV final whose score is exactly the score of the varsity
 * final of the same two schools on the same day is not taken on MaxPreps' word.
 *
 * Coaches enter a JV result after the varsity one, often on the same screen, and some JV rows carry the varsity
 * score instead of their own. On 2026-11-21 the field hockey JV file had 31 MaxPreps JV finals scored exactly like
 * the same day's varsity game; where another source has the JV game it sometimes disagrees: Santa Clara's own JV
 * results and si.com have Los Gatos at Santa Clara, Sep 15, 12-0 where MaxPreps' JV row has the varsity 7-2; si.com
 * has Canyon Hills 5-0 over Great Oak (MaxPreps JV and varsity 9-0) and La Jolla 3-0 at Cathedral Catholic (MaxPreps
 * JV and varsity 1-0). A tie of the same two numbers can also be a real coincidence, so the rule withholds the score,
 * never invents one:
 *
 *   - the JV row loses its score before the other sources are merged (lib/jv/jv.ts), so si.com's JV page
 *     (lib/jv/jv-merge.ts, rule 2) or a school's own site (lib/jv/jv-school-sites.ts) fills it where it has the game:
 *     the score shown is that source's, marked †, whether it agrees with MaxPreps or not;
 *   - where no other source has the game, it reads "score not reported" and counts in no JV table;
 *   - either way `jvCopiedScoreNote` says what MaxPreps had and what is shown.
 *
 * Only MaxPreps' own JV scores are tested (`provenance.scores` 'maxpreps-api'): a score already from si.com, a
 * school's site or a hand correction (lib/jv/jv-corrections.ts scoreFixes) is another source's. Pure: no I/O.
 */

import { getTeamBySlug } from '../teams';
import type { ContestId, Game, GameSide } from '../types';

export interface JvCopiedScore {
  /** The varsity final whose score the JV row has. */
  varsityContestId: ContestId;
  /** MaxPreps' JV score, as the JV row has it. */
  maxpreps: { home: number; away: number };
}

const pairKey = (g: Pick<Game, 'dateKey' | 'home' | 'away'>): string | null =>
  g.home.teamId && g.away.teamId ? `${g.dateKey}|${[g.home.teamId, g.away.teamId].sort().join('|')}` : null;

/** A side's score by team id, for comparing two games whose home and away may be swapped. */
function scoresById(g: Game): Map<string | null, number | null> {
  return new Map([
    [g.home.teamId, g.home.score],
    [g.away.teamId, g.away.score],
  ]);
}

/**
 * The JV games with every MaxPreps JV final that copies its varsity game's score turned back into a played game with
 * no score, and those games by contest id.
 */
export function withholdCopiedScores(
  jvGames: readonly Game[],
  varsityGames: readonly Game[],
): { games: Game[]; withheld: Map<ContestId, JvCopiedScore> } {
  const varsity = new Map<string, Game[]>();
  for (const v of varsityGames) {
    if (v.status !== 'final' || v.home.score === null || v.away.score === null) continue;
    const key = pairKey(v);
    if (key) varsity.set(key, [...(varsity.get(key) ?? []), v]);
  }
  const withheld = new Map<ContestId, JvCopiedScore>();
  const games = jvGames.map((g) => {
    if (g.status !== 'final' || g.provenance.scores !== 'maxpreps-api' || g.home.score === null || g.away.score === null) return g;
    const key = pairKey(g);
    const mine = scoresById(g);
    const twin = (key ? varsity.get(key) : undefined)?.find((v) => {
      const theirs = scoresById(v);
      return [...mine].every(([id, score]) => theirs.get(id) === score);
    });
    if (!twin) return g;
    withheld.set(g.contestId, { varsityContestId: twin.contestId, maxpreps: { home: g.home.score, away: g.away.score } });
    return {
      ...g,
      status: 'score-pending' as const,
      home: { ...g.home, score: null, result: null },
      away: { ...g.away, score: null, result: null },
      decider: null,
    };
  });
  return { games, withheld };
}

function shortName(side: GameSide): string {
  return (side.slug ? getTeamBySlug(side.slug)?.shortName : undefined) ?? side.name;
}

/**
 * The sentence beside a JV game whose MaxPreps score was the varsity game's: what MaxPreps had, and what is shown.
 * `game` is the game as the site lists it, after the other sources were merged.
 */
export function jvCopiedScoreNote(game: Game, copied: JvCopiedScore): string {
  const had = `${shortName(game.away)} ${copied.maxpreps.away}, ${shortName(game.home)} ${copied.maxpreps.home}`;
  if (game.status !== 'final' || game.home.score === null || game.away.score === null) {
    return `MaxPreps’ JV score (${had}) is the varsity game’s score that day, and no other source has this JV game, so it is not shown.`;
  }
  const source = game.provenance.scores === 'school-site' ? 'the school’s own JV results have' : 'si.com’s JV page has';
  const same = game.home.score === copied.maxpreps.home && game.away.score === copied.maxpreps.away;
  return same
    ? `MaxPreps’ JV score is the varsity game’s score that day; ${source} the same score, which is shown.`
    : `MaxPreps’ JV score (${had}) is the varsity game’s score that day; ${source} ${shortName(game.away)} ${game.away.score}, ${shortName(game.home)} ${game.home.score}, which is shown.`;
}
