/**
 * The cron's bookkeeping issues (update-data.yml, "Open or update issues"): one per official
 * schedule revised upstream (a stale `official-revision-check` source row) and one per league frozen
 * in this run AND the previous one, each with the published reasons as its body.
 *
 *   pnpm exec tsx scripts/data-issues.ts <previous-meta.json> <out-dir>
 *
 * Reads data/snapshot.json (through `loadSnapshot`, so a renamed field fails the type check, not the
 * 05:00 run) and data/snapshot.meta.json, and writes `<n>.title` and `<n>.body` into <out-dir> for
 * the workflow's `gh issue` loop, which edits the open issue of the same title or creates one. The
 * previous run's meta is `git show HEAD:data/snapshot.meta.json`; a missing or unreadable one counts
 * as no league frozen before, so a first run opens no frozen-league issue.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { formatStamp, plural } from '../lib/format';
import type { SnapshotMeta } from '../lib/pipeline/contract';
import { loadSnapshot } from '../lib/snapshot-schema';
import type { Snapshot } from '../lib/types';
import { runCli } from './cli';

const REPO = path.resolve(import.meta.dirname, '..');

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
    const since = h.lastFreshAt ? formatStamp(h.lastFreshAt) : 'the start of the season';
    out.push({
      title: `${name} frozen since ${since}`,
      body: `${h.reasons.join('\n\n') || 'Frozen.'}\n\nRun: ${meta.fetchedAt}`,
    });
  }
  return out;
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

function main(argv: readonly string[]): number {
  const [prevPath, outDir] = argv;
  if (!prevPath || !outDir) {
    console.error('usage: pnpm exec tsx scripts/data-issues.ts <previous-meta.json> <out-dir>');
    return 1;
  }
  const snapshot = loadSnapshot(JSON.parse(readFileSync(path.join(REPO, 'data/snapshot.json'), 'utf8')));
  const meta = JSON.parse(readFileSync(path.join(REPO, 'data/snapshot.meta.json'), 'utf8')) as SnapshotMeta;
  const issues = buildDataIssues(snapshot, meta, readPreviousMeta(prevPath));
  mkdirSync(outDir, { recursive: true });
  issues.forEach((issue, i) => {
    writeFileSync(path.join(outDir, `${i}.title`), issue.title);
    writeFileSync(path.join(outDir, `${i}.body`), issue.body);
  });
  console.log(`${plural(issues.length, 'issue')} to open or update`);
  return 0;
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) runCli(main);
