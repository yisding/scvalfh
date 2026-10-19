# NorCal High School Field Hockey (repo: scvalfh)

An unofficial site of scores, standings, schedules, playoff pictures, team pages and leaders for
California high-school girls varsity field hockey, whose tables are computed from the games rather
than copied from any source. Every page is prerendered from one committed JSON snapshot that a
scheduled GitHub Actions job refreshes twice a day in season, so the site needs no database and makes
no request-time fetch. The same source builds on Next.js and on vinext (Vite), on Node and as a
Cloudflare Worker, and its layers are held in place by tests (`docs/ARCHITECTURE.md`).

It covers the 49 teams of Northern California's five leagues (SCVAL, BVAL and PCAL in the CIF Central
Coast Section, MCAL in the North Coast Section and the Northern Section's EAL) and Southern
California's 53 (the Southern Section's Sunset field hockey league, the San Diego Section's City,
North County and Metro conferences, and five Southern Section independents in no field hockey league)
behind a NorCal/SoCal toggle whose default is NorCal (owner decision, 2026-10-06). Every California
team we found with a 2026 varsity game on MaxPreps (2026-10-06) is covered; other teams appear only as
opponents (this is the site's scope note, `SITE_SCOPE_NOTE` in `views/site/site.ts`).

Unofficial. Not affiliated with SCVAL, BVAL, PCAL, MCAL, EAL, the Sunset, City, North County or Metro
leagues, CIF-CCS, CIF-NCS, CIF-NS, CIF-SS, CIF-SDS, the San Diego Field Hockey Officials
Association, MaxPreps or Sports Illustrated. See "Attribution and legal posture" below.

## Quick start

```bash
pnpm install
pnpm dev            # next dev on port 3000, from the committed data/snapshot.json
```

| Command | What it does |
|---|---|
| `pnpm check` | Typecheck, lint and the whole test suite: run it before every commit |
| `pnpm test:arch` | Only the architecture rules (`tests/arch/`): layers, client boundary, naming, citations |
| `pnpm gate` | `next build`, then every route prerendered, the page-weight budgets and the copy rules |
| `pnpm gate:all` | The whole CI job list on one machine: Next, vinext and Cloudflare Worker builds, smoke and axe on each |
| `pnpm fetch-data` | Refresh the snapshot from the live sources (the cron's job; `--fixtures <dir>` runs offline) |

Every other command, the build-time data files and their overrides are in `docs/DEVELOPMENT.md`.

## Repo map

| Path | What lives there |
|---|---|
| `app/` | Next.js App Router route files (vinext reads the same tree) |
| `components/` | React components; `og/` the OG cards, `hooks/` and `head/` the browser-side helpers |
| `views/` | View models: the plain data each page renders |
| `lib/model/` | Types only |
| `lib/shared/`, `lib/format/` | Client-safe helpers and copy |
| `lib/config/` | The season and the league configuration |
| `lib/registry/` | The team registry |
| `lib/schema/` | The zod schemas of every data file |
| `lib/engine/` | Standings, classification, postseason and ratings, pure |
| `lib/snapshot/` | Checking, migrating and loading a snapshot |
| `lib/datasets/` | The only modules that read `data/` |
| `lib/queries/` | The read API over the snapshot |
| `lib/sources/`, `lib/official/`, `lib/pipeline/`, `lib/cli/` | The cron's side: HTTP clients and parsers, official schedules, the pipeline steps, flags |
| `scripts/` | Data CLIs; `ci/` the gates, `dev/` and `lib/` the rest |
| `tests/` | Vitest, mirroring the source tree; `arch/` the architecture rules |
| `data/` | The committed snapshot and data files |
| `docs/` | Everything below |

The layers, the dependency rule and the test that enforces each are `docs/ARCHITECTURE.md`.

## Attribution and legal posture

Every page carries the same visible attribution line in the global footer
(`components/layout/Attribution.tsx`, rendered once by the root layout), and the deep links back
to the originating MaxPreps/SBLive/league/cifccs.org page live on the rows themselves: every
`Game`/`Standing` row's outbound link, the game page's sources and the team page. This site stores its own **derived** records — normalized
scores and independently computed standings — not verbatim copies of any source page, refreshes
on a self-imposed 1-2-runs-a-day budget well under any observed rate limit, sends an identifying
User-Agent, and serves only its own cached static snapshot (it never proxies a live upstream
request per visitor). See `docs/DATA-SOURCES.md` §6 for the full posture and the exact
attribution text rendered in the footer.

The Southern California rules and dates come from the CIF Southern Section (the Blue Book 2026-27
Field Hockey excerpt and its sports calendar), the CIF San Diego Section (the Green Book 2026-27, the
2026-27 League Alignment, the 2026 Divisions sheet and its power rankings) and the San Diego Field
Hockey Officials Association (the 2026 overtime procedures and the playoff round dates). Each is named
where the site uses it, and the footer credits the Southern Section's and San Diego
Section's rules for the Sunset and the San Diego leagues. None of them is affiliated with this site,
and none publishes standings that the site copies: the Southern California tables are this site's
own computation.

## Documentation

- `docs/ARCHITECTURE.md` — how the code is layered and what enforces it; how to add a league, a route
  or a dataset.
- `docs/DEVELOPMENT.md` — commands, tests, conventions and every script.
- `docs/LEAGUES.md` and `docs/ROUTES.md` — what the site covers and every page it serves.
- `docs/DATA-PIPELINE.md`, `docs/DATASETS.md` and `docs/SEASON-ROLLOVER.md` — how the data is
  fetched, what each data file holds, and what to do when a season ends.
- `docs/STANDINGS.md` and `docs/RATINGS.md` — how the tables and the ratings are computed.
- `docs/KNOWN-LIMITATIONS.md` — what the site cannot know yet, and the open owner decisions.
- `docs/DEPLOYMENT.md` and `docs/VINEXT-PATCHES.md` — hosting on Next.js, vinext and Cloudflare Workers.
- `docs/DATA-SOURCES.md` — every upstream endpoint, JSON path, enum and known gotcha, condensed
  from the build-time research spec.
- `docs/LEAGUE-RULES.md` — per league: points, order, tiebreak chain with citations, how
  multi-team ties are resolved, co-champions, the postseason, official sources and known data gaps.
- `docs/BYLAWS-2026-27.md` — the verified SCVAL by-laws excerpt that governs standings, points,
  tiebreaks and CCS qualification.
- `SPEC §n`, `BUILD-BRIEF`, `DESIGN-socal §n`, `design-review UI §n` and `Stage 0`/`A`/`C`/`D` in code
  comments refer to build-time documents that are not kept in this repo: docs/CITATIONS.md "Legend"
  says what each means and where its content lives now. New comments cite `docs/DESIGN.md`,
  `docs/DATA-SOURCES.md`, `docs/LEAGUE-RULES.md` or `docs/BYLAWS-2026-27.md` sections instead.
- `docs/DESIGN.md` — the implementation-ready design record: routes, tokens, component
  signatures, rendering rules, empty states, accessibility requirements. §15 is the multi-league
  amendment (what changed from the single-league design, and why). §22 is the EAL amendment (the
  fifth league and third section: what it reverses, its postseason surfaces, the copy rules and the
  measured budgets).
- `docs/CITATIONS.md` — the frozen-path table, for the module paths committed data quotes, and the
  legend of every citation shorthand.

`docs/README.md` indexes the same documents by topic.
