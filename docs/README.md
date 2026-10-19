# Documentation

The repository's own front door is the top-level `README.md`; this is the index of everything under
`docs/`.

## Start here

| Document | What it covers |
|---|---|
| `docs/ARCHITECTURE.md` | The layers, the dependency rule and the test that enforces each part; the client tier, the view contract, the data lifecycle, the rendering model, the gates, and how to add a league, a route or a dataset |
| `docs/DEVELOPMENT.md` | Commands, the build-time data files and their overrides, the tests, the conventions (imports, naming, comments, moving a module, commits) and every script |

## The site

| Document | What it covers |
|---|---|
| `docs/LEAGUES.md` | The leagues and teams covered, and the facts that shape them |
| `docs/ROUTES.md` | Every route, what it shows, its anchors and the region scoping |
| `docs/STANDINGS.md` | How standings are computed, league by league |
| `docs/RATINGS.md` | The Elo rating and the Elo-adjusted goals and points |
| `docs/KNOWN-LIMITATIONS.md` | What the site cannot know or show yet, and the open owner decisions |

## The data

| Document | What it covers |
|---|---|
| `docs/DATA-PIPELINE.md` | How data flows: the cron, self-hosting it, the recorded corpora, the official fixtures |
| `docs/DATASETS.md` | The committed data files beside the snapshot: rosters, player stats, JV games, clubs, commitments, mascots, and the research drafts under `tests/fixtures/` |
| `docs/SEASON-ROLLOVER.md` | What to run and edit when a season ends and the next begins |
| `docs/DATA-SOURCES.md` | Every upstream endpoint, JSON path, enum and known gotcha, condensed from the build-time research spec |

## Rules and records

| Document | What it covers |
|---|---|
| `docs/LEAGUE-RULES.md` | Per league: points, order, the tiebreak chain with citations, multi-team ties, co-champions, the postseason, official sources and known data gaps |
| `docs/BYLAWS-2026-27.md` | The verified SCVAL by-laws excerpt that governs standings, points, tiebreaks and CCS qualification |
| `docs/DESIGN.md` | The design record: routes, tokens, component signatures, rendering rules, empty states, accessibility, and the amendments that followed |
| `docs/CITATIONS.md` | How citations work here: the frozen-path table for paths that committed data quotes |

## Deployment

| Document | What it covers |
|---|---|
| `docs/DEPLOYMENT.md` | Hosting on Next.js, on vinext's Node server and as a Cloudflare Worker, and the deploy workflow |
| `docs/VINEXT-PATCHES.md` | The two pnpm patches to vinext and `@vinext/cloudflare`, and when to drop them |

A citation of a section reads `docs/<FILE>.md "<Heading>"`; `tests/arch/citations.test.ts` fails when
the heading no longer exists.
