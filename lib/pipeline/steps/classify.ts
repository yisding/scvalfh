/**
 * Step 10 (SPEC §7.4, §7.10): THE classification, decided once and persisted: `classifyGames`
 * (lib/classify.ts) sets `postseason` then `countsFor` on every game, with the official step's
 * degraded divisions (classified by contest-type, never by membership alone). Then, with the tags known, a level
 * final marked W and L in a game that must have a winner (a postseason game; any game of a sport with no ties)
 * becomes the marked side's win, decider 'SO' (lib/postseason/level-final.ts), before the standings step counts it.
 */

import { classifyGames } from '../../classify';
import { settleLevelFinals } from '../../postseason/level-final';
import type { DivisionId, Game } from '../../types';
import type { RunContext } from '../contract';

export function stepClassify(ctx: RunContext, games: readonly Game[], degradedDivisions: ReadonlySet<DivisionId>): Game[] {
  const classified = classifyGames(games, { degradedDivisions });
  const out = settleLevelFinals(classified);
  for (const [i, g] of out.entries()) {
    if (g === classified[i]) continue;
    const winner = g.home.result === 'W' ? g.home : g.away;
    ctx.log(`  classify: ${g.contestId} level at ${g.home.score}-${g.away.score} and marked W/L, and the game needs a winner: counted as ${winner.name}'s win`);
  }
  const counted = out.filter((g) => g.countsFor !== null).length;
  const post = out.filter((g) => g.postseason !== null).length;
  ctx.log(
    `  classify: ${counted} league ${counted === 1 ? 'game' : 'games'} · ${post} postseason` +
      (degradedDivisions.size ? ` · contest-type fallback for ${[...degradedDivisions].join(', ')}` : ''),
  );
  return out;
}
