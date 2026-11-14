/**
 * Standings computed from game rows: a stage interpreter driven by lib/leagues.ts (SPEC §5.2-§5.8).
 *
 * SCVAL (SCVAL Field Hockey By-Laws 2026-27) is the reference and is golden-gated byte for byte:
 * Article VI §1: the divisions play a double round robin; DIVISION GAMES ONLY count to the
 *   division record.
 * Article VI §2: 3 points for a win, 1 for a tie. "The division placement/standings will be the
 *   order of team points." A tie at the top means co-champions.
 * Article VI §3: if tied in points, better head-to-head record among the tied teams. "Work to
 *   bring one team out (once one is out start again through the tie breakers)."
 * Article VI §4: then the greater number of wins in division play.
 * Article VI §5: then the least goals given up between the tied teams.
 * Article VI §6: then goal differential between the tied teams.
 * Article VI §7: then a coin flip — which we cannot compute, so those teams SHARE a place and
 *   carry `tiebreak.shared`.
 * Article VII §2: places 1-3 are automatic qualifiers; 4th plays in on Oct 30 for the SCVAL 7th
 *   AQ; the play-in loser and both 5th-place teams go to CCS for at-large consideration.
 *
 * Every other league is the same body with its own config: points, the tiebreak chain (keyed by
 * where the tied points bucket starts), the multi-team procedure (`partition-restart` for SCVAL,
 * PCAL and EAL, `seed-one-restart` for BVAL and MCAL), MCAL's last tournament place, citations and
 * ladder. The EAL breaks no tie at all (`['no-rule']`): a tie for first is co-champions.
 *
 * MaxPreps' own row is kept verbatim on every Standing for the published cross-check: its De Anza
 * arithmetic is internally suspect (Homestead and Cupertino both report 0 league goals for),
 * which is exactly why we compute and publish the disagreement instead of trusting it.
 *
 * Its neighbours in lib/standings/ hold the rest: ladder.ts (playoff statuses and their copy),
 * cross-check.ts (the MaxPreps comparison), missing.ts (missing league results) and pairings.ts.
 */

import { byDateThenId, recordString, sideOutcome, winPct as pctString } from '../format';
import type { LeagueConfig, LeagueRules } from '../league-config/shape';
import {
  LEAGUES,
  PLACE_VS_STAGES,
  UNCOMPUTABLE_STAGES,
  divisionLabel,
  drawNumberOf,
  tiebreakChainFor,
} from '../leagues';
import { TEAMS, getTeamById, teamsInDivision } from '../teams';
import type {
  ComputedRecord,
  DivisionId,
  Game,
  Outcome,
  Record3,
  ReportedRecord,
  Standing,
  Team,
  TeamId,
  TeamSlug,
  TiebreakInfo,
  TiebreakStage,
} from '../types';
import { compareToReported } from './cross-check';
import { playoffStatusFor } from './ladder';

// ---------------------------------------------------------------- accumulation

interface Tally {
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

const emptyRecord3 = (): Record3 => ({ w: 0, l: 0, t: 0 });

const emptyTally = (): Tally => ({
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

function bump(rec: { w: number; l: number; t: number }, outcome: Outcome): void {
  if (outcome === 'W') rec.w += 1;
  else if (outcome === 'L') rec.l += 1;
  else rec.t += 1;
}

/** CIF convention: a tie is half a win. Asserted against MaxPreps' own pct (SPEC §5.6). */
const winPct = (r: { w: number; t: number; gp: number }): number => (r.gp > 0 ? (r.w + r.t / 2) / r.gp : 0);

/**
 * A completed game as seen from one team. Returns null when the team is not in it. The outcome is
 * `sideOutcome`'s (lib/format.ts), so a shootout win (decider 'SO', level on goals: an EAL 1 v 1 win, a San
 * Diego Section shootout MaxPreps records as a level score marked W and L) counts as the
 * flagged side's win while its goals stay as recorded.
 */
function perspective(
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

function accumulate(tally: Tally, game: Game, teamId: TeamId): void {
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
function toComputed(tally: Tally, place: number, points: Points): ComputedRecord {
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
 * lib/jv/jv-standings.ts builds the JV tables with it.
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

/** Everything a stage key may read for one division. */
interface DivisionCtx {
  division: DivisionId;
  league: LeagueConfig;
  rules: LeagueRules;
  /** The division's counted finals. */
  games: readonly Game[];
  computed: Map<TeamId, ComputedRecord>;
  resolvedBy: Map<TeamId, TiebreakStage>;
  /** The lower points buckets, final order, as clusters (filled bucket by bucket). */
  placedBelowOf: (bucketIndex: number) => TeamId[][];
  /**
   * The teams each team was left level with (a shared place), filled as a group ends unresolved under
   * partition-restart. 'record-vs-placed' reads it: a level group above the tie has no order among its
   * members, so it is walked as one cluster, never member by member in the order the names happen to sort.
   */
  levelWith?: Map<TeamId, readonly TeamId[]>;
  /** Teams whose tie stopped on a meeting not yet played (HALT), not on the chain's last step: their note says so. */
  halted?: Set<TeamId>;
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

const allEqual = (values: readonly number[]): boolean => values.every((v) => v === values[0]);

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
const HALT = 'halt' as const;

/**
 * Stage keys, higher is better; `null` = the stage is skipped for this group; `HALT` = the chain stops
 * here, unresolved (SPEC §5.5). `head-to-head`, `division-wins`, `h2h-goals-against` and
 * `h2h-goal-diff` are SCVAL's original stages (golden-gated).
 */
function stageKeys(
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
    case 'h2h-sets-won':
    case 'h2h-set-ratio':
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
        } else if (stage === 'h2h-sets-won') {
          // "Sets won in head-to-head league matches" (a team's stored `gf` is its sets won in volleyball).
          key = row.gf;
        } else if (stage === 'h2h-set-ratio') {
          // "Sets won/loss ratio amongst the tied teams", as the share of those sets won: the same order as the
          // ratio, defined when a team has lost none, and for two teams the same as "sets won head to head".
          key = row.gf + row.ga === 0 ? 0 : row.gf / (row.gf + row.ga);
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
    case 'record-vs-placed': {
      // SCVAL basketball Art. VI §1.1: "record vs. highest placed opponent in league (descending order)". Walk
      // every other team from first place down: the teams above the tie in their placed order, then the teams
      // below it, a group still level there as one cluster. The first opponent the tied teams did not all do
      // equally well against separates them; a meeting not yet played, or a level cluster they split
      // differently against, stops the walk (no invented result, no order the table does not have).
      const walked = new Set<TeamId>();
      for (const target of above) {
        if (walked.has(target)) continue;
        // A group left level above the tie shares one place: the tied teams must have done equally well
        // against every member of it, or the walk stops (as for a level cluster below).
        const cluster = ctx.levelWith?.get(target) ?? [target];
        for (const member of cluster) walked.add(member);
        if (cluster.length > 1) {
          for (const member of cluster) {
            const k = pointsVsEach(ctx, group, member);
            if (k === null || !allEqual(k)) return HALT;
          }
          continue;
        }
        const k = pointsVsEach(ctx, group, target);
        if (k === null) return HALT;
        if (allEqual(k)) continue;
        group.forEach((id, i) => out.set(id, k[i]));
        return out;
      }
      for (const cluster of below) {
        if (cluster.length === 1) {
          const k = pointsVsEach(ctx, group, cluster[0]);
          if (k === null) return HALT;
          if (allEqual(k)) continue;
          group.forEach((id, i) => out.set(id, k[i]));
          return out;
        }
        for (const member of cluster) {
          const k = pointsVsEach(ctx, group, member);
          if (k === null || !allEqual(k)) return HALT;
        }
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
      // 'points', 'ccs-points', 'coin-flip', 'coaches-vote', 'set-points', 'second-meeting', 'no-rule', 'play-in': never keyed.
      return null;
  }
}

/** The chain split into its computable stages and its terminal uncomputable stage (if any). */
function splitChain(chain: readonly TiebreakStage[]): {
  stages: TiebreakStage[];
  terminal: TiebreakStage | null;
} {
  const last = chain[chain.length - 1];
  if (last !== undefined && UNCOMPUTABLE_STAGES.has(last)) {
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
function resolveGroup(
  group: readonly TeamId[],
  chain: readonly TiebreakStage[],
  above: readonly TeamId[],
  below: readonly TeamId[][],
  ctx: DivisionCtx,
): TeamId[][] {
  if (group.length <= 1) return [[...group]];
  const { stages, terminal } = splitChain(chain);

  let halted = false;
  for (const stage of stages) {
    const keys = stageKeys(stage, group, above, below, ctx);
    if (keys === HALT) {
      halted = true;
      break;
    }
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
    // Under 'record-vs-placed' a sub-bucket's walk also reads the tie-mates this stage has just placed beneath
    // it (they are neither above it nor in the lower buckets): each later sub-bucket as far as the stages
    // before the walk settle it. Other chains keep the lower places they were given.
    const walks = chain.includes('record-vs-placed');
    buckets.forEach((bucket, k) => {
      // Recorded now and overwritten by a deeper stage if this bucket splits again, so the note
      // always names the step that actually separated the team from its last tie-mates.
      for (const id of bucket) ctx.resolvedBy.set(id, stage);
      const beneath = walks ? [...buckets.slice(k + 1).flatMap((b) => settledBeforeWalk(b, chain, ctx)), ...below] : below;
      out.push(...resolveGroup(bucket, chain, [...above, ...out.flat()], beneath, ctx));
    });
    return out;
  }

  // Unresolved ⇒ an uncomputable last step (SCVAL Article VI §7's coin flip). The teams stay tied.
  for (const id of group) ctx.resolvedBy.set(id, terminal ?? 'coin-flip');
  for (const id of group) ctx.levelWith?.set(id, group);
  if (halted) for (const id of group) ctx.halted?.add(id);
  return [[...group].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))];
}

/**
 * A tied group as far as the stages BEFORE 'record-vs-placed' settle it (SCVAL basketball: head-to-head), in
 * order, a part still level as one cluster. It is what a higher tie's walk may read of a lower tie before
 * that lower tie is resolved itself: those stages read nothing outside the group, so the order they give is
 * the order the table will show, and whatever they leave level is treated as level (never guessed).
 * Resolved on a scratch context, so nothing here reaches a note or a place.
 */
function settledBeforeWalk(group: readonly TeamId[], chain: readonly TiebreakStage[], ctx: DivisionCtx): TeamId[][] {
  if (group.length <= 1) return [[...group]];
  const before = chain.slice(0, chain.indexOf('record-vs-placed'));
  if (before.length === 0) return [[...group]];
  const scratch: DivisionCtx = { ...ctx, resolvedBy: new Map(), levelWith: new Map(), halted: new Set() };
  return resolveGroup(group, [...before, 'coin-flip'], [], [], scratch);
}

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
function seedOne(
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
    const aWins = meetings.filter((g) => perspective(g, a)?.outcome === 'W').length;
    const bWins = meetings.filter((g) => perspective(g, b)?.outcome === 'W').length;
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
 * sharing the place with `resolvedBy: 'play-in'`. lib/postseason/postseason.ts builds the bracket's play-in on it.
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

function nameOf(id: TeamId): string {
  return getTeamById(id)?.name ?? id;
}

function slugOfId(id: TeamId): TeamSlug {
  return getTeamById(id)?.slug ?? id;
}

// ---------------------------------------------------------------- reported rows

export function toReportedRecord(
  row: Omit<ReportedRecord, 'streakResult'> & { streakResult: string | null },
): ReportedRecord {
  const streakResult =
    row.streakResult === 'W' || row.streakResult === 'L' || row.streakResult === 'T'
      ? row.streakResult
      : null;
  return { ...row, streakResult };
}

// ---------------------------------------------------------------- main

export interface ComputeOptions {
  /** MaxPreps' reported rows, keyed on schoolId. */
  reported?: ReadonlyMap<TeamId, ReportedRecord>;
}

/** Loops LEAGUES → divisions → teamsInDivision; per division: the SCVAL procedure, with rules from config. */
export function computeStandings(
  games: readonly Game[],
  opts: ComputeOptions = {},
): Standing[] {
  const out: Standing[] = [];
  // Sorted like divisionGames: the overall record's last5 and streak read the order (si.com-only games
  // lib/crosscheck/backfill.ts builds are appended to the array, not placed by date).
  const allFinals = games.filter((g) => g.status === 'final').sort(byDateThenId);
  for (const league of LEAGUES) {
    for (const div of league.divisions) {
      out.push(...computeDivision(league, div.id, games, allFinals, opts));
    }
  }
  return out;
}

function computeDivision(
  league: LeagueConfig,
  division: DivisionId,
  games: readonly Game[],
  allFinals: readonly Game[],
  opts: ComputeOptions,
): Standing[] {
  const { rules } = league;
  const teams = teamsInDivision(division);
  const counted = divisionGames(games, division);

  const tallies = new Map<TeamId, Tally>();
  const overallTallies = new Map<TeamId, Tally>();
  for (const team of teams) {
    const t = emptyTally();
    const o = emptyTally();
    for (const g of counted) accumulate(t, g, team.id);
    for (const g of allFinals) accumulate(o, g, team.id);
    tallies.set(team.id, t);
    overallTallies.set(team.id, o);
  }

  const computed = new Map<TeamId, ComputedRecord>(
    teams.map((team) => [team.id, toComputed(tallies.get(team.id)!, 0, rules.points)]),
  );

  // Order by points, or by the share of league games won where the league's record orders the table
  // (rules.orderBy 'win-pct': SCVAL basketball). Teams with no reported results sort last (DESIGN §8).
  const orderKey = (id: TeamId): number =>
    rules.orderBy === 'win-pct' ? computed.get(id)!.winPct : computed.get(id)!.pts;
  const played = teams.filter((t) => computed.get(t.id)!.gp > 0).map((t) => t.id);
  const unplayed = teams
    .filter((t) => computed.get(t.id)!.gp === 0)
    .map((t) => t.id)
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  const byPoints = new Map<number, TeamId[]>();
  for (const id of played) {
    const pts = orderKey(id);
    const bucket = byPoints.get(pts);
    if (bucket) bucket.push(id);
    else byPoints.set(pts, [id]);
  }

  // Points buckets, top-down, with the place each one starts at.
  const buckets: Array<{ group: TeamId[]; start: number; chain: readonly TiebreakStage[] }> = [];
  let start = 1;
  for (const pts of [...byPoints.keys()].sort((a, b) => b - a)) {
    const group = byPoints.get(pts)!;
    buckets.push({ group, start, chain: tiebreakChainFor(division, start) });
    start += group.length;
  }

  const resolvedBy = new Map<TeamId, TiebreakStage>();
  const resolved: Array<TeamId[][] | null> = buckets.map(() => null);
  const ctx: DivisionCtx = {
    division,
    league,
    rules,
    games: counted,
    computed,
    resolvedBy,
    placedBelowOf: (i) => resolved.slice(i + 1).flatMap((r) => r ?? []),
    levelWith: new Map(),
    halted: new Set(),
  };

  const resolveBucket = (i: number): void => {
    const { group, start: bucketStart, chain } = buckets[i];
    if (group.length === 1) {
      resolvedBy.set(group[0], 'points');
      resolved[i] = [[group[0]]];
      return;
    }
    const above = resolved.slice(0, i).flatMap((r) => (r ?? []).flat());
    // 'record-vs-placed' reads every lower bucket, a bucket not settled yet as one level cluster; the other
    // place-relative stages read only the lower places already settled (SPEC §5.4a).
    const below = chain.includes('record-vs-placed')
      ? buckets.slice(i + 1).flatMap((b, k) => resolved[i + 1 + k] ?? settledBeforeWalk(b.group, b.chain, ctx))
      : ctx.placedBelowOf(i);
    if (rules.multiTeam === 'partition-restart') {
      resolved[i] = resolveGroup(group, chain, above, below, ctx);
    } else {
      resolved[i] = seedOne(group, bucketStart, above, { ...ctx, bucketStart, below, lastSpot: null, fifth: null });
    }
  };

  // Two passes (SPEC §5.4a): buckets whose chain reads other places go last, so the places they
  // read are settled. For SCVAL every bucket is pass 1, and its order is unchanged from the goldens.
  const pass2 = (i: number): boolean =>
    buckets[i].group.length > 1 && buckets[i].chain.some((s) => PLACE_VS_STAGES.has(s));
  buckets.forEach((_, i) => {
    if (!pass2(i)) resolveBucket(i);
  });
  buckets.forEach((_, i) => {
    if (pass2(i)) resolveBucket(i);
  });

  const clusters: TeamId[][] = resolved.flatMap((r) => r ?? []);

  // Standard competition ranking: a shared place consumes its own slots.
  let place = 0;
  const order: Array<{ id: TeamId; place: number; cluster: TeamId[] }> = [];
  for (const cluster of clusters) {
    place += 1;
    for (const id of cluster) order.push({ id, place, cluster });
    place += cluster.length - 1;
  }
  for (const id of unplayed) {
    place += 1;
    order.push({ id, place, cluster: [id] });
    resolvedBy.set(id, 'points');
  }

  const rows: Standing[] = [];
  for (const entry of order) {
    const team = getTeamById(entry.id)!;
    const record = toComputed(tallies.get(entry.id)!, entry.place, rules.points);
    const overall = toComputed(overallTallies.get(entry.id)!, entry.place, rules.points);
    const reported = opts.reported?.get(entry.id) ?? null;
    const shared = entry.cluster.length > 1;
    const stage = resolvedBy.get(entry.id) ?? 'points';
    const tiebreak: TiebreakInfo = {
      resolvedBy: stage,
      note: tiebreakNote(team, record, stage, entry.cluster, rules, ctx.halted?.has(entry.id) ?? false),
      tiedWith: shared ? entry.cluster.filter((id) => id !== entry.id) : [],
      shared,
    };
    const { mismatch, detail } = compareToReported(record, overall, reported);
    rows.push({
      teamId: entry.id,
      slug: team.slug,
      division,
      computed: record,
      overall,
      reported,
      mismatch,
      ...(detail ? { mismatchDetail: detail } : {}),
      tiebreak,
      playoffStatus: playoffStatusFor(division, entry.place),
      hasReportedResults: record.gp > 0,
    });
  }
  return rows;
}

/** Notes (SPEC §5.6), rendered verbatim. SCVAL's strings are pinned by the goldens. */
function tiebreakNote(
  team: Team,
  record: ComputedRecord,
  stage: TiebreakStage,
  cluster: readonly TeamId[],
  rules: LeagueRules,
  halted = false,
): string {
  const { citations, points } = rules;
  // A league ordered on its league record (rules.orderBy 'win-pct') has no points to name: its notes give
  // the record and its percentage instead.
  const byRecord = rules.orderBy === 'win-pct';
  const orderWords = byRecord ? 'league record' : 'team points';
  const level = byRecord
    ? `Level at ${recordString(record)} (${pctString(record.winPct)})`
    : `Tied on ${record.pts} points`;
  if (record.gp === 0) {
    // A 'site' league's team with no counted game may simply have none yet (a Sunset team plays only the
    // games MaxPreps marks as league games; Metro South Bay's first is Oct 7), so its note says the games
    // are not counted, never that results are missing.
    const none =
      rules.orderScope === 'site'
        ? `No ${rules.gamesWord} games counted for ${team.name} yet`
        : `No ${rules.gamesWord} results reported for ${team.name}`;
    return `${none}, so it is listed last; ${divisionLabel(team.division)} order is the order of ${orderWords} (${citations.order}).`;
  }
  if (stage === 'points') {
    // For a 'site' league (the Sunset, the San Diego leagues) `order` says no league document orders the
    // table: '3 points (3 per win, 1 per tie) — placed on points alone, no league document orders the
    // table; this site orders it by its own 3-1-0 points.' Never 'as the rules require'.
    if (byRecord) {
      return `${recordString(record)} in ${rules.gamesWord} games (${pctString(record.winPct)}) — placed on its league record alone, ${citations.order}.`;
    }
    return `${record.pts} points (${points.win} per win, ${points.tie} per tie) — placed on points alone, ${citations.order}.`;
  }
  const others = cluster.filter((id) => id !== team.id).map(nameOf);
  const tiedWith = others.length ? ` with ${others.join(', ')}` : '';
  if (stage === 'play-in') {
    return `${level}${tiedWith} for the last tournament place — ${citations.stages['play-in'] ?? ''}. We show them level.`;
  }
  if (UNCOMPUTABLE_STAGES.has(stage) && halted) {
    // The chain stopped on a meeting not yet played, not on its last step: say that, not "every criterion".
    return `${level}${tiedWith}; not separable yet, because the tied teams have not all played the opponents the next step compares them on. We show them level.`;
  }
  if (UNCOMPUTABLE_STAGES.has(stage)) {
    return `${level}${tiedWith} and unresolved by every criterion — ${citations.stages[stage] ?? ''}. We show them level.`;
  }
  return `${level}; separated by ${citations.stages[stage] ?? stage}.`;
}

// ---------------------------------------------------------------- UI order and table guard

/** Sort helper for the UI: place, then name. */
export function sortStandings(rows: readonly Standing[]): Standing[] {
  return [...rows].sort(
    (a, b) =>
      a.computed.place - b.computed.place ||
      nameOf(a.teamId).localeCompare(nameOf(b.teamId)),
  );
}

/** Every registry team must appear exactly once (DESIGN §12.1). */
export function assertFullTable(rows: readonly Standing[]): void {
  if (rows.length !== TEAMS.length) {
    throw new Error(`standings has ${rows.length} rows, expected ${TEAMS.length}`);
  }
  const seen = new Set(rows.map((r) => r.teamId));
  for (const team of TEAMS) {
    if (!seen.has(team.id)) throw new Error(`standings is missing ${team.slug}`);
  }
}
