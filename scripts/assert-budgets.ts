/**
 * The weight budgets of SPEC §12.4, against the Stage-0 baselines measured on `main`
 * (tests/golden/page-weights-main.json; its `_meta.method` says how each number was taken, and this
 * script measures the same way: gzip is node:zlib level 9, first-load JS is
 * `firstLoadUncompressedJsBytes` from .next/diagnostics/route-bundle-stats.json).
 *
 *   pnpm build && pnpm assert:budgets                 # every Next budget, + the Worker when built
 *   pnpm build:cloudflare && pnpm exec tsx scripts/assert-budgets.ts --worker-only
 *
 * | Measure                                                        | Limit                              |
 * |----------------------------------------------------------------|------------------------------------|
 * | data/snapshot.json raw                                         | ≤ 1.6 MB (warn > 1.2 MB)           |
 * | `/` HTML gzip and RSC gzip                                     | each ≤ 2.2 × baseline `index`      |
 * | first-load JS of `/`, `/schedule/<league>`, `/teams`, `/teams/<slug>`, `/standings/<league>`, `/leaders` | ≤ baseline + 20 KB |
 * | `/standings` (overview) HTML gzip                              | ≤ 1.0 × baseline `standings`       |
 * | each `/standings/<league>` HTML gzip                           | ≤ 1.25 × baseline `standings`      |
 * | each `/schedule/<league>` HTML gzip                            | ≤ 1.25 × baseline `schedule`       |
 * | `/schedule` (index) HTML gzip                                  | ≤ 0.5 × baseline `schedule`        |
 * | `/teams` HTML gzip                                             | ≤ 3.0 × baseline `teams`           |
 * | `/playoffs` HTML gzip                                          | ≤ 2.0 × baseline `playoffs`        |
 * | each `/teams/<slug>` HTML gzip (Roster + Player stats sections)  | ≤ 6.0 × baseline `teams`           |
 * | `/leaders` HTML gzip                                           | ≤ 1.0 × baseline `standings`       |
 * | Worker gzip (`build:cloudflare`)                               | ≤ baseline + 600 KB                |
 *
 * The first-load JS budget is what catches config, the registry or zod leaking into the browser
 * through a 'use client' import. The Worker check reads .cloudflare/output when it exists (it is
 * reported, not failed, when the baseline is null); `--worker-only` requires it and checks nothing
 * else, for the job that builds the Worker.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { LEAGUE_IDS } from '../lib/leagues';

const APP = '.next/server/app';
const STATS = '.next/diagnostics/route-bundle-stats.json';
const WORKER_BUNDLE = '.cloudflare/output/v0/workers/default/bundle';
const SNAPSHOT = process.env.SCVAL_SNAPSHOT ?? 'data/snapshot.json';
const KB = 1024;

interface Weights { html: number; htmlGzip: number; rsc: number; rscGzip: number; firstLoadJs: number }
type BaselineName = 'index' | 'standings' | 'schedule' | 'playoffs' | 'teams';
const baseline = JSON.parse(readFileSync('tests/golden/page-weights-main.json', 'utf8')) as
  Record<BaselineName, Weights> & { workerGzip: number | null };

const workerOnly = process.argv.includes('--worker-only');
const failures: string[] = [];
const rows: string[] = [];

const gz = (buf: Buffer) => gzipSync(buf, { level: 9 }).length;
const fmt = (n: number) => (n >= 10 * KB ? `${(n / KB).toFixed(1)} KB` : `${n} B`);

function check(label: string, actual: number, limit: number, rule: string): void {
  const ok = actual <= limit;
  rows.push(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(40)} ${fmt(actual).padStart(10)}  ≤ ${fmt(limit).padStart(10)}  (${rule})`);
  if (!ok) failures.push(`${label}: ${actual} > ${limit} (${rule})`);
}

function file(name: string): Buffer {
  const p = path.join(APP, name);
  if (!existsSync(p)) {
    failures.push(`${p} missing — run \`pnpm build\` first`);
    return Buffer.alloc(0);
  }
  return readFileSync(p);
}

if (!workerOnly) {
  // ------------------------------------------------------------ the snapshot
  const snapshotBytes = statSync(SNAPSHOT).size;
  check('data/snapshot.json raw', snapshotBytes, 1_600_000, '1.6 MB');
  if (snapshotBytes > 1_200_000) console.warn(`WARN data/snapshot.json is ${snapshotBytes} bytes (> 1.2 MB warning line)`);

  // ------------------------------------------------------------ documents
  // 2.2 × since 2026-10-03 (it was 2.0 ×). The four-league home page reached 51.2 KB HTML gzip
  // after that day's data refresh, over the old 49.9 KB line. The savings came first: one
  // .sx-monogram rule instead of eight utilities per tile, and the pinned card's 43 views joined to
  // the search index on slug instead of each carrying the team's name and colors (−1.1 KB HTML,
  // −1.0 KB RSC), which left 48.1 / 28.4 KB. 2.2 × (54.9 / 33.9 KB) leaves about 12 % for what the
  // season adds (postseason lines and cards), not room for a new section.
  check('/ HTML gzip', gz(file('index.html')), 2.2 * baseline.index.htmlGzip, '2.2 × index');
  check('/ RSC gzip', gz(file('index.rsc')), 2.2 * baseline.index.rscGzip, '2.2 × index');
  check('/standings HTML gzip', gz(file('standings.html')), 1.0 * baseline.standings.htmlGzip, '1.0 × standings');
  for (const id of LEAGUE_IDS) {
    check(`/standings/${id} HTML gzip`, gz(file(`standings/${id}.html`)), 1.25 * baseline.standings.htmlGzip, '1.25 × standings');
  }
  for (const id of LEAGUE_IDS) {
    check(`/schedule/${id} HTML gzip`, gz(file(`schedule/${id}.html`)), 1.25 * baseline.schedule.htmlGzip, '1.25 × schedule');
  }
  check('/schedule HTML gzip', gz(file('schedule.html')), 0.5 * baseline.schedule.htmlGzip, '0.5 × schedule');
  check('/teams HTML gzip', gz(file('teams.html')), 3.0 * baseline.teams.htmlGzip, '3.0 × teams');
  check('/playoffs HTML gzip', gz(file('playoffs.html')), 2.0 * baseline.playoffs.htmlGzip, '2.0 × playoffs');
  // Nine boards of at most 15 rows each (components/leaders/leaders-view.ts), so the page cannot
  // grow with the season the way a schedule does: ~28 KB on 2026-10-03.
  check('/leaders HTML gzip', gz(file('leaders.html')), 1.0 * baseline.standings.htmlGzip, '1.0 × standings');
  // Every team page, all 43: the largest was ~39 KB gzip on 2026-10-03 (Tamalpais, 40,208 B: about
  // 4.2 × the 9,681 B baseline) with both the Roster and the Player stats section; 6.0 × leaves room
  // for a busy week of games, not for a table per player.
  const teamDir = path.join(APP, 'teams');
  const teamPages = existsSync(teamDir) ? readdirSync(teamDir).filter((f) => f.endsWith('.html')).sort() : [];
  if (teamPages.length === 0) failures.push(`${teamDir} has no prerendered team pages — run \`pnpm build\` first`);
  const teamGz = teamPages.map((f) => ({ f, bytes: gz(file(`teams/${f}`)) }));
  const biggest = teamGz.reduce((m, x) => (x.bytes > m.bytes ? x : m), { f: '', bytes: 0 });
  if (teamGz.length) {
    check(`/teams/<slug> HTML gzip, largest of ${teamGz.length}`, biggest.bytes, 6.0 * baseline.teams.htmlGzip, `6.0 × teams: ${biggest.f}`);
  }

  // ------------------------------------------------------------ first-load client JS
  if (!existsSync(STATS)) {
    failures.push(`${STATS} missing — run \`pnpm build\` first`);
  } else {
    const stats = JSON.parse(readFileSync(STATS, 'utf8')) as Array<{ route: string; firstLoadUncompressedJsBytes: number }>;
    const js: Array<[route: string, base: BaselineName]> = [
      ['/', 'index'],
      ['/schedule/[league]', 'schedule'],
      ['/teams', 'teams'],
      ['/teams/[slug]', 'teams'],
      ['/standings/[league]', 'standings'],
      ['/leaders', 'standings'],
    ];
    for (const [route, base] of js) {
      const row = stats.find((r) => r.route === route);
      if (!row) {
        failures.push(`${STATS} has no row for ${route}`);
        continue;
      }
      check(`first-load JS ${route}`, row.firstLoadUncompressedJsBytes, baseline[base].firstLoadJs + 20 * KB, `${base} + 20 KB`);
    }
  }
}

// -------------------------------------------------------------- the Worker
if (existsSync(WORKER_BUNDLE)) {
  let total = 0;
  let count = 0;
  for (const rel of readdirSync(WORKER_BUNDLE, { recursive: true }) as string[]) {
    const p = path.join(WORKER_BUNDLE, rel);
    if (!statSync(p).isFile()) continue;
    if (rel.split(path.sep).join('/') === '.vite/manifest.json') continue;
    total += gz(readFileSync(p));
    count += 1;
  }
  if (baseline.workerGzip == null) {
    rows.push(`info Worker gzip ${fmt(total)} over ${count} files (no baseline: reported only)`);
  } else {
    check(`Worker gzip (${count} files)`, total, baseline.workerGzip + 600 * KB, 'baseline + 600 KB');
  }
} else if (workerOnly) {
  failures.push(`${WORKER_BUNDLE} missing — run \`pnpm build:cloudflare\` first`);
} else {
  rows.push(`skip Worker gzip: ${WORKER_BUNDLE} not built (checked after \`pnpm build:cloudflare\`)`);
}

for (const r of rows) console.log(r);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log('assert-budgets: ok');
