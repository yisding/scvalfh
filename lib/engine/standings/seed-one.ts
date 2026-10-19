/**
 * seed-one-restart (BVAL, MCAL; SPEC §5.4) and MCAL's last tournament place (SPEC §5.4b) of the
 * standings engine (lib/engine/standings.ts), on the stage keys of ./tiebreak.ts. No other part of
 * the engine imports it: the door runs `seedOne` per points bucket, and lib/engine/postseason.ts
 * reads `lastSpotOutcome` through the door.
 */

import { UNCOMPUTABLE_STAGES, drawNumberOf, tiebreakChainFor } from '@/lib/config/leagues';
import type { Game } from '@/lib/model/game';
import type { TeamId } from '@/lib/model/ids';
import type { LeagueConfig } from '@/lib/model/league-config';
import type { Standing, TiebreakStage } from '@/lib/model/standings';
import { sideView } from '@/lib/shared/game';

import { divisionGames } from './record';
import { HALT, allEqual, nameOf, slugOfId, stageKeys, type DivisionCtx } from './tiebreak';

// ---------------------------------------------------------------- seed-one-restart (BVAL, MCAL)

/**
 * How MCAL's last tournament place was settled (SPEC §5.4b), as `lastSpotSeed` decided it: one team swept
 * the other 2-0, or a play-in between `pair`. `group` is every team the case depends on (the pair, plus
 * the 5th seed in the three-way 5-7 case, or the whole bucket when three or more are level at the last
 * place); `fifth` is the 5th seed draw numbers placed in the three-way 5-7 case.
 */
export type LastSpotOutcome =
  | { kind: 'sweep'; winner: TeamId; loser: TeamId }
  | { kind: 'play-in'; pair: [TeamId, TeamId]; group: TeamId[]; fifth: TeamId | null };

interface SeedCtx extends DivisionCtx {
  bucketStart: number;
  below: TeamId[][];
  /** Written by `lastSpotSeed`, which only ever runs on the top-level (non-narrowing) path. */
  lastSpot: LastSpotOutcome | null;
  /** The three-way 5-7 case: the 5th seed placed by draw number, and its group, waiting for the pair. */
  fifth: { id: TeamId; group: TeamId[] } | null;
}

const byName = (ids: readonly TeamId[]): TeamId[] =>
  [...ids].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

/**
 * Bring the first team (or a shared first cluster) out of `group` with `chain` (SPEC §5.4).
 * `narrow` decides among several teams level on the deciding stage's best key.
 */
function pickFirst(
  group: readonly TeamId[],
  chain: readonly TiebreakStage[],
  above: readonly TeamId[],
  ctx: SeedCtx,
  narrow: (best: TeamId[]) => TeamId[],
): { cluster: TeamId[]; terminal: boolean } {
  for (const stage of chain) {
    if (UNCOMPUTABLE_STAGES.has(stage)) {
      for (const id of group) ctx.resolvedBy.set(id, stage);
      return { cluster: byName(group), terminal: true };
    }
    const keys = stageKeys(stage, group, above, ctx.below, ctx);
    if (keys === HALT) {
      const terminal = chain.find((st) => UNCOMPUTABLE_STAGES.has(st)) ?? 'coin-flip';
      for (const id of group) ctx.resolvedBy.set(id, terminal);
      return { cluster: byName(group), terminal: true };
    }
    if (keys === null) continue;
    const values = group.map((id) => keys.get(id) as number);
    if (allEqual(values)) continue;
    const max = Math.max(...values);
    const best = group.filter((id) => keys.get(id) === max);
    // Every team of the group was separated from the leader by this stage; deeper stages overwrite.
    for (const id of group) ctx.resolvedBy.set(id, stage);
    if (best.length === 1) return { cluster: best, terminal: false };
    return { cluster: narrow(best), terminal: false };
  }
  // Chain exhausted without a terminal (only possible if config is wrong): shared.
  return { cluster: byName(group), terminal: true };
}

/**
 * seed-one-restart: place one team, then restart the whole chain among the rest.
 *
 * `narrowing` is set when `group` is the subgroup a stage left level at its best key while seeding
 * one team out of a larger tie: the chain then runs among the subgroup only ("The above criteria will
 * be used to break the tie, seeding one team"). MCAL's last-place rules (the three-way 5-7 draw and the
 * play-in, SPEC §5.4b) apply to teams tied ON POINTS for those places, never to such a remainder.
 */
export function seedOne(
  group: readonly TeamId[],
  place: number,
  above: readonly TeamId[],
  ctx: SeedCtx,
  narrowing = false,
): TeamId[][] {
  if (group.length === 0) return [];
  if (group.length === 1) return [[group[0]]];
  const ps = ctx.league.postseason;
  if (!narrowing && ps.kind === 'league-tournament') {
    const L = ps.lastSpot.place;
    if (place <= L && L < place + group.length - 1) return lastSpotSeed(group, place, above, ctx);
  }
  const chain = tiebreakChainFor(ctx.division, ctx.bucketStart);
  const head = pickFirst(group, chain, above, ctx, (best) => seedOne(best, place, above, ctx, true)[0]);
  if (head.terminal) return [head.cluster];
  const rest = group.filter((id) => !head.cluster.includes(id));
  return [head.cluster, ...seedOne(rest, place + head.cluster.length, [...above, ...head.cluster], ctx, narrowing)];
}

/** MCAL Tie-Breaking Criteria for the play-in pair: criteria 1-2, then draw numbers. */
const PLAY_IN_CHAIN: readonly TiebreakStage[] = ['h2h-win-pct', 'record-above-tie', 'draw-number'];

/** MCAL's last tournament place (SPEC §5.4b): a play-in decides it unless one team swept 2-0. */
function lastSpotSeed(group: readonly TeamId[], place: number, above: readonly TeamId[], ctx: SeedCtx): TeamId[][] {
  const ps = ctx.league.postseason;
  if (ps.kind !== 'league-tournament') return seedOne(group, place, above, ctx);
  const L = ps.lastSpot.place;

  if (place < L) {
    if (group.length === 3 && place === L - 1) {
      // "tie breaking numbers will be used for placing #5"
      const drawOf = (id: TeamId): number => drawNumberOf(ctx.rules, slugOfId(id));
      const first = [...group].sort((a, b) => drawOf(a) - drawOf(b))[0];
      ctx.resolvedBy.set(first, 'draw-number');
      ctx.fifth = { id: first, group: [...group] };
      const rest = group.filter((id) => id !== first);
      return [[first], ...seedOne(rest, L, [...above, first], ctx)];
    }
    const chain = tiebreakChainFor(ctx.division, ctx.bucketStart);
    const head = pickFirst(group, chain, above, ctx, (best) => seedOne(best, place, above, ctx, true)[0]);
    if (head.terminal) return [head.cluster];
    const rest = group.filter((id) => !head.cluster.includes(id));
    return [head.cluster, ...seedOne(rest, place + head.cluster.length, [...above, ...head.cluster], ctx)];
  }

  // place === L
  if (group.length === 2) {
    const [a, b] = group;
    const meetings = ctx.games.filter((g) => {
      const ids = [g.home.teamId, g.away.teamId];
      return ids.includes(a) && ids.includes(b);
    });
    const aWins = meetings.filter((g) => sideView(g, a)?.outcome === 'W').length;
    const bWins = meetings.filter((g) => sideView(g, b)?.outcome === 'W').length;
    if (meetings.length >= 2 && (aWins === meetings.length || bWins === meetings.length)) {
      const winner = aWins === meetings.length ? a : b;
      const loser = winner === a ? b : a;
      ctx.resolvedBy.set(winner, 'h2h-win-pct');
      ctx.resolvedBy.set(loser, 'h2h-win-pct');
      ctx.lastSpot = { kind: 'sweep', winner, loser };
      return [[winner], [loser]];
    }
    // A split, a tie or an unplayed meeting: a play-in decides it.
    ctx.resolvedBy.set(a, 'play-in');
    ctx.resolvedBy.set(b, 'play-in');
    ctx.lastSpot = { kind: 'play-in', pair: [a, b], group: ctx.fifth?.group ?? [a, b], fifth: ctx.fifth?.id ?? null };
    return [byName(group)];
  }

  // Three or more level at L: "1 & 2 above … to qualify the first play in team … The criteria will
  // start OVER to determine the second".
  const pickPlayIn = (pool: readonly TeamId[], pickAbove: readonly TeamId[]): TeamId => {
    const narrow = (best: TeamId[]): TeamId[] => pickFirst(best, PLAY_IN_CHAIN, pickAbove, ctx, narrow).cluster;
    return pickFirst(pool, PLAY_IN_CHAIN, pickAbove, ctx, narrow).cluster[0];
  };
  const p1 = pickPlayIn(group, above);
  const p2 = pickPlayIn(group.filter((id) => id !== p1), [...above, p1]);
  ctx.resolvedBy.set(p1, 'play-in');
  ctx.resolvedBy.set(p2, 'play-in');
  ctx.lastSpot = { kind: 'play-in', pair: [p1, p2], group: [...group], fifth: null };
  const rest = group.filter((id) => id !== p1 && id !== p2);
  return [byName([p1, p2]), ...seedOne(rest, L + 2, [...above, p1, p2], ctx)];
}

/**
 * How the league's last tournament place is settled over `rows` (SPEC §5.4b), or null when no tie on
 * points reaches past it (or the league has no league tournament). It runs this engine's own
 * seed-one-restart over the points bucket holding the last place, with the division's counted finals
 * (`divisionGames`) and the same chain lookup, so a play-in pair is exactly the pair the table shows
 * sharing the place with `resolvedBy: 'play-in'`. lib/engine/postseason.ts builds the bracket's play-in on it.
 */
export function lastSpotOutcome(
  rows: readonly Standing[],
  games: readonly Game[],
  league: LeagueConfig,
): LastSpotOutcome | null {
  const ps = league.postseason;
  if (ps.kind !== 'league-tournament') return null;
  const L = ps.lastSpot.place;
  const divisionIds = new Set(league.divisions.map((d) => d.id));
  // Points order (the table's order is points first); the team(s) in place L are the L-th by points.
  const ranked = rows
    .filter((r) => r.hasReportedResults && divisionIds.has(r.division))
    .sort((a, b) => b.computed.pts - a.computed.pts || a.computed.place - b.computed.place);
  const atL = ranked[L - 1];
  if (!atL) return null;
  const pts = atL.computed.pts;
  const bucket = ranked.filter((r) => r.computed.pts === pts);
  const above = ranked.filter((r) => r.computed.pts > pts);
  const bucketStart = 1 + above.length;
  if (bucketStart + bucket.length - 1 <= L) return null;

  // The lower buckets as placed clusters (a shared place is one cluster), for a stage that reads them.
  const below: TeamId[][] = [];
  let last: number | null = null;
  for (const r of ranked.filter((x) => x.computed.pts < pts)) {
    if (r.computed.place === last) below[below.length - 1].push(r.teamId);
    else below.push([r.teamId]);
    last = r.computed.place;
  }
  const ctx: SeedCtx = {
    division: atL.division,
    league,
    rules: league.rules,
    games: divisionGames(games, atL.division),
    computed: new Map(rows.map((r) => [r.teamId, r.computed])),
    resolvedBy: new Map(),
    placedBelowOf: () => below,
    bucketStart,
    below,
    lastSpot: null,
    fifth: null,
  };
  seedOne(bucket.map((r) => r.teamId), bucketStart, above.map((r) => r.teamId), ctx);
  return ctx.lastSpot;
}
