/**
 * Step 04 (SPEC §7.4): MaxPreps' own standings table per division → `reported` rows, used for the
 * published cross-check only (never for order). Rows resolve by GUID, then name. A member missing
 * from the table warns unless config lists it in `maxprepsMissing`; a row config lists in
 * `maxprepsExtraRows` (a known non-member, EAL: Red Bluff's 0-0-0 row) is skipped without a warning;
 * a row count different from `maxprepsTeamCount` (which counts those rows) warns. The health's
 * `reportedRows` counts the members the table resolved to (no extra row, no unknown school), as a
 * carried table does (its member standings with a reported row), so a fresh read and a carried one
 * print the same count; the source row's `rowCount` stays the table as read. A row MaxPreps
 * leaves undated (`modifiedOn` null, parsed as '') never sets the table's upstream date.
 *
 * 0 rows / HTTP error / schema drift / network → SOURCE STALE, never an abort: the previous
 * snapshot's reported rows for that division are carried (`reportedTable: 'carried'`, the row
 * `status: 'stale'` with `carriedFrom`), or, with nothing to carry, `'missing'`. The league becomes
 * `partial` with a reason sentence.
 */

import { z } from 'zod';

import { divisionLabel, getLeague } from '../../leagues';
import { StandingsResponseSchema, type StandingsRow } from '../../sources/maxpreps';
import { toReportedRecord } from '../../standings';
import { resolveTeam, teamsInDivision } from '../../teams';
import type { DivisionConfig } from '../../leagues';
import type { LeagueId, SourceStatus } from '../../types';
import { FixtureMissing, TransportError } from '../contract';
import { asOfDay, carriedFromOf, type PipelineContext, type RunState } from '../ledger';
import { resourceUrl } from '../transport';

function readFailedReason(division: DivisionConfig, carriedFrom: string | null): string {
  const head = `MaxPreps' ${divisionLabel(division.id)} table could not be read this run`;
  return carriedFrom
    ? `${head}; the cross-check uses the copy from ${asOfDay(carriedFrom)}. Scores and our computed table are current.`
    : `${head}, and there is no earlier copy to compare against. Scores and our computed table are current.`;
}

async function readTable(ctx: PipelineContext, state: RunState, leagueId: LeagueId, division: DivisionConfig): Promise<void> {
  const key = { kind: 'maxpreps-standings', division: division.id } as const;
  const url = resourceUrl(key);
  const scope = { league: leagueId, division: division.id };
  const base = {
    id: 'maxpreps-api' as const,
    kind: 'reported-standings' as const,
    scope,
    label: `${division.id} reported standings`,
    url,
    fetchedAt: ctx.fetchedAt,
  };
  const info = state.divisions.get(division.id);

  let rows: StandingsRow[];
  let httpStatus: number | undefined;
  try {
    const res = await ctx.transport.get(key);
    httpStatus = res.httpStatus;
    let raw: unknown;
    try {
      raw = JSON.parse(res.body) as unknown;
    } catch (err) {
      throw new Error(`invalid JSON: ${(err as Error).message}`);
    }
    const parsed = StandingsResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`schema drift: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`);
    }
    rows = parsed.data.data;
    if (rows.length === 0) throw new Error('standings returned 0 rows');
  } catch (err) {
    if (err instanceof FixtureMissing) {
      ctx.source({ ...base, status: 'skipped', error: 'not in corpus' });
      if (info) info.reportedTable = 'skipped';
      return;
    }
    if (err instanceof TransportError && err.httpStatus !== null) httpStatus = err.httpStatus;
    const message = err instanceof z.ZodError ? 'schema drift' : (err as Error).message;
    carryReported(ctx, state, leagueId, division, base, message, httpStatus);
    return;
  }

  // Rows resolve by GUID, then by name, against THIS division's members only.
  const members = teamsInDivision(division.id);
  const memberIds = new Set(members.map((t) => t.id));
  const seen = new Set<string>();
  let modifiedOn: string | undefined;
  for (const row of rows) {
    if (Object.hasOwn(division.maxprepsExtraRows, row.schoolId)) continue;
    const team = resolveTeam(row.schoolId) ?? resolveTeam(row.schoolName);
    if (!team || !memberIds.has(team.id)) {
      ctx.warn(`${division.id} standings: unknown school ${row.schoolName} (${row.schoolId})`, scope);
      continue;
    }
    state.reported.set(team.id, toReportedRecord(row));
    seen.add(team.id);
    if (row.modifiedOn && (!modifiedOn || row.modifiedOn > modifiedOn)) modifiedOn = row.modifiedOn;
  }
  for (const team of members) {
    if (!seen.has(team.id) && !division.maxprepsMissing.includes(team.slug)) {
      ctx.warn(`${division.id} standings: ${team.name} is missing from MaxPreps' table`, scope);
    }
  }
  if (rows.length !== division.maxprepsTeamCount) {
    ctx.warn(`${division.id} standings: ${rows.length} rows, config expects ${division.maxprepsTeamCount}`, scope);
  }
  if (info) {
    info.reportedTable = 'ok';
    info.reportedRows = seen.size;
  }
  ctx.source({
    ...base,
    status: 'ok',
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    rowCount: rows.length,
    ...(modifiedOn ? { upstreamModifiedOn: modifiedOn } : {}),
  });
  ctx.log(`  standings ${division.id}: ${rows.length} rows`);
}

function carryReported(
  ctx: PipelineContext,
  state: RunState,
  leagueId: LeagueId,
  division: DivisionConfig,
  base: Omit<SourceStatus, 'status'>,
  message: string,
  httpStatus: number | undefined,
): void {
  const info = state.divisions.get(division.id);
  const prevRows = (ctx.previous?.standings ?? []).filter((s) => s.division === division.id && s.reported);
  ctx.warn(`${division.id} standings failed: ${message}`, base.scope);
  if (prevRows.length > 0) {
    const carriedFrom =
      carriedFromOf(
        ctx.previous,
        (r) => r.label === base.label || (r.kind === 'reported-standings' && r.scope?.division === division.id),
      ) ?? null;
    for (const prev of prevRows) if (prev.reported) state.reported.set(prev.teamId, prev.reported);
    if (info) {
      info.reportedTable = 'carried';
      info.reportedRows = prevRows.length;
    }
    ctx.source({
      ...base,
      status: 'stale',
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      ...(carriedFrom ? { carriedFrom } : {}),
      error: `${message}; carried forward from the previous snapshot`,
    });
    ctx.leagues.degrade(leagueId, 'partial', readFailedReason(division, carriedFrom), 'reported table carried');
    return;
  }
  if (info) {
    info.reportedTable = 'missing';
    info.reportedRows = null;
  }
  ctx.source({ ...base, status: 'error', ...(httpStatus !== undefined ? { httpStatus } : {}), error: message });
  ctx.leagues.degrade(leagueId, 'partial', readFailedReason(division, null), 'reported table missing');
}

export async function stepReported(ctx: PipelineContext, state: RunState): Promise<void> {
  for (const leagueId of ctx.leaguesInRun()) {
    for (const division of getLeague(leagueId).divisions) {
      await readTable(ctx, state, leagueId, division);
    }
  }
}
