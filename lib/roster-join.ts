/**
 * The join data/clubs.json and data/commits.json both make to the merged rosters (DESIGN §17,
 * §21: commitments follow the clubs' matching rule), on team slug + MaxPreps athleteId.
 *
 * Every record must join to a row of its team under the row's own fullName, the row must be at the
 * level the caller asks for (varsity, unless `level: 'jv'`), and, when the row has a grade, every class year a source states must be that grade's. A
 * failure throws `<label>: <team> / <player> (<subject>): <what>`, naming the club or the college.
 * What a file asks beyond that stays in its own loader: lib/commits.ts also settles a class year
 * for a player with no grade, because /commits groups players by class year; clubs never show
 * one (lib/clubs.ts).
 */

import { classOf, type MergedPlayer, type MergedTeamRoster } from './rosters';

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
   * JV) or 'jv' (only rows it does). data/clubs.json's `jvAffiliations` join with 'jv'.
   */
  level?: 'varsity' | 'jv';
  /** The record's club or college, for the message's parenthesis. */
  subject: (r: R) => string;
}

/**
 * Joins every record to its merged roster row and checks it (see the header); throws on the first
 * failure. Returns each joined row by `playerKey`.
 */
export function joinToRoster<R extends RosterJoinRecord>(
  records: readonly R[],
  teams: readonly MergedTeamRoster[],
  season: string,
  { label, noun, subject, level = 'varsity' }: RosterJoinOptions<R>,
): Map<string, MergedPlayer> {
  const bySlug = new Map(teams.map((t) => [t.slug, t]));
  const failure = (r: R, what: string) => new Error(`${label}: ${r.teamSlug} / ${r.fullName} (${subject(r)}): ${what}`);
  const rows = new Map<string, MergedPlayer>();
  for (const r of records) {
    const team = bySlug.get(r.teamSlug);
    if (!team) throw failure(r, 'no such team in rosters.json');
    const row = team.players.find((p) => p.athleteId === r.athleteId);
    if (!row) throw failure(r, `athleteId ${r.athleteId} is not a MaxPreps row of this team`);
    if (r.fullName !== row.fullName) throw failure(r, `MaxPreps spells this player "${row.fullName}"`);
    if (level === 'varsity' && row.level === 'jv') throw failure(r, `a JV row: ${noun} list varsity rows only`);
    if (level === 'jv' && row.level !== 'jv') throw failure(r, `not a JV row: ${noun} list JV rows only`);
    const grade = row.grade;
    if (grade !== null) {
      for (const s of r.sources) {
        if (s.statedClassYear !== null && s.statedClassYear !== classOf(season, grade)) {
          throw failure(r, `${s.kind} source says class of ${s.statedClassYear}, the roster shows grade ${grade}`);
        }
      }
    }
    rows.set(playerKey(r.teamSlug, r.athleteId), row);
  }
  return rows;
}
