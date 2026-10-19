/**
 * Step 10 (SPEC §7.4, §7.10): THE classification, decided once and persisted: `classifyGames`
 * (lib/engine/classify.ts) sets `postseason` then `countsFor` on every game, with the official step's
 * degraded divisions (classified by contest-type, never by membership alone).
 */

import { classifyGames } from '@/lib/engine/classify';
import type { Game } from '@/lib/model/game';
import type { DivisionId } from '@/lib/model/ids';
import type { RunContext } from '@/lib/pipeline/contract';

export function stepClassify(ctx: RunContext, games: readonly Game[], degradedDivisions: ReadonlySet<DivisionId>): Game[] {
  const out = classifyGames(games, { degradedDivisions });
  const counted = out.filter((g) => g.countsFor !== null).length;
  const post = out.filter((g) => g.postseason !== null).length;
  ctx.log(
    `  classify: ${counted} league ${counted === 1 ? 'game' : 'games'} · ${post} postseason` +
      (degradedDivisions.size ? ` · contest-type fallback for ${[...degradedDivisions].join(', ')}` : ''),
  );
  return out;
}
