# Development

How to run, check and change this repository. The architecture it enforces is `docs/ARCHITECTURE.md`.

## Local development

```bash
pnpm install
pnpm dev            # next dev (port 3000)
pnpm typecheck      # next typegen, then tsc --noEmit
pnpm typecheck:scope 'lib/**'   # dev-only, not a CI gate: the same tsc run, failing only on
                                # diagnostics inside the given globs (agents sharing one tree)
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

pnpm assert:prerender    # after a build: every route family prerendered, with exact counts from the snapshot
pnpm assert:budgets      # after a build: snapshot, page-weight and first-load JS budgets
pnpm assert:copy         # after a build: copy-honesty scan of the built HTML
pnpm assert:vinext       # after build:vinext (or build:cloudflare, with --cloudflare): the same route families
pnpm build-official-fixtures   # rewrite data/official/*.json (never hand-edit them; --check verifies)
pnpm gate:all            # the full gate: Next, vinext and Cloudflare builds, smoke and axe on each
```

`pnpm build` and `next dev` both read the snapshot already checked into `data/`, so you can
develop and build without ever calling a live upstream API. Every build bundles ten data files
into its server code, each imported by its read module, so no server reads `data/` at run time:

| File | Read by |
|---|---|
| `data/snapshot.json` | `lib/datasets/snapshot.ts` |
| `data/history-2025-26.json` | `lib/datasets/history.ts` |
| `data/history-brackets-2025-26.json` | `lib/datasets/history.ts` |
| `data/prior-season.json` | `lib/datasets/prior-season.ts` |
| `data/player-stats.json` | `lib/datasets/player-stats.ts` |
| `data/jv.json` | `lib/datasets/jv.ts` |
| `data/rosters.json`, `data/rosters-enrichment.json` | `lib/datasets/rosters.ts` |
| `data/clubs.json` | `lib/datasets/clubs.ts` |
| `data/commits.json` | `lib/datasets/commits.ts` |

The vinext scripts read the same `app/` and `next.config.ts`; vinext adds `vite.config.ts`,
`cloudflare.config.ts` for the Worker, two patches (see docs/VINEXT-PATCHES.md "The vinext patch")
and its own outputs, `dist/`, `.vinext/` and `.cloudflare/`, all gitignored and skipped by
`eslint.config.mjs`. `--mode cloudflare` is what switches `vite.config.ts` to the Workers target,
and the Vite mode also picks the dotenv files: the three Cloudflare scripts load `.env`,
`.env.local`, `.env.cloudflare` and `.env.cloudflare.local`, never `.env.production`.

To point at a different snapshot file (e.g. a fixture-built one), set
`SCVAL_SNAPSHOT=/path/to/snapshot.json`; `SCVAL_HISTORY` does the same for
`data/history-2025-26.json`, `SCVAL_PLAYER_STATS` for `data/player-stats.json`, `SCVAL_JV` for
`data/jv.json`, and `SCVAL_ROSTERS` and `SCVAL_ROSTERS_ENRICHMENT` for `data/rosters.json` and
`data/rosters-enrichment.json`. All six are read with `node:fs` when the module loads, so they work
under Next, vitest, tsx and vinext's Node target, never on a Worker, which has no filesystem to read
them from: leave them unset for the Cloudflare scripts. The other three files have no override.

`pnpm typecheck` runs `next typegen` first because the global `PageProps`/`LayoutProps` types used
by the dynamic pages, their OG images and `app/layout.tsx` are generated into
`.next/types/routes.d.ts`, which a clean checkout does not have and which vinext's Vite plugin
overwrites with its own declarations; Next stays the type authority.

Imports use the `@/` alias that `tsconfig.json` declares for any import that leaves the file's
directory (`import { LEAGUES } from '@/lib/config/leagues'`), and `./` for same-directory and child
modules; a `../` specifier is never written (ESLint's `no-restricted-imports` rejects it). Every
tool resolves the alias from `tsconfig.json`: Next and vinext natively, Vitest through
`resolve.tsconfigPaths` (`vitest.config.ts`), and tsx from the tsconfig in its cwd, so a script run
from anywhere but the repo root needs `--tsconfig <repo>/tsconfig.json` (the tests' `runScript`
passes it).

`.github/workflows/ci.yml` runs on every push to `main` and every PR: typecheck, lint, test, build,
and an assertion that every route family actually prerendered (no route should ever fall back to
dynamic rendering — `generateStaticParams` covers every `/game/[id]`, `/scores/[date]` and
`/teams/[slug]`, the per-league `/standings/[league]`, `/schedule/[league]` and
`/playoffs/[league]` pages, and `/clubs/[slug]`, with exact counts read from the snapshot, the
league config and `data/clubs.json`), then
checks the page-weight and first-load JS budgets and a copy-honesty scan of the built HTML. A second
job, beside it, makes the same pinned build, starts `next start` on it, holds it to the response
contract with `scripts/ci/smoke-server.sh` (see docs/DEPLOYMENT.md "vinext") and runs `axe-core`
against it (`scripts/ci/a11y-axe.mjs`, one page per core at a time) across every route family, both
themes, both a phone and a desktop viewport, failing on any serious/critical accessibility
violation. Two more jobs, one per vinext target, run beside them (not after `gates`, so a vinext
regression shows even when Next is red).
`vinext` builds with `pnpm build:vinext`; `cloudflare` first validates the deploy setup with
`vinext-cloudflare deploy --env cloudflare --dry-run`, which needs no credentials, then builds with
`pnpm build:cloudflare` and a non-localhost `SITE_URL`. Each asserts with
`scripts/ci/assert-vinext-prerender.ts` that every route rendered with `revalidate: false`, that the
static pages, metadata routes and Route Handlers are on disk, that the page families and their OG
images are exactly the ones the Next build's assertion expects (standings, schedule, playoffs, game,
date and team, with OG/page parity by name, plus the clubs pages, which have no OG card) and that
the prerendered sitemap lists exactly the prerendered pages; for the Worker it also checks that
every one of them is packaged into the static-assets cache and every file its index lists is there,
that `_headers` is there, and that nothing else ships: no precompressed copy, and nothing at the
top level of the upload but `_headers`, `_next/` and `_vinext/` unless `.assetsignore` keeps it
out. Then each starts its server (`vinext start`, or the Worker in workerd through `vite preview`)
and runs the same `scripts/ci/smoke-server.sh` and axe passes against it. Uploading the Worker is
`.github/workflows/deploy-cloudflare.yml`'s job (see docs/DEPLOYMENT.md "Cloudflare Workers").

## Tests

`pnpm test` runs the full Vitest suite: snapshot-schema validation, standings/tiebreak arithmetic
against synthetic and fixture data (including a golden proof that SCVAL's tables are byte-identical
to the single-league site's), the si.com backfill rules, the official-schedule matcher, PDF-grid
parsing, the "never render a missing score as 0-0" rule across every `GameRow` variant and every
non-final game page, and playoff-projection edge cases (shared 3rd, the Oct 30 play-in/crossover,
unnamed rounds). Beside those, `tests/integration/` runs the fetch pipeline over the recorded
corpora (end to end and every variant), `tests/views/`, `tests/components/` and `tests/app/` cover
the view models, the rendered components and the pages, the data-file validators in `tests/data/`
check `data/rosters.json`, `data/player-stats.json`, `data/jv.json` (with the JV merge rules and an
offline `fetch-jv` run over `tests/fixtures/jv`), `data/clubs.json` and `data/commits.json`, and
further suites pin the copy rules (`tests/scripts/ci/copy/`), the workflow files and the
architecture rules (`tests/arch/`), the update-data issue builder, and the scoped typecheck's globs.
Fixtures captured from real (offline) MaxPreps/SCVAL responses live under `tests/fixtures/`.

The tree mirrors the source: the test of a module `X` lives at `tests/<directory of X>/<basename of
X>.test.ts` (`lib/engine/standings.ts` is tested by `tests/lib/engine/standings.test.ts`,
`components/layout/NavLink.tsx` by `tests/components/layout/NavLink.test.ts`). Suites that cut across
modules are grouped by what they prove: `tests/data/` (the committed data files), `tests/integration/`
(the pipeline end to end), `tests/regression/` (the SCVAL goldens), `tests/app/` (whole pages),
`tests/scripts/` (the CLIs); `tests/support/` holds the helpers and is not a test directory. The
three Vitest projects are `arch` (`tests/arch/`), `spawn` (the files that run a repo script under
tsx, listed in `vitest.config.ts`) and `unit` (the rest); `pnpm test:arch` and `pnpm test:unit` run
the first and the last.

Tests that render against a corpus do not build it themselves. Vitest's `globalSetup`
(`tests/support/global-setup.ts`) runs the real `scripts/fetch-data.ts --fixtures …` once per
`vitest run` for every corpus listed in its `SNAPSHOT_CORPORA` table (the SCVAL, all-leagues,
all-leagues `--no-sblive`, EAL and SoCal corpora), concurrently, into a temporary directory that the
run removes at the end. Nothing is cached between runs, so a snapshot can never be stale against the
code under test; a test that needs another corpus or flag adds a row to the table. A test file that
loads the read API over a corpus calls `useCorpusModules(corpus, { data: loadQueries, … })`
(`loadQueries` from `tests/support/queries.ts`) from `tests/support/corpus-modules.ts`, which points
`lib/datasets/snapshot.ts` at the snapshot, resets the module registry and imports the modules fresh
for that file (`useSnapshotModules` does the same for a snapshot file the test writes itself, and
the `with…` forms load a second graph inside a test). A plain `pnpm test` runs all three Vitest
projects, and the setup runs once however many projects are selected.

## Conventions

The rules below are enforced where a test or a lint rule can enforce them; each names its enforcer.
`docs/ARCHITECTURE.md` has the layers they serve.

### Imports

- `@/<path>` for any import that leaves the file's directory, `./<path>` for the same directory and its
  children, never `../` (ESLint `no-restricted-imports`). Next and vinext resolve the alias natively,
  Vitest through `resolve.tsconfigPaths` (`vitest.config.ts`), and tsx from the `tsconfig.json` of its
  working directory, so a script run from anywhere but the repo root needs
  `tsx --tsconfig <repo>/tsconfig.json …` (`runScript` in `tests/support/cli.ts` always passes it).
- A type-only import is written as one (`import type { … }`, or `import { type X }` beside values;
  ESLint `consistent-type-imports`): the client boundary (`tests/arch/client-boundary.test.ts`) ignores
  type imports because they vanish at compile time, so a value import of a server module from a
  `'use client'` graph is the thing it catches.
- No barrels (`index.ts`) and no re-export shims at an old path. The three package doors
  (`lib/config/leagues.ts`, `lib/registry/teams.ts`, `lib/engine/standings.ts`) are the only modules
  that re-export (`tests/arch/layers.test.ts`), each for a reason written in its header (an
  import-time assert, object identity that tests rely on, a `vi.mock` seam, parts kept private).
- Which directory may import which is `tests/arch/layers.test.ts` (ESLint's `import/no-restricted-paths`
  zones repeat the top-level directions as editor feedback).

### Naming

The directory is the layer and the basename is the concept (`tests/arch/naming.test.ts`):

- `components/**/*.tsx` are PascalCase and export only components, UPPER_SNAKE constants or tables, and
  types; a helper or a hook goes in a kebab-case module beside it. The kebab exceptions are the
  ImageResponse kit under `components/og/` and the two part bundles the test lists; thirteen older
  lowercase helpers are its shrink-only `KNOWN_EXCEPTIONS` ledger (six of them sit in the two client
  modules on `/teams`, NavLink and TeamFinder, whose first-load budget has almost no headroom, so
  moving them is a measured change).
- `components/**/*.ts` live under `components/hooks/` and `components/head/`, plus the few non-JSX
  modules the test lists with their reasons.
- `lib/` and `views/` are kebab-case `.ts` only. A view entry is `views/<area>/<area>-view.ts` (the
  area may be the singular of the directory: `views/teams/team-view.ts`), a route-parameter module
  `<name>-route.ts`, a client-safe slice `<name>-client.ts`; those suffixes belong to `views/`. No
  `lib/` basename ends in `-schema`, `-view` or `-build`: the directory says it.
- Error messages that name their module start with its path (`lib/config/leagues.ts: …`), so a moved
  module changes that prefix and nothing after it.

### Test files

- A module's test mirrors its path: `lib/engine/standings.ts` → `tests/lib/engine/standings.test.ts`
  (see "Tests" above for the cross-cutting directories and the three Vitest projects).
- Helpers live in `tests/support/`, one module per concern; a test never imports another test file.
- A new file under `tests/` must be `git add`ed before `tests/arch/citations.test.ts` sees it (the scan
  reads `git ls-files`). A probe path a test invents on purpose is either built from parts (as the
  planted violations in `tests/arch/naming.test.ts` are) or listed in that test's `ALLOWED_SYNTHETIC`
  with its reason.
- Never edit `tests/fixtures/**` or `tests/golden/**` by hand: fixtures are captured responses and
  research, goldens pin the pipeline's output byte for byte (`tests/regression/`).

### Comments and citations

Comments carry the reasons: a design section (DESIGN §n, DATA-SOURCES §n, LEAGUE-RULES, BYLAWS), an
owner decision with its date, or a measurement. When code moves, its comments move with it and the
paths they quote are rewritten; prose that is still true is not reworded. Every quoted repo path and
every `docs/<FILE>.md "<Heading>"` citation must resolve (`tests/arch/citations.test.ts`).
`docs/CITATIONS.md` has the frozen-path table: the paths that committed data and fixtures quote
forever, with where each now lives; its legend explains the shorthands for documents not kept here
(`SPEC §n`, `BUILD-BRIEF`, `DESIGN-socal §n`, `design-review UI §n`, the build stages).

### Moving a module

1. `git mv` the file (history follows it), then rewrite every import of it: static and dynamic
   imports, `export … from`, `typeof import()`, `vi.mock`/`vi.doMock` targets.
2. Rewrite every text citation of the old path: comments, docs, workflows, `package.json`,
   `vitest.config.ts`. Leave `data/**`, `tests/fixtures/**`, `tests/golden/**`, `patches/**`,
   `pnpm-lock.yaml` and the strings scripts write into committed data (the NOTES arrays and every
   `builtBy: 'scripts/…'` literal) as they are; if the frozen files quote the old path, add a row to
   the frozen-path table in `docs/CITATIONS.md` in the same commit.
3. If the module's errors carry its path as a prefix, update the string and every test regex that
   matches it in the same commit.
4. Run `pnpm test:arch` (citations, layers, client boundary, naming, deleted names) before `pnpm check`.
   A move in `lib/` that renames a module the deleted-names ledger keys moves its key too.

### Commits

One change per commit, subject `<scope>: <lowercase sentence>` where the scope is the area touched
(`lib`, `views`, `components`, `app`, `pipeline`, `scripts`, `tests`, `ci`, `docs`, `tooling`, `data`),
for example `docs: move the reference sections of the README into docs/`. The body says why, and
names every observable change.

## Scripts

Data CLIs sit at the root of `scripts/`, because the files they write record their path
(`builtBy`); the gates are in `scripts/ci/`, dev aids in `scripts/dev/`, and the modules the CLIs share
in `scripts/lib/`.

| Script | What it does | Run as | Called by |
|---|---|---|---|
| `scripts/fetch-data.ts` | The cron entry point: builds `data/snapshot.json` and its meta file (docs/DATA-PIPELINE.md "How data flows") | `pnpm fetch-data` | `update-data.yml`; the tests' `globalSetup` and spawn suites |
| `scripts/fetch-player-stats.ts` | MaxPreps season player stats into `data/player-stats.json` | `pnpm fetch-player-stats` | `update-data.yml` |
| `scripts/fetch-jv.ts` | MaxPreps and si.com JV games into `data/jv.json` | `pnpm fetch-jv` | `update-data.yml` |
| `scripts/data-issues.ts` | The cron's bookkeeping issues (revised schedules, frozen leagues) | `pnpm exec tsx scripts/data-issues.ts` | `update-data.yml` |
| `scripts/fetch-rosters.ts` | MaxPreps rosters into `data/rosters.json` | `pnpm fetch-rosters` | by hand, a few times a season |
| `scripts/fetch-prior-season.ts` | Last season's finals into `data/prior-season.json` (the Elo seed) | `pnpm fetch-prior-season` | by hand, once a season |
| `scripts/discover-season.ts` | Prints the new season's ids and a diff against the config; writes nothing | `pnpm discover-season` | by hand, at the rollover |
| `scripts/build-history.ts` | `data/history-<season>.json` from the leagues' end-of-season documents | `pnpm build-history` | by hand, once a season |
| `scripts/build-official-fixtures.ts` | `data/official/*.json` from the transcriptions (`--check` verifies) | `pnpm build-official-fixtures` | by hand, after a re-transcription |
| `scripts/fetch-mascots.ts` | The mascot tiles in `public/mascots/` | `pnpm fetch-mascots` | by hand, when a team joins or a logo changes |
| `scripts/ci/assert-prerender.ts` | Every route of `next build` prerendered, with exact counts | `pnpm assert:prerender` | `ci.yml`, `pnpm gate`, `pnpm gate:all` |
| `scripts/ci/assert-budgets.ts` | Page-weight, first-load JS and Worker budgets | `pnpm assert:budgets` (`--worker-only`) | `ci.yml`, `pnpm gate`, `pnpm gate:all` |
| `scripts/ci/assert-copy.ts` | The copy rules (`scripts/ci/copy/`) over the built HTML | `pnpm assert:copy` | `ci.yml`, `pnpm gate`, `pnpm gate:all` |
| `scripts/ci/assert-vinext-prerender.ts` | The same route families in a vinext build (`--cloudflare` for the Worker) | `pnpm assert:vinext` | `ci.yml`, `pnpm gate:all` |
| `scripts/ci/smoke-server.sh` | The response contract over HTTP against a running server | `bash scripts/ci/smoke-server.sh <url> <next\|node\|workers>` | `ci.yml`, `pnpm gate:all` |
| `scripts/ci/a11y-axe.mjs` | axe-core over every route family, both themes and widths | `node scripts/ci/a11y-axe.mjs` | `ci.yml`, `pnpm gate:all` |
| `scripts/ci/run-all.sh` | The whole CI job list on one machine, against all three deploys | `pnpm gate:all` | by hand |
| `scripts/dev/typecheck-scope.mjs` | `tsc` failing only on diagnostics inside the given globs | `pnpm typecheck:scope '<glob>'` | by hand (agents sharing a tree) |

`scripts/ci/prerender-expectations.ts` (what both prerender gates expect), `scripts/ci/copy/` (the copy
rules and the site's public terms), `scripts/lib/cli.ts` (how every CLI exits) and
`scripts/lib/fetch-job.ts` (the scoped-fetch kernel of the three team-by-team fetchers) are modules,
not commands.
