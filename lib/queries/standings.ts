/**
 * The standings in the snapshot (SPEC §13.3): each division's sorted table, the derived per-row facts
 * (§5.10), co-leaders, the official fixtures with no reported result, and the games-played spread.
 */

import { ALL_DIVISIONS, getDivision, leagueOfDivision } from '@/lib/config/leagues';
import { getSnapshot } from '@/lib/datasets/snapshot';
import { divisionGames, missingOfficialResults, sortStandings } from '@/lib/engine/standings';
import type { MissingOfficialRow } from '@/lib/engine/standings';
import type { DivisionId, TeamId, TeamSlug } from '@/lib/model/ids';
import type { SeasonPhase } from '@/lib/model/season';
import type { Standing } from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';
import { getTeamById, getTeamBySlug } from '@/lib/registry/teams';
import { localDateKey } from '@/lib/shared/dates';
import { getSeasonPhase } from './phase';
import { resolveTeamRef } from './teams';

const snapshot = getSnapshot();

// ---------------------------------------------------------------- standings

export function getStandings(division: DivisionId): Standing[] {
  return sortStandings(snapshot.standings.filter((s) => s.division === division));
}

export function getAllStandings(): Record<DivisionId, Standing[]> {
  const out: Record<DivisionId, Standing[]> = {};
  for (const d of ALL_DIVISIONS) out[d.id] = getStandings(d.id);
  return out;
}

export function getStandingFor(ref: string): Standing | undefined {
  const team = resolveTeamRef(ref);
  return team ? snapshot.standings.find((s) => s.teamId === team.id) : undefined;
}

/** max |gd| in a division — the GoalDiffBar domain, per division (DESIGN §5.6). */
export function getGoalDiffDomain(division: DivisionId): number {
  const values = getStandings(division).map((s) => Math.abs(s.computed.gd));
  return Math.max(1, ...values);
}

// ---------------------------------------------------------------- derived per-row facts (§5.10)

export interface StandingContext {
  teamId: TeamId;
  /**
   * division.gamesPerTeam. null where the league has no fixed schedule (the Sunset: its ten teams meet 0, 1
   * or 2 times, and a Sunset game is one MaxPreps marks as a league game), so no reader may print "of N",
   * LEFT or MAX for it (DESIGN-socal §2.1.7).
   */
  scheduled: number | null;
  /** computed.gp */
  counted: number;
  /**
   * max(0, scheduled − counted): league games with no counted result yet — still to play, or played and not
   * reported. null with `scheduled`.
   */
  remaining: number | null;
  /** pts + points.win × remaining. A ceiling, not a projection. null with `scheduled`. */
  maxPts: number | null;
  /** Rows of kind 'missing' from missingOfficialResults() (lib/engine/standings/missing.ts) that involve this team. */
  missingPast: number;
  /** Counted games whose score came from si.com (provenance.scores === 'sblive'). */
  backfilled: number;
}

function missingRows(division: DivisionId, asOf?: string): MissingOfficialRow[] {
  const today = localDateKey(asOf ?? snapshot.fetchedAt);
  return missingOfficialResults(snapshot.games, snapshot.officialFixtures ?? [], division, today);
}

export function getStandingContext(division: DivisionId, asOf?: string): ReadonlyMap<TeamId, StandingContext> {
  const d = getDivision(division);
  const { points } = leagueOfDivision(division).rules;
  const missing = missingRows(division, asOf).filter((r) => r.kind === 'missing');
  const counted = divisionGames(snapshot.games, division);
  const out = new Map<TeamId, StandingContext>();
  for (const row of getStandings(division)) {
    const remaining = d.gamesPerTeam === null ? null : Math.max(0, d.gamesPerTeam - row.computed.gp);
    out.set(row.teamId, {
      teamId: row.teamId,
      scheduled: d.gamesPerTeam,
      counted: row.computed.gp,
      remaining,
      maxPts: remaining === null ? null : row.computed.pts + points.win * remaining,
      missingPast: missing.filter((m) => m.homeSlug === row.slug || m.awaySlug === row.slug).length,
      backfilled: counted.filter(
        (g) =>
          (g.home.teamId === row.teamId || g.away.teamId === row.teamId) &&
          g.provenance.scores === 'sblive',
      ).length,
    });
  }
  return out;
}

export interface CoLeaders {
  /** ≥2 teams with gp > 0 level on the top points. */
  teams: Team[];
  /** league regular phase is over AND no missingPast in the division ⇒ use rules.coChampionsLabel */
  final: boolean;
  /** final ? rules.coChampionsLabel : 'Level on points at the top' */
  label: string;
}

const PRE_FINAL_PHASES: ReadonlySet<SeasonPhase> = new Set<SeasonPhase>(['preseason', 'regular']);

export function getCoLeaders(division: DivisionId, asOf?: string): CoLeaders | null {
  const rows = getStandings(division).filter((s) => s.hasReportedResults);
  if (rows.length < 2) return null;
  const top = Math.max(...rows.map((s) => s.computed.pts));
  const level = rows.filter((s) => s.computed.pts === top);
  if (level.length < 2) return null;
  const league = leagueOfDivision(division);
  const final =
    !PRE_FINAL_PHASES.has(getSeasonPhase(league.id, asOf)) &&
    missingRows(division, asOf).every((r) => r.kind !== 'missing');
  return {
    teams: level.map((s) => getTeamById(s.teamId)).filter((t): t is Team => t !== undefined),
    final,
    label: final ? league.rules.coChampionsLabel : 'Level on points at the top',
  };
}

/** missingOfficialResults() rows (§5.2), enriched for the UI. */
export interface MissingOfficialResult extends MissingOfficialRow {
  /** si.com's score from the cross-check when D2 did NOT publish it, with the SbliveOnlyRow note saying why. */
  sblive: { home: number; away: number; note: string } | null;
}

/** The si.com-only row for a missing result: by contest id, or by date and both team names. */
function sbliveFor(row: MissingOfficialRow): MissingOfficialResult['sblive'] {
  const x = snapshot.sbliveCrossCheck;
  if (!x) return null;
  const nameOf = (slug: TeamSlug | null, fallback: string) =>
    (slug ? getTeamBySlug(slug)?.name : undefined) ?? fallback;
  const away = nameOf(row.awaySlug, row.awayName).toLowerCase();
  const home = nameOf(row.homeSlug, row.homeName).toLowerCase();
  const hit = x.sbliveOnlyScored.find((s) =>
    row.game
      ? s.contestId === row.game.contestId
      : s.dateKey === row.dateKey &&
        s.label.toLowerCase().includes(away) &&
        s.label.toLowerCase().includes(home),
  );
  return hit ? { home: hit.sblive.home, away: hit.sblive.away, note: hit.note } : null;
}

export function getMissingOfficialResults(division: DivisionId, asOf?: string): MissingOfficialResult[] {
  return missingRows(division, asOf).map((row) => ({ ...row, sblive: sbliveFor(row) }));
}

/**
 * Spread of games played across EVERY member of a division (uneven-GP footnote when max − min ≥ 2;
 * lib/engine/standings/uneven.ts unevenGamesSentence words it). `scheduled` is null for a league with no fixed schedule
 * (the Sunset), whose sentence then has no "of N".
 *
 * A member with no counted game is in the spread at 0. The sentence says "Teams have played between {min}
 * and {max}", and the table it sits under lists that member with GP 0: leaving it out printed "between 1 and
 * 5" over a Sunset table whose Newport Harbor row reads 0 (its four finals against Sunset teams, Aug 26 –
 * Sep 30, are none of them marked league games). hasReportedResults is exactly gp > 0 (lib/engine/standings.ts),
 * so the old filter only ever dropped zeros.
 */
export function getGamesPlayedSpread(division: DivisionId): { min: number; max: number; scheduled: number | null } {
  const gps = getStandings(division).map((s) => s.computed.gp);
  return {
    min: gps.length ? Math.min(...gps) : 0,
    max: gps.length ? Math.max(...gps) : 0,
    scheduled: getDivision(division).gamesPerTeam,
  };
}
