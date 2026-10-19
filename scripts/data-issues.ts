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

import { plural } from '@/lib/format/words';
import type { SnapshotMeta } from '@/lib/pipeline/contract';
import { buildDataIssues, readPreviousMeta } from '@/lib/pipeline/data-issues';
import { loadSnapshot } from '@/lib/snapshot/load';

import { runCliIfMain } from './lib/cli';

const REPO = path.resolve(import.meta.dirname, '..');

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

runCliIfMain(import.meta.url, main);
