# Architecture

How this repository is put together, and which test holds each part of it in place. The rules here
are not advice: every one names the check that fails when it is broken. `docs/DEVELOPMENT.md` has the
day-to-day conventions, `docs/DATA-PIPELINE.md` the cron, and `docs/DESIGN.md` the design record the
code comments cite as DESIGN §n.

## The system in one picture

```
  WRITE SIDE (the cron, and a few CLIs run by hand)        READ SIDE (every build)

  MaxPreps, si.com, league PDFs     scripts/fetch-*.ts         data/*.json  (committed)
  and sheets, CIF pages, .ics  ──►  lib/pipeline         ──►        │
                                    lib/sources                     ▼
                                    lib/official           lib/datasets  (+ lib/schema, lib/snapshot)
                                                                    │
                                                           lib/queries   (+ lib/engine)
                                                                    │
                                                           views  ──►  components  ──►  app
                                                                    │
                                                  next build  |  vite build (Node)  |  vite build (Worker)
                                                                    ▼
                                                           prerendered pages, no request-time data

  Both sides share the pure core: lib/model, lib/shared, lib/format, lib/config, lib/registry,
  lib/schema, lib/engine, lib/snapshot.
```

The site is a function of the committed files. A scheduled job (`.github/workflows/update-data.yml`)
reads the public sources, writes `data/snapshot.json` and its sibling files, and commits them; the
commit triggers a rebuild, and the build prerenders every page from those files. Nothing renders
per request but a 404, nothing reads a database, and no page reads the clock: "today" is the day of
the snapshot's `fetchedAt` (`getToday()` in `lib/datasets/snapshot.ts`), so a commit builds the same
bytes whenever it is built.

## Layers and the dependency rule

The directory is the layer. `tests/arch/layers.test.ts` is the one place that says which directory
may import which; it reads every import of every source file, type-only imports included (a type edge
couples two modules as surely as a value edge).

| Rank | Directory | Holds |
|---|---|---|
| 0 | `lib/model/` | Types (and the two `as const` tuples their unions derive from): ids, teams, games, standings, postseason, the snapshot, the league-config shapes |
| 1 | `lib/shared/`, `lib/format/` | Client-safe pure helpers (dates, game ids, routes, search, patterns) and copy (words, numbers, scores, the standings and postseason sentences) |
| 2 | `lib/config/` | The season, base URLs and the league configuration (the `lib/config/leagues.ts` door) |
| 3 | `lib/registry/` | The team registry (the `lib/registry/teams.ts` door) |
| 4 | `lib/schema/` | The zod schemas of every data file |
| 5 | `lib/engine/` | Pure computation: standings (the `lib/engine/standings.ts` door), classification, postseason, ratings, phase, form |
| 6 | `lib/snapshot/` | Checking, migrating and loading a snapshot |
| 7 | `lib/datasets/` | The only importers of `data/**`: one module per file |
| 8 | `lib/queries/` | The snapshot-bound read API |
| 9 | `views/` | View models: plain serializable data for one page or card |
| 10 | `components/` | Rendering |
| 11 | `app/` | Route files |

Beside the ranks sits the ingestion side, `lib/sources/` (HTTP clients and parsers), `lib/official/`
(the official schedules), `lib/pipeline/` (the cron's steps) and `lib/cli/` (flag parsing). It builds
the snapshot, so it may use the ranks up to `lib/snapshot/` but never the read side, and nothing ranked
imports it.

The rules, as `tests/arch/layers.test.ts` prints them in a failure line:

- (a) a ranked module imports only its own rank or below, plus the LEAVES of `lib/config/`
  (`season`, `source-urls`, `invariant`, `mascots`: they import nothing but each other);
  `lib/model/` imports only itself;
- (b) a ranked module never imports the ingestion side, `scripts/` or `tests/`;
- (c) the ingestion side imports ranks up to `lib/snapshot/`, itself and the LEAVES;
- (d) `lib/sources/` never imports `lib/pipeline/` or `lib/official/`;
- (e) only `lib/datasets/` imports `data/**` (tests exempt);
- (f) a part inside a package door's directory is imported only through its door or from inside the
  directory (see "Package doors");
- (g) no import cycle inside `lib/`, `views/` or `components/`;
- (h) a `views/**/*-client.ts` slice imports only ranks 0-1, the LEAVES and other client slices;
- (i) `scripts/` and `app/` never import `tests/`;
- (j) `components/` never import `lib/queries/` or `lib/datasets/`: the snapshot is read in exactly two
  layers, `views/` and `app/`, and a component never reads it (`views/site/chrome-view.ts` hands the
  site chrome its data); static config and registry lookups and view helpers are allowed.

The other structural checks, each a test under `tests/arch/` unless named otherwise:

| Rule | Enforcer |
|---|---|
| The ranks and rules above | `tests/arch/layers.test.ts` |
| A `'use client'` graph reaches only client-safe modules | `tests/arch/client-boundary.test.ts` |
| Pages spell no league or division id and build no routed URL by hand | `tests/arch/page-code-literals.test.ts` |
| A name deleted from a module stays deleted, in its successors too | `tests/arch/deleted-names.test.ts` |
| Every quoted repo path and docs heading resolves; the frozen-path table is complete | `tests/arch/citations.test.ts` |
| File names say what a file holds | `tests/arch/naming.test.ts` |
| Every top-level source directory is scanned by the rules above | `tests/arch/source-roots.test.ts` |
| Per-row links do not prefetch; class strings keep Tailwind candidates whole | `tests/arch/prefetch-policy.test.ts`, `tests/arch/class-join.test.ts` |
| Count copy handles n === 1; no className cancels the phone bleed | `tests/arch/plural-counts.test.ts`, `tests/arch/sx-bleed.test.ts` |
| The cron and the deploy workflow agree on what a data commit is | `tests/arch/workflows.test.ts` |
| The Vitest `spawn` project lists exactly the tests that run a repo script | `tests/arch/spawn-project.test.ts` |
| The top-level directions and the rule (g) cycles, in the editor | ESLint `import/no-restricted-paths`, `import/no-cycle` (`eslint.config.mjs`) |
| No server module leaks into a page's browser bundle | `scripts/ci/assert-budgets.ts` (first-load JS per route) |

## Package doors

Three packages have a door file: two sit beside their directory of parts (`lib/config/leagues.ts`,
`lib/engine/standings.ts`), and the registry's is the named file inside `lib/registry/`, beside its
seed and part files. A door assembles the parts and re-exports the public values with explicit named
exports. The config and registry doors also run the package's invariants at the end of their module,
so an inconsistent config or registry fails at import time with a message that starts with the door's
path; the engine door re-exports so that its parts stay private. Rule (f) keeps everyone else on the
door.

| Door | Parts | Also public on their own |
|---|---|---|
| `lib/config/leagues.ts` | `lib/config/leagues/`: one file per league, the regions and sections, the cited documents, the CCS block, data quality, the assert | `labels.ts`, `tiebreak-stages.ts`, `official.ts` |
| `lib/registry/teams.ts` | `lib/registry/`: one seed file per league, the team list, acronyms, ink, the assert | `resolve.ts`, `jv-teams.ts` |
| `lib/engine/standings.ts` | `lib/engine/standings/`: record, tiebreak, seed-one, ladder, pairings, missing, uneven, the MaxPreps cross-check | none |

The doors are the only re-exporting modules in the repository (`tests/arch/layers.test.ts` fails on an
`export … from` anywhere else): there are no barrels (`index.ts`) and no shims at old paths. `LEAGUES` holds the very objects of its parts, so a test that mutates one sees
it in every lookup.

## The client tier

The browser gets only what a `'use client'` module reaches. Those modules live under `components/`
(plus `app/error.tsx`), and through their runtime imports they may reach `components/`, `app/`, the
`views/**/*-client.ts` slices, and the client-safe tier: `lib/model/`, `lib/shared/`, `lib/format/` and
the LEAVES of `lib/config/`. Anything else (the snapshot, the registry, the league config, the
engines, zod, a Node built-in) fails `tests/arch/client-boundary.test.ts` with the import chain that
reached it. The boundary is an allowlist: a new server module is banned the day it exists.

Bytes matter as much as the boundary: every route's first-load JavaScript has a budget
(`scripts/ci/assert-budgets.ts`, against `tests/golden/page-weights-main.json`), and `/teams`, which
ships the team finder on top of the site chrome's client modules, has almost none left. A change
under `components/` or to a client slice is measured with `pnpm build && pnpm assert:budgets`.

## The directory map

| Path | What lives there |
|---|---|
| `app/` | Route files only, in the App Router's layout (Next and vinext read the same tree). Each composes a view and components and declares its metadata through `pageMetadata()` (`views/site/page-metadata.ts`) |
| `components/<feature>/` | PascalCase React components per page area; `components/ui/` holds shared primitives |
| `components/standings/table/`, `components/game-row/` | The standings table and the game row, split into their variants and parts |
| `components/og/` | The OG card kit: primitives and one card per route, rendered by the `opengraph-image.tsx` routes |
| `components/hooks/`, `components/head/` | Client hooks and local storage; the inline `<head>` sources, scripts and CSS (client-safe, no server imports) |
| `views/<area>/` | `<area>-view.ts` (the page's view builder), `<area>-route.ts` (its params), topic modules, `*-client.ts` slices |
| `views/shared/`, `views/site/` | View helpers shared across areas; the site's chrome, metadata, OG theme, structured data and route contract |
| `lib/` | The ranks above, and the ingestion side |
| `scripts/` | Data CLIs at the root (committed data records their path as `builtBy`); `ci/` gates, `dev/` aids, `lib/` shared CLI modules |
| `tests/` | Mirrors the source tree; `support/` helpers, `arch/` the rules above, `fixtures/` and `golden/` frozen |
| `data/` | The committed data files (never edited by hand) |
| `docs/` | This file and the rest of the documentation (`docs/README.md`) |
| `patches/` | The pnpm patches to vinext (`docs/VINEXT-PATCHES.md`) |

## The view contract

`views/site/route-contract.ts` states it once:

- A view module `views/<area>/<area>-view.ts` (the area may be singular: `views/teams/team-view.ts`)
  exports one or more `build…View(params)` builders, each returning a plain, serializable view (no
  JSX, no class instances) or `null` when the params name nothing. A route answers `notFound()` on one
  null test, of the route param or of what was built from it.
- A dynamic family's route module `views/<area>/<area>-route.ts` exports `<area>StaticParams()` (every
  param the family prerenders) and `<area>Param(raw)` (the value a raw segment names, or `null`). The
  page's and its OG card's `generateStaticParams` both return the first, and `app/sitemap.ts` lists the
  family from it, so a page, its image and the sitemap cannot disagree (`tests/app/static-params.test.ts`).
  Every guard calls the second before any accessor that can throw for an unknown id.
- A `*-client.ts` slice holds the types and client-safe helpers a client component shares with its view
  model (rule (h)).

## The data lifecycle

Every data file has one producer, one schema and one dataset module; the read API sits on top where
the pages need more than the file itself.

| File | Written by | When | Schema | Dataset | Read through |
|---|---|---|---|---|---|
| `data/snapshot.json`, `data/snapshot.meta.json` | `scripts/fetch-data.ts` | the cron, twice a day in season | `lib/schema/snapshot.ts` (`lib/snapshot/` checks, migrates, loads) | `lib/datasets/snapshot.ts` | `lib/queries/` |
| `data/player-stats.json` | `scripts/fetch-player-stats.ts` | the cron | `lib/schema/player-stats.ts` | `lib/datasets/player-stats.ts` | `lib/queries/player-stats.ts` |
| `data/jv.json` | `scripts/fetch-jv.ts` | the cron | `lib/schema/jv.ts` | `lib/datasets/jv.ts` | `lib/queries/jv.ts` |
| `data/rosters.json` | `scripts/fetch-rosters.ts` | by hand, a few times a season | `lib/schema/rosters.ts` | `lib/datasets/rosters.ts` | the dataset |
| `data/rosters-enrichment.json` | research, by hand | after a sweep | `lib/schema/rosters.ts` | `lib/datasets/rosters.ts` | the dataset |
| `data/clubs.json`, `data/commits.json` | research, by hand | after a sweep | `lib/schema/clubs.ts`, `lib/schema/commits.ts` | `lib/datasets/clubs.ts`, `lib/datasets/commits.ts` (joined to the rosters by `lib/datasets/roster-join.ts`) | the datasets |
| `data/history-2025-26.json` | `scripts/build-history.ts` | once, after a season | `lib/schema/history.ts` | `lib/datasets/history.ts` | the dataset |
| `data/history-brackets-2025-26.json` | transcribed by hand | once, after a season | `lib/schema/history-brackets.ts` | `lib/datasets/history.ts` | the dataset |
| `data/prior-season.json` | `scripts/fetch-prior-season.ts` | once a season | `lib/schema/prior-season.ts` | `lib/datasets/prior-season.ts` | `lib/queries/ratings.ts` |
| `data/official/*.json` | `scripts/build-official-fixtures.ts`, from transcriptions in `tests/fixtures/official/source/` | when a league revises its schedule | `lib/official/bundle.ts` (and the round-robin proof in `lib/official/validate.ts`) | none: the pipeline reads them (`lib/official/bundle-file.ts`) | the snapshot |

Each dataset module imports its file statically, so every build target bundles it (a Worker has no
filesystem), and validates it once at module load, so a bad file fails the build rather than a render.
`lib/datasets/read.ts` is the one reader; an `SCVAL_*` environment variable swaps in another file
where the module allows it (docs/DEVELOPMENT.md "Local development"). `docs/DATASETS.md` describes
each file.

## The rendering model

- Every route is static. A dynamic route declares `export const dynamicParams = false` and an in-file
  `export function generateStaticParams()` returning its route module's params; both stay literal in the
  route file, because Next detects segment config only from literal declarations. An unknown param is a
  404, and nothing reads `searchParams`.
- Metadata goes through `pageMetadata()`; every prerendered family but the clubs pages has an
  `opengraph-image.tsx` built from the `components/og/` kit (the clubs pages take the root card). The
  image routes hash their own source into each page's `og:image` URL, so a byte change in one of those
  files changes every page that points at it.
- One `app/` builds three ways: `next build` (served by `next start`), and vinext's `vite build` for Node
  (`vinext start`) and for Cloudflare Workers (`--mode cloudflare`). All three prerender the same routes
  and answer the same response contract (`scripts/ci/smoke-server.sh`); `docs/DEPLOYMENT.md` has the
  details and `docs/VINEXT-PATCHES.md` what vinext needed.

## The gates

| Command | What it proves |
|---|---|
| `pnpm check` | `pnpm typecheck && pnpm lint && pnpm test`: types (after `next typegen`), lint, and the whole Vitest suite, the architecture rules (`pnpm test:arch`) among it |
| `pnpm gate` | `pnpm build`, then every route prerendered with exact counts (`assert:prerender`), the page-weight and first-load budgets (`assert:budgets`) and the copy rules over the built HTML (`assert:copy`) |
| `pnpm gate:all` | The whole CI job list on one machine: the Next, vinext and Worker builds, each asserted, smoke-tested and run through axe (12-15 min; run it in the background) |

Inside the suite, a few tests pin behaviour rather than code:

- the golden tests (`tests/regression/`) hold the pipeline's output and SCVAL's tables to committed
  files in `tests/golden/` byte for byte;
- `tests/arch/home-weight.test.ts` budgets the team views the home page serializes;
- the copy rules (`scripts/ci/copy/`, tested in `tests/scripts/ci/copy/`) and `tests/app/copy-honesty.test.ts`
  hold what the pages say about sources, counts and certainty.

## How to add things

**A league.** Add its config as one file in `lib/config/leagues/` (ids, MaxPreps ids, the rules and
tiebreak chain with their citations, the postseason, official sources, data quality) and list it in
`LEAGUES` in `lib/config/leagues.ts`, in config order; its region and section in
`lib/config/leagues/regions.ts`. Add its teams as a seed file in `lib/registry/`, assembled by the team
list. Add its ids to `ID_LITERALS` in `tests/arch/page-code-literals.test.ts`, capture a corpus
(`pnpm fetch-data --capture tests/fixtures/corpus/<name> --leagues <id>`) for its pipeline and view
tests, and write its rules into `docs/LEAGUE-RULES.md` and its row into `docs/LEAGUES.md`. The route
families, the sitemap and the prerender gates read the config, so they follow by themselves.

**A route.** Add the route file under `app/` with its metadata through `pageMetadata()`, a view in
`views/<area>/<area>-view.ts`, and components under `components/<area>/`. A dynamic family also gets
`views/<area>/<area>-route.ts`, an OG card and a line in `app/sitemap.ts`. Then teach the gates: the
fixed pages or families in `scripts/ci/prerender-expectations.ts`, the metadata expectations in
`tests/app/page-metadata.test.ts`, the sample URLs in `scripts/ci/smoke-server.sh` and
`scripts/ci/a11y-axe.mjs`, and `docs/ROUTES.md`.

**A dataset.** Add the file under `data/`, its schema in `lib/schema/`, and one module in
`lib/datasets/` that imports it statically and reads it through `lib/datasets/read.ts`; add a query
module in `lib/queries/` only if views need more than the file. Write it with a CLI at the root of
`scripts/` (or record that it is hand-curated), validate the committed file in `tests/data/`, list it in
docs/DEVELOPMENT.md "Local development" and describe it in `docs/DATASETS.md`.

## Frozen text

Some text cannot change when the code around it does:

- committed data records the script that wrote it (`builtBy`) and the notes that script wrote, so
  those literals and the data CLIs' paths stay as they are;
- `data/**`, `tests/fixtures/**` and `tests/golden/**` quote module paths from the day they were
  written; when such a module moves, `docs/CITATIONS.md` gains a row naming its new home, and
  `tests/arch/citations.test.ts` fails until it does;
- the research drafts under `tests/fixtures/` (docs/DATASETS.md "Research artifacts under
  tests/fixtures") are provenance, not code.
