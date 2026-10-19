/**
 * One team's record from game rows: the accumulation every standings row goes through (SCVAL
 * Article VI §1-§2). A leaf of the standings engine (lib/engine/standings.ts): it imports
 * only types and lib/shared/game.ts.
 */

import type { Game, Outcome, Record3 } from '@/lib/model/game';
import type { DivisionId, TeamId } from '@/lib/model/ids';
import type { LeagueRules } from '@/lib/model/league-config';
import type { ComputedRecord } from '@/lib/model/standings';
import { byDateThenId, sideOutcome } from '@/lib/shared/game';

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

export function bump(rec: { w: number; l: number; t: number }, outcome: Outcome): void {
  if (outcome === 'W') rec.w += 1;
  else if (outcome === 'L') rec.l += 1;
  else rec.t += 1;
}

/** CIF convention: a tie is half a win. Asserted against MaxPreps' own pct (SPEC §5.6). */
export const winPct = (r: { w: number; t: number; gp: number }): number => (r.gp > 0 ? (r.w + r.t / 2) / r.gp : 0);

/**
 * A completed game as seen from one team. Returns null when the team is not in it. The outcome is
 * `sideOutcome`'s (lib/shared/game.ts), so a shootout win (decider 'SO', level on goals: an EAL 1 v 1 win, a San
 * Diego Section shootout MaxPreps records as a level score marked W and L) counts as the
 * flagged side's win while its goals stay as recorded.
 */
export function perspective(
  game: Game,
  teamId: TeamId,
): { for: number; against: number; outcome: Outcome; site: Game['site'] } | null {
  const isHome = game.home.teamId === teamId;
  const isAway = game.away.teamId === teamId;
  if (!isHome && !isAway) return null;
  const mine = isHome ? game.home : game.away;
  const theirs = isHome ? game.away : game.home;
  if (mine.score === null || theirs.score === null) return null;
  const outcome = sideOutcome(game, isHome ? 'home' : 'away');
  if (outcome === null) return null;
  return {
    for: mine.score,
    against: theirs.score,
    outcome,
    site: game.site === 'neutral' ? 'neutral' : isHome ? 'home' : 'away',
  };
}

export function accumulate(tally: Tally, game: Game, teamId: TeamId): void {
  const view = perspective(game, teamId);
  if (!view) return;
  tally.gp += 1;
  bump(tally, view.outcome);
  // Forfeits count in W-L-T but NOT in goals (DESIGN §11.6).
  if (!game.isForfeit) {
    tally.gf += view.for;
    tally.ga += view.against;
  }
  bump(
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
