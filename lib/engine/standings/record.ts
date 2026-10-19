/**
 * One team's record from game rows: the accumulation every standings row goes through (SCVAL
 * Article VI §1-§2). A leaf of the standings engine (lib/engine/standings.ts): it imports
 * only types and lib/shared/game.ts.
 */

import type { Game, Outcome, Record3 } from '@/lib/model/game';
import type { DivisionId, TeamId } from '@/lib/model/ids';
import type { LeagueRules } from '@/lib/model/league-config';
import type { ComputedRecord } from '@/lib/model/standings';
import { bumpRecord, byDateThenId, sideView } from '@/lib/shared/game';

// ---------------------------------------------------------------- accumulation

export interface Tally {
  gp: number;
  w: number;
  l: number;
  t: number;
  gf: number;
  ga: number;
  home: Record3;
  away: Record3;
  neutral: Record3;
  /** Oldest → newest. */
  results: Outcome[];
}

export const emptyRecord3 = (): Record3 => ({ w: 0, l: 0, t: 0 });

export const emptyTally = (): Tally => ({
  gp: 0,
  w: 0,
  l: 0,
  t: 0,
  gf: 0,
  ga: 0,
  home: emptyRecord3(),
  away: emptyRecord3(),
  neutral: emptyRecord3(),
  results: [],
});

/** CIF convention: a tie is half a win. Asserted against MaxPreps' own pct (SPEC §5.6). */
export const winPct = (r: { w: number; t: number; gp: number }): number => (r.gp > 0 ? (r.w + r.t / 2) / r.gp : 0);

export function accumulate(tally: Tally, game: Game, teamId: TeamId): void {
  const view = sideView(game, teamId);
  if (!view) return;
  tally.gp += 1;
  bumpRecord(tally, view.outcome);
  // Forfeits count in W-L-T but NOT in goals (DESIGN §11.6); sideView returns the recorded goals either way.
  if (!game.isForfeit) {
    tally.gf += view.for;
    tally.ga += view.against;
  }
  bumpRecord(
    view.site === 'home' ? tally.home : view.site === 'away' ? tally.away : tally.neutral,
    view.outcome,
  );
  tally.results.push(view.outcome);
}

type Points = LeagueRules['points'];

/** Tally → the published record. `place` is filled in once the order is known. */
export function toComputed(tally: Tally, place: number, points: Points): ComputedRecord {
  const { gp, w, l, t } = tally;
  const last5 = tally.results.slice(-5);
  let streak: ComputedRecord['streak'] = null;
  if (tally.results.length > 0) {
    const newest = tally.results[tally.results.length - 1];
    let count = 0;
    for (let i = tally.results.length - 1; i >= 0 && tally.results[i] === newest; i -= 1) count += 1;
    streak = { count, result: newest };
  }
  return {
    gp,
    w,
    l,
    t,
    winPct: winPct(tally),
    // The league's points (3-1-0 in all nine leagues: SCVAL Article VI §2; this site's own for the 'site' leagues).
    pts: points.win * w + points.tie * t + points.loss * l,
    gf: tally.gf,
    ga: tally.ga,
    gd: tally.gf - tally.ga,
    streak,
    last5,
    homeRecord: tally.home,
    awayRecord: tally.away,
    neutralRecord: tally.neutral,
    place,
  };
}

/**
 * One team's record over `games` (finals, oldest first), with the league's `points` and a given
 * `place`: the same accumulation every varsity row goes through (forfeits in W-L-T, not in goals).
 * lib/engine/jv/standings.ts builds the JV tables with it.
 */
export function recordOver(games: readonly Game[], teamId: TeamId, points: Points, place: number): ComputedRecord {
  const tally = emptyTally();
  for (const g of games) accumulate(tally, g, teamId);
  return toComputed(tally, place, points);
}

/** countsFor === division && status === 'final', oldest first (`byDateThenId`; SCVAL Article VI §1). */
export function divisionGames(games: readonly Game[], division: DivisionId): Game[] {
  return games.filter((g) => g.countsFor === division && g.status === 'final').sort(byDateThenId);
}
