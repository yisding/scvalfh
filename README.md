# California High School Field Hockey (repo: scvalfh)

Scores, standings, schedules and playoff pictures for the 99 girls varsity field hockey teams of
nine leagues in five CIF sections and two regions. Northern California (49 teams): SCVAL, BVAL and
PCAL in the Central Coast Section, MCAL in the North Coast Section and the Northern Section's EAL.
Southern California (50 teams): the Southern Section's Sunset field hockey league and the San Diego
Section's City, North County and Metro conferences. A NorCal/SoCal toggle shows one region at a time,
NorCal by default; the browser remembers the choice, and without JavaScript both regions show.
Teams outside these nine leagues, including the Southern Section's Glendora, Harvard-Westlake and
Thousand Oaks, appear only as opponents (this is the site's scope note, `SITE_SCOPE_NOTE` in
`components/layout/site.ts`). A static Next.js site rebuilt from one JSON
snapshot, refreshed twice a day in season by a scheduled GitHub Actions job. The same source also
builds and serves on vinext (Vite), on Node and as a Cloudflare Worker; see "Deploy notes".

Unofficial. Not affiliated with SCVAL, BVAL, PCAL, MCAL, EAL, the Sunset, City, North County or Metro
leagues, CIF-CCS, CIF-NCS, CIF-NS, CIF-SS, CIF-SDS, the San Diego Field Hockey Officials
Association, MaxPreps or Sports Illustrated. See "Attribution and legal posture" below.

## Leagues and teams

| League | Region | Section | Divisions (teams) | Teams |
|---|---|---|---|---|
| SCVAL — Santa Clara Valley Athletic League | NorCal | CCS | De Anza (7), El Camino (8) | 15 |
| BVAL — Blossom Valley Athletic League | NorCal | CCS | Mt. Hamilton (6), Santa Teresa (6) | 12 |
| PCAL — Pacific Coast Athletic League | NorCal | CCS | one division (7) | 7 |
| MCAL — Marin County Athletic League | NorCal | NCS | one division (9) | 9 |
| EAL — Eastern Athletic League | NorCal | NS | one division (6) | 6 |
| Sunset — Sunset Field Hockey League | SoCal | SS | one division (10) | 10 |
| City — City Conference | SoCal | SDS | City Western (6), City Eastern (6) | 12 |
| North County — North County Conference | SoCal | SDS | Avocado (6), Palomar (7), Valley (6) | 19 |
| Metro — Metro Conference | SoCal | SDS | Metro Mesa (5), Metro South Bay (4) | 9 |

99 teams in all, 49 in Northern California and 50 in Southern California. PCAL, MCAL, EAL and the
Sunset are single-division leagues, so the site shows no division picker and no division label for
them. A San Diego conference is a league here and the Section's leagues are its divisions (the
Section's 2026-27 League Alignment; the division names are ours). Every league fact (ids, MaxPreps
ids, rules, tiebreak chains with their citations, postseason ladders, official sources,
data-quality lists) lives in `lib/leagues.ts`, along with the regions (`REGIONS`, `regionOf`); the
teams live in `lib/registry/{scval,bval,pcal,mcal,eal,sunset,city,north-county,metro}.ts`, assembled
by `lib/teams.ts`. The CCS holds a 16-team championship fed by SCVAL (7 berths), BVAL (4), PCAL (2)
and three at-large berths; the NCS holds no field hockey championship, so MCAL's own six-team
tournament is its postseason; the Northern Section's EAL postseason is the Super Regional (Oct
30-31, the top six qualify, format and site not published), which the site describes and never
draws a bracket for. The Southern Section holds no field hockey playoffs, so a Sunset team's season
ends with its last game (Oct 31 at the latest); the San Diego Section playoffs (Nov 2-14, Open 8,
Division I 12, Division II 12) are placed by the Section from its power rankings, a designated league
champion is guaranteed at least a play-in, and the site states that rule and never projects a seed.
The 2025-26 history covers SCVAL (official PDFs) and BVAL (official
Google Sheet and all-league documents); PCAL, MCAL, EAL, the Sunset, City, North County and Metro are
marked unavailable on the page, with the reason (we found no official 2025-26 final standings: PCAL's
site stops at 2024-25, MCAL posts none of its own, the EAL posts none, no Sunset document exists that we
could find, and the San Diego Section's power rankings are not league standings), and nothing
third-party is shown in their place. MCAL's card links the league's
official 2025 all-league team without reproducing it. Rosters and player stats cover all 99 teams.

The EAL has no schedule or standings document of its own: its rules come from the CIF Northern
Section's Field Hockey Guidelines 2026-28, its league games are the games MaxPreps marks as league
games (as SCVAL's are), and Red Bluff, still a 0-0-0 row in MaxPreps' table, is not fielding a
varsity team in 2026 and is left out. Davis and Bella Vista are Sac-Joaquin Section schools that
play field hockey in the EAL, so the site prints that note wherever it lists the EAL's schools under a
league heading.

None of the four Southern California leagues publishes a schedule, standings or a points rule that we
could find, so the site orders their tables by its own 3-1-0 points and says so on every page. The
Sunset is a field-hockey-only grouping of ten Southern Section schools in Orange, Los Angeles and
Riverside counties (not the all-sports Sunset League); its league games are the games MaxPreps marks as
league games, and there is no round robin, so the site shows games played without "of N". In the San
Diego Section every pair of division-mates is scheduled twice, and a game counts for a division when
both sides are its members, whatever MaxPreps' league flag says (the flag misses many of them). A level
San Diego varsity game is decided by a shootout, as in the EAL. See "How standings are computed".

People pick what they want to see in three ways: a NorCal/SoCal switcher picks the region, the home
page remembers a league (chips and a "Show <league> here" button, applied before first paint, which
also sets its region), and a team finder searches all 99 schools by name, city or mascot and pins one.

## Live routes

Every route is static. Dynamic routes list their params in `generateStaticParams` and set
`dynamicParams = false`, so an unknown param is a 404; nothing reads `searchParams`.

Region scoping: every index page (`/`, `/standings`, `/teams`, `/schedule`, `/playoffs`, `/leaders`,
`/jv`, `/history/2025-26`, `/about`) renders both regions, NorCal first, inside `data-region-scope`
blocks, and shows one after hydration. The region switcher ("NorCal" / "SoCal") sits at the start of
the home page's scope row and directly under the page header elsewhere. An id that a region block
repeats gets `-socal` on the Southern California copy (`#latest-every-league-socal`, `#elo-rating-socal`),
so NorCal's ids are unchanged, and a link to an anchor inside the hidden region opens that region.
Per-league pages show their own region's league chips.

| Route | What it shows |
|---|---|
| `/` | "What just happened in my league, and when is my team's next game?" Find-your-team on a first visit (one finder over all 99, a card grid per region), then one panel per league of the region shown: latest scores, mini standings, next games, teams and the postseason card |
| `/standings` | Every division as a compact full table, grouped region → section → league → division; `#norcal`, `#socal`, `#de-anza`, `#el-camino`, `#bval`, `#mcal`, `#ns`, `#eal`, `#ss`, `#sds`, `#sunset`, `#city`, `#north-county`, `#metro`, `#city-western`, `#palomar` and the other division anchors resolve with no JavaScript. Kept for links; the nav's Teams page carries the same tables |
| `/standings/[league]` | One league's full standings page (9 pages: `scval`, `bval`, `pcal`, `mcal`, `eal`, `sunset`, `city`, `north-county`, `metro`), with PTS, W-L-T, GF/GA/GD, GP, games left and the most points still reachable (the Sunset, with no fixed schedule, shows GP alone); a pill links its JV tables on `/jv` |
| `/jv` | JV standings: every league's JV tables (`#scval`, …; `#de-anza`, … in a multi-division league), computed and unofficial, each shown once enough of its JV league games have a score |
| `/schedule` | A light index: league cards, recent and next game days per region, and one "every game day" list (its game rows region-scoped) whose `#YYYY-MM-DD` rows keep old date links working |
| `/schedule/[league]` | One league's whole season, filterable client-side (9 pages) |
| `/scores/[date]` | One day's scoreboard, grouped by league (one static page per date with a game; OG card per date), then the day's JV games (`#jv`), kept apart from the varsity counts |
| `/game/[id]` | One game's detail page (one static page per game; OG card per game). A game whose score came from si.com has an id like `sblive-123`; one that MaxPreps later published is a stub that links to it |
| `/teams` | Teams and standings: all 99 teams, a search box, and each division's compact standings table (place, team, GP, W-L-T, PTS, the ladder line, a link to the full league table), grouped region → section → league → division. The search filters the tables' rows in place and searches both regions |
| `/teams/[slug]` | One team's record, Elo rating (collapsed, `#elo`, with its place on its own region's board), schedule, results, splits and postseason line, then the school's JV games (`#jv`, kept apart from the varsity counts), its player stats and roster (99 pages, all nine leagues); a player a public page ties to a club gets a club line linking that club's page |
| `/clubs` | "Which clubs do players here play for?" The 16 youth field hockey clubs by region; for each, how many players on the tracked varsity rosters a public page ties to it (current and earlier counted separately) and from which schools, then how a player is matched (`#how-matched`). Only the 49 NorCal teams' schools have been swept for clubs |
| `/clubs/[slug]` | One club (16 pages, a club with no tied player included): what it is, the players from the tracked varsity rosters a public page ties to it, each with a status and the pages it rests on, its teams and programs, and its own roster pages |
| `/commits` | "Who here has committed to play in college, and where?" The players on the tracked varsity rosters (only the 49 NorCal teams' have been swept) a public page says have committed to (or signed with) a college team, in field hockey or any other sport, by class year (`#class-2027`), each with the college, the sport, its level and the pages it rests on; then the colleges (`#colleges`) and how a commitment is matched (`#how-matched`). A team page's roster links each committed player's row |
| `/playoffs` | "Playoffs", one block per region. `#norcal`: the CCS picture (the 16-team field by league, `#scval #bval #pcal`, the SCVAL crossover and BVAL play-in, and the bracket once CCS publishes one), the MCAL pointer and a card for the EAL's Super Regional (`#eal`: dates, the top-six rule and the Guidelines, no bracket). `#socal`: the San Diego Section playoffs (the qualification rule, round dates and links to the Green Book and the power rankings; no bracket and no seed until the Section publishes them after its Oct 31 seeding meeting), with `#city`, `#north-county` and `#metro` cards giving each team's playoff division (I or II), and a `#sunset` card saying the Southern Section holds no field hockey playoffs |
| `/playoffs/[league]` | League tournaments: `/playoffs/mcal` is the MCAL six-team tournament (the only league that has a bracket; `/playoffs/eal`, `/playoffs/sunset` and `/playoffs/city` are 404s) |
| `/leaders` | Season leaders per region (`#schools`, `#players` for NorCal; `#schools-socal`, `#players-socal` for SoCal; and one anchor per board, suffixed the same way): the schools with the best overall and league records, the most goals and fewest allowed per game, the most clean sheets and, last, the highest Elo rating (top 10, `#elo-rating` / `#elo-rating-socal`; one rating scale across all nine leagues), from every final in the snapshot; then the players with the most points, assists, saves and clean sheets, from the coaches' MaxPreps stats (top 10, opening to 25) |
| `/history/2025-26` | Prior-season final standings by league (`#scval #bval #pcal #mcal #eal #sunset #city #north-county #metro`): SCVAL (official PDFs, 15 teams) and BVAL (official sheet, 12 teams) as record-only tables plus all-league awards; the other seven shown as unavailable, with the reason |
| `/about` | Per-league rules (`#rules-scval`, … `#rules-metro`), per-league health (`#health`), sources, the cross-check, every si.com backfill (`#backfills`), how JV games are sourced and shown (`#jv`) and every dropped contest (`#dropped`) |

Every prerendered game, date, team and league page also has a generated `opengraph-image` route
(the clubs pages take the site's root card), and the site publishes `sitemap.xml`, `robots.txt` and
a web manifest (`app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts`). The phone tab bar has five
tabs (Home, Scores, Teams, Leaders, Playoffs) and the desktop nav seven links (Home, Schedule,
Teams, Leaders, Playoffs, History, About): the standings live on the Teams page, and Teams stays lit
on every `/standings` page. After hydration Scores, Teams and Playoffs follow the league you are
looking at or have chosen (Teams to that league's tables, `/teams#<league>`). `/clubs` is in
neither: it is linked from `/teams`, from the Roster section of every team page and from `/about`.
Nor is `/commits`: it is linked from `/teams`, from `/about` and from the roster of every team page
with a committed player.

## How data flows

```
MaxPreps ghost API    ──┐
si.com (SBLive)       ──┤
scval.com PDFs (live) ──┼──► scripts/fetch-data.ts ──► data/snapshot.json ──► next build ──► static site
data/official/*.json  ──┤     (lib/pipeline/*)         data/snapshot.meta.json   or vite build (vinext)
cifccs.org / VNN .ics ──┘
```

1. **`scripts/fetch-data.ts`** is the cron entry point, a thin CLI over `lib/pipeline/` (see
   `docs/DATA-SOURCES.md` for every endpoint, JSON path and gotcha). It runs a **128-request
   MaxPreps sweep**: 1 bootstrap, 14 league metadata checks, 14 standings tables and 99 team
   schedules, at most 3 at a time and at least 500 ms apart. There are 15 divisions, but North
   County's Valley division has no MaxPreps table, so its metadata and table are never requested
   (never a `/leagues/null/v1` URL) and its cross-check is reported as skipped. Failures are scoped, so one league
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
   upstream by hash, never applying a change on its own. The EAL has no official schedule at all:
   its league games are the games MaxPreps marks as league games, and "a league result is missing"
   means a game MaxPreps counts for the league, dated before today, with no counted result (the
   umpires' grid for the EAL, which equalled MaxPreps' 30 league games on 2026-10-04, is a
   cross-check only and is never called official). The four Southern California leagues have none
   either: a Sunset league game is one MaxPreps marks as a league game, and a San Diego division game
   is one between two members of the division (the Section's 2026-27 League Alignment), whatever
   MaxPreps' flag says. Secondary sources (si.com, the two VNN
   `.ics` feeds, the CCS calendar and bracket poll) are optional and failure-tolerant.
2. It writes **`data/snapshot.json`** (the full normalized `Team[]`/`Game[]`/`Standing[]`/
   per-league health/dropped contests/`SourceStatus[]`) and **`data/snapshot.meta.json`**
   (counts, timestamps, a per-league summary: what the update-data workflow uses for its commit
   message and job summary).
3. **`next build`** (or `vite build` under vinext) reads the `data/` JSON files the read APIs
   import (`data/snapshot.json` via `lib/data.ts`, plus the files listed under "Local
   development") and prerenders every route — there is no request-time fetch, no database and no
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
writing anything. Right after `fetch-data` it runs `pnpm fetch-player-stats` (all 99 teams; see
"Player stats" below) and then `pnpm fetch-jv` (see "JV games" below), each allowed to fail without
stopping the run. It runs the test suite against what it just wrote; if the suite fails, it tests
again without this run's `data/jv.json`, then (keeping the new JV file) without this run's
`data/player-stats.json`, and only then without either, so a JV or stats file the tests refuse never
blocks the snapshot commit and never costs the other file's refresh (the job Summary says when a file
was restored). It then commits `data/snapshot.json` +
`data/snapshot.meta.json`, `data/player-stats.json` and `data/jv.json` **only where they changed**,
in one commit. The commit is what triggers
your hosting provider's rebuild — that's the entire point of the job, so it deliberately does not
carry `[skip ci]`. The job fails, and commits nothing, only on a run abort; a frozen or partial
league still publishes (with its reasons on the site). After a successful run it opens or updates
one issue per official schedule revised upstream and one per league frozen in this run and the
previous one, never more than one open issue per title.

A manual **Run workflow** (`workflow_dispatch`) takes the same switches as inputs: `force` (run
outside the season window), `skip_sblive` (`--no-sblive`), `leagues` (`--leagues`) and
`accept_regression` (`--accept-regression`, for a finals drop you have checked is real). Its test
step does not set `CI_GATE`, so the home page's teamViews budget only warns there; `ci.yml` sets
`CI_GATE` and fails past 118 KiB (the 99 views measured 107,545 bytes on 2026-10-06).

For this to work on a deployed copy of this repo:
1. **Push the repo to GitHub** with Actions enabled.
2. Under **Settings → Actions → General → Workflow permissions**, select **"Read and write
   permissions"** (the job needs `contents: write` to commit the refreshed snapshot back to the
   branch — already declared in the workflow, but the repo-level default must allow it).
3. Connect your host (see "Deploy notes") to redeploy automatically on push to `main` — most
   static hosts do this without any extra configuration once the repo is linked.

### Self-hosting the cron

If you're not using GitHub Actions, run the same commands (`fetch-player-stats` and `fetch-jv` are
optional, hence `|| true`) from any scheduler that can reach the internet on your host, twice a day
during the season:

```cron
0 7,22 * 8-11 * cd /path/to/scvalfh && pnpm fetch-data && (pnpm fetch-player-stats || true) && (pnpm fetch-jv || true) && pnpm build
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
| `--out <path>`, `--dry-run`, `--fetched-at <iso>` | write elsewhere; validate and report without writing (captures included); pin the run's stamp |
| `--force` | bypass the Aug 1 - Nov 30 season-window guard |
| `--no-sblive`, `--sblive-full` | skip si.com; or also read every si.com team page (manual, never the cron default) |
| `--no-official` (alias `--no-scval`), `--no-ccs`, `--no-vnn` | skip individual secondary sources |

The fetch scripts (`fetch-data`, the other `fetch-*` scripts, `build-history` and
`discover-season`) identify themselves with one descriptive User-Agent that carries a contact
address (`POLITE_USER_AGENT` in `lib/sources/http.ts`; si.com, which refuses a non-browser one, gets
a browser User-Agent instead). Set `SCVAL_CONTACT=<email>` in the scripts' environment to put your
own deployment's address there. Only the scripts read it, at fetch time: it is not a build-time
file override, and the build and the site never use it.

### Corpus and capture

`tests/fixtures/corpus/all-2026-10-02/` is a recorded copy of one real run: every MaxPreps
response for all four leagues, the si.com pages that matter, the SCVAL PDF texts and the official
revision hashes, with a `manifest.json` naming each file. `pnpm fetch-data --fixtures
tests/fixtures/corpus/all-2026-10-02 --out /tmp/x.json` rebuilds a whole snapshot from it with no
network, and `tests/fixtures/corpus/variants/` holds overlays for the failure cases (a league on
the wrong season, an empty table, a 503 feed, a revised official schedule, a finals regression,
MCAL postseason games). It was not extended for the EAL: under it the EAL is "not fetched in this
run". `tests/fixtures/corpus/eal-2026-10-04/` is a second corpus, captured live on 2026-10-04 with
`--leagues eal` (19 files, 9 MaxPreps and 9 si.com requests), that drives the EAL's pipeline and view
tests and a second copy-honesty pass (`EAL_CORPUS` in `tests/helpers.ts`).
`tests/fixtures/corpus/socal-2026-10-06/` is a third, captured live on 2026-10-06 with `--leagues
sunset,city,north-county,metro --no-official --no-ccs --no-vnn` (65 MaxPreps requests: 1 + 2 × 7 + 50;
8.2 MB), that drives `tests/pipeline/socal.test.ts`: Valley's skipped table, the membership counts per
division, Mission Bay's cross-division games and the eight San Diego shootout finals. Tests that assert
league-specific values build their snapshot from a corpus
(`corpusSnapshotPath('all-2026-10-02')` in `tests/helpers.ts`); tests over the bundled
`data/snapshot.json` assert invariants only, because that file changes every run.
`tests/fixtures/corpus/variants/finals-regression/previous-snapshot.json` is frozen as a four-league
file, so the pipeline tests keep proving that a snapshot written before a league existed loads.

To make a new corpus, run `pnpm fetch-data --capture tests/fixtures/corpus/<name>` once on a
workstation; it is a normal live run that also writes each response and the manifest. Capturing
is the only reason to run a live fetch by hand.

### Official fixtures

The EAL and the four Southern California leagues publish none, so they have no bundled file. BVAL, PCAL and MCAL publish their schedules as
documents, so their league fixtures are bundled in
`data/official/{bval,pcal,mcal}-2026.json`, written by `pnpm build-official-fixtures` from the
transcriptions under `tests/fixtures/official/source/` and never hand-edited (`pnpm
build-official-fixtures --check` exits 1 if a file differs). The cron compares each document's hash
with the bundled one; a difference is published as a "revised upstream" reason and an issue, and the
bundled fixtures are still used until someone re-transcribes them (the runbook is in
`docs/DATA-SOURCES.md`).

### Rosters

`data/rosters.json` holds every team's player list — name, jersey number, grade, position(s),
height and captain flag, whatever the coach entered on MaxPreps — built by `pnpm fetch-rosters`
from the 99 MaxPreps roster pages (every registry team, all nine leagues; one entry per team) and
committed, like the history file, rather than refreshed by the cron (rosters change a few times a
season; run it by hand or weekly). The page encodes each athlete as a 37-element positional array, so
`lib/sources/maxpreps-roster.ts` decodes it with MaxPreps' own column list and cross-checks every
row against the page's rendered table, failing the team rather than publishing a wrong grade beside
a name. Blanks are `null`, never guessed; soft-deleted rows are dropped; a team whose fetch fails
keeps its previous rows with `status: "carried-forward"`. Failures are scoped to the team, and
`--leagues scval,bval` scopes a run to leagues, as `fetch-data --leagues` does: a league outside the
run keeps its previous rows, and one league failing never stops another being read. A team no run
has covered yet is `status: "pending"` (nothing fetched, nothing claimed): the file was seeded that
way for BVAL, PCAL and MCAL until the first run read them. The previous file is salvaged row by
row: a row that no longer validates on its own (a slug gone from the registry, a changed id or
division, a broken status) is dropped and named in the log, and that team alone has nothing to
keep: `pending` if the run does not cover it (the league line says so and the run exits 1), `error`
if the run covers it and the fetch fails. A previous file from another season is ignored as if
absent (last season's rows are never kept or carried forward), and one that is not JSON stops the
run: exit 1, nothing written. A file with fewer teams than the registry still counts; the teams it
lacks are pending.

`data/rosters-enrichment.json` is what other public sources add to that — the schools' own
athletics-site rosters, one roster PDF, school and local papers, MaxPreps career and JV pages —
gathered by hand and joined on the MaxPreps athlete id. It has one entry per team (99): SCVAL was
swept on 2026-10-02 and BVAL, PCAL and MCAL on 2026-10-03; the six EAL entries (2026-10-04) hold
recruiting profiles only, with no coaches or sources, until someone sweeps the schools' athletics
sites; the 50 Southern California entries (2026-10-06) are stubs that say nothing has been swept, so
those teams' pages say we have not checked other public sources. On 2026-10-06 `data/rosters.json`
holds 1,617 players, on 84 of the 99 teams. Every entry lists
what was looked at. What a team with no MaxPreps players may say about other sources is recorded
per team (`otherRosters`: `none`, or `partial` with what the source lists and a link, as for Marin
Academy's first-name-and-initial list); a team without it says "we have not checked other public
sources" rather than claim there are none. It only ever fills a blank; where a source disagrees
with MaxPreps, MaxPreps stays and the disagreement is recorded; where sources disagree with each
other on a grade MaxPreps leaves blank, the grade stays blank and each source is recorded the same
way, under the player's `conflicts`. Every value carries its source URL, kind and a confidence. `lib/rosters.ts` is the read API:
`getTeamRoster(slug)` is MaxPreps alone, `getEnrichedTeamRoster(slug)` the merged view with
per-field provenance, conflicts and coaches, `sortedPlayers(team)` the display order. Every team
page, in all nine leagues, renders it in a Roster section (`components/teams/TeamRoster.tsx`,
built by `components/teams/roster-view.ts`): varsity only, a † on every value that did not come
from MaxPreps, the coaches, every recorded disagreement and a link to each source. A team with no
list says why instead of showing an empty card: MaxPreps lists no players, the last update failed
with nothing to fall back on, or no update has covered the team yet; its coaches and their sources
still show below.

The same overlay links players' own recruiting pages — NCSA, SportsRecruits and Hudl
profiles (`profiles` on each record; 132 for 112 players as of 2026-10-04: SCVAL 70 for 56, BVAL 12
for 12, PCAL 3 for 3, MCAL 14 for 12, EAL 33 for 29 (Chico 16 for 13, Pleasant Valley 11 for 11, Davis
5 for 4, Lassen 1 for 1; none for Bella Vista or Corning); 23 NCSA, 58 SportsRecruits, 51 Hudl). A page is linked only when it names the player and field hockey and either names the school
or shows the class year the roster shows plus a California hometown, and a stated class year must
agree with the row's grade (checked at load). The roster shows them as a line of links under the
player's facts. Recall is partial: see `docs/DATA-SOURCES.md` §1.1j, which also has the column map,
the per-school sources and the overlay's rules.

```bash
pnpm fetch-rosters                                      # live: 99 roster pages → data/rosters.json
pnpm fetch-rosters --leagues bval,pcal                  # only these leagues; the others keep their rows
pnpm fetch-rosters --fixtures tests/fixtures/maxpreps   # offline, from the captured pages (SCVAL's: add --leagues scval)
pnpm fetch-rosters --capture <dir>                      # live, and save each page read as <dir>/roster-<slug>.html
pnpm fetch-rosters --dry-run                            # parse and report, write nothing
```

### Player stats

All nine leagues, like the rosters it joins to: `fetch-player-stats` iterates the 99-team registry,
and every team page has a Player stats section.

`data/player-stats.json` holds each team's season player stats as the coach entered them on
MaxPreps — games, goals, assists, points, and where the coach tracks them shots, shots on goal,
game-winning goals, steals, minutes and goalkeeping — built by `pnpm fetch-player-stats` from the
JSON behind each team's MaxPreps `/stats/` page and joined to `data/rosters.json` on the career id
in each row's player link. A stat is kept only where the team tracks it (its team total is above
zero and at least one player holds some of it), so a 0 is a real zero and an untracked stat is null; per-game and percentage columns are
dropped. On 2026-10-03, 28 of the 43 teams had published stats (312 players, 41 goalkeepers: SCVAL 10 of
15 teams, BVAL 8 of 12, PCAL 3 of 7, MCAL 7 of 9); on 2026-10-04, with the six EAL teams, 33 of the 49
(404 players, 63 goalkeepers; five EAL teams, Corning none); on 2026-10-06, with the 50 Southern
California teams, 62 of the 99 (758 players); where MaxPreps answers "No data was found" the file says `status: "none"`, and a team no
run has covered yet is `status: "pending"`. `lib/player-stats.ts` is the read API; each team page
renders it in a Player stats section (`components/teams/TeamPlayerStats.tsx`, built by
`components/teams/player-stats-view.ts`), which says when MaxPreps last updated and how many games
the team has played since. See `docs/DATA-SOURCES.md` §1.1k.

The same file feeds the player boards on `/leaders` (`components/leaders/leaders-view.ts`): most
points, assists, saves and clean sheets (MaxPreps' goalkeeper "shutouts"), one set of boards per
region.
A player can only appear where the coach tracks that stat, so each board says how many teams it
covers and names the ones it leaves out, a 0 never makes a board, and the page names every team
with no stats and every team whose totals are behind its finals (the team page's "games since"
rule, shared through `gamesSinceUpdate`). The school boards on the same page come from the snapshot
instead and cover all 99 teams, again per region: overall and league records are the `Standing` rows the standings
print, clean sheets and goals per game are counted from the finals with forfeits left out, and a
record or a rate needs at least half the median team's number of results (the teams below that
are named). Boards rank 1, 2, 2, 4 and list up to 10th place with every row tied for it; a player
board opens to 25th the same way.

Stats change after every game, so `update-data.yml` runs this twice a day in season, right after
`fetch-data`, and commits the file with the snapshot when it changed. A failed stats fetch never
stops the score refresh: the step may fail, and a team whose call failed keeps its previous rows
(`carried-forward`). When nothing but the run's stamp would change, the script leaves the file
exactly as it was, so there is nothing to commit. Like `fetch-data`, it writes nothing outside the
Aug 1 - Nov 30 Pacific window unless given `--force`, and takes `--leagues` (a league outside the run
keeps its previous rows; the workflow's manual `leagues` input reaches it too). Failures are scoped
to the team: one league's outage never blocks another league's stats, and the previous file is
salvaged row by row exactly as for rosters. The run exits 1, still writing the file, when a team it
covered failed or a team outside it lost its previous row. The call volume is the MaxPreps client's own
(≤3 concurrent, ≥500 ms between starts): 99 small calls (about 25 seconds when it was 43).

```bash
pnpm fetch-player-stats                                      # live: 99 rollups → data/player-stats.json
pnpm fetch-player-stats --leagues bval,pcal                  # only these leagues; the others keep their rows
pnpm fetch-player-stats --fixtures tests/fixtures/maxpreps   # offline, from the captured JSON (SCVAL's: add --leagues scval)
pnpm fetch-player-stats --capture <dir>                      # live, and save each response body, as received, as <dir>/stats-<slug>.json
pnpm fetch-player-stats --dry-run                            # parse and report, write nothing
```

### JV games

Every team page has a "JV games" section (`#jv`) and every day page a JV block after the varsity
games: the school's junior varsity games, **kept apart from varsity**. No varsity standings table,
record, form strip, leader board, Elo rating or postseason picture reads them; they have JV tables
of their own on `/jv` (see "JV standings" below), and a team page's JV header names the team's JV
place when its table is shown and links it.

#### JV standings

`lib/jv-standings.ts` builds one JV table per division, in three steps, and `/jv` prints them, one
section per league (`app/jv/page.tsx`, `components/standings/JvStandings.tsx`, built by
`components/standings/jv-standings-view.ts`). They are a page of their own, linked from each
`/standings/<league>` page and from team pages, because the SCVAL standings page is at its weight
budget and the JV tables are a different kind of claim, stated once at the top of `/jv`:

- **Which JV games are league games.** MaxPreps' JV league flag (`contestType`) is not usable (it
  disagrees with the varsity game of the same day and pairing on 116 of 200 such games), so a JV game
  takes the classification of its varsity counterpart, the varsity game between the same two schools
  within ±3 days (the nearest; two equally near decide nothing): it counts for that division's JV table
  when the varsity game counts for its varsity table, and is non-league when the varsity game is. With
  no varsity game, a fixture on the league's official schedule that no varsity contest matched counts
  the same way. A game between two schools of different divisions, or against a school outside the
  registry, is non-league; one between two schools of one division with no counterpart at all is not
  counted and is named under the table. JV rows carry the matching league or NL chip; an uncounted
  game carries none. On 2026-10-05: 197 league games (195 by varsity game, 2 by official fixture), 70
  non-league, 5 uncounted.
- **How a table is ordered.** On 3 points a win and 1 a tie (the league's own points in the five
  NorCal leagues; the Southern California leagues publish none, so it is this site's 3-1-0), which is how
  SCVAL ordered its published 2025-26 JV tables. No league publishes a JV tiebreak, so teams level on
  points share a place. A school is in the table when it has at least one JV league game; a school
  with none is named under it.
- **When a table is shown.** Only once 60% of the division's JV league games already played (final,
  or dated before the file's day and not postponed) have a score (`JV_STANDINGS_MIN_REPORTED_SHARE`),
  so a table never ranks teams on whichever coaches enter scores; otherwise the page says how many do.
  On 2026-10-05: El Camino 12 of 18, MCAL 36 of 45 and the EAL 13 of 16 are shown; De Anza (8 of 16),
  Mt. Hamilton (0 of 4) and PCAL (7 of 15, all si.com's) are not; no Santa Teresa school has a JV league
  game.

`data/jv.json` is built by `pnpm fetch-jv` (`scripts/fetch-jv.ts`) from two sources, and keeps what
each said:

- **MaxPreps** (`games`): the same `schedule-calculated` call as the varsity feed, with the JV
  season id (`JV_SPORT_SEASON_ID` in `lib/season.ts`, read from `maxpreps.com/ca/field-hockey/jv/`)
  and the school's own registry id; each row becomes a `Game` through `lib/normalize.ts`, exactly
  as a varsity row does, except that a level JV final is never read as a shootout win (the San
  Diego shootout procedure is varsity only). On 2026-10-05: 260 games for 45 of the 49 schools, 91
  with a score (Del Mar, Live Oak, Sobrato and Silver Creek have none). On 2026-10-06, with the
  Southern California schools: 531 games for 91 of the 99, 208 of them final.
- **si.com** (`sblive`): each school's JV team page (98 schools; Marin Academy has no si.com page),
  scored finals only. A JV side is one of ours only by its si.com JV team id (`lib/jv-teams.ts`,
  read from each varsity page's level switcher), never by name.

What the pages show is `mergeJv` (`lib/jv-merge.ts`) over the two, decided again on every build
from the file's own `fetchedAt`. **MaxPreps comes first**; si.com only supplements it, for a game
between two registry schools matched by pair and date (±1 day): it fills a past game MaxPreps has no
score for, and adds a game MaxPreps does not list when MaxPreps has no JV game of that pair within
±14 days (both marked †, as a varsity backfill is); where the two disagree on a final, MaxPreps'
score stays and si.com's is noted under the row. A game si.com lists twice with different scores,
or two si.com games equally near one MaxPreps game, is never used. On 2026-10-05 si.com filled 7
scores, added 12 games (mostly PCAL, where MaxPreps had one JV score) and disagreed on 3.
`lib/jv.ts` is the read API; `components/teams/jv-view.ts` builds both lists
(`components/teams/TeamJvGames.tsx`, `components/schedule/JvDayGames.tsx`).

`update-data.yml` runs it after `fetch-player-stats`, on the same terms: it may fail without
stopping the run, writes nothing outside the season window unless `--force`, leaves the file alone
when only its stamps would change, takes `--leagues`, and scopes failures to the team and the
source (a failed MaxPreps feed or si.com page keeps that school's previous rows, `carried-forward`).
Cost per run: 99 small MaxPreps calls through the MaxPreps client's gate and up to 98 si.com pages,
one at a time, 1 s apart (about a minute for the 48 NorCal pages; the 98 now take at least 98 seconds of that spacing alone). A day page exists only for a date with a varsity game, so
a JV-only date (Aug 18 in 2026) is on the team pages alone.

```bash
pnpm fetch-jv                                   # live: 99 MaxPreps JV feeds + 98 si.com JV pages → data/jv.json
pnpm fetch-jv --leagues bval,pcal               # only these leagues; the others keep their rows
pnpm fetch-jv --no-sblive                       # MaxPreps only; si.com rows are carried
pnpm fetch-jv --fixtures tests/fixtures/jv --leagues pcal   # offline, from the PCAL captures
pnpm fetch-jv --capture <dir>                   # live, and save every response as <dir>/jv-sched-<slug>.json / jv-sblive-<slug>.html
pnpm fetch-jv --dry-run                         # parse and report, write nothing
```

### Clubs

`data/clubs.json` holds the youth field hockey clubs around the 43 schools swept on 2026-10-03, plus any other club a
rostered player is tied to, plus three clubs met near the EAL teams' schools on 2026-10-04 (D-City in Davis and
Roseville FHC, in the Sacramento area, and Chico Hotshots, in the North State; neither area was searched for every
club), and the ties themselves: which players on the tracked varsity rosters
a public page ties to which club (`affiliations`, joined to `data/rosters.json` on team slug +
MaxPreps athleteId). A club record has its name and the shorter name the site shows, city, region,
website, founding year, one factual sentence, the teams and programs it lists (each with the page
it was read from), its own public roster pages and its sources. It names no individual: no
coaches, no directors. An affiliation has the club team when a source gives one, a `status`
(`current`, `past` or `unknown`) with the date or season the source gives (`asOf`), a
`confidence` (`high` or `medium`), and its sources: URL, kind, a verbatim quote of at most 300
characters, and the school, class year and date the page states. `basis` says, for maintainers,
what the match rests on.

The rules:
- **The linking rule is the recruiting-profile rule** (see "Rosters"): a public page must name the
  player and a field hockey club, and either name the player's high school, or give a class year
  that agrees with the roster grade together with a Northern California location. A name alone
  never makes a match, and a class year that disagrees rules one out. Lacrosse, soccer and ice
  hockey clubs do not count.
- **Only players already on the tracked varsity rosters are named** (rows the overlay marks JV
  are out), each under the roster's own spelling. A club's own roster lists many more players; the
  club's page links that roster instead of naming them.
- **Quotes and bases are kept, never rendered.** A page shows each source as a link labelled by
  its kind and host ("SportsRecruits profile", "club roster", "Gilroy Dispatch").
  `pnpm assert:copy` fails the build if any built page shows a basis, a quote fragment, or an
  excerpt of one whose text is not just public names (`affiliationLeaks` in `scripts/copy-rules.ts`,
  with `scripts/public-terms.ts`), because both can name people who are not on the rosters.
- **No social media**: no source or website on Instagram, Facebook, TikTok, X (Twitter), Threads,
  YouTube, Snapchat or LinkedIn, or their short links (`BANNED_HOSTS` in `lib/clubs-schema.ts`),
  and every URL is https.
- **`unknown` is never called current.** A club a source names without saying whether the player
  is still with it reads "Listed by NCSA, 2025" (the date or season the source gives) on the club
  page and "Listed club" on the roster; a `past` one reads "Earlier".

Checked at load, so a bad file fails `pnpm test` and the build (`lib/clubs-schema.ts`, then the
join in `lib/clubs.ts`): club slugs are unique, every affiliation names a club, and
(team, athlete, club) is unique; https only, never social media; at least one source per club and
per affiliation; `asOf` is a date, a month, a year, a season (`2025-26`) or a range (`2015-2018`);
the file's `season` is `data/rosters.json`'s; every affiliation joins a row of that team under the
row's own `fullName`, and the row is not JV; every stated class year agrees with the row's grade
(MaxPreps', else the overlay's; a row with no grade has nothing to check).

Coverage, counted from the file: **16 clubs** (San Francisco 2, South Bay 7, East Bay 2, Marin 1, the
Sacramento area 2, the North State 1, and HTC, a Connecticut club whose California program trains in La
Jolla; none on the Peninsula or the Central Coast, both searched; the Sacramento area and the North State
were not searched for every club) and **94 affiliations for 80 of the 811 varsity rows, at 25 of the 49
NorCal schools**. The 50 Southern California teams' schools, added on 2026-10-06, have not been swept,
so none of their players has a club line yet. The 2026-10-03 sweep made 72 of them, for 66 of the 716 varsity rows at 22 of the 43 schools:
SCVAL 33 players at 12 schools, BVAL 16 at 6, MCAL 17 at 4, PCAL none. By status, 55 of those 72 are
current, 11 past and 6 unknown; by confidence, 57 are high and 15 medium. The schools of the six EAL
teams were swept on 2026-10-04 with the same rule. That sweep added eight affiliations for five players,
at Davis and Pleasant Valley. Three Davis players are tied to NorCal Impact (current, the NFHCA's
2026-08-27 watchlist) and to D-City (two `unknown` from the 2025 watchlist, which the 2026 one
contradicts, and one `past` from the player's own NCSA profile). Two Pleasant Valley players are tied to
Chico Hotshots (current, from the club-teams block of their own MaxPreps career pages). The sweep also
added three club records for clubs it met: D-City (Davis), Roseville FHC and Chico Hotshots. On
2026-10-05 every linked recruiting profile was re-read for the clubs it lists (SportsRecruits pages in a
browser, since their club block is rendered by script, and NCSA pages), which added 14 ties for 13
players whose own profile lists a club the file did not tie them to, all to clubs already in the file.
All 94 split 71 current, 13 past and 10 unknown, and 79 high and 15 medium. Thirteen players are tied to
more than one club. The ties rest on 251 source entries on 118 distinct URLs (229 on 105 for the
2026-10-03 sweep, 237 on 108 with 2026-10-04's). An entry is one page backing one tie, so a club roster, a watchlist or a news story counts once
for every player it names. The URLs are 116 pages, because two are cited under two URLs each: Stick
Together's 2025 all-league page with and without its trailing slash, and Gabrielle Moll's MaxPreps career
page under two name slugs. By kind, entries then URLs: SportsRecruits 67 on 43, club sites 49 on 11,
news 34 on 6, event lists 31 on 3 (the NFHCA's 2025 and 2026 high school watchlists, and one MAX Field
Hockey invitational), NCSA 29 on 25, other 19 on 9 (mostly MAX Field Hockey's club and school pages),
MaxPreps career pages 19 on 19, school sites 2 on 2, and one Hudl profile. Nine clubs have tied
players: SF Hawks 32 (all current), NorCal Impact 25 (all current), Fly FHC 13, Infinity 9, Chico
Hotshots 5 (4 current), D-City 4 (none current), Lightning 3, HTC 2 (both current) and Golden Gate
Rippers 1 (past). The other seven (Pac Heights, Performance Field Hockey, San Jose Khalsa, Stryker,
Hayward Hawks, Lions and Roseville FHC) have a page with an empty state.

**It is research, not a script.** Like the roster overlay, it was gathered by hand from club
directories, the clubs' own sites, recruiting profiles, MaxPreps career pages, the NFHCA's high
school watchlists, MAX Field Hockey's club pages and local news. Every tie of the 2026-10-03 sweep
was checked twice that day: a checker re-opened each source, then an independent refuter tried to
break the match. The eight ties the 2026-10-04 EAL sweep added were each confirmed by two
independent checks that re-opened their sources, and so were the 14 ties of the 2026-10-05
recruiting-profile pass (the pass itself, then an independent refuter).
Nothing refreshes it, and re-running it is research. Recall is partial: see `docs/DATA-SOURCES.md`
§1.1j2 for the sources, the gotchas and the count by school.

**When a roster refetch breaks it.** `lib/clubs.ts` throws at import if `pnpm fetch-rosters` drops
or respells a tied player's row, if the overlay marks that row JV, or if a season rollover moves
`data/rosters.json` to a season `data/clubs.json` is not for; `pnpm test` and the build then fail
with `clubs: <team> / <player> (<club>): <what>`. Re-check that affiliation's sources, then edit or
drop it by hand (on a rollover, redo the research for the new season). Never prune it
automatically.

`lib/clubs.ts` is the read API: `getClubs()` and `getClubSlugs()` in display order (region, then
most tied players, then name), `getClub(slug)`, `getClubAffiliations(slug)`,
`getTeamClubAffiliations(team)` and `getPlayerClubs(team, athleteId)` (current, then listed, then
earlier). `components/clubs/club-view.ts` builds every view and chooses every word the pages say
about a tie. The gates know the pages: `assert:prerender` and `assert-vinext-prerender.ts` expect
`clubs/<slug>` for exactly the file's slugs, `smoke-server.sh` counts them in the sitemap and
expects `/clubs/nope` to be a 404, and `a11y-axe.mjs` checks `/clubs`, the first club page and the
first club page with no tied player.

### College commitments

`data/commits.json` holds which players on the tracked varsity rosters a public page says have
committed to play a sport in college (field hockey, or any other), and those colleges. A commitment
(`commitments`, joined to `data/rosters.json` on team slug + MaxPreps athleteId, one per player) has
the college, the `sport`, a `status` (`committed`, or `signed` only where a source says so), `asOf` (the earliest date a kept
source gives for it: a day, a month or a year, never after `capturedAt`), a `confidence` (`high` or
`medium`) and its sources: URL, kind, a verbatim quote of at most 300 characters, and the school,
class year and date the page states. `basis` says, for maintainers, what the match rests on. A
college record (`colleges`) has its name and display name, city and state, one `programs` entry per
sport a player here committed to it in (the NCAA division, or NAIA, that team plays in, its
conference and its page on the college's athletics site: a college's teams can sit in different
divisions and conferences), and the pages each fact was read from; the file holds only colleges and
programs somebody committed to.

The rules are the clubs' (see "Clubs"): the same linking rule (the page names the player and the
college in the context of one sport, and either the high school, or a class year that agrees with the
roster grade plus a Northern California location), the same privacy posture (only tracked varsity
rows, by the roster's spelling; quotes and bases kept, never rendered, and `pnpm assert:copy` fails
on a leak through `commitmentLeaks` in `scripts/copy-rules.ts`), and no social media, which costs
more here: many commitments are announced only on Instagram, and those are not listed. College
interests, offers, visits, camps and watchlists are not commitments, and neither is a place on a
college's club team. A commitment in another sport counts (since 2026-10-04): the site is about
field hockey, but its players commit to lacrosse, soccer and other college teams too, and every
page names the sport.

Checked at load (`lib/commits-schema.ts`, then the join in `lib/commits.ts`): college slugs are
unique, every commitment names a college that has a program in its sport, every college and every
program has a commitment, a college has one program per sport, one commitment per player; https only, never social media; a source for every college and commitment; the file's
`season` is `data/rosters.json`'s; every commitment joins a non-JV row of that team under its own
`fullName`; every stated class year agrees with the row's grade, or, for a row with no grade, the
sources agree with each other on a class a high school roster of the season can hold.

Coverage on 2026-10-04, counted from the file (the six EAL teams' schools were swept the same day for
field hockey commitments and then in the every-sport round, and none was found): **16 commitments,
16 players at 9 of the 49 schools, to 14 colleges (15 programs).** The 50 Southern California teams'
schools, added on 2026-10-06, have not been swept, so none of their players has a commitment line yet. By sport, 7 in field hockey, 7
in lacrosse, 1 in soccer (St. Lawrence) and 1 in basketball (Bryn Mawr). SCVAL 9 (St. Ignatius 6, Los Altos, Saint Francis and Saratoga 1
each), BVAL 2 (Christopher), PCAL 1 (Stevenson), MCAL 4 (Redwood 2, Berkeley, Marin Catholic), EAL none. By class
13 from 2027 and 3 from 2028; by level 9 to NCAA Division I programs, 1 to Division II and 6 to
Division III. The field hockey seven: UC Davis 2, Colgate, Iowa (Division I), Maryville (II), Bates
and Ithaca (III); the lacrosse seven: Cal, San Diego State, Marist, Bucknell and UC Davis (I),
Trinity and Vassar (III). UC Davis is the one college with two programs here, field hockey in the
MPSF and lacrosse in the Big 12. All are `committed`: no source said any player had signed. 15 are
high confidence and 1 medium (a single line on a compiled class list, matched by class year and a
Gilroy club). Seven carry a date (Feb 2026, Feb 4, Apr 23 twice, Aug 6, Sep 18 and Oct 1, 2026).
They rest on 43 source entries on 36 URLs: SportsRecruits 23 (fourteen of the players' own profiles
and nine of SportsRecruits' college pages), news 7 on 6 URLs (two Stick Together issues, The Talon,
two Marin IJ stories and The Saratoga Falcon), club sites 7 on 3 (the SF Hawks table, STEPS
California's and ADVNC Lacrosse's commitment pages), compiled lists 5 on 3 (FH College Path's class
lists and Lacrosse Masters) and St. Ignatius's athletics site 1.

**It is research, not a script.** Fourteen sweeps ran on 2026-10-03: four by source family
(commitment lists and recruiting aggregators; NorCal clubs and field hockey media; school and local
news for SCVAL and BVAL, then for MCAL and PCAL) and ten player by player, which looked up 609
players on the 37 teams with roster rows: every junior, senior and ungraded row, and any younger
player with a linked recruiting profile. They converged on the same seven
candidates, each found by two to five of them. Every candidate was then re-opened by a checker and,
independently, by a refuter trying to break it; all seven survived, and only sources both passes
confirmed were kept. A completeness critic read every sweep's coverage and planned five follow-ups
(unread club commitment lists, unopened NCSA and Hudl profiles, school sites that had failed, the
watchlisted seniors, and one spreadsheet lead), which found no new commitment and two more dated
sources for existing ones (St. Ignatius athletics' Oct 1 report and a Feb 4 Stick Together issue),
each kept only after a hand re-read and a final audit that re-opened every source in the file.
A second round on 2026-10-04 widened the rule to any sport and swept again for field hockey: every
"Committed Athletes" entry on SportsRecruits' field hockey, lacrosse and soccer college pages (with
the California profiles behind them), a SportsRecruits profile probe and a search of its athlete
index for all 716 rows on the 43 teams then tracked, the field hockey, lacrosse and soccer commitment lists and databases, every
2025-26 story on 18 student papers and 8 local papers, and the club-tied players one by one. It found nine commitments in other sports
and no new field hockey one that meets the rule; a checker and an independent refuter re-opened each
(both kept the nine, and the refuter dropped a field hockey "planning to continue" that is a plan,
not a commitment), and a final audit found every quote in the file on its page. Later that day the
round was taken to the six EAL teams' schools, whose 95 rows had been swept for field hockey only:
the same field hockey, lacrosse and soccer college pages and lists, ClubLax, TopDrawerSoccer and
SoccerWire, NorCal club lists in five sports, a search of each of the 95 names since January 2025
on five local papers' sites (the first 20 results on four of them) with full crawls of two papers'
high school sections, two student papers, and two web searches for each junior and senior; the same
day's recruiting-profiles research ran a SportsRecruits profile probe for all 95 in every sport and
NCSA and FieldLevel probes for field hockey. It found no commitment in any sport; SportsRecruits'
athlete search was not run for these rows and their freshmen and sophomores got no web searches, so
EAL recall is lower than the other leagues'. Recall is partial: see `docs/DATA-SOURCES.md` §1.1j3
for the sources, what was rejected and why, and the gaps.

**When a roster refetch breaks it.** `lib/commits.ts` throws at import, as `lib/clubs.ts` does, if
`pnpm fetch-rosters` drops or respells a committed player's row, if the overlay marks it JV, or if a
season rollover moves `data/rosters.json` to another season; `pnpm test` and the build then fail
with `commits: <team> / <player> (<college>): <what>`. Re-check the commitment's sources, then edit
or drop it by hand. On a rollover the seniors graduate: redo the research for the new season.

`lib/commits.ts` is the read API: `getCommitments()` in display order (class, then school, then
name), `getColleges()` (most players first), `getCollege(slug)`, `commitProgram(commitment)` (its
college's team in its sport, with that team's level), `getCollegeCommitments(slug)`,
`getTeamCommitments(team)`, `getPlayerCommitment(team, athleteId)` and `commitClassOf(commitment)`.
`components/commits/commit-view.ts` builds the page and the roster line and chooses every word they
say. `/commits` is one static page (DESIGN §21): one section per class year, then the colleges, then
how commitments are matched; every team page with a committed player shows a commitment line under
that player's facts ("Committed: Colgate", or "Committed: St. Lawrence (soccer)" in another sport),
linking the player's row there. The gates know the
page: `assert:prerender`, `assert-vinext-prerender.ts` and `smoke-server.sh` expect it among the
fixed pages, and `a11y-axe.mjs` checks it.

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
pnpm gate:d              # the full gate: Next, vinext and Cloudflare builds, smoke and axe on each
```

`pnpm build` and `next dev` both read the snapshot already checked into `data/`, so you can
develop and build without ever calling a live upstream API. Every build bundles nine data files
into its server code, each imported by its read module, so no server reads `data/` at run time:

| File | Read by |
|---|---|
| `data/snapshot.json` | `lib/data.ts` |
| `data/history-2025-26.json` | `lib/history.ts` |
| `data/prior-season.json` | `lib/prior-season.ts` |
| `data/player-stats.json` | `lib/player-stats.ts` |
| `data/jv.json` | `lib/jv.ts` |
| `data/rosters.json`, `data/rosters-enrichment.json` | `lib/rosters.ts` |
| `data/clubs.json` | `lib/clubs.ts` |
| `data/commits.json` | `lib/commits.ts` |

The vinext scripts read the
same `app/` and `next.config.ts`; vinext adds `vite.config.ts`, `cloudflare.config.ts` for the
Worker, two patches (see "The vinext patch") and its own outputs, `dist/`, `.vinext/` and
`.cloudflare/`, all gitignored and skipped by `eslint.config.mjs`. `--mode cloudflare` is what
switches `vite.config.ts` to the Workers target, and the Vite mode also picks the dotenv files: the
three Cloudflare scripts load `.env`, `.env.local`, `.env.cloudflare` and `.env.cloudflare.local`,
never `.env.production`.

To point at a different snapshot file (e.g. a fixture-built one), set
`SCVAL_SNAPSHOT=/path/to/snapshot.json`; `SCVAL_HISTORY` does the same for
`data/history-2025-26.json`, `SCVAL_PLAYER_STATS` for `data/player-stats.json`, `SCVAL_JV` for
`data/jv.json`, and `SCVAL_ROSTERS` and `SCVAL_ROSTERS_ENRICHMENT` for `data/rosters.json` and
`data/rosters-enrichment.json`. All six are read with `node:fs` when the module loads, so they work under Next, vitest, tsx and vinext's
Node target, never on a Worker, which has no filesystem to read them from: leave them unset for the
Cloudflare scripts. The other three files have no override.

`pnpm typecheck` runs `next typegen` first because the global `PageProps`/`LayoutProps` types used
by the dynamic pages, their OG images and `app/layout.tsx` are generated into
`.next/types/routes.d.ts`, which a clean checkout does not have and which vinext's Vite plugin
overwrites with its own declarations; Next stays the type authority.

Imports are relative everywhere (`app/`, `components/`, `lib/`, `scripts/`, `tests/`), never the
`@/` alias that `tsconfig.json` declares: Vitest has no path alias (`vitest.config.mts`), and the
tests import pages, view builders and route modules directly (tests/ui/home-view.test.ts renders
`app/page.tsx` with `react-dom/server`), so a module that resolves only through `@/` fails the
moment a test reaches it.

`.github/workflows/ci.yml` runs on every push to `main` and every PR: typecheck, lint, test, build,
and an assertion that every route family actually prerendered (no route should ever fall back to
dynamic rendering — `generateStaticParams` covers every `/game/[id]`, `/scores/[date]` and
`/teams/[slug]`, the per-league `/standings/[league]`, `/schedule/[league]` and
`/playoffs/[league]` pages, and `/clubs/[slug]`, with exact counts read from the snapshot, the
league config and `data/clubs.json`), then
checks the page-weight and first-load JS budgets and a copy-honesty scan of the built HTML. A second
job starts `next start` on that build, holds it to the response contract with
`scripts/smoke-server.sh` (see "vinext" under "Deploy notes") and runs `axe-core` against it
(`scripts/a11y-axe.mjs`) across every route family, both themes, both a phone and a desktop
viewport, failing on any serious/critical accessibility violation. Two more jobs, one per vinext
target, run beside them (not after `gates`, so a vinext regression shows even when Next is red).
`vinext` builds with `pnpm build:vinext`; `cloudflare` first validates the deploy setup with
`vinext-cloudflare deploy --env cloudflare --dry-run`, which needs no credentials, then builds with
`pnpm build:cloudflare` and a non-localhost `SITE_URL`. Each asserts with
`scripts/assert-vinext-prerender.ts` that every route rendered with `revalidate: false`, that the
static pages, metadata routes and Route Handlers are on disk, that the page families and their OG
images are exactly the ones the Next build's assertion expects (standings, schedule, playoffs, game,
date and team, with OG/page parity by name, plus the clubs pages, which have no OG card) and that
the prerendered sitemap lists exactly the prerendered pages; for the Worker it also checks that
every one of them is packaged into the static-assets cache and every file its index lists is there,
that `_headers` is there, and that nothing else ships: no precompressed copy, and nothing at the
top level of the upload but `_headers`, `_next/` and `_vinext/` unless `.assetsignore` keeps it
out. Then each starts its server (`vinext start`, or the Worker in workerd through `vite preview`)
and runs the same `scripts/smoke-server.sh` and axe passes against it. Uploading the Worker is
`.github/workflows/deploy-cloudflare.yml`'s job (see "Cloudflare Workers").

## Tests

`pnpm test` runs the full Vitest suite: snapshot-schema validation, standings/tiebreak arithmetic
against synthetic and fixture data (including a golden proof that SCVAL's tables are byte-identical
to the single-league site's), the si.com backfill rules, the official-schedule matcher, PDF-grid
parsing,
the "never render a missing score as 0-0" rule across every `GameRow` variant and every non-final
game page, and playoff-projection edge cases (shared 3rd, the Oct 30 play-in/crossover, unnamed
rounds). Beside those, `tests/pipeline/` runs the fetch pipeline over the recorded corpora (end to
end and every variant), `tests/ui/` covers the view models and rendered pages, the data-file
validators check `data/rosters.json`, `data/player-stats.json`, `data/jv.json` (with the JV merge
rules and an offline `fetch-jv` run over `tests/fixtures/jv`), `data/clubs.json` and
`data/commits.json`, and further suites pin the copy rules, the workflow files and the
update-data issue builder, the scoped typecheck's globs and the legacy-import guard. Fixtures
captured from real (offline) MaxPreps/SCVAL responses live under `tests/fixtures/`.

## Next-season bootstrap

MaxPreps' season ids are **never hardcoded into more than one place** — they live in
`lib/season.ts`, and the MaxPreps league ids (and every other league fact) in `lib/leagues.ts`; both
are re-asserted on every `fetch-data` run. The season ids are global, but **MaxPreps' league ids change
every season**: the nine leagues have 15 divisions and 14 MaxPreps league ids, because the San Diego
Section's Valley division has no MaxPreps table (`maxprepsLeagueId: null`). When the season rolls over:

```bash
pnpm discover-season
pnpm discover-season --ssid <sportSeasonId>   # pin explicitly if needed
pnpm discover-season --help                   # usage; makes no request
```

`scripts/discover-season.ts` reads the new `sportSeasonId`/`allSeasonId`/`genderSport`/
`teamLevel` from MaxPreps' state hub page, resolves each division's league id through
`team-context/v1` on one representative team per division (15 teams), asserts they agree with
`leagues/{id}/v1`, reports whether a member of a null-table division (Valley) now carries a league,
and prints a diff against `lib/season.ts` and `lib/leagues.ts` plus a
ready-to-paste constants block. **It never writes a file** — a human reviews the diff and edits
`lib/season.ts` and `lib/leagues.ts`, because a wrong season id would silently publish last
year's table under this year's URL. The official schedules, by-laws and fixture files are
re-transcribed by hand each season (see `docs/DATA-SOURCES.md`).

Once a season is finished, its final standings are only available from each league's own
end-of-season documents (a MaxPreps league URL's year segment is cosmetic and always serves the
current season). Run `pnpm build-history` once, by hand, after they are published, to generate
`data/history-<season>.json`: SCVAL from the two PDFs on `https://www.scval.com/standings/`, BVAL
from the Google Sheet and the two all-league documents linked from `https://bval.org/standings/`
and `https://bval.org/all-league/` (`pnpm build-history --from tests/fixtures/scval --bval-from
tests/fixtures/bval --retrieved-on 2026-10-03` rebuilds the committed file offline; `--retrieved-on`
is required with `--bval-from`). The script validates the result against the schema in `lib/history-schema.ts`
and writes nothing if it fails or any school does not resolve. It is a record-only file (final W-L-T, and BVAL's overall record, as published; no
recomputed points, since neither source has game-level data to recompute from), has one entry per
league (`available`, or `unavailable` with the reason: PCAL, MCAL, EAL, Sunset, City, North County and
Metro for 2025-26), and is committed
to the repo, not regenerated by the cron.

Last season's results seed the Elo rating (see "How Elo ratings are computed"), and unlike its
standings they are on MaxPreps: the schedule read takes a season id, and each team's
`team-context/v1` lists every season it has played. Once the new season is in `lib/season.ts`, run
`pnpm fetch-prior-season` once to replace `data/prior-season.json` with the season just finished
(a test fails until the file is the season before `lib/season.ts`'):

```bash
pnpm fetch-prior-season                  # the season before lib/season.ts': 1 season lookup + 99 schedules
pnpm fetch-prior-season --year 24-25     # another season
pnpm fetch-prior-season --dry-run        # fetch and report, write nothing
```

It writes every final between two registry teams, nothing else, and writes nothing at all if a
feed fails, a live row is dated outside the season, or two teams' feeds disagree on a game (a
deleted row dated outside the season is listed and counted as deleted instead). Behind a
proxy that Node's fetch does not read, run it with `NODE_USE_ENV_PROXY=1`.

## How standings are computed

Every table is ordered by 3 points for a win, 1 for a tie and 0 for a loss. The five NorCal leagues
award those points themselves (the EAL uses them to decide its title and publishes no standings, so
this site extends them to the table and says so). The four Southern California leagues publish no
points rule, no standings and no table order that we could find, so the order is this site's own
3-1-0 points and every page says so (`orderScope: 'site'`). SCVAL, BVAL, PCAL, MCAL and the Sunset
can end a league game in a tie; the EAL and the San Diego Section decide a level varsity game by
1 v 1s or a shootout. They differ in the tiebreak chain, in how a tie among three or more
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

### EAL

Per the **CIF Northern Section Field Hockey Guidelines 2026-28**: one division of six teams (Bella
Vista, Chico, Corning, Davis, Lassen, Pleasant Valley; §I), a double round robin of ten league games
each (§III.A.1), Aug 24 - Oct 28. 3 points for a win, 1 for a tie and 0 for a loss, "to determine
the League Championship" (§VII.C.2); the Guidelines give no rule for ordering the league table (the
§III.E.1 Super Regional seeding criteria are not applied here), so this site orders the whole table by
the same points and says that it is our computation, not a league ruling. A tie for first
means co-champions ("In the case of a tie, duplicate awards will be given", §VII.C), labelled "EAL
co-champions" only after the regular phase and with no EAL result missing; any other tie is shown
level, because the Guidelines break none. A varsity game that is level gets a 10-minute
sudden-victory period and then 1 v 1s until there is a winner (§VII.E.4): MaxPreps records a 1 v 1
win as a level score with a win flag for one team and a loss flag for the other (Chico 1, Davis 1 on
2026-09-28), and the site counts the flags and marks the game "SO". It does not show the 1 v 1
tally, and it shows MaxPreps' three-overtime record of the 2026-09-02 Pleasant Valley at Chico game as
MaxPreps has it, with a note that the EAL plays one overtime period. The postseason is the Super
Regional, Oct 30-31 (top six EAL/SRL schools, format and site not published, no NorCal or State path;
§III.E.1, §IV-§VI). The Guidelines' seeding text is quoted on `/about` and never applied. See
`docs/LEAGUE-RULES.md` for the clauses and `docs/DESIGN.md` §22 for what the site does with them.

### Sunset

The Sunset Field Hockey League is a field-hockey-only grouping of ten Southern Section schools
(Bonita, Chaminade, Chaparral, Edison, Fountain Valley, Great Oak, Huntington Beach, Marina, Newport
Harbor and Temecula Valley; exactly MaxPreps' 2024-25 and 2025-26 Sunset tables), not the all-sports
Sunset League, which has different members. No Sunset website, schedule, standings or rules document
exists that we could find. **Which games count:** a game between two of the ten that MaxPreps marks as
a league game (classification `contest-type`, as for SCVAL and the EAL), Aug 18 to Oct 31, the
Section's last allowable contest. There is no round robin (of the 45 pairs, 9 meet twice, 30 once and
6 never), so `gamesPerTeam` is null: GP is shown without "of N", there is no games-left or
maximum-points column, and when teams' counts differ by two or more the table says points favour
teams that have played more. **Points:** no league rule is published, so this site applies its own
3-1-0. **A level game** stays level: the Southern Section's Blue Book adopts the NFHS rules and says
nothing on overtime, and Sunset games have both ended level and been decided in overtime, so each is
recorded as reported. **Tiebreaks:** none is published, so teams level on points share a place; teams
level at the top read "Sunset co-leaders" once league play is over. **Postseason:** none. The Southern
Section holds no field hockey playoffs (Blue Book 2026-27 Bylaws 2011.1 and 3500.2) and CIF holds no
regional or state championship, so a Sunset team's season ends with its last game. MaxPreps' 2026-27
Sunset table lists five of the ten, ordered by winning percentage, and si.com's lists eight plus two
0-0 rows; both are shown as informational only.

### San Diego Section: City, North County and Metro

The San Diego Section's 40 teams play in seven leagues, which the site shows as divisions of three
conferences (City: City Western, City Eastern; North County: Avocado, Palomar, Valley; Metro: Metro
Mesa, Metro South Bay), from the Section's 2026-27 League Alignment. No conference or league publishes
a schedule, standings or a points rule that we could find. **Which games count:** classification
`membership`. A game counts for a division when both sides are its members, neither row is a
tournament or postseason contest, and it falls inside league play (from each division's first game
between two members to Oct 30, the Section's last regular-season day), whatever MaxPreps' league flag
says. The flag misses many of them (Patrick Henry 0 of 10, San Pasqual 3, Vista 4, Mt. Carmel 4).
Every pair of division-mates is scheduled to meet twice on MaxPreps: 10, 10, 10, 12, 10, 8 and 6 games
a team. The exception, on 2026-10-06, is Metro Mesa's Bonita Vista and Helix, who meet once. A game
MaxPreps flags between two divisions of one conference (Mission Bay's five against City Eastern
teams) counts in neither table, with a note. **Points:** no league rule is published, so this site
applies its own 3-1-0. **A level game** never ends level: the San Diego Field Hockey Officials
Association's 2026 procedures give a 10-minute 7 v 7 sudden-victory period, then 1 v 1 shootouts, and
credit the winner one goal. MaxPreps often records such a win as a level score marked W and L, so the
site counts the flags and marks the game "SO", for any two San Diego teams (the rule is the
Section's, not a conference's), and does not show the shootout tally. The rule is varsity only: a
level JV game stays a tie. **Tiebreaks:** the Green Book leaves them to the Section's preseason
minutes, which are not published in a form we could read, so teams level on points share a place; the
league designates its own champion, and teams level at the top read "{conference} co-leaders" once
league play is over. **Postseason:** the San Diego Section playoffs, Nov 2-14, finals Nov 14 at La Jolla
HS (Green Book 2026-27 Bylaw 2000.1): Open 8, Division I 12 and Division II 12, placed by the Section
from its power rankings with no appeal. A designated league champion (not co-champions) is guaranteed
at least a play-in, and every other team's only route is selection. Round dates come from the
officials' association's calendar. Each team's playoff division (I or II) is from the Section's 2026
Divisions sheet; the site draws no bracket and projects no seed. MaxPreps' San Diego tables do not
follow the alignment (it has no Valley table, files Metro Mesa's five teams under "Metro- South Bay",
and its City Eastern, Avocado and "Grossmont" tables each leave out or add teams), so every San Diego table is
labelled informational and the known cause is printed beside the comparison.

### Computed, not copied

Standings are always **computed from individual game rows**, not read off MaxPreps' own
`conferenceStandingPlacement`/points fields — MaxPreps' own arithmetic has shown internal
inconsistencies (see `docs/DATA-SOURCES.md` §7). MaxPreps' reported row is kept on every
`Standing` for cross-check and shown as a flagged mismatch (⚑) when it disagrees with the
computed one; see `/about`. A division whose MaxPreps table is known to differ (Santa Teresa
leaves out Prospect; PCAL's is missing games; MaxPreps orders MCAL and the EAL by winning percentage
and lists Red Bluff in the EAL; its Sunset table lists five of the ten; its San Diego tables do not
follow the Section's alignment) shows
the known cause beside the comparison instead of an alarm.

### Official schedules decide which games count

For BVAL, PCAL and MCAL a MaxPreps game counts toward the league table only when it matches a
fixture on the league's official schedule (same date and home/away, or the same pair moved within
two weeks), and never when MaxPreps marks it a tournament or neutral game or it is postseason play.
SCVAL keeps its own rule: MaxPreps' league flag, corroborated by the official PDF grid. The EAL and
the Sunset have no official schedule, so MaxPreps' league flag alone decides (a tournament or
postseason game never counts). The San Diego divisions have none either, and there division
membership decides, not the flag (see "San Diego Section" above). Official league games with no counted result yet are listed under the table as
"missing", never counted; for the EAL, which has no official games to list, that means a game
MaxPreps marks as a league game, dated before today, with no counted result.

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
   value is recorded. A level si.com score between two EAL teams, or two San Diego Section teams,
   is never used for any of these, because si.com does not say who won the 1 v 1s or the shootout.

If both sources have a score and neither of those holds, MaxPreps stays and the disagreement is
published. si.com is never used for which division a team is in, for records or for standings
order, and a game counts only when both teams are matched by si.com's own team ids, never by name
alone. A MaxPreps game that later appears for a filled fixture takes over, and the old si.com game
page becomes a link to it. `--no-sblive` turns the whole thing off. The exact rules are in
`docs/DATA-SOURCES.md`.

## How Elo ratings are computed

Each team's Elo rating (`lib/ratings.ts`, DESIGN §20) is on its team page behind a closed "Elo
rating" disclosure under the stat tiles (`#elo`), kept low on purpose so a family checking its
team meets the record first, and the ten highest in each region are a board on `/leaders`
(`#elo-rating` for NorCal, `#elo-rating-socal` for SoCal). The ratings are on one scale across all
nine leagues: there is one fit, over both regions, and each board takes its region's rows from it. It is in Elo points (1500 is the average
rated team, and a team 400 points higher is about a 10-to-1 favorite) but it is not computed game
by game: classic Elo moves two ratings after each game, which over one season of about ten games a
team leaves it mostly where it started. Instead every final between two of the 99 teams is fitted
at once, at every build, starting from last season's:

- **The fit.** The strengths for which `home − away + home edge ≈ goal margin` holds best over the
  whole season, by least squares, with each margin capped at 5 goals (a score run up past five
  earns nothing more). The home edge applies only where a game has a host. Because the season is
  fitted as a whole, a win over a strong team counts for more than the same win over a weak one,
  and a team's rating can move on a day it did not play, when an opponent's later results show it
  was stronger or weaker than it looked.
- **The start.** Each team starts the season from its rating over last season's finals
  (`data/prior-season.json`: every 2025-26 final between two of the 99 teams, 896 of them, from
  MaxPreps: 412 between NorCal teams, 473 between Southern California teams and 11 between the
  regions), carried over in full. That start counts for one game: it decides the first weeks and
  fades as the season's own results come in. A team with no result yet this season is shown at its
  start, as "preseason".
- **How well it predicts.** (Measured over the 43 teams of the four leagues covered on 2026-10-02,
  before the EAL joined.) Replaying a season day by day, each day predicted from only the games
  before it: seeded from 2025-26, 2026 through Oct 2 picked the winner of 89% of the games that had
  one (79% unseeded) and missed the capped margin by 1.76 goals (2.37); 2025-26 seeded from 2024-25
  picked 88% (84%) and missed by 1.61 (1.97). Carrying 85-115% of last season over, at a weight of
  half a game to three, scored about the same; a team's strength over one full season and the next
  correlates at 0.89.
- **The scale.** Elo = 1500 + 175 × (strength in goals − the average). 175 points a goal is the
  value that best fits Elo's own expected-score curve over those 564 replayed predictions:
  favorites by 100-200 points scored 69% (Elo expects 70%), by 200-300 80% (81%), by 400-600 97%
  (95%).
- **What counts.** Every final between two of the 99 teams, league or not, postseason included,
  with its published score (a si.com backfill too). Forfeits, finals without a score and games
  against schools outside the nine leagues are left out, last season's included. The fit uses goals,
  so an EAL game decided on 1 v 1s, or a San Diego game decided by a shootout, counts as level there.
  The model's constants (the 5-goal cap, the one-game weight of last season, 175 points a goal) were
  set on NorCal seasons and have not been tested on Southern California's.
- **The board.** A team needs half the median team's counted games this season, in its own region,
  to be on that region's `/leaders` board, as the record boards do; below that its team page shows the rating as
  provisional. A team page names its place only when the board lists it (the top 10).
- **Known soft spot.** MCAL links to the three CCS leagues through few games (nine in 2025-26,
  five so far in 2026, as counted before the EAL joined), so how MCAL teams compare with the CCS
  leagues rests on those results and can move several dozen points with one more cross-league game.
  The EAL has the same problem: last season it linked to the other leagues through 13 games (8 of
  them against MCAL teams; Pleasant Valley 4, Chico 3, Bella Vista 3, Davis 3, none for Corning or
  Lassen), and this season, as of 2026-10-04, through 5 finals (Davis 2, Bella Vista, Chico and
  Pleasant Valley 1 each), so how EAL teams compare with the other leagues, and how Corning and
  Lassen compare with anyone outside the EAL, rests on very few results.
  The two regions have the same problem on a larger scale. As of 2026-10-06 they are linked by
  7 finals this season, all between NorCal and San Diego Section teams (City v SCVAL 3, North County
  v SCVAL 2, City v MCAL 2; 8 more are scheduled, on Oct 16-17), and by 11 last season
  (Leigh, Gilroy and Mitty against San Diego and Sunset teams). Inside Southern California the Sunset
  and the San Diego Section are linked by 38 finals this season. So a NorCal rating and a SoCal
  rating are on one scale, but how far apart the regions sit rests on a handful of games and can move
  with each new one; `/leaders` prints those two counts from the data at every
  build ("comparisons between NorCal and SoCal rest on 7 finals between the regions this season and
  11 last season, so treat them as rough").

## Known limitations

- **Some schools are not covered.** Wilcox is not fielding a team this season: the official SCVAL
  De Anza grid still lists it, but it is not in the team registry, its 14 grid fixtures are
  dropped when the PDF is parsed, and De Anza is shown as 7 teams. York plays JV field hockey only
  (PCAL's grid slot `CAT/YOR` is Santa Catalina), so it has no varsity results. Both are in the
  `withdrawnNames` of their league in `lib/leagues.ts`, and the team search says so. Red Bluff is not
  fielding a varsity team in 2026 either (MaxPreps' EAL table still lists it as a 0-0-0 row; a JV
  game of its own exists, so the site says only "not fielding a varsity team in 2026").
  In Southern California, Harvard-Westlake, Thousand Oaks and Glendora are each the only field hockey
  team in their all-sports league and play no league games, so they appear only as opponents; Madison,
  Santana, Castle Park, Chula Vista, Montgomery and Sweetwater have a 2026-27 MaxPreps team but no
  varsity game there or in the San Diego Section's power rankings; Mayfair has no game and is not on
  the Southern Section's list of participating schools. The team search prints a sentence for each.
- **MaxPreps is wrong or incomplete for some leagues.** MaxPreps' Santa Teresa table leaves out
  Prospect and counts four of its league games as non-league; its PCAL data is missing some
  official league games and dates others differently; it orders MCAL and the EAL by winning percentage and,
  after Oct 22, counts MCAL tournament games in league records; two EAL league games had no score on
  MaxPreps on 2026-10-04, and the site lists them as missing results rather than guess. MaxPreps also
  records 1 v 1 results inconsistently in the EAL: a level score with win and loss flags (counted as a
  win), and a 1-0 score with three overtime periods that the EAL's one overtime period cannot
  produce and that may be a 1 v 1 win entered as a goal (shown as MaxPreps has it, with a note). The site computes those tables
  from the league's official schedule (the EAL has none: from MaxPreps' league flag) and says what
  differs, per league, on `/about#health`.
- **MaxPreps' Southern California league assignments are missing for several teams.** Its 2026-27
  Sunset table holds five of the ten (Great Oak, Temecula Valley, Bonita, Chaminade, Chaparral) and
  gives the five Orange County schools no league at all. In San Diego it has no Valley table, its City
  Eastern table leaves out Patrick Henry and lists Madison, its Avocado table leaves out Mt. Carmel and
  Rancho Bernardo, its "Metro- South Bay" table holds the Metro Mesa teams, and its "Grossmont" table
  holds El Capitan, Granite Hills and Santana while Hilltop and Southwest have no league. Its league
  flag misses many San Diego division games, which is why membership decides there. Every Southern
  California MaxPreps record is shown as informational, with the known cause.
- **No Southern California league publishes a schedule, standings or tiebreaks that we could find.**
  The San Diego division games are inferred from MaxPreps' schedules and the Section's alignment, so a
  meeting MaxPreps does not list is invisible: on 2026-10-06 Metro Mesa shows 19 of its 20 meetings
  (Bonita Vista and Helix meet once), and no league schedule says whether the second is missing or was
  never scheduled. The Sunset has no schedule at all, so its teams play different numbers of league
  games. San Diego tiebreaks are in the Section's preseason minutes, which are not published in a form
  we could read, so teams level on points share a place; the Sunset publishes none either. Both orders
  are this site's own 3-1-0 points.
- **The San Diego playoff divisions can go stale.** Each team's Division I or II on `/playoffs` and its
  team page comes from the Section's 2026 Divisions sheet (dated 2025-12-23), kept in config; nothing
  re-checks it, so a re-sheet before the Oct 31 seeding meeting would not show until someone edits
  `lib/leagues.ts`. The San Diego brackets are not drawn here at all.
- **MaxPreps' manual entry lags.** Coaches enter scores by hand; at times only a fraction of
  played games carry a score days after the fact, and MaxPreps occasionally corrects a
  previously-entered result. The fetch script re-ingests every team's entire season on every run
  (not just a trailing window) specifically so corrections and backfills are never missed.
- **SBLive's league buckets are wrong for SCVAL and the Sunset.** Its "De Anza" and "El Camino" pages
  misfile several SCVAL schools between divisions and omit Santa Clara entirely; its Sunset table
  lists eight of the ten plus two 0-0 rows and files Chaparral and Temecula Valley under
  "Southwestern". Statewide name collisions are common (University, Los Altos, Santa Clara, Davis,
  Westview, Del Norte, Marina, San Marcos, Mission Vista, Granite Hills and Southwest), and si.com
  sometimes puts one of our teams' games on a namesake's page (Westview v Sage Creek on West Los
  Angeles' Westview; Del Norte's Oct 16 games on Crescent City's), where they do not join.
- **si.com's statewide scoreboard is read only as far as its first page.** It server-renders the
  first 24 games of a day and loads the rest in the browser through an API the pipeline does not call,
  so on a busy day some si.com rows are not read. The parser warns ("si.com scoreboard lists N of M
  games"), and a row it did not read is never treated as an absent game. si.com is a cross-check and,
  under the narrow backfill rules above, a source of scores MaxPreps lacks or has plainly wrong;
  division membership, league records and standings order are **never** taken from it, and a team is
  matched only by si.com's own ids.
- **The CCS playoff bracket doesn't exist until after entries close on Nov 2.** Before then,
  `/playoffs` shows a projection built from the by-laws' auto-qualifier rules and the standings
  as they stand. From Nov 2 the site polls the CCS calendar and MaxPreps' tournament page for a
  published bracket; until CCS actually publishes one, the bracket section stays in its seeded
  projection state (it has never been exercised against a real published bracket — only against
  synthetic test data).
- **Roster detail depends on the coach.** As of 2026-10-02 (SCVAL) five programs publish grade, position
  and number on MaxPreps, three publish grade and number only, seven publish names only (Los
  Gatos' 58 names are the whole program, varsity and JV).
  The MaxPreps file stores exactly that — a blank is `null`, never a guess. The schools' own
  sites and papers fill part of the gaps, measured from the files on 2026-10-03 (MaxPreps alone →
  with the overlay, of the players each league lists):

  | League | Players | Grade | Position | Height | Number |
  |---|---|---|---|---|---|
  | SCVAL | 341 | 170 → 303 | 99 → 108 | 26 → 49 | 167 → 167 |
  | BVAL | 173 | 139 → 161 | 63 → 64 | 0 → 0 | 138 → 138 |
  | PCAL | 82 | 49 → 66 | 32 → 35 | 0 → 0 | 55 → 55 |
  | MCAL | 149 | 85 → 128 | 62 → 63 | 0 → 0 | 64 → 64 |

  On 2026-10-04 the EAL's 95 players (MaxPreps alone; there is no overlay for them yet) have 95
  grades, 56 positions, 7 heights and 95 numbers.

  The overlay filled 215 grades, 14 positions and 23 heights (all heights are SCVAL's: no BVAL, PCAL
  or MCAL roster source publishes one, and the NCSA profiles that list a height are only linked,
  never used to fill a field; the overlay filled no jersey number in any league). Grades whose
  sources disagree are left blank: 9 in BVAL, PCAL and MCAL, each with its sources under conflicts
  except one whose single page contradicts itself. **Positions are the
  real gap**: no current-season public source lists them for most programs in any league. A
  position MaxPreps lists only for the 2025-26 roster is deliberately not filled, since positions
  change between seasons. Del Mar, Silver Creek, Sobrato, Monterey, Santa Catalina, Marin Academy
  and Corning have no players on MaxPreps, so there is nothing to join to (Marin Academy's own list of 18 is
  first names, last initials and class years). Los Altos and Homestead publish no roster anywhere, and
  si.com's rosters were rejected as a source (names only, and often a different list of names).
- **Player stats exist only where a coach enters them.** Rosters and stats cover all 99 teams. The
  50 Southern California teams were read live on 2026-10-06 (with them, 1,617 players on 84 of the 99
  teams, and stats for 62); their overlay entries are unswept stubs, so their pages say we have not
  checked other public sources. For the NorCal teams, the
  43 teams of the four earlier leagues were read live on 2026-10-03 (all 43 pages parse; SCVAL's rows
  matched the 2026-10-02 captures exactly; 6 BVAL/PCAL/MCAL teams have an empty roster on MaxPreps and
  10 of the 28 have no stats) and the six EAL teams on 2026-10-04 (Corning has no roster and no stats
  on MaxPreps), and the school-site and recruiting-page overlay covers the four earlier leagues
  (SCVAL swept 2026-10-02, the others 2026-10-03; recall is partial in each, and a team's page names
  what was and was not found); the EAL's six overlay entries hold only recruiting profiles (swept
  2026-10-04), so an EAL team's page says it has not checked other public sources. As of 2026-10-02, 10 of the 15 SCVAL teams publish stats on MaxPreps
  (Cupertino, Los Altos, Los Gatos, Lynbrook and Saratoga publish none, and no school site or si.com
  page has them either), what each tracks varies by coach, and some stop entering mid-season
  (Presentation's last update was Sep 10). The team page says so rather than showing a short table
  as if it were complete.
- **Club recall is partial.** A player is tied to a club only when a public page meets the linking
  rule, so on 2026-10-05 80 of the 811 varsity rows have a club line, and 24 schools have none (seven
  of them list no players on MaxPreps at all). A player with no club line may still play for a club. The ties
  were researched once, on 2026-10-03 (the six EAL teams' schools on 2026-10-04, which added eight ties for five players at Davis and
  Pleasant Valley, and three club records; on 2026-10-05 a re-read of the linked recruiting profiles
  added 14 ties for 13 players), and nothing refreshes them. The 50 Southern California teams' schools
  have not been swept at all. See `docs/DATA-SOURCES.md` §1.1j2.
- **Commitment recall is partial, and the list does not update itself.** A commitment is listed
  only when a public page meets the linking rule, and social media never counts, so on 2026-10-04 16 of
  the 811 varsity rows have a commitment line (in any sport) and 40 schools have none; a player with no
  line may still have committed. It was researched on 2026-10-03 and 2026-10-04 (the six EAL teams'
  schools on 2026-10-04, for field hockey and then every sport, with none found, though without
  SportsRecruits' athlete search or web searches for freshmen and sophomores): a later signing,
  decommitment or new commitment (the class of 2027's signing period is in November) is not shown
  until someone redoes it by hand. The 50 Southern California teams' schools have not been swept. See
  `docs/DATA-SOURCES.md` §1.1j3.
- JV tables are unofficial and computed: no league publishes JV standings in season, a JV league game
  is identified by its varsity counterpart, and a table is shown only once 60% of its division's played
  JV league games have a score (on 2026-10-05: El Camino, MCAL and the EAL). There are no JV leaders or
  ratings. JV scores
  are thin where coaches do not enter them (on 2026-10-05 MaxPreps had no score for any past BVAL or
  PCAL JV league game; si.com fills part of PCAL's), JV rosters are on MaxPreps for 11 schools and JV
  stats for 4, neither of which the site shows, and nothing says authoritatively which schools field a
  JV team (York, PCAL's JV-only member, appears only as an opponent). See "JV games".
- **The header wordmark was measured, the spelled-out form was not.** Measured in Chromium on
  2026-10-06 (DESIGN §24.3): "CA HS FH" is 84 px with its padding below 1280 px (the old "NorCal HS FH"
  was 115 px) and "California HS FH" 136 px from 1280 px (the old full wordmark was 193 px), so every
  margin grew. The spelled-out "California HS Field Hockey" was not tried in a browser; the estimate in
  `components/layout/SiteHeader.tsx` (about 18 px too wide at 1280 beside the "Report an error" pill)
  is why the header shows the initials there. The home row with the region switcher was measured at
  320, 360 and 390 px (DESIGN §24.3): it costs one 48 px row, and the §15.6 fold targets are missed.
- **axe-core is pinned to the 4.13 line in CI.** axe-core 4.14.0 (published 2026-10-05) widened its
  `label-content-name-mismatch` rule: it now compares the visible text of `aria-hidden` descendants
  and keeps the soft hyphens of the team-picker tiles, so it flags three patterns that predate this
  change and whose accessible names are deliberate sentences: the home pin tiles (`lib/pin-label.ts`),
  the "Who we haven't beaten" rows and the pinned card's last-game link. With 4.13 the pass is clean
  (176 page loads, 0 serious or critical). Reworking those three names for 4.14 is a follow-up.
- MaxPreps' season-year URL segment is cosmetic (it always serves the current
  season, never a prior one); and a handful of MaxPreps/school-calendar start-time disagreements
  and si.com-only games that no official schedule lists are surfaced as warnings rather than
  silently resolved. See `docs/DATA-SOURCES.md` §7 for the full list of open risks.

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

## Deploy notes

Every route is prerendered at build time — no database, no request-time data fetching, and no
Route Handlers beyond the OG-image generators and the `/icon-192` and `/icon-512` icons, all
prerendered too. It is NOT `output: 'export'`, though: serving it needs Next.js's own server, a
host adapter that provides one, `vinext start` or vinext's Cloudflare Worker (see "vinext" and
"Cloudflare Workers" below), because the 404s for unknown dynamic params and the metadata routes
(`/icon`, `/apple-icon`, `/opengraph-image`, `/robots.txt`, `/sitemap.xml`) are served by the
framework.

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

`SITE_URL` defaults to `http://localhost:3000` (`components/layout/site.ts`) when unset, so
`metadataBase`, `robots.txt` and `sitemap.xml` will point at localhost until it's set in the
deploy environment — no production domain is hardcoded anywhere in the repo. `.env.example` lists
it and the six optional variables; copy it to `.env` for a local production build.

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
`data/` beside it. The `SCVAL_*` file overrides (see "Local development") still swap in another
file through `node:fs` wherever the data modules load (the prerender, and `vinext start` for what
it renders on request), so a server given one should get the file the build had. `SITE_URL` and `SCVAL_BUILD_AT`
are fixed at build time on both vinext targets: `vite.config.ts` reads them with Vite's `loadEnv`
(the process environment first, then the mode's `.env` files) and inlines them with `define`, so
the prerendered pages and whatever is rendered on request (every 404) carry the same values,
whatever the server's environment says. An unset `SITE_URL` keeps the `http://localhost:3000`
fallback; an unset `SCVAL_BUILD_AT` becomes the instant the build ran. Only `next start` still
reads both at run time, so it needs the values `next build` had. `vite build` and `vinext start`
both load `.env` the way Next does. The Workers build empties `dist/` (it stages its prerender
there), so after `pnpm build:cloudflare` run `pnpm build:vinext` again before `pnpm start:vinext`.

`vite.config.ts` sets `prerender: { routes: '*' }`, so `pnpm build:vinext` prerenders everything
`next build` does — about 539 pages plus a 404 with the current snapshot, clubs and commitments
files (540 .html on 2026-10-04, 17 of them the clubs pages and one `/commits`; the exact counts are
derived from `data/snapshot.json` and `data/clubs.json` by `scripts/assert-vinext-prerender.ts`),
all `revalidate: false` in `dist/server/vinext-prerender.json`: every page (HTML and RSC payload)
plus a 404 page, and every icon, apple-icon, `/icon-192`, `/icon-512`, OG image (root,
`/standings`, one per league, game, date and team), `manifest.webmanifest`, `sitemap.xml` and
`robots.txt`, under `dist/server/prerendered-routes/`. `vinext start` seeds its cache from them at
startup ("Seeded N pre-rendered routes into memory cache") and serves each one as built. None of
them renders per request; a 404, which no prerendered route covers, is what the server renders on
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
build time (see "vinext"), and the `SCVAL_*` file overrides need a filesystem a Worker does not
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
`data: refresh snapshot`, `data: refresh player stats` or `data: refresh JV games` message, nothing
but the snapshot, its meta file, `data/player-stats.json` and `data/jv.json`, tested by that job
before it pushed) to the commit whose
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
- `SPEC §n` and `BUILD-BRIEF` in code comments refer to the build-time research spec and build
  brief, which are not kept in this repo. Their §1.x sections survive, condensed, as
  `docs/DATA-SOURCES.md` §1.x; every other section number does NOT match DATA-SOURCES' numbering,
  so treat it as historical. New comments cite `docs/DESIGN.md`, `docs/DATA-SOURCES.md`,
  `docs/LEAGUE-RULES.md` or `docs/BYLAWS-2026-27.md` sections instead.
- `docs/DESIGN.md` — the implementation-ready design record: routes, tokens, component
  signatures, rendering rules, empty states, accessibility requirements. §15 is the multi-league
  amendment (what changed from the single-league design, and why). §22 is the EAL amendment (the
  fifth league and third section: what it reverses, its postseason surfaces, the copy rules and the
  measured budgets).
