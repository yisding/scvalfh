/**
 * The join data/field-hockey/clubs.json and data/field-hockey/commits.json both make to the merged rosters (DESIGN §17,
 * §21: commitments follow the clubs' matching rule), on team slug + MaxPreps athleteId.
 *
 * Every record must join to a row of its team under the row's own fullName, the row must be at the
 * level the caller asks for (varsity, unless `level: 'jv'`), and, when the row has a grade, every class year a source states must be that grade's
 * (or, where the overlay records that MaxPreps' roster shows last season's grade — a `rosterBehind`
 * conflict — the corrected grade's: lib/players/rosters.ts classYearAgrees).
 *
 * Each of those rules reads the roster row, which every roster refresh rewrites, so a record that fails one
 * is roster drift (lib/players/roster-drift.ts), not a load failure: it is left out of the join, and of the
 * file the caller serves, and reported as `<label>: <team> / <player> (<subject>): <what>`. Only a team
 * rosters.json does not hold still throws: no refresh removes a team.
 * What a file asks beyond that stays in its own loader: lib/players/commits.ts also settles a class year
 * for a player with no grade, because /commits groups players by class year; clubs never show
 * one (lib/players/clubs.ts).
 */

import { classYearAgrees, type MergedPlayer, type MergedTeamRoster } from './rosters';
import { reportDrift } from './roster-drift';

/** The key a joined row is found by: team slug and MaxPreps athleteId. */
export function playerKey(teamSlug: string, athleteId: string): string {
  return `${teamSlug} ${athleteId}`;
}

/** What a joinable record carries: who it names, and the class years its sources state. */
export interface RosterJoinRecord {
  teamSlug: string;
  athleteId: string;
  fullName: string;
  sources: readonly { kind: string; statedClassYear: number | null }[];
}

export interface RosterJoinOptions<R> {
  /** The file, as error messages name it. */
  label: 'clubs' | 'commits';
  /** What the file lists, for the level message: "clubs list varsity rows only". */
  noun: string;
  /**
   * The level every joined row must be: 'varsity' (the default: any row the overlay does not mark
   * JV) or 'jv' (only rows it does). data/field-hockey/clubs.json's `jvAffiliations` join with 'jv'.
   */
  level?: 'varsity' | 'jv';
  /** The record's club or college, for the message's parenthesis. */
  subject: (r: R) => string;
}

/**
 * Joins every record to its merged roster row and checks it (see the header). Returns each joined row
 * by `playerKey`, and the records that joined, in file order: the ones the caller serves. A record that
 * does not join is reported as drift and is in neither.
 */
export function joinToRoster<R extends RosterJoinRecord>(
  records: readonly R[],
  teams: readonly MergedTeamRoster[],
  season: string,
  { label, noun, subject, level = 'varsity' }: RosterJoinOptions<R>,
): { rows: Map<string, MergedPlayer>; joined: R[] } {
  const bySlug = new Map(teams.map((t) => [t.slug, t]));
  const rows = new Map<string, MergedPlayer>();
  const joined: R[] = [];
  for (const r of records) {
    const team = bySlug.get(r.teamSlug);
    if (!team) throw new Error(`${label}: ${r.teamSlug} / ${r.fullName} (${subject(r)}): no such team in rosters.json`);
    const why = mismatch(r, team, season, level, noun);
    if (why !== null) {
      reportDrift({ file: label, teamSlug: r.teamSlug, who: `${r.fullName} (${subject(r)})`, key: r.athleteId, what: why, leftOut: 'record' });
      continue;
    }
    rows.set(playerKey(r.teamSlug, r.athleteId), team.players.find((p) => p.athleteId === r.athleteId)!);
    joined.push(r);
  }
  return { rows, joined };
}

/** Why the roster no longer supports a record, or null when it does. */
function mismatch(
  r: RosterJoinRecord,
  team: MergedTeamRoster,
  season: string,
  level: 'varsity' | 'jv',
  noun: string,
): string | null {
  const row = team.players.find((p) => p.athleteId === r.athleteId);
  if (!row) return `athleteId ${r.athleteId} is not a MaxPreps row of this team`;
  if (r.fullName !== row.fullName) return `MaxPreps spells this player "${row.fullName}"`;
  if (level === 'varsity' && row.level === 'jv') return `a JV row: ${noun} list varsity rows only`;
  if (level === 'jv' && row.level !== 'jv') return `not a JV row: ${noun} list JV rows only`;
  for (const s of r.sources) {
    if (s.statedClassYear !== null && !classYearAgrees(season, row, s.statedClassYear)) {
      return `${s.kind} source says class of ${s.statedClassYear}, the roster shows grade ${row.grade}`;
    }
  }
  return null;
}
