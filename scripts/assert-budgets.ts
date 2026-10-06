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
 * | data/snapshot.json raw                                         | ≤ SNAPSHOT_MAX_BYTES (warn > SNAPSHOT_WARN_BYTES), lib/pipeline/steps/assemble.ts: 3.2 MB (warn 2.4 MB) |
 * | `/` HTML gzip and RSC gzip                                     | each ≤ 4.4 × baseline `index`      |
 * | first-load JS of `/`, `/schedule/<league>`, `/teams`, `/teams/<slug>`, `/standings/<league>`, `/leaders` | ≤ baseline + 20 KB |
 * | `/standings` (overview) HTML gzip                              | ≤ 1.2 × baseline `standings`       |
 * | each `/standings/<league>` HTML gzip                           | ≤ 1.8 × baseline `standings`       |
 * | each `/schedule/<league>` HTML gzip                            | ≤ 2.0 × baseline `schedule`        |
 * | `/schedule` (index) HTML gzip                                  | ≤ 0.6 × baseline `schedule`        |
 * | `/teams` HTML gzip                                             | ≤ 5.2 × baseline `teams`           |
 * | `/playoffs` HTML gzip                                          | ≤ 2.3 × baseline `playoffs`        |
 * | each `/teams/<slug>` HTML gzip (Roster + Player stats sections)  | ≤ 6.0 × baseline `teams`           |
 * | `/leaders` HTML gzip                                           | ≤ 2.3 × baseline `standings`       |
 * | Worker gzip (`build:cloudflare`)                               | ≤ baseline + 1000 KB               |
 *
 * THE SOUTHERN CALIFORNIA AMENDMENT (DESIGN §24), measured 2026-10-06. The 99-team, nine-league
 * build crossed nine lines of this table (the Worker among them) and came within 1 % of a tenth
 * (`/playoffs`), so nine multipliers and the Worker allowance were raised, each from its own
 * measurement, never by a uniform factor. What was done:
 *   1. The tree after the amendment was built on the committed live snapshot (data/snapshot.json,
 *      fetched 2026-10-06T03:19Z: 99 teams, 871 games) at a fixed instant:
 *        SCVAL_BUILD_AT=2026-10-06T12:00:00Z pnpm build && pnpm assert:budgets
 *      The tree before it (commit 43807a3, five leagues) was built at the same instant on ITS OWN
 *      snapshot (49 teams, 397 games, fetched 2026-10-05T21:22Z): the pre-amendment code cannot load
 *      the 99-team file, so "before" and "after" differ in data as well as code, as on 2026-10-04.
 *      The golden baselines in tests/golden/page-weights-main.json were NOT touched: they are the
 *      Stage-0 numbers every multiplier is relative to.
 *   2. Every line that was over (or within 5 % of) its limit got
 *        ceil10(measured × 1.12 / baseline) / 10
 *      i.e. the measured bytes plus the usual ~12 % of headroom, rounded UP to one decimal. For the
 *      per-league loops the measured number is the loop's largest page (North County in both). The
 *      lines this moved, measured after (before → after, against the new line):
 *        `/` HTML         2.2 → 4.4 ×   99,016 B (52,077 before)   of 112,429   88 %
 *        `/` RSC          2.2 → 4.4 ×   61,010 B (31,341 before)   of  69,494   88 %
 *        `/standings`     1.0 → 1.2 ×   34,040 B (22,643 before)   of  39,754   86 %
 *        each `/standings/<league>`  1.25 → 1.8 ×  50,431 B, north-county   of  59,630   85 %
 *        each `/schedule/<league>`   1.25 → 2.0 ×  213,698 B, north-county  of 240,888   89 %
 *        `/schedule`      0.5 → 0.6 ×   62,263 B (38,622 before)   of  72,266   86 %
 *        `/teams`         3.0 → 5.2 ×   44,318 B (28,165 before)   of  50,341   88 %
 *        `/playoffs`      2.0 → 2.3 ×   37,375 B (29,970 before)   of  43,224   86 %
 *        `/leaders`       1.2 → 2.3 ×   66,035 B (38,549 before)   of  76,194   87 %
 *        Worker gzip      baseline + 600 KB → + 1000 KB   2,245,128 B (1,916,727 before)   of 2,449,651   92 %
 *      Unchanged: the team pages (largest Tamalpais, 49,311 B, 85 % of 6.0 ×: outside the 5 % band),
 *      the snapshot caps (lib/pipeline/steps/assemble.ts, raised by the pipeline work) and every
 *      first-load JS line (the region switcher added no client module; the deltas are in the
 *      first-load comment below).
 *   3. The same numbers are in each check()'s comment below, in this table, and in DESIGN §24.6.
 *   The design review's estimates (`/` 3.3–3.5 ×, `/teams` 6.5 ×, `/standings` 1.5 ×, `/schedule`
 *   0.75 ×, `/leaders` 2.4 ×) were estimates; the multipliers above are from the measurement.
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
import { SNAPSHOT_MAX_BYTES, SNAPSHOT_WARN_BYTES, budgetLabel } from '../lib/pipeline/steps/assemble';

const APP = '.next/server/app';
const STATS = '.next/diagnostics/route-bundle-stats.json';
const WORKER_BUNDLE = '.cloudflare/output/v0/workers/default/bundle';
// An empty SCVAL_SNAPSHOT means the bundled file, as lib/data.ts load() (the canonical rule) reads it.
const SNAPSHOT = process.env.SCVAL_SNAPSHOT || 'data/snapshot.json';
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
  // Labels from the pipeline's own constants (budgetLabel), never literals: the caps moved from 1.6 /
  // 1.2 MB to 3.2 / 2.4 MB with the Southern California amendment, and the old literals would have
  // printed the wrong numbers beside the right check.
  check('data/snapshot.json raw', snapshotBytes, SNAPSHOT_MAX_BYTES, budgetLabel(SNAPSHOT_MAX_BYTES));
  if (snapshotBytes > SNAPSHOT_WARN_BYTES) {
    console.warn(`WARN data/snapshot.json is ${snapshotBytes} bytes (> ${budgetLabel(SNAPSHOT_WARN_BYTES)} warning line)`);
  }

  // ------------------------------------------------------------ documents
  // 2.2 × since 2026-10-03 (it was 2.0 ×). The four-league home page reached 51.2 KB HTML gzip
  // after that day's data refresh, over the old 49.9 KB line. The savings came first: one
  // .sx-monogram rule instead of eight utilities per tile, and the pinned card's 43 views joined to
  // the search index on slug instead of each carrying the team's name and colors (−1.1 KB HTML,
  // −1.0 KB RSC), which left 48.1 / 28.4 KB. 2.2 × (54.9 / 33.9 KB) leaves about 12 % for what the
  // season adds (postseason lines and cards), not room for a new section.
  // Unchanged for the EAL (DESIGN §22.6): on 2026-10-04 (build instant 12:00 UTC) the five-league
  // home page, its fifth panel and card and 49 pinned-card views, measured 52,466 / 31,908 B
  // (93 % / 92 % of the line); the four-league tree before it, built the same day, 49,255 / 29,100 B.
  // 4.4 × since 2026-10-06 (DESIGN §24.6): both regions render in the page (the region toggle only
  // hides one, so a reader without JavaScript gets both and the layout never shifts), with nine
  // league panels and cards, two Find-your-team grids, two Latest blocks and 99 pinned-card views.
  // The five-league tree measured 52,077 / 31,341 B on its own snapshot at the same build instant;
  // this one 99,016 / 61,010 B (3.88 × / 3.86 ×), 88 % of the new lines (112,429 / 69,494 B).
  check('/ HTML gzip', gz(file('index.html')), 4.4 * baseline.index.htmlGzip, '4.4 × index');
  check('/ RSC gzip', gz(file('index.rsc')), 4.4 * baseline.index.rscGzip, '4.4 × index');
  // 1.2 × since 2026-10-06 (it was 1.0 ×): the overview holds both regions' nine tables, 34,040 B
  // (22,643 before), 86 % of 39,754 B.
  check('/standings HTML gzip', gz(file('standings.html')), 1.2 * baseline.standings.htmlGzip, '1.2 × standings');
  // 1.8 × since 2026-10-06 (it was 1.25 ×): North County's three divisions (19 teams, one table each)
  // make the largest league page, 50,431 B, 85 % of 59,630 B. SCVAL is next at 43,365 B (39,466 on
  // the five-league tree), then City at 38,571 B.
  for (const id of LEAGUE_IDS) {
    check(`/standings/${id} HTML gzip`, gz(file(`standings/${id}.html`)), 1.8 * baseline.standings.htmlGzip, '1.8 × standings');
  }
  // 2.0 × since 2026-10-06 (it was 1.25 ×): North County's 19 teams play a double round robin in each
  // division, so its schedule holds the most games, 213,698 B, 89 % of 240,888 B. City is 151,813 B
  // and SCVAL 146,131 B (143,078 on the five-league tree).
  for (const id of LEAGUE_IDS) {
    check(`/schedule/${id} HTML gzip`, gz(file(`schedule/${id}.html`)), 2.0 * baseline.schedule.htmlGzip, '2.0 × schedule');
  }
  // 0.6 × since 2026-10-06 (it was 0.5 ×): Recent and Next per region, 62,263 B (38,622 before),
  // 86 % of 72,266 B.
  check('/schedule HTML gzip', gz(file('schedule.html')), 0.6 * baseline.schedule.htmlGzip, '0.6 × schedule');
  // 49 teams on 2026-10-04: 27,546 B (2.85 ×, 95 % of the line), from 25,316 B for the 43 teams
  // of the four-league tree built the same day.
  // 5.2 × since 2026-10-06 (it was 3.0 ×): 99 teams in two region lists, 44,318 B (4.58 ×; the
  // five-league tree measured 28,165 B, 97 % of the old line, on its own snapshot), 88 % of 50,341 B.
  check('/teams HTML gzip', gz(file('teams.html')), 5.2 * baseline.teams.htmlGzip, '5.2 × teams');
  // 2.3 × since 2026-10-06 (it was 2.0 ×): the San Diego Section block with its City, North County
  // and Metro cards (each team's playoff division) and the Sunset card, 37,375 B (29,970 before),
  // 99.4 % of the old line and 86 % of 43,224 B.
  check('/playoffs HTML gzip', gz(file('playoffs.html')), 2.3 * baseline.playoffs.htmlGzip, '2.3 × playoffs');
  // Six school boards of 10 places and four player boards of 25, 15 of them behind "Show N more"
  // (components/leaders/leaders-view.ts): ~28 KB on 2026-10-03. The player boards' places to 25th
  // (DESIGN §23) took it from 29,328 to 34,664 B on 2026-10-04 (51 more rows), over the 1.0 × line,
  // which moved to 1.2 ×; listing every tied row (no cap since §23) took it to 35,499 B the same day.
  // The places are fixed but the rows sharing them are not, so a long tie is how this page grows.
  // 2.3 × since 2026-10-06 (it was 1.2 ×): every board twice, once per region (DESIGN §24), 66,035 B
  // against 38,549 B for the five-league tree on its own snapshot (97 % of the old line already),
  // 87 % of 76,194 B. Ties still grow it.
  check('/leaders HTML gzip', gz(file('leaders.html')), 2.3 * baseline.standings.htmlGzip, '2.3 × standings');
  // Every team page, all 49: the largest was ~39 KB gzip on 2026-10-03 (Tamalpais, 40,208 B: about
  // 4.2 × the 9,681 B baseline) with both the Roster and the Player stats section; 6.0 × leaves room
  // for a busy week of games, not for a table per player. On 2026-10-04 Tamalpais was still the
  // largest (41,605 B, 4.3 ×) and the largest EAL page was Davis (37,276 B). Unchanged on 2026-10-06
  // (DESIGN §24.6): all 99, the largest still Tamalpais (49,311 B, 5.1 ×, 85 % of the line; 45,893 B
  // on the five-league tree); the SoCal pages run from 27,900 (Southwest) to 45,382 B (Canyon Hills).
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
    // The EAL moved these by at most 49 B on 2026-10-04 (no config reached a client bundle).
    // The Southern California amendment (2026-10-06, DESIGN §24.6), against the five-league tree
    // built at the same instant: `/` 504,471 → 506,818 (+2,347), /schedule/[league] 489,050 →
    // 491,294 (+2,244), /teams 486,099 → 488,494 (+2,395), /teams/[slug] 476,240 → 477,272 (+1,032),
    // /standings/[league] 477,128 → 479,372 (+2,244), /leaders 474,664 → 479,372 (+4,708; it gained
    // the region switcher and region-scoped tabs). That is the region switcher's state in the
    // existing LeagueSwitcher and use-league modules; no new client module and no config, so the
    // "+ 20 KB" rule stands. The tightest is still /teams: 488,494 of 490,367 B (1,873 B left), so
    // the next client-side addition on /teams will cross it.
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
    // baseline + 1000 KB since 2026-10-06 (it was + 600 KB; DESIGN §24.6). `pnpm build:cloudflare`
    // measured 2,245,128 B gzip over 237 files (8,417,439 B raw), over the old 2,040,051 B line. The
    // five-league tree (commit 43807a3) built the same way the same day measured 1,916,727 B over 236
    // files (94 % of the old line; 1805.5 KB on 2026-10-04), so the amendment added 328,401 B, and
    // 323,888 B of that is the bundled data files, which doubled with the registry. gzip -9 of each on 2026-10-06 (before = commit 43807a3, five leagues):
    // snapshot.json 193,388 (87,509), rosters.json 219,537 (114,672), player-stats.json 74,707
    // (41,716), jv.json 97,139 (39,633), prior-season.json 37,399 (16,138), clubs.json 41,580
    // (unchanged), commits.json 12,416 (unchanged), history-2025-26.json 8,644 (7,800),
    // rosters-enrichment.json 43,520 (42,978): 728,330 B against 404,442, +323,888 B. The new
    // allowance is the measured bytes plus about 10 %, rounded to 100 KB: baseline + 1000 KB =
    // 2,449,651 B (92 % used). Cloudflare's own limit (developers.cloudflare.com/workers/platform/
    // limits/, read 2026-10-06) is 64 MiB UNCOMPRESSED on both the Free and the Paid plan, and the
    // page says there is no compressed size limit (gzip is shown for reference only), so this line is
    // our own guard against bundle growth, not the platform's: 8.0 MiB raw is 13 % of 64 MiB.
    check(`Worker gzip (${count} files)`, total, baseline.workerGzip + 1000 * KB, 'baseline + 1000 KB');
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
