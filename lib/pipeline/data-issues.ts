/**
 * The cron's bookkeeping issues (update-data.yml, "Open or update issues"): one per official
 * schedule revised upstream (a stale `official-revision-check` source row) and one per league frozen
 * in this run AND the previous one, each with the published reasons as its body. The builders live
 * here so tests import library code, not a CLI; scripts/data-issues.ts is the argv and file layer.
 */

import { readFileSync } from 'node:fs';

import { TIME_ZONE } from '@/lib/config/season';
import type { Snapshot } from '@/lib/model/snapshot';
import type { SnapshotMeta } from './contract';

export interface DataIssue {
  title: string;
  body: string;
}

/** What is read of the previous run's meta: its league states. */
export type PreviousMeta = { leagues: ReadonlyArray<Pick<SnapshotMeta['leagues'][number], 'id' | 'state'>> };

export function buildDataIssues(
  snapshot: Snapshot,
  meta: Pick<SnapshotMeta, 'fetchedAt'>,
  prevMeta: PreviousMeta | null,
): DataIssue[] {
  const leagues = new Map(snapshot.season.leagues.map((l) => [l.id, l]));
  const out: DataIssue[] = [];

  for (const row of snapshot.sources) {
    if (row.kind !== 'official-revision-check' || row.status !== 'stale') continue;
    const league = row.scope?.league === undefined ? undefined : leagues.get(row.scope.league);
    if (!league) continue;
    // A one-division league's schedule is the league's; only a split league names the division.
    const division = league.divisions.length > 1
      ? league.divisions.find((d) => d.id === row.scope?.division)
      : undefined;
    out.push({
      title: `Official schedule revised: ${league.shortName}${division ? ` ${division.label}` : ''}`,
      body: `${row.error ?? 'The upstream document changed after our bundled copy.'}\n\nChecked: ${row.url}\nRun: ${meta.fetchedAt}`,
    });
  }

  const prevFrozen = new Set((prevMeta?.leagues ?? []).filter((l) => l.state === 'frozen').map((l) => l.id));
  for (const h of snapshot.leagueHealth) {
    if (h.state !== 'frozen' || !prevFrozen.has(h.leagueId)) continue;
    const name = leagues.get(h.leagueId)?.shortName ?? h.leagueId;
    const since = h.lastFreshAt ? frozenSince(h.lastFreshAt) : 'the start of the season';
    out.push({
      title: `${name} frozen since ${since}`,
      body: `${h.reasons.join('\n\n') || 'Frozen.'}\n\nRun: ${meta.fetchedAt}`,
    });
  }
  return out;
}

/**
 * The frozen-league title's stamp, e.g. "Oct 1, 8:00 PM" in Pacific time. The title is the key the
 * workflow's `gh` loop finds an open issue by, so it keeps the exact format the issues have always
 * been opened with, not lib/format/dates.ts's formatStamp: a new format would miss every issue already open
 * and open a duplicate beside it.
 */
function frozenSince(lastFreshAt: string): string {
  return new Date(lastFreshAt).toLocaleString('en-US', {
    timeZone: TIME_ZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The previous meta file's league states, or null when it is missing, unreadable or has none. */
export function readPreviousMeta(file: string): PreviousMeta | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  const leagues = (raw as { leagues?: unknown } | null)?.leagues;
  return Array.isArray(leagues) ? { leagues: leagues as PreviousMeta['leagues'] } : null;
}
