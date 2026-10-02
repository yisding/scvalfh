# SCVAL Field Hockey

Scores, standings, schedules and the CCS playoff picture for the 15 De Anza and El Camino girls
varsity field hockey teams (Santa Clara Valley Athletic League). A static Next.js site rebuilt
from one JSON snapshot, refreshed nightly by a scheduled GitHub Actions job. The same source also
builds and serves on vinext (Vite), on Node and as a Cloudflare Worker; see "Deploy notes".

Unofficial. Not affiliated with SCVAL, CIF-CCS, MaxPreps or Sports Illustrated. See
"Attribution and legal posture" below.

## Live routes

| Route | What it shows |
|---|---|
| `/` | Today's/most-recent games, next games, standings snapshot |
| `/standings` | Both division tables — De Anza and El Camino, with PTS, W-L-T, GF/GA/GD, streak, last 5 |
| `/schedule` | Full season schedule, filterable client-side |
| `/scores/[date]` | One day's scoreboard (one static page per date with a game; OG card per date) |
| `/game/[id]` | One game's detail page (one static page per game; OG card per game) |
| `/teams` | All 15 SCVAL teams |
| `/teams/[slug]` | One team's record, schedule, results, splits |
| `/playoffs` | CCS auto-qualifier / play-in / at-large projection, and the bracket once CCS publishes one |
| `/history/2025-26` | Prior season's final standings (record-only, from the official PDF) |
| `/about` | Data sources, cross-check tables, methodology, attribution |

Every prerendered game, date and team page also has a generated `opengraph-image` route, and the
site publishes `sitemap.xml`, `robots.txt` and a web manifest (`app/sitemap.ts`, `app/robots.ts`,
`app/manifest.ts`).

## How data flows

```
MaxPreps ghost API  ──┐
si.com (SBLive)      ──┼──► scripts/fetch-data.ts ──► data/snapshot.json ──► next build ──► static site
scval.com PDFs        ──┤        (lib/sources/*)        data/snapshot.meta.json
cifccs.org / VNN .ics ──┘                                                 or vite build (vinext)
```

1. **`scripts/fetch-data.ts`** is the cron entry point (see `docs/DATA-SOURCES.md` for every
   endpoint, JSON path and gotcha). It runs a 20-request MaxPreps sweep (season/league
   assertions, both division standings tables, all 15 SCVAL teams' full-season schedules) that
   **aborts and keeps the previous snapshot** if the season/league ids ever change — a
   half-migrated season is never published. Secondary sources (SBLive score cross-check, the two
   SCVAL schedule PDFs, the SCVAL standings-PDF poll, the two VNN `.ics` feeds, the CCS
   calendar/bracket poll) are all optional and failure-tolerant: a failed request becomes a
   `SourceStatus` row, never a blank section.
2. It writes **`data/snapshot.json`** (the full normalized `Team[]`/`Game[]`/`Standing[]`/
   `Playoffs`/`SourceStatus[]`) and **`data/snapshot.meta.json`** (counts, timestamps, a short
   summary — what the update-data workflow uses for its commit message and job summary).
3. **`next build`** (or `vite build` under vinext) reads only `data/snapshot.json` (`lib/data.ts`)
   and prerenders every route — there is no request-time fetch, no database and no
   `searchParams` anywhere. "Today" for rendering purposes is always derived from the snapshot's
   `fetchedAt`, never `Date.now()`, so a given commit builds byte-identically no matter when
   `next build` runs.
4. Standings are **computed from game rows**, not taken from MaxPreps' own numbers — see "How
   standings are computed" below. MaxPreps' reported row is kept alongside for cross-check and
   shown as a flagged mismatch when the two disagree (visible on `/about#cross-check` and on the
   standings rows themselves).

### The cron

`.github/workflows/update-data.yml` runs `pnpm fetch-data` on a schedule, **twice a day, only in
season** (cron `0 14 * 8-12 *` and `0 5 * 8-12 *` — 7:00 AM and 10:00 PM Pacific during PDT,
restricted to Aug-Dec so it rarely fires out of season; the cron's months are UTC, and December
is there only for the Nov 30 10:00 PM Pacific run, which is already December 1 in UTC). The
season itself is bounded by `fetch-data.ts`'s own Aug 1 - Nov 30 Pacific window guard: a run
outside it exits without writing anything. It runs the test suite against the snapshot it
just wrote, and commits `data/snapshot.json` + `data/snapshot.meta.json` **only if they changed**.
The commit is what triggers your hosting provider's rebuild — that's the entire point of the job,
so it deliberately does not carry `[skip ci]`.

For this to work on a deployed copy of this repo:
1. **Push the repo to GitHub** with Actions enabled.
2. Under **Settings → Actions → General → Workflow permissions**, select **"Read and write
   permissions"** (the job needs `contents: write` to commit the refreshed snapshot back to the
   branch — already declared in the workflow, but the repo-level default must allow it).
3. Connect your host (see "Deploy notes") to redeploy automatically on push to `main` — most
   static hosts do this without any extra configuration once the repo is linked.

### Self-hosting the cron

If you're not using GitHub Actions, run the same two commands from any scheduler that can reach
the internet on your host, twice a day during the season:

```cron
0 7,22 * 8-11 * cd /path/to/scvalfh && pnpm fetch-data && pnpm build
```

Or by hand, any time:

```bash
pnpm fetch-data   # refresh data/snapshot.json + data/snapshot.meta.json
pnpm build        # rebuild the static site from the new snapshot
pnpm start         # or redeploy the .next output to your host
                   # (vinext: pnpm build:vinext && pnpm start:vinext, or pnpm deploy:cloudflare
                   # for the Worker; see "Deploy notes")
```

Useful flags on `fetch-data` (see the header of `scripts/fetch-data.ts` for the full list):
`--fixtures <dir>` runs entirely offline against captured fixtures; `--dry-run` validates and
reports without writing; `--force` bypasses the season-window guard; `--no-sblive`/`--no-scval`/
`--no-ccs`/`--no-vnn` skip individual secondary sources.

### Rosters

`data/rosters.json` holds every team's player list — name, jersey number, grade, position(s),
height and captain flag, whatever the coach entered on MaxPreps — built by `pnpm fetch-rosters`
from the 16 MaxPreps roster pages and committed, like the history file, rather than refreshed by
the cron (rosters change a few times a season; run it by hand or weekly). The page encodes each
athlete as a 37-element positional array, so `lib/sources/maxpreps-roster.ts` decodes it with
MaxPreps' own column list and cross-checks every row against the page's rendered table, failing
the team rather than publishing a wrong grade beside a name. Blanks are `null`, never guessed;
soft-deleted rows are dropped; a team whose fetch fails keeps its previous rows with
`status: "carried-forward"`.

`data/rosters-enrichment.json` is what other public sources add to that — the schools' own
athletics-site rosters, one roster PDF, two school papers, MaxPreps career and JV pages — gathered
by hand once (2026-10-02) and joined on the MaxPreps athlete id. It only ever fills a blank; where
a source disagrees with MaxPreps, MaxPreps stays and the disagreement is recorded; every value
carries its source URL, kind and a confidence. `lib/rosters.ts` is the read API:
`getTeamRoster(slug)` is MaxPreps alone, `getEnrichedTeamRoster(slug)` the merged view with
per-field provenance, conflicts and coaches, `sortedPlayers(team)` the display order. Each team
page renders it in a Roster section (`components/teams/TeamRoster.tsx`, built by
`components/teams/roster-view.ts`): varsity only, a † on every value that did not come from
MaxPreps, the coaches, every recorded disagreement and a link to each source. See `docs/DATA-SOURCES.md` §1.1j for the column map, the per-school sources and
the overlay's rules.

```bash
pnpm fetch-rosters                                      # live: 16 roster pages → data/rosters.json
pnpm fetch-rosters --fixtures tests/fixtures/maxpreps   # offline, from the captured pages
pnpm fetch-rosters --dry-run                            # parse and report, write nothing
```

## Local development

```bash
pnpm install
pnpm dev            # next dev (port 3000)
pnpm typecheck      # next typegen, then tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest run
pnpm build          # next build — prerenders every route from data/snapshot.json
pnpm start          # next start — serves .next/ on port 3000

pnpm dev:vinext     # vite dev (vinext) on port 3001, so it can run beside `pnpm dev`
pnpm build:vinext   # vite build into dist/ — prerenders every route, as `pnpm build` does
pnpm start:vinext   # vinext start — serves dist/ on port 3000 (-p/--port <n>, or PORT)

pnpm build:cloudflare    # vite build --mode cloudflare — the same prerender, as a Cloudflare
                         # Worker in .cloudflare/output/ (it empties dist/: run build:vinext
                         # again before start:vinext)
pnpm preview:cloudflare  # vite preview --mode cloudflare — runs that build in workerd, port 4173
pnpm deploy:cloudflare   # vinext-cloudflare deploy — rebuilds it and uploads it to Cloudflare
```

`pnpm build` and `next dev` both read the snapshot already checked into `data/`, so you can
develop and build without ever calling a live upstream API. Every build bundles
`data/snapshot.json` and `data/history-2025-26.json` into its server code (`lib/data.ts` and
`lib/history.ts` import them), so no server reads `data/` at run time. The vinext scripts read the
same `app/` and `next.config.ts`; vinext adds `vite.config.ts`, `cloudflare.config.ts` for the
Worker, two patches (see "The vinext patch") and its own outputs, `dist/`, `.vinext/` and
`.cloudflare/`, all gitignored and skipped by `eslint.config.mjs`. `--mode cloudflare` is what
switches `vite.config.ts` to the Workers target, and the Vite mode also picks the dotenv files: the
three Cloudflare scripts load `.env`, `.env.local`, `.env.cloudflare` and `.env.cloudflare.local`,
never `.env.production`.

To point at a different snapshot file (e.g. a fixture-built one), set
`SCVAL_SNAPSHOT=/path/to/snapshot.json`; `SCVAL_HISTORY` does the same for
`data/history-2025-26.json`. Both are read with `node:fs` when the module loads, so they work
under Next, vitest, tsx and vinext's Node target, never on a Worker, which has no filesystem to
read them from: leave them unset for the Cloudflare scripts.

`pnpm typecheck` runs `next typegen` first because the global `PageProps`/`LayoutProps` types used
by the dynamic pages, their OG images and `app/layout.tsx` are generated into
`.next/types/routes.d.ts`, which a clean checkout does not have and which vinext's Vite plugin
overwrites with its own declarations; Next stays the type authority.

`.github/workflows/ci.yml` runs on every push to `main` and every PR: typecheck, lint, test,
build, and an assertion that every route family actually prerendered (no route should ever fall
back to dynamic rendering — `generateStaticParams` covers every `/game/[id]`, `/scores/[date]`
and `/teams/[slug]`). A second job starts `next start` on that build, holds it to the response
contract with `scripts/smoke-server.sh` (see "vinext" under "Deploy notes") and runs `axe-core`
against it (`scripts/a11y-axe.mjs`) across every route family, both themes, both a phone and a
desktop viewport, failing on any serious/critical accessibility violation. Two more jobs, one per
vinext target, run beside them (not after `gates`, so a vinext regression shows even when Next is
red). `vinext` builds with `pnpm build:vinext`; `cloudflare` first validates the deploy setup
with `vinext-cloudflare deploy --env cloudflare --dry-run`, which needs no credentials, then
builds with `pnpm build:cloudflare` and a non-localhost `SITE_URL`. Each asserts with
`scripts/assert-vinext-prerender.mjs` that every route rendered with `revalidate: false`, that
the static pages, metadata routes and Route Handlers are on disk, that the game, date and team
pages and their OG images clear the same minimum counts as the Next build and that the
prerendered sitemap lists exactly the prerendered pages; for the Worker it also checks that every
one of them is packaged into the static-assets cache and every file its index lists is there,
that `_headers` is there, and that nothing else ships: no precompressed copy, and nothing at the
top level of the upload but `_headers`, `_next/` and `_vinext/` unless `.assetsignore` keeps it
out. Then each starts its server (`vinext start`, or the Worker
in workerd through `vite preview`) and runs the same `scripts/smoke-server.sh` and axe passes
against it. Uploading the Worker is `.github/workflows/deploy-cloudflare.yml`'s job (see
"Cloudflare Workers").

## Tests

`pnpm test` runs the full Vitest suite: snapshot-schema validation, standings/tiebreak arithmetic
against synthetic and fixture data, the MaxPreps/SBLive reconciliation rules, PDF-grid parsing,
the "never render a missing score as 0-0" rule across every `GameRow` variant and every non-final
game page, and playoff-projection edge cases (shared 3rd, the Oct 30 play-in/crossover, unnamed
rounds). Fixtures captured from real (offline) MaxPreps/SCVAL responses live under
`tests/fixtures/`.

## Next-season bootstrap

MaxPreps' season and league ids are **never hardcoded into more than one place** — they live in
`lib/season.ts` and are re-asserted on every `fetch-data` run. When the season rolls over:

```bash
pnpm discover-season                              # or: pnpm exec tsx scripts/discover-season.ts
pnpm exec tsx scripts/discover-season.ts --ssid <sportSeasonId>   # pin explicitly if needed
```

`scripts/discover-season.ts` reads the new `sportSeasonId`/`allSeasonId`/`genderSport`/
`teamLevel` from MaxPreps' state hub page, resolves both league ids through `team-context/v1`,
asserts they agree with `leagues/{id}/v1`, and prints a diff against `lib/season.ts` plus a
ready-to-paste constants block. **It never writes a file** — a human reviews the diff and edits
`lib/season.ts`, because a wrong season id would silently publish last year's table under this
year's URL.

Once a season is finished, its final standings are permanently only available from the SCVAL
end-of-season PDFs (a MaxPreps league URL's year segment is cosmetic and always serves the
current season). Run `pnpm build-history` once, by hand, after the PDFs are published, to
generate `data/history-<season>.json` from `https://www.scval.com/standings/` — it is a
record-only file (final W-L-T as published; no recomputed points, since the PDF has no
game-level data to recompute from) and is committed to the repo, not regenerated by the cron.

## How standings are computed

Per the **SCVAL Field Hockey By-Laws 2026-27, Article VI** (verified copy in
`docs/BYLAWS-2026-27.md`; implementation in `lib/standings.ts`):

- **§1** — double round robin; only games between two members of the *same* division count
  toward the division record.
- **§2** — **3 points for a win, 1 point for a tie.** Standings order by total points. A tie at
  the top of a division means co-champions.
- **§3-§6** — if teams are tied on points, work through the tiebreakers **in order, restarting
  from §3 once any team is broken out**: (§3) better head-to-head record among the tied teams;
  (§4) more wins in division play; (§5) fewest goals allowed among the tied teams' head-to-head
  games; (§6) goal differential among those same head-to-head games.
- **§7** — if still tied, the by-laws call for a coin flip. This site cannot compute that, so
  those teams **share a place** with a footnote citing §7, rather than guessing an order.

**Article VII** governs CCS qualification: places 1-3 in each division are automatic qualifiers;
4th place plays a play-in game (Oct 30) for the SCVAL's 7th auto-qualifier slot; the play-in
loser and both divisions' 5th-place teams go to CCS for at-large consideration; 6th and below are
out. The `/playoffs` page labels every row with its by-law citation.

Standings are always **computed from individual game rows**, not read off MaxPreps' own
`conferenceStandingPlacement`/points fields — MaxPreps' own arithmetic has shown internal
inconsistencies (see `docs/DATA-SOURCES.md` §7). MaxPreps' reported row is kept on every
`Standing` for cross-check and shown as a flagged mismatch (⚑) when it disagrees with the
computed one; see `/about#cross-check`.

## Known limitations

- **Wilcox is not fielding a team this season.** The official SCVAL De Anza grid still lists it,
  but it is not in the team registry: its 14 grid fixtures are dropped when the PDF is parsed, and
  De Anza is shown as 7 teams (`WITHDRAWN_SCHOOL_NAMES` in `lib/teams.ts`).
- **MaxPreps' manual entry lags.** Coaches enter scores by hand; at times only a fraction of
  played games carry a score days after the fact, and MaxPreps occasionally corrects a
  previously-entered result. The fetch script re-ingests every team's entire season on every run
  (not just a trailing window) specifically so corrections and backfills are never missed.
- **SBLive's league buckets are wrong for this league.** Its "De Anza" and "El Camino" pages
  misfile several SCVAL schools between divisions and omit Santa Clara entirely. SBLive is used
  strictly as a score cross-check and same-day scoreboard timestamp source — division membership
  and league records are **never** taken from it.
- **The CCS playoff bracket doesn't exist until after entries close on Nov 2.** Before then,
  `/playoffs` shows a projection built from the by-laws' auto-qualifier rules and the standings
  as they stand. From Nov 2 the site polls the CCS calendar and MaxPreps' tournament page for a
  published bracket; until CCS actually publishes one, the bracket section stays in its seeded
  projection state (it has never been exercised against a real published bracket — only against
  synthetic test data).
- **Roster detail depends on the coach.** As of 2026-10-02 five programs publish grade, position
  and number on MaxPreps, three publish grade and number only, seven publish names only (Los
  Gatos' 58 names are the whole program, varsity and JV).
  The MaxPreps file stores exactly that — a blank is `null`, never a guess. The schools' own
  sites fill most of the grades (303 of 341 players once the enrichment overlay is applied) and
  a few heights, but **no current-season public source lists positions for 7 of the 15
  programs** (108 of 341 have one), Los Altos and Homestead publish no roster anywhere, and
  si.com's rosters were rejected as a source (names only, and often a different list of names).
- JV is out of scope; MaxPreps' season-year URL segment is cosmetic (it always serves the current
  season, never a prior one); and a handful of MaxPreps/school-calendar start-time disagreements
  and SBLive-only games that MaxPreps never published are surfaced as warnings rather than
  silently resolved. See `docs/DATA-SOURCES.md` §7 for the full list of open risks.

## Attribution and legal posture

Every page that shows league data carries a visible attribution line and deep-links back to the
originating MaxPreps/SBLive/scval.com/cifccs.org page (`components/layout` attribution + every
`Game`/`Standing` row's outbound link). This site stores its own **derived** records — normalized
scores and independently computed standings — not verbatim copies of any source page, refreshes
on a self-imposed 1-2-runs-a-day budget well under any observed rate limit, sends an identifying
User-Agent, and serves only its own cached static snapshot (it never proxies a live upstream
request per visitor). See `docs/DATA-SOURCES.md` §6 for the full posture and the exact
attribution text rendered in the footer.

## Deploy notes

Every route is prerendered at build time — no database, no request-time data fetching, and no API
routes beyond the OG-image generators, which are prerendered too. It is NOT `output: 'export'`,
though: serving it needs Next.js's own server, a host adapter that provides one, `vinext start` or
vinext's Cloudflare Worker (see "vinext" and "Cloudflare Workers" below), because the 404s for
unknown dynamic params and the metadata routes (`/icon`, `/apple-icon`, `/opengraph-image`,
`/robots.txt`, `/sitemap.xml`) are served by the framework.

Copy `.env.example` to `.env` (or set the same variables in the host's dashboard) and set
`SITE_URL` before the first production build.

- **Vercel / Netlify / Cloudflare Pages:** connect the GitHub repo, build command `pnpm build`,
  output is the framework-default `.next` (all three have first-party Next.js App Router
  support, including static prerendering and `generateStaticParams` route trees). Set the
  `SITE_URL` environment variable to your production domain before the first build — it drives
  `metadataBase`, `robots.txt` and every absolute URL in `sitemap.xml`. Each of these hosts
  redeploys automatically on a push to `main`, which is exactly what `update-data.yml`'s commit
  triggers.
- **Self-host:** `pnpm build && pnpm start` runs Next.js's own production server behind any
  reverse proxy that can talk to a Node process. Set `SITE_URL` the same way. Pair with the cron
  line under "Self-hosting the cron" above to keep data fresh without GitHub Actions at all.
- **vinext:** `pnpm build:vinext && pnpm start:vinext` on Node, or `pnpm deploy:cloudflare` to
  Cloudflare Workers, which `.github/workflows/deploy-cloudflare.yml` runs after every green `ci`
  run and snapshot refresh on `main` once an account is connected. See "vinext" and "Cloudflare
  Workers" below.

`SITE_URL` defaults to `http://localhost:3000` (`components/layout/site-url.ts`) when unset, so
`metadataBase`, `robots.txt` and `sitemap.xml` will point at localhost until it's set in the
deploy environment — no production domain is hardcoded anywhere in the repo. `.env.example` lists
it and the three optional variables; copy it to `.env` for a local production build.

### vinext

The same source also builds and serves on [vinext](https://github.com/cloudflare/vinext) 1.0.0, a
reimplementation of the Next.js API surface on Vite 8, wired in by `vite.config.ts`. It runs
beside the Next toolchain, not instead of it, with two targets: vinext's Node server, here, and
Cloudflare Workers (next section).

```bash
pnpm build:vinext && pnpm start:vinext   # vite build into dist/, then vinext start on port 3000
```

Run it behind any reverse proxy that can talk to a Node process, as with `next start`. `dist/` is
the whole build output and the snapshot is bundled into it, so `vinext start` no longer needs
`data/` beside it. `SCVAL_SNAPSHOT` and `SCVAL_HISTORY` still swap in another file through
`node:fs` wherever the data modules load (the prerender, and `vinext start` for what it renders on
request), so a server given one should get the file the build had. `SITE_URL` and `SCVAL_BUILD_AT`
are fixed at build time on both vinext targets: `vite.config.ts` reads them with Vite's `loadEnv`
(the process environment first, then the mode's `.env` files) and inlines them with `define`, so
the prerendered pages and whatever is rendered on request (every 404) carry the same values,
whatever the server's environment says. An unset `SITE_URL` keeps the `http://localhost:3000`
fallback; an unset `SCVAL_BUILD_AT` becomes the instant the build ran. Only `next start` still
reads both at run time, so it needs the values `next build` had. `vite build` and `vinext start`
both load `.env` the way Next does. The Workers build empties `dist/` (it stages its prerender
there), so after `pnpm build:cloudflare` run `pnpm build:vinext` again before `pnpm start:vinext`.

`vite.config.ts` sets `prerender: { routes: '*' }`, so `pnpm build:vinext` prerenders everything
`next build` does — 463 routes with the current snapshot, all `revalidate: false` in
`dist/server/vinext-prerender.json`: all 230 pages (HTML and RSC payload) plus a 404 page, and
every icon, apple-icon, `/icon-192`, `/icon-512`, OG image (root, `/standings`, one per game, date
and team), `manifest.webmanifest`, `sitemap.xml` and `robots.txt`, under
`dist/server/prerendered-routes/`. `vinext start` seeds its cache from them at startup
("Seeded 463 pre-rendered routes into memory cache") and serves each one as built. None of them
renders per request; a 404, which no prerendered route covers, is what the server renders on
request (see above).

The response-header contract is the same on all three servers — `next start`, `vinext start` and
the Worker: every page, metadata route and OG image carries the `next.config.ts` `headers()` rule,
`public, s-maxage=300, stale-while-revalidate=86400`; hashed `/_next/static/**` assets keep
`public, max-age=31536000, immutable` (served from build-time gzip/brotli/zstd files under
`vinext start`, `precompress: true` in `vite.config.ts`, because it does not compress them on the
fly); 404 pages are `private, no-cache, no-store, max-age=0, must-revalidate`, so no shared cache
keeps one; HTML pages carry an ETag and answer a matching `If-None-Match` with 304; and no server
sends `X-Powered-By`. `scripts/smoke-server.sh <base-url> <next|node|workers>` checks all of it,
on every page the sitemap lists, against whichever server you started (its header shows the three
commands), and names the few checks that differ by target; CI runs it on all three. One known
difference: `OPTIONS` on a Route Handler (`/icon-192`, `/icon-512`) is a 204 under vinext and a
405 under Next.

### Cloudflare Workers

vinext's second target runs the same build as a Cloudflare Worker. One `vite.config.ts` serves
both: `--mode cloudflare` adds `@cloudflare/vite-plugin` and swaps `precompress` for vinext's
static-assets cache, and `cloudflare.config.ts` declares the Worker for the plugin and for
`cf deploy`.

```bash
pnpm build:cloudflare     # vite build --mode cloudflare into .cloudflare/output/
pnpm preview:cloudflare   # that build, run locally in workerd (Vite's preview port, 4173)
pnpm deploy:cloudflare    # vinext-cloudflare deploy --env cloudflare: build, then cf deploy
```

`pnpm build:cloudflare` prerenders the same 463 routes as `pnpm build:vinext` (all
`revalidate: false`; the prerender runs the Worker bundle in Node) and writes a Cloudflare Build
Output to `.cloudflare/output/v0/`: the Worker bundle and its `worker.config.json` under
`workers/default/`, and its Workers Static Assets. A Worker has no filesystem to seed a cache
from, so `staticAssetsAdapter()` (from `@vinext/cloudflare`) packages the prerender into those
assets under `/_vinext/static-cache/`, with an `index.json` the Worker looks them up in: 231 HTML
pages (the 230 pages and the 404) with 230 RSC payloads, and 232 metadata route and Route Handler
bodies. vinext also writes a `_headers` file giving `/_next/static/*` the immutable Cache-Control.
At run time Workers Static Assets serves `/_next/static/**` itself; every page URL misses it
(`notFoundHandling: 'none'`) and reaches the Worker, which answers from the static cache through
its `ASSETS` binding; and `runWorkerFirst` keeps the raw `/_vinext/static-cache/*` files from being
fetched directly (they are 404s). The Worker renders only 404s on request. `cloudflare.config.ts`
names the Worker `scvalfh`, turns on `nodejs_compat`, pins the compatibility date to the workerd
release the plugin bundles and declares no vars: `SITE_URL` and `SCVAL_BUILD_AT` are inlined at
build time (see "vinext"), and `SCVAL_SNAPSHOT`/`SCVAL_HISTORY` need a filesystem a Worker does not
have. `--mode cloudflare` loads `.env`, `.env.local`, `.env.cloudflare` and
`.env.cloudflare.local`, never `.env.production`, so put the Worker build's `SITE_URL` in the
environment or in `.env.cloudflare`.

`pnpm preview:cloudflare` serves `.cloudflare/output/` as built, without rebuilding, in workerd
(the runtime Cloudflare runs Workers on) through the Cloudflare Vite plugin, with the `ASSETS`
binding; it takes `vite preview`'s `--port`, `--strictPort` and `--host`. The response contract
above holds there, ETag and 304 included (the patched Worker entry answers the 304 as
`vinext start` does), with these intended differences:

- **Compression is the edge's.** The Worker compresses nothing and ships no precompressed copies
  (they would be public assets with no Content-Type), so under `vite preview` nothing carries a
  `Content-Encoding`; in production Cloudflare's edge compresses after the Worker. The Worker's
  ETag comparison is weak, so a page still revalidates once the edge weakens its tag.
- **Revalidating through `vite preview`** needs a `Cache-Control` on the request (a browser sends
  `max-age=0`): the preview proxy adds `Cache-Control: no-cache` to a bare conditional request,
  and a no-cache request never gets a 304, as on Next.js.
- **`/_next/static/**`** carries the asset layer's strong ETag rather than Node's weak one.
- **`x-vinext-build-id`** appears on the two Route Handler bodies, `/icon-192` and `/icon-512`,
  and on nothing else.
- **Image bytes.** The OG images and icons are prerendered by the Worker bundle, with next/og's
  WebAssembly renderer, so their PNGs are not byte-identical to the Node build's: same size and
  layout, with about 1-2% of pixels differing slightly in anti-aliasing.

**Deploying.** `pnpm deploy:cloudflare` loads `vite.config.ts` in mode `cloudflare`, builds and
prerenders, then runs `cf deploy --prebuilt --mode cloudflare`, which uploads the Worker and its
Static Assets (about 730 files, 45 MB) and promotes the new version. `--dry-run` validates the
setup without building or uploading, by existence and text checks only: `cloudflare.config.ts`
is there, `cf` and the plugin are installed, and `vite.config.ts` imports and calls
`cloudflare()` (the config is first parsed by the build); `--skip-build` uploads the existing
`.cloudflare/output/`. Always deploy through `pnpm deploy:cloudflare` (or pass
`--env cloudflare`): a bare `vinext-cloudflare deploy` builds in mode `production`, where
`vite.config.ts` leaves `cloudflare()` out, and the patched vinext refuses that build rather than
let `cf deploy` upload a stale `.cloudflare/output/` (see "The vinext patch").
A real deploy needs:

- a Cloudflare account with a workers.dev subdomain (the Worker is then served at
  `https://scvalfh.<subdomain>.workers.dev`) or a custom domain (`domains` in `defineWorker`);
- `CLOUDFLARE_API_TOKEN`, a token made from the "Edit Cloudflare Workers" template (or
  `pnpm exec cf auth login` on a workstation);
- `CLOUDFLARE_ACCOUNT_ID`, or a top-level `accountId` in `cloudflare.config.ts`;
- the Worker name, `scvalfh`, which is set in `cloudflare.config.ts` (`--name` is refused for a
  `cloudflare.config.ts` project);
- `SITE_URL` set to the Worker's public origin in the build environment, since it is baked in at
  build time.

`.github/workflows/deploy-cloudflare.yml` runs that deploy from GitHub Actions. It follows the `ci`
and `update-data` workflows (`workflow_run`, on `main`) rather than `push`, because `update-data`
pushes its snapshot commit with `GITHUB_TOKEN`, and a push made with `GITHUB_TOKEN` starts no
`push` workflow. Every run deploys `main`'s tip, and only when the code there has passed `ci` on
`main`: it walks down from the tip past `update-data`'s snapshot commits (by the bot, data files
only, tested by that job before it pushed) to the commit whose code ships, and deploys only if
that commit has a successful `ci` run on `main` and nothing but the data changed above it.
Otherwise it skips, and that commit's own `ci` run deploys once it passes; a red one never
ships, even when a data refresh is rebased on top of it. Each successful deploy is recorded as a
GitHub Deployment (environment `cloudflare`) for the commit it shipped, and a run skips a tip that
already has one: so a green `ci` run on `main` (never a pull request's) deploys the commit it
tested, plus any snapshot since, an `update-data` run deploys its new snapshot, and a run that
finds the tip undeployed deploys it whatever happened to the run queued before it (GitHub keeps
one pending run per workflow, so a displaced run loses nothing). Deploying the tip means an older
build never overwrites a newer one, and `workflow_dispatch` deploys `main`'s tip by hand under the
same `ci` check, recorded or not. It needs the `CLOUDFLARE_API_TOKEN` secret, a
`CLOUDFLARE_ACCOUNT_ID` variable (or secret) and a `SITE_URL` variable holding a bare origin
(Settings → Secrets and variables → Actions). Without the token every run is a green no-op with a
notice saying so; a token without the other two fails, naming what is missing. Its build does not
pin `SCVAL_BUILD_AT`, so the footer's stale-snapshot notice measures from the instant the deploy
really built. Cloudflare's own Git integration (Workers Builds) could run `pnpm deploy:cloudflare`
on each push instead; that path has not been tried here.

No upload was made while this target was developed, since no Cloudflare account was available:
what was verified is the dry run, the local workerd smoke and axe passes, and a full
`pnpm deploy:cloudflare` that builds and prerenders and then stops at `cf deploy`'s "No
authentication token found". CI's `cloudflare` job checks the same without credentials (see
"Local development").

### The vinext patch

`patches/vinext@1.0.0.patch` is applied by pnpm at install (`patchedDependencies` in
`pnpm-workspace.yaml`), so `node_modules/vinext` is never the stock package. It closes eleven
vinext 1.0.0 gaps that broke this site's contract with `next build`/`next start` or kept one of
the two vinext targets from building or serving it; each fix carries a comment citing the
behaviour it matches, and `pnpm-workspace.yaml` lists them (file paths below are under
`node_modules/vinext/dist/`):

- **Header source parsing** (`config/config-matchers.js`): a nested group such as
  `/:path((?!_next/static/).*)` was mis-parsed, so the Cache-Control rule matched only paths
  starting with `/.`, none of this site's routes.
- **`notFound()` in a metadata route** (`server/metadata-route-response.js`): the per-game, date
  and team OG images answered an unknown param with a 500 instead of a 404.
- **ISR lifetime** (`build/prerender.js`, `server/app-page-response.js`): the prerender read the
  `s-maxage=300` rule back as each page's revalidate time, so `vinext start` re-rendered every
  "static" page after five minutes; pages are `revalidate: false`, as on Next.
- **404 caching** (`server/app-rsc-response-finalizer.js`, `server/app-fallback-renderer.js`):
  the same rule overwrote the no-store header on 404 pages, so a CDN could cache a 404. A Route
  Handler's own 404 keeps its headers, as on Next.
- **ETags** (`server/prod-server.js`, `server/app-page-cache.js`): pages served from the cache
  had no validator, so revalidation never got a 304; they now carry Next's FNV-1a ETag. Cached
  Route Handler and metadata route bodies get none, as on Next.
- **Metadata and Route Handler prerendering** (`build/prerender.js`,
  `server/metadata-route-response.js`, `server/app-route-handler-*.js`, `server/seed-cache.js`):
  only `"use cache"` metadata routes were prerendered and no Route Handler was, so the icons,
  every OG image, the manifest, sitemap and robots rendered per request. A Route Handler with a
  numeric `revalidate` keeps it as its ISR lifetime, as on Next.
- **`dynamicParams = false` misses** (`server/app-page-dispatch.js`,
  `server/app-fallback-renderer.js`): an unknown param rendered the 404 inside the matched route,
  pointing its `og:image` at that segment's OG image for the bad param (itself a 404); it now gets
  the root not-found, as on Next.
- **One config, two targets** (`index.js`): with `cloudflare.config.ts` in the repo, vinext
  refused every build that lacked the `cloudflare()` plugin, so `pnpm build:vinext` could not run
  at all. A Vite config that imports `cloudflare` from `@cloudflare/vite-plugin` and calls it now
  chooses per build (found by the same text scan `vinext-cloudflare deploy` uses); the guard still
  stops a project whose Cloudflare config never wired the plugin in (no import, a type-only import,
  or a binding never called). A `vinext-cloudflare deploy` build that leaves the plugin out (no
  `--env cloudflare`) is refused too, since `cf deploy` would then upload a stale Workers build.
- **Build metadata in the Workers upload** (`index.js`): vinext's `.assetsignore` listed only
  `.vite`, so Workers Static Assets served `vinext-client-entry-manifest.json` (build-only
  metadata) publicly, where `vinext start` and Next answer 404. It is now listed too.
- **`.wasm` in the Cloudflare prerender** (`build/prerender-cloudflare-loader.js`): the
  prerender runs the Worker bundle in Node, which could not import next/og's `.wasm` modules the
  workerd way, so `pnpm build:cloudflare` died on the first OG image or icon. A loader hook now
  loads each one as a compiled `WebAssembly.Module`, as workerd does.
- **The Worker's cache marker and 304s** (`server/app-rsc-response-finalizer.js`,
  `server/app-router-entry.js`): only the Node server removed the internal
  `x-vinext-app-page-cache` header and answered a revalidation, so the Worker sent the header on
  every cached page and never a 304. The shared finalizer now strips it on every target, and the
  Worker entry answers a matching `If-None-Match` with 304, as `vinext start`.

`patches/@vinext__cloudflare@1.0.0.patch` makes one change, in
`node_modules/@vinext/cloudflare/dist/cache/static-assets-adapter.build.js`:
`staticAssetsAdapter()` packaged the prerendered pages and metadata routes but not Route
Handlers, so the Worker rendered `/icon-192` and `/icon-512` with satori/resvg on every request.
It now packages them as it does metadata routes, under the cache key the Worker reads.

Both patches are pinned to exact versions (`package.json` pins vinext 1.0.0 and
`@vinext/cloudflare` 1.0.0, and the `patchedDependencies` keys name them), so a version bump
means re-checking each hunk against upstream: drop the ones upstream has fixed and re-port the
rest. Drop each patch entirely once upstream ships all of its fixes. The Cloudflare tooling is
pre-release and pinned exactly too: `@cloudflare/vite-plugin` 2.0.0-beta.sha-ad79608dd and `cf`
1.0.0-beta.6 share miniflare, `@cloudflare/config` and the workerd that `cloudflare.config.ts`'s
compatibility date follows, so bump the two together and re-run the Workers build, preview and
`--dry-run` (`pnpm-workspace.yaml` has the details).

## Further reading

- `docs/DATA-SOURCES.md` — every upstream endpoint, JSON path, enum and known gotcha, condensed
  from the build-time research spec.
- `docs/BYLAWS-2026-27.md` — the verified SCVAL by-laws excerpt that governs standings, points,
  tiebreaks and CCS qualification.
- `docs/DESIGN.md` — the implementation-ready design record: routes, tokens, component
  signatures, rendering rules, empty states, accessibility requirements.
