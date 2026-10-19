# Working in scvalfh

A statically prerendered site of California high-school girls varsity field hockey (scores,
standings, schedules, playoffs, teams, leaders), built from one committed JSON snapshot that a cron
refreshes. Next.js App Router, also built by vinext for Node and Cloudflare Workers. `README.md` is
the front door; `docs/README.md` indexes the rest.

## Repo map

`app/` route files · `components/` rendering (`og/`, `hooks/`, `head/`) · `views/` view models ·
`lib/` in ranked layers (`model` < `shared`, `format` < `config` < `registry` < `schema` < `engine` <
`snapshot` < `datasets` < `queries`) plus the cron's side (`sources`, `official`, `pipeline`, `cli`) ·
`scripts/` data CLIs at the root, `ci/`, `dev/`, `lib/` · `tests/` mirrors the source, with `support/`
and `arch/` · `data/` committed data · `docs/`. The layers, the dependency rule and what enforces
each are `docs/ARCHITECTURE.md`.

## Commands and gates

| Command | Proves | Rough time |
|---|---|---|
| `pnpm typecheck` | `next typegen`, then `tsc --noEmit` | 30 s |
| `pnpm lint` | ESLint, including the `../` import ban and the layer zones | 40 s |
| `pnpm test` | The whole Vitest suite (`pnpm test:arch` runs only `tests/arch/`, in 20 s) | 2 min |
| `pnpm check` | All three of the above: run before every commit | 2.5 min |
| `pnpm gate` | `next build`, exact prerender counts, page-weight and first-load JS budgets, copy rules | 4 min |
| `pnpm gate:all` | The CI job list: Next, vinext and Worker builds, smoke and axe on each | 12-15 min (run it in the background) |

`pnpm typecheck:scope '<glob>'` runs tsc and fails only on diagnostics inside the globs, for agents
sharing one tree. After any change under `components/` or to a `views/**/*-client.ts` slice, run
`pnpm build && pnpm assert:budgets`: `/teams` has almost no first-load JS headroom.

## Conventions

The full list, with each enforcer, is docs/DEVELOPMENT.md "Conventions".

- Imports: `@/<path>` when leaving the directory, `./<path>` inside it, never `../`; type-only imports
  are written as such.
- Naming: PascalCase `.tsx` components export only components, UPPER_SNAKE constants and types;
  `lib/` and `views/` are kebab-case `.ts`; a view entry is `views/<area>/<area>-view.ts`, route params
  `-route.ts`, client-safe slices `-client.ts`. No `index.ts`, no re-export shims.
- Tests mirror the source path (`tests/<dir>/<basename>.test.ts`); helpers go in `tests/support/`.
  `git add` a new file before `tests/arch/citations.test.ts` can see it.
- Comments cite their reasons (DESIGN §n, DATA-SOURCES §n, LEAGUE-RULES, BYLAWS, owner decisions with
  dates). Move them with their code, rewrite the paths they quote, and do not reword prose that is
  still true. Every quoted path and `docs/<FILE>.md "<Heading>"` citation must resolve.
- Move a module with `git mv` and rewrite every import and every text citation of it in the same
  commit (docs/DEVELOPMENT.md "Moving a module").

## Hard invariants

- Behaviour is pinned: the golden tests (`tests/regression/`, `tests/golden/`) hold the pipeline's
  output byte for byte, the prerender gate holds exact route counts, and the budgets hold page weights.
  A refactor changes none of them.
- Never hand-edit `data/*.json`, `data/official/`, `tests/fixtures/**`, `tests/golden/**`,
  `patches/` or `public/`; each has a producer (docs/ARCHITECTURE.md "The data lifecycle").
- The `app/` layout is fixed: Next and vinext read the same route files. Refactor inside a route file,
  never the routes. `generateStaticParams` stays an in-file function and `dynamicParams` a literal
  `export const`. Read the relevant guide in `node_modules/next/dist/docs/` before touching anything
  App-Router-specific.
- A byte change in any `opengraph-image.tsx`, `app/icon.tsx` or `app/apple-icon.tsx` changes the
  `og:image`/icon URL hash on every page that points at it.
- A `'use client'` graph reaches only `components/`, `app/`, `views/**/*-client.ts`, `lib/model/`,
  `lib/shared/`, `lib/format/` and the leaves of `lib/config/` (they import only each other;
  `tests/arch/client-boundary.test.ts`).
- League and division ids are never string literals in `app/`, `components/` or `views/`: they come
  from `lib/config/leagues.ts` or the read API. Routed URLs come from the helpers in
  `lib/shared/routes.ts` (`gameHref` in `lib/shared/game-id.ts`).
- The data CLIs at the root of `scripts/` keep their paths: committed data records them (`builtBy`),
  with the notes they write.

## Where to add things

A league, a route or a dataset: docs/ARCHITECTURE.md "How to add things". A data file's story:
`docs/DATASETS.md`. A known gap or an open owner decision: `docs/KNOWN-LIMITATIONS.md`.

## Commits

One change per commit, subject `<scope>: <lowercase sentence>` (`lib`, `views`, `components`, `app`,
`pipeline`, `scripts`, `tests`, `ci`, `docs`, `tooling`, `data`); the body says why and names every
observable change.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
