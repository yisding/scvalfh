/**
 * Every route of the `next build` is prerendered, with EXACT page counts (SPEC §12.3, §8.1).
 *
 *   pnpm build && pnpm assert:prerender
 *
 * The expected set is derived from the inputs of the build, never from its output: the snapshot
 * (`data/snapshot.json`, or `SCVAL_SNAPSHOT`, read through lib/data.ts' getSnapshot as the build
 * reads it, so a file written before a league was added is checked as the build rendered it,
 * upgraded), the league config (`lib/leagues.ts`) and the clubs file (`data/clubs.json`, through
 * lib/clubs.ts). So a family that came back short, or long, or a page that lost its
 * generateStaticParams (it would render on demand instead), fails here by name:
 *
 *  - fixed pages: index, about, standings, schedule, playoffs, teams, leaders, history/2025-26, clubs,
 *    commits (DESIGN §21: one page from data/commits.json, with the root OG card);
 *  - `standings/<id>.html` and `schedule/<id>.html` for each league id (nine since the Southern
 *    California amendment), `playoffs/<id>.html` for each league-tournament league (still MCAL only:
 *    the EAL, the Sunset and the three San Diego leagues have no page of their own, only a card,
 *    `id="<league>"`, on /playoffs);
 *  - `game/*.html` = every game (param via `gameIdToParam`, so `sblive:N` is `sblive-N`) plus one
 *    stub per `supersededGames` key (counted separately);
 *  - `scores/*.html` = the distinct game dates, `teams/*.html` = the registry slugs (102 since the
 *    Southern Section independents joined, 99 with the Southern California amendment; the snapshot's team
 *    slugs must equal TEAMS, in order);
 *  - `clubs/*.html` = the slugs of data/clubs.json, by name (DESIGN §17, SPEC §1.1j2). They come
 *    from `getClubSlugs()`, which reads the file through the bundled import lib/clubs.ts validates
 *    at load, not from the working directory: tests/workflows.test.ts runs this script with its cwd
 *    in a temporary tree. A club with no tied player still has a page, so every slug counts. There
 *    is no clubs OG card (the pages take the root one), so no parity check either;
 *  - every `teams/<slug>.html` carries both a Roster (`id="roster"`) and a Player stats
 *    (`id="player-stats"`) section: every registry team, in every league (a missing one means a team
 *    page went back to showing them for SCVAL only);
 *  - no prerendered path contains ':' (a raw `sblive:` id leaking into a URL);
 *  - OG/page parity BY NAME per family with an image: `game/X.html` ⇔ `game/X/opengraph-image`,
 *    and the same for `standings/<id>`, `schedule/<id>`, `playoffs/<id>`, `teams/<slug>` and
 *    `scores/<date>` — never by count, so one missing card and one extra card cannot cancel out.
 *
 * The fixed pages, the families' params and the cross-checks are scripts/lib/prerender-expectations.ts,
 * shared with the vinext gate (scripts/assert-vinext-prerender.ts), so the two cannot drift apart.
 *
 * `next build` writes a prerendered page as `<path>.html` (+ `.rsc`, `.meta`) and a prerendered
 * metadata route as `<path>.body` (+ `.meta`) under `.next/server/app`.
 *
 * `next start` writes there too: `dynamicParams = false` does not reach a metadata route, so an
 * unknown param's card (`/standings/nope/opengraph-image`, which the smoke script and any crawler
 * request) is rendered on demand, answers 404, and is persisted as `<family>/nope/opengraph-image`
 * `.body` (0 bytes) + `.meta` (`"status":404`). Those entries are not part of the build: they are
 * left out here (see `notBuilt`), so this assertion holds on a `.next` that has served traffic.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { getSnapshot } from '../lib/data';
import { FIXED_PAGES, expectedFamilies, makeFamilyChecker, sample } from './lib/prerender-expectations';

const APP = '.next/server/app';

const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

if (!existsSync(APP)) {
  console.error(`assert-prerender: ${APP} does not exist; run \`pnpm build\` first`);
  process.exit(1);
}
const snapshot = getSnapshot();

/** Every file under .next/server/app, as forward-slash paths relative to it. */
const allFiles = (readdirSync(APP, { recursive: true }) as string[]).map((f) => f.split(path.sep).join('/'));

/**
 * An `opengraph-image` entry whose `.meta` records a status other than 200: a 404 that `next start`
 * rendered on request for an unknown param and cached (see the header), never a prerendered card.
 * A card without a `.meta`, or with no status in it, counts as prerendered.
 */
function notBuilt(base: string): boolean {
  if (!base.endsWith('opengraph-image')) return false;
  const meta = path.join(APP, `${base}.meta`);
  if (!existsSync(meta)) return false;
  try {
    const status = (JSON.parse(readFileSync(meta, 'utf8')) as { status?: unknown }).status;
    return status !== undefined && status !== 200;
  } catch {
    return false;
  }
}
const runtime404 = new Set(
  allFiles.filter((f) => f.endsWith('.meta')).map((f) => f.slice(0, -'.meta'.length)).filter(notBuilt),
);
const files = allFiles.filter((f) => !runtime404.has(f.replace(/\.(body|meta)$/, '')));
const fileSet = new Set(files);
if (runtime404.size) {
  console.log(`assert-prerender: ignoring ${runtime404.size} opengraph-image 404(s) cached by \`next start\``);
}

// ---------------------------------------------------------------- ':' in a prerendered path
const colon = files.filter((f) => f.includes(':') && /\.(html|rsc|body|meta|segments)$/.test(f));
if (colon.length) fail(`prerendered paths contain ':' (raw contest id in a URL): ${colon.slice(0, 5).join(', ')}`);

// ---------------------------------------------------------------- config agrees with the snapshot
const expected = expectedFamilies(snapshot, fail);
const { gameParams, stubParams, dates, slugs, clubSlugs } = expected;

// ---------------------------------------------------------------- fixed pages
for (const p of FIXED_PAGES) if (!fileSet.has(`${p}.html`)) fail(`fixed page not prerendered: ${p}.html`);

// ---------------------------------------------------------------- families
const { pagesIn, allFamilies } = makeFamilyChecker(files, { cardSuffix: '/opengraph-image.body', fail });
allFamilies(expected);

// Roster and Player stats on every team page, every league (the empty states count: a team
// nothing has been collected for still says so, rather than dropping the section).
const noSections: string[] = [];
for (const slug of slugs) {
  const p = path.join(APP, 'teams', `${slug}.html`);
  if (!existsSync(p)) continue; // already reported by family('teams')
  const html = readFileSync(p, 'utf8');
  for (const id of ['roster', 'player-stats']) {
    if (!html.includes(`id="${id}"`)) noSections.push(`${slug} (#${id})`);
  }
}
if (noSections.length) fail(`teams/: ${noSections.length} team page section(s) missing: ${sample(noSections)}`);

// Index pages' own cards (file-based, no params) stay where they are.
for (const card of ['opengraph-image', 'standings/opengraph-image']) {
  if (!fileSet.has(`${card}.body`)) fail(`${card} not prerendered`);
}

const totalHtml = files.filter((f) => f.endsWith('.html') && !f.startsWith('_')).length;
console.log(
  `prerendered (next): ${totalHtml} pages — fixed ${FIXED_PAGES.length}; standings ${pagesIn('standings').length}/${expected.leagueIds.length}; ` +
    `schedule ${pagesIn('schedule').length}/${expected.leagueIds.length}; playoffs ${pagesIn('playoffs').length}/${expected.tournament.length}; ` +
    `game ${pagesIn('game').length} (${gameParams.length} games + ${stubParams.length} superseded stubs); ` +
    `scores ${pagesIn('scores').length}/${dates.length}; teams ${pagesIn('teams').length}/${slugs.length}; ` +
    `clubs ${pagesIn('clubs').length}/${clubSlugs.length}`,
);
if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log('assert-prerender: ok');
