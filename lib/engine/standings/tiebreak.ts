/**
 * The tiebreak stages and the partition-restart procedure (SCVAL, PCAL, EAL; SPEC §5.3, §5.5) of the
 * standings engine (lib/engine/standings.ts). A stage key reads the division's counted finals through
 * ./record.ts; seed-one-restart (./seed-one.ts) walks the same stage keys one team at a time.
 */

import { drawNumberOf } from '@/lib/config/leagues';
import type { Game } from '@/lib/model/game';
import type { DivisionId, TeamId, TeamSlug } from '@/lib/model/ids';
import type { LeagueConfig, LeagueRules } from '@/lib/model/league-config';
import type { ComputedRecord, TiebreakStage } from '@/lib/model/standings';
import { getTeamById } from '@/lib/registry/teams';

import { bump, emptyRecord3, perspective, winPct } from './record';

// ---------------------------------------------------------------- tiebreakers

interface H2H {
  gp: number;
  w: number;
  l: number;
  t: number;
  gf: number;
  ga: number;
}

const emptyH2H = (): H2H => ({ gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0 });

/** Head-to-head sub-table over the games played among `group` only (Article VI §3, §5, §6). */
function headToHead(group: readonly TeamId[], games: readonly Game[]): Map<TeamId, H2H> {
  const set = new Set(group);
  const out = new Map<TeamId, H2H>(group.map((id) => [id, emptyH2H()]));
  for (const game of games) {
    const h = game.home.teamId;
    const a = game.away.teamId;
    if (!h || !a || !set.has(h) || !set.has(a)) continue;
    for (const id of [h, a]) {
      const view = perspective(game, id);
      const row = out.get(id);
      if (!view || !row) continue;
      row.gp += 1;
      bump(row, view.outcome);
      if (!game.isForfeit) {
        row.gf += view.for;
        row.ga += view.against;
      }
    }
  }
  return out;
}

/** Stages the interpreter cannot compute: the teams stay level with the league's citation. */
export const UNCOMPUTABLE: ReadonlySet<TiebreakStage> = new Set<TiebreakStage>([
  'coin-flip',
  'ccs-points',
  'no-rule',
]);

/** Everything a stage key may read for one division. */
export interface DivisionCtx {
  division: DivisionId;
  league: LeagueConfig;
  rules: LeagueRules;
  /** The division's counted finals. */
  games: readonly Game[];
  computed: Map<TeamId, ComputedRecord>;
  resolvedBy: Map<TeamId, TiebreakStage>;
  /** The lower points buckets, final order, as clusters (filled bucket by bucket). */
  placedBelowOf: (bucketIndex: number) => TeamId[][];
}

/** Points team `id` earned in its meetings with `other` (win·w + tie·t over their counted games). */
function pointsVs(ctx: DivisionCtx, id: TeamId, other: TeamId): { pts: number; gp: number } {
  let pts = 0;
  let gp = 0;
  for (const g of ctx.games) {
    const ids = [g.home.teamId, g.away.teamId];
    if (!ids.includes(id) || !ids.includes(other)) continue;
    const view = perspective(g, id);
    if (!view) continue;
    gp += 1;
    if (view.outcome === 'W') pts += ctx.rules.points.win;
    else if (view.outcome === 'T') pts += ctx.rules.points.tie;
    else pts += ctx.rules.points.loss;
  }
  return { pts, gp };
}

export const allEqual = (values: readonly number[]): boolean => values.every((v) => v === values[0]);

/**
 * Points each team of `group` earned against `target` (PCAL §23.3.1(b)/§23.3.3(c): "compare one team
 * at a time"), or `null` when the tied teams have not all met `target` the same number of times (at
 * least once): an unplayed meeting is not a 0-point meeting, so it can neither separate nor be
 * passed over (SPEC §5.5).
 */
function pointsVsEach(ctx: DivisionCtx, group: readonly TeamId[], target: TeamId): number[] | null {
  const r = group.map((id) => pointsVs(ctx, id, target));
  if (r.some((x) => x.gp === 0) || !allEqual(r.map((x) => x.gp))) return null;
  return r.map((x) => x.pts);
}

/**
 * A stage that cannot be applied YET: the tied teams have not all met the placed team it must compare
 * them on. Skipping to the next stage would decide the tie on the steps the by-laws put after it, so
 * the chain stops and the teams stay level on its terminal uncomputable stage (SPEC §5.5).
 */
export const HALT = 'halt' as const;

/**
 * Stage keys, higher is better; `null` = the stage is skipped for this group; `HALT` = the chain stops
 * here, unresolved (SPEC §5.5). `head-to-head`, `division-wins`, `h2h-goals-against` and
 * `h2h-goal-diff` are SCVAL's original stages (golden-gated).
 */
export function stageKeys(
  stage: TiebreakStage,
  group: readonly TeamId[],
  above: readonly TeamId[],
  below: readonly TeamId[][],
  ctx: DivisionCtx,
): Map<TeamId, number> | null | typeof HALT {
  const { rules } = ctx;
  const out = new Map<TeamId, number>();
  switch (stage) {
    case 'head-to-head':
    case 'h2h-goals-against':
    case 'h2h-goal-diff':
    case 'h2h-win-pct': {
      const h2h = headToHead(group, ctx.games);
      const gps = group.map((id) => h2h.get(id)?.gp ?? 0);
      const allEqualGp = gps.every((g) => g === gps[0]);
      if (stage === 'h2h-win-pct' && gps.some((g) => g === 0)) return null;
      if (stage === 'head-to-head' && rules.h2hUnmet === 'skip' && gps.some((g) => g === 0)) return null;
      for (const id of group) {
        const row = h2h.get(id) ?? emptyH2H();
        let key: number;
        if (stage === 'head-to-head') {
          // "Better head-to-head record". With an equal number of head-to-head games the by-laws'
          // own currency (points) ranks them; with an unequal number (mid-season, or an unplayed
          // fixture) points would reward the team that simply played more, so use win percentage.
          key = allEqualGp ? rules.points.win * row.w + rules.points.tie * row.t : winPct(row);
        } else if (stage === 'h2h-goals-against') {
          // "Least goals given up between head to head teams tied" — fewer is better.
          key = -row.ga;
        } else if (stage === 'h2h-goal-diff') {
          key = row.gf - row.ga;
        } else {
          key = winPct(row);
        }
        out.set(id, key);
      }
      return out;
    }
    case 'division-wins':
      for (const id of group) out.set(id, ctx.computed.get(id)?.w ?? 0);
      return out;
    case 'division-goals-against':
      for (const id of group) out.set(id, -(ctx.computed.get(id)?.ga ?? 0));
      return out;
    case 'record-above-tie': {
      if (above.length === 0) return null;
      for (const id of group) {
        const rec = { ...emptyRecord3(), gp: 0 };
        for (const g of ctx.games) {
          const ids = [g.home.teamId, g.away.teamId];
          if (!ids.includes(id)) continue;
          const other = g.home.teamId === id ? g.away.teamId : g.home.teamId;
          if (!other || !above.includes(other)) continue;
          const view = perspective(g, id);
          if (!view) continue;
          rec.gp += 1;
          bump(rec, view.outcome);
        }
        if (rec.gp === 0) return null;
        out.set(id, winPct(rec));
      }
      return out;
    }
    case 'record-vs-higher-placed': {
      for (const target of above) {
        const k = pointsVsEach(ctx, group, target);
        // A meeting not yet played (or not played as often) stops the walk: no invented 0.
        if (k === null) return HALT;
        if (allEqual(k)) continue;
        group.forEach((id, i) => out.set(id, k[i]));
        return out;
      }
      return null;
    }
    case 'record-vs-lower-placed': {
      for (const cluster of below) {
        if (cluster.length === 1) {
          const k = pointsVsEach(ctx, group, cluster[0]);
          if (k === null) return HALT;
          if (allEqual(k)) continue;
          group.forEach((id, i) => out.set(id, k[i]));
          return out;
        }
        // A shared lower cluster: its internal order is undefined, so it can only be passed over
        // when every member of it gives the tied teams equal points.
        for (const member of cluster) {
          const k = pointsVsEach(ctx, group, member);
          if (k === null) return HALT;
          if (!allEqual(k)) return null;
        }
      }
      return null;
    }
    case 'draw-number': {
      if (!rules.drawNumbers) return null;
      for (const id of group) out.set(id, -drawNumberOf(rules, slugOfId(id)));
      return out;
    }
    default:
      // 'points', 'ccs-points', 'coin-flip', 'no-rule', 'play-in': never keyed.
      return null;
  }
}

/** The chain split into its computable stages and its terminal uncomputable stage (if any). */
function splitChain(chain: readonly TiebreakStage[]): {
  stages: TiebreakStage[];
  terminal: TiebreakStage | null;
} {
  const last = chain[chain.length - 1];
  if (last !== undefined && UNCOMPUTABLE.has(last)) {
    return { stages: chain.slice(0, -1), terminal: last };
  }
  return { stages: [...chain], terminal: null };
}

// ---------------------------------------------------------------- partition-restart (SCVAL, PCAL, EAL)

/**
 * The original SCVAL `resolveGroup`, parameterized (SPEC §5.3): `chain` is the chain of the ORIGINAL points
 * bucket; a stage key of `null` skips the stage; the terminal uncomputable stage replaces the
 * literal 'coin-flip'.
 */
export function resolveGroup(
  group: readonly TeamId[],
  chain: readonly TiebreakStage[],
  above: readonly TeamId[],
  below: readonly TeamId[][],
  ctx: DivisionCtx,
): TeamId[][] {
  if (group.length <= 1) return [[...group]];
  const { stages, terminal } = splitChain(chain);

  for (const stage of stages) {
    const keys = stageKeys(stage, group, above, below, ctx);
    if (keys === HALT) break;
    if (keys === null) continue;
    const keyed = group.map((id) => ({ id, key: keys.get(id) as number }));
    const distinct = new Set(keyed.map((k) => k.key));
    if (distinct.size === 1) continue;

    // This stage brings at least one team out. Partition into buckets, best first, then start
    // the chain again for each bucket (Article VI §3: "once one is out start again").
    const buckets = [...distinct]
      .sort((a, b) => b - a)
      .map((key) => keyed.filter((k) => k.key === key).map((k) => k.id));
    const out: TeamId[][] = [];
    for (const bucket of buckets) {
      // Recorded now and overwritten by a deeper stage if this bucket splits again, so the note
      // always names the step that actually separated the team from its last tie-mates.
      for (const id of bucket) ctx.resolvedBy.set(id, stage);
      out.push(...resolveGroup(bucket, chain, [...above, ...out.flat()], below, ctx));
    }
    return out;
  }

  // Unresolved ⇒ an uncomputable last step (SCVAL Article VI §7's coin flip). The teams stay tied.
  for (const id of group) ctx.resolvedBy.set(id, terminal ?? 'coin-flip');
  return [[...group].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))];
}

// ---------------------------------------------------------------- team names

export function nameOf(id: TeamId): string {
  return getTeamById(id)?.name ?? id;
}

export function slugOfId(id: TeamId): TeamSlug {
  return getTeamById(id)?.slug ?? id;
}
