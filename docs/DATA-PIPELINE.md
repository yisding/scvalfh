# How data flows

```
MaxPreps ghost API    ──┐
si.com (SBLive)       ──┤
scval.com PDFs (live) ──┼──► scripts/fetch-data.ts ──► data/snapshot.json ──► next build ──► static site
data/official/*.json  ──┤     (lib/pipeline/*)         data/snapshot.meta.json   or vite build (vinext)
cifccs.org / VNN .ics ──┤
cifsshome.org         ──┘  (cross-check only)
```

1. **`scripts/fetch-data.ts`** is the cron entry point, a thin CLI over `lib/pipeline/` (see
   `docs/DATA-SOURCES.md` for every endpoint, JSON path and gotcha). It runs a **131-request
   MaxPreps sweep**: 1 bootstrap, 14 league metadata checks, 14 standings tables and 102 team
   schedules, at most 3 at a time and at least 500 ms apart. There are 15 divisions, but North
   County's Valley division has no MaxPreps table, so its metadata and table are never requested
   (never a `/leagues/null/v1` URL) and its cross-check is reported as skipped; the Southern Section
   independents have no MaxPreps table either, so only their five schedules are read. Failures are
   scoped, so one league never blocks the others:
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
   MaxPreps' flag says. The LA independents, five schools in no league, are counted the same way
   (`classification: 'membership'`): their table counts every game between two of the five from
   Sep 8 to Oct 31, tournament and postseason rows left out, and they have no postseason. Secondary
   sources (si.com, the two VNN `.ics` feeds, the CCS calendar and bracket poll) are optional and
   failure-tolerant. So is the
   third score cross-check, cifsshome.org (the CIF Southern Section's schedule-and-score widget, which
   carries every Section our teams play in): schools enter their own rows there, so it never
   changes a score; each run compares its scored rows with MaxPreps and lists every disagreement, every
   score MaxPreps lacks and every scored game MaxPreps has no contest for on `/about#cross-check`
   (`docs/DATA-SOURCES.md` §1.2a; `--no-cifss` skips it).
2. It writes **`data/snapshot.json`** (the full normalized `Team[]`/`Game[]`/`Standing[]`/
   per-league health/dropped contests/`SourceStatus[]`) and **`data/snapshot.meta.json`**
   (counts, timestamps, a per-league summary: what the update-data workflow uses for its commit
   message and job summary).
3. **`next build`** (or `vite build` under vinext) reads the `data/` JSON files the read APIs
   import (`data/snapshot.json` via `lib/datasets/snapshot.ts`, plus the files listed under docs/DEVELOPMENT.md "Local
   development") and prerenders every route — there is no request-time fetch, no database and no
   `searchParams` anywhere. "Today" for rendering purposes is always derived from the snapshot's
   `fetchedAt`, never `Date.now()`, so a given commit builds byte-identically no matter when
   `next build` runs.
4. Standings are **computed from game rows**, not taken from MaxPreps' own numbers — see docs/STANDINGS.md "How
   standings are computed". MaxPreps' reported row is kept alongside for cross-check and
   shown as a flagged mismatch when the two disagree (visible on `/about` and on the standings
   rows themselves).

## The cron

`.github/workflows/update-data.yml` runs `pnpm fetch-data` on a schedule, **twice a day, only in
season** (cron `0 14 * 8-12 *` and `0 5 * 8-12 *` — 7:00 AM and 10:00 PM Pacific during PDT,
restricted to Aug-Dec so it rarely fires out of season; the cron's months are UTC, and December
is there only for the Nov 30 10:00 PM Pacific run, which is already December 1 in UTC). The
season itself is bounded by the scripts' own Aug 1 - Nov 30 Pacific window guard
(`inSeasonWindow` in `lib/pipeline/season-window.ts`, over the sections' season windows in
`lib/config/leagues.ts`; `fetch-player-stats` imports the same function): a run outside it exits without
writing anything. Right after `fetch-data` it runs `pnpm fetch-player-stats` (all 102 teams; see
docs/DATASETS.md "Player stats") and then `pnpm fetch-jv` (see docs/DATASETS.md "JV games"), each allowed to fail without
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
`CI_GATE` and fails past 121 KiB (the 102 views measured 110,556 bytes on 2026-10-06).

For this to work on a deployed copy of this repo:
1. **Push the repo to GitHub** with Actions enabled.
2. Under **Settings → Actions → General → Workflow permissions**, select **"Read and write
   permissions"** (the job needs `contents: write` to commit the refreshed snapshot back to the
   branch — already declared in the workflow, but the repo-level default must allow it).
3. Connect your host (see docs/DEPLOYMENT.md "Deploy notes") to redeploy automatically on push to `main` — most
   static hosts do this without any extra configuration once the repo is linked.

## Self-hosting the cron

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
                   # for the Worker; see docs/DEPLOYMENT.md "Deploy notes")
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
address (`POLITE_USER_AGENT` in `lib/sources/http/client.ts`; si.com, which refuses a non-browser one, gets
a browser User-Agent instead). Set `SCVAL_CONTACT=<email>` in the scripts' environment to put your
own deployment's address there. Only the scripts read it, at fetch time: it is not a build-time
file override, and the build and the site never use it.

## Corpus and capture

`tests/fixtures/corpus/all-2026-10-02/` is a recorded copy of one real run: every MaxPreps
response for all four leagues, the si.com pages that matter, the SCVAL PDF texts and the official
revision hashes, with a `manifest.json` naming each file. `pnpm fetch-data --fixtures
tests/fixtures/corpus/all-2026-10-02 --out /tmp/x.json` rebuilds a whole snapshot from it with no
network, and `tests/fixtures/corpus/variants/` holds overlays for the failure cases (a league on
the wrong season, an empty table, a 503 feed, a revised official schedule, a finals regression,
MCAL postseason games). It was not extended for the EAL: under it the EAL is "not fetched in this
run". `tests/fixtures/corpus/eal-2026-10-04/` is a second corpus, captured live on 2026-10-04 with
`--leagues eal` (19 files, 9 MaxPreps and 9 si.com requests), that drives the EAL's pipeline and view
tests and a second copy-honesty pass (`EAL_CORPUS` in `tests/support/corpus.ts`).
`tests/fixtures/corpus/socal-2026-10-06/` is a third, captured live on 2026-10-06 with `--leagues
sunset,city,north-county,metro --no-official --no-ccs --no-vnn` (65 MaxPreps requests: 1 + 2 × 7 + 50;
8.2 MB), that drives `tests/integration/socal.test.ts`: Valley's skipped table, the membership counts per
division, Mission Bay's cross-division games and the eight San Diego shootout finals. Tests that assert
league-specific values read the snapshot a corpus produces
(`corpusSnapshotPath('all-2026-10-02')` in `tests/support/corpus-snapshot.ts`, built once per test run by
`tests/support/global-setup.ts`); tests over the bundled
`data/snapshot.json` assert invariants only, because that file changes every run.
`tests/fixtures/corpus/variants/finals-regression/previous-snapshot.json` is frozen as a four-league
file, so the pipeline tests keep proving that a snapshot written before a league existed loads.

To make a new corpus, run `pnpm fetch-data --capture tests/fixtures/corpus/<name>` once on a
workstation; it is a normal live run that also writes each response and the manifest. Capturing
is the only reason to run a live fetch by hand.

## Official fixtures

The EAL and the four Southern California leagues publish none, so they have no bundled file. BVAL, PCAL and MCAL publish their schedules as
documents, so their league fixtures are bundled in
`data/official/{bval,pcal,mcal}-2026.json`, written by `pnpm build-official-fixtures` from the
transcriptions under `tests/fixtures/official/source/` and never hand-edited (`pnpm
build-official-fixtures --check` exits 1 if a file differs). The cron compares each document's hash
with the bundled one; a difference is published as a "revised upstream" reason and an issue, and the
bundled fixtures are still used until someone re-transcribes them (the runbook is in
`docs/DATA-SOURCES.md`).
