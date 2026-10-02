# NorCal Field Hockey (repo: scvalfh)

Scores, standings, schedules and playoff pictures for the 43 girls varsity field hockey teams of
four leagues: SCVAL, BVAL and PCAL in the CIF Central Coast Section, and MCAL in the North Coast
Section. Teams from other sections appear only as opponents (this is the site's scope note,
`SITE_SCOPE_NOTE` in `components/layout/site-url.ts`). A static Next.js site rebuilt from one JSON
snapshot, refreshed twice a day in season by a scheduled GitHub Actions job. The same source also
builds and serves on vinext (Vite), on Node and as a Cloudflare Worker; see "Deploy notes".

Unofficial. Not affiliated with SCVAL, BVAL, PCAL, MCAL, CIF-CCS, CIF-NCS, MaxPreps or Sports
Illustrated. See "Attribution and legal posture" below.

## Leagues and teams

| League | Section | Divisions (teams) | Teams |
|---|---|---|---|
| SCVAL — Santa Clara Valley Athletic League | CCS | De Anza (7), El Camino (8) | 15 |
| BVAL — Blossom Valley Athletic League | CCS | Mt. Hamilton (6), Santa Teresa (6) | 12 |
| PCAL — Pacific Coast Athletic League | CCS | one division (7) | 7 |
| MCAL — Marin County Athletic League | NCS | one division (9) | 9 |

43 teams in all. PCAL and MCAL are single-division leagues, so the site shows no division picker
and no division label for them. Every league fact (ids, MaxPreps ids, rules, tiebreak chains with
their citations, postseason ladders, official sources, data-quality lists) lives in
`lib/leagues.ts`; the teams live in `lib/registry/{scval,bval,pcal,mcal}.ts`, assembled by
`lib/teams.ts`. The CCS holds a 16-team championship fed by SCVAL (7 berths), BVAL (4), PCAL (2)
and three at-large berths; the NCS holds no field hockey championship, so MCAL's own six-team
tournament is its postseason. 2025-26 history and the rosters are SCVAL-only and are labelled so.

People pick the league they want to see in two ways: the home page remembers one (chips and a
"Show <league> here" button, applied before first paint), and a team finder searches all 43
schools by name, city or mascot and pins one.

## Live routes

Every route is static. Dynamic routes list their params in `generateStaticParams` and set
`dynamicParams = false`, so an unknown param is a 404; nothing reads `searchParams`.

| Route | What it shows |
|---|---|
| `/` | "What just happened in my league, and when is my team's next game?" Find-your-team on a first visit, then one panel per league: latest scores, mini standings, next games, teams and the postseason card |
| `/standings` | Every division as a compact full table, grouped section → league → division; `#de-anza`, `#el-camino`, `#bval`, `#mcal` and the other division anchors resolve with no JavaScript |
| `/standings/[league]` | One league's full standings page (4 pages: `scval`, `bval`, `pcal`, `mcal`), with PTS, W-L-T, GF/GA/GD, GP, games left and the most points still reachable |
| `/schedule` | A light index: league cards, recent and next game days, and an "every game day" list whose `#YYYY-MM-DD` rows keep old date links working |
| `/schedule/[league]` | One league's whole season, filterable client-side (4 pages) |
| `/scores/[date]` | One day's scoreboard, grouped by league (one static page per date with a game; OG card per date) |
| `/game/[id]` | One game's detail page (one static page per game; OG card per game). A game whose score came from si.com has an id like `sblive-123`; one that MaxPreps later published is a stub that links to it |
| `/teams` | All 43 teams: a search box and the full list grouped section → league → division |
| `/teams/[slug]` | One team's record, schedule, results, splits and postseason line (43 pages) |
| `/playoffs` | The CCS picture: the 16-team field by league (`#scval #bval #pcal`), the SCVAL crossover and BVAL play-in, and the bracket once CCS publishes one |
| `/playoffs/[league]` | League tournaments: `/playoffs/mcal` is the MCAL six-team tournament (the only league that has one) |
| `/history/2025-26` | SCVAL's prior season final standings (record-only, from the official PDF) |
| `/about` | Per-league rules (`#rules-scval #rules-bval #rules-pcal #rules-mcal`), per-league health (`#health`), sources, the cross-check, every si.com backfill (`#backfills`) and every dropped contest (`#dropped`) |

Every prerendered game, date, team and league page also has a generated `opengraph-image` route,
and the site publishes `sitemap.xml`, `robots.txt` and a web manifest (`app/sitemap.ts`,
`app/robots.ts`, `app/manifest.ts`). The phone tab bar has five tabs (Home, Scores, Table, Teams,
Playoffs) and the desktop nav seven links; after hydration Scores, Table and Playoffs follow the
league you are looking at or have chosen.

## How data flows

```
MaxPreps ghost API    ──┐
si.com (SBLive)       ──┤
scval.com PDFs (live) ──┼──► scripts/fetch-data.ts ──► data/snapshot.json ──► next build ──► static site
data/official/*.json  ──┤     (lib/pipeline/*)         data/snapshot.meta.json   or vite build (vinext)
cifccs.org / VNN .ics ──┘
```

1. **`scripts/fetch-data.ts`** is the cron entry point, a thin CLI over `lib/pipeline/` (see
   `docs/DATA-SOURCES.md` for every endpoint, JSON path and gotcha). It runs a **56-request
   MaxPreps sweep**: 1 bootstrap, 6 league metadata checks, 6 standings tables and 43 team
   schedules, at most 3 at a time and at least 500 ms apart. Failures are scoped, so one league
   never blocks the others:
   - **Run abort** (exit 1, nothing written, the previous snapshot stays): the season ids changed,
     the league or team registry is inconsistent, the assembled snapshot fails validation, or
     there is a systemic outage (under 80% of the previous game count, 60% or more of the feeds
     failed, or every league frozen).
   - **League freeze**: one league's data cannot be trusted (a league page moved to another
     season, half its team feeds failed, or counted finals suddenly dropped by 3 or more). That
     league's games and table come from the previous snapshot, with its reasons published on the
     site, and the other leagues publish fresh.
   - **Source stale**: one source failed (a MaxPreps standings table, a team feed, an official
     PDF, an official-schedule revision check, si.com). Its previous contribution is carried, the
     league is marked partial and a `SourceStatus` row says so, never a blank section.

   Official schedules come from three places: SCVAL's two PDFs are parsed live; BVAL, PCAL and
   MCAL fixtures are bundled under `data/official/` (validated at load) and each run only checks
   upstream by hash, never applying a change on its own. Secondary sources (si.com, the two VNN
   `.ics` feeds, the CCS calendar and bracket poll) are optional and failure-tolerant.
2. It writes **`data/snapshot.json`** (the full normalized `Team[]`/`Game[]`/`Standing[]`/
   per-league health/dropped contests/`SourceStatus[]`) and **`data/snapshot.meta.json`**
   (counts, timestamps, a per-league summary: what the update-data workflow uses for its commit
   message and job summary).
3. **`next build`** (or `vite build` under vinext) reads only `data/snapshot.json` (`lib/data.ts`)
   and prerenders every route — there is no request-time fetch, no database and no
   `searchParams` anywhere. "Today" for rendering purposes is always derived from the snapshot's
   `fetchedAt`, never `Date.now()`, so a given commit builds byte-identically no matter when
   `next build` runs.
4. Standings are **computed from game rows**, not taken from MaxPreps' own numbers — see "How
   standings are computed" below. MaxPreps' reported row is kept alongside for cross-check and
   shown as a flagged mismatch when the two disagree (visible on `/about` and on the standings
   rows themselves).

### The cron

`.github/workflows/update-data.yml` runs `pnpm fetch-data` on a schedule, **twice a day, only in
season** (cron `0 14 * 8-12 *` and `0 5 * 8-12 *` — 7:00 AM and 10:00 PM Pacific during PDT,
restricted to Aug-Dec so it rarely fires out of season; the cron's months are UTC, and December
is there only for the Nov 30 10:00 PM Pacific run, which is already December 1 in UTC). The
season itself is bounded by the scripts' own Aug 1 - Nov 30 Pacific window guard
(`inSeasonWindow` in `lib/pipeline/steps/window.ts`, over the sections' season windows in
`lib/leagues.ts`; `fetch-player-stats` imports the same function): a run outside it exits without
writing anything. Right after `fetch-data` it runs `pnpm fetch-player-stats` (SCVAL only; see
"Player stats" below), which is allowed to fail without stopping the run. It runs the test suite
against what it just wrote, and commits `data/snapshot.json` + `data/snapshot.meta.json` and
`data/player-stats.json` **only where they changed**, in one commit. The commit is what triggers
your hosting provider's rebuild — that's the entire point of the job, so it deliberately does not
carry `[skip ci]`. The job fails, and commits nothing, only on a run abort; a frozen or partial
league still publishes (with its reasons on the site). After a successful run it opens or updates
one issue per official schedule revised upstream and one per league frozen in this run and the
previous one, never more than one open issue per title.

A manual **Run workflow** (`workflow_dispatch`) takes the same switches as inputs: `force` (run
outside the season window), `skip_sblive` (`--no-sblive`), `leagues` (`--leagues`) and
`accept_regression` (`--accept-regression`, for a finals drop you have checked is real). Its test
step does not set `CI_GATE`, so the home page's teamViews budget only warns there; `ci.yml` sets
`CI_GATE` and fails past 60 KB.

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
0 7,22 * 8-11 * cd /path/to/scvalfh && pnpm fetch-data && (pnpm fetch-player-stats || true) && pnpm build
```

Or by hand, any time:

```bash
pnpm fetch-data   # refresh data/snapshot.json + data/snapshot.meta.json
pnpm build        # rebuild the static site from the new snapshot
pnpm start         # or redeploy the .next output to your host
                   # (vinext: pnpm build:vinext && pnpm start:vinext, or pnpm deploy:cloudflare
                   # for the Worker; see "Deploy notes")
```

Flags on `fetch-data` (`pnpm fetch-data --help` prints them; the header of `scripts/fetch-data.ts`
has the same list):

| Flag | Effect |
|---|---|
| `--fixtures <dir>` | run entirely offline against a manifest-driven corpus (see "Corpus and capture") |
| `--variant <dir>` | with `--fixtures`, overlay a variant corpus on top (repeatable) |
| `--capture <dir>` | live run that also records every response into a new corpus at `<dir>` |
| `--leagues scval,bval` | fetch only these leagues; the others are carried from the previous snapshot, frozen |
| `--accept-regression bval` | skip the finals-regression guard for these leagues, this run only |
| `--out <path>`, `--dry-run`, `--fetched-at <iso>` | write elsewhere; validate and report without writing; pin the run's stamp |
| `--force` | bypass the Aug 1 - Nov 30 season-window guard |
| `--no-sblive`, `--sblive-full` | skip si.com; or also read every si.com team page (manual, never the cron default) |
| `--no-official` (alias `--no-scval`), `--no-ccs`, `--no-vnn` | skip individual secondary sources |

### Corpus and capture

`tests/fixtures/corpus/all-2026-10-02/` is a recorded copy of one real run: every MaxPreps
response for all four leagues, the si.com pages that matter, the SCVAL PDF texts and the official
revision hashes, with a `manifest.json` naming each file. `pnpm fetch-data --fixtures
tests/fixtures/corpus/all-2026-10-02 --out /tmp/x.json` rebuilds a whole snapshot from it with no
network, and `tests/fixtures/corpus/variants/` holds overlays for the failure cases (a league on
the wrong season, an empty table, a 503 feed, a revised official schedule, a finals regression,
MCAL postseason games). Tests that assert league-specific values build their snapshot from the
corpus (`corpusSnapshotPath('all-2026-10-02')` in `tests/helpers.ts`); tests over the bundled
`data/snapshot.json` assert invariants only, because that file changes every run.

To make a new corpus, run `pnpm fetch-data --capture tests/fixtures/corpus/<name>` once on a
workstation; it is a normal live run that also writes each response and the manifest. Capturing
is the only reason to run a live fetch by hand.

### Official fixtures

BVAL, PCAL and MCAL publish their schedules as documents, so their league fixtures are bundled in
`data/official/{bval,pcal,mcal}-2026.json`, written by `pnpm build-official-fixtures` from the
transcriptions under `tests/fixtures/official/source/` and never hand-edited (`pnpm
build-official-fixtures --check` exits 1 if a file differs). The cron compares each document's hash
with the bundled one; a difference is published as a "revised upstream" reason and an issue, and the
bundled fixtures are still used until someone re-transcribes them (the runbook is in
`docs/DATA-SOURCES.md`).

### Rosters

`data/rosters.json` holds every team's player list — name, jersey number, grade, position(s),
height and captain flag, whatever the coach entered on MaxPreps — built by `pnpm fetch-rosters`
from the 15 MaxPreps roster pages (the SCVAL teams; rosters are SCVAL-only) and committed, like
the history file, rather than refreshed by the cron (rosters change a few times a season; run it by
hand or weekly). The page encodes each athlete as a 37-element positional array, so
`lib/sources/maxpreps-roster.ts` decodes it with MaxPreps' own column list and cross-checks every
row against the page's rendered table, failing the team rather than publishing a wrong grade beside
a name. Blanks are `null`, never guessed; soft-deleted rows are dropped; a team whose fetch fails
keeps its previous rows with `status: "carried-forward"`.

`data/rosters-enrichment.json` is what other public sources add to that — the schools' own
athletics-site rosters, one roster PDF, two school papers, MaxPreps career and JV pages — gathered
by hand once (2026-10-02) and joined on the MaxPreps athlete id. It only ever fills a blank; where
a source disagrees with MaxPreps, MaxPreps stays and the disagreement is recorded; every value
carries its source URL, kind and a confidence. `lib/rosters.ts` is the read API:
`getTeamRoster(slug)` is MaxPreps alone, `getEnrichedTeamRoster(slug)` the merged view with
per-field provenance, conflicts and coaches, `sortedPlayers(team)` the display order. Each SCVAL
team page renders it in a Roster section (`components/teams/TeamRoster.tsx`, built by
`components/teams/roster-view.ts`): varsity only, a † on every value that did not come from
MaxPreps, the coaches, every recorded disagreement and a link to each source. BVAL, PCAL and MCAL
team pages have no Roster section at all (`buildRosterView` returns `null` outside SCVAL), rather
than an empty one.

The same overlay links players' own recruiting pages (SCVAL only) — NCSA, SportsRecruits and Hudl
profiles (`profiles` on each record; 70 for 56 players as of 2026-10-02, 67 of them on varsity
rows). A page is linked only when it names the player and field hockey and either names the school
or shows the class year the roster shows plus a California hometown, and a stated class year must
agree with the row's grade (checked at load). The roster shows them as a line of links under the
player's facts. Recall is partial: see `docs/DATA-SOURCES.md` §1.1j, which also has the column map,
the per-school sources and the overlay's rules.

```bash
pnpm fetch-rosters                                      # live: 15 roster pages → data/rosters.json
pnpm fetch-rosters --fixtures tests/fixtures/maxpreps   # offline, from the captured pages
pnpm fetch-rosters --dry-run                            # parse and report, write nothing
```

### Player stats

SCVAL only, like the rosters it joins to: `fetch-player-stats` iterates
`teamsInLeague(HISTORY_LEAGUE)` (the 15 SCVAL teams), and BVAL, PCAL and MCAL team pages have no
Player stats section (`buildPlayerStatsView` returns `null` there).

`data/player-stats.json` holds each SCVAL team's season player stats as the coach entered them on
MaxPreps — games, goals, assists, points, and where the coach tracks them shots, shots on goal,
game-winning goals, steals, minutes and goalkeeping — built by `pnpm fetch-player-stats` from the
JSON behind each team's MaxPreps `/stats/` page and joined to `data/rosters.json` on the career id
in each row's player link. A stat is kept only where the team tracks it (its team total is above
zero), so a 0 is a real zero and an untracked stat is null; per-game and percentage columns are
dropped. 10 of the 15 SCVAL teams publish stats; for the other five MaxPreps answers "No data was
found" and the file says `status: "none"`. `lib/player-stats.ts` is the read API; each SCVAL team
page renders it in a Player stats section (`components/teams/TeamPlayerStats.tsx`, built by
`components/teams/player-stats-view.ts`), which says when MaxPreps last updated and how many games
the team has played since. See `docs/DATA-SOURCES.md` §1.1k.

Stats change after every game, so `update-data.yml` runs this twice a day in season, right after
`fetch-data`, and commits the file with the snapshot when it changed. A failed stats fetch never
stops the score refresh: the step may fail, and a team whose call failed keeps its previous rows
(`carried-forward`). When nothing but the run's stamp would change, the script leaves the file
exactly as it was, so there is nothing to commit. Like `fetch-data`, it writes nothing outside the
Aug 1 - Nov 30 Pacific window unless given `--force`.

```bash
pnpm fetch-player-stats                                      # live: 15 SCVAL rollups → data/player-stats.json
pnpm fetch-player-stats --fixtures tests/fixtures/maxpreps   # offline, from the captured JSON
pnpm fetch-player-stats --dry-run                            # parse and report, write nothing
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

pnpm assert:prerender    # after a build: every route family prerendered, with exact counts from the snapshot
pnpm assert:budgets      # after a build: snapshot, page-weight and first-load JS budgets
pnpm assert:copy         # after a build: copy-honesty scan of the built HTML
pnpm build-official-fixtures   # rewrite data/official/*.json (never hand-edit them; --check verifies)
pnpm gate:d              # the full gate: Next, vinext and Cloudflare builds, smoke and axe on each
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

`.github/workflows/ci.yml` runs on every push to `main` and every PR: typecheck, lint, test, build,
and an assertion that every route family actually prerendered (no route should ever fall back to
dynamic rendering — `generateStaticParams` covers every `/game/[id]`, `/scores/[date]` and
`/teams/[slug]`, and the per-league `/standings/[league]`, `/schedule/[league]` and
`/playoffs/[league]` pages, with exact counts read from the snapshot and the league config), then
checks the page-weight and first-load JS budgets and a copy-honesty scan of the built HTML. A second
job starts `next start` on that build, holds it to the response contract with
`scripts/smoke-server.sh` (see "vinext" under "Deploy notes") and runs `axe-core` against it
(`scripts/a11y-axe.mjs`) across every route family, both themes, both a phone and a desktop
viewport, failing on any serious/critical accessibility violation. Two more jobs, one per vinext
target, run beside them (not after `gates`, so a vinext regression shows even when Next is red).
`vinext` builds with `pnpm build:vinext`; `cloudflare` first validates the deploy setup with
`vinext-cloudflare deploy --env cloudflare --dry-run`, which needs no credentials, then builds with
`pnpm build:cloudflare` and a non-localhost `SITE_URL`. Each asserts with
`scripts/assert-vinext-prerender.mjs` that every route rendered with `revalidate: false`, that the
static pages, metadata routes and Route Handlers are on disk, that the page families and their OG
images are exactly the ones the Next build's assertion expects (standings, schedule, playoffs, game,
date and team, with OG/page parity by name) and that the prerendered sitemap lists exactly the
prerendered pages; for the Worker it also checks that every one of them is packaged into the
static-assets cache and every file its index lists is there, that `_headers` is there, and that
nothing else ships: no precompressed copy, and nothing at the top level of the upload but
`_headers`, `_next/` and `_vinext/` unless `.assetsignore` keeps it out. Then each starts its server
(`vinext start`, or the Worker in workerd through `vite preview`) and runs the same
`scripts/smoke-server.sh` and axe passes against it. Uploading the Worker is
`.github/workflows/deploy-cloudflare.yml`'s job (see "Cloudflare Workers").

## Tests

`pnpm test` runs the full Vitest suite: snapshot-schema validation, standings/tiebreak arithmetic
against synthetic and fixture data (including a golden proof that SCVAL's tables are byte-identical
to the single-league site's), the si.com backfill rules, the official-schedule matcher, PDF-grid
parsing,
the "never render a missing score as 0-0" rule across every `GameRow` variant and every non-final
game page, and playoff-projection edge cases (shared 3rd, the Oct 30 play-in/crossover, unnamed
rounds). Fixtures captured from real (offline) MaxPreps/SCVAL responses live under
`tests/fixtures/`.

## Next-season bootstrap

MaxPreps' season ids are **never hardcoded into more than one place** — they live in
`lib/season.ts`, and the six league ids (and every other league fact) in `lib/leagues.ts`; both are
re-asserted on every `fetch-data` run. When the season rolls over:

```bash
pnpm discover-season                              # or: pnpm exec tsx scripts/discover-season.ts
pnpm exec tsx scripts/discover-season.ts --ssid <sportSeasonId>   # pin explicitly if needed
pnpm exec tsx scripts/discover-season.ts --help                   # usage; makes no request
```

`scripts/discover-season.ts` reads the new `sportSeasonId`/`allSeasonId`/`genderSport`/
`teamLevel` from MaxPreps' state hub page, resolves each of the six league ids through
`team-context/v1` on one representative team per division, asserts they agree with
`leagues/{id}/v1`, and prints a diff against `lib/season.ts` and `lib/leagues.ts` plus a
ready-to-paste constants block. **It never writes a file** — a human reviews the diff and edits
`lib/season.ts` and `lib/leagues.ts`, because a wrong season id would silently publish last
year's table under this year's URL. The official schedules, by-laws and fixture files are
re-transcribed by hand each season (see `docs/DATA-SOURCES.md`).

Once a season is finished, its final standings are permanently only available from the SCVAL
end-of-season PDFs (a MaxPreps league URL's year segment is cosmetic and always serves the
current season). Run `pnpm build-history` once, by hand, after the PDFs are published, to
generate `data/history-<season>.json` from `https://www.scval.com/standings/` — it is a
record-only file (final W-L-T as published; no recomputed points, since the PDF has no
game-level data to recompute from) and is committed to the repo, not regenerated by the cron.

## How standings are computed

All four leagues award 3 points for a win, 1 for a tie and 0 for a loss, order by points, and can
end a league game in a tie. They differ in the tiebreak chain, in how a tie among three or more
teams is worked through and in the postseason, so every rule is data in `lib/leagues.ts` (with the
by-law citation next to it) and one engine in `lib/standings.ts` runs them. Only games that count
toward a division table count: a team's non-league and postseason games never do. The full rules,
with citations, are in `docs/LEAGUE-RULES.md`; the site prints them on `/about#rules-<league>`.

### SCVAL

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

### BVAL

Per the **BVAL Field Hockey By-Laws (rev. 8/13/24)**: a home-and-home double round robin inside
each division (Mt. Hamilton and Santa Teresa, 10 league games a team), 3 points for a win and 1 for
a tie (§6a), standings in the order of points, and a tie at the top is co-champions of the
division. Ties on points: (§6b) head-to-head, and with three or more teams level a 3-1-0
mini-league among them; (§6c) more division wins; (§6d) head-to-head goal differential; (§6e)
fewest goals allowed in division play; (§6f) a coin flip, which this site cannot compute, so those
teams share a place. A multi-team tie is resolved one place at a time: the first place is decided,
then the chain restarts among the rest. The CCS ladder (§7a): Mt. Hamilton 1st-3rd are BVAL #1-#3;
Mt. Hamilton 4th plays at the Santa Teresa champion on Sat Oct 31 for BVAL's 4th berth; BVAL holds
4 of the 16 CCS berths. Which games count comes from BVAL's official schedule, not from MaxPreps'
league flag.

### PCAL

Per the **PCAL Sports Rules — Field Hockey (Jan 2022)** and the **PCAL By-laws (rev. May 2025)**:
one division, a double round robin in 2026, 3 points for a win and 1 for a tie (Rules §1.7),
standings in the order of points, two teams level at the top are co-champions and three are
tri-champions (By-laws §22.3). PCAL's by-laws break ties only for the two automatic CCS places
(§23.3): a tie whose points start at 1st or 2nd is worked through head-to-head (three level: the
three-way head-to-head, then a two-way among those still level), then, for 1st, the record against
each lower-placed team in standings order, and for 2nd the record against each higher-placed team
from the champion down and only then against each lower-placed team; what is left would be settled
by a coin flip or blind draw, which this site cannot compute. A tie for 3rd or lower has no rule and
is shown level. The top two are automatic CCS qualifiers (Rules §1.8.1; 3rd and lower may apply for
at-large under By-laws §23.4); PCAL holds 2 of the 16 CCS berths.

### MCAL

Per the **MCAL Field Hockey Handbook (rev. 10/19/24)** and the **MCAL Tie-Breaking Criteria
(rev. 3/26)**: one division, a double round robin of 16 league games a team (§8a), 3 points for a
win and 1 for a tie, "the MCAL placement will be the order of team points" (§7a), and equal points
at the top are co-MCAL champions. Ties on points: (1) head-to-head winning percentage; (2) record
against the teams above the tie; (3) the spring draw numbers, lowest first. The last tournament
place (6th) is decided on the field instead: a play-in on Fri Oct 23 unless one team swept the
head-to-head 2-0, so the site leaves it shared until then. MCAL has no regular-season overtime. The
top six make the MCAL tournament (seeds 1-2 get a bye to the Oct 28 semifinals, quarterfinals Mon
Oct 26, final Fri Oct 30 at Tamalpais). The North Coast Section holds no field hockey
championship, so this is not a section playoff and no MCAL page describes CCS berths. With an
incomplete schedule MCAL's General Rules rank by winning percentage instead of points; the
standings page notes that.

### Computed, not copied

Standings are always **computed from individual game rows**, not read off MaxPreps' own
`conferenceStandingPlacement`/points fields — MaxPreps' own arithmetic has shown internal
inconsistencies (see `docs/DATA-SOURCES.md` §7). MaxPreps' reported row is kept on every
`Standing` for cross-check and shown as a flagged mismatch (⚑) when it disagrees with the
computed one; see `/about`. A division whose MaxPreps table is known to differ (Santa Teresa
leaves out Prospect; PCAL's is missing games; MaxPreps orders MCAL by winning percentage) shows
the known cause beside the comparison instead of an alarm.

### Official schedules decide which games count

For BVAL, PCAL and MCAL a MaxPreps game counts toward the league table only when it matches a
fixture on the league's official schedule (same date and home/away, or the same pair moved within
two weeks), and never when MaxPreps marks it a tournament or neutral game or it is postseason play.
SCVAL keeps its own rule: MaxPreps' league flag, corroborated by the official PDF grid. Official
league games with no counted result yet are listed under the table as "missing", never counted.

### si.com backfill (owner decision D2)

MaxPreps is the primary source and is published as MaxPreps has it. High School on SI (si.com) may
fill in only these cases, each marked on the page ("score via si.com", with a † on the table row
that includes one) and listed on `/about#backfills` with both values and the rule that applied:

1. MaxPreps has no game at all for an official league fixture that has already passed, and si.com
   has that same game as a final.
2. MaxPreps has the game but no score (score not reported) and the date has passed, and si.com has
   a final for it.
3. MaxPreps' row is clearly wrong, in one of three mechanically detectable ways: its win/loss
   flags contradict its own score; its date is more than a week from the official one while si.com
   has the game final on the official date; or it shows a 0-0 tie in a league with no overtime
   while si.com has a decided final the same day. si.com's score is published and MaxPreps'
   value is recorded.

If both sources have a score and neither of those holds, MaxPreps stays and the disagreement is
published. si.com is never used for which division a team is in, for records or for standings
order, and a game counts only when both teams are matched by si.com's own team ids, never by name
alone. A MaxPreps game that later appears for a filled fixture takes over, and the old si.com game
page becomes a link to it. `--no-sblive` turns the whole thing off. The exact rules are in
`docs/DATA-SOURCES.md`.

## Known limitations

- **Some schools are not covered.** Wilcox is not fielding a team this season: the official SCVAL
  De Anza grid still lists it, but it is not in the team registry, its 14 grid fixtures are
  dropped when the PDF is parsed, and De Anza is shown as 7 teams. York plays JV field hockey only
  (PCAL's grid slot `CAT/YOR` is Santa Catalina), so it has no varsity results. Both are in the
  `withdrawnNames` of their league in `lib/leagues.ts`, and the team search says so.
- **MaxPreps is wrong or incomplete for some leagues.** MaxPreps' Santa Teresa table leaves out
  Prospect and counts four of its league games as non-league; its PCAL data is missing some
  official league games and dates others differently; it orders MCAL by winning percentage and,
  after Oct 22, counts MCAL tournament games in league records. The site computes those tables
  from the league's official schedule and says what differs, per league, on `/about#health`.
- **MaxPreps' manual entry lags.** Coaches enter scores by hand; at times only a fraction of
  played games carry a score days after the fact, and MaxPreps occasionally corrects a
  previously-entered result. The fetch script re-ingests every team's entire season on every run
  (not just a trailing window) specifically so corrections and backfills are never missed.
- **SBLive's league buckets are wrong for SCVAL.** Its "De Anza" and "El Camino" pages
  misfile several SCVAL schools between divisions and omit Santa Clara entirely, and statewide
  name collisions (University, Los Altos, Santa Clara) are common. si.com is a cross-check and,
  under the narrow backfill rules above, a source of scores MaxPreps lacks or has plainly wrong;
  division membership, league records and standings order are **never** taken from it, and a team is
  matched only by si.com's own ids.
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
  SCVAL programs** (108 of 341 have one), Los Altos and Homestead publish no roster anywhere, and
  si.com's rosters were rejected as a source (names only, and often a different list of names).
- **Player stats are SCVAL-only, and exist only where a coach enters them.** BVAL, PCAL and MCAL
  teams have no player stats or roster on the site. As of 2026-10-02, 10 of the 15 SCVAL teams
  publish stats on MaxPreps (Cupertino, Los Altos, Los Gatos, Lynbrook and Saratoga publish none,
  and no school site or si.com page has them either), what each tracks varies by coach, and some
  stop entering mid-season (Presentation's last update was Sep 10). The team page says so rather
  than showing a short table as if it were complete.
- JV is out of scope; MaxPreps' season-year URL segment is cosmetic (it always serves the current
  season, never a prior one); and a handful of MaxPreps/school-calendar start-time disagreements
  and si.com-only games that no official schedule lists are surfaced as warnings rather than
  silently resolved. See `docs/DATA-SOURCES.md` §7 for the full list of open risks.

## Attribution and legal posture

Every page that shows league data carries a visible attribution line and deep-links back to the
originating MaxPreps/SBLive/league/cifccs.org page (`components/layout` attribution + every
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
  `dynamicParams = false` does not reach the OG images, so `next start` renders the card of an
  unknown param (`/standings/nope/opengraph-image`) on request, answers 404 and caches that 404
  under `.next/server/app` (a 0-byte `.body` and a `.meta`), one entry per distinct URL a crawler
  asks for, with no upper bound. They are safe to delete at any time (the next request renders the
  404 again), every new build starts without them, and `pnpm assert:prerender` ignores them.
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
`next build` does — about 480 pages plus a 404 with the current snapshot (481 .html, per the
measurement in `next.config.ts`; the exact counts are derived from `data/snapshot.json` by
`scripts/assert-vinext-prerender.mjs`), all `revalidate: false` in
`dist/server/vinext-prerender.json`: every page (HTML and RSC payload) plus a 404 page, and every
icon, apple-icon, `/icon-192`, `/icon-512`, OG image (root, `/standings`, one per league, game, date
and team), `manifest.webmanifest`, `sitemap.xml` and `robots.txt`, under
`dist/server/prerendered-routes/`. `vinext start` seeds its cache from them at startup ("Seeded N
pre-rendered routes into memory cache") and serves each one as built. None of them renders per
request; a 404, which no prerendered route covers, is what the server renders on request (see
above).

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

`pnpm build:cloudflare` prerenders the same routes as `pnpm build:vinext` (all
`revalidate: false`; the prerender runs the Worker bundle in Node) and writes a Cloudflare Build
Output to `.cloudflare/output/v0/`: the Worker bundle and its `worker.config.json` under
`workers/default/`, and its Workers Static Assets. A Worker has no filesystem to seed a cache
from, so `staticAssetsAdapter()` (from `@vinext/cloudflare`) packages the prerender into those
assets under `/_vinext/static-cache/`, with an `index.json` the Worker looks them up in: every HTML
page and the 404 with one RSC payload per page, and every metadata route and Route Handler
body. vinext also writes a `_headers` file giving `/_next/static/*` the immutable Cache-Control.
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
Static Assets (several hundred files) and promotes the new version. `--dry-run` validates the
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
`main`: it walks down from the tip past `update-data`'s data commits (by the bot, one parent, a
`data: refresh snapshot` or `data: refresh player stats` message, nothing but the snapshot, its
meta file and `data/player-stats.json`, tested by that job before it pushed) to the commit whose
code ships, and deploys only if that commit has a successful `ci` run on `main` and nothing but the
data changed above it. `tests/workflows.test.ts` holds the two workflows to the same messages and
files.
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
- `docs/LEAGUE-RULES.md` — per league: points, order, tiebreak chain with citations, how
  multi-team ties are resolved, co-champions, the postseason, official sources and known data gaps.
- `docs/BYLAWS-2026-27.md` — the verified SCVAL by-laws excerpt that governs standings, points,
  tiebreaks and CCS qualification.
- `docs/DESIGN.md` — the implementation-ready design record: routes, tokens, component
  signatures, rendering rules, empty states, accessibility requirements. §15 is the multi-league
  amendment (what changed from the single-league design, and why).
