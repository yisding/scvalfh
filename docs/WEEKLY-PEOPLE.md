# Weekly people data: rosters, clubs and commitments

Two weekly jobs keep the people data current. Neither ever touches `main`. Both work on one
standing branch, **`data/weekly-people`**, and one pull request from it into `main`, titled
**"Weekly people data: rosters, clubs and commitments"**. Nothing reaches the site until a person
reviews and merges that PR; ci on `main` then gates the deploy as for any other commit.

| Job | What it does | Where it runs | When (Pacific) |
|---|---|---|---|
| **Rosters** | `pnpm fetch-rosters` for all 49 teams; commits `data/rosters.json` when a player changed, with a summary of every change (`pnpm roster-diff`) as a PR comment | GitHub Actions, `.github/workflows/update-people.yml` | Mondays 6:23 AM (5:23 AM in winter) |
| **Research** | Repairs the research a roster change broke, then looks for new club ties and college commitments, verifies each twice and commits what survives | A Claude Code Routine on the owner's claude.ai account, following the runbook below | Mondays 8:49 AM |

Both run year-round. Rosters rarely change between seasons, so those runs usually commit nothing,
while commitments keep coming (the November and April signing periods, juniors committing in
spring), so the research keeps going.

Why a PR rather than a direct commit like `update-data.yml`'s: `data/rosters-enrichment.json`,
`data/clubs.json` and `data/commits.json` join to the rosters on team slug + MaxPreps athleteId,
and `lib/rosters.ts`, `lib/clubs.ts` and `lib/commits.ts` throw at import when a roster change
breaks that join. A dropped or respelled player, or a field MaxPreps now fills that the overlay
filled, fails `pnpm test` and the build. Some tests and the README also pin counts taken from the
rosters. On a branch such a change turns the PR red rather than `main`, and the research run repairs
it before anyone merges.

Repository settings the workflow needs: **Settings → Actions → General → Workflow permissions**,
"Read and write permissions" and **"Allow GitHub Actions to create and approve pull requests"**.
A push made with `GITHUB_TOKEN` starts no `pull_request` run, so the workflow dispatches `ci.yml` on
the branch itself; its checks show on the PR.

To pause the research, disable the Routine in claude.ai (Routines). To pause the rosters, disable
the workflow under Actions. To run either now: the workflow has **Run workflow** (with an optional
`leagues` input), and the Routine has **Run now**.

---

## The research run (the Routine's runbook)

This is what the weekly Routine does, step by step. A person running it by hand follows the same
steps. The rules themselves are not restated here: they are in `docs/DATA-SOURCES.md`, §1.1j2 for
clubs, §1.1j3 for commitments and §1.1j for the roster overlay, and in the schemas
(`lib/clubs-schema.ts`, `lib/commits-schema.ts`, `lib/rosters-schema.ts`). Read those sections
before every run; they are the contract and they win over anything here.

### Hard limits

- Push only to `data/weekly-people`. Never push to `main`, never merge or approve the PR, never
  force-push except when starting the branch over (step 0).
- Never edit `data/rosters.json`: the workflow is its only writer.
- Change only the research files (`data/clubs.json`, `data/commits.json`,
  `data/rosters-enrichment.json`), the tests that pin their counts, and the README and
  `docs/DATA-SOURCES.md` passages that state those counts or describe the research. No code, no
  dependencies.
- No social media as a source or link (`BANNED_HOSTS`), and nothing behind a login, a paywall or a
  bot challenge you would have to defeat (DATA-SOURCES §6). A blocked page goes in the report as
  not read.
- Only players on the tracked varsity rosters are named, under the roster's spelling.

### 0. Get on the branch

1. If the repository is not in the session, attach `yisding/scvalfh` and clone it.
2. `git fetch origin main data/weekly-people` (the second may not exist yet).
3. Look for an open PR from `data/weekly-people` into `main`.
   - **Open PR:** `git checkout -B data/weekly-people origin/data/weekly-people`, then
     `git merge origin/main`. If the merge conflicts in `data/rosters.json`, abort it, comment on
     the PR that main's rosters changed under the branch and next Monday's roster run will
     reconcile them, and stop. Resolve a conflict in a research file or a doc by hand, keeping both
     sides' facts.
   - **No open PR, and the branch's tip is the head of a merged or closed PR (or is already in
     `main`):** start over with `git checkout -B data/weekly-people origin/main`. This is the one
     case where the later push is `--force`.
   - **No open PR, and the branch has commits no PR has shown:** build on them, as in "Open PR".
4. `pnpm install --frozen-lockfile`, then `pnpm test`, and note what fails.
5. **Season check.** If `data/rosters.json`'s `season` differs from the `season` of the three
   research files, stop. Comment on the PR (or report in the session if there is none) that a new
   season needs the research redone from scratch, which is a person's call and not this run's.

### 1. Repair what the roster change broke

The workflow's PR comments list every roster change and a table, "Research records to re-check".
To regenerate it:
`git show origin/main:data/rosters.json > /tmp/before.json && pnpm roster-diff /tmp/before.json data/rosters.json`.
Together with `pnpm test`'s failures (`clubs: …`, `commits: …`, `rosters-enrichment: …`), that is
the repair list. For each record:

- **Re-added row** (the table says the same name was added under a new athleteId): confirm it is
  the same person (same `careerProfileId`, or the same name, grade and number), then move the
  record to the new `athleteId`.
- **Respelled name:** the record takes MaxPreps' new spelling. Its sources and quotes stay as they
  are.
- **Row gone and not re-added:** the player is no longer on the varsity roster MaxPreps lists.
  Re-open the record's sources, then drop the record. The site names only players on the tracked
  rosters.
- **MaxPreps now fills a field the overlay filled:** remove the overlay's value. If the two
  disagree, record the disagreement under the overlay's `conflicts`, with MaxPreps' value kept
  (§1.1j).
- **Grade moved:** re-check every class year a source states. Under the rule, a class year that
  disagrees with the roster rules the match out, so drop the record unless another kept source
  still satisfies the rule.
- **Pinned counts:** re-count from the files and update each test that pins a roster-derived
  number together with the README or DATA-SOURCES sentence that states it. Two examples: the
  varsity-row total in `tests/clubs-file.test.ts` and README "Clubs", and per-team player counts in
  `tests/rosters-file.test.ts` and `tests/rosters-enrichment.test.ts`. Change the number to what
  the files now hold; never weaken an assertion.

List every repair in the report (step 6) with its reason. Dropping a record is a research decision
made after re-reading its sources, never a script's.

### 2. Research

Apply the linking rule exactly as §1.1j2 (clubs) and §1.1j3 (commitments) state it. The weekly
pass is incremental: it looks where something new shows up first, and each month it adds the
larger lists.

**Every week:**

1. **New rows.** For every player the roster runs added since the research files' last sweep (the
   PR comments' "Added" lines; rows that no research record mentions and that were created after
   the file's `capturedAt`):
   - the club-teams block of the player's MaxPreps career `/bio/` page (`careerClubTeamsData`);
   - a SportsRecruits profile-address probe in every sport;
   - NCSA and FieldLevel probes;
   - a web search for the name with the school and "field hockey" and, for juniors and seniors,
     another with "committed".
2. **Likely movers.** Every junior and senior with a linked recruiting profile (the overlay's
   `profiles`) or a club tie: re-open their SportsRecruits and NCSA profiles for a commitment line
   or a new club.
3. **Lists that announce first.**
   - FH College Path's class lists for the classes on the rosters.
   - Stick Together's posts since the last sweep (from its sitemap).
   - Club commitment pages: SF Hawks' alumni-and-committed table, NorCal Impact, Infinity, STEPS
     California, ADVNC Lacrosse and Lacrosse Masters.
   - The schools' athletics news.
   - The local and student papers' stories since the last sweep (their WordPress APIs, as in
     §1.1j3).
   - The NFHCA high school watchlist, when a new edition is out.
4. **Existing commitments.** Re-open each commitment's sources. A source that now says the player
   signed makes it `signed`, citing that source. A reported decommitment means re-checking and,
   when confirmed, dropping the commitment and saying so in the report.

**The first run of each calendar month, also:**

5. SportsRecruits' college pages ("Committed Athletes") for field hockey, women's lacrosse and
   women's soccer, and the profile behind each new class-of-2027-or-later California entry.
6. The other-sport databases §1.1j3 lists (TopDrawerSoccer's California lists, SoccerWire, ClubLax,
   MileSplit's California signings), for the classes on the rosters.
7. Every `current` club tie: does the club's current-players page, or the player's own profile or
   MaxPreps club block, still show the player? A newer page that names another club, or a listing
   gone stale, moves the tie's `status` per §1.1j2.

SportsRecruits' athlete search index (§1.1j3) was used once, with the owner's approval. Do not
query it on a weekly run.

### 3. Verify every addition or change twice

Before a new record, a new source or a changed field goes into a file, have two subagents re-read
it, working apart and given only the candidate and its URLs:

- a **checker**, who re-opens every source, applies the rule and copies each quote (at most 300
  characters) verbatim from the page as served;
- a **refuter**, told to break the match: another person of the same name, another sport, a quote
  not on the page, a stale or reversed commitment, a class year that disagrees, a social-media
  source.

Keep only what both confirm, and only the sources both confirmed. When they disagree, the more
conservative call stands and the record's `basis` says so (as for Gabrielle Moll in §1.1j2). Near
misses go in the report, never in a file.

### 4. Write

- Write records in the files' own shape (the schemas above), with `basis` saying what the match
  rests on.
- **`data/commits.json`**: set `capturedAt` to the run's date (the site prints it as the date the
  commitments were checked), and make sure `builtBy` says the file is kept by weekly sweeps
  (docs/WEEKLY-PEOPLE.md).
- **`data/clubs.json`**: leave `capturedAt` alone; it is the first sweep's date (`notes[5]`).
- Re-count and update together the tests that pin the research counts (`tests/clubs-file.test.ts`,
  `tests/commits-file.test.ts`, and `tests/ui/commit-view.test.ts` when the commitments page's lede
  moves) and the README ("Clubs", "College commitments") and DATA-SOURCES (§1.1j2, §1.1j3, §7)
  passages that state them.
- When the run added, changed or dropped a record, add one short dated paragraph to the "How it
  was done" part of §1.1j2 or §1.1j3: what was searched and what changed. A run that changed
  nothing is recorded only in its PR comment.

### 5. Gates

Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm assert:prerender` and
`pnpm assert:copy`. A new club adds a page, which `assert:prerender` counts; `assert:copy` fails if
a quote or a `basis` leaks into a page. All of them must pass before the push. The one exception is
a failure this branch cannot fix, which the report then names.

### 6. Push and report

- Commit one kind of change at a time: `data(rosters-overlay): …`, `data(clubs): …`,
  `data(commits): …`, each message saying what changed.
- Push to `data/weekly-people` (`--force` only in step 0's start-over case). If the push is
  rejected because the roster workflow pushed meanwhile, fetch, merge, re-run the tests and push
  again.
- If no PR is open, open one from `data/weekly-people` into `main` with the title above and a body
  that explains it is the weekly people-data PR. If one is open, comment on it.
- **The report**, as the PR comment:
  - Repaired
  - Added
  - Changed
  - Dropped
  - Near misses
  - Searched: each source family, with its count and date range
  - Not read: blocked or skipped sources
  - Gates: each with its result

  Each of the first five sections lists every record with its reason and its source links.
- If the run changed nothing and a PR is open, post a short comment ("Research YYYY-MM-DD: nothing
  new") with the Searched and Not read sections. If no PR is open, push nothing and open nothing.
