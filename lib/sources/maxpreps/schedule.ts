/**
 * Reading a MaxPreps schedule feed before anything trusts it: the routing guard (a feed must contain its
 * own team, SPEC §7.2), the empty-feed blip guard, and the TBA-opponent split (SPEC §7.6 step 1).
 */

import type { DroppedContest } from '@/lib/model/health';

import type { ContestTeam, ScheduleRow } from './schemas';

/** MaxPreps' placeholder GUID for an unnamed side. */
export const TBA_TEAM_ID = '00000000-0000-0000-0000-000000000000';

/** A side MaxPreps has not named: null or all-zero teamId, or a null name. */
export function isTbaSide(team: Pick<ContestTeam, 'teamId' | 'name'>): boolean {
  return team.teamId === null || team.teamId === TBA_TEAM_ID || team.name === null;
}

/**
 * SPEC §7.6 step 1: remove every row with a TBA side and record it, one `DroppedContest` per row,
 * with reason 'tba-opponent'. Pure; the order of the kept rows is the input order.
 */
export function splitTbaRows(rows: readonly ScheduleRow[]): {
  rows: ScheduleRow[];
  dropped: DroppedContest[];
} {
  const kept: ScheduleRow[] = [];
  const dropped: DroppedContest[] = [];
  for (const row of rows) {
    const teams = row.contest.teams;
    if (!teams.some(isTbaSide)) {
      kept.push(row);
      continue;
    }
    const named = teams.filter((t) => !isTbaSide(t)).map((t) => t.name as string);
    const date = row.contest.date ? row.contest.date.slice(0, 10) : null;
    dropped.push({
      contestId: row.contest.contestId,
      reason: 'tba-opponent',
      note:
        named.length > 0
          ? `MaxPreps lists ${named.join(' and ')} against an opponent it has not named yet (TBA).`
          : 'MaxPreps lists this contest without naming its teams (TBA).',
      dateKey: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      teams: named,
    });
  }
  return { rows: kept, dropped };
}

/**
 * Guards the Presentation/Los Gatos class of routing bug (SPEC §7.2): a team's feed must contain that
 * team. An empty feed is legitimate (a school that has published nothing), so only a non-empty feed
 * without `teamId` on any side throws, `Error(message)`. Each caller passes its own exact wording
 * (the pipeline step, MaxPrepsClient.getSchedule, which wraps it in a MaxPrepsError, and the JV script).
 */
export function assertFeedHasTeam(
  rows: readonly ScheduleRow[],
  teamId: string,
  { message }: { message: string },
): void {
  if (rows.length > 0 && !rows.some((row) => row.contest.teams.some((t) => t.teamId === teamId))) {
    throw new Error(message);
  }
}

/**
 * A 200 with no rows for a team we ALREADY hold games for is indistinguishable from an upstream blip;
 * taking it at face value would delete that team's games with no warning. Throws `Error(message)` when
 * `rows` is empty and `previousHadGames`. Each caller says what "no rows" means to it: the pipeline
 * step passes the whole feed (a feed of only TBA rows is an answer), the JV script its live rows.
 */
export function emptyFeedBlip(rows: readonly unknown[], previousHadGames: boolean, message: string): void {
  if (rows.length === 0 && previousHadGames) throw new Error(message);
}
