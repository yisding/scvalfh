/**
 * Standings computed from game rows: a stage interpreter driven by lib/config/leagues.ts (SPEC §5.2-§5.8).
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
 * This module is the package's door: it runs the procedure (computeStandings, computeDivision, the
 * tiebreak notes) and re-exports the public names of its parts in lib/engine/standings/: record.ts (one
 * team's record from game rows), tiebreak.ts (the stage keys and partition-restart), seed-one.ts
 * (seed-one-restart and MCAL's last tournament place), maxpreps-crosscheck.ts, missing.ts (missing league
 * results), ladder.ts (playoff statuses and the config lookups of their copy), pairings.ts and uneven.ts.
 * The sentences the engine prints beside a table (the uneven-games sentence, the ladder's label, legend and
 * badge) are lib/format/standings.ts.
 */

import { LEAGUES, tiebreakChainFor } from '@/lib/config/leagues';
import { divisionLabel } from '@/lib/config/leagues/labels';
import type { Game } from '@/lib/model/game';
import type { DivisionId, TeamId } from '@/lib/model/ids';
import type { LeagueConfig, LeagueRules } from '@/lib/model/league-config';
import type {
  ComputedRecord, ReportedRecord, Standing, TiebreakInfo, TiebreakStage,
} from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';
import { TEAMS, getTeamById, teamsInDivision } from '@/lib/registry/teams';
import { byDateThenId } from '@/lib/shared/game';

import { playoffStatusFor } from './standings/ladder';
import { compareToReported } from './standings/maxpreps-crosscheck';
import { type Tally, accumulate, divisionGames, emptyTally, toComputed } from './standings/record';
import { seedOne } from './standings/seed-one';
import { type DivisionCtx, UNCOMPUTABLE, nameOf, resolveGroup } from './standings/tiebreak';

export {
  outcomesFor, playoffOutcomeLabel, playoffOutcomes, playoffStatusFor, statusBadge, statusLegend,
} from './standings/ladder';
export { buildCrossCheck, crossCheckSkipReason } from './standings/maxpreps-crosscheck';
export { missingOfficialResults, type MissingOfficialRow } from './standings/missing';
export { leaguePairings } from './standings/pairings';
export { divisionGames, recordOver } from './standings/record';
export { lastSpotOutcome, type LastSpotOutcome } from './standings/seed-one';
export { unevenGamesSentence } from './standings/uneven';

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
    // A 'site' league's team with no counted game may simply have none yet (a Sunset team plays only the
    // games MaxPreps marks as league games; Metro South Bay's first is Oct 7), so its note says the games
    // are not counted, never that results are missing.
    const none =
      rules.orderScope === 'site'
        ? `No ${rules.gamesWord} games counted for ${team.name} yet`
        : `No ${rules.gamesWord} results reported for ${team.name}`;
    return `${none}, so it is listed last; ${divisionLabel(team.division)} order is the order of team points (${citations.order}).`;
  }
  if (stage === 'points') {
    // For a 'site' league (the Sunset, the San Diego leagues) `order` says no league document orders the
    // table: '3 points (3 per win, 1 per tie) — placed on points alone, no league document orders the
    // table; this site orders it by its own 3-1-0 points.' Never 'as the rules require'.
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
