/**
 * Every route of the `next build` is prerendered, with EXACT page counts (SPEC §12.3, §8.1).
 *
 *   pnpm build && pnpm assert:prerender
 *
 * The expected set is derived from the inputs of the build, never from its output: the snapshot
 * (`data/snapshot.json`, or `SCVAL_SNAPSHOT` as lib/data.ts reads it), the league config
 * (`lib/leagues.ts`) and the clubs file (`data/clubs.json`, through lib/clubs.ts). So a family that
 * came back short, or long, or a page that lost its generateStaticParams (it would render on demand
 * instead), fails here by name:
 *
 *  - fixed pages: index, about, standings, schedule, playoffs, teams, leaders, history/2025-26, clubs,
 *    commits (DESIGN §19: one page from data/commits.json, with the root OG card);
 *  - `standings/<id>.html` and `schedule/<id>.html` for each league id, `playoffs/<id>.html` for each
 *    league-tournament league;
 *  - `game/*.html` = every game (param via `gameIdToParam`, so `sblive:N` is `sblive-N`) plus one
 *    stub per `supersededGames` key (counted separately);
 *  - `scores/*.html` = the distinct game dates, `teams/*.html` = the 43 registry slugs;
 *  - `clubs/*.html` = the slugs of data/clubs.json, by name (DESIGN §17, SPEC §1.1j2). They come
 *    from `getClubSlugs()`, which reads the file through the bundled import lib/clubs.ts validates
 *    at load, not from the working directory: tests/workflows.test.ts runs this script with its cwd
 *    in a temporary tree. A club with no tied player still has a page, so every slug counts. There
 *    is no clubs OG card (the pages take the root one), so no parity check either;
 *  - every `teams/<slug>.html` carries both a Roster (`id="roster"`) and a Player stats
 *    (`id="player-stats"`) section: all 43 teams, in every league (a missing one means a team page
 *    went back to showing them for SCVAL only);
 *  - `history/2025-26.html` has a section per league of lib/leagues.ts (`id="scval"` … `id="mcal"`)
 *    and an anchor for each division of every league the history data marks available;
 *  - no prerendered path contains ':' (a raw `sblive:` id leaking into a URL);
 *  - OG/page parity BY NAME per family with an image: `game/X.html` ⇔ `game/X/opengraph-image`,
 *    and the same for `standings/<id>`, `schedule/<id>`, `playoffs/<id>`, `teams/<slug>` and
 *    `scores/<date>` — never by count, so one missing card and one extra card cannot cancel out.
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

import { getClubSlugs } from '../lib/clubs';
import { gameIdToParam } from '../lib/game-id';
import { getHistoryLeagues } from '../lib/history';
import { LEAGUE_IDS, TOURNAMENT_LEAGUE_IDS } from '../lib/leagues';

const APP = '.next/server/app';
const SNAPSHOT = process.env.SCVAL_SNAPSHOT ?? 'data/snapshot.json';

interface SnapshotLike {
  games: Array<{ contestId: string; dateKey: string }>;
  supersededGames?: Record<string, string>;
  teams: Array<{ slug: string }>;
  season: { leagues: Array<{ id: string; postseasonKind?: string }> };
}

const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

if (!existsSync(APP)) {
  console.error(`assert-prerender: ${APP} does not exist; run \`pnpm build\` first`);
  process.exit(1);
}
const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as SnapshotLike;

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
const snapshotLeagues = snapshot.season.leagues.map((l) => l.id);
if (JSON.stringify(snapshotLeagues) !== JSON.stringify([...LEAGUE_IDS])) {
  fail(`snapshot season.leagues [${snapshotLeagues.join(', ')}] ≠ lib/leagues.ts LEAGUE_IDS [${LEAGUE_IDS.join(', ')}]`);
}

// ---------------------------------------------------------------- fixed pages
const FIXED = ['index', 'about', 'standings', 'schedule', 'playoffs', 'teams', 'leaders', 'history/2025-26', 'clubs', 'commits'];
for (const p of FIXED) if (!fileSet.has(`${p}.html`)) fail(`fixed page not prerendered: ${p}.html`);

// ---------------------------------------------------------------- families
/** The `.html` pages directly inside `<family>/`, by name (no extension). */
function pagesIn(family: string): string[] {
  const prefix = `${family}/`;
  return files
    .filter((f) => f.startsWith(prefix) && f.endsWith('.html') && !f.slice(prefix.length).includes('/'))
    .map((f) => f.slice(prefix.length, -'.html'.length));
}
/** The names `X` with a prerendered `<family>/X/opengraph-image` card. */
function cardsIn(family: string): string[] {
  const prefix = `${family}/`;
  const suffix = '/opengraph-image.body';
  return files
    .filter((f) => f.startsWith(prefix) && f.endsWith(suffix))
    .map((f) => f.slice(prefix.length, -suffix.length))
    .filter((name) => name !== '' && !name.includes('/') && !name.startsWith('['));
}
function diff(a: Iterable<string>, b: Iterable<string>): string[] {
  const bs = new Set(b);
  return [...a].filter((x) => !bs.has(x));
}
function sample(list: string[]): string {
  return list.slice(0, 5).join(', ') + (list.length > 5 ? `, … (${list.length})` : '');
}

/** Exact page set for a family, then OG/page parity by name. */
function family(name: string, expected: readonly string[], opts: { og: boolean }): void {
  const got = pagesIn(name);
  const missing = diff(expected, got);
  const extra = diff(got, expected);
  if (missing.length) fail(`${name}/: ${missing.length} expected page(s) not prerendered: ${sample(missing)}`);
  if (extra.length) fail(`${name}/: ${extra.length} unexpected page(s) prerendered: ${sample(extra)}`);
  if (new Set(expected).size !== expected.length) fail(`${name}/: the expected params contain duplicates`);
  if (!opts.og) return;
  const cards = cardsIn(name);
  const noCard = diff(got, cards);
  const noPage = diff(cards, got);
  if (noCard.length) fail(`${name}/: page without its opengraph-image: ${sample(noCard.map((x) => `${name}/${x}.html`))}`);
  if (noPage.length) fail(`${name}/: opengraph-image without its page: ${sample(noPage.map((x) => `${name}/${x}/opengraph-image`))}`);
}

const gameParams = snapshot.games.map((g) => gameIdToParam(g.contestId));
const stubParams = Object.keys(snapshot.supersededGames ?? {}).map(gameIdToParam);
const overlap = stubParams.filter((p) => gameParams.includes(p));
if (overlap.length) fail(`superseded stubs that are also live games: ${sample(overlap)}`);
const dates = [...new Set(snapshot.games.map((g) => g.dateKey))].sort();
const slugs = snapshot.teams.map((t) => t.slug);
if (slugs.length !== 43) fail(`snapshot has ${slugs.length} teams, expected 43`);
const tournament = [...TOURNAMENT_LEAGUE_IDS];
const snapshotTournament = snapshot.season.leagues.filter((l) => l.postseasonKind === 'league-tournament').map((l) => l.id);
if (JSON.stringify(snapshotTournament) !== JSON.stringify(tournament)) {
  fail(`snapshot tournament leagues [${snapshotTournament.join(', ')}] ≠ TOURNAMENT_LEAGUE_IDS [${tournament.join(', ')}]`);
}

family('standings', LEAGUE_IDS, { og: true });
family('schedule', LEAGUE_IDS, { og: true });
family('playoffs', tournament, { og: true });
family('game', [...gameParams, ...stubParams], { og: true });
family('scores', dates, { og: true });
family('teams', slugs, { og: true });
family('history', ['2025-26'], { og: false });
const clubSlugs = getClubSlugs();
family('clubs', clubSlugs, { og: false });

// The history page: one section per league, division anchors for every available league.
{
  const p = path.join(APP, 'history', '2025-26.html');
  if (existsSync(p)) {
    const html = readFileSync(p, 'utf8');
    for (const { id, entry } of getHistoryLeagues()) {
      if (!html.includes(`id="${id}"`)) fail(`history/2025-26: no section id="${id}"`);
      if (entry.status === 'available') {
        for (const d of entry.divisions) {
          if (!html.includes(`id="${d.division}"`)) fail(`history/2025-26: no division anchor id="${d.division}"`);
        }
      }
    }
  }
}

// Roster and Player stats on every team page, all four leagues (the empty states count: a team
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
  `prerendered (next): ${totalHtml} pages — fixed ${FIXED.length}; standings ${pagesIn('standings').length}/${LEAGUE_IDS.length}; ` +
    `schedule ${pagesIn('schedule').length}/${LEAGUE_IDS.length}; playoffs ${pagesIn('playoffs').length}/${tournament.length}; ` +
    `game ${pagesIn('game').length} (${gameParams.length} games + ${stubParams.length} superseded stubs); ` +
    `scores ${pagesIn('scores').length}/${dates.length}; teams ${pagesIn('teams').length}/${slugs.length}; ` +
    `clubs ${pagesIn('clubs').length}/${clubSlugs.length}`,
);
if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log('assert-prerender: ok');
