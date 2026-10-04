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
 */

import { recordString, shortDate, sideOutcome } from './format';
import {
  LEAGUES,
  divisionLabel,
  getDivision,
  getLeague,
  ladderFor,
  ladderRung,
  leagueOfDivision,
  leagueStandingsUrl,
  tiebreakChainFor,
} from './leagues';
import type { LadderRung, LeagueConfig, LeagueRules } from './leagues';
import { TEAMS, getTeamById, teamsInDivision } from './teams';
import type {
  ComputedRecord,
  CrossCheckRow,
  CrossoverSeat,
  DivisionId,
  Game,
  LeagueId,
  LeaguePairing,
  OfficialFixture,
  Outcome,
  PlayoffStatus,
  Record3,
  ReportedRecord,
  Standing,
  Team,
  TeamId,
  TeamSlug,
  TiebreakInfo,
  TiebreakStage,
} from './types';

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

function bump(rec: Record3, outcome: Outcome): void {
  if (outcome === 'W') rec.w += 1;
  else if (outcome === 'L') rec.l += 1;
  else rec.t += 1;
}

/**
 * A completed game as seen from one team. Returns null when the team is not in it. The outcome is
 * `sideOutcome`'s (lib/format.ts), so an EAL 1 v 1 win (decider 'SO', level on goals) counts as the
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
  if (view.outcome === 'W') tally.w += 1;
  else if (view.outcome === 'L') tally.l += 1;
  else tally.t += 1;
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
    // CIF convention: a tie is half a win. Asserted against MaxPreps' own pct (SPEC §5.6).
    winPct: gp > 0 ? (w + t / 2) / gp : 0,
    // The league's points (3-1-0 in all five leagues; SCVAL Article VI §2).
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

/** Oldest first; a contest id breaks a tie so the order never depends on how the pipeline built the array. */
function byDateLocal(a: Game, b: Game): number {
  return a.dateLocal.localeCompare(b.dateLocal) || a.contestId.localeCompare(b.contestId);
}

/** countsFor === division && status === 'final', sorted by dateLocal (SCVAL Article VI §1). */
export function divisionGames(games: readonly Game[], division: DivisionId): Game[] {
  return games.filter((g) => g.countsFor === division && g.status === 'final').sort(byDateLocal);
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
      if (view.outcome === 'W') row.w += 1;
      else if (view.outcome === 'L') row.l += 1;
      else row.t += 1;
      if (!game.isForfeit) {
        row.gf += view.for;
        row.ga += view.against;
      }
    }
  }
  return out;
}

/** Stages the interpreter cannot compute: the teams stay level with the league's citation. */
const UNCOMPUTABLE: ReadonlySet<TiebreakStage> = new Set<TiebreakStage>([
  'coin-flip',
  'ccs-points',
  'no-rule',
]);

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
          key = allEqualGp
            ? rules.points.win * row.w + rules.points.tie * row.t
            : row.gp > 0
              ? (row.w + row.t / 2) / row.gp
              : 0;
        } else if (stage === 'h2h-goals-against') {
          // "Least goals given up between head to head teams tied" — fewer is better.
          key = -row.ga;
        } else if (stage === 'h2h-goal-diff') {
          key = row.gf - row.ga;
        } else {
          key = (row.w + row.t / 2) / row.gp;
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
        let w = 0;
        let t = 0;
        let gp = 0;
        for (const g of ctx.games) {
          const ids = [g.home.teamId, g.away.teamId];
          if (!ids.includes(id)) continue;
          const other = g.home.teamId === id ? g.away.teamId : g.home.teamId;
          if (!other || !above.includes(other)) continue;
          const view = perspective(g, id);
          if (!view) continue;
          gp += 1;
          if (view.outcome === 'W') w += 1;
          else if (view.outcome === 'T') t += 1;
        }
        if (gp === 0) return null;
        out.set(id, (w + t / 2) / gp);
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
      const draws = rules.drawNumbers;
      if (!draws) return null;
      for (const id of group) {
        const slug = getTeamById(id)?.slug;
        const n = slug === undefined ? undefined : draws[slug];
        if (n === undefined) return null;
        out.set(id, -n);
      }
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
function resolveGroup(
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

// ---------------------------------------------------------------- seed-one-restart (BVAL, MCAL)

interface SeedCtx extends DivisionCtx {
  bucketStart: number;
  below: TeamId[][];
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
    if (UNCOMPUTABLE.has(stage)) {
      for (const id of group) ctx.resolvedBy.set(id, stage);
      return { cluster: byName(group), terminal: true };
    }
    const keys = stageKeys(stage, group, above, ctx.below, ctx);
    if (keys === HALT) {
      const terminal = chain.find((st) => UNCOMPUTABLE.has(st)) ?? 'coin-flip';
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
      const draws = ctx.rules.drawNumbers ?? {};
      const drawOf = (id: TeamId): number => draws[getTeamById(id)?.slug ?? ''] ?? Number.MAX_SAFE_INTEGER;
      const first = [...group].sort((a, b) => drawOf(a) - drawOf(b))[0];
      ctx.resolvedBy.set(first, 'draw-number');
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
      return [[winner], [loser]];
    }
    // A split, a tie or an unplayed meeting: a play-in decides it.
    ctx.resolvedBy.set(a, 'play-in');
    ctx.resolvedBy.set(b, 'play-in');
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
  const rest = group.filter((id) => id !== p1 && id !== p2);
  return [byName([p1, p2]), ...seedOne(rest, L + 2, [...above, p1, p2], ctx)];
}

function nameOf(id: TeamId): string {
  return getTeamById(id)?.name ?? id;
}

// ---------------------------------------------------------------- reported rows

export function toReportedRecord(row: {
  conferenceWins: number;
  conferenceLosses: number;
  conferenceTies: number;
  overallWins: number;
  overallLosses: number;
  overallTies: number;
  conferencePoints: number;
  conferencePointsAgainst: number;
  points: number;
  pointsAgainst: number;
  conferenceContestsPlayed: number;
  overallContestsPlayed: number;
  conferenceStandingPlacement: number | null;
  conferenceWinningPercentage: number;
  winningPercentage: number;
  streak: number;
  streakResult: string | null;
  homeWins: number; homeLosses: number; homeTies: number;
  awayWins: number; awayLosses: number; awayTies: number;
  neutralWins: number; neutralLosses: number; neutralTies: number;
  modifiedOn: string;
}): ReportedRecord {
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

const PLACE_VS_STAGES: ReadonlySet<TiebreakStage> = new Set<TiebreakStage>([
  'record-vs-higher-placed',
  'record-vs-lower-placed',
]);

/** Loops LEAGUES → divisions → teamsInDivision; per division: the SCVAL procedure, with rules from config. */
export function computeStandings(
  games: readonly Game[],
  opts: ComputeOptions = {},
): Standing[] {
  const out: Standing[] = [];
  // Sorted like divisionGames: the overall record's last5 and streak read the order (si.com-only games
  // lib/backfill.ts builds are appended to the array, not placed by date).
  const allFinals = games.filter((g) => g.status === 'final').sort(byDateLocal);
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

  // Order by points. Teams with no reported results sort last (DESIGN §8).
  const played = teams.filter((t) => computed.get(t.id)!.gp > 0).map((t) => t.id);
  const unplayed = teams
    .filter((t) => computed.get(t.id)!.gp === 0)
    .map((t) => t.id)
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  const byPoints = new Map<number, TeamId[]>();
  for (const id of played) {
    const pts = computed.get(id)!.pts;
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
  };

  const resolveBucket = (i: number): void => {
    const { group, start: bucketStart, chain } = buckets[i];
    if (group.length === 1) {
      resolvedBy.set(group[0], 'points');
      resolved[i] = [[group[0]]];
      return;
    }
    const above = resolved.slice(0, i).flatMap((r) => (r ?? []).flat());
    const below = ctx.placedBelowOf(i);
    if (rules.multiTeam === 'partition-restart') {
      resolved[i] = resolveGroup(group, chain, above, below, ctx);
    } else {
      resolved[i] = seedOne(group, bucketStart, above, { ...ctx, bucketStart, below });
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
      note: tiebreakNote(team, record, stage, entry.cluster, rules),
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
): string {
  const { citations, points } = rules;
  if (record.gp === 0) {
    return `No ${rules.gamesWord} results reported for ${team.name}, so it is listed last; ${divisionLabel(team.division)} order is the order of team points (${citations.order}).`;
  }
  if (stage === 'points') {
    return `${record.pts} points (${points.win} per win, ${points.tie} per tie) — placed on points alone, ${citations.order}.`;
  }
  const others = cluster.filter((id) => id !== team.id).map(nameOf);
  const tiedWith = others.length ? ` with ${others.join(', ')}` : '';
  if (stage === 'play-in') {
    return `Tied on ${record.pts} points${tiedWith} for the last tournament place — ${citations.stages['play-in'] ?? ''}. We show them level.`;
  }
  if (UNCOMPUTABLE.has(stage)) {
    return `Tied on ${record.pts} points${tiedWith} and unresolved by every criterion — ${citations.stages[stage] ?? ''}. We show them level.`;
  }
  return `Tied on ${record.pts} points; separated by ${citations.stages[stage] ?? stage}.`;
}

function compareToReported(
  computed: ComputedRecord,
  overall: ComputedRecord,
  reported: ReportedRecord | null,
): { mismatch: boolean; detail?: string } {
  if (!reported) return { mismatch: false };
  const diffs: string[] = [];
  const ours = recordString(computed);
  const theirs = recordString({
    w: reported.conferenceWins,
    l: reported.conferenceLosses,
    t: reported.conferenceTies,
  });
  if (ours !== theirs) diffs.push(`league record ${ours} vs MaxPreps ${theirs}`);

  const oursOverall = recordString(overall);
  const theirsOverall = recordString({
    w: reported.overallWins,
    l: reported.overallLosses,
    t: reported.overallTies,
  });
  if (oursOverall !== theirsOverall) {
    diffs.push(`overall record ${oursOverall} vs MaxPreps ${theirsOverall}`);
  }
  if (computed.gf !== reported.conferencePoints || computed.ga !== reported.conferencePointsAgainst) {
    diffs.push(
      `league goals ${computed.gf}-${computed.ga} vs MaxPreps ` +
        `${reported.conferencePoints}-${reported.conferencePointsAgainst}`,
    );
  }
  // Place is deliberately NOT a mismatch: MaxPreps orders on win percentage while the by-laws
  // order on points (Article VI §2), so a place difference is a rules difference, not an
  // arithmetic error. It is still published as a cross-check row.
  return diffs.length ? { mismatch: true, detail: diffs.join('; ') } : { mismatch: false };
}

/**
 * Field-by-field cross-check rows for /about#cross-check (DESIGN §9), by the division's
 * `reportedTrust` (SPEC §5.8): 'full' = all six fields; 'records-only' = records and league
 * goals; 'informational' = league record only. Rows of a division with a known cause carry it.
 */
export function buildCrossCheck(standings: readonly Standing[]): CrossCheckRow[] {
  const rows: CrossCheckRow[] = [];
  for (const s of standings) {
    const r = s.reported;
    if (!r) continue;
    const div = getDivision(s.division);
    const trust = div.reportedTrust;
    const url = leagueStandingsUrl(s.division);
    const push = (field: string, ours: string, theirs: string) => {
      if (ours === theirs) return;
      rows.push({
        slug: s.slug,
        field,
        ours,
        theirs,
        url,
        ...(div.knownCause ? { knownCause: div.knownCause } : {}),
      });
    };
    push(
      'league record',
      recordString(s.computed),
      recordString({ w: r.conferenceWins, l: r.conferenceLosses, t: r.conferenceTies }),
    );
    if (trust === 'informational') continue;
    push(
      'overall record',
      recordString(s.overall),
      recordString({ w: r.overallWins, l: r.overallLosses, t: r.overallTies }),
    );
    push('league goals for', String(s.computed.gf), String(r.conferencePoints));
    push('league goals against', String(s.computed.ga), String(r.conferencePointsAgainst));
    if (trust === 'records-only') continue;
    push(
      `place (we order on points, ${getLeague(div.leagueId).rules.citations.pointsShort}; MaxPreps orders on win pct)`,
      String(s.computed.place),
      r.conferenceStandingPlacement === null ? '—' : String(r.conferenceStandingPlacement),
    );
    push(
      'win pct',
      s.computed.winPct.toFixed(3),
      r.conferenceWinningPercentage.toFixed(3),
    );
  }
  return rows;
}

// ---------------------------------------------------------------- missing official results

export interface MissingOfficialRow {
  kind: 'missing' | 'postponed';
  dateKey: string;
  awayName: string;
  homeName: string;
  awaySlug: TeamSlug | null;
  homeSlug: TeamSlug | null;
  game: Game | null;
}

const NOT_YET_REPORTED: ReadonlySet<Game['status']> = new Set<Game['status']>([
  'scheduled',
  'live',
  'score-pending',
]);

/**
 * THE single definition of 'league result missing', used by the pipeline's DivisionHealth
 * (`official.missingPast`; `missingLeaguePast` for a division with no official schedule) AND by
 * lib/data getMissingOfficialResults/getStandingContext. Pure. Sorted by dateKey, then fixture id
 * (the contest id where there is no fixture).
 *
 * A fixture-backed division: unmatched fixtures of `division` dated before `today` (kind 'missing',
 * game null), plus matched contests (official.division === division, official.scheduledDate < today)
 * with status 'scheduled' | 'live' | 'score-pending' (kind 'missing') or 'postponed' (kind
 * 'postponed', never counted as missing).
 *
 * A division whose league publishes no schedule (`official.mode === 'none'`: the EAL): there
 * are no fixtures, so the rows are its classified games (countsFor === division) dated before
 * `today`, with the same status rule and the contest id in place of a fixture id.
 */
export function missingOfficialResults(
  games: readonly Game[],
  unmatched: readonly OfficialFixture[],
  division: DivisionId,
  today: string,
): MissingOfficialRow[] {
  const rows: Array<MissingOfficialRow & { fixtureId: string }> = [];
  if (getDivision(division).official.mode === 'none') {
    for (const g of games) {
      if (g.countsFor !== division || !(g.dateKey < today)) continue;
      const kind = missingKindOf(g);
      if (kind === null) continue;
      rows.push({
        kind,
        dateKey: g.dateKey,
        awayName: g.away.name,
        homeName: g.home.name,
        awaySlug: g.away.slug,
        homeSlug: g.home.slug,
        game: g,
        fixtureId: g.contestId,
      });
    }
    return sortMissing(rows);
  }
  for (const f of unmatched) {
    if (f.division !== division || !(f.dateKey < today)) continue;
    rows.push({
      kind: 'missing',
      dateKey: f.dateKey,
      awayName: f.awayName,
      homeName: f.homeName,
      awaySlug: f.awaySlug,
      homeSlug: f.homeSlug,
      game: null,
      fixtureId: f.id,
    });
  }
  for (const g of games) {
    const o = g.official;
    if (!o || o.division !== division || !(o.scheduledDate < today)) continue;
    const kind = missingKindOf(g);
    if (kind === null) continue;
    rows.push({
      kind,
      dateKey: o.scheduledDate,
      awayName: g.away.name,
      homeName: g.home.name,
      awaySlug: g.away.slug,
      homeSlug: g.home.slug,
      game: g,
      fixtureId: o.fixtureId,
    });
  }
  return sortMissing(rows);
}

/** 'postponed' for a postponed game, 'missing' for one not yet reported, null once it has a result. */
function missingKindOf(g: Game): MissingOfficialRow['kind'] | null {
  if (g.status === 'postponed') return 'postponed';
  if (NOT_YET_REPORTED.has(g.status)) return 'missing';
  return null;
}

function sortMissing(rows: Array<MissingOfficialRow & { fixtureId: string }>): MissingOfficialRow[] {
  rows.sort((a, b) =>
    a.dateKey === b.dateKey ? a.fixtureId.localeCompare(b.fixtureId) : a.dateKey.localeCompare(b.dateKey),
  );
  return rows.map((row) => ({
    kind: row.kind,
    dateKey: row.dateKey,
    awayName: row.awayName,
    homeName: row.homeName,
    awaySlug: row.awaySlug,
    homeSlug: row.homeSlug,
    game: row.game,
  }));
}

// ---------------------------------------------------------------- ladder (SPEC §5.7)

/** The rung of `ladderFor(division)` whose places cover `place`. */
export function playoffStatusFor(division: DivisionId, place: number): PlayoffStatus {
  return ladderRung(division, place).status;
}

/**
 * Every status a team could still take, best first.
 *
 * Places use standard competition ranking, so `place` is the team's 1-based finishing SLOT and a
 * cluster left level by an uncomputable step spans as many slots as it has teams. Two SCVAL teams
 * level on 3rd therefore hold the third automatic berth AND the 4th-place play-in spot between
 * them: reading `place` alone would label both of them "AQ" and make the play-in slot — and the
 * Oct 30 pairing built from it — disappear from the division. Neither slot is ever dropped here;
 * the tied teams carry both possibilities until the league decides.
 */
export function playoffOutcomes(division: DivisionId, place: number, clusterSize = 1): PlayoffStatus[] {
  const size = Math.max(1, clusterSize);
  const out: PlayoffStatus[] = [];
  for (let slot = place; slot < place + size; slot += 1) {
    const status = playoffStatusFor(division, slot);
    if (!out.includes(status)) out.push(status);
  }
  return out;
}

/** `playoffOutcomes` for a ranked row: the cluster size is the tied group it belongs to. */
export function outcomesFor(row: Standing): PlayoffStatus[] {
  return playoffOutcomes(row.division, row.computed.place, row.tiebreak.tiedWith.length + 1);
}

/** The division's rung for a status (falling back to the league's ladder); throws when none exists. */
function rungFor(division: DivisionId, status: PlayoffStatus): LadderRung {
  const rung =
    ladderFor(division).find((r) => r.status === status) ??
    leagueOfDivision(division).postseason.ladder.find((r) => r.status === status);
  if (!rung) throw new Error(`lib/standings.ts: no ladder rung ${status} for ${division}`);
  return rung;
}

/**
 * 'Automatic qualifier', or '<label> or <phrase> <unresolvedSuffix>' when a level place straddles
 * rungs (SCVAL: 'Automatic qualifier or the Oct 30 play-in — Article VI §7 decides it with a coin flip').
 */
export function playoffOutcomeLabel(division: DivisionId, outcomes: readonly PlayoffStatus[]): string {
  const [first, ...rest] = outcomes;
  if (first === undefined) {
    const ladder = ladderFor(division);
    return ladder[ladder.length - 1].label;
  }
  const label = rungFor(division, first).label;
  if (rest.length === 0) return label;
  const tail = rest.map((status) => rungFor(division, status).phrase).join(' or ');
  const suffix = leagueOfDivision(division).rules.unresolvedSuffix;
  return suffix ? `${label} or ${tail} ${suffix}` : `${label} or ${tail}`;
}

/** The first pairing date of the league (the `{date}` in ladder legends), if it has pairings. */
function firstPairingDate(league: LeagueConfig): string | null {
  return league.postseason.kind === 'ccs-ladder' ? (league.postseason.pairings[0]?.date ?? null) : null;
}

/** The rung's legend with '{date}' replaced by shortDate(first pairing date of the league). */
export function statusLegend(division: DivisionId, status: PlayoffStatus): string {
  const legend = rungFor(division, status).legend;
  const date = firstPairingDate(leagueOfDivision(division));
  return date ? legend.replace('{date}', shortDate(date)) : legend;
}

export function statusBadge(division: DivisionId, status: PlayoffStatus): string {
  return rungFor(division, status).badge;
}

// ---------------------------------------------------------------- pairings (SPEC §5.7)

/**
 * Generalized crossoverPairings(): the league's config pairings (SCVAL crossover ×4, BVAL play-in),
 * each seat filled by the team whose cluster COVERS that slot, not by an exact `place ===` match:
 * with two teams level on 3rd nobody carries place 4, and an exact match would quietly render the
 * play-in pairing as empty. Such a seat returns every contender for it, and the UI says in words
 * that the tie has not been decided. `game` is the matched contest once MaxPreps has it.
 */
export function leaguePairings(
  standings: readonly Standing[],
  games: readonly Game[],
  leagueId: LeagueId,
): LeaguePairing[] {
  const league = getLeague(leagueId);
  if (league.postseason.kind !== 'ccs-ladder') return [];
  const at = (division: DivisionId, seed: number): CrossoverSeat =>
    standings
      .filter(
        (row) =>
          row.division === division &&
          row.hasReportedResults &&
          row.computed.place <= seed &&
          seed < row.computed.place + row.tiebreak.tiedWith.length + 1,
      )
      .map((row) => ({ teamId: row.teamId, slug: row.slug }));
  return league.postseason.pairings.map((p) => {
    const seats: [CrossoverSeat, CrossoverSeat] = [
      at(p.seats[0].division, p.seats[0].place),
      at(p.seats[1].division, p.seats[1].place),
    ];
    const ids0 = new Set(seats[0].map((s) => s.teamId));
    const ids1 = new Set(seats[1].map((s) => s.teamId));
    const game =
      games.find((g) => {
        if (g.postseason?.kind !== p.tag || g.dateKey !== p.date) return false;
        const h = g.home.teamId ?? '';
        const a = g.away.teamId ?? '';
        return (ids0.has(h) && ids1.has(a)) || (ids0.has(a) && ids1.has(h));
      }) ?? null;
    return {
      id: p.id,
      leagueId,
      date: p.date,
      time: p.time,
      seats,
      seatLabels: [p.seatLabels[0], p.seatLabels[1]],
      host: p.host,
      isPlayIn: p.isPlayIn,
      label: p.label,
      game,
    };
  });
}

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
