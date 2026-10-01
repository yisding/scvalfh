# SCVAL Field Hockey

Scores, standings, schedules and the CCS playoff picture for the 16 De Anza and El Camino girls
varsity field hockey teams (Santa Clara Valley Athletic League). A static Next.js site rebuilt
from one JSON snapshot, refreshed nightly by a scheduled GitHub Actions job.

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
| `/teams` | All 16 SCVAL teams |
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
cifccs.org / VNN .ics ──┘
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
3. **`next build`** reads only `data/snapshot.json` (`lib/data.ts`) and prerenders every route —
   there is no request-time fetch, no database and no `searchParams` anywhere. "Today" for
   rendering purposes is always derived from the snapshot's `fetchedAt`, never `Date.now()`, so a
   given commit builds byte-identically no matter when `next build` runs.
4. Standings are **computed from game rows**, not taken from MaxPreps' own numbers — see "How
   standings are computed" below. MaxPreps' reported row is kept alongside for cross-check and
   shown as a flagged mismatch when the two disagree (visible on `/about#cross-check` and on the
   standings rows themselves).

### The cron

`.github/workflows/update-data.yml` runs `pnpm fetch-data` on a schedule, **twice a day, only in
season** (cron `0 14 * 8-11 *` and `0 5 * 8-11 *` — 7:00 AM and 10:00 PM Pacific during PDT,
restricted to Aug-Nov so it never fires out of season; `fetch-data.ts` also has its own Aug 1 -
Nov 30 window guard as a second line of defense). It runs the test suite against the snapshot it
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
```

Useful flags on `fetch-data` (see the header of `scripts/fetch-data.ts` for the full list):
`--fixtures <dir>` runs entirely offline against captured fixtures; `--dry-run` validates and
reports without writing; `--force` bypasses the season-window guard; `--no-sblive`/`--no-scval`/
`--no-ccs`/`--no-vnn` skip individual secondary sources.

## Local development

```bash
pnpm install
pnpm dev            # next dev
pnpm typecheck       # tsc --noEmit
pnpm lint           # eslint
pnpm test            # vitest run
pnpm build          # next build — prerenders every route from data/snapshot.json
```

`pnpm build` and `next dev` both read the snapshot already checked into `data/`, so you can
develop and build without ever calling a live upstream API. To point at a different snapshot file
(e.g. a fixture-built one), set `SCVAL_SNAPSHOT=/path/to/snapshot.json`; `SCVAL_HISTORY` does the
same for `data/history-2025-26.json`.

`.github/workflows/ci.yml` runs on every push to `main` and every PR: typecheck, lint, test,
build, and an assertion that every route family actually prerendered (no route should ever fall
back to dynamic rendering — `generateStaticParams` covers every `/game/[id]`, `/scores/[date]`
and `/teams/[slug]`). A second job runs `axe-core` against the production build
(`scripts/a11y-axe.mjs`) across every route family, both themes, both a phone and a desktop
viewport, and fails on any serious/critical accessibility violation.

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

- **Wilcox has no results anywhere.** It's a full De Anza member on the official SCVAL schedule
  PDF, but MaxPreps' own De Anza standings table omits it entirely and its MaxPreps schedule page
  publishes zero games. It renders with an explicit "no results reported" state — never as
  0-0-0, and its record is never fabricated from opponents' rows.
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
though: serving it needs Next.js's own server or a host adapter that provides one, because the
404s for unknown dynamic params and the metadata routes (`/icon`, `/apple-icon`,
`/opengraph-image`, `/robots.txt`, `/sitemap.xml`) are served by the framework.

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
  reverse proxy that can talk to a Node process. Set `SITE_URL` the same way. Pair with the cron line under "Self-hosting the cron" above to keep data fresh
  without GitHub Actions at all.

`SITE_URL` defaults to `http://localhost:3000` (`components/layout/site-url.ts`) when unset, so
`metadataBase`, `robots.txt` and `sitemap.xml` will point at localhost until it's set in the
deploy environment — no production domain is hardcoded anywhere in the repo. `.env.example` lists
it and the two optional variables; copy it to `.env` for a local production build.

## Further reading

- `docs/DATA-SOURCES.md` — every upstream endpoint, JSON path, enum and known gotcha, condensed
  from the build-time research spec.
- `docs/BYLAWS-2026-27.md` — the verified SCVAL by-laws excerpt that governs standings, points,
  tiebreaks and CCS qualification.
- `docs/DESIGN.md` — the implementation-ready design record: routes, tokens, component
  signatures, rendering rules, empty states, accessibility requirements.
