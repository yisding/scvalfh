/**
 * Every route of the `next build` is prerendered, with EXACT page counts (SPEC §12.3, §8.1).
 *
 *   pnpm build && pnpm assert:prerender
 *
 * The expected set is derived from the inputs of the build, never from its output: the snapshot
 * (`data/snapshot.json`, or `SCVAL_SNAPSHOT` as lib/data.ts reads it) and the league config
 * (`lib/leagues.ts`). So a family that came back short, or long, or a page that lost its
 * generateStaticParams (it would render on demand instead), fails here by name:
 *
 *  - fixed pages: index, about, standings, schedule, playoffs, teams, history/2025-26;
 *  - `standings/<id>.html` and `schedule/<id>.html` for each league id, `playoffs/<id>.html` for each
 *    league-tournament league;
 *  - `game/*.html` = every game (param via `gameIdToParam`, so `sblive:N` is `sblive-N`) plus one
 *    stub per `supersededGames` key (counted separately);
 *  - `scores/*.html` = the distinct game dates, `teams/*.html` = the 43 registry slugs;
 *  - no prerendered path contains ':' (a raw `sblive:` id leaking into a URL);
 *  - OG/page parity BY NAME per family with an image: `game/X.html` ⇔ `game/X/opengraph-image`,
 *    and the same for `standings/<id>`, `schedule/<id>`, `playoffs/<id>`, `teams/<slug>` and
 *    `scores/<date>` — never by count, so one missing card and one extra card cannot cancel out.
 *
 * `next build` writes a prerendered page as `<path>.html` (+ `.rsc`, `.meta`) and a prerendered
 * metadata route as `<path>.body` (+ `.meta`) under `.next/server/app`.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { gameIdToParam } from '../lib/game-id';
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
const files = (readdirSync(APP, { recursive: true }) as string[]).map((f) => f.split(path.sep).join('/'));
const fileSet = new Set(files);

// ---------------------------------------------------------------- ':' in a prerendered path
const colon = files.filter((f) => f.includes(':') && /\.(html|rsc|body|meta|segments)$/.test(f));
if (colon.length) fail(`prerendered paths contain ':' (raw contest id in a URL): ${colon.slice(0, 5).join(', ')}`);

// ---------------------------------------------------------------- config agrees with the snapshot
const snapshotLeagues = snapshot.season.leagues.map((l) => l.id);
if (JSON.stringify(snapshotLeagues) !== JSON.stringify([...LEAGUE_IDS])) {
  fail(`snapshot season.leagues [${snapshotLeagues.join(', ')}] ≠ lib/leagues.ts LEAGUE_IDS [${LEAGUE_IDS.join(', ')}]`);
}

// ---------------------------------------------------------------- fixed pages
const FIXED = ['index', 'about', 'standings', 'schedule', 'playoffs', 'teams', 'history/2025-26'];
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

// Index pages' own cards (file-based, no params) stay where they are.
for (const card of ['opengraph-image', 'standings/opengraph-image']) {
  if (!fileSet.has(`${card}.body`)) fail(`${card} not prerendered`);
}

const totalHtml = files.filter((f) => f.endsWith('.html') && !f.startsWith('_')).length;
console.log(
  `prerendered (next): ${totalHtml} pages — fixed ${FIXED.length}; standings ${pagesIn('standings').length}/${LEAGUE_IDS.length}; ` +
    `schedule ${pagesIn('schedule').length}/${LEAGUE_IDS.length}; playoffs ${pagesIn('playoffs').length}/${tournament.length}; ` +
    `game ${pagesIn('game').length} (${gameParams.length} games + ${stubParams.length} superseded stubs); ` +
    `scores ${pagesIn('scores').length}/${dates.length}; teams ${pagesIn('teams').length}/${slugs.length}`,
);
if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log('assert-prerender: ok');
