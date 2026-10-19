/**
 * The head-to-head record of two teams (SPEC §13.3), from the games they played each other. Pure:
 * the caller passes the snapshot's games (lib/queries/teams.ts getHeadToHead resolves the references).
 */

import { recordString } from '@/lib/format/numbers';
import type { Game, Outcome, Record3 } from '@/lib/model/game';
import type { Team } from '@/lib/model/team';
import { bumpRecord, byDateLocal, sideView } from '@/lib/shared/game';

export interface HeadToHead {
  a: Team;
  b: Team;
  games: Game[];
  /** Record from A's point of view. */
  aRecord: Record3;
  bRecord: Record3;
  aGoals: number;
  bGoals: number;
  summary: string;
}

/** B's result when A's is `outcome`. */
const flip = (outcome: Outcome): Outcome => (outcome === 'W' ? 'L' : outcome === 'L' ? 'W' : 'T');

/**
 * Every game in `games` with both teams as sides, oldest first, and the record over its finals. A
 * shootout win counts as the flagged side's win (`sideOutcome`); a forfeit counts in W-L-T but its
 * goals are left out (DESIGN §11.6). `a` and `b` must be different teams.
 */
export function headToHead(games: readonly Game[], a: Team, b: Team): HeadToHead {
  const meetings = games
    .filter((g) => {
      const ids = [g.home.teamId, g.away.teamId];
      return ids.includes(a.id) && ids.includes(b.id);
    })
    .sort(byDateLocal);

  const aRecord: Record3 = { w: 0, l: 0, t: 0 };
  const bRecord: Record3 = { w: 0, l: 0, t: 0 };
  let aGoals = 0;
  let bGoals = 0;
  for (const g of meetings) {
    const view = sideView(g, a.id);
    if (!view) continue;
    if (!g.isForfeit) {
      aGoals += view.for;
      bGoals += view.against;
    }
    bumpRecord(aRecord, view.outcome);
    bumpRecord(bRecord, flip(view.outcome));
  }
  return {
    a,
    b,
    games: meetings,
    aRecord,
    bRecord,
    aGoals,
    bGoals,
    summary: `${a.shortName} ${recordString(aRecord)} vs ${b.shortName}`,
  };
}
