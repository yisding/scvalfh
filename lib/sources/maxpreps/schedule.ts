/** Reading a MaxPreps schedule feed before anything trusts its sides: the TBA-opponent split (SPEC §7.6 step 1). */

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
