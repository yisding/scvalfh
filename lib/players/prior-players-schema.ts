/**
 * The Zod contract for data/prior-players.json (and its copies under data/soccer/ and
 * data/basketball/): who played for each registry team LAST season, as far as MaxPreps' season stat
 * sheets show it. Built by scripts/fetch-prior-players.ts; read only by the player registry
 * (scripts/build-players.ts), which is what lets it follow a player from one season into the next.
 * No page reads it.
 *
 * It is not a roster. A stat sheet lists the players a coach entered a line for, so a team whose
 * coach entered nothing has status 'none' and a team's list can be short of its real roster; the
 * file claims only that each listed player was on the team's sheet. Names are rebuilt from the
 * career link (lib/sources/maxpreps-stats-names.ts) and say so (`nameFrom`).
 *
 * Not sport-bound: it validates no slug against a registry, so one script can read all three sports'
 * copies. scripts/fetch-prior-players.ts checks the slugs against the registry it writes for.
 *
 * Invariants:
 *   1. team slugs are unique
 *   2. a team's status says what its players[] are: 'ok' has players, every other status has none
 *   3. `error` is set exactly on status 'error'
 *   4. a career id appears once per team
 *   5. counts are recomputed from the rows
 */

import { z } from 'zod';

import { seasonYear } from './registry-schema';
import { SPORT_IDS } from '../sports/current';

const text = z.string().min(1);

export const PriorPlayerSchema = z
  .object({
    careerId: text.nullable(),
    careerUrl: text.nullable(),
    /** As the sheet prints it: "S. Lewis". */
    shortName: text,
    /** The full name rebuilt from the career link, or the short name when the row links nothing. */
    name: text,
    nameFrom: z.enum(['career-url', 'short-name']),
    jersey: text.nullable(),
    /** 9–12 that season, from the sheet's class caption; null when it gives none. */
    grade: z.number().int().min(9).max(12).nullable(),
  })
  .strict();

/**
 * ok       the sheet was read and lists players
 * none     the sheet was read and MaxPreps has no stats for the team that season
 * error    the read failed (`error` says how); a later run tries again
 * pending  no run has asked yet
 */
export const PriorTeamStatus = z.enum(['ok', 'none', 'error', 'pending']);

export const PriorTeamSchema = z
  .object({
    slug: text,
    /** The MaxPreps team id the sheet was asked for. */
    teamId: text,
    status: PriorTeamStatus,
    players: z.array(PriorPlayerSchema),
    error: text.nullable(),
  })
  .strict()
  .refine((t) => (t.status === 'ok') === (t.players.length > 0), 'only status ok has players, and it has some')
  .refine((t) => (t.status === 'error') === (t.error !== null), 'error is set exactly on status error')
  .refine((t) => {
    const ids = t.players.flatMap((p) => (p.careerId ? [p.careerId] : []));
    return new Set(ids).size === ids.length;
  }, 'a career id appears twice');

export const PriorPlayersCountsSchema = z
  .object({
    teams: z.number().int(),
    teamsWithPlayers: z.number().int(),
    teamsWithNone: z.number().int(),
    /** Teams whose sheet has not been read: error or pending. */
    teamsUnread: z.number().int(),
    players: z.number().int(),
    withGrade: z.number().int(),
    withJersey: z.number().int(),
  })
  .strict();

export const PriorPlayersSchema = z
  .object({
    /** The MaxPreps season year: "25-26". */
    season: seasonYear,
    sport: z.enum(SPORT_IDS),
    /** The varsity sport season the sheets were asked for. */
    sportSeasonId: text,
    /** ISO UTC, when the latest run started. */
    fetchedAt: text,
    source: z.object({ id: z.literal('maxpreps-api'), builtBy: text, notes: z.array(text) }).strict(),
    teams: z.array(PriorTeamSchema),
    counts: PriorPlayersCountsSchema,
  })
  .strict()
  .refine((f) => new Set(f.teams.map((t) => t.slug)).size === f.teams.length, 'team slugs are not unique')
  .refine((f) => {
    const c = countPriorPlayers(f.teams);
    return (Object.keys(c) as Array<keyof typeof c>).every((k) => c[k] === f.counts[k]);
  }, 'counts do not match the rows');

export type PriorPlayer = z.infer<typeof PriorPlayerSchema>;
export type PriorTeam = z.infer<typeof PriorTeamSchema>;
export type PriorPlayersCounts = z.infer<typeof PriorPlayersCountsSchema>;
export type PriorPlayers = z.infer<typeof PriorPlayersSchema>;

export function countPriorPlayers(teams: readonly PriorTeam[]): PriorPlayersCounts {
  const players = teams.flatMap((t) => t.players);
  return {
    teams: teams.length,
    teamsWithPlayers: teams.filter((t) => t.status === 'ok').length,
    teamsWithNone: teams.filter((t) => t.status === 'none').length,
    teamsUnread: teams.filter((t) => t.status === 'error' || t.status === 'pending').length,
    players: players.length,
    withGrade: players.filter((p) => p.grade !== null).length,
    withJersey: players.filter((p) => p.jersey !== null).length,
  };
}
