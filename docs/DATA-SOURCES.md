# Data sources — California girls varsity field hockey (season "26-27")

Condensed from the build-time research spec and amended for the nine-league site: in Northern
California SCVAL, BVAL and PCAL in the CIF Central Coast Section, MCAL in the North Coast Section and
EAL in the Northern Section; in Southern California the Sunset in the Southern Section, the City,
North County and Metro conferences in the San Diego Section, and the Southern Section's five
independents, Bonita, Chaminade, Glendora, Harvard-Westlake and Thousand Oaks, schools in no field hockey
league whose games against each other are the group's table (102 teams; DESIGN §24, §24.9, §24.10).
Confidence tags: **[V]** independently verified against a live response or document; **[U]**
claimed but not independently re-verified; **[L]** likely: read only in search snippets or a
secondary source, because the page itself was unreachable (added 2026-10-29); **[TODO]** open item.
Values below were captured/verified 2026-09-28 to 2026-10-04; the EAL's captures, and every EAL line
below, are 2026-10-04; the Southern California captures, and every Sunset and San Diego line below, are
2026-10-06 unless dated otherwise; the postseason lines of §1.4, §5.5 and §5.6 were re-read on 2026-10-29.

See also `docs/LEAGUE-RULES.md` (each league's points, tiebreak chain, postseason and the by-law
citations), `docs/BYLAWS-2026-27.md` (the verified SCVAL by-laws, which override anything below
that touches SCVAL ordering) and `lib/league-config/` (every league constant as shipped; the season
ids are in `lib/sports/field-hockey.ts`, exported through `lib/season.ts`).


## 1. Sources, ranked

### 1.1 PRIMARY — MaxPreps "ghost API" (`https://production.api.maxpreps.com`)

Unauthenticated, CORS-open JSON, no key/cookie/Referer required **[V]**.
`robots.txt` = `User-agent: *\nAllow: /` **[V]**. No Swagger/OpenAPI; routes were recovered by
grepping the Next.js asset bundle (module 176360) for `production.api` **[V]**.

**(a) League standings** — `GET /leagues/{leagueId}/standings/v1?sportseasonid={sportSeasonId}`.
Envelope `{status, message, cacheResult, data, warnings, errors}`. Per row: `schoolId` (primary
key, same GUID as `teamId` elsewhere), `schoolName`, `schoolNameAcronym`, `teamCanonicalUrl`,
`schoolColor1/2`, `conferenceWins/Losses/Ties`, `overallWins/Losses/Ties`,
`conferencePoints/PointsAgainst`, `points/pointsAgainst`, `conferenceStandingPlacement`,
`conferenceWinningPercentage`/`winningPercentage`, `streak`+`streakResult`, home/away/neutral
splits, `overallContestsPlayed`/`conferenceContestsPlayed`, `modifiedOn`. `b1`…`b30` are opaque
stat slots — ignored. **[V]**

`modifiedOn` is **null on a zero-game row**: Red Bluff's row in the EAL table (2026-10-04) is the one
schema violation in all seven EAL rows (`data.6.modifiedOn: null`); every other row, and every league
meta, schedule and contest-id response, parses with the repo's schemas. The schema now reads null as
`''` and the reported-table step skips an empty value when it picks a table's newest modification
date, so one such row no longer rejects a whole table. **[V]**

**(b) Team schedule + scores** — `GET /gatewayweb/react/schedule-calculated/v1?teamId={id}&sportSeasonId={ssid}`.
Envelope `{status, message, cacheResult, data}`; each row `{contest, calculatedFields, hudlInfo,
goFanUrl, nfhsStreamUrl}`. Key paths: `contest.contestId` (dedupe key), `contest.date` (naive
local `America/Los_Angeles`), `calculatedFields.contestDateInGMT` (UTC twin),
`calculatedFields.contestState` (see enum below), `calculatedFields.canonicalUrl` (null on
deleted rows), `calculatedFields.description` (ready-made recap prose, `""` on deleted rows),
`calculatedFields.overtimePeriodsPlayed`, `calculatedFields.bracketName/bracketGameIndex/
bracketIsPublished/tournamentName/tournamentCanonicalUrl` (all null in the regular season — this
is how CCS playoff games will arrive). `contest.teams[]` is always 2 entries: `.score` (null
before the game), `.result` (`W`/`L`/`T`, null before), `.homeAwayType`, `.contestType`,
`.isForfeit`/`.isTeamTBA`/`.dnp`/`.isDeleted`, `.teamId`, `.teamCanonicalUrl`. Display string
for a team's result comes from `calculatedFields.teamsCalculated[]` (`.resultString`, e.g.
`"L 2-1"`) — `contest.teams[].resultString` is usually null. **[V]**

*Box-score slots.* A schedule row's box-score fields are opaque `b1`…`b7` slots and the repo's
`ScheduleRow` schema does not parse them. Observed for field hockey on the EAL's 2026-09-28 Chico
1, Davis 1 game (`9afebd05-777b-4c8a-82d5-c41b556788bb`, result flags `W`/`L`, `resultString` `W 1-1`,
`overtimePeriodsPlayed` 0): `b1` and `b2` are the two halves, `b3`…`b6` overtime periods, and `b7`
the game page's "SO Win" column (Chico 2, Davis 1), which is a 1 v 1 tally. That mapping is
confirmed on one game only, so it is **not encoded**: no tally is stored and the site says it does
not show one (DESIGN §22.8). **[V] for that one game; [U] as a rule.**

**(c) Contest ids grouped by date** — `GET /gatewayweb/react/contest-ids-grouped-by-date-by-context/v2?context=league&id={leagueId}&genderSport=girls,fieldhockey&level=Varsity&excludeTbaDate=true&nationalTeamCount=25`.
Researched, not used: the pipeline never calls it (it reads each team's schedule feed instead).
`data.contestIdsByDate[]`,
`data.scoreboardCanonicalUrlToday`/`UrlTomorrow`/`UrlYesterday`. **[V]**

**(d) Scoreboard contests by ids** — `POST /gatewayweb/react/scoreboard-contests-by-ids/basic/v2`,
body a bare JSON array of contest ids. Batch score refresh, no auth. ⚠️ `teams[0]` is **not**
confirmed to be the home team — derive home/away only from `schedule-calculated`'s
`teams[].homeAwayType` **[U]**.

**(e) Team context** — `GET /gatewayweb/react/team-context/v1?teamId={id}&sportSeasonId={ssid}`
→ ~738 KB (carries the school's whole sport-season history — never parse it wholesale; use (f)
for standings). `data.teamData.leagueId/leagueName/sectionId/sectionName/allSeasonId/
sportSeasonId/year/season/level/stateCode`, plus freshness probes
`data.teamSettings.scheduleUpdatedOn`/`.standingsUpdatedOn`. **[V]**

**(f) League metadata & small helpers**
- `GET /leagues/{leagueId}/v1` → `{leagueId, name, sportSeasonId, sportSeasonName, year, season,
  sectionId, sectionName, canonicalUrl, ...}` — used to assert the season key still matches
  before trusting anything else.
- `GET /gatewayweb/react/team-standings/v1?teamId=&sportSeasonId=` → **rejected**, only a 3-row
  window (`data.maxCount === 3`), not the full table.
- `GET /gatewayweb/react/menus/league-links/v1?leagueid=`, `/gatewayweb/react/jsonld/team/v1`
  (string-encoded JSON, needs a second parse).

**(g) Enum meanings**

| Field | Value | Meaning | Confidence |
|---|---|---|---|
| `teams[].homeAwayType` | `0` | home | **[V]** |
| | `1` | away | **[V]** |
| | `2` | neutral (both sides `2`; `lib/pipeline/normalize.ts` reads it as `site: 'neutral'`) | **[V]** observed 2026-10-29 on 2025 postseason rows: both rows of the 2025 EAL Super Regional (Nov 1 2025; a real capture, `tests/fixtures/maxpreps/postseason-2025/sched-davis-2025-super-regional.json`) and both sides of the 2025 CCS Division 1 final at Los Altos HS (`e6091e07`, Los Gatos's feed, transcribed; §1.4). Not seen on a regular-season row |
| `teams[].contestType` | `0` | league/conference game | **[V]** 21/21 agreement with prose |
| | `1` | non-conference | **[V]** |
| `calculatedFields.contestState` | `0` | unknown | **[U]** not observed |
| | `1` | **Deleted** — `canonicalUrl` null, may still carry a real score (observed: a scrimmage with a 0-4 score) — **must be dropped before constructing a `Game`** | **[V]** |
| | `2` | Pregame / scheduled | **[V]** |
| | `3` | ContestInProgress (live): observed on three Southern California contests dated 2026-10-05, read that evening (~17:05 PT) while they were being played or had just ended: Otay Ranch at Eastlake `601ffe30-7e13-4bac-92f0-d03c53bac7ea`, Chaparral at Temecula Valley `37865d67-1dd6-480f-b1ca-e36d2bb275e9`, University City at Point Loma `c65dd446-70ac-4df9-9859-b6c62a81b091`. `lib/pipeline/normalize.ts` reads it as `live` | **[V]** 3 contests, 2026-10-05 |
| | `4` | Boxscore / final | **[V]** |
| | `5` | ScoreNotReported | **[V]** |
| `contest.dateCode` | `0` | date+time known | **[V]** |
| | nonzero | one of DateTBA/TimeTBA/DateTimeTBA, mapping unconfirmed — always trust `calculatedFields.isDateTba`/`.isTimeTba` instead | **[U]** |

**(h) Season-bootstrap recipe** (run once per season — `scripts/discover-season.ts`, never
hardcode): fetch `https://www.maxpreps.com/ca/field-hockey/`, extract `__NEXT_DATA__` (⚠️ the
tag has `crossorigin="anonymous"` **between** `id` and `type` — a naive regex assuming `type=`
follows `id=` immediately will fail); read `.query.ssid`/`.query.allSeasonId`/
`.query.gendersport`/`.query.teamLevel`. Resolve both leagueIds via `team-context/v1` on one
known team per division. Assert `leagues/{id}/v1.sportSeasonId` and `.year` match. Fallback team
enumeration: `https://www.maxpreps.com/ca/field-hockey/schools/` →
`__NEXT_DATA__.props.pageProps.groupings[]` (all-time list, not current-season). ⚠️ The year
segment of a MaxPreps league URL is cosmetic — `/25-26/league/...` still serves the current
26-27 table. A past season's *standings* come only from the leagues' own documents (scval.com
PDFs, BVAL's sheet); its *games* do come from the ghost API, by season id (see (l)).

**(i) HTML fallbacks** (only if the ghost API is withdrawn): league standings pages
(`props.pageProps.layoutProps.tableData[]`), team schedule pages (positional-array contest/team
tuples, schema recovered from webpack module `deserializeContestList` — pin behind an adapter
with loud assertions), rendered `table tbody tr` (stable selectors: `span.hat/.name/.result/.score`
— never styled-components class hashes), legacy scoreboard pages, individual game pages
(`application/ld+json`, `@type: SportsEvent` — the only source of a game's street address; fetch
lazily, one request per game, never in the scheduled run).

**(j) Team rosters** — `GET https://www.maxpreps.com/<teamCanonicalUrl path>/roster/` (HTML; captured
and verified 2026-10-02). There is **no ghost-API roster endpoint**: `gatewayweb/react/team-roster/v1`,
`roster/v1` and `team-roster/v2` all 404 **[V]**. The page's `__NEXT_DATA__` → `props.pageProps` carries
`countData {teamId, sportSeasonId, athleteCount, staffCount}`, `schoolId`, `canonicalUrl` and
`athleteData`: an array of **38-element positional arrays** (37 until MaxPreps added `isClaimed`, between
2026-11-10 and 2026-11-12), one per athlete — the same tuple encoding
as the schedule page (1.1i), so it is pinned behind an adapter with loud assertions
(`lib/sources/maxpreps-roster.ts`, written by `scripts/fetch-rosters.ts` to `data/field-hockey/rosters.json`).

**Scope: every registry team, all nine leagues and the five independents (102).** The roster page is the same page for a team
of any league, so `scripts/fetch-rosters.ts` walks the whole registry (`TEAMS`), and
`data/field-hockey/rosters.json` (`lib/players/rosters-schema.ts`) holds exactly one entry per team, in registry order,
each carrying its registry id and division. Everything below that says "captured 2026-10-02" was
verified on the 15 SCVAL pages, the only ones captured then. All 43 pages of the four earlier
leagues were then read live on 2026-10-03 with the same adapter, unchanged: 37 teams ok (745
players), 6 empty (Del Mar, Silver Creek, Sobrato, Monterey, Santa Catalina, Marin Academy:
MaxPreps' own athleteCount is 0), 0 failed, and SCVAL's rows were identical to the 2026-10-02 ones.
The six EAL pages were read on 2026-10-04 (`fetchedAt` 2026-10-04T06:07:08.874Z) with the adapter
unchanged: 5 teams ok (95 players: Bella Vista 19, Chico 20, Davis 19, Lassen 15, Pleasant Valley
22), 1 empty (Corning: `athleteCount` 0, `staffCount` 2), 0 failed, and 7 soft-deleted rows dropped
(Davis 2, Lassen 4, Pleasant Valley 1). The file then held 49 teams and 840 players (538 with a
grade, 47 captains). Seven of the 28 new pages are kept as fixtures
(`tests/fixtures/maxpreps/roster-{leigh,greenfield,del-mar,stevenson,monterey,
university-sf,marin-catholic}.html`, tested by `tests/maxpreps-leagues.test.ts`). The adapter throws
on any positional drift (a failed team keeps its previous rows or is `error`, never a guessed row).
A team's `status` says what its `players[]` are: `ok` (read this run), `empty` (page read, MaxPreps
lists nobody), `carried-forward` (this run failed; the previous file's rows, with their own
`fetchedAt`), `error` (failed, nothing to carry) or `pending` (no run has covered the team: nothing
fetched, nothing claimed). `pending` is the honest placeholder the file was seeded with for BVAL,
PCAL and MCAL (and what `--leagues` leaves for a team the file has no row for) until a run read
them; the team page says "has not been collected yet" for it.

`pnpm fetch-rosters --leagues bval,mcal` was run again on 2026-10-07 (21 teams, 0 failed): Marin
Academy, empty on 2026-10-03, now lists 18 players with grades (they agree with the school's own
first-name-and-initial list; the overlay note says how); Westmont added Kaylee True, Lexi True and
Savannah Murdoch; Tamalpais dropped Layla Goldstein, renamed Margaret "maggie" Maher to Maggie Maher
and swapped Tashi Perkins' and Lauren Townsend's numbers (11 and 20). Nothing else changed in either
league. The 21 added rows were swept the same day for school sources, recruiting profiles, clubs and
commitments (see the overlay's, `data/field-hockey/clubs.json`'s and `data/field-hockey/commits.json`'s notes): two NCSA profiles
(Kaylee and Lexi True), one club tie (Kaylee True to Fly FHC), no commitment, and a grade conflict for
Julia Foulke, whom MaxPreps' 2026-27 roster calls a senior while the school's list and MaxPreps' own
earlier rosters put her in the class of 2028 (MaxPreps kept, as the overlay rule says). A read of the
other leagues the same day (not written) found no player added, removed or changed. The file holds 1,702 players on
88 of the 102 teams.

The previous file is salvaged row by row (`readPreviousFile` in `scripts/lib/team-scope.ts`): each row is
held to the team schema on its own, and a row that no longer validates (a slug gone from the
registry, a changed id or division, a broken status, or two rows claiming one team) is dropped and
named in the log. That team alone has nothing to keep: it is `pending` if the run does not cover it
(its league line says so, and the run exits 1) and `error` if the run covers it and the fetch
fails. A previous file from another season is ignored as if absent: last season's rows are never
kept or carried forward. A previous file that is not JSON (or has no `teams[]`) stops the run: exit
1, nothing written. A file with fewer teams than the registry (the 15-team file this one grew from)
still counts; the teams it lacks are pending.

Failures are scoped to the team, and `--leagues scval,bval` scopes a run to leagues as
`fetch-data --leagues` does: a league outside the run keeps the previous file's valid rows as they
were, and one league's pages failing never stops another's from being read and written. The exit
code is 1 when a team the run covered failed, or when a team outside the run lost its previous row
(it is pending now), so a scheduler notices either; the file is written regardless.
`--capture <dir>` saves every page read as `<dir>/roster-<slug>.html`, the fixture layout
`--fixtures` and `tests/fixtures/maxpreps` use.

The column names are MaxPreps' own **[V]**: the roster page component does
`deserializeArray(GSSP_ROSTER_SERIALIZE_KEYS, athleteData)` with `obj[KEYS[i]] = row[i]`. KEYS, verbatim, as
recovered 2026-11-13 from build `9db88398-95010d6e` (`asset.maxpreps.io/_next/static/chunks/0fl_-9l0zjx0n.js`, one
of the scripts the roster page loads; `_buildManifest.js` → `/team/roster` names only a loader stub now):

```
 0 linkedAthlete       8 jersey            16 isCaptain          24 hasPhoto           32 canonicalUrl
 1 linkedParents       9 heightInches      17 isDeleted          25 rosterId           33 formattedPositions
 2 canStartChat       10 heightFeet        18 photoUrl           26 schoolId           34 formattedName
 3 accountInformation 11 weight            19 secondaryPhotoUrl  27 sportSeasonId      35 formattedHeight
 4 athleteId          12 position1         20 weightClass        28 sportSeasonName    36 calculatedHeight
 5 firstName          13 position2         21 isPlayerOfTheGame  29 careerProfileId    37 formattedClassYear
 6 lastName           14 position3         22 isFemale           30 isClaimed
 7 classYear          15 hasStats          23 bio                31 createdOn
```

**`isClaimed` (index 30) is new.** Build `77480dfe-046b5bf4` (chunk `1x2mehrsrg-g8.js`, recovered 2026-10-02)
had the other 37 keys in the same order; every capture in `tests/fixtures/maxpreps` is in that layout. By
2026-11-12 every roster read failed the row-length check, as designed, until the new list was recovered. A
claimed row renders a "Claimed profile" badge after the player's name (an icon and a visually hidden
`<span> Claimed profile</span>` inside the name link), which the table reader cuts from the name and
holds to `isClaimed`. The adapter reads a row with the list of its own length (`ROSTER_LAYOUTS`: 38, or the
2026-10 37) and throws on any other, or on a page mixing them; in the 38 layout `isClaimed` must be a
boolean, which pins the shift. `tests/fixtures/maxpreps/roster-layout-2026-11-st-ignatius.html` is a capture in
the current layout (St. Ignatius field hockey, 23 players, read 2026-11-13).

Gotchas, all **[V]** on the 2026-10-02 captures (342 rows, 16 teams):
- `isDeleted` rows are soft-deleted: the public table hides them (`useRosterAthletes` →
  `.filter(a => !a.isDeleted)`) and `athleteCount` excludes them. **Drop them first.** One exists
  (Santa Clara: 17 rows, 16 shown).
- **Stat-entry placeholders** (girls volleyball, 2026-10; `lib/players/placeholder-name.ts`): when a stat
  keeper enters a match for a number not on the roster, MaxPreps creates an athlete for it on the spot —
  `firstName` null, `lastName` `"Player #4"`, no grade or position, a career page of its own
  (`/athletes/player-4/`) — and it shows on the roster. MaxPreps builds `formattedName` as
  `${firstName} ${lastName}`, so it and the table both print **`"null Player #4"`**. The cross-check runs
  on that spelling; then `parseRosterPage` drops the "null", keeps the row as `"Player #4"` and names it
  in a warning, and its stat lines join to it as any row's do. Where another source ties a name to the
  number, `data/field-hockey/rosters-enrichment.json` fills it (`name`), as it fills any blank; an unnamed one never
  becomes a registry player (the number may be anyone's). Seven teams had them on
  2026-11-14 (Mitty, Milpitas, Gilroy, St. Ignatius, King's Academy, Castilleja, Priory: 27 rows).
  A search that day (school sites, MaxPreps' JV, freshman and earlier rosters and box scores, Hudl, news)
  named two: Gilroy's #11 Anjelica Llamas and #12 Grace Gnagne, from the team's own Hudl roster (overlay
  kind `hudl`). The others stay "Player #N"; each team's overlay `notes` say what was looked at and which
  candidates were left out (a JV player with the same number is not evidence she played varsity, and
  St. Ignatius' #20 is very likely a rostered player's old number). The stats read API shows a found name
  on the stat lines and box scores too. `tests/fixtures/maxpreps/roster-volleyball-2026-11-mitty.html` is
  Mitty's page with five.
- `classYear` is the grade (9–12 here; 5–8 exist for middle school), `formattedClassYear` its label
  (`Fr.`/`So.`/`Jr.`/`Sr.`, `""` when blank; the table prints `-`). `jersey` is a **string** (`"00"`,
  `"21/88"` occur). Position is `position1..3` joined with `", "` = `formattedPositions` (e.g. `F, M`).
  Height is `heightFeet`'`heightInches`" (table: `5'7"`; `formattedHeight` has a space: `5' 7"`;
  `calculatedHeight` is total inches). `isCaptain` renders the Captain badge. `createdOn` is when the
  row was created — there is no modified stamp. `isFemale` is `false` on every girls' row: meaningless.
- Ids: `athleteId` and `rosterId` are **per-season**; `careerProfileId` is the stable person id, and
  the `?careerid=` in `canonicalUrl` is its short form. `schoolId` == `countData.teamId` == the
  team GUID. `sportSeasonId` is the season assertion.
- The server-rendered `<table>` (`#`, `Player`, `Grade`, `Position`, `Height`; the Player cell is an
  `a.name` link to `canonicalUrl`) is the human-facing rendering of the same rows and is the
  cross-check: `parseRosterPage` throws on any disagreement. **Match rows by career link, not
  order** — the table sorts by jersey with blanks first, so its order differs from `athleteData`'s
  on some teams (Mitty).
- Coverage is whatever the coach entered. 2026-10-02: 5 programs publish grade + position + number
  (St. Ignatius, Saint Francis, Fremont, Mitty, Palo Alto), 3 publish grade + number only (Valley
  Christian, Presentation, Monta Vista), 7 publish names only (Cupertino, Homestead, Los Altos, Los
  Gatos — 58 names, likely the whole program — Lynbrook, Santa Clara, Saratoga), Wilcox published
  nothing (`athleteCount 0`, no table) and has since been dropped from the registry as not fielding
  a team. Only Saint Francis (25) and one Palo Alto row carry a height.
  `staffCount` is non-zero on most pages but the coaches are **not** in `pageProps` (they load
  client-side on `/team/staff`; untested).
- Budget: one 180–340 KB page per team, 102 requests (99 before the independents joined; 49 before the Southern California leagues joined; 43 before the EAL; 15 for SCVAL alone,
  `--leagues scval`), at
  the primary client's courtesy ceiling (≤3 concurrent, ≥500 ms between starts). Not in the
  twice-daily cron — rosters change a few times a season; run `pnpm fetch-rosters` by hand or
  weekly.

**si.com rosters (`.../teams/{id}-{slug}/players`, react class `teamPlayers/Index`)** were captured
alongside and **rejected as a source**: `query.team.teamPlayers.nodes[]` carries names only (no
jersey/position/class on any node for any SCVAL team), is paginated 24 at a time with a client-side
"load more" that the `?page=`/`?after=` query forms do not drive, 404s for Valley Christian, and on
several teams lists a **different set of names** from MaxPreps: the paginated lists for St.
Ignatius, Fremont, Palo Alto and Wilcox include male-typical names (0/24, 0/24, 3/24 overlap), and
Saint Francis's 24 names are exactly the school's **2025-26** roster. Useful only as a name
cross-check (17/17 for Los Altos, 13/13 for Cupertino).

**Beyond MaxPreps — school athletics sites (`data/field-hockey/rosters-enrichment.json`).** The overlay has one
entry per registry team (102), joined on `slug + athleteId`; its rules below hold for every league.
SCVAL was swept on 2026-10-02 and BVAL, PCAL and MCAL on 2026-10-03 (the second sweep's tables
follow the SCVAL one). The six EAL entries, added 2026-10-04, hold **recruiting profiles only** (the
"Players' own recruiting pages" sweep below, run the same day): no coaches or sources, and each
team's note says the school-athletics roster sweep has still not been done. They fill no MaxPreps
field, and a team page says nothing about other sources (`otherRosters` is absent, "not checked").
The 53 Southern California entries, swept 2026-10-06, are the same: recruiting profiles only. On the 2026-10-04 MaxPreps rows alone, the EAL's 95 players have 95 grades and
95 numbers, 56 positions and 7 heights. What a team page with no MaxPreps players says about other sources is
recorded per team, not inferred: `otherRosters` (validated in `lib/players/rosters.ts`) is `none` (looked,
no current roster anywhere: Del Mar, Silver Creek, Sobrato, Monterey, Santa Catalina), `partial`
(a source lists current players in a form that cannot be joined, with a link: Marin Academy's
school page, 18 players as first name, last initial and class year), `listed` (a source publishes the whole
current varsity list with full names, transcribed as written into `players`, each `{firstName, lastName,
position}` with the source's own position text or null) or, when absent, not checked.
Only `none` lets the page say "no other public source we checked has a current roster". A `listed`
list is shown, in the source's order and under its `summary` and link, only while MaxPreps lists nobody
for the team; it has no athleteId, so it joins no club, commitment, profile or stat, and it is not in
`data/players.json`. Two since 2026-11-26, both **[V]** that day, each read twice: Marina
(https://www.marinavikingsathletics.org/varsity/field-hockey/roster, the school's athletics site with
the year on 2026-27 and level Varsity: 20 names, no number, grade or position; the 2025-26 view is empty)
and Newport Harbor (http://newportharborfieldhockey.com/?page_id=193, the team's site the school's
athletics page links, http only: "2026 Varsity Team", 20 names as "Last, First", two marked GK; posted
2026-08-01 as the preseason list). The same day's search found nothing current outside MaxPreps for the
other ten empty field hockey teams (school sites, Hudl, league all-league lists, local and school papers),
and school-paper game stories naming 14 Fountain Valley and 3 Bonita Vista players, too few to stand for a
roster and not recorded; those ten entries are unchanged. A `listed` player may carry `profiles` (the same
PlayerProfileSchema, at most one per platform and sport, never a MaxPreps page). With no grade to check a class
year against, a page is linked only when it names the player and the school; the 2026-11-26 sweep linked 15 for
13 of the 40 (rosters-enrichment.json, its last file note). A listed player's club tie is in `clubs.json`
`listedAffiliations` (§1.1j2, "Listed players' ties"): Anna Schwab and Kate Shepherd, both VCRD. The
coaches and sources found for such a team still show under its empty state. Where a coach left
MaxPreps blank, the school's own public roster often is not. A one-off sweep on 2026-10-02 (16
teams; official athletics sites, one roster PDF, two school papers, MaxPreps career and JV pages)
found these for SCVAL, all **[V]** against the page on that date:

| School | Source | Publishes |
|---|---|---|
| St. Ignatius | `siwildcats.com/sports/field-hockey/roster` (Sidearm) | grade, **height**, number; no position; +1 manager |
| Saint Francis | `sfhsathletics.com/sports/field-hockey/roster` (Sidearm) | grade, position (`M/D`-style), height, number — agrees with MaxPreps 25/25 |
| Valley Christian | `gowarriors.net/sports/field-hockey/roster` (Sidearm) | number only (29 of MaxPreps' 30) |
| Cupertino | `chs.fuhsd.org/student-life/athletics/fall-sports/field-hockey` (Finalsite) | varsity **and** JV lists with grade; no number/position |
| Los Gatos | `losgatosathletics.org/sport/field%20hockey/girls/?tab=roster` (VNN; JV via `/sport/RefreshRosterAthleteStyle2ViewComponent/{teamId}?schoolYear=`) | varsity 27 + JV 33 with grade — proves MaxPreps' 58-name "varsity" page is the whole program |
| Presentation | `presentationhs.org/…/26-27_Rosters/2026-27_Field_Hockey_Roster.pdf` | number + graduation year (→ grade); no position |
| Santa Clara | `schsathletics.com/varsity/field-hockey/roster` (Home Campus) | grade; no number/position |
| Saratoga | `shs-athletics.com/varsity/field-hockey/roster` + `/player/<slug>/` (Home Campus) | names; grade only on the per-player profile ("Grade N", **not season-dated** — one was stale) |
| Lynbrook | `lynbrookvikings.com/varsity/field-hockey/roster/` + `/player/<slug>/` (Home Campus) | names; grade on the profile; a profile-level position for 4 |
| Monta Vista | `matadorathletics.org/varsity/field-hockey/roster` + `/player/<slug>/` (Home Campus) | names; grade (agrees with MaxPreps 16/16); a number that **differs from MaxPreps for 6 of 16** |
| Los Altos | `lahs.mvla.net/field-hockey` | coaches only — no roster anywhere; `lahstalon.org` previews name 4 seniors |
| Homestead | `homesteadmustangs.com/sport/girls-field-hockey/roster?team=…&year=2026-2027` (PlayOn) | "No roster" for both levels; MaxPreps' JV page carries one varsity player's grade |
| Palo Alto | `palyathletics.com/sport/field%20hockey/girls/?tab=roster` (VNN) | names only; `palyvoice.com` preview names the captain |
| Fremont, Mitty | not sought | MaxPreps already complete bar height |
| Wilcox | `wilcox.santaclarausd.org/athletics` | field hockey absent from the fall sports list; no roster anywhere (not fielding a team; since dropped from the registry and both roster files) |

**BVAL, PCAL and MCAL, swept 2026-10-03** (official athletics sites, school and local papers, MaxPreps team,
career and JV pages; each filled value was re-checked against its cited page, see the spot-check
below). Fills and links by team, measured from the file; "MP rows" is MaxPreps' 2026-27 player count:

| Team | MP rows | Grades filled | Positions filled | Profiles | Conflicts | What the sources were |
|---|---|---|---|---|---|---|
| Branham | 17 | 0 | 0 | 0 | 0 | School Google Doc roster (17 names + grade) agrees with MaxPreps on all 17; coaches |
| Christopher | 20 | 0 | 0 | 4 SR | 0 | Coach only; no school roster |
| Gilroy | 17 | 0 | 0 | 2 NCSA | 0 | Coach only; no school roster |
| Leigh | 20 | 0 | 0 | 3 (2 NCSA, 1 SR) | 0 | School page is stale (not used) |
| Leland | 20 | 18 | 0 | 0 | 4 | `lelandathletics.com` per-player pages ("Grade N"); two grades left blank where sources disagree |
| Willow Glen | 27 | 0 | 1 | 2 SR | 0 | `willowglenathletics.com` roster (Home Campus) agrees with MaxPreps on all 27 numbers and grades; one goalkeeper position |
| Live Oak | 14 | 4 | 0 | 0 | 0 | Grades derived from other-sport class years on MaxPreps career pages |
| Prospect | 21 | 0 | 0 | 0 | 0 | Coach only |
| Westmont | 17 | 0 | 0 | 1 SR | 0 | Official VNN roster is empty for 2026-27 |
| Del Mar, Silver Creek, Sobrato | 0 | 0 | 0 | 0 | 0 | No MaxPreps players, no school roster (Sobrato's page is 2024-25) |
| Carmel | 19 | 0 | 0 | 0 | 0 | Head coach from the school directory |
| Greenfield | 12 | 0 | 0 | 0 | 0 | No public source beyond MaxPreps |
| Hollister | 16 | 0 | 3 | 1 NCSA | 1 | BenitoLink 2026-09-25: three captains' positions; one grade disagreement kept as MaxPreps |
| Salinas | 21 | 17 | 0 | 0 | 6 | `salinascowboys.com` per-player pages; four grades left blank where sources disagree |
| Stevenson | 14 | 0 | 0 | 2 Hudl | 0 | Coach; Hudl links |
| Monterey, Santa Catalina | 0 | 0 | 0 | 0 | 0 | MaxPreps rosters empty; no school roster found |
| Archie Williams | 20 | 6 | 0 | 2 NCSA | 0 | The Pitch (2024, 2025) class years, MaxPreps career pages |
| Redwood | 19 | 14 | 0 | 0 | 5 | Redwood Bark (Sept 2026), MaxPreps 2025-26 and 2024-25 rosters; two grades left blank where sources disagree |
| Tamalpais | 21 | 0 | 0 | 4 (2 SR, 2 NCSA) | 0 | Team Google Sites page did not load |
| Berkeley | 15 | 13 | 1 | 0 | 2 | MaxPreps JV and career pages; Berkeley High Jacket 2026-09-25; one grade left blank where sources disagree |
| Lick-Wilmerding | 18 | 0 | 0 | 2 (1 SR, 1 NCSA) | 1 | `m.lwhs.org` roster (15 names, graduating year, hometown) agrees except one grade |
| University | 18 | 0 | 0 | 5 (4 SR, 1 NCSA) | 0 | School athletics site returned HTTP 500 |
| Marin Catholic | 20 | 10 | 0 | 0 | 0 | `marincatholic.org` team page (graduating year → grade) |
| Convent | 18 | 0 | 0 | 1 SR | 0 | MaxPreps already complete |
| Marin Academy | 0 | 0 | 0 | 0 | 0 | School list (18 players) is first name, last initial and class year only; MaxPreps had no rows to join (its 18, which agree with the school list but for Julia Foulke's class year, appeared on 2026-10-07 and were swept that day: nothing found) |

Where nothing could be filled, the entry still records the coaches found and a note saying what
was looked at. Grades that two sources disagree on are left blank rather than guessed (Leland 2,
Salinas 4, Redwood 2, Berkeley 1), and the disagreement is recorded in one place, the player's
`conflicts`, one entry per disagreeing source with `kept: null` (Leland 4, Salinas 6, Redwood 5,
Berkeley 2). The one blank grade with no second source, Salinas' Teagan Dickison Elias (her school
page merges two profiles, grades 11 and 10), is explained in the team's notes. A source that
disagrees with a value MaxPreps has is a conflict too, with MaxPreps' value kept (Hollister 1,
Lick-Wilmerding 1), so these three leagues carry 19 conflicts. **Prior-season positions are not filled**:
MaxPreps' `/25-26/roster/` pages for BVAL and PCAL teams exist (unlike the SCVAL sweep, where
they were empty) and list positions for 33 returning players (Christopher 5, Leland 8, Westmont 9,
Hollister 3, Salinas 8), but positions change between seasons (Carmel's Hayden Murillo was M,
now F), so none was written. `m.lwhs.org`'s certificate does not cover the host: its URL is
stored as `http`.

Spot-check, 2026-10-03: before the BVAL, PCAL and MCAL records were merged, 25 of them were
re-fetched against their cited URLs (Leland and Salinas player pages; Marin Catholic's team page; Willow
Glen's roster; BenitoLink, the Berkeley High Jacket, the Redwood Bark and the Archie Williams Pitch
articles; MaxPreps career, 2025-26 and JV roster pages for Live Oak, Berkeley and Christopher (the last for a position that was then dropped);
Lick-Wilmerding's roster; SportsRecruits, NCSA and Hudl profiles). All held: no record was dropped
for being wrong. The only thing removed was the 33 low-confidence prior-season positions described above.

Rules of the overlay, enforced by `lib/players/rosters-schema.ts` and re-checked against the base file in
`lib/players/rosters.ts` at load: it joins on `slug + athleteId` (MaxPreps rows only — a school-only name is
counted, never added); it fills a field **only where MaxPreps is null**; where a source disagrees
with MaxPreps (SCVAL: 9 numbers, 1 position, 1 grade; BVAL, PCAL and MCAL: 2 grades) MaxPreps stays and the disagreement is stored under
`conflicts`, which also hold, with `kept: null`, the sources of a grade left blank because they
disagree with each other (17 entries for 8 BVAL, PCAL and MCAL players), and, since 2026-11-21, a grade conflict
marked `rosterBehind` where a page shows MaxPreps' roster still carries last season's grade (§1.15);
every filled value carries `kind`, `source` URL and `confidence` (`high` = an official
2026-27 school roster or MaxPreps' own data for the same career; `medium` = a profile field that is
not season-dated, a school-paper statement, or a grade **derived** from a dated MaxPreps class year
plus the years elapsed, flagged `derived: true`; `low` = a profile field not tied to the season).
Net on 2026-10-02 for SCVAL: 133 grades, 9 positions, 23 heights and the Los Gatos varsity/JV split added to
the 341 MaxPreps rows → 303 with a grade, 108 with a position, 49 with a height. Net on 2026-10-03
for the other leagues (MaxPreps alone → with the overlay): BVAL 173 players, grades 139 → 161,
positions 63 → 64; PCAL 82 players, grades 49 → 66, positions 32 → 35; MCAL 149 players, grades 85 →
128, positions 62 → 63; no height or jersey in any of them (three grades first filled on 2026-10-03
were blanked when their sources were found to disagree: Leland's Michaela Reichmuth, Redwood's
Audrey Dickerman and Eloise Tonderys). All four leagues together (2026-10-03): 745 players, 443 → 658 with a
grade, 256 → 270 with a position, 26 → 49 with a height, 424 with a number (unchanged). Position coverage
is the real gap: **no current-season public source lists positions** for 8 of the 16 SCVAL programs
and for most BVAL, PCAL and MCAL programs.
MaxPreps' per-level pages (`/jv/roster/`, `/freshman/roster/`) and prior-season pages
(`/25-26/roster/`) were empty for every SCVAL team checked in the 2026-10-02 sweep except Homestead
JV (25), Palo Alto JV (25), Monta Vista JV (12) and Los Gatos JV (2). That does not hold for the
other leagues. 2026-27 JV pages list players for Leigh (18), Tamalpais (22), Greenfield (3) and
Salinas (1: Lillian Isbell, who is also on varsity), all read 2026-10-03; one Leigh career
(`k2kl80co8kck4`) is varsity "Adriana Yam" #43 G and JV "Ayva Garcia" #44 G, and the varsity row is
the one used. 2025-26 roster pages exist for BVAL, PCAL and MCAL teams and are where most derived
grades come from (Leland, Redwood, Berkeley); Carmel's lists 8 of its 19 current players, every
grade agreeing a year on (MaxPreps already has all 19, so nothing is filled). The labels on the
page name such a page by its URL ("MaxPreps 2025-26 roster"), although the overlay files it under
the `maxpreps-career` or `maxpreps-jv` kind. This sweep is not a script: re-running it is research.

**Players' own recruiting pages (`profiles` in `data/field-hockey/rosters-enrichment.json`; swept for SCVAL on 2026-10-02, BVAL, PCAL and MCAL on 2026-10-03, the EAL on 2026-10-04 and the 53 Southern California teams on 2026-10-06).** A second sweep on
2026-10-02 looked for each rostered SCVAL player's own recruiting profile, in two passes the same day.
It found 70 for 56 players: 37 SportsRecruits, 27 Hudl and 6 NCSA. 67 are on varsity rows; Los
Gatos' three are JV and not shown. Every non-NCSA page was re-fetched and checked **[V]** that day.
On 2026-10-03 the same rules found 29 more for 27 players: BVAL 12 for 12 (8 SportsRecruits, 4 NCSA:
Christopher 4, Gilroy 2, Leigh 3, Willow Glen 2, Westmont 1), PCAL 3 for 3 (1 NCSA, 2 Hudl: Hollister 1,
Stevenson 2), MCAL 14 for 12 (8 SportsRecruits, 6 NCSA: Tamalpais 4, University 5, Archie Williams 2,
Lick-Wilmerding 2, Convent 1). **All four leagues: 99 profiles for 83 players, 53 SportsRecruits,
29 Hudl and 17 NCSA.**
On 2026-10-04 the same rules found 33 for 29 EAL players: Chico 16 for 13 (12 Hudl, 2 SportsRecruits,
2 NCSA), Pleasant Valley 11 for 11 (10 Hudl, 1 NCSA), Davis 5 for 4 (3 SportsRecruits, 2 NCSA) and
Lassen 1 for 1 (NCSA); Bella Vista and Corning none (Corning has no players on MaxPreps). That is
5 SportsRecruits, 6 NCSA and 22 Hudl. **All five leagues: 132 profiles for 112 players, 58
SportsRecruits, 51 Hudl and 23 NCSA.** Each linked EAL page was re-read on 2026-10-04 by two
independent verifiers, one checking it against the rule and one trying to refute it, and kept only
when both kept it; the NCSA pages (WebFetch or curl) were opened rather than matched on a search
result.
On 2026-10-06 the same rules found 267 for 202 of the 842 Southern California rows: 134 Hudl, 64 NCSA,
55 SportsRecruits and 14 FieldLevel. **All six sweeps: 399 profiles for 314 players, 185 Hudl, 113
SportsRecruits, 87 NCSA and 14 FieldLevel.** On 2026-10-07 the 21 rows MaxPreps had added since (Marin
Academy's 18; Westmont's Kaylee True, Lexi True and Savannah Murdoch) were swept by the same rule: Kaylee's
and Lexi's NCSA field hockey pages name Westmont and the class of 2028 and are linked (401 for 316); no
field hockey page was found for the others (neither school has a Hudl field hockey team, NCSA lists no
Marin Academy athletes, and about 870 SportsRecruits and NCSA addresses were probed); both links were
re-read by an independent refuter. Four sweeps ran in parallel (Sunset and the independents;
City; North County; Metro), and every linked page was then re-read by two independent verifiers working
apart, a checker applying the rule and a refuter trying to break it; a page was kept only when both kept
it (269 candidates, 267 kept). By team (players linked of the team's rows, then pages):

| Team | Found | How it was tied to the player |
|---|---|---|
| Bishop's | 24 of 24, 37 (24 Hudl, 9 SportsRecruits, 3 NCSA, 1 FieldLevel) | Every MaxPreps row has a public Hudl profile on the school's 2026 varsity team; class years and jerseys agree. Seven SportsRecruits TEAMS blocks name The Bishop's School; Kate Watkins' and Leia Park's pages are linked on class year plus a California hometown. |
| Harvard-Westlake | 22 of 25, 25 (19 Hudl, 5 SportsRecruits, 1 NCSA) | Hudl's varsity, JV and Freshman field hockey teams were read in full; three players' Hudl pages redirect to fan.hudl.com and cannot be viewed. MaxPreps lists Téa Hunnius twice (Téa, Tea) and Sasha Leibzon twice (Sasha, Alexandra), the second rows created 2026-10-06: each page is linked on the row whose spelling it uses. |
| Torrey Pines | 13 of 25, 24 (12 Hudl, 6 SportsRecruits, 3 NCSA, 3 FieldLevel) | Hudl's team roster; nickname pages (Vicky, Emme, Izzy) name the school. |
| San Dieguito Academy | 16 of 17, 18 (16 Hudl, 1 SportsRecruits, 1 NCSA) | The Hudl pages carry only the grade in the display name ("Ella Rennie 12"), no class year; the rows have no grade, so school and sport carry the link. |
| University City | 13 of 21, 16 (12 Hudl, 3 SportsRecruits, 1 NCSA) | Seven more rostered players' Hudl profiles are private. |
| Chaminade, Bonita | 12 of 20, 13; 9 of 16, 9 | Hudl team rosters (Chaminade's entries dated 2022). Bonita's rows have no grade; Melony Hoffman's Hudl page is not linked (below). |
| La Jolla Country Day, Vista, Valley Center, La Costa Canyon, Mission Hills, Escondido | 9, 7, 5, 5, 6 and 5 players | Hudl team rosters (17 La Costa Canyon, 7 Vista and 2 Escondido profiles are private), NCSA school pages, FieldLevel organization rosters (Vista). |
| 23 other teams | 1 to 4 players each | Mostly NCSA and SportsRecruits pages that name the school. |
| Glendora, Mira Mesa, Point Loma, Canyon Crest Academy, Sage Creek, Olympian, Otay Ranch, Hilltop, Southwest | none found | |
| Chaparral, Fountain Valley, Marina, Newport Harbor, Fallbrook, San Pasqual, Bonita Vista, El Capitan | no MaxPreps rows | |

Southern California differences, all **[V]** on 2026-10-06:
- **NCSA** answered curl with a Cloudflare 403, but headless Chromium passed the check, so every NCSA
  page was opened (about 6,400 slug probes over the four sweeps, plus the schools' "Field Hockey
  Athletes" lists). Canyon Hills' NCSA page files players under "Serra High School (San Diego)", the
  school's name before its 2021 rename (Rylie Storm's own page says "Canyon Hills (formerly Serra)
  High"); Chaminade's says "Chaminade Preparatory High School, Canoga Park", where MaxPreps says West
  Hills.
- **SportsRecruits** has no school organization page for any of the 53 schools (several hundred slugs
  guessed); about 13,800 athlete addresses were probed, and every linked page was rendered in Chromium
  for its TEAMS block, which is where most of them name the school.
- **Hudl** was read through its public GraphQL endpoint: every season of every field hockey team of
  every school. Many profiles are private (`Page Not Found`), and an import leaves duplicates; one is
  linked per platform. A Hudl page whose headline team is another sport is linked when its Team History
  holds this school's field hockey team. Two Patrick Henry pages show only a 2020 team.
- **FieldLevel**: organization rosters are public for eight North County schools, and 14 profiles were
  linked from them and from guessed addresses.
- **A hometown with no state is not California** (the NorCal precedent, Chloe Arwin): Alexis
  Andersen's SportsRecruits page (class of 2028, "Thousand Oaks", no school) is not linked. Nor is
  Melony Hoffman's Hudl page: its Bonita field hockey entries run from 2020 with no class year, and its
  only class year (2028) is on a volleyball club team, so the refuter could not confirm it is the
  current player.
- **A class year that disagrees is not linked**: Isabella De Haro (Bonita), Emily Tracton, Olivia
  Sullivan and Addison Honeycutt (Chaminade), Emily Burgon (Eastlake), Chloe Angstead (Del Norte),
  Riley Hill (Patrick Henry), five La Jolla Country Day Hudl pages, and the Hudl pages of Ava Hauer and
  Lola Van Dyke (Torrey Pines; their SportsRecruits and FieldLevel pages agree and are linked).
- **Rows with no grade** (316 of the 842): a stated class year of 2027 to 2030 is accepted, and the note
  says so.

| Team | Found | How it was tied to the player |
|---|---|---|
| St. Ignatius | 23 SportsRecruits (every rostered player), 13 Hudl | The school's SportsRecruits team page (`nfhca.sportsrecruits.com/organization/stignatiuscollegepreparatorygirlsfieldhockey`) links all 23; class years and numbers agree. About 14 are bare team-created pages. The 13 Hudl profiles carry the school's varsity field hockey team (SICP Women's Field Hockey Varsity, Hudl team 409165); several list soccer first. |
| Saratoga | 9 Hudl | Created from Saratoga's 2024 varsity team (Hudl team 777233, ids 24030203-24030221). They name school and sport but no class year; all 9 players are juniors or seniors now. |
| Los Gatos | 1 NCSA, 5 SportsRecruits (3 JV) | Lizzie Moorehouse's NCSA profile is under the legal name, Mary Elizabeth; the SportsRecruits bio gives Lizzie as the name used. |
| Mitty | 3 SportsRecruits, 1 Hudl | Each page names Archbishop Mitty. |
| Saint Francis | 3 SportsRecruits, 2 NCSA, 1 Hudl | Each SportsRecruits bio names Saint Francis. NCSA lists Genevieve (Evie) Ferrini, and Aadya Kumar (the roster's Aadya Shivan Kumar; position and height agree). The Hudl profile is on SFHS Girls Varsity Field Hockey (team 26559). |
| Santa Clara | 3 Hudl | Created from Santa Clara's varsity field hockey team on Hudl (ids 23923742-23923757); no class year. The block's other names are not on the roster. |
| Los Altos | 1 NCSA, 1 SportsRecruits | |
| Homestead, Palo Alto, Lynbrook, Fremont | 1 NCSA; 1 NCSA; 1 SportsRecruits; 1 SportsRecruits | The Lynbrook and Fremont pages name no school: matched on class year plus hometown (Cupertino, Sunnyvale). |
| Cupertino, Valley Christian, Presentation, Monta Vista | none found | |
| EAL: Chico | 12 Hudl, 2 SportsRecruits, 2 NCSA (13 players) | The 12 Hudl profiles are on Chico High School Girls Varsity Field Hockey (Hudl team 694691), whose roster was read in full; jerseys agree where the page gives one. The school's SportsRecruits team page (`organization/chicohighschool_fieldhockey`) links two athletes, Olivia Council and Evie Nielsen (under the slug `evelyn_nielson`). The two NCSA pages name Chico High School. |
| EAL: Pleasant Valley | 10 Hudl, 1 NCSA | The Hudl profiles are on Pleasant Valley High School Girls' Varsity Field Hockey (Hudl team 244269), the 2026 import, all class of 2027 or 2028 and Chico, CA; three show a nickname (Addy, Emmy, Libby). Ruby Wantt's NCSA page names the school. |
| EAL: Davis | 3 SportsRecruits, 2 NCSA | Amelia Zedonis' and Kira Kelly's bios name Davis High School; Kate Loscutoff's page names no school and is linked on class of 2027 plus Davis, CA (her NCSA page names Davis Senior High School). Maisy Martin's NCSA page is not on NCSA's Davis school page. |
| EAL: Lassen | 1 NCSA | Brylee Leslie's page names Lassen High School, Susanville, CA. |
| EAL: Bella Vista, Corning | none found | Bella Vista's only near matches are another class year (Rosy Johnson) and lacrosse pages (since 2026-10-12, when profiles in any sport are linked, Rylee Tabor's lacrosse page is). |

The rule: a page is linked only when it names the player (or the school's spelling, `sourceName`)
and a sport, and either names this school or shows the class year the roster shows plus a
California hometown (for a profile in another sport, a hometown in the school's half of the state).
A stated class year must agree with the row's grade; `lib/players/rosters.ts` refuses the file at load
otherwise. Social media and news stories are not linked. Until 2026-10-12 only field hockey profiles
were; since then a profile in any other sport is linked too, with its `sport` (a field hockey
profile has none), and the roster names that sport in the link ("SportsRecruits lacrosse
profile"). A player has at most one profile per platform in each sport.

*Grades, 2026-10-12.* MaxPreps leaves the grade blank on 413 varsity rows that nothing had filled,
326 of them Southern California's. Two passes filled 249. First, MaxPreps' own pages: each row's
career page (its `graduatingClass`, and the grade of every team it lists for a dated season, in any
sport: a past season's team link carries the season, `/24-25/`) and the team's 2025-26 and 2024-25
field hockey rosters (read with `parseRosterPage` after swapping the season id it checks, matched on
`careerId`, or on the name where the page has one row of it). A grade is filled only where every such
page agrees: 136 rows (`maxpreps-career`, derived, medium). Second, the 266 still blank were looked
up on the schools' own athletics sites (a 2026-27 roster first, then a 2025-26 one carried forward),
in school papers and in local news: 113 rows, 95 from school sites and 18 from papers (Home Campus
and SportsEngine athletics sites render with JavaScript; Home Campus player pages give "Grade N").
Medium where the page is not the school's own current roster, high where it is. A story that is not
about field hockey was used only for an exact name at the same school. Where sources disagree the
grade stays blank and each is recorded under `conflicts`; a source that would make a player a
13th-grader counts as a disagreement. Every grade note ends "Added 2026-10-12." and each page is in
its team's `sources`. 164 rows still have no grade, mostly at schools whose sites list names without
grades (Mira Mesa, Mission Bay, Point Loma, Clairemont, Scripps Ranch, Greenfield) or post no roster
(San Dieguito Academy, Canyon Crest, Mission Vista, Escondido, Mt. Carmel, Live Oak).

*The 2026-10-12 probe, in every sport.* A SportsRecruits profile-address probe (the `first_last` slug
and its numbered variants, following redirects to each association's subdomain) ran for all 1,673
varsity rows: 1,355 at first, and the other 318 later the same day, after the research environment's
two-hour limit stopped the first run. SportsRecruits answers bursts with HTTP 429, so the probe ran four requests at a time with a
back-off. A page was kept when its title names the player, its class year agrees with the roster (any
of 2027-2030 for a row with no grade), and it names the school's own team or gives a hometown in the
school's own area: San Diego County (with Temecula and Murrieta), Greater Los Angeles, the Bay Area
and Central Coast, or the Sacramento Valley and north state. "Same half of the state" was too loose:
it let through a volleyball page from Agoura Hills and a soccer page from Rowland Heights for San
Diego schools. Where a player's matching pages disagree on the hometown, only those in the school's
own city were kept; the other class-of-2027 Phoebe Miller (San Francisco) was left out; and soccer,
track and volleyball pages were kept only where the club named is a girls' club (a Santa Maria
volleyball page for a La Verne school was left out). Each kept page was then re-read.
118 pages for 116 players: 91 lacrosse (all on iwlca.sportsrecruits.com, the women's lacrosse site),
15 softball, 6 field hockey that the earlier sweeps had missed, 5 soccer and 1 track and field. One
shows a commitment not yet in `data/field-hockey/commits.json`: Campbell Trocha's, to Florida Tech, now added
(§1.1j3). NCSA, Hudl and FieldLevel were not probed in other sports, because their profile addresses
carry numbers that cannot be guessed (NCSA loads in a headless browser, but its school pages list
only a few recent athletes).

*Claimed MaxPreps pages, 2026-10-13.* MaxPreps keeps a career page for every rostered player
(`careerUrl`), and a player or a parent can claim it. The roster page's `linkedAthlete`,
`linkedParents` and `accountInformation` columns are null on every row of every capture (they fill
only for a signed-in viewer), so the claim is read from the career page itself: its RSC payload's
`careerPlayerData.isClaimed` **[V]**. A claimed page also renders MaxPreps' Claimed badge beside the
name (`CareerHeaderTextBlock__StyledClaimedBadgeIcon`) and carries `career-claimed` in its ad
targeting; an unclaimed one has neither. All 1,702 rows' career pages were read (three at a time,
500 ms apart, about 15 minutes): 260 claimed on 73 teams, 1,441 not, and one, Marin Catholic's
Alexandra Schmidt, answered 403 with a redirect to a MaxPreps support article, so is not linked. The
260 are linked as `platform: "maxpreps"` profiles at the row's own `careerUrl`, with no `sport` (one
page covers every sport) and `classOf` from the page's `graduatingClass` where it has one (221). They
are the page the row comes from, so they need no name, school or class-year match to tie them to the
player; `lib/players/rosters.ts` instead refuses one whose URL is not its row's `careerUrl`. A `classOf` they
state is still checked like any profile's: it must agree with the grade the row shows, or the file
does not load (none of the 221 disagreed; a page whose `graduatingClass` did would be linked with
`classOf: null`). 159 of the 260 players had no other
profile, so the file then held 779 profiles for 569 players. The roster shows "MaxPreps profile"
after the recruiting sites' links, and its footnote says these are claimed pages rather than matched
ones. The claim is not refreshed by `pnpm fetch-rosters`: the flag lives only on the career page, one
600 KB page per player, so re-reading it is a re-run of this sweep, not part of the roster read. (One career page, Leigh's Adriana Yam's, shows another
player's name, Ayva Garcia; it is unclaimed, so nothing is linked.) The same day each claimed page's
`/bio/` page, where the athlete's own entries live, was read too. It shows **no college commitment**
for any of the 260: `careerCollegeInterestsData` (15 players) is a list of colleges with no status,
and the 11 of the 260 already in `data/field-hockey/commits.json` show nothing there. Its club-teams block lists 33
clubs for 32 players: the 22 field hockey ties were all in `data/field-hockey/clubs.json` already, and one source was
added (Eleanor Levy's VCRD entry, made after the 2026-10-06 sweep); the 11 clubs in other sports are not
linked, as that file holds field hockey clubs only.

*The 2026-11-03 probe, in every sport.* The SportsRecruits profile-address probe ran again for all
1,673 rows: the `first_last` slug with hyphen and multi-word variants, each bare and with suffixes 1 to
12 (23,270 addresses, four at a time; 670 live, 649 pages read once men's lacrosse was dropped). Kept by
the 2026-10-12 rule, at most one per platform in each sport, and re-read by an independent refuter, who
kept every one: 30 pages for 30 players (14 NorCal, 16 SoCal), 26 lacrosse, 3 field hockey and 1
soccer. Most were live before 2026-10-12 and that probe had not linked them, among them the own pages
of six committed players (Storey Lewis' lacrosse page and Gigi Colant's, Catherine Cecchini's, Kaye
Zilinskas', Violet Potts' and Emerson Davis'); Charlotte Painter's field hockey page (Fremont) was
created 2026-10-25. Two of judgement: Josie Marvel's page is titled "Jocelyn Marvel" at the address
`josie_marvel7`, with her class, club and city; Mariposa Serrano's names Live Oak but its bio says "a
2008 goalie", read as a typo for 2028 since the page and MaxPreps say 2028. Two lacrosse pages of
2026-10-12 had moved (`abigail_wisbach` and `reagan_roach` answer Page Not Found) and are re-linked at
`_2`. Bare pages (a class year, no school or place) and namesakes in other states are not linked.
All 228 SportsRecruits pages already linked were re-read and answer; Rylie Storm's now shows a
commitment (§1.1j3). The file now holds 809 profiles for 583 players. Not repeated: the claimed-MaxPreps
read (MaxPreps answered the career pages with HTTP 403 after a few dozen, so it was stopped), and
NCSA, Hudl and FieldLevel were not probed.

*2026-11-06: NCSA's school pages, and the JV players.* NCSA's field hockey school pages
(`/field-hockey-recruiting/california/<city>/<school>/`, read through WebFetch: curl gets a bot challenge)
list each school's athletes; the 45 schools with a JV roster were read (with the right school slug: several
redirect to a namesake school elsewhere, as `st-ignatius-college-preparatory` does to Chicago; Canyon Hills is
filed under `serra-high-school`, Hollister under `san-benito-high-school1`) and matched against the varsity
and JV names, along with 25 schools' women's lacrosse pages. Each match was re-read by an independent refuter.
Linked, all field hockey and each naming the school: seven pages for varsity-file rows (Abby Scharrenberg and
Carolyn Cordoni, Saint Francis; Ruhee Bhatnagar, Monta Vista; Bintu Deen, Santa Clara; Evelyn Jaimes,
Greenfield; Evalina MacLennan, Glendora, whose page says "Evie Maclennan", class of 2027: the roster has two
Maclennan seniors, Evalina and Brielle (MacLennan on MaxPreps, Maclennan on the school's site), the page does
not say which, and the owner identified her as Evalina on 2026-11-06, which the link rests on; Colette von Klemperer, Los Gatos, a row the school marks JV, under her nickname page
`coco-von-klemperer`, whose statement gives "Colette (Coco)") and one for a JV player with no varsity-file row
(Scripps Ranch's Katie Todd, whose page and school's list say Katherine). Left out: Fremont's Charlotte Painter and Helix's Kasia
Umholtz, listed with no address that answers. The lists seem to leave out older athletes, so recall is partial.
A FieldLevel address probe (`fieldlevel.com/app/profile/<first.last>/fieldhockeywomen`, 809 addresses for the
746 JV players) found one page, a Massachusetts namesake; hyphenated names redirect to sign-in and numbered
addresses cannot be guessed. Hudl (its GraphQL search was not used) and Captain U (behind a login) were not
searched.

*JV players' profiles* (since 2026-11-06; in `data/field-hockey/jv-profiles.json` until 2026-11-26, filed by person in
`data/player-accounts.json` since, with this round's record in its `jvResearch`) are shown by `lib/jv/jv-profiles.ts`, by the
same rule, joined on team slug + the name the team page's JV list gives (§1.7) and checked at load: the player
is on that list and not on the varsity roster, a stated class year agrees with the list's grade, no page is
linked twice or also to a varsity row, and a player with a varsity-file row the overlay marks JV (Los Gatos')
keeps her profiles in the overlay, which the JV roster shows (Beatrix Monk's, Casey Moorehouse's and Colette
von Klemperer's SportsRecruits pages, linked since 2026-10-02, had been shown nowhere).

*The 2026-11-06 SportsRecruits probe of the JV players.* The 746 JV players the team pages list, by the
varsity probe's method cut to the addresses that pay: the `first_last` slug (and a hyphen-free one for a
hyphenated name), bare and with the suffixes 2 to 5, which hold 252 of the 261 SportsRecruits pages the
overlay links (suffix 1 holds one, 6 to 12 the other eight): 3,800 addresses, read one at a time because
SportsRecruits answered this machine with HTTP 429 for the first hour (the 2026-11-03 probe ran four at a
time). 111 were live, all read. Kept by the 2026-10-12 rule and re-read by an independent refuter, who kept
every one: 33 pages for 33 players at 13 schools, 32 women's lacrosse and one field hockey (Mission Bay's
Jayla Gerrard). Five rest on the school named (St. Ignatius' team page for Mika Nejasmich and Simone
Stiefel; the bio for Marin Catholic's Laurel and Scarlett Wu and Lick-Wilmerding's Mira Mathus), the rest on
a hometown in the school's own area. The three Los Gatos pages already in the overlay turned up too. Not
linked: men's lacrosse pages (`imlca`), pages with a class and no school or place (Anna Shapiro, Cora
Gallagher, Zoe Shetti, Emersyn Manion, Kaleigh Houghton, Kieara Reno, Nina Wimmer) or a place and no class
(Ella Gunthermaher in Fair Oaks, Bella Vista's own town), a class that disagrees (Lauren Chow, Isabella Park,
a Utah Tessa Lambert), and namesakes elsewhere, several committed. No linked page shows a commitment.
`data/field-hockey/jv-profiles.json` holds 34 JV players with a profile at 14 schools. The varsity rows were not probed
again this day.

*2026-11-13: Hudl's team rosters and NCSA's school pages, for all 102 schools.* Hudl's public GraphQL
endpoint (the EAL route below) answered without a login for every school: all 88 schools with rows were
matched to a Hudl school and every field hockey team's roster read, the current season's or, where a team
has none, its latest. Hudl's season label can be stale: Christopher's team reads 2023 and Convent & Stuart
Hall's 2022 even on profiles created in August and September 2026, so the class year, not the team's
season, ties a page to a current player. 85 public profiles not linked before were kept (77 varsity-file
rows, 8 JV players), each listing a field hockey team at the player's school, its overview naming the
school, and its class year agreeing with the roster (two give none and name the school: Christopher's
Johanna Canseco and Bonita's JV Peyton Moronez): Christopher 15, University 15, Saint Francis 13, Gilroy 9,
Valley Christian 7, Convent 5, Berkeley 5 (all on Berkeley's JV team on Hudl, four of them varsity rows),
Mitty 4, Harvard-Westlake 4 (JV), St. Ignatius 3, Bonita 2 (JV), Great Oak 1 (JV), Marin Catholic 1 and
Pleasant Valley 1. Given-name pages are linked on the school and class year (Madison McDougall, Addison
Paradiso, Alexandra Pires, Lexie Osaki for the Lexi row, London Rose Harvey). Marin Catholic's roster has
both a Lexie Schmidt and an Alexandra Schmidt row, class of 2027; the Hudl page says Lexie Schmidt and is
linked on that row only (the school's own roster lists only Alexandra Schmidt, so the two MaxPreps rows may
be one player). NCSA's field hockey school pages were read through WebFetch for all 88 schools (99 pages,
both slugs where a school has two; Valley Christian's right slugs are `valley-christian-high-school-10` and
`-7`, as `valley-christian-high-school` is Chandler, AZ, and Southwest's is
`southwest-senior-high-school`, as `southwest-high-school` is Jacksonville, NC): four more pages, each
naming the school with a class year that agrees (Samantha Brunsell, St. Ignatius; Eleanor Navarrette, Mitty;
Junali Dutta, Lynbrook; Myla McCandless, Bishop's). An independent refuter re-opened all 89 and kept every
one. Not linked: 96 Hudl roster entries whose profiles are private (Valley Christian 22, La Costa Canyon 16,
Pleasant Valley 9, and others); Hudl pages whose class year disagrees with the roster (among them four La
Jolla Country Day pages a year earlier than the rows, which may mean those grades are off, and Genevieve
Ferrini's, a year off Saint Francis' Evie Ferrini); second Hudl profiles for rows that already link one;
NCSA listings with no profile address that answers (Dylan Powell, Maggie Magnano, Brooklyn Barnard,
Charlotte Painter, Kasia Umholtz); and 16 FieldLevel pages from an address probe of the 1,688 varsity rows
without one (`/fieldhockeywomen`, 1,773 addresses), which give a hometown but no class year or school.
The same day every linked SportsRecruits profile (294, varsity and JV) was re-read: all answer, and one
now shows a new commitment (McKenzie Rackleff's, §1.1j3). The SportsRecruits address probe was not
repeated. The same day's roster refresh put six JV-list players on their varsity rosters, Berkeley's Sage Murphy
among them, so her Hudl page is on her varsity row: the overlay then holds 903 profiles for 634 players (78
Hudl and 4 NCSA from this sweep), and `data/field-hockey/jv-profiles.json` 35 JV players at 15 schools (7 Hudl from it).

*2026-11-13: a search of four schools.* Sobrato, Cupertino, Lynbrook and Homestead (116 players: 72 varsity
rows, among them the 20 Sobrato rows new to the roster that day, and 44 JV) were searched for recruiting pages
on every platform and in every sport: a SportsRecruits address probe (4,550 addresses, name variants and
suffixes 1 to 12; the bare live pages also read rendered, twice, under the 2026-11-13 rule, §1.1j3), every
Hudl team of the four schools in every sport for 2022 to 2026 and a Hudl name search for every player, NCSA's
field hockey, lacrosse, soccer, softball, volleyball and basketball school pages and a guessed address for every
player, and FieldLevel in eight sports. Six pages for five players were kept and re-read by an independent
refuter, each naming the school with a class year that agrees: Sobrato's Cameron Isle (Hudl and NCSA
basketball), Lynbrook's Grace Cho (Hudl soccer), Cupertino's Allenah Watkins (NCSA field hockey; NCSA's school
list leaves her out, her address answers) and Homestead's Olivia Leyton Bravo (NCSA field hockey) and Aalya Jain
(NCSA softball): 909 profiles for 639 players. Not linked: an NCSA address under Sobrato goalkeeper Kinzie
Rasley's name that serves a page headed "Regan Stuart '28" (a Sobrato field hockey goalkeeper of the class of
2028) with her name nowhere on it, which looks like a renamed account but is linked only on the owner's word;
bare SportsRecruits pages that show no school or place even rendered; a private Hudl profile. Sobrato's and
Lynbrook's Hudl field hockey rosters are empty, and Cupertino and Homestead have only football teams on Hudl.
The same search filled six Homestead grades MaxPreps leaves blank (four from Stick Together's 2025 all-league
lists, derived; two from The Epitaph's Nov 2, 2026 game review), and Lynbrook's Trishna Sinha and Sahana
Rajamani keep the school site's grade 11 on the owner's decision, Stick Together's 2025 list (which would make
them 12 and 10) recorded as conflicts.

*2026-11-16: MAX Field Hockey.* MAX Field Hockey (`maxfh.longstreth.com`) keeps an athlete page per player
(class year, position, hometown, high school, club, college commitment; the player can claim it), now server-
rendered under two addresses, `athlete/?Athlete_ID=ID-<8 digits>` and the newer `players/<slug>/`. Since this
date it is a profile platform, `maxfh` (`MAX Field Hockey profile` on the roster; a field hockey page, so it names
no sport in this build). Its California pages were read in full: the player directory filtered to CA (57 current
players and 17 in the archive), the 109 California high-school pages, and the club pages those link (19, among
them the out-of-state clubs some California players list), which gave 305 `Athlete_ID` pages and 50 `/players/`
pages. Each was matched to the varsity and JV rosters by the profile rule above and re-read the same day: 51
pages for 51 varsity players at 20 schools (45 `Athlete_ID`, 6 `/players/`), 960 profiles for 640 players in all
(Tamalpais' Chloe Arwin had none). Every page but one names the school with a class year that agrees; Samantha
Brunsell's is tagged with the Chicago St. Ignatius (`(IL)`), a mislinked school record (§1.1j2 notes the same
slip), and is linked on class of 2028 plus her San Francisco, CA hometown and the San Francisco club. Six pages
give another form of the name and name the school (Eva Jo Allen, Francine Lemieux, Lala (Laura) Pellegrino,
Samantha Lee, Sammy Ippolito, Abigail Scharrenberg). Not linked: a Sophia Smith of Chicago (class of 2028, as
Mission Hills' Sophia Smith is, but St. Ignatius (IL) and Rise); California players at schools not tracked here
(Moorpark, Dougherty Valley, the Lycée Français) or at boarding schools out of state; archived graduates. The
three JV-list matches (Huntington Beach's Sarah Moniak, University City's Lala Pellegrino, Harvard-Westlake's
Margaux Schlumberger) are players also on their varsity rows, where the pages are linked.

Gotchas, all **[V]**:
- **NCSA** (`ncsasports.org/field-hockey-recruiting/california/<city>/<school>/<first-last[N]>`)
  answers curl and WebFetch with a Cloudflare challenge (403, "Just a moment..."). Its six
  profiles were matched on the search result alone: the title, the school in the URL path, and the
  class year in the result summary where it gave one. Several schools have two NCSA school slugs: Los Altos
  (`los-altos-high-school1` and `los-altos-high-school-los-altos`), Fremont
  (`fremont-high-school-sunnyvale` and `fremont-high-school6`) and Monta Vista (`monta-vista-high-school`
  and `monte-vista-high-school-cupertino`). Every other field hockey profile the searches surfaced
  under these schools belongs to a graduate or someone not on the roster.
- **SportsRecruits** answers a missing athlete with HTTP 200 and the title "Page Not Found". A slug
  (`first_last`, `first_last2` …) is shared across sports; field hockey profiles redirect from
  `my.` to `nfhca.sportsrecruits.com`, which is stored. The body loads client-side, so the evidence
  is the title, meta description and JSON-LD. Bare "11v11 Roster Member" pages show a class year
  (sometimes a position) and no school or state; about a dozen such pages whose name, sport and
  class year agree with a rostered player (Saint Francis, Los Altos, Mitty, Palo Alto,
  Presentation, Fremont) were **not** linked.
- **Hudl** profile ids are numeric and cannot be guessed. A profile lists every team the athlete is
  on, but its meta description names only one (often soccer or basketball), so what was checked is
  the page's team list: a team with `sportName: "Field Hockey"` at this school. Profiles created
  from one team's roster import have consecutive ids, so scanning the ids around one known profile
  found teammates (St. Ignatius, Santa Clara); Mitty's and Saint Francis's did not cluster.
  **FieldLevel** profiles are mostly behind a login. Gabby Moll's SportsRecruits and FieldLevel pages give Los Altos, CA, not Homestead, and the
  roster has no class year to check, so only the NCSA profile (under Homestead) is linked.

EAL differences, all **[V]** on 2026-10-04: the six teams hold 95 players on `data/field-hockey/rosters.json` (Bella
Vista 19, Chico 20, Corning 0, Davis 19, Lassen 15, Pleasant Valley 22).
- **SportsRecruits** was probed for every player on `my.sportsrecruits.com/athlete/<first_last>` (suffixes
  1-7 and name variants, about 1,200 slugs). Chico's school organization page
  (`organization/chicohighschool_fieldhockey`) is the only one that exists for these schools; it
  links Evie Nielsen under a misspelled slug (`evelyn_nielson`) that a name probe misses.
- **NCSA** answered WebFetch, not curl (a Cloudflare 403), and WebFetch rate-limited at about 60
  requests, so lookups were paced. Every hit was checked on the page for sport, school and class
  year: slugs resolve by name whatever school is in the path, and same-name pages are common
  (wrong-sport or wrong-person pages for Liberty Wilson, Ava Knight, Emma Horsley, Bree Pedersen,
  Addyson Gallagher, Emerson Harris, Kira Kelly and Emily Barker were rejected).
- **Hudl** was read through its public GraphQL endpoint (`hudl.com/api/public/graphql/query`, found in the
  fan.hudl.com bundle): school, team and season rosters list every team member, so profile ids did
  not have to be guessed. A profile can be **private** (`hasPublicProfile` false; `/profile/<id>`
  returns "Page Not Found"): 13 current Chico and Pleasant Valley players are on the team rosters
  and cannot be linked. A team import also leaves older duplicates (no class year, or an earlier
  season) beside the current profile; one per platform is linked, the one with a class year and the
  2026 team. Bella Vista and Davis have a Hudl field hockey team with an empty roster, Corning's
  rosters are empty, Lassen has no field hockey team there, and three Bella Vista players' Hudl pages
  (Audrey Janeway, Morgan Cimino, Rylee Tabor; four profiles, as Audrey Janeway has two) carry
  lacrosse only.
- **A class year that disagrees with the roster grade is not linked, even on a page that names the
  school:** Zolie Judge (Chico; Hudl says 2027, the roster grade 11 = 2028, so the MaxPreps grade may
  be wrong) and Sienna Davids (Chico; Hudl says 2026, roster grade 12 = 2027). Other not-linked pages: Rosy
  Johnson (Bella Vista; SportsRecruits says Rose, class of 2030, no school) and Emily Barker (Lassen;
  2027, no school); lacrosse pages for four Bella Vista players; Olivia Council's track and field page.
- **FieldLevel**: 97 guessable addresses (`fieldlevel.com/app/profile/<first.last>/fieldhockeywomen`)
  were all "Page Not Found", and its listing pages are client-rendered, so none is linked.
- Recall is partial: a SportsRecruits page under an unrelated slug with no school page, an NCSA page its
  school page does not list (Maisy Martin's is not on Davis Senior's) and a FieldLevel profile with a
  numeric id could exist and not be linked; NCSA slugs with a suffix of 2 or higher were not tried.

BVAL, PCAL and MCAL differences, all **[V]** on 2026-10-03: NCSA pages answered WebFetch there
(not curl), so those profiles were read rather than matched on a search result, but NCSA slugs
resolve by name whatever school is in the path, so sport, school and class year were checked on
every hit. Teya Halali's SportsRecruits page (Westmont) is linked: it says class of 2029, Campbell,
CA, and a 2026-27 sophomore is class of 2029 (it was first left out on a miscounted class year).
Not linked: Adriana Yam (NCSA page is women's ice hockey, class of 2029), Julia Ahlstrand and Sofia
O'Riordan of Convent (class year disagrees), Chloe Arwin (a SportsRecruits page that names no school and
no state, only "Mill Valley"; dropped because it meets neither linking condition), and bare pages
with no school or hometown. SportsRecruits `nfhca.`
pages are client-rendered: the evidence is the title and meta description (class year, position,
hometown or school), and a missing athlete returns "Page Not Found". Hudl for BVAL and MCAL yielded
nothing (a Tamalpais team import, ids 18517700-18517876, holds only graduates); Stevenson's two
profiles carry Stevenson School's varsity field hockey team (Hudl team 284842).

**Recall is partial.** NCSA can only be found through search, and its pages cannot be fetched, so
a profile the search index does not surface stays unfound. Every school got NCSA sweeps by school,
class year and position. A name search (NCSA and Hudl together) ran for nearly every varsity player
on all 15 SCVAL teams (a few who already had a link were skipped; JV rows, which the page does not
show, were not searched). Every player on every roster was looked up directly on SportsRecruits;
FieldLevel lookups covered six teams. An NCSA or Hudl profile for anyone else could exist and not be
linked. The 2026-10-03 sweep's recall is lower. BVAL: SportsRecruits was looked up directly for every
player; NCSA directly for every Leland and Live Oak player but, for Willow Glen, Christopher, Gilroy,
Westmont and Prospect, only for juniors and seniors (freshmen and sophomores there, and Branham and
Leigh beyond their school pages, were not checked). PCAL: every `nfhca.sportsrecruits.com` lookup
returned "Page Not Found" under name variants (hosts cannot be searched), NCSA surfaced one
current player, and Hudl was found only by scanning ids around known Stevenson profiles. MCAL: web
search surfaced no Hudl field hockey profile for a current roster. A profile for anyone else could
exist and not be linked. Like the first sweep, this one is research, not a script.
The EAL sweep (2026-10-04) had the broadest recall of the three: every one of the 95 players was
looked up directly on SportsRecruits, Hudl was read from the teams' own rosters, and NCSA was
looked up directly for every player on five teams (Corning has none) after the school pages;
a profile outside those routes could exist and not be linked. The Southern California sweep
(2026-10-06) matched it: every row was probed on SportsRecruits, NCSA and FieldLevel and every school's
Hudl rosters were read; CaptainU and personal sites were barely covered, and a private Hudl profile or
an NCSA slug with an unguessed nickname stays unfound.

**(j2) Clubs and club affiliations** — `data/field-hockey/clubs.json` (`lib/players/clubs-schema.ts`, read by
`lib/players/clubs.ts`; shown on `/clubs`, `/clubs/[slug]` and in a club line on each team page's roster,
DESIGN §17). Research on 2026-10-03, with an EAL sweep on 2026-10-04 and a re-read of the linked
recruiting profiles on 2026-10-05, and a Southern California sweep on 2026-10-06, not a script: nothing fetches or refreshes it. It holds 28 youth field hockey clubs (13 from 2026-10-03, 3 from
2026-10-04, 12 from 2026-10-06) and 171 affiliations (72 from 2026-10-03, 8 from 2026-10-04, 14 from 2026-10-05, 76 from 2026-10-06, 1 from 2026-10-07), each a tie between a player on the 102 tracked varsity rosters and a club, joined to `data/field-hockey/rosters.json` on team slug + MaxPreps athleteId as the overlay
is. A club record has the club's name and display name, city, region, website, founding year, one
factual sentence, its teams and programs (each with a short detail and the page it was read from;
the detail says so when the club has posted nothing newer: "Winter 2025-26, the latest posted",
"no season after 2022 is posted", "no dates posted"), its own public roster pages and its sources,
each source with the short name the club page prints as its link ("Program overview", "NCFHA youth
club directory"), dated when the page is old ("Club news (latest item Dec 2021)"); it names no
individual: no coaches, no directors. An affiliation has the club team, a `status` with the date
or season the source gives (`asOf`), a `confidence`, and its sources (URL, kind, a verbatim quote
of at most 300 characters, with several quotes from one page joined by " … ", and the school, class
year and date the page states); every source names the player or is the player's own profile, and
`basis` says what the match rests on. The quotes and bases are for maintainers and are never
rendered: they can name people who are not on the rosters (teammates, a club's director), and
`scripts/assert-copy.ts` fails the build on any page that shows one (`affiliationLeaks` in
`scripts/copy-rules.ts`). Aliases (`aliases[]`, e.g. San Jose Fly for Fly FHC) are kept for
matching and not shown, since they mix team names into club names.

*Sources.* The clubs were found in the NCFHA youth club directory (`ncfha.org/youth`) and BAFHA's
youth hockey page (`bafha.org/schedule/youth-hockey/`), plus any club a rostered player's page
named; each record was then read from the club's own site (91 club source entries, on 86 distinct
URLs; the three 2026-10-04 records were read from their own sites that day). The ties rest on 229
source entries on 105 distinct URLs (237 on 108 with the eight 2026-10-04 ties: five more `event`
entries on the two watchlist URLs already counted, one `ncsa` entry on a new URL and two
`maxpreps-career` entries on two new URLs; 106 pages): an entry is one page backing one
tie, so a club roster, a watchlist or a news story that names several players is one page and
several entries. The 14 ties of 2026-10-05 add 14 entries (10 `sportsrecruits`, 4 `ncsa`) on 10 new
URLs, for 251 entries on 118 URLs (116 pages). The counts are of URLs as the file spells them, and two pages are cited under two
URLs each, so the 2026-10-03 sweep's ties rest on 103 pages (116 with the later ties): Stick Together's 2025 all-league page, with its trailing
slash (`news` for five players, `other` for two) and without it (`news` for Olivia Taylor), and
Gabrielle Moll's MaxPreps career page, under the name slugs `gabby-moll` and `gabrielle-moll` (one
`careerid`). That one URL filed under two kinds is why the table's per-kind URL counts (the
2026-10-03 sweep's) add up to 106, and to 119 with the later ties.

| Kind | Entries | URLs | What it is |
|---|---|---|---|
| `sportsrecruits` | 57 | 36 | SportsRecruits athlete pages (`nfhca.sportsrecruits.com/athlete/<slug>`: class year, hometown or school, club) and organization pages (`/organization/<club>`, which list a club's teams and their athletes by class year) |
| `club-site` | 49 | 11 | The clubs' own pages: SF Hawks' current-players and player-accomplishments pages (24 entries on 2 pages), NorCal Impact's per-player profiles, player directory and two blog posts on its players' high school honors (23 on 7), Lightning's per-season rosters (2 on 2) |
| `news` | 34 | 6 | Stick Together (`sticktogetherfh.com`, 26 entries on 5 URLs, 4 pages): mostly its July 2026 rosters of NorCal teams at national events, with each player's school and class year, plus its 2025 all-league lists and season newsletters; the Gilroy Dispatch (`gilroydispatch.com`, 8 entries on 1 page): Infinity's 2025 California Cup lineup |
| `event` | 26 | 3 | The NFHCA's 2026 and 2025 high school watchlists (`nfhca.org`, 25 entries on 2 pages): coach-nominated tables of Institution, Club, First, Last, Class and Position, so one row names the player, the school, the club and the class; and MAX Field Hockey's Class of 2028 invitational list (1) |
| `ncsa` | 24 | 21 | NCSA recruiting profiles, which list club seasons by year |
| `other` | 19 | 9 | MAX Field Hockey (`maxfh.longstreth.com`, 11 entries on 6 pages): its club pages list a club's players with class year, position and high school, and its high school and athlete pages show the same rows from the school's and the player's side; plus pages that support the school: the SCVAL 2025-26 all-league PDF, Stick Together's 2025 all-league lists, the NFHCA academic squad |
| `maxpreps-career` | 17 | 17 | The club-teams block (`careerClubTeamsData`) of a MaxPreps career `/bio/` page: the club teams a player or parent entered (club, team, sport, city, year joined, last modified), or the page's class year and team where another page names the club |
| `school-site` | 2 | 2 | A MaxPreps all-time school roster, and Saint Francis's own athletics roster |
| `hudl` | 1 | 1 | A Hudl profile |

With the 2026-10-04 ties: `event` 31 on 3, `ncsa` 25 on 22, `maxpreps-career` 19 on 19. With the
2026-10-05 ties: `sportsrecruits` 67 on 43, `ncsa` 29 on 25.

The MaxPreps club-teams block was mined for all 716 varsity rows: 13 of the 17 entries (10 players)
quote a field hockey club from it, and the other 4 give only the page's class year and team. Every
tie it names was also found by another source except Yoyo Cai's Fly FHC tie, which rests on her
MaxPreps page alone. On 2026-10-04 the block was read for the 95 EAL rows too (190 pages: each row's
career home and `/bio/` page; Corning's roster has no rows). It names a club for two players only,
Lilah Letcher and Kate Panighetti of Pleasant Valley (Chico Hotshots), and those two ties, like
Yoyo Cai's, rest on the MaxPreps page alone. MAX Field Hockey's pages render their tables through an embedded database view,
so they were read by calling the embedded page directly. USA Field Hockey lists were searched too.
The club pages show each source as a link labelled by its kind and host, never by anything in its
URL path.

*The rule* is the recruiting-profile rule above, applied to clubs: a public page must name the
player and a field hockey club, and either name the player's high school, or give a class year
that agrees with the roster grade together with a location in the school's half of the state (for
the NorCal schools, the player's hometown or a club or team based in Northern California; for the
Southern California schools, the same in Southern California; "CA", or a hometown with no state, is
not enough). A name alone never makes a match, and a
class year that disagrees with the roster grade rules one out (`lib/players/clubs.ts` refuses the file at
load otherwise: MaxPreps' grade, else the overlay's, or since 2026-11-21 the grade above it on a row marked
`rosterBehind`, §1.15; Riya Mehrotra and Gabrielle Moll have no grade
anywhere, so theirs is not checked). A page may use a nickname or another form of the first name
(Abby for Abigail, Samantha for Sami) when it otherwise meets the rule and the match is backed by
something beyond the name: a second page naming the same player, club and class year, the player's
own page (her MaxPreps career page) naming the same club, or a club she is already tied to here. Such
a match is `medium` unless a page names the school. (The owner's revision of 2026-10-06; until then a
nickname counted only on a page that named the school. The same rule holds for commitments.)
Lacrosse, soccer and ice hockey clubs do not count, and neither do social-media posts: no source or
website may be on Instagram, Facebook, TikTok, X (Twitter), Threads, YouTube, Snapchat or LinkedIn,
or their short links (`BANNED_HOSTS`, shared with §1.1j3). Only players
already on the tracked rosters are named, varsity rows only (no affiliation is on one of Los Gatos'
29 JV rows); a club's own roster names many more players, and the club page links it instead.

*Two passes.* Every affiliation of the 2026-10-03 sweep was checked twice on that day. A checker
re-opened each source and applied the rule; then an independent refuter re-opened the sources and
tried to break the match: another person of the same name, a quote not on the page, a misidentified
club, a class year that disagrees, a stale listing. Only ties that survived both are in that sweep.
The eight ties of the 2026-10-04 EAL sweep were each confirmed by two independent checks that
re-opened their sources (for the three D-City and two Chico Hotshots ties, two verifiers working
apart, after the verifier of the D-City record and the MaxPreps sweep had found them).

*The 2026-10-05 recruiting-profile pass.* Every recruiting profile linked from
`data/field-hockey/rosters-enrichment.json`, `data/field-hockey/commits.json` or this file was re-read for the clubs it lists:
74 SportsRecruits pages, 36 NCSA pages and 51 Hudl pages. SportsRecruits renders an athlete's CLUB
and TEAMS blocks by script, so they are not in the page's HTML (its JSON-LD gives only the headline
club); those pages were read in headless Chromium. NCSA answers curl with HTTP 403 and was read with
WebFetch. Hudl lists school teams only. The pass found 14 ties for 13 players whose own profile lists
a club the file did not tie them to, all to clubs already in `clubs[]`: NorCal Impact (Alyssa
Montejano, Emma Traverso, Isabella Alonzo), Fly FHC (Katarina Smith, Sophie Dhillon, and Evie Nielsen
as a guest player at Cal Cup 2026), Infinity (Juliet Calderon), HTC (Maggie Magnano), SF Hawks
(Beatrix Hom), Chico Hotshots (Evie Nielsen, Quinn Karolyi, Olivia Council), D-City (Maisy Martin, a
spring training program) and Golden Gate Rippers (Josie Stout, 2021-2024, past). An independent
refuter re-opened every page; it confirmed every quote and roster match, and its three corrections
(one `basis` wording, and Quinn Karolyi current and Olivia Council `unknown` by the file's own
precedents) were applied. Left out: three Los Gatos players whose pages list NorCal Impact (one also
SF Hawks) are on JV rows; program teams ("U18 Sydney", "Oranje U19", "Futures/Nexus") are not clubs;
lacrosse and soccer clubs (STEPS California, ADVNC, Verve, San Francisco Glens) do not count; and
Kate Loscutoff's 2025 Sacramento Hockey Academy season and Gabrielle Moll's Cowtown Field Hockey are
not tied, because neither club has a record.

*Status and confidence.* `current` = the source reflects the 2025-26 or 2026-27 club season (dated
August 2025 or later, a club's current-players page, or a live recruiting profile that lists the
club); `past` = dated earlier, an alumni list, or a club the player's own page lists for earlier
years; `unknown` = listed with no usable date: a source names the club without saying whether the
player is still with it (a profile not updated since an earlier season, or one a newer page
contradicts), which the site words "Listed by <source>, <date>" with the date or season the source
gives, never as current. `high` = one first-hand page names the player, the club and the school
(or it is the player's own profile); `medium` = the match rests on a club roster's class-year
heading plus the club's location, on a team nickname standing for the school, or on a single
self-reported line. On 2026-10-03: 55 current, 11 past, 6 unknown; 57 high, 15 medium.
With the 2026-10-04 ties: 60 current, 12 past, 8 unknown; 65 high, 15 medium. With the 2026-10-05
ties: 71 current, 13 past, 10 unknown; 79 high, 15 medium.

Gotchas, found in the research (most are recorded in an affiliation's `basis` or in `notes[]`):
- **SportsRecruits slugs** are shared across sports and people, and one player can have several:
  Caitlyn Hughes' `caitlyn_hughes3` (the profile her roster row links) names no club, while
  `caitlyn_hughes4` lists SF Hawks. Gigi Colant's only club statement is a line on her soccer
  profile; the field hockey ones name no club, so hers is medium.
- **Fly FHC was San Jose Fly** (`sanjosefly.com`, and an older San Jose Fly Field Hockey LLC
  site, which the club record keeps): NCSA profiles and MaxPreps club entries still say "San Jose
  Fly", mapped through the club's own about page. That page names no player, so it is not kept as
  a source of any tie (every source names the player, `notes[2]`). It is based in Los Altos, not
  San Jose.
- **Fly FHC publishes no roster page.** The 2026-10-03 research relayed names from a flyfhc.com
  team-roster page (names only: no school, no class year), but its path already answered 404 and
  it could not be re-read, so none of its names, and none of its team labels, are used. It was long
  recorded here as "behind a SiteGround captcha"; checked again on 2026-11-26, the site's pages load
  normally (they only carry SiteGround's bot-check script), the site's own page index
  (`/wp-json/wp/v2/pages`) lists eleven pages (home, about, contact, programs, registration and a gear
  form) and none is a roster, and `/team-rosters/`, `/rosters/` and `/teams/` answer 404. A Fly tie
  rests on the player's own pages (NCSA, MaxPreps' club-teams block), never on the club's.
- **NorCal Impact's per-player pages list earlier clubs by year** under "Other Field Hockey", which
  makes those clubs `past` (Melanie Henderson: San Jose Fly 2019-2022, and a "Lightning Field
  Hockey Club" 2015-2018 with no location, matched to Lightning by her Los Altos Hills hometown, so
  medium). Its blog names players by nickname with their school ("Addie", "Noli"), so those two
  Willow Glen ties are medium.
- **SF Hawks' current-players page** lists players under class-year headings only, with no school
  and no date. A tie whose only club evidence is a class-year listing (that page, or MAX Field
  Hockey's roster of the club) meets the rule through class year plus a San Francisco club and is
  medium (five players), even where a second page (the NFHCA academic squad, a MAX athlete page)
  confirms the school; Olivia Taylor is high because MAX's club page lists her with her school. Two
  rostered players are named Sadie Baker (Tamalpais, class of 2028; Lick-Wilmerding, class of
  2027): the class-year heading and Stick Together's "Tamalpais '28" pick one.
- **MAX Field Hockey can tag the wrong school record.** Its SF Hawks page lists Samantha Brunsell
  at "St. Ignatius College Prep (IL)"; her own MAX athlete page says San Francisco, so the tie rests
  on class year plus the club's location, not on that school tag.
- **The watchlists are a year apart.** A 2026 row's Class (First-Year to Senior) is the 2026-27
  grade and checks against the roster directly; the 2025 list's is a grade lower. The 2026 list
  prints "Convent High School" for Convent of the Sacred Heart, read as that school only because
  the 2025 list and the player's own profile give the full name.
- **Spelling variants match only with the school or class year on the same page.** MaxPreps prints
  Nora Lagenfeld; the NFHCA 2026 watchlist prints Langenfeld beside Saint Francis and First-Year
  (class of 2030), and the school's own roster prints Langenfeld with the same number and position.
  Nicknames were held to the same rule ("Maggie" Magnano is "Margaret" on her profile, "Evie"
  Ferrini "Genevieve" on the watchlist); since 2026-10-06 a nickname may also match on a class year
  and location when a second page backs it (the rule above). The site prints the roster's spelling.
- **A school nickname stands for the school in news stories.** The Gilroy Dispatch's 2025-07-18
  California Cup story groups Infinity's players as Cougars, which is Christopher; four ties rest
  on that grouping and are medium, and the story's date makes them `past`.
- **MaxPreps' club block is user-entered and dated.** Colette Boyd's Infinity entry was last
  modified in 2023 and nothing dates her with the club after July 2025, so she is `unknown`.
- **A newer page can name another club.** Gabrielle Moll's NCSA and MaxPreps pages list Fly FHC
  for 2025 (the MaxPreps entry is dated 2025-10-19), but her SportsRecruits profile (modified
  2026-10-03) lists Cowtown Field Hockey, a Fort Worth, Texas club whose SportsRecruits U19 team
  lists her too: Fly is `unknown` and medium. The two passes disagreed on her (the second would
  have made Fly current, as of 2025), and the more conservative call stands, as her `basis` says.
  (Her SportsRecruits and FieldLevel pages give Los Altos, not Homestead, as noted in (j).) Emma
  Traverso's NCSA profile lists San Jose Fly seasons through 2025, but her SportsRecruits profile,
  created 2026-01-02, says she has recently switched to NorCal Impact: Fly is `unknown`, and the
  2026-10-05 pass ties her to NorCal Impact (current) from that profile's club block. Brooklyn
  Barnard's one Fly entry is "2025 San Jose Fly - Guest goalkeeper" on an undated profile, so hers
  is `unknown` too.
- **Lightning's rosters are per sub-season** (`/roster/show/<team>?subseason=<id>`). Ruhee
  Bhatnagar is on the Spring 2025 U16/U19 roster and on neither Fall 2025 girls' roster, so she is
  `unknown`. Lightning runs in Los Altos Hills (practices at Foothill College), but NCFHA lists it
  under Fremont; the record follows the club's site. NCFHA likewise lists NorCal Impact under
  Campbell; it trains in San Jose.
- **HTC is a Connecticut club** (Madison, CT) whose California program trains in La Jolla and
  Chula Vista. One Gilroy player is tied to it, so it is in the file, in the region `elsewhere`,
  and no copy says every club is near these schools.
- **Golden Gate Rippers began as a lacrosse club** (2017; field hockey since 2019), and its site is
  still titled Golden Gate Lacrosse Club. Only its field hockey programs are recorded.
- **Other sports do not count.** Several rostered players have soccer or lacrosse profiles beside
  a field hockey one, and an NCSA profile under one rostered player's name belongs to an ice
  hockey player in another state.
- **The NFHCA 2025 watchlist is paginated on screen, not in its HTML.** It shows 10 rows, but all
  555 are in the page's HTML. One fetch on 2026-10-04 got a 403 and another a 200, so retry before
  reading it through a browser. Its Class column is the 2025-26 grade ("Sophomore" = class of
  2028). Kira Kelly and Amelia Zedonis are "Davis Senior High School | D-City" there, and "NorCal
  Impact FHC" on the 2026 list, so their D-City ties are `unknown`, by the newer-page rule.
- **Google Sites and TeamLinkt share a host.** D-City's site is
  `sites.google.com/view/dcityhockeyclub`, and Davis High's field hockey page is also on
  `sites.google.com`. Chico Hotshots' is `leagues.teamlinkt.com/chicohotshotsfieldhockey`, beside
  every other TeamLinkt league, and its news items sit under `/leagues/NewsItem/<association id>/…`.
  "The club's own site" is read by `clubSiteKey` (the host plus two path segments on Google Sites,
  one on TeamLinkt), never by host alone.
- **Roseville FHC's rosters give names only.** The Fall 2026 League and `/members` show first names
  with last initials; the Summer 2026 archive and the two tournament pages show full names; none
  gives a school or class year. One Summer name matches a Bella Vista row; by the rule that is not a
  match. Its "Women" division includes U16 and U19 players, so age does not rule it out either.
- **MaxPreps' club entries are Chico Hotshots' only player pages.** Its TeamLinkt site has team
  rosters switched off and names no player. Two Pleasant Valley players' own MaxPreps career pages
  list it: club "Chico Hotshots", one entered as team "Hot Shots", U19, Chico, Field Hockey, both
  under one MaxPreps club id. MaxPreps' career pages run on the App Router, so
  `careerClubTeamsData` sits in the RSC flight data (`self.__next_f.push` chunks), not in a
  `__NEXT_DATA__` script.
- **Corning has no roster rows.** A local news story (Action News Now, Aug 5, 2026) says a Corning
  senior has played for Chico Hotshots since age six, but Corning's MaxPreps roster is empty, so
  there is no row to tie anyone to.

*Recall is partial.* A player with no public page that meets the rule is not listed, whatever club
they play for. On 2026-10-03 the 72 ties covered 66 of the 716 varsity rows at 22 of the 43 schools;
five players are tied to more than one club. The 2026-10-04 EAL sweep used the NFHCA 2025 and 2026 high school watchlists,
the NCFHA youth directory, SportsRecruits profile slugs, NCSA, fhcollegepath.com classes 2026-2028,
MAX Field Hockey, the club-teams block of all 95 EAL rows' MaxPreps career pages, and the clubs' own
sites. It added 8 ties for five players.
- Kira Kelly, Kate Loscutoff and Amelia Zedonis (Davis) are tied to NorCal Impact ("Davis Senior
  High School | NorCal Impact FHC" on the watchlist published 2026-08-27, current).
- Kelly and Zedonis are also tied to D-City ("Davis Senior High School | D-City" on the watchlist
  published 2025-08-28, `unknown` because the newer list names NorCal Impact).
- Loscutoff is tied to D-City through her own NCSA profile, which lists it for 2023 and 2024, so
  that tie is `past`. The profile also lists a 2025 club, Sacramento Hockey Academy, which has no
  record and was not researched.
- Lilah Letcher and Kate Panighetti (Pleasant Valley) are tied to Chico Hotshots by the club-teams
  block of their own MaxPreps career pages (entries last modified 2026-09-29 and 2026-05-20,
  current).

The file then held 94 affiliations for 80 players at 25 schools; thirteen players were tied to more
than one club (with the Southern California sweep: 170 for 148 players at 48 schools, twenty players
tied to more than one club; 171 for 149 with the 2026-10-07 tie of Westmont's Kaylee True to Fly FHC; 173 for 150
since 2026-11-16, with Margaux Schlumberger's RUSH tie and Beatrix Monk's NorCal Impact tie moved from the JV ties). The sweep met three clubs near the EAL teams' schools, and all three were added on
2026-10-04: D-City FHC (Davis) and Roseville FHC, in the region `sacramento` (shown as the
Sacramento area), and Chico Hotshots, in the new region `north-state` (the North State). Neither
area was searched for every club, so `SEARCHED_REGIONS` is unchanged and `/clubs` says so.

| League | Players | By school |
|---|---|---|
| SCVAL | 36 at 12 of 15 | St. Ignatius 15, Saint Francis 5, Los Altos 3, Mitty 3, Fremont 2, Palo Alto 2, Cupertino 1, Homestead 1, Los Gatos 1, Lynbrook 1, Monta Vista 1, Presentation 1 |
| BVAL | 18 at 6 of 12 | Christopher 7, Willow Glen 4, Leigh 3, Gilroy 2, Leland 1, Westmont 1 |
| PCAL | 0 of 7 | none |
| MCAL | 17 at 4 of 9 | Tamalpais 6, University 6, Convent of the Sacred Heart 3, Lick-Wilmerding 2 |
| EAL | 9 at 3 of 6 | Davis 4, Chico 3, Pleasant Valley 2 |
| Sunset (2026-10-06) | 7 at 3 of 8 | Great Oak 4, Huntington Beach 2, Temecula Valley 1 |
| City (2026-10-06) | 33 at 9 of 12 | Bishop's 10, Scripps Ranch 5, University City 5, Canyon Hills 4, Cathedral Catholic 3, La Jolla Country Day 2, Mission Bay 2, La Jolla 1, Patrick Henry 1 |
| North County (2026-10-06) | 19 at 8 of 19 | Torrey Pines 7, Mission Vista 3, Mission Hills 2, Mt. Carmel 2, San Marcos 2, La Costa Canyon 1, San Dieguito Academy 1, Westview 1 |
| Metro (2026-10-06) | 4 at 2 of 9 | Helix 3, Eastlake 1 |
| Independents (2026-10-06) | 4 at 1 of 5 | Harvard-Westlake 4 |

None at 21 schools: SCVAL's Valley Christian, Santa Clara and Saratoga; BVAL's Branham, Del Mar,
Live Oak, Prospect, Silver Creek and Sobrato; all seven PCAL schools; and MCAL's Archie Williams,
Redwood, Berkeley, Marin Catholic and Marin Academy. Six of these (Del Mar, Silver Creek, Sobrato,
Monterey, Santa Catalina, Marin Academy) listed no players on MaxPreps, so there was no row to tie
anyone to (Marin Academy's 18 appeared on 2026-10-07, after the sweep). In the EAL, none at Bella Vista, Corning and Lassen (Corning lists no players on
MaxPreps). By club (2026-10-03; NorCal Impact is 22, all current, with the three Davis ties): SF Hawks 31 (all current), NorCal Impact 19 (all current), Fly FHC 10 (2
current, 4 past, 4 unknown), Infinity 8 (1, 6, 1), Lightning 3 (1, 1, 1) and HTC 1 (current); with the
2026-10-04 ties, D-City 3 (0 current, 1 past, 2 unknown) and Chico Hotshots 2 (both current). With
the 2026-10-05 ties: SF Hawks 32, NorCal Impact 25, Fly FHC 13 (5 current, 4 past, 4 unknown),
Infinity 9 (2, 6, 1), Chico Hotshots 5 (4, 0, 1), D-City 4 (0, 1, 3), HTC 2 (both current) and Golden
Gate Rippers 1 (past). Seven clubs have no tied player: Pac Heights, Performance Field Hockey, San Jose
Khalsa, Stryker, Hayward Hawks, Lions and Roseville FHC. No club was found on the Peninsula or the Central Coast,
though both were searched. The Sacramento area (D-City, Roseville FHC) and the North State (Chico
Hotshots) were not searched for every club. Five clubs publish a roster page the club page links (SF
Hawks, NorCal Impact, Lightning, Roseville FHC and HTC: 14 pages in all); the players on them who are not on the tracked rosters
are not named anywhere on the site.

*The 2026-10-06 Southern California sweep.* The schools of the 53 Southern California teams (842
varsity rows; Chaparral, Fountain Valley, Marina, Newport Harbor, Fallbrook, San Pasqual, Bonita Vista
and El Capitan have none) were swept with the same rule. Three sweeps ran in parallel, each with its
own sources, and the four recruiting-profile sweeps (§1.1j) recorded every club block they read:
- **Club records.** USA Field Hockey's club finder (read through its JSON API: 312 clubs, 28 in
  California), the SoCal Field Hockey Federation's sites, the San Diego Field Hockey Association's club
  and links pages, FieldLevel's California club list, FH College Path's class pages, the NFHCA
  watchlists' club column and the California Cup 2026 standings (25 division pages, rendered) gave the
  candidates; each record was read from the club's own site, then re-read by a separate verifier, which
  corrected wording on all twelve (RUSH is in Encinitas, not San Diego; no "nonprofit" where the page
  says "Inc."; a venue whose name contains a surname is described instead). Myto's site answers curl
  only with a browser User-Agent and refuses headless Chromium; West Coast Riptide's refuses both, and
  was read through WebFetch and then re-read. Twelve clubs: RUSH, Coastal Clash, Myto and the San
  Marcos Knights (`san-diego`), the Ventura County Red Devils and Bulldogs (`ventura`), West Coast
  Riptide and the LA Tigers (`los-angeles`), and the Royals, the Huntington Beach Surfers, the SoCal
  Strikers and the Orange County Field Hockey Club (`orange-county`). None was found in the Inland
  Empire. Left out: Poway Mystix (`powaymystix.com` does not resolve from here, and its SportsEngine
  listing is not the club's own site), Moorpark Coyotes and Ventura Roadrunners (sites unreachable),
  Santa Monica FHC, Hollywood Field Hockey and DragonRunners (no site of their own), the Federation's
  adult clubs (The Kings, Oh Yeah!, Y2K, Brewdogs), 79 Field Hockey (an empty redirect) and two ice
  hockey clubs. HTC's region moved from `elsewhere` to `san-diego`: every HTC California season
  trains at The Bishop's School in La Jolla or the Chula Vista Elite Athlete Training Center. Its
  city now reads "La Jolla, CA (HTC California)", and its description no longer says
  "Connecticut-based", which the re-read could not confirm from the club's pages.
- **Ties from lists.** Both NFHCA watchlists (726 and 555 rows; 11 and 12 Southern California rows),
  MAX Field Hockey's 12 California club pages and 57 school pages (read in a browser), the
  SportsRecruits club pages of HTC California and Myto (Powerhouse U16, U19), a SportsRecruits athlete
  sweep of every row with each live field hockey page rendered for its CLUB and TEAMS blocks, RUSH's
  Elite Performance Group directory (21 profiles giving a graduation year only) and USA Field Hockey's
  event lists.
- **The MaxPreps club-teams block** of all 842 rows (1,684 pages, home and `/bio/`, none failed): only 23
  rows have one, 16 field hockey entries for 15 players, all quoted as found.
- **Players' own profiles**: the NCSA "Club Information" lines and FieldLevel Teams blocks of the pages
  §1.1j links, which gave ten more leads (earlier Coastal Clash and Myto seasons, Knights FHC).
Every candidate (72 ties and 10 leads) was re-opened by a checker that applied the rule and rewrote
the record, and separately by a refuter told to break it; only ties both kept are in the file. 75 ties
for 67 players at 23 schools were kept, and a 76th under the revised nickname rule (below): HTC 28 (24
current), RUSH 16 (14), Myto 15 (13), Coastal Clash
7 (2 current, 4 past), VCRD 6 (all current), Knights FHC 3 (2) and West Coast Riptide 1 (unknown); with the 76th,
61 current, 6 past and 9 unknown, 63 high and 13 medium. They rest on 173 source entries on 117 URLs:
SportsRecruits 80 on 64, other (MAX Field Hockey) 34 on 12, event (the watchlists, USA Field Hockey)
20 on 4, `maxpreps-career` 15 on 15, `club-site` (RUSH's directory) 13 on 13, NCSA 8 on 7 and
FieldLevel 3 on 2. By school, the most at Bishop's (10 players), Torrey Pines (7), Scripps Ranch and
University City (5 each). The club pages show the SoCal regions under the NorCal/SoCal switcher.

Southern California gotchas, all **[V]** on 2026-10-06:
- **"Rush Devils" is a joint squad, not a club.** The SoCal Field Hockey Federation's National Club
  Championship 2026 pages list "two RushDevils squads" drawn from RUSH (San Diego County) and the Ventura
  County Red Devils (VCRD), and USA Field Hockey registers "Rush Devils, Encinitas"; SportsRecruits'
  videos are titled "VCRD X RUSH Scrimmage". So a page that names only "Rush Devils" ties a player to
  neither club. A RUSH tie rests on a RUSH page (its directory, a MaxPreps club entry, the watchlist,
  NCSA) and a VCRD tie on a page naming VCRD. Left out on that ground: Alexis Andersen (Thousand Oaks)
  and Valentina Hernandez Ruiz (Harvard-Westlake), whose only club is "Rush Devils" (the checker would
  have credited both to VCRD by location; the refuter would not, and the conservative call stands), and
  a MAX Field Hockey "Rush" listing for Margaux Schlumberger, whom every other page ties to VCRD.
- **SportsRecruits event-registration organizations** ("HTC - CA (237586)", "Rush Devils (225539)")
  appear in a profile's CLUB block; the number is an event roster's id and is not part of the club name.
- **A profile with no date is current only while nothing older-looking contradicts it**: Cece Jeffery's
  and Delia Schwab's HTC profiles show nothing dated after 2024-01 and 2025-07, so they are `unknown`.
- **Common names need a school or a hometown.** Gabriella Jones (Myto) and Lucy Miller (RUSH) meet the
  rule as written (class year plus a San Diego club) but no page names their school or hometown, and
  the refuter could not rule out another player: both are left out. Abigail Karlander's pages say
  "Abby" and name no school, so the nickname rule as it then stood left her out; under the revised
  rule (a nickname backed by more than the name) she is tied to RUSH at medium: RUSH's directory and
  her SportsRecruits profile both give "Abby Karlander", class of 2029, San Diego, RUSH's directory
  has one Karlander, and no other Abby or Abigail Karlander plays field hockey on SportsRecruits, the
  watchlists or FH College Path. A fresh checker and refuter both kept it; its weak point is that the
  second page names only the joint "Rush Devils" squad.
- **A bare team card is not a club tie**: Dylan Rietti's HTC profile also shows an "SF Hawks U19" card
  with no club label or date, beside a Northern California event; it is not recorded.
- **The Los Angeles, Orange County and Ventura clubs publish no player rosters**, so ties there rest on
  the players' own pages and the watchlists, and schools there are nearly blank.

*When a roster refetch breaks it.* The join is checked at load against the merged rosters. If
`pnpm fetch-rosters` drops or respells a tied player's row, or the overlay marks it JV, the tie is roster
drift (`lib/players/roster-drift.ts`): `lib/players/clubs.ts` leaves it out of the site and reports
`clubs: <team> / <player> (<club>): <what>` (`pnpm roster-drift`; a warning on the refresh's run page; a CI
failure only on a pull request that added or edited the record). A season rollover that moves
`data/field-hockey/rosters.json` to a season `data/field-hockey/clubs.json` is not for still throws at import.
Re-check a drifting affiliation's sources and edit or drop it by hand (on a rollover, redo the research for the
new season). It is never pruned automatically.

*Ties by person (since 2026-11-26).* The file holds every tie as a `membership`: the person's registry id
(`playerId`, `data/players.json`) and her official name, then the club and the rest of what an affiliation was. It
names no roster row. `data/field-hockey/player-index.json` (written by `pnpm build-players`) says which person each
of this season's rows is, and `lib/players/clubs.ts` serves each membership as the tie of her row: an `affiliation`
on her varsity row, else a `listedAffiliation` on her row of a school's own varsity list, else a `jvAffiliation` on
her JV row, named as the row is. A person on no field hockey row this season keeps her ties, shown nowhere (not
drift); a season rollover re-keys nothing. Before, the three lists named a row (team slug and MaxPreps' per-season
athleteId, or the listed name), and a new season's rows lost them. The pages are as they were: current and earlier
clubs are both shown.

*Listed players' ties.* Players on a team's `listed` roster (`rosters-enrichment.json` otherRosters: a team MaxPreps
lists nobody for, whose own site lists its varsity) are registry people since 2026-11-26 (a `school-roster`
sighting per name), so their ties are memberships like any other. `lib/players/clubs.ts` keys each as her listed
row is (`listedPlayerKey`, "listed:Anna Schwab", never written to a file) while the team page shows the list, and
serves it with `affiliations`: the club pages and counts list her, and her listed row shows the club line. Once
MaxPreps lists the team, her MaxPreps row is her (joined by name) and the tie moves with her. Two: Marina's Anna
Schwab and Newport Harbor's Kate Shepherd, both VCRD, each from her own SportsRecruits page, re-opened by an
independent refuter (2026-11-26).

*JV ties.* `jvAffiliations` (served from the memberships of people whose row this season is a JV one) holds ties
for players on JV rows, kept apart from `affiliations`, which list varsity rows only and are all the club pages, the
club counts and the roster's club lines show. They are the same records under the same rules, on a row the overlay
marks JV or a row of the team's MaxPreps JV roster; `getJvClubAffiliations()` serves them. They were
recorded on 2026-10-05 from the recruiting-profile re-read (a SportsRecruits page's CLUB and TEAMS
blocks, read in a browser because they are rendered by script): four ties for three Los Gatos JV
players, Casey Moorehouse (NorCal Impact and SF Hawks), Beatrix Monk (NorCal Impact U16) and Colette
Von Klemperer (NorCal Impact), each on her own profile with a class year that agrees with the roster
grade, and each current under the live-profile rule. Only the profiles the overlay links were read,
so other JV players may have club ties no page here records. Beatrix Monk's tie moved to `affiliations` on
2026-11-16 with her row (below), leaving three ties for two players.

*2026-11-16: MAX Field Hockey.* The athlete pages of the profile sweep (§1.1j, recruiting profiles) each name a club; every club they
name for a tracked player was already tied here but one: Harvard-Westlake's Margaux Schlumberger, whose page and
MAX's Rush Field Hockey club page list her with "Rush". The tie is `unknown` (neither page dates it) and
`medium`, since her SportsRecruits club reads "RUSH DEVILS, VCRD", the joint squad this file ties to VCRD, and
MAX's "Rush" may stand for it. Beatrix Monk's MAX page also lists her 2026 freshman season as "Varsity #1"
("First freshman selected to Varsity team in program history", with her goals and assists), so her Los Gatos row
is varsity since that day, its `levelSource` her MAX page, though the school's own JV list, re-read the same day,
still holds her and its varsity list (27 names) does not; Los Gatos posts no MaxPreps stats to settle it. Casey
Moorehouse's MAX page claims no varsity spot, and her row stays JV.

**(j3) College commitments** — `data/commitments.json` since 2026-11-26, one file for every build, each
commitment under the person's registry id (field hockey's research was `data/field-hockey/commits.json`, kept as its
round in `rounds`; `lib/players/commits-schema.ts`, read by `lib/players/commits.ts`; shown on `/commits` and in a
commitment line on each committed player's team page roster, DESIGN §21). A build shows the commitments of the
people on its varsity rows this season (`data/<sport>/player-index.json`), so a two-sport player's is on both
builds' pages from one record (Katarina Smith's, kept twice until then), and a graduate's stays in the file, shown
nowhere. Research on 2026-10-03 (field hockey) and 2026-10-04 (every sport, and a second
field hockey pass; and, for the six EAL teams' schools, a field hockey sweep and then the every-sport
round; and, on 2026-10-06, the every-sport round for the 53 Southern California teams' schools; and, on
2026-10-12, a round over every row with each player's other sports, partial: see below; and, on
2026-10-22, 2026-11-03, 2026-11-06, 2026-11-13 and 2026-11-22, another round over every row each: see below), not
a script: nothing fetches or refreshes it. It holds 39 commitments (23 in field hockey, 12 in lacrosse,
2 in soccer, 1 in basketball, 1 in softball; one, Phoebe Miller's, `signed`) and the 30 colleges they are to, with 33 programs (UC Davis, Cal and
Harvard hold two each: field hockey and lacrosse), each commitment a player on the tracked varsity
rosters (43 teams in both NorCal rounds; 49 with the EAL; 102 with Southern California), joined to `data/field-hockey/rosters.json` on team slug + MaxPreps
athleteId as the clubs are. A commitment has the college, the `sport` (field hockey, or any other:
`COMMIT_SPORTS`), a `status` (`committed`, or `signed` only where a source says so), an `asOf` (the
earliest date a kept source gives: a day, a month or a year), a `confidence`, and its sources (URL,
kind, a verbatim quote of at most 300 characters, the school, class year and date the page states);
`basis` says what the match rests on. A college record has its official name and display name, city
and state, one `programs` entry per sport a player here committed to it in (that team's division and
conference, which can differ from the college's other teams, and its page on the college's athletics
site), and the pages each fact came from. Quotes and bases are for maintainers and never rendered
(`commitmentLeaks` in `scripts/copy-rules.ts`, run by `scripts/assert-copy.ts`): a commitment list
or a news story names teammates and other recruits who are not on the rosters.

| School | Player (class) | Sport | College | Level | Rests on |
|---|---|---|---|---|---|
| St. Ignatius | Storey Lewis (2027) | Field hockey | Colgate | NCAA Division I | Her own SportsRecruits profile (names St. Ignatius); Stick Together's Aug 6, 2026 season preview ("recently committed to DI Colgate"; `asOf`); the SF Hawks committed-players table; FH College Path's class of 2027 list; SportsRecruits' Colgate page |
| St. Ignatius | Maggie Magnano (2027) | Field hockey | UC Davis | NCAA Division I | Her own SportsRecruits profile, under her given name Margaret (names St. Ignatius); the SF Hawks table; FH College Path's class of 2027 list; Stick Together's Feb 4, 2026 issue ("Maggie Magnano → UC Davis (D1)", for the SF Hawks defender; no school or class year, so it corroborates; `asOf`); the Marin IJ's Aug 24, 2026 story ("SI senior defender … committed to UC Davis field hockey"); SportsRecruits' UC Davis page |
| St. Ignatius | Olivia Van De Braak (2028) | Field hockey | Iowa | NCAA Division I | Her own SportsRecruits profile (spelled Van de Braak; names St. Ignatius); FH College Path's class of 2028 list; St. Ignatius athletics' Oct 1, 2026 sports report ("University of Iowa commit Olivia Van de Braak"; `asOf`); SportsRecruits' Iowa page |
| Los Altos | Katarina Smith (2027) | Field hockey | Ithaca | NCAA Division III | The Talon's Sep 18, 2026 story (`asOf`); her own SportsRecruits profile (names Los Altos High School); SportsRecruits' Ithaca college page |
| Saint Francis | Carolyn Cordoni (2027) | Field hockey | Bates | NCAA Division III | Her own SportsRecruits profile, which names Saint Francis; SportsRecruits' Bates page, built from the same profile; Stick Together's Nov 5, 2026 issue ("Ferrini's St. Francis teammate Carolyn Cordoni will play at Bates"; `asOf`, added 2026-11-06) |
| Saint Francis | Evie Ferrini (2027) | Field hockey | Wellesley | NCAA Division III | Stick Together's Nov 5, 2026 issue ("St. Francis's Genevieve (Evie) Ferrini … headed to Wellesley"; `asOf`, the issue's date; it also calls her the SCVAL De Anza Junior of the Year). High: the page names the school. Added 2026-11-06 |
| Gilroy | Hailey Moncada (2027) | Field hockey | Mercyhurst | NCAA Division I | Stick Together's Nov 5, 2026 issue ("Gilroy senior Hailey Moncada (Infinity) will play Division I field hockey in Erie, Pennsylvania"; `asOf`, the issue's date). High: the page names the school. Added 2026-11-06 |
| Christopher | Alyssa Montejano (2027) | Field hockey | Maryville | NCAA Division II | Her own SportsRecruits profile (class of 2027, Gilroy, CA; no school named, so the class year plus a Gilroy hometown); SportsRecruits' Maryville college page, built from the same profile. Undated |
| Christopher | Ryan Hemeon (2028) | Field hockey | UC Davis | NCAA Division I | One line on FH College Path's class of 2028 list: name, CA, position, Infinity Sports Club. Medium: no school is named, so the class year plus a Gilroy club this row is already tied to (§1.1j2). Her own SportsRecruits profile shows no commitment, which is absence, not contradiction. Undated |
| Redwood | Claire Johnson (2027) | Lacrosse | Cal | NCAA Division I | The Marin IJ's Apr 23, 2026 girls lacrosse story ("Redwood’s Claire Johnson, a junior committed to play at Cal"; `asOf`); her own SportsRecruits lacrosse profile (names Redwood High School); STEPS California's commitments page |
| Redwood | Phoebe Miller (2027) | Lacrosse | San Diego State | NCAA Division I | The same Marin IJ story ("a junior committed to play at San Diego State"; the commitment's date); her own SportsRecruits lacrosse profile (class of 2027, Larkspur, CA); STEPS California's commitments page (Redwood High School); San Diego State athletics' Nov 11, 2026 signing release ("announced the signing of six student-athletes from the class of 2027", with her bio: Redwood High School), so `signed` since 2026-11-13, `asOf` the release's date ("Signed, as of Nov 11, 2026") |
| St. Ignatius | Sofie Stiefel (2027) | Lacrosse | Marist | NCAA Division I | Her own SportsRecruits lacrosse profile (listed under St. Ignatius's girls' lacrosse); STEPS California's commitments page. Undated |
| St. Ignatius | Catherine Cecchini (2027) | Lacrosse | Bucknell | NCAA Division I | Her own SportsRecruits lacrosse profile, as Cate (its bio names St. Ignatius College Prep and the class of 2027); STEPS California's page (Cate Cecchini, St. Ignatius College Prep). Undated |
| Marin Catholic | Gianna Rinaldi (2028) | Lacrosse | UC Davis | NCAA Division I | Her own SportsRecruits lacrosse profile (class of 2028, Novato, CA; no school in its text, so the class year plus a Marin hometown); SportsRecruits' UC Davis lacrosse page, built from it; since 2026-11-13 STEPS California's commitments page, which names Marin Catholic. Undated |
| Stevenson | Zola Ducker (2027) | Lacrosse | Trinity (Conn.) | NCAA Division III | Her own SportsRecruits lacrosse profile (class of 2027, Pacific Grove, CA, Verve Lacrosse); Lacrosse Masters' girls' commitment list ("Verve Lacrosse / Stevenson School - CA - 2027"); SportsRecruits' Trinity page. Undated |
| Berkeley | Violet Potts (2027) | Lacrosse | Vassar | NCAA Division III | Her own SportsRecruits lacrosse profile (class of 2027, Berkeley, CA, ADVNC Lacrosse); ADVNC Lacrosse's own commitments page (its 2027 class: "Violet Potts - Berkeley - Vassar"). Undated |
| St. Ignatius | Gigi Colant (2027) | Soccer | St. Lawrence | NCAA Division III | Her own SportsRecruits soccer profile, under her given name Gabriella (its bio names Saint Ignatius College Prep, the class of 2027 and "Gigi Colant"); SportsRecruits' St. Lawrence soccer page. Undated |
| Saratoga | Emma Williams (2027) | Basketball | Bryn Mawr | NCAA Division III | The Saratoga Falcon's Mar 20, 2026 story, "Junior commits to Division III basketball at Bryn Mawr College" (the paper is Saratoga High School's; she committed in late February, so `asOf` is 2026-02). One source |
| Lick-Wilmerding | Frankie Lemieux (2028) | Field hockey | Dartmouth | NCAA Division I | One line on the SF Hawks' alumni and committed players table ("Frankie Lemieux 2028 Dartmouth University"; the page was edited 2026-11-02). Added 2026-11-03 as medium (no school named: the class year plus the San Francisco club this row is already tied to, §1.1j2); high since 2026-11-06, when Stick Together's Nov 5, 2026 issue named her a Lick-Wilmerding junior committed to Dartmouth (`asOf`) and FH College Path's class of 2028 list added her (as Francine Lemieux). Her own SportsRecruits profile shows no commitment |
| Leigh | Clara Froemming (2027) | Field hockey | Wellesley | NCAA Division III | One line on Play College Field Hockey's sheet ("Clara,Froemming,Wellesley,2027,July 12, 2026"; `asOf`), which names no school or place. Published on the owner's confirmation (2026-11-03) from an Instagram post the file cannot cite, as medium; high since 2026-11-06, when Stick Together's Nov 5, 2026 issue named her as Leigh's Clara Froemming, headed to Wellesley. Added 2026-11-03 |
| Torrey Pines | Dylan Rietti (2027) | Field hockey | Richmond | NCAA Division I | Her own SportsRecruits profile (names Torrey Pines); the Falconer's (Torrey Pines' student paper) Sep 22, 2026 story ("committed … in July"; `asOf` 2026-07) and Sep 16, 2026 commitments story; FH College Path's class of 2027 list; SportsRecruits' Richmond page |
| Torrey Pines | Ava Hauer (2027) | Field hockey | Johns Hopkins | NCAA Division III | Her own SportsRecruits profile; the Falconer's Sep 16, 2026 story (`asOf`); SportsRecruits' Johns Hopkins page |
| Bishop's | Lola Conway (2028) | Field hockey | Michigan | NCAA Division I | Her own SportsRecruits profile (TEAMS names The Bishop's School); FH College Path's class of 2028 list; SportsRecruits' Michigan page. Undated |
| Harvard-Westlake | Margaux Schlumberger (2027) | Field hockey | Harvard | NCAA Division I | Her own SportsRecruits profile (names Harvard Westlake High School); FH College Path's class of 2027 list; SportsRecruits' Harvard page. Undated |
| Scripps Ranch | Samantha Ippolito (2027) | Field hockey | Michigan State | NCAA Division I | Her own SportsRecruits profile; the San Diego Union-Tribune's Sep 22, 2025 athletes-of-the-week item (`asOf`); Scripps Ranch News (Oct 3, 2025 and Sep 21, 2026, dated from the site's WordPress API); FH College Path; RUSH's player page; SportsRecruits' Michigan State page. The row has no grade: every page says 2027 |
| Canyon Hills | Eva Allen (2028) | Field hockey | Cal | NCAA Division I | Her own SportsRecruits profile, as Eva Jo Allen (its bio names Canyon Hills High School); FH College Path's class of 2028 list; RUSH's player page; SportsRecruits' Cal page. Undated |
| Canyon Hills | Rylie Storm (2028) | Field hockey | Harvard | NCAA Division I | Her own SportsRecruits profile (class of 2028, San Diego, CA), which shows "Committed to Harvard University" since the 2026-11-03 probe (high since then); one line on FH College Path's class of 2028 list (name, CA, position, Rush FH), on which she was medium until then. Undated |
| Canyon Hills | Reese Roldan (2027) | Field hockey | UC Davis | NCAA Division I | One line on FH College Path's class of 2027 list (Rush FH); RUSH's player page, whose College Commitment field is a UC Davis logo linking to its field hockey page; since 2026-11-13 MAX Field Hockey's player page, which names Canyon Hills (still medium: MAX takes the commitments its users report). Undated |
| San Marcos | McKenzie Rackleff (2027) | Field hockey | Lock Haven | NCAA Division I (an Atlantic 10 affiliate; the college's other teams are Division II) | Her own SportsRecruits profile, already linked on her row (class of 2027, San Marcos, CA, HTC-CA), which showed "Committed to Lock Haven University" when the 2026-11-13 round re-read it. High: her own profile. Undated |
| San Dieguito Academy | Ella Rennie (2027) | Field hockey | Muhlenberg | NCAA Division III | Her own SportsRecruits profile (names San Dieguito Academy); Play College Field Hockey's sheet ("June 19, 2026" under Date Committed; `asOf`); SportsRecruits' Muhlenberg page. The row has no grade: every page says 2027 |
| Bishop's | Emerson Davis (2028) | Lacrosse | Harvard | NCAA Division I | Her own SportsRecruits lacrosse profile (TEAMS names The Bishops School); SportsRecruits' Harvard lacrosse page. Undated |
| Cathedral Catholic | Lia Palecek (2028) | Lacrosse | Oregon | NCAA Division I | Her own SportsRecruits lacrosse profile (names Cathedral Catholic High School); SportsRecruits' Oregon lacrosse page. The row has no grade: every page says 2028. Undated |
| Torrey Pines | Abby Feldman (2027) | Soccer | Macalester | NCAA Division III | Added 2026-11-22. TopDrawerSoccer's own profile page for her (goalkeeper, class of 2027, Legends FC San Diego, "High School: Torrey Pines", Macalester) and its Recruiting Roundup of Nov 16, 2026 (`asOf`), which spells the college "Macalaster(w)". High. Her SportsRecruits soccer profile shows no commitment |

*Sources, by kind (43 entries on 36 URLs; the Southern California twelve add 38 entries on 31 URLs: `sportsrecruits` 18 on 18, the players' own profiles and SportsRecruits' college pages; `event` 9 on 3, FH College Path's 2027 and 2028 lists and Play College Field Hockey's sheet; `news` 6 on 5, the Falconer, the Union-Tribune and Scripps Ranch News; `club-site` 4 on 4, RUSH's player pages; `maxpreps` 1, Sami Lee's own career page).* `sportsrecruits` 23 on 23: fourteen of the players' own
profiles, one per sport subdomain (`nfhca.` for field hockey, `iwlca.` for lacrosse, `my.` for
soccer: `/athlete/<slug>`, where the meta description reads "… • <city>, CA • Committed to
<College>"), and nine of SportsRecruits' college pages
(`sportsrecruits.com/athletic-scholarships/womens-<sport>/<state>/<college>`, which list "Committed
Athletes" from the same profiles, so they corroborate but are not independent). `news` 7 on 6: two
Stick Together issues (Feb 4 and Aug 6, 2026), The Talon (Los Altos High School's student paper),
two Marin IJ stories (one naming both Redwood lacrosse commits) and The Saratoga Falcon. `club-site`
7 on 3: the SF Hawks' `/alumni-and-committed-players/` table (name, graduation year, college;
undated, and stale: it lacks the Iowa commitment), STEPS California's commitments page (a Marin
girls' lacrosse club: player, college, graduation year, high school; four entries) and ADVNC
Lacrosse's commitments page (by class: name, school or town, college). `event` 5 on 3: FH College
Path's "Who committed" class lists for 2027 (`/class-of-20271.html`) and 2028 (`/class-of-2028.html`),
Division I only, giving name, state, position and club but never a school, so they can only meet
the rule through a class year plus a Northern California club, and Lacrosse Masters' girls' college
commitment list (name, club, school, state, class). `school-site` 1: St. Ignatius's athletics site.

*The rule* is the clubs' rule (§1.1j2) applied to colleges: a public page must name the player and
the college in the context of one sport (field hockey, or any other since 2026-10-04: many players
here also play lacrosse, soccer or basketball), and either name the player's high school, or give a class
year that agrees with the roster grade together with a location in the school's half of the state
(the player's hometown, or a club or team based in Northern California for a NorCal school, in
Southern California for a SoCal one; "CA" alone is not enough). A class year
that disagrees with the roster grade rules a match out (since 2026-11-21, one a grade above a roster grade marked
`rosterBehind` agrees: §1.15), and `lib/players/commits.ts` refuses the file at load otherwise
(for a row with no grade, the stated class years must agree with each other and be a class
a high school roster of the season can hold). Not a commitment: MaxPreps' "College Interests"
(`careerCollegeInterestsData` on a career `/bio/` page, which was empty for every in-scope player
anyway), offers, visits, camps, watchlists, all-league lists, and a place on a college's club team
(club lacrosse, for one). A page drawn by a script (SportsRecruits' `/committed/<club>` pages and its
profiles' TEAMS blocks and "Committed to … on M/D/YYYY" tooltips, MAX Field Hockey's search) may be cited
since 2026-11-13 (owner decision), quoting what it shows once rendered, when two separate rendered reads
agree, and the basis says so; until then such pages were leads only and every quote had to be in the page's
own HTML. The club ties (§1.1j2) have been read that way since 2026-10-05. Social media only from an official account (since 2026-10-12):
`BANNED_HOSTS` (shared with §1.1j2) refuses Instagram, Facebook, TikTok, X, Threads, YouTube,
Snapchat, LinkedIn and their short links everywhere in the file except as an `official-social`
source, a post by the `account` it names: a college's athletics or team account, the player's high
school's (its athletics department's or a team's), or a club's, never a person's. The account
records its platform, handle, owner (`college`, `school` or `club`), the owner's name (the link
label: "Valley Christian athletics on X") and `proof`, a page that is not social media showing the
account is the owner's (its website linking it, most often); the schema checks the URL is a post by
that handle (`isPostBy`; an Instagram post is cited at its `/<handle>/p/<code>/` address). A
player's own post is a lead, never a source. X posts can be read without a login
(`publish.twitter.com/oembed`); Instagram, Facebook and TikTok cannot be read from the research
environment, so a post there is checked by hand before it is cited.

*How it was done, 2026-10-03 (field hockey).* Fourteen sweeps, run in parallel: four by source family (commitment lists and
recruiting aggregators; NorCal clubs and field hockey media; school and local news for SCVAL and
BVAL; for MCAL and PCAL) and ten player by player over the packets of the 37 teams with roster rows,
which looked up 609 players (every junior, senior and ungraded row, and any younger player with a
linked recruiting profile): the linked profiles, a SportsRecruits slug probe, the MaxPreps career
and bio pages, a name search, and the school's athletics site. They converged on seven candidates,
each found by two to five sweeps. Each was then re-opened by a checker and, separately, by a refuter
told to break it (another person of the same name, another sport, a quote not on the page, a stale or
reversed commitment, a class year that disagrees); all seven survived both, and only the sources both
passes confirmed were kept. A completeness
critic then read every sweep's coverage report and planned five follow-ups (club commitment lists
never read, NCSA and Hudl profiles never opened, school and student-news sites that had failed, the
watchlisted seniors, one spreadsheet lead), which found no new commitment and two more dated sources
for existing ones (St. Ignatius athletics' Oct 1, 2026 report for Van De Braak and Stick Together's
Feb 4, 2026 issue for Magnano). Those two were kept after a hand re-read and a final audit that
re-opened every source in the file (and corrected four college source descriptions), so every kept
source, and every `asOf`, rests on a second, independent read; MAX Field Hockey's dates, which no
second read could confirm, are not used. Each college's division, conference and field hockey page
were read from its own athletics site (Sidearm's page metadata carries `school_division` and
`school_conference`) or, where that site refuses plain requests (Colgate, UC Davis), from other
pages: Colgate's division from colgate.edu and its Patriot League membership from Lafayette's and
Holy Cross's schedules; UC Davis's MPSF from its own schedule, read through WebFetch, its place from
Stanford's schedule and its division from NCAA.com's school page.

*How it was done, 2026-10-04 (every sport, and more field hockey recall).* The rule widened to any
sport (a commitment's `sport`; a college's level and conference per program), and eleven more sweeps
ran, each matching what it read against all 716 varsity rows of the 43 teams then tracked (full name,
then surname with school or class, for nicknames; the six EAL teams were first swept for field hockey
only, and had the round later the same day, see *the EAL schools* below):
- **Compiled lists, read whole.** SportsRecruits' college pages for field hockey (290 colleges, 2,879
  "Committed Athletes" entries), women's lacrosse (643) and women's soccer (1,670), and the profile of
  every class-of-2027-or-later entry (975 field hockey profiles, 16 of them in California); FH College
  Path's six class lists; Stick Together's whole archive (30 posts, from its sitemap); MAX Field
  Hockey's commitments table (987 rows) and its California club and school pages; HTC's alumnae list;
  Play College Field Hockey's sheet; TopDrawerSoccer's California lists for 2027 and 2028, SoccerWire's
  and the ECNL/Girls Academy's commitment data; Lacrosse Masters, STEPS California, ADVNC and other
  NorCal lacrosse clubs' commitment pages; MileSplit's California signings.
- **Player by player.** A SportsRecruits profile-address probe for all 716 rows (4,578 addresses,
  every sport), FieldLevel and NCSA probes, and a deep search of the 66 players tied to a club
  (§1.1j2): their linked profiles, the probes, two web searches each. Then SportsRecruits' own
  athlete search (the Meilisearch index its pages query, read with the public search key they embed,
  with the owner's approval), queried for every row by full name and by surname, all sports: 19,314
  records with the row's surname and class year in California or with no state, of which the 3,428
  with the same first initial or a California home were opened. 104 show a commitment: the fifteen
  in the file that rest on a SportsRecruits profile (every one of them), and the rest same-surname
  athletes elsewhere, mostly Southern California, or with another first name. No new commitment.
- **News.** Every story since 2025 on 18 student papers and the high school sports sections of the
  Marin IJ, Mercury News, Monterey Herald, Gilroy Dispatch, Morgan Hill Times, BenitoLink, the Free
  Lance and the Los Gatan (most through their sites' WordPress APIs), and the athletics news of the
  schools that publish it.
They found nine new commitments (seven in lacrosse, one in soccer, one in basketball), no new field
hockey commitment that meets the rule, and new pages for four existing ones (a second first-hand
news story for Magnano, and SportsRecruits' college pages for Cordoni, Lewis and Van De Braak). Every
candidate was re-opened by a checker and, independently, by a refuter told to break it; both kept
the nine, and the refuter dropped one field hockey candidate the checker would have kept (a Hollister
senior "planning to continue her field hockey career" at a college: a plan, not a commitment, and
nothing else says she committed), which is recorded as a near miss. Each new college's level and
conference for the sport were read from its athletics site (Sidearm metadata, a schedule's conference
tags, a news headline), the conference's own site or NCAA.com, by the checker and again by hand. A
final audit re-opened every source the file cites and found every quote on the page as served,
STEPS California's page through WebFetch (it answers plain requests with a bot challenge).

*How it was done, 2026-10-04 (the EAL schools, every sport).* A field hockey sweep of the six EAL
teams' schools (the NFHCA 2026 high school watchlist, the NCFHA youth directory, SportsRecruits
profile slugs, FH College Path's classes 2026-2028 and MAX Field Hockey) found no commitment; the
every-sport round had then covered only the 43 earlier teams. Later the same day four sweeps took the
round to the EAL's 95 varsity rows (Bella Vista 19, Chico 20, Davis 19, Lassen 15, Pleasant Valley
22; Corning has no roster rows), each matching what it read against all 95 by full name with
nickname variants, then by surname, with every same-surname hit checked by hand:
- **Field hockey lists, read whole.** SportsRecruits' 290 field hockey college pages (2,880
  "Committed Athletes" entries), FH College Path's class lists for 2026 to 2031 and its other
  commitment pages, Stick Together's whole archive (30 URLs from its sitemap), HTC's alumnae list,
  Play College Field Hockey's sheet (164 rows), the NFHCA 2026 watchlist, and MAX Field Hockey's
  table (986 unique rows, read with a headless browser; not cited).
- **Other-sport lists and databases.** SportsRecruits' women's lacrosse (643) and women's soccer
  (1,652) college pages; TopDrawerSoccer's California girls' commitments for 2027 to 2030 (335 rows);
  SoccerWire's girls' commitments for 2027 to 2030 (852 records, read from the endpoint its
  script-drawn tracker calls, so not citable) and its 21 monthly announcement pages; ClubLax's
  commitments database (44,661 records); Lacrosse Masters, ADVNC, the National Lacrosse Federation
  and Prep Girls Lacrosse; MileSplit's California signings; and the Sacramento and North State club
  pages for soccer (Davis Legacy, Placer United), volleyball, softball and basketball.
- **News and schools.** A search of each of the 95 names, since January 2025, on the sites of the
  Chico Enterprise-Record, Red Bluff Daily News, Daily Democrat and Paradise Post (WordPress APIs,
  the first 20 results for each name) and the Davis Enterprise (TownNews search); full crawls since
  January 2025 of the Enterprise-Record's high school section (340 posts) and Red Bluff's high
  school and local sports sections, and the Enterprise-Record's commitment and signing stories;
  Davis High's and Pleasant Valley's student papers (Chico High has none); and the schools' and
  districts' athletics and news pages.
- **Player by player.** Two web searches for each of the 78 juniors and seniors (156), each result
  read for a college; the profiles those searches surfaced. The same day's recruiting-profiles
  research ran SportsRecruits' profile-address probe for all 95 rows (1,242 addresses, every
  sport: 88 live profiles, nine showing a commitment, each another player by class year or state)
  and NCSA and FieldLevel probes, for field hockey only.
It found no commitment in any sport, so the EAL adds no row. Not run for these rows: SportsRecruits'
athlete search, which turned up every commitment in the file that rests on a SportsRecruits
profile; the 17 freshmen and sophomores got no web searches. Near misses, none a commitment: three
Davis players on the NFHCA watchlist, which names no college; a Davis junior's own field hockey
profile stating a goal to play in college and a Davis senior's SportsRecruits bio saying she would
love to continue to play at the collegiate level (both plans); a SportsRecruits soccer entry under a
Davis senior's exact name whose class year, 2025, disagrees with the roster grade (another player,
in Virginia); the class of 2026's commitments from Chico, Pleasant Valley and Davis in Stick
Together and the Davis Enterprise's May 23, 2026 signing story, whose players have graduated; and
same-surname entries with another first name, state or class year. An Action News Now story on
Chico High soccer players committing to Division I (October 28, 2021) names Priscilla Ward and
Taylor Dever, neither on these rosters.

*How it was done, 2026-10-06 (the Southern California schools, every sport).* The round was taken to
the 53 Southern California teams' schools (842 varsity rows; eight teams have none), with the same
rule and a Southern California location for a Northern California one. Three sweeps ran in parallel,
each matching what it read against all 842 rows by full name with nickname variants, then by surname:
- **Field hockey lists, read whole.** SportsRecruits' 27 state pages and 290 field hockey college
  pages, and the endpoint behind their "See More Commits" button
  (`api.sportsrecruits.com/api/v1/program/commits/<id>/<offset>`), paged to the end for 285 programs:
  35,060 records in every sport, 2,900 in field hockey, not a superset of the pages' first ten, so the
  union was read and all 988 class-of-2027-or-later profiles in it opened (21 in California, 5 with no
  state). FH College Path's class and list pages; Play College Field Hockey's sheet (163 rows); MAX Field
  Hockey's California, 2027 and 2028 tables (read in a browser, leads only, never cited); RUSH's
  directory, 21 Elite Performance Group pages, 103 alumni pages and its news; HTC, Coastal Clash, Myto,
  VCRD, the Surfers, the Royals and the SoCal Field Hockey Federation (none posts a SoCal commitment
  list); the NFHCA 2026 watchlist; Stick Together (NorCal only).
- **Other-sport lists.** SportsRecruits' lacrosse (643 colleges), soccer (1,659), volleyball (1,817),
  basketball (1,854), water polo (141) and softball (1,699) college pages; ten SoCal lacrosse clubs'
  SportsRecruits "committed" pages (drawn by script: discovery only); TopDrawerSoccer's California
  2027-2028 lists, SoccerWire (its search endpoint, not cited, and its monthly pages), Prep Soccer;
  ClubLax (44,660 records, stale to January 2026), Lacrosse Masters, Prep Girls Lacrosse, the NLF, and
  other lacrosse lists; MileSplit's California signings, Prep Dig, Prep Softball and Prep Hoops.
- **News.** The San Diego Union-Tribune, the OC Register and the other Southern California News Group
  papers, the Coronado Times and Scripps Ranch News (WordPress APIs, since 2025), the Falconer, the
  Harvard-Westlake Chronicle, the Bishop's Tower and Cathedral Catholic's athletics news.
- **Player by player.** A SportsRecruits profile-address probe in every sport: 9,558 addresses for the
  700 juniors, seniors and ungraded rows (947 live, 308 rows), and 2,514 more over all 842 in the field
  hockey sweep. Web searches reached 840 of the 842 rows. The first pass planned two searches for each
  of the 203 seniors and one for each junior and ungraded row (903), and reached 612 of the 700 rows (all
  seniors and juniors, 238 of the 326 ungraded rows) before the search tool's budget ran out; a second
  pass, at the owner's request, ran two searches for each of the 142 freshmen and sophomores and 86 of
  the 88 ungraded rows the first had not reached (228 rows, 456 searches), and found no commitment. The two rows never searched are Samantha Ippolito and Ella Rennie (Scripps Ranch and San
  Dieguito Academy, both ungraded), whose commitments the list sweeps had already found.
They converged on eleven commitments, each found by at least two sweeps: nine in field hockey and two
in lacrosse (the table above). A checker re-opened every source (rendering each SportsRecruits profile
for its TEAMS block), kept only quotes it found verbatim, rewrote each `basis` and read each college's
level and conference; a refuter, separately, tried to break each one (a sibling, another sport, a
namesake, a stale or reversed commitment, a class year that disagrees) and re-read every program's
conference. Both kept all eleven. A twelfth was added the same day under the owner's revised nickname
rule (§1.1j2, *The rule*): Sami Lee (Canyon Hills) to Columbia, field hockey, medium. FH College
Path's class of 2027 list has one line "SAMANTHA LEE CA DEF-MID RUSH FH COLUMBIA", RUSH's page for
"Samantha Lee" (2027) shows a Columbia logo as her commitment, and her own MaxPreps career page (the
roster row's careerid) names Canyon Hills, the class of 2027 and club RUSH, U19, which is what backs the
given name. A second Canyon Hills "Samantha Lee" MaxPreps page (careerid 8eght4kgmcg66) holds only the
2023-24 season, with the jersey number Sami's page carries in 2024-25, and the two never share a roster:
both verifiers read it as her own older page. Columbia (NCAA Division I, Ivy League) was read from
NCAA.com and the Ivy League's standings and schedule; its athletics site refuses plain requests and a
headless browser. A fresh checker and refuter both kept it. Each new college's division and conference was read from its
athletics site's Sidearm metadata (Johns Hopkins, Muhlenberg), the conference's standings (the Big
Ten for Michigan, Michigan State and Oregon lacrosse; the Ivy League for Harvard), or, where those
sites refuse plain requests and a headless browser (Richmond, Cal, Harvard, Michigan), a headline on
the athletics site plus NCAA.com's school page.

Southern California gotchas, all **[V]** on 2026-10-06:
- **SportsRecruits' "Committed" badge names no college.** Reese Roldan's profile shows one with the
  tooltip "You have been added to an event or team roster as a committed athlete"; her college comes
  from FH College Path and RUSH's page. Every committed profile also has a script-drawn "Committed to
  … on M/D/YYYY" tooltip; as before, those dates are not used (Ippolito's is later than a Sep 2025 news
  story, Rennie's later than her sheet's date, so they look like profile-entry dates).
- **RUSH's player pages name a college only as a logo link**, so a quote from them ends at "College
  Commitment:"; they corroborate class year and club, never the college alone.
- **Two Roldans, two Paleceks.** Larissa Roldan, a Canyon Hills graduate on UC Davis's roster, is not
  Reese; Lyla Palecek, class of 2026, is Lia's older sister.
- **Near misses**, none a commitment: Sophie Sant (Torrey Pines; only Play College Field Hockey's sheet, name and college, lists her for
  Bowdoin); a soccer commit named Camila Haro whose profiles give Fairmont Prep, not Southwest; a swim
  commit named Julia Reed whose post gives no school and a class that disagrees; and 62 SportsRecruits
  profiles under rostered names that show a commitment but another class year or state.
- **The Falconer's Rietti story** sits at `torreypinesfalconer.com/15434/sports/__trashed-5/`, its live
  canonical address; it may move.
- **Blocked hosts.** Most Power Five and Ivy athletics sites, the A-10 and ACC sites, Inside Lacrosse,
  LaxNumbers, SwimSwam, VolleyballMag, Water Polo Planet, The Coast News, Times of San Diego, the La
  Jolla Light and Patch refused requests; `rsfreview.com` and `dailypilot.com` served expired
  certificates. SportsRecruits' athlete search was not used: the NorCal round ran it with the owner's
  approval, and this one did not ask.

Gotchas, found in the research:
- **MAX Field Hockey's commitments table** (`maxfh.longstreth.com/college-commitments/`, a Caspio
  DataPage; `maxfieldhockey.com` redirects there) answers a plain request with a Cloudflare 403 and
  needs a browser User-Agent and an Accept header; its rows load only after its search form runs (a
  script), and its date column is hidden by the page's own CSS. On 2026-10-04 a rendered read listed
  Lewis and Magnano (with St. Ignatius) and Cordoni with no college, and Van De Braak with none
  either, which is stale; since no quote could be checked against the page as served, it was not cited,
  and its hidden dates are not used (until 2026-11-13; since then a rendered read that a second read
  confirms may be cited, see *The rule*).
- **SportsRecruits splits by sport, and draws some of its pages with a script.** A profile lives on
  one sport's subdomain (`nfhca.` field hockey, `iwlca.` lacrosse, `my.` soccer and others), and
  `sportsrecruits.com/athlete/<slug>` redirects there, so a probe must follow redirects. A college
  page shows only its first ten committed athletes, and its "See More Commits" call returns another
  sport's (lacrosse) entries. A club's `/committed/<club>` page and a profile's "Committed to … on
  M/D/YYYY" tooltip are drawn by a script: one rendered read saw the dates, no second read confirmed
  them, so neither the pages nor the dates were used. Since 2026-11-13 they may be, from two rendered
  reads that agree (*The rule*).
- **One player, two sports.** Many players have a lacrosse or soccer profile beside a field hockey
  one, and the commitment is on the other sport's (Gigi Colant's soccer profile is under her given
  name, Gabriella; Claire Johnson plays field hockey and lacrosse, and her Cal commitment is for
  lacrosse). The sport is read from the page, never assumed.
- **Two players, one name, one region.** An ECNL list shows a class-of-2027 Phoebe Miller of Marin
  FC committed to Tufts for soccer, which on its face meets the rule (class year plus a Marin club);
  but Redwood's Phoebe Miller is the San Diego State lacrosse commit, and a second class-of-2027
  Phoebe Miller, a San Francisco soccer forward, has her own profiles. Only a page that names the
  school settles such a pair.
- **Siblings.** Three players here have older sisters with commitments of their own on the same
  pages (Phoebe Miller's in the same Marin IJ story, "will play at Colgate"; Maggie Magnano's and
  Carolyn Cordoni's on older commitment lists), and Saratoga's Emma and Evelyn Williams are twins:
  each commitment is checked against the first name on the page.
- **Conferences differ by sport.** UC Davis plays field hockey in the MPSF and lacrosse in the Big 12,
  as an affiliate, as San Diego State does; Cal's lacrosse team is in the ACC.
- **A Chicago namesake school.** St. Ignatius College Prep (IL) has its own field hockey recruits on
  the same national lists, some to the same colleges (Iowa among them); an entry is San Francisco's
  only when a page says California or names the player.
- **Same-name players are common.** The sweeps rejected about twenty same-name hits: SportsRecruits
  slugs are shared across people and sports (`mia_jones14` is Virginia, `katie_smith` Pennsylvania
  2015), NCSA slugs resolve by name whatever school is in the path (a Fremont "Isabella Bjork" is a
  track athlete at another Fremont High), and the national lists hold a Missouri "Lexie Schmidt" and
  a Virginia "Mia Jones". A profile can also be the right player in another sport: NCSA's profiles
  for some rostered players are for soccer, track or wrestling.
- **Watchlists are not commitments.** The 2026 high school watchlists (NFHCA's, and the Field
  Hockey Analyst's as Stick Together reported it on Sep 10, 2026) name several seniors here with no
  college; they were recorded as near misses, not commitments.
- **Other sports count since 2026-10-04.** The first round set them aside (a Saratoga player's
  basketball commitment, lacrosse profiles showing "Committed to …"); they are now in the file. A
  Stevenson recap's golf commitment is a student who is not on the field hockey roster.
- **A spreadsheet is not a page that names the school.** Play College Field Hockey's commitments
  sheet (a published Google Sheet) gives only a name and a college. One of its names matches a
  rostered player, but no page found ties that entry to her school or to a Northern California
  location, so it is not listed and the follow-up that chased it is recorded as a near miss.
- **Commitment pages stop at last year's class.** NorCal Impact's "Committed:" posts and the Gilroy
  Dispatch's commitment stories end with the class of 2025 and 2026; Stick Together's feed holds only
  its 15 newest posts (its `?s=` search is ignored); NCFHA and BAFHA post no commitments.
- **Blocked or failing hosts.** NCSA (`ncsasports.org`) refuses plain requests but answers WebFetch;
  `siwildcats.com/news` returns 500 while individual stories load; Colgate's, UC Davis's, Cal's,
  Marist's and Bucknell's athletics sites, the MPSF, ACC, MAAC, Patriot League and Big 12 sites, Fly
  FHC's site and STEPS California's sit behind bot challenges (WebFetch reads most of them).
  LaxNumbers, Inside Lacrosse, SwimSwam, VolleyballMag and TennisRecruiting answer with a Cloudflare
  403, so those databases were not read; Inside Lacrosse's and the Field Hockey Analyst's commitment
  lists are paywalled. For the EAL schools, Lassen News (a captcha), Susanville Stuff (403), the
  Davis Vanguard (a Cloudflare challenge), the Sacramento Bee and NorCal Preps refused requests, so
  Lassen County's local news was read only through search snippets. Web search's session budget ran
  out late in the first round, so its verification passes and follow-ups worked from direct page
  reads.
- **Name collisions near the EAL schools.** The "Athlete Committed" pages on Chico High's and
  Pleasant Valley's sites are a drug, sleep and nutrition program with a code night, not college
  commitments; `bellavistaathletics.com` is Bella Vista College Prep, an Arizona basketball academy,
  not Bella Vista High in Fair Oaks.
- **SportsRecruits' quirks.** Its field hockey state pages link to `womens-wofield-hockey`; the
  working path is `womens-field-hockey`. A profile address that does not exist answers HTTP 200 with
  a "Page Not Found" title, so a probe must read the title, not the status.

*The 2026-10-12 round.* The owner reported Shyla Paredes' softball commitment to Cal Baptist, which
she had announced on her own Instagram, and the rule was revised to cite official accounts' posts
(above). Every varsity row's MaxPreps career page was read for the sports the player plays: 508 of
the 1,673 play another besides field hockey (183 lacrosse, 115 soccer, 106 softball, 68 basketball,
21 water polo, and volleyball, beach volleyball, flag football, cross country and tennis). Eight
player-by-player sweeps, a softball-list sweep (travel-club commit pages, softball commitment
news), an other-sports-list sweep (basketball, volleyball and water polo club commit pages, and
lacrosse and soccer pages updated since 2026-10-06) and a school-pages and official-accounts sweep
ran in parallel; the web-search tool's per-turn budget (1,000 searches, shared) ran out early, so
the player-by-player sweeps finished 431 rows (nearly every class-of-2027 row), and a second pass
ran one search for each of the other 917 class-of-2027, class-of-2028 and ungraded rows and one
for each of the 55 official X accounts on the schools' sites. 1,336 rows got a name search; the 309
sophomores and freshmen got none (NCAA contact rules mostly keep them from committing yet), nor did
the 28 rows already in the file, and X's
search results never surfaced a post. Two commitments were found and re-read: Shyla
Paredes (Cal Nuggets' commitment list and 18U Woods roster, tied by her MaxPreps page naming the
club; medium) and Molly Waltz, Archbishop Mitty, to UC Davis lacrosse (ADVNC's commits page, with her
school, and her own SportsRecruits profile; high). Every source in the file was re-opened; SportsRecruits' Colgate page no longer listed
Storey Lewis and was dropped. A SportsRecruits profile-address probe in every sport the same day (§1.1j)
found a third on a player's own profile: Campbell Trocha, Cathedral Catholic, class of 2028, to Florida
Tech (NCAA Division II, Sunshine State Conference) in lacrosse, which her NCSA field hockey page, naming
the school, backs (high). Still to run: web searches for the 309 sophomores and freshmen, and the
official accounts' posts themselves (X lists none without a login; Instagram cannot be read from the
research environment).

*The 2026-10-22 round.* Another pass over every row, ten days on. A SportsRecruits sweep read its
commits feed (`api.sportsrecruits.com/api/v1/program/commits/<id>/<offset>`, ten records a page; the
id is the college's, so one feed carries every sport, men's included: ids 1 to 3,299, 87,015 records
over 1,549 programs), matched it to the rosters by full name and by surname, initial and class, and
opened every match's profile (425); it ran the profile-address probe in every sport for the 1,406
class-of-2027, class-of-2028 and ungraded rows (15,052 addresses; a live one answers 307 to its
sport's subdomain; 1,322 live pages read) and re-read every SportsRecruits profile already linked.
NCSA's public pages show no commitment even for committed players, so loading the 89 linked ones
proved nothing. A list sweep re-read FH College Path (classes 2026 to 2031), Play College Field
Hockey's sheet, MAX Field Hockey's whole commitments table, which MAX now serves as HTML (its player
pages too, so a MAX page can be cited where before it was a lead), Stick Together, the clubs in
`data/field-hockey/clubs.json`, and the lacrosse, soccer, softball, volleyball, water polo, basketball and track
lists of earlier rounds, matching each against every row. A news sweep read the Bay Area News Group
and SCNG papers' high school sections since August, other local papers, Patch, the student papers
and school athletics sites that answered, and the West Coast college programs' news. Four
player-by-player sweeps ran one extended web search for each of the 1,375 class-of-2027,
class-of-2028 and ungraded rows not already in the file (standard-mode results missed known
commitments, so rows first searched that way were searched again in extended mode). The class years here are
`data/field-hockey/rosters.json`'s grades (1,406 + 267 = 1,673), so the 267 rows it grades as sophomores or
freshmen got none; the 2026-10-12 round's 309 also counted rows graded only by other pages, which
this round searched as ungraded. Two commitments were found: Kendall Gann, Temecula Valley, class of
2027, to Barton College (NCAA Division II; its field hockey team plays in the South Atlantic
Conference, its other teams in Conference Carolinas) in field hockey, on MAX's player page and
California table, which name her school and Myto (medium: MAX takes the commitments its users
report, her own profiles show none, and a refuter kept it at medium); and Kaye Zilinskas, St.
Ignatius, class of 2028, to UC Davis in lacrosse, on her own SportsRecruits lacrosse profile, which
names the school, and SportsRecruits' UC Davis page (high; earlier probes read only her field hockey
profile). Stick Together's Oct 6 issue names Ryan Hemeon's school, so hers is now high, and backs
Olivia Van De Braak's. No source said any player had signed or decommitted; the class of 2027's
signing period is in November. Not reached: ClubLax (its certificate does not match its host), Mad
Dog West, SoCal Express and NorCal Starz (proxy errors), The Tenacity Project's site, Cal's athletics
site, and X and Instagram.

*The 2026-11-03 round.* Another pass over every row, twelve days on. SportsRecruits' commits feed was read
whole again: it is ordered by sport and then by class, so a read that stops at the first older class
misses every sport after the first; every page of the 1,462 program ids (of 1 to 3,700) that answer was
read, 87,494 records, 12,663 of them class of 2027 or later, matched to the rosters by full name and by
surname, initial and class, and every match with a class that agrees was opened: each same-name
commitment is another player (Missouri, New Jersey, Texas, Ohio, Washington). The profile-address
probe ran in every sport for all 1,673 rows (23,270 addresses; §1.1j) and every linked SportsRecruits
profile was re-read. A list sweep re-read FH College Path (classes 2027 to 2031), MAX Field Hockey's
whole commitments table (now at `maxfh.longstreth.com/college-commitments/`, 68 pages, 1,621 rows),
Play College Field Hockey's sheet, Stick Together (no issue after Oct 6), every club in
`data/field-hockey/clubs.json`, ADVNC, Lacrosse Masters, Prep Girls Lacrosse, TopDrawerSoccer's California classes
of 2027 and 2028, SoccerWire's monthly pages, Prep Soccer, Cal Nuggets, Extra Inning Softball, the
Prep Network's softball, volleyball and basketball lists and MileSplit's California signings. Two
news sweeps (NorCal and SoCal) read the student papers, school athletics sites and local papers that
answered since mid-October and ran about 210 web searches school by school for all 102 schools, with
name searches for about 65 seniors and ungraded rows where they surfaced recruiting news; unlike
2026-10-22 there was no extended name search for every row. Found: Frankie Lemieux, Lick-Wilmerding, to
Dartmouth in field hockey (the SF Hawks' table, edited 2026-11-02; medium), and Rylie Storm's own
profile now showing Harvard (raised to high). The owner then confirmed from Instagram that Clara
Froemming, Leigh, committed to Wellesley in field hockey, the Play College Field Hockey sheet line
earlier rounds had kept as a near miss; she is published on that confirmation, citing the sheet
(medium), and is the one entry the rule alone would not admit. No source said any player had signed or
decommitted (the class of 2027's fall signing day is Nov 11, 2026). Near misses: Sophie Sant (Torrey
Pines, Bowdoin), still only on that sheet; a class-of-2027 Lexie Schmidt committed to Maine, from
Ballwin, Missouri, not Marin Catholic's. Not reached: the Bay Area News Group and SCNG papers (the
search tool and WebFetch refuse their domains), STEPS California (connection errors), SoccerWire's full
class lists (drawn by script), X and Instagram.

*The 2026-11-06 round.* The first to match the JV players too: the 746 JV players the team pages list
(§1.7) as well as all 1,702 varsity rows. Read whole and matched by full name (and, for a JV name with a
nickname in parentheses, by the nickname): FH College Path's classes 2027 to 2031, MAX Field Hockey's
California table, Play College Field Hockey's sheet (no row dated after Oct 7), the SF Hawks', RUSH's
(125 profiles; the 11 under rostered names opened), HTC's and NorCal Impact's pages, STEPS, ADVNC,
Lacrosse Masters, TopDrawerSoccer's California classes of 2027 and 2028, Cal Nuggets, Extra Inning
Softball, MileSplit's California signings and the Prep Network's basketball and softball feeds. News:
Stick Together's feed, and the school athletics sites, student papers and local papers with posts since
Oct 30; about 35 of the 74 JV juniors and seniors got a web search. SportsRecruits' commits feed was not
re-read: SportsRecruits answered this machine with HTTP 429 all day, and the requests it would take went
to the JV profile probe (§1.1j). Found: Stick Together's Nov 5, 2026 issue ('League Champions Crowned,
Playoffs Begin', read twice and once more by hand) names Hailey Moncada (Gilroy) to Mercyhurst and Evie
Ferrini (Saint Francis) to Wellesley, both field hockey and both high, and gives Frankie Lemieux's and
Clara Froemming's schools (both raised to high) and Carolyn Cordoni's Bates commitment a first-hand
source; FH College Path's class of 2028 list now has Lemieux (as Francine). No JV player's commitment, and
no signing or decommitment. Near misses, all namesakes: a Lucy Miller to Colgate in lacrosse on STEPS
(class of 2026, Redwood High School; the rostered one is a Scripps Ranch sophomore), an Emma Brown on
Lacrosse Masters (Bayport, NY), a Mia Jones on FH College Path (Virginia, class of 2027). Not reached:
several student and local papers (HTTP 403: the Falconer, the Chronicle, the Campanile, the Pitch, the
Epitaph, the Union-Tribune, the Mercury News), X and Instagram.

*The 2026-11-13 round.* Two days after the class of 2027's fall signing day (Nov 11, 2026), over all 1,702
varsity rows and the JV players. Signing classes: every college in the file was checked for a November
signing or incoming-class release in the commitment's sport, as were every Division I field hockey program
(82; 73 read, the rest behind bot checks or failing) and Division II program (34; 31 read), about 130
Division I women's lacrosse programs (17 releases read) and 56 West Coast Division I schools' soccer,
softball, volleyball, water polo and basketball programs (64 releases read), every release matched against
every row. No Division I or II field hockey program had posted one: field hockey programs announced their
classes in the spring and summer. San Diego State's women's lacrosse release of Nov 11 names Phoebe Miller
with Redwood High School, so hers is the file's first `signed`; no other college in the file had a release
out. The Californian signees the releases name (Parker Saari, La Costa Canyon; Brooke Spagnuolo, Marin
Catholic; Lily Raiszadeh, Cathedral Catholic; and others) are not on the field hockey rosters. Lists and
clubs, read whole and matched against every row (FH College Path, MAX Field Hockey's 1,690-row table and
its player pages, Play College Field Hockey's sheet, the SF Hawks', RUSH's, HTC's, NorCal Impact's, STEPS',
ADVNC's and Lacrosse Masters' pages, TopDrawerSoccer, SoccerWire, Prep Girls Lacrosse, Cal Nuggets, Extra
Inning Softball, the Prep Network, MileSplit): every list quote in the file is still on its page, and five
pages are new sources for commitments already here (MAX's player pages naming Reese Roldan's, Sami Lee's
and Frankie Lemieux's schools; STEPS' rows for Gianna Rinaldi and Campbell Trocha). Roldan and Lee stay
medium, as Kendall Gann is, because MAX takes the commitments its users report. News: Stick Together has
posted nothing since Nov 5 (its feed is now `/blog/rss/`); Saint Francis' and Cathedral Catholic's
signing-day roundups of Nov 12 name no rostered player; the Bay Area and Southern California News Group
papers' daily sitemaps for Nov 5 to 13 and about 70 school sites gave nothing new. SportsRecruits: all 294
linked profiles (varsity and JV) were re-read; 26 show a commitment, 25 the one in the file and none
signed, and one is new: McKenzie Rackleff (San Marcos, class of 2027) to Lock Haven in field hockey, on her
own profile (high). Lock Haven is a Division II school whose field hockey team plays Division I as an
Atlantic 10 affiliate (its athletics site lists the A-10 as "FH Affiliate"). The commits feed was read for
program ids 1 to 1,044 (74,764 records) before the round stopped it for time; its twelve full-name matches
not already in the file were opened by hand and are namesakes in other states, or, for University City's
Samantha Weathers, a Saugus lacrosse player of another class. Not run: the rest of the feed, a SportsRecruits
address probe (both ran whole on 2026-11-03) and name-by-name web searches (the search index held almost
nothing published after Nov 5). Not reached: the Mercury News' and Marin IJ's feeds, several student papers,
Harvard-Westlake's site and San Diego Prep Insider (HTTP 403 or no answer), college sites behind bot
checks, Instagram. More signing news is likely: the Marin schools' commitment ceremonies and San Diego's
county signing event (Nov 12) had not been posted. The round matched the rosters as they stood before the same day's roster refresh (1,702 varsity rows, now 1,803): of the 107 rows that refresh added (and 6 it removed), 47 are players the round had matched under the same name (JV-list players who joined their varsity rosters, and rows MaxPreps re-created), and the other 60, most of them at Sobrato (20), Hollister (17) and Corning (14), teams with no MaxPreps players before, are players who were not searched for commitments or profiles.

*The 2026-11-13 search of four schools.* Sobrato, Cupertino, Lynbrook and Homestead's 116 players (72 varsity,
44 JV) were searched for a commitment in any sport: each varsity row's MaxPreps career page for her other
sports, about 200 web searches (two for each junior, senior and ungraded player, one for each sophomore and
freshman), the schools' athletics sites and student papers, the Morgan Hill Times, Gilroy Dispatch and Mercury
News by name, the field hockey and other-sport lists and clubs' pages, SportsRecruits' commits feed for ids 1
to 1,044, and the recruiting-profile search (§1.1j). None was found. Lynbrook's Trishna Sinha (a goalkeeper on
the TFHA watchlist) and Homestead's Gabrielle Moll are the likeliest to commit. Club ties (§1.1j2): none new.

*The 2026-11-22 round.* Over the rosters as refreshed on 2026-11-13: 1,775 varsity rows and the 860 JV players
the team pages list, so the 60 rows that refresh added were matched for the first time. Eight passes, each on one
source family, and every finding re-read at assembly. Sites that refuse a plain request were read in headless
Chromium under its ordinary identity (one page at a time, no CAPTCHA, login or paywall passed); a host that showed
the browser a challenge too was left unread. Lists and clubs, read whole and matched against every row: FH College
Path (2027: 345 rows; 2028: 205; the 2029 to 2031 pages hold only international players), MAX Field Hockey's table
(73 pages, 1,752 rows, at its 10-second crawl delay) and four player pages, Play College Field Hockey's sheet (164
rows; no Californian row since Oct 7), Stick Together (no issue since Nov 5), the SF Hawks', RUSH's (21 current
profiles, 103 alumni names), HTC's and NorCal Impact's pages, the home pages of the other 24 clubs in
`data/field-hockey/clubs.json` (none posts a commitment list), STEPS, ADVNC, Lacrosse Masters, Prep Girls Lacrosse,
TopDrawerSoccer's California classes of 2027 and 2028, SoccerWire's tracker (not citable), Cal Nuggets, the Prep
Network's California lists and MileSplit. All 47 list and club quotes on 22 URLs in the file were found on their
pages. Found: Abby Feldman, Torrey Pines, class of 2027, to Macalester in soccer (NCAA Division III, MIAC):
TopDrawerSoccer's own profile page gives "High School: Torrey Pines" and Macalester, and its Recruiting Roundup of
Nov 16, 2026 lists her as committed (high; her SportsRecruits soccer profile shows nothing). MAX's California table
now names Ava Hauer's and Rylie Storm's high schools. College releases: 1,075 athletics sites tried (357 Division
I, 265 Division II, 434 Division III, 19 NAIA), 964 with a parsable feed, 4,050 stories opened and matched (2,509
dated Nov 11 or later), 418 of them signing releases dated Nov 9 or later from 141 sites, 26 in women's lacrosse
and 2 in field hockey (Boston College, Nov 13; Villanova, Nov 19; no Californian); 61 sites refused the plain
request and 56 of the 60 retried rendered in the browser. Only San Diego State's lacrosse release, already cited,
names a rostered player; no field hockey, lacrosse, soccer or basketball program in the file had posted a
class-of-2027 release, and Oregon's lacrosse release of Nov 13 lists the class of 2027 only (Lia Palecek is class
of 2028). Classic Sidearm feeds hold ten stories, so a Nov 11 release in an in-season sport may have rolled off.
News, NorCal (49 teams): every post of Nov 4 to 22 on 44 sites through their public WordPress API, 11,728 posts
(19 student papers, Stevenson's site, 24 local papers including the Marin IJ, the Mercury News, the East Bay
Times, the Embarcadero papers, the Santa Cruz Sentinel, the Monterey Herald, the Red Bluff Daily News, the Chico
Enterprise-Record, the Gilroy Dispatch, the Morgan Hill Times, the Hollister Free Lance and BenitoLink), 132 name
searches on local papers for Hollister's, Corning's and Sobrato's players, about 45 school pages and 14 web
searches. St. Ignatius' athletics site (Wildcat Sports Report, Nov 19; read rendered, three times) lists the 19
seniors honoured at its College Athlete Recognition Day of Nov 10 "recognizing their accomplishments and
commitments": Storey Lewis, Maggie Magnano, Sofie Stiefel, Cate Cecchini and Gigi Colant are among them with the
college and sport the file has, so each gains a `school-site` source, and the three that had no date take Nov 10;
it does not say signed. The signing stories at Archie Williams (The Pitch, Nov 14), Tamalpais (Tam News, Nov 18)
and Pleasant Valley (Chico E-R, Nov 17) name no rostered player. News, SoCal (53 teams): ten student papers' posts
of Nov 4 to 22 (the Falconer and the Harvard-Westlake Chronicle answered this round), six athletics sites and
about 45 school home pages, The Coast News, Times of San Diego, Vista Press, OC Sports Zone, the Los Angeles
Times' high school feed and others, 28 web searches; Cathedral Catholic's list of Nov 12 and San Diego County's
signing event (374 athletes from 41 schools, no names published) name no rostered player. The Orange County
Register's "Orange County signing list: November 2026", behind its paywall, was read from a copy the owner
supplied: its signees at Fountain Valley, Huntington Beach and Newport Harbor are not on a field hockey roster,
and it does not list Edison or Marina. SportsRecruits: all 293 linked profiles (264 varsity, 29 JV) read twice
through the page's own JSON call; 291 answer, 27 show a commitment, each the college and sport in the file; the
one not yet cited, Frankie Lemieux's ("Committed to Dartmouth College on 11/15/2026", the day it was entered), is
now a source. The commits feed was read for program ids 1,045 to 3,700 (458 programs answering, 12,471 records), 1
to 112 and 454 to 474 (24,179 records in all, 3,358 of class 2027 or later; every match with an agreeing class
opened, each one already in the file or a namesake) before the round was stopped for time: ids 113 to 453 and 475
to 1,044, about 63,000 records, were not read. The address probe reached 208 of the 885 class-of-2027 and
class-of-2028 varsity and JV rows with no linked profile (1,067 addresses, 201 live, no commitment by a rostered
player). Near misses: Sophie Sant (Torrey Pines, Bowdoin), still only on Play College Field Hockey's sheet (RUSH's
page for her has no commitment field, MAX has no row); Hollister's Kayla Reames, whom a BenitoLink story of Sep 25
(as "Kayla Reams") calls "planning to continue her field hockey career" at Alfred University, a plan and not a
commitment; namesakes (Lexie Schmidt, Mia Jones, Lucy Miller, Ella Cohen, Camila Haro and others, in other states
or at other schools). No signing, changed college or decommitment. Not read: the San Diego Union-Tribune's article
bodies (subscribers only), www.hw.com, sfhs.com, Harvard's athletics site, Fly FHC, thesandpiper.org and
lassennews.com (a challenge in the browser too), ClubLax (certificate mismatch), San Diego Prep Insider and East
County Sports (no answer), Extra Inning Softball's posts (members only), Redwood's and Marin Catholic's ceremonies
(on no page found), Instagram; no student paper was found for about 19 NorCal and 35 SoCal schools. No
name-by-name web search ran: the 50 searches made returned almost nothing published after Nov 5.

*The 2026-11-25 round* covered all four builds at once and is described in §1.15 ("The commitment round of
2026-11-25"). For field hockey it added no row; it added fifteen sources (The Tower, Bishop's student paper, for Lola
Conway and Emerson Davis; eleven players' own MAX pages; Kendall Gann's FieldLevel page, which makes hers high) and
re-read every list and club page above.

*Recall is partial.* On 2026-11-25, as on 2026-11-22, 39 of the 1,775 varsity rows have a commitment, at 23 of the 102
schools (Torrey Pines' third added on 2026-11-22). On 2026-11-13 it was 38 at 23
(San Marcos added on 2026-11-13). On 2026-11-06 it was 37 at 22 (Gilroy added on 2026-11-06). On 2026-11-03 it was 35 at 21 (Lick-Wilmerding and Leigh added on 2026-11-03). On 2026-10-22 it was 33 at 19
(Valley Christian and Archbishop Mitty added on 2026-10-12, Temecula Valley on 2026-10-22): Southern California's 14 at 8 (Torrey Pines 2, Canyon Hills 4, Bishop's 2, Cathedral Catholic 2 with Campbell Trocha of 2026-10-12, Harvard-Westlake,
Scripps Ranch, San Dieguito Academy and Temecula Valley 1 each); Northern California's 19 include St. Ignatius' seventh, Kaye Zilinskas, of 2026-10-22. Every one of the 842 rows had a
SportsRecruits probe in every sport, and 840 at least one web search (the two others are already
committed players); juniors and ungraded rows of the first pass got one search, the rest two; no row
had a SportsRecruits athlete search. On 2026-10-04, 16 of the 811 varsity rows had a commitment, at 9 of the 49
schools: SCVAL 9 at 4 (St. Ignatius 6, Los Altos, Saint Francis and Saratoga 1 each), BVAL 2 at
Christopher, PCAL 1 at Stevenson, MCAL 4 at 3 (Redwood 2, Berkeley and Marin Catholic 1 each), and EAL
none. Seven are in field hockey, seven in lacrosse, one in soccer and one in basketball. The six EAL
teams' schools were swept twice on 2026-10-04, for field hockey and then in the every-sport round
over their 95 rows (with the same day's SportsRecruits profile-address probe in every sport and NCSA
and FieldLevel probes for field hockey), and neither found one; but SportsRecruits' athlete search
was not run for those rows and their 17 freshmen and sophomores got no web searches, so EAL recall
is lower than the other leagues'. The absence of a commitment is not proof that none exists, and
Corning has no roster rows to join to. A commitment announced only on a personal social-media account, posted on a page
the sweeps could not read, or not yet public is not listed, and colleges may not publicize an
unsigned recruit, so a college's own site rarely shows a class of 2027 or 2028 commitment before the
November signing period. No source found said any player had signed. The class of 2027's signings
and the class of 2028's commitments are when a new sweep would change the file most.

*When a roster refetch breaks it.* As for §1.1j2: a commitment whose player's row is dropped, respelled or
marked JV is roster drift, left out of the site and reported as `commits: <team> / <player> (<college>): <what>`;
`data/field-hockey/rosters.json` moving to another season still throws at import. Re-check the commitment and
edit or drop it by hand; on a rollover, redo the research (the seniors will have graduated).

**(k) Player stats** —
`GET /gatewayweb/react/team-season-player-stats/rollup/v1?teamId=&sportSeasonId=` on the ghost API
(JSON; captured and verified 2026-10-02 on the 15 SCVAL teams, and 2026-10-03 on a sample of the
other three leagues; the rest of those were read live by the script, and the six EAL teams on
2026-10-04). Like the rosters it joins to, it covers every registry team, all nine leagues and the five independents (102): one
call per team,
and `data/field-hockey/player-stats.json` (`lib/players/player-stats-schema.ts`) holds exactly one entry per team in
registry order. The same adapter reads every league and throws on any drift. A team's `status` is
`ok`, `none` (MaxPreps answers "No data was found": the coach entered nothing), `carried-forward`,
`error`, or `pending` (no run has covered the team; nothing fetched, nothing claimed — the
placeholder BVAL, PCAL and MCAL were seeded with until a run read them). A team is read on its
roster's page id, or on its registry id when the roster has none (the registry id is MaxPreps' team
GUID, and the response's own `teamId` is checked against it). `--leagues` and per-team failure
scoping, the row-by-row salvage of the previous file and the exit code work exactly as for rosters
(§1.1j). `--capture <dir>` saves each response body as received, before it is decoded or validated,
as `<dir>/stats-<slug>.json`, so a drifted or non-JSON answer is captured too and replays
(`--fixtures`) into the same failure. This is the call the team's `/stats/`
page makes from the browser (page `/team/stats`, function `eM` in that build); the page itself
server-renders only a top-3 `playerStatLeadersData` card, and the legacy print view
(`/print/team_stats.aspx?schoolid=&ssid=`) has the full table but **no career links**. Siblings in
the same chunk: `team-season-game-stats/rollup/v1` (the team's stats game by game, read for every
team with stats: it says which games a box score is read for, and keeps its totals for a team a
game note credits; see "Box scores" and "Stats in the game note" below), and, not used,
`team-season-stats/rollup/v1` and `team-leaderboard-leaders/v2`; a `leagueId=` parameter limits the
rollup to league games.
`lib/sources/maxpreps-player-stats.ts`, written by `scripts/fetch-player-stats.ts` to
`data/field-hockey/player-stats.json`.

**Box scores [V] 2026-10-24.** `GET /gatewayweb/react/team-contest-player-stats/v1?teamId=&contestId=`
(no `rollup/` segment; that path is a 404) answers one team's player stats for one game in the
season rollup's shape below, with no GamesPlayed column, each column's `overallValue` the team's
total for the game, and only the players the coach entered something for; a game with nothing
entered answers the same 400 "No data was found" envelope. `lib/sources/maxpreps-box-score.ts` reads
it with `parsePlayerStats`, unchanged. `scripts/fetch-player-stats.ts` reads it for each final of
the team's in the snapshot whose row in the per-game table has a count above zero, and stores a
digest of that row (`rowKey`) with it, so the next run reads the box score again only when the row
changes (846 box scores on 2026-10-24, read in about seven minutes; a later run reads the changed
ones). The game page's Game stats section shows them (`components/game/game-stats-view.ts`).

Shape **[V]**: `data.groups[]` = "Field Stats" and "Goaltending Stats", each with `subgroups[]` (a
second "… (2)" subgroup carries the overflow columns), each a table: `stats.columns[]`
`{name, header, displayName, overallValue, columnType}` and `stats.rows[].columns[i]`
`{value, href, caption}` lined up with `stats.columns[i]`. The `Name` cell's `href` is the athlete's
career URL — its `?careerid=` joins to `data/field-hockey/rosters.json` (121/121 rows on 2026-10-02) — and its
`caption` is the class (`(Sr)`). Column names (MaxPreps' own): field `Jersey, Name, GamesPlayed,
FieldMinutesPlayed, Goals, GoalsPerGame, Assists, AssistsPerGame, Points, PointsPerGame, Steals` and
`Shots, ShotsPerGame, ShotsOnGoal, ShotsOnGoalPerGame, ShotsOnGoalPercentage, GameWinningGoal`;
goalkeeping `GamesPlayed, MinutesPlayed, OvertimeMinutesPlayed, OpponentShotsOnGoal, GoalsAgainst,
Saves, SavesPerGame, SavePercentage, GoalsAgainstAverage` and `ShutOuts, Win, Loss, Tie`.
`data.lastUpdated.timeStamp` is when the coach last entered stats (naive local time).

Gotchas, all **[V]**:
- A team whose coach has entered nothing answers **HTTP 400** `{status: 400, message: "No data was
  found for this request.", data: null}`. On 2026-10-02 that is Cupertino, Los Altos, Los Gatos,
  Lynbrook and Saratoga — exactly the five whose roster pages flag no athlete `hasStats` (roster
  column 15). It means "no stats", not a failure.
- Every cell is a string, `"0"` included, whether or not the coach tracks that stat (`Min` is `"0"`
  for every player on most teams). So a stat is **tracked** when the team's `overallValue` is above
  zero, and only then are its cells read: a tracked 0 is a real zero, an untracked stat is null.
  A team that tracks a stat but has a team total of 0 (no assists all season) reads as untracked.
  So does a stat whose team total is above 0 while **no player** holds any of it (Hollister's
  minutes: team 60, every player 0; Marin Catholic's shots faced: team 40, the goalkeeper 0; Fremont's
  goalkeeper games): those per-player zeros are not real, so the stat is dropped for the team with a
  warning rather than shown as zeros (`reconcileTotals`). The opposite gap is kept and flagged: where
  the rows add up to more than the team total (Hollister goals 10 vs 7, Archie Williams 3 vs 1) both
  are as MaxPreps serves them, and the team's `warnings` says so.
- Points are MaxPreps' 2 per goal + 1 per assist, on every row of every team.
- A player can be in one subgroup and not the other (Palo Alto lists two players in the overflow
  table only): their stats from the missing table are null, shown as a dash.
- `Goals` and `GamesPlayed` appear in both field subgroups and always agree; the parser throws if
  they ever do not. It compares them record by record: a career's row in the overflow table joins
  the record of that career whose `GamesPlayed` and `Goals` it agrees with, since the two tables need
  not list a career's records in the same order (Huntington Beach's do not).
- One player can have two athlete records under one career id **[V]** (Huntington Beach's Valentina
  D'Angelo, a second record created 2026-10-01: 24 games played on one, 2 on the other; the roster
  lists both). Before 2026-11-03 the parser read them as one row disagreeing with itself, threw, and
  every refresh carried Huntington Beach's rows of 2026-10-13 forward. Now each record is read on its
  own and the two are merged into one line (`mergeDuplicateRecords`): the counts are added, as
  MaxPreps' team totals add them, and games played is the larger of the two, since the records' games
  can overlap (Huntington Beach had played 25 games, and 24 + 2 is 26). The team's `warnings` names
  the merge. Rows with no career link are never merged: a name and jersey could be two players.
- Coverage on 2026-10-03, all four leagues: 28 of the 43 teams, 312 players, 41 goalkeepers (SCVAL 10
  of 15 teams / 122 players / 13 goalkeepers, BVAL 8 of 12 / 67 / 12, PCAL 3 of 7 / 29 / 4, MCAL 7
  of 9 / 94 / 12); the other 15 are `none` (MaxPreps: "No data was found"). The SCVAL fixture build
  of 2026-10-02 holds 121 players: the committed file's 122 is a later read (Mitty has 16 rows, the
  capture 15). Every team with stats tracks games, goals and points; 23 of the 28 track assists;
  shots on goal 10, shots and game-winning goals 8 each, minutes and steals 4 each. Goalkeeping: 21 of
  the 28 track at least one goalie stat and 7 track none (Fremont, Homestead, Presentation,
  Christopher, Prospect, Archie Williams, Lick-Wilmerding). All 21 track games and 18 track saves;
  the narrowest are two columns (games and saves on five teams, games and losses on Hollister), Leigh
  tracks games, minutes, shutouts and wins but no saves, Santa Clara six columns without saves, and
  Valley Christian and Stevenson all ten. Some teams stop entering: Presentation's last update was
  Sep 10, Monta Vista's Sep 12.
- Goalkeeping is shown as entered, and the entries do not always agree with each other. On
  2026-10-03, 11 goalie lines on four teams (Leland 1, Tamalpais 2, University 3, Convent 5) have
  fewer opponent shots on goal than saves plus goals against (Leland: 10 shots on goal, 36 saves, 9
  against). The team page labels the stat "Opp. shots on goal" (not "shots faced"), prints those
  cards' figures with a note that they cannot all be right, and works out no Save % for them; Save %
  (saves over saves plus goals against) is the one goalkeeping figure the site computes, and the
  page says so. MaxPreps also lists field players in the goalie group with the team's full game
  count (University's leading scorer, 16 games and 2 saves), so cards are ordered by minutes in
  goal, then decisions, saves and goals against, and games last.
- Not found anywhere else: the Home Campus school sites (Saratoga, Lynbrook) have no stats pages,
  Los Gatos' VNN site has no stats tab, and si.com's team stats page carries no player stats.
- **Stats in the game note.** Some coaches type stats into the contest's 50-character `location`
  note (§1.1, `splitLocation`) instead of the stats sheet. On 2026-10-06 that is Homestead alone,
  out of 46 notes in the snapshot (and every note in its git history and the corpus captures):
  "Lacey played 3Q had 7 saves. Noa played last…" (Sep 28 at Saint Francis; MaxPreps cut it at 50
  characters), "goals scored Gabby Molly, Emry Borges" (Sep 30 vs Fremont) and "tied in OT 1:1  goal
  scored by Emery Borges" (Oct 5 vs Cupertino). `lib/players/note-stats.ts` reads such notes on **every**
  team's finals and adds what they credit to the MaxPreps numbers the team page and /leaders read:
  - **What it reads:** goals, assists and saves, in the forms coaches write them: a list after a
    lead-in ("goals scored (by) A, B", "goals: A (2), B", "scorers: …", "assists: …", a goal with its
    assist as "A from B" or "A (assist B)"), a statement per comma-separated piece ("A scored twice",
    "A 2 goals", "A had an assist", "A hat trick", "hat trick for A"), and saves ("Lacey … 7 saves",
    "7 saves by Lacey"). A piece that mentions goals, assists, saves or scoring but fits none of
    these is reported in the team's warnings, never guessed at.
  - **Names:** credited only when the name fits exactly one player on exactly one of the two
    rosters: the full name; a curated alias (`lib/players/name-aliases.ts`: Emery Borges = Emry Borges,
    confirmed by the site owner); a full name whose first name is a common nickname of the roster's
    (Gabby = Gabrielle), or whose first or last name is one letter off (Emery/Emry, Molly/Moll; 4+
    letters only), or whose last name is part of a longer one (Lacey Carattini = Lacey Sebastian
    Carattini); or a lone first or last name only one roster player has (Lacey).
  - **Not counting twice:** MaxPreps' game pages carry no box score, but the sibling
    `team-season-game-stats/rollup/v1` (same parameters) gives the TEAM's stats game by game **[V]**
    2026-10-06: Homestead's four sheet goals are entered on Lynbrook (3) and Los Altos (1, in a game
    Homestead lost 0-1), and Sep 28, Sep 30 and Oct 5 have 0 goals and 0 saves.
    `scripts/fetch-player-stats.ts` reads it (`lib/sources/maxpreps-game-stats.ts`) for every team
    with stats, for the box scores, and keeps its totals in the team's `gameTotals` for each team a
    note credits (one, Homestead, on 2026-10-06), and a noted game whose
    goals, assists or saves the coach also entered adds none of that stat. A note never credits more
    goals or assists in a game than the team scored, and no noted goal is added where MaxPreps' goals
    plus the noted ones would pass the team's goals scored. A noted game whose entries cannot be
    checked (the per-game call failed, or does not list the game) adds nothing until a read
    succeeds; the previous run's totals are not carried forward for it, since the coach may have
    entered the game since. A team with no MaxPreps stats at all (status `none`) entered nothing,
    so its notes all count.
  - The team page marks each changed row and card and lists every noted game with its note. A
    keeper whose saves include a note's gets no Save % (team page or /leaders) and no
    shots-on-goal check: the note's game is not in the goals against and shots the coach entered.
  - The game page's Game stats section adds the same credits, the ones kept after every guard
    above, to that game's box score (or to lines of their own when the team has none for the game),
    marks each changed row and quotes the note (`components/game/game-stats-view.ts`).
  - **Overtime.** A final MaxPreps records with 0 overtime periods counts as one period of
    overtime (two for "double OT" / "2OT") when its note says so: "OT" in capitals as a word of
    its own, or "overtime", never right after "no", "not", "without" or "never" (`overtimeFromNote` in `lib/pipeline/normalize.ts`, the same
    place the "reschedul…" note already marks a postponement). Only a level score or a one-goal
    margin can come out of sudden victory, so a note on any other score is reported, not read. The
    game keeps the note in `provenance.overtimeNote`, and its page says the OT is the note's.
    Homestead–Cupertino, Oct 5, 1-1: MaxPreps 0 periods, the note "tied in OT 1:1", so decider
    OT (a tie scores 1 point either way, Article IV: no table moves).
  - Not read: who played the last quarter in goal on Sep 28, which the note's cut-off leaves
    without a number.
- Coverage on 2026-10-04 with the six EAL teams (`fetchedAt` 2026-10-04T13:04:10.832Z): 33 of the
  49 teams, 404 players, 63 goalkeepers. EAL: Pleasant Valley 21 players, Chico 19, Davis 19, Bella
  Vista 19, Lassen 10; Corning answered HTTP 400 "No data was found" (status `none`, the same
  "no stats" case as the five teams above), and 0 teams failed.
- Budget: 102 calls of 0.2–35 KB (one per registry team; 99, 49 and 43 at earlier measurements, 43 at about 25 s), at
  the primary client's courtesy ceiling (≤3 concurrent, ≥500 ms between starts), twice a day in season:
  `.github/workflows/update-data.yml` runs `pnpm fetch-player-stats` right after the core sweep
  (non-fatal) and commits `data/field-hockey/player-stats.json` with the snapshot when its content changed; the
  script leaves the file untouched when only its `fetchedAt` stamps would move.
  Each team a game note credits costs one more call, the per-game totals (above): one on 2026-10-06.

**(l) Last season's results** (the Elo rating's starting point, DESIGN §20.1) — `data/field-hockey/prior-season.json`
(`lib/history/prior-season-schema.ts`, loaded by `lib/history/prior-season.ts`), built once a season by
`pnpm fetch-prior-season` (`scripts/fetch-prior-season.ts`). **[V] 2026-10-03.**
- The season id: `team-context/v1` (e) carries `data.schoolSportSeasonsData[]`, one entry per
  sport-season the school has played (625 for Leigh), each with `sportSeasonId`, `sport`, `gender`,
  `level`, `season` and `year`. Girls · Field Hockey · Varsity · `25-26` is
  `8ae4cbab-caa1-4889-87a8-547fdaca9516` (seventeen field hockey seasons are listed, back to 10-11).
  The key `teamSeasonPickerData` that earlier notes pointed at does not exist in this response.
  `data.lastYearStandingsData` also holds the team's 25-26 record, goals for and against, and
  league place (Leigh: 15-6-2, 57-19, 1st in Mount Hamilton), not used.
- The games: `schedule-calculated/v1` (b) with that `sportSeasonId` returns the team's whole
  2025-26 season, scores included, in the same shape as the current season's: 837 rows over the 43
  feeds (Leigh 25, including its CCS playoff game). Unlike a league URL's year segment, the API's
  season id is honoured: every row is dated Aug 25-Nov 12, 2025.
- Kept: one game per contest id, finals (contestState 4) between two registry teams, host from
  `homeAwayType` (2 on either side is neutral), forfeits left out. 2025-26: 368 games, every team
  9-25 of them; left out 39 deleted, 5 never final, 27 against schools outside the registry and 1
  forfeit; no contest's two feeds disagreed. The script writes nothing if one does, if any feed
  fails, or if any row is dated outside the season.
- Refetched **2026-10-04 for all 49 teams** (`fetchedAt` 2026-10-04T06:07:29.936Z): 412 games dated
  2025-08-25 to 2025-11-12, 44 more than the 368 above. Left out: 43 deleted, 7 never final, 23
  against schools outside the registry and 1 forfeit. Of the 412, 31 are between two EAL teams and 13
  between an EAL team and another registry team (Pleasant Valley 4, Chico 3, Bella Vista 3, Davis 3;
  Corning and Lassen have none). Red Bluff's 2025-26 games are outside the registry and left out. The
  EAL's 2025-11-01 tournament games carried `contestType` 5 on both rows, with the round in
  `contest.location`.
- **Duplicates named by hand** (`PRIOR_EXCLUDED_CONTEST_IDS` in `lib/history/prior-season-schema.ts`, counted
  under `excluded.excludedByConfig`): a row is listed only when another source shows it repeats a game
  the feeds already carry. One so far, checked 2026-10-07: at Helix's one-day tournament on Sat
  2025-10-18, Patrick Henry played Helix twice. Patrick Henry's own 2025-26 schedule
  (`phpatriots.net/varsity/field-hockey/schedule-results`) lists 11:20 AM, L 0-3, and 4:10 PM, L 0-1,
  plus a home game against Mission Bay on Oct 17. MaxPreps holds both as `1bd0e53f` (3-0, entered with
  the 4:10 time) and `bb3d5c20` (1-0), each with a different save count for Patrick Henry's keeper (9
  and 3), and also a third row, `553a83bc` (3-0, Oct 17, no time, scored by the Section office's
  account), which matches Helix's site listing the event as "OCT 17 TBA". That third row is the
  duplicate. Fountain Valley's and El Capitan's games at the same event exist only as such Oct 17 rows,
  so they are kept under that date. No newspaper or tournament page reported any of these scores, and
  si.com repeats MaxPreps.
- Cost: one `team-context/v1` read (about 0.55 MB) and 102 schedule reads (about 150 KB each; 99 before the independents joined, 43 when
  measured), through the primary client's budget, once a season. The 2024-25 season (`c388901e-…`, 354
  games) was read the same way to test the starting point and is not kept.

**(l2) Last season's players** — `data/field-hockey/prior-players.json` (`lib/players/prior-players-schema.ts`; one copy
per sport), built once a season by `pnpm fetch-prior-players` (`scripts/fetch-prior-players.ts`) and read only
by the player registry (m). No page reads it. **[V] 2026-11-14.**
- The source is the stat-sheet rollup of (k), asked for with LAST season's varsity `sportSeasonId` (the one
  `data/field-hockey/prior-season.json` was built from): `team-season-player-stats/rollup/v1?teamId=&sportSeasonId=`
  honours the season id, as the schedule read of (l) does. It is read for who is on it, not for the numbers
  (`lib/sources/maxpreps-stats-names.ts`): every table of every group has a `Name` column whose cell holds the
  short name ("S. Lewis"), the career link (`…/athletes/storey-lewis/?careerid=…`) and the class as a caption
  ("(Jr)"; 77 of 2,265 cells in the 2026-11-14 captures were blank), and most have `Jersey`.
- **It is not a roster.** A sheet lists the players a coach entered a line for. A team with no stats that
  season answers the 400 "No data was found" envelope and is status `none`, which says nothing about who
  played. The full name is rebuilt from the career link's words and the sheet's own last name
  (`nameFrom: career-url`), which loses a capital or an apostrophe inside a first name; the registry prefers
  any other source's spelling.
- **Why not the roster pages.** MaxPreps does serve a past season's roster at `<team URL>/25-26/roster/`
  (the overlay cites several), but no such page was ever captured, and MaxPreps' web pages answer the
  research sandbox with its WAF's 403 (§1.4 "Access from the research sandbox"); the API is not behind it.
  Reading those pages from a network that can (the Actions runner) would give the real 2025-26 rosters,
  positions and heights included; nothing here does that yet.
- **The edge refuses some calls.** On 2026-11-14 about half the rollup reads came back as an empty 403
  (`retry-after: 0`), the same teams on most passes, whatever the pace (600 ms to 8 s apart, one at a time).
  The MaxPreps client does not retry a 403, so the script keeps what an earlier run read, marks the rest
  `error` and exits 1; a later run asks only for those, and a run that reads nothing writes nothing. After five passes: field hockey 733 players on 54
  sheets, 35 teams with no stats, 13 unread (Cupertino, Monta Vista, Sobrato, Westmont, Monterey, Huntington
  Beach, Marina, Canyon Crest Academy, Fallbrook, Rancho Buena Vista, San Dieguito Academy, San Pasqual,
  Hilltop); girls soccer 423 on 31, 7 with none, 3 unread (Cupertino, Westmont, Mt. Pleasant); boys basketball
  245 on 20, 19 with none, 2 unread (Leigh, Lincoln). The committed files were built from those captures with
  `--fixtures`.

**(m) The player registry** — `data/players.json` (`lib/players/registry-schema.ts`), built by
`pnpm build-players` (`scripts/build-players.ts`; the rules are `lib/players/registry-build.ts`, the reading
of each file `lib/players/registry-sources.ts`). One record per person across all three sports and every
season the repository holds. **Internal: no page reads it**, nothing under `app/` or `components/` may import
it (`tests/players-registry.test.ts`), and it is read from disk, never bundled. (The `playerId` values it
writes into the four curated files below do travel in the server bundle with those files; no page prints
one, and the 2026-11-14 build's HTML and RSC payloads contain none.)
- **It names people the repository did not name before.** The 2025-26 stat sheets (l2) add about 770 players
  who appear in no other file here, most of them last year's seniors, each with a MaxPreps career link, a
  number and a class; the registry adds a graduation year and ties a person's seasons, squads and sports
  together. None of it is rendered, but it is in the repository.
- **Three layers.** A *player* has an id this repository mints (`p` + ten hex digits of the SHA-256 of the
  first identifier) and never changes, an official name, every other spelling any source uses with what it
  is (below), a graduation year
  (`classOf`) and the keys other sources know the player by (`identifiers`: MaxPreps career ids, or a name on
  one team's lists). A *stint* is that player on one team in one season of one sport at one level (varsity,
  JV or, for the basketball programs that field one, the freshman team: no file lists a freshman team's
  players yet, so no stint is filed there today): number, position, height and captaincy live there, so a varsity 9 and a JV 10 in one autumn are two stints, not a
  disagreement. An *observation* is what one source said about a stint, kept as it said it; a stint's fields
  are the first observation's to state them (MaxPreps' roster page for that level, then the overlay, the
  school's JV list, the stat sheet, the all-league list), and every other statement is listed under
  `conflicts`. Nobody types a conflict in. A grade is read against `classOf`, so a source that says grade 10
  in 25-26 and one that says grade 12 in 26-27 disagree and `classOfConflicts` says so. `classOf` is the year
  most sources imply, each (season, source) counting once, and a tie goes to the latest season's best
  source: Los Gatos' and Santa Clara's 26-27 boys basketball rosters, created 2026-11-13, still carry last
  year's grades, and are outvoted by the 25-26 stat sheet and all-league list. A stat sheet's class is not
  always right either (Convent's 25-26 sheet reads a year low for 8 of 12 returning players); for a player
  only that sheet lists, it is all there is.
- **What it reads**, per sport: `rosters.json`, `jv-rosters.json`, `rosters-enrichment.json` (each filled
  field an observation naming its source, each recorded conflict a `rejected` one that decides nothing, each
  recruiting profile a class-year statement, `sourceName` another spelling, `name` the name of a MaxPreps
  "Player #N" stand-in, `level` the squad; an unnamed stand-in is no sighting at all),
  `player-stats.json`, `jv-rosters-school-sites.json`, a `listed` otherRosters' names (`school-roster`: a school's
  own varsity list, while MaxPreps lists nobody for the team, since 2026-11-26); and for a past season
  `prior-players.json` (l2) and `history-<season>.json`'s all-league lists. Game notes and box-score lines are
  not read: they carry no more identity than the stat sheet.
- **Who is who.** (1) One MaxPreps career id is one player, in any season, sport, school or level, as long as
  the names it is listed under could be one person's. **A career id is not always a person**: a coach who
  retypes this year's players over last year's rows leaves one id under two people (Piedmont Hills boys
  basketball: `8or0ehjm6ab33` is Nicolas Finuliar, #21, a junior on the 25-26 sheet and Andrew Duong, #21, a
  senior on the 26-27 roster, while Finuliar is now #24 under `aco59i9pqajcc`, which was Bodi Anderson's;
  a third id there, and one each at Bishop's and Vista field hockey: five in all. Leigh's is the same
  thing inside one season, settled by hand in `rowSplits`). Such an id stays with the name it carries
  latest, the other rows are known by name, it is listed for review, and the registry id each person had
  stays with that person, never with the career id. (2) Two careers on one team that
  share a name are one player when their class years do not contradict (MaxPreps keeps some players under
  two career records: 23 pairs, 7 of them at Hollister). (3) A row with no id (a school's JV list, an
  all-league row) joins the one player of its own team and sport with that exact name, when the class years
  do not contradict; otherwise it is a player known by name. (4) Nothing is joined on a nickname or a near
  spelling: those are only suggested. A name is compared letters-only (`nameKey`), and never across teams or
  sports. The result does not depend on the order the rows are read in.
- **`review`** lists what the rules would not decide alone, and **`data/player-identity.json`** is where a
  person answers (`sameAs`, `rowSplits`, `distinct`, `notSame`; each entry says why, and what a person
  decided is not second-guessed by any rule). The registry itself is never edited by hand. The first build
  listed 115 items: 23 `same-name-two-careers` (all joined by the rule), 5 `career-two-names` (all split by
  the rule), 80 `possible-match` (every pair of players of one team whose names look like one person's and
  whose class years do not contradict, unless one list names both under different numbers) and 7
  `same-name-other-sport` (one name at one school in two sports with no career id in common).
- **The 87 look-alike and cross-sport items were answered on 2026-11-14**: 85 are one player each (84
  `sameAs` entries, the three Borello records at Valley Christian being one) and 2 are two people
  (`notSame`: Mission Vista's Jarenuvi and Jaili Benitez, Mt. Carmel's Audrey and Abigail Teuben; in each
  the first graduated in 2026 and the second plays in fall 2026). Each entry's `basis` gives what it rests
  on. Most rest on the repository's own rows: one distinctive surname at one school, the same class, and
  either the same number in both seasons (14), last season's stat-sheet career against this season's new
  one (33), an all-league list's spelling, or a school's JV list that matches MaxPreps' name for name
  apart from this one (Monta Vista, Sage Creek, Scripps Ranch, La Jolla). The 20 that did not were read
  against public pages: MaxPreps' own rosters and career pages, which answered (a career page lists every
  sport, which settles the cross-sport names: Sora Pham, Hailey Cutler, Mia Jones), the schools' rosters
  (Valley Christian's gowarriors.net for Giuliana / Gigi Borello #6; Branham's JV field hockey roster for
  Annalise Clayton and Kathryn Wehrmaker), NCSA (Hailey Moncada, Oliver Evans), the Los Gatan, BVAL's
  all-league documents and a league track result ("Bintu Deen", the better-supported of two spellings).
  **The weakest**: Mia Jones at Los Altos (a common name, MaxPreps' linkage alone), Hana Terrell / Tyrrell
  at Mission Hills (a varsity row created on a tournament day, no page listing both spellings), Skye /
  Skylar Bohannon at Sage Creek (same class and position; a twin cannot be excluded), and the MacDonald
  boys basketball pairs, where the 26-27 rows were typed afresh (Jhaylen Richards / Roy-Richard, Mic
  Borgonia / Bergonia, Jhayde Domingo with the names in each other's fields). Undo a join by deleting its
  `sameAs` entry: the next build that reads the season from its files splits the record and gives each half
  back the id it had. **After a rollover that no longer works**: a season the registry only carries forward
  is kept as it was, joins included, so deleting the entry leaves the record whole. To undo one then, take
  `data/players.json` back to the commit before the join (`git log -S '<the entry's name>' --
  data/player-identity.json` finds it; `git checkout <that commit>~1 -- data/players.json`), delete the
  entry, and run `pnpm build-players`: the two records come back under their own ids, and everything since
  is rebuilt or carried from that file (`tests/players-registry.test.ts` holds this). It costs whatever the
  registry learned about past seasons in between, so settle doubts about these joins before the rollover.
  Deleting a `notSame` entry only puts the pair back on the review list.
- **28 items remain**, all already acted on by a rule and listed to be checked: the 23 joined careers and
  the 5 split ones.
- **Names, nicknames and previous names** (2026-11-16; `lib/players/official-name.ts`). A player's `name` is
  her official name and `aliases` file every other spelling under a kind: `nickname` (Maddie for
  Madeleine, a name in parentheses or quotes, a nickname written in as a middle word), `short-form` (a
  middle name or a second last name left out), `spelling` (a letter or two apart), `variant` (words in
  another order, a source's "(GK) 10") and `previous` (a name she no longer goes by: only a person says so).
  The official name is the fullest form, never a nickname or a part of another of her spellings; then a
  clean spelling over an annotated, uncapitalised or decorated one; then the spelling more sources give
  (each source once a season, MaxPreps' pages as one); then accents, apostrophes and hyphens kept; then the
  more official source: the school's own list, the overlay's cited pages, MaxPreps' rosters, a recruiting
  profile, the all-league list, a stat sheet. The all-league lists rank low on spelling only: of the
  one-against-one spelling ties between an all-league list and a MaxPreps roster, the list held the slip in
  nearly every one ("Mitchelle", "Caityln", "Neibuhr", "Maletec"); their full names still win through the
  first rule. Before the volleyball answers below, the rule changed 55 players' names (Nathan for Nate
  Crawford, Madeleine Grimsley, Breanna Plancarte Medina, Erika Toledano without "(GK)"); after them, 167
  players carry another spelling: 74 nicknames, 11 short forms, 53 spellings and 33 variants. A
  stint still shows what its own best source says. **`names`** in `data/player-identity.json` settles what
  the rule cannot: `official` (any spelling, a source's or not, when the basis says where it is from) and
  `previous`. Two entries so far: Jhayde Domingo (MaxPreps' 26-27 row has the names in each other's
  fields) and Megumi Pugel (Fremont volleyball's school list spells her "Magumi").
- **`pnpm build-players --review`** (`lib/players/review-report.ts`) prints three sections: the questions,
  grouped by pattern, most likely one player first (two lists of one season, each giving one spelling; a
  returning player under a new MaxPreps career; a name on last season's list and a career this season;
  neither; listed in one season at two levels, which is usually sisters), each side with its class year,
  numbers, MaxPreps career link and the pages its sources were read on; what a rule decided, to check; and
  the official names that came down to source order because the spellings' support was even.
  `--drafts <file>` writes a draft `sameAs`, `notSame` or `names` entry for each, its basis prefilled from
  the evidence and starting "DRAFT", which `data/player-identity.json` refuses until a person rewrites it.
- **The 27 volleyball look-alikes were answered on 2026-11-16** from the repository's copies of the lists
  (the live pages were not re-read): 23 are one player (`sameAs`) and 4 two people (`notSame`). Eleven
  were two lists of one 26-27 JV team each giving one spelling, where the lists otherwise agree almost
  name for name (Palo Alto 12 of 13, Branham 13 of 14, Monta Vista 15 of 16; at Fremont and Saratoga the
  school-only names are exactly the MaxPreps-only ones a letter off): Alvendia / Alvendina, Popok /
  Popek, Lyer / Iyer and the like. Seven were returning players under a new MaxPreps career (Caylee Chin /
  Chinn, Maddie / Madelyn Luceno), five a name on the 25-26 all-league list and a career in 26-27
  (Emmeline / Emme Liao, Kailaya / Kai Estrada). The two people: Christopher's Maia and Maja Ysabel
  Handog and Sacred Heart Cathedral's Caylee and Chelsie Chinn (varsity and JV in one season, different
  classes and numbers), Yerba Buena's Jenny and Jaylene Nguyen, and MacDonald's Maya and Nayla Castro (each
  a freshman, a year apart). **The weakest**: Pioneer's Mary / Marianggy Gonzalez (#8 then #7, a common
  last name; same class, one career ending as the other begins), and Saratoga's three, whose school list
  gives no grade.
- **62 more joins on 2026-11-22**, after the site's owner pointed out that Los Altos soccer's Kat Smith is
  field hockey's Katarina Smith: a pair no rule lists, because look-alike names are only compared inside
  one sport's team and a name in two sports only when it is spelled the same. A one-off scan of every
  school's players for like names (a shared or one-letter-off surname with a first name that is the same,
  a short form, or shares an initial; class years not contradicting) found the rest. **13 across sports**
  under two MaxPreps careers or a career and a list (Kat / Katarina Smith and Katie / Kaitlyn Byon at Los
  Altos, Jess / Jessica Lashgari, Maddie / Madison McDougall and Giuliana Borello's soccer row at Valley
  Christian, Leighton Osawa / Ozawa, Mj / Maryjane Meza); **3 inside one sport** the look-alike rule
  missed because both words differ (Abigail Volker / Abby Voelker, Luciana Lulu Gorse / Lulu Gorshe,
  and Liliana Klingler, whose soccer roster row drops a letter); **the 22 `possible-match` questions** left
  from the basketball and later builds; **the 11 `same-name-other-sport` questions** (Lizzie Moorehouse's
  NCSA profile is addressed mary-elizabeth-moorehouse; Mitty's two Lilly Jones careers carry one Hudl
  profile); and **13 players MaxPreps lists twice on one roster** under two careers, which the look-alike
  rule reads as two people when the rows do not share a number (four at Hollister, each a numberless row
  on both rosters and a numbered varsity row spelled another way; Santa Clara's Yaozeng / "Aaron (Yaozeng)"
  Huang). Three were read on the live pages (2026-11-22): Tyler Tsui (the all-league list's "Tsai";
  MaxPreps' 25-26 JV roster has Tsui and no Tsai), Nick / Nicholas Mego (Branham's 26-27 roster is last
  season's entered again, so the merged record's class of 2027 is a stale grade: he is class of 2026) and
  Gabe / Gabriel Andrade (the new row's "Fr." is wrong; Hudl has him class of 2029). The rest rest on the
  repository's copies of the lists. **The weakest**: Hollister's Gabriella / Gabby Sanchez, Homestead's
  Darren / Daren Lee and Milpitas's Matt / Matthew Johnson (common names), Saratoga's Tessie / Theresa
  Berger, and Riordan's Isabella / Izzy Saavedra. **Left apart, not established**: Eastside's Ally Ruiz
  (25-26 soccer all-league) and Ally Ruiz-Oxlaj (volleyball), Homestead's Grace Brunner (JV soccer) and
  Grace (Lizzie) Brunner (JV field hockey), and Wilcox's Yareli and Arely Hernandez; MaxPreps' career
  pages tie none of them. **`sameAs` cannot reach a record no source lists any more**: MacDonald's second
  Dewyond Williams (#13), Yerba Buena's Uriyah Pacual and Monta Vista's Hanna Mohammed are rows their
  coaches have since replaced (by #0 Dewyond Williams, Uriyah Pascsual and Hanaa Mohamed), and stay in the
  registry as separate records marked `gone`. (Since 2026-11-24 an entry whose career or name no source lists any
  more is curation drift: the build leaves it out with a warning instead of failing, and `pnpm roster-drift
  --identity` lists it; CI fails only a pull request that added or edited such an entry.) Two `names` entries keep an official name the joins would
  have changed (Giuliana Borello, Theresa Berger). After the build: 6,843 players (6,275 with a MaxPreps
  career, 568 known by name alone), 86 in more than one sport, and no question left on the review list.
- **2026-11-16 build**: 5,475 players (4,955 with a MaxPreps career, 520 known by name alone), 6,766 stints,
  11,153 observations, 984 in more than one season, 36 in more than one sport, 59 conflicts inside a stint
  and 60 class-year conflicts. The review list holds only what a rule decided: 44 joined careers and 9
  split ones.
- **2026-11-14 build, after those answers**: 3,946 players (3,488 with a MaxPreps career, 458 known by name
  alone), 4,834 stints, 7,638 observations, 631 players in more than one season, 22 in more than one sport,
  50 conflicts inside a stint and 57 class-year conflicts. Before them it was 4,030 players.
- **Seasons.** `built` names the (sport, season) pairs a build read. A season whose files are gone is
  carried forward from the previous `data/players.json` as it was, which is how the registry outlives the
  rollover that overwrites `rosters.json`: **run `pnpm build-players` before the rollover**. A past season
  the registry saw live is only topped up from its later files (its all-league lists), never rebuilt from
  them. Inside a season being rebuilt, a stint or a player no source lists any more (a row a coach deleted)
  is kept as the earlier build left it and marked `gone`. A join made in a season no longer rebuilt stays
  made.
- **Ids.** A rebuild keeps every id. A player known by name keeps hers when a career id arrives; when two
  records become one, the one with more stints keeps its id and the other becomes a `formerId`; a record
  split back out takes back the id it was founded under.
- **Filed by person (since 2026-11-26).** A person's recruiting pages (`data/player-accounts.json`), club ties
  (each sport's `clubs.json` `memberships`) and college commitment (`data/commitments.json`) are filed under her
  registry id, not under a roster row, so nothing needs re-keying at a rollover or when she changes school, squad
  or sport. `pnpm build-players` writes `data/<sport>/player-index.json` with the registry: which person each of
  this season's rows is (a MaxPreps row by `athleteId`, a school's own varsity or JV list by name; a stint no
  source lists any more is no row; only the people something is filed under, to keep each build's bundle small),
  and what the pages show of those people's pages. The loaders find people
  through it, and it is held to be what a build writes (`tests/players-registry.test.ts`). The build also keeps
  the person-filed files keyed: an id it retires (two records found to be one person) is rewritten to the one
  that stayed, and every `name` to the official one. A page's class year is a statement about its person, added
  to her latest stint (in the page's sport where she has one there), so it still counts in `classOf`.
- **`playerId` in the roster overlay.** `data/<sport>/rosters-enrichment.json` joins to a roster row by team and
  MaxPreps' per-season `athleteId`; `pnpm build-players` writes each record's `playerId` beside that key (the
  row's player, never a `gone` stint's). The site does not read it. A file is rewritten only when an id in it
  changes.
- **Changing schools (since 2026-11-26).** A name is never joined across schools by rule. `possible-transfer`
  lists one name at two schools never in the same season, with class years that do not contradict and that each
  school's seasons can hold (a graduate, or a player in eighth grade the other season, is two people). A person
  answers with `sameAs` (a name to a career at another school, or with `isTeam`/`isSport` to a name there) or
  `notSame` with `otherTeam`/`otherSport`. The first build listed seven: Kiley McGibben (Sacred Heart Prep to
  Menlo, volleyball, #4 both seasons), Thais Ross (Los Altos to Mountain View, volleyball, #12 both seasons) and
  Ella Claveran (Presentation to Mitty, soccer) were joined on 2026-11-26; Josiah Olmos (Cupertino, Capuchino),
  Derrick Jones (Overfelt, Hollister), Esha Singh (Fremont, Cupertino) and Reagan Connors (Kings Academy, Willow
  Glen) are left: common names, or grades that do not follow on. No page shows a player's previous school.
- **It may lag.** The winter refreshes refetch rosters weekly and do not run `pnpm build-players`, so a new
  row can be missing here until someone does. The tests hold what the file says to be true and its ids
  stable, not the file complete; `pnpm build-players --check` says whether a build would change anything.

### 1.2 SECONDARY — SBLive / Scorebook Live (now `si.com/high-school/stats`)

⚠️ All `scorebooklive.com` URLs now 301-redirect to `si.com` — target si.com directly (a
non-redirect-following fetch fails silently). ⚠️ The `data-react-props` payload's top-level keys
are `{query, variables, application}` — there is **no** top-level `props` key.

Extraction (uniform across pages): match `data-react-class="<CLASS>" ... data-react-props="([^"]*)"`,
decode HTML entities, `JSON.parse`.

| Purpose | URL form | React class | Path |
|---|---|---|---|
| Team schedule + results | `.../teams/{sbliveId}-{slug}/games` | `teams/Games` | `query.team.games.nodes[]`, `.standing` |
| League standings | `.../leagues/{id}-{slug}/standings` (SCVAL 4242 and 4243, BVAL 4175, PCAL 4231 and 4232, MCAL 4212, EAL 4190; Sunset 4249, City 4179 and 4178, North County 4170, 4171 and 4234, Metro 4214 and 4199; the independents' one-school leagues Palomares 4235, League B 4207 and Marmonte 4213, read for backfill only) | `organizations/Standings` | `query.organization.teamStandings[]` |
| Statewide daily scoreboard | `.../scores?date=YYYY-MM-DD` | `games/GenderSportIndex` | `query.scoreboardDate.games.nodes[]` (not `query.games.nodes[]`) |
| League-scoped scoreboard | `.../leagues/{id}-{slug}/scores` | `organizations/Scores` | `query.organization.scoreboardDate.games.nodes[]` |
| Single game detail | `.../games/{id}-{slug}` | `games/Show` | `query.game.{id,date,contest,gameTeams[]}` |

Game-node fields: `id`, `date` (ISO **with offset**, better than MaxPreps' naive local),
`featured.{locationDescriptor,isHome,result,scoreText,standing}`, `opponent.{scoreText,isHome,
team}`, `gameTypeLabel`, `statusId`/`shortStatusText` (`3`/`"F"` = final, `1` = upcoming).

**Caveats:**
1. ⚠️ **SBLive's league buckets are wrong.** For SCVAL its "De Anza" (4242) holds only 5 teams
   (Mitty and Los Gatos misfiled in — they're El Camino); its "El Camino" (4243) misfiles 5 De
   Anza schools and omits Los Gatos, Mitty and Santa Clara entirely. Santa Clara appears in
   **neither** standings page. **Never take division membership or `leagueRecord` from SBLive,
   for any league.**
2. `gameTypeLabel` is unreliable — league-vs-non-league comes from MaxPreps `contestType` and each
   league's official schedule (§3.1), never from this label.
3. Wilcox has 1 scheduled game, 0 played — effectively no coverage.
4. `variables.level` is hardcoded `VARSITY` on a varsity page, and the varsity pipeline reads no JV
   from this source; a few **JV teams have their own team id** (York, Tamalpais JV), which the varsity
   config ignores (§5.4). Every school's JV team page is read by `scripts/fetch-jv.ts` instead (§1.7).
5. Team slugs must be recovered from `teamStandings[].team.webPath` or `opponent.team.webPath` —
   never guessed.
6. Some rows are junk: a Salinas–Stevenson game appears twice, once under a `/new-york/` path.
   Only rows whose `webPath` starts `/california/field-hockey/games/` are read.
7. **The EAL bucket is harvest only.** `4190-eastern-athletic` lists 8 teams (checked 2026-10-04):
   Pleasant Valley, Davis, Chico, Yuba City 459232, River Valley 459231, Red Bluff 490259, Corning
   and Lassen, and **no Bella Vista**.
   `gameTypeLabel` is wrong on several EAL games. Its team ids are the varsity ones recorded in the
   registry (Bella Vista 459060, Chico 458564, Corning 458585, Davis 458605, Lassen 458783, Pleasant
   Valley 458566); the JV and freshman ids differ and are never seeded (JV: Chico 458563, Pleasant
   Valley 458565, Davis 458606, Bella Vista 459059, Lassen 490252, Corning 485808, Red Bluff 490260;
   freshman: Corning 554338, Lassen 554132). Pleasant Valley's school id 10337 comes from the page
   props' `school.id`, since its si.com logo is a team image.
8. **A placeholder team carries Red Bluff's original fixtures.** si.com team 635037 "Educational
   Outreach Academy" (Red Bluff, CA) holds 12 "League" rows against all six EAL teams, every one with
   `statusId` 3 (si.com's "final") and no score, labelled CANC. Ids 490259, 490260 and 635037 are in
   `DATA_QUALITY.sbliveIgnoredTeamIds` (§5.4), so no such row can reach a game or the cross-check.
9. **"Davis" is ambiguous statewide.** si.com's team search
   (`.../field-hockey/teams?name=davis`, 2026-10-04) lists two varsity teams named Davis: 458605
   (`/teams/458605-davis-blue-devils`, Davis, the EAL team) and 458828 (`/teams/458828-davis-spartans`,
   Davis, Modesto). The searches for Bella Vista, Corning, Lassen and Pleasant Valley each named one
   team of that name, and Chico's one team named Chico (458564; the search also returns fuzzy
   matches, Pleasant Valley, Chino, Chino Hills, Ayala and Don Lugo, which are other names). So only
   Davis joined the name-collision list (§5.3). The same search for the 50 Southern California names
   (2026-10-06) added seven more (§5.3 step 4; `STATEWIDE_AMBIGUOUS` in `lib/sources/sblive.ts`).
10. ⚠️ **The statewide scoreboard is truncated at 24 games a day.** `.../scores?date=` server-renders
   only the day's first 24 games; the browser loads the rest through si.com's own GraphQL client.
   On 2026-10-06 the page's `query.scoreboardDate.games` said `totalCount` 29 with
   `pageInfo: { endCursor: 'MjQ', hasNextPage: true }` and held 24 nodes. No URL parameter reaches
   the later games: `&after=`, `&page=2` and `&cursor=` all return the same first 24. With the
   Southern California teams a busy day passes 24, so `parseScoresPage` warns ("si.com scoreboard
   lists 24 of 29 games; the rest load in the browser and are not read") and the day is never taken
   for the whole day: a truncated scoreboard only lowers coverage (a game it does not list is planned
   for a team page or waits for a later run; `lib/crosscheck/backfill.ts` `scoreboardCoverage` is positive-only),
   never a conclusion. **[V]** 2026-10-06.

   A winter day statewide runs far past 24 (girls soccer 65-108, boys basketball ~280, 2026-11-17..20), so for a
   day the statewide page cut short the run also reads each league scoreboard of ours that played that day,
   `.../leagues/<slug>/scores?date=` (`LEAGUES[].sblive.leagueSlugs`; `parseLeagueScoresPage`). It is an
   `organizations/Scores` block whose `query.organization.scoreboardDate.games` hold the same nodes as the
   statewide page's, every game a member plays that day, league or not, with no cut (`hasNextPage` false). Two
   traps, both handled: a league with no game on the date asked for is served its nearest earlier day with
   games, with a 200 (3913-scval-el-camino asked for 2026-11-18 served 2026-02-25, last season), so a page whose
   own `scoreboardDate.date` is not the one asked for gives no rows; and si.com renumbers leagues
   (2579-scval-deanza now redirects to 3912-scval-de-anza), so a page for another slug, or one that names none,
   is refused. Only a league with a game that day the statewide rows did not give is read (a game against a school
   outside the registry always counts). A game both pages list is kept from both, and `cleanSbliveRows` keeps the
   better row (scored and final over not). At most `SBLIVE_LEAGUE_SCOREBOARD_CAP` (30) league pages a run, newest
   day first, and none after `SBLIVE_LEAGUE_SCOREBOARD_FAILURES` (3) fail; the rest are logged as waiting. A day is
   newest for two or three runs, so its pages are read then, and a game still missing a score after that is a
   team page's (§5.2 rule 8). On 2026-11-21 they added 32 boys
   basketball and 5 girls soccer games the statewide pages did not list. **[V]** 2026-11-21.

**Role in this project (owner decision D2, §5.2):** a cross-check, a same-day scoreboard with
timezone-correct timestamps and — under ten mechanical rules, for official league fixtures
MaxPreps lacks, for past MaxPreps contests between two of our teams that have no score, and for
three mechanically detected wrong finals — a **backfill**: its score may be published where MaxPreps
has no game, no score, or a plainly wrong row. MaxPreps remains the primary source. A team on si.com
is identified **by id** (§5.3), never by bare name.

### 1.2a CROSS-CHECK ONLY — cifsshome.org schedule-and-score widget

`https://www.cifsshome.org/widget/schedule-score?section_id=<n>&year=2026&sport_id=30&date_from=MM/DD/YYYY&date_to=MM/DD/YYYY&page=<n>`
is the CIF Southern Section's HomeCampus schedule-and-score widget, and it carries the other Sections'
games too. Server-rendered HTML, no login, `robots.txt` is `Disallow:` (empty) **[V]** 2026-10-07; the
polite User-Agent is accepted. Field hockey is `sport_id=30`; the school year is its fall calendar year.
Section ids: CCS 4, NCS 7, Northern 8, Sac-Joaquin 5 (Davis, Bella Vista), Southern 1, San Diego 3 **[V]**.
20 rows a page; the pagination links name the last page. `date_from`/`date_to` filter the rows
(MM/DD/YYYY, as the widget's own date pickers write them) **[V]**.

Each `<tr id="<row id>">` is one game: Sport, Home, Facility, Home Division, Home Score, Away, Away
Division, Away Score, Date, Time, Game Type (League, Non-League, Tournament, Playoffs, State/Regional,
Wildcard), Notes (an Event Notes modal; "N/A" when empty). A school from another Section carries
its Section in parentheses (`Christopher  (Central Coast Section)`), a school in none `(No Section)`;
a city after a slash disambiguates a few (`Edison/HB`, `San Marcos/San Marcos`, `El Capitan/Lakeside`).
Widget names that differ from MaxPreps' resolve through the registry aliases (`Convent and Stuart
Hall`, `Davis Sr`, `Stevenson School`, `Sobrato`).

**What it is, measured 2026-10-07:** schools enter their own schedules and scores, so coverage is
school by school. Of the 252 NorCal finals in that morning's snapshot, the widget scored 144 (SCVAL
62/92, MCAL 46/61, BVAL 23/46, EAL 8/21, PCAL 5/32); most of the gap is games with no row at all, and
some schools enter games without scores. Every one of the 141 NorCal games both sources scored agreed,
and the widget never had a NorCal score before MaxPreps. A game two schools both entered can carry two
different scores (15 such games season to date, 14 of them with one entry matching MaxPreps). A row
can outlive a reschedule (it stays on the first date) or a scrimmage: Valley Christian–Christopher,
Aug 25, is a 0-4 Non-League row there and a Deleted scrimmage on MaxPreps (§1.1, contestState 1). San
Diego Section rows record some level shootout games with the shootout goal added, as si.com does.

**Role in this project:** a score **cross-check only** (`lib/sources/cifss.ts`,
`lib/crosscheck/cifss-crosscheck.ts`, pipeline step 11b `lib/pipeline/steps/cifss.ts`, `/about#cross-check`).
Nothing it says reaches a published score, record, classification or standings order. Each run reads
every page of the six Sections' listings, season start (Aug 1) through the run's date, and
compares only the widget's SCORED rows with at least one of our teams:

- identity is Section-scoped: a bare name resolves only to one of our teams in the listing's Section, a
  suffixed one only within the suffix's Section, a `(No Section)` one only through
  `CIFSS_NO_SECTION_TEAMS` (Stevenson), so the North Coast Section's own Del Norte is never San Diego's;
- the join is `(date, unordered pair)` as for si.com, then the pair's nearest unmatched game within
  three days;
- both scored: an agreement or a conflict row (MaxPreps' score stands); MaxPreps unscored: a
  `cifssOnlyScored` row; no MaxPreps contest within three days: a `notOnMaxPreps` row, only when both
  sides are our teams (an outside opponent's name often differs between the two sites, so a name-only
  side that finds no game proves nothing), and unless MaxPreps reported a contest of the pair Deleted this run, the pipeline dropped one (`Snapshot.dropped`), or the
  row's note says scrimmage;
- a game two schools entered differently agrees when either entry matches MaxPreps and is set aside
  (logged, not compared) otherwise.

The report is all or nothing: unless all six Sections were read in full, the previous report is
carried, each kept widget score judged again against this run's games (now matching: an agreement;
still different: a conflict showing MaxPreps' current score; game gone: dropped), and a failed
Section's row is `stale`. A page with no "Home Score"/"Away Score" column heads (a challenge or error
page served with HTTP 200) is a failed read, as is a page the pagination named that lists no rows; a
real listing with no games keeps its heads.
`--no-cifss` skips it. About 45 requests a run in early October (SDS 23 pages, SS 8, CCS 6, NCS 6, NS 1,
SJS 1), counted under `other` (not in the summary line's `maxpreps/sblive/official` counts).

### 1.3 OFFICIAL — SCVAL schedule PDFs (read live)

Domain is **scval.com** (`.org` does not resolve). `http://` 302s to `https://` — follow
redirects.

| Document | URL |
|---|---|
| 2026-27 De Anza schedule grid | `https://scval.com/fallSports/26-27%20SCVAL%20FH%20DA%20Final.pdf` |
| 2026-27 El Camino schedule grid | `https://scval.com/fallSports/26-27%20SCVAL%20FH%20EC%20Final.pdf` |
| Fall index (file discovery) | `https://scval.com/fallSports/Fall_index.html` |
| Standings index | `https://www.scval.com/standings/` |
| 2025-26 final standings (historical baseline) | `https://www.scval.com/standings/2025-26%20Field%20Hockey%20standings.pdf` |
| 2025-26 all-league awards | `https://www.scval.com/standings/SCVAL%202025-26%20Field%20Hockey%20all%20league.pdf` |
| BVAL 2025-26 final standings (history; sheet linked from `https://bval.org/standings/`) | `https://docs.google.com/spreadsheets/d/1lXPbU5WJsgr6cpo3sJZBIJBChMXjNC-_/export?format=csv` |
| BVAL 2025-26 all-league awards (history; index `https://bval.org/all-league/`) | Google Docs `1VWcZOzF2S_3SxvdfbphzmVSnKKiSWA7Q` (Mt. Hamilton), `198L-AgFIkPY1XX06I9tZjGv38g5fk_a3` (Santa Teresa), `/export?format=html` |
| 26-27 By-Laws (settles standings/points/tiebreaks) | `https://scval.com/fallSports/1%2026-27%20SCVAL%20Field%20Hockey%20By-Laws.pdf` — see `docs/BYLAWS-2026-27.md` |

`pdftotext -layout` recipes:
- **Schedule grids:** column-major, three date-columns per band (naive line reading interleaves
  three different dates). Header regex (global, up to 3 hits/line):
  `/(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)[, ]+([A-Z]+)\s+(\d+)/g`. Matchup regex (verified
  56/56 rows), group 1 = **AWAY**, group 2 = **HOME**:
  `/([A-Z][A-Z. ]*?[A-Z.])\s{1,}@\s{1,}([A-Z][A-Z. ]*?[A-Z.])(?=\s{2,}|\s*$)/g`. ⚠️ Splitting on
  2+ spaces and re-pairing on `@` shatters cells like `ST. FRANCIS   @   FREMONT` — do not do
  that. ⚠️ Special-case the Oct 30 crossover row (`DE ANZA #4 VS EL CAMINO #4`, `#1 v. #1` — `VS`/
  `v.` as alternate separators). Grid names are UPPERCASE/abbreviated; the prose Teams line uses
  mixed case (`Saint Ignatius`) — a normalization map is required. Windows: DA Mon/Wed Sep 9 →
  Oct 26; EC Tue/Thu Sep 10 → Oct 27; plus the Fri Oct 30 crossover. ⚠️ The crossover's MaxPreps
  rows do not all sit on the grid's day: on 2026-10-29 MaxPreps had #1 v #1 (St. Ignatius at Mitty,
  contestType 5) and #3 v #3 (Palo Alto at Valley Christian, contestType 4, venue "SCVAL Crossover
  Game") on Thu Oct 29 and the other two on Fri Oct 30, so the pairings carry a `window` of Oct
  29–30 (`PairingConfig.window`, lib/league-config/scval.ts) and the tagger reads the window, not the day.
- **Standings PDF:** 4 stacked blocks (DeAnza V, El Camino V, DeAnza JV, El Camino JV), row regex
  `/([A-Za-z .]+?)\s{2,}(\d+-\d+(?:-\d+)?)\s*$/`. ⚠️ The "Overall record" column is empty in the
  25-26 file. 2025-26 varsity final: DA — St. Ignatius 11-0-1, St. Francis 10-1-1, Los Altos
  6-4-2, Valley Christian 6-5-1, Homestead 2-9-1, Fremont 2-10, Cupertino 1-9-2 (**7 teams — no
  Wilcox**). EC — Los Gatos 14-0, Mitty 11-2-1, Palo Alto 8-5-1, Saratoga 7-5-2, Presentation
  7-6-1, Santa Clara 4-9-1, Lynbrook 1-13, Monta Vista 1-13.
- **2025-26 history, by league** (`data/field-hockey/history-2025-26.json`, built by `pnpm build-history`; one
  entry per league, `available` or `unavailable`; read 2026-10-03). Record-only everywhere: league
  W-L-T as published, no points or goals computed.
  - **SCVAL** — the two PDFs above: 15 teams (7 + 8 varsity rows, 6 + 6 JV rows), awards in all four
    blocks; `overallRecord` null (empty column).
  - **BVAL** — official sheet `https://docs.google.com/spreadsheets/d/1lXPbU5WJsgr6cpo3sJZBIJBChMXjNC-_/export?format=csv`
    (linked from `https://bval.org/standings/`, "Field Hockey" 2025-26; re-fetched and byte-identical
    to the research copy, `tests/fixtures/bval/standings-2025-26.csv`). 12 teams, 6 + 6 varsity rows,
    Overall and League Record as published, no points/goals. Mt. Hamilton: Leigh 8-1-1 (13-2-1),
    Gilroy 7-1-2 (13-3-5), Christopher 7-2-1 (12-4-2), Willow Glen 3-6-1 (6-7-1), Branham 2-7-1
    (4-12-2), Prospect 0-10-0 (3-13-1). Santa Teresa: Leland 8-1-1 (9-6-1), Westmont 8-2-0 (9-3-1),
    Live Oak 7-2-1 (7-3-1), Sobrato 4-6 (4-6), Silver Creek 1-8-1 (1-14-1), Del Mar 0-9-1 (0-9-1).
    ⚠️ Divisions are the sheet's, which differ from the registry's 2026-27 alignment for two teams:
    Leland (sheet Santa Teresa, registry mt-hamilton) and Prospect (sheet Mt. Hamilton, registry
    santa-teresa). History keeps the sheet's division; the registry is untouched and the page says both
    teams moved. ⚠️ Sobrato's "4 - 6" has no ties field: stored as `4-6` with `t: null`, not 0. JV is
    not stored (a JV Record column exists, but a JV Place for Leigh only). All-league awards: the two
    official documents on `https://bval.org/all-league/` (Fall 2025, Field Hockey: Mt. Hamilton
    `…/document/d/1VWcZOzF2S_3SxvdfbphzmVSnKKiSWA7Q`, Santa Teresa `…/198L-AgFIkPY1XX06I9tZjGv38g5fk_a3`),
    read through the Google Docs HTML export (the txt export drops empty cells): Mt. Hamilton 6
    special awards + 13 first + 13 second team; Santa Teresa 6 + 9 first + 8 second (9 placeholder
    rows naming only Sobrato, Silver Creek or Del Mar are skipped). Santa Teresa writes the year as a
    word ("Sophmore" sic → 10); a blank position is `null`; no honorable-mention table in either.
  - **PCAL** — `unavailable`. pcalathletics.org/field-hockey/ shows only the current 2026 schedules;
    the History pages stop at 2024-25; no 2025-26 standings page or document was found. MaxPreps
    snippets and third-party all-league lists exist but are not official and are not used.
  - **MCAL** — `unavailable`. mcalsports.org loads (a first request is sometimes answered with a
    Sucuri redirect, HTTP 307; the cron reads its `Schedir.htm`), but MCAL posts no standings of its
    own: both standings links on `FieldHockey.htm` point to MaxPreps' current-season (2026-27) league
    table, and `Playoffs/FieldHockeyPlayoffs_25.pdf` (the 2026 sheet's naming) and
    `FieldHockeyPlayoff_25.pdf` both return 404 (checked 2026-10-03). The league **does** publish an
    official 2025 all-league list: "2025 All-MCAL Field Hockey Team" at
    `https://www.mcalsports.org/FieldHockey.htm#FH25`. The MCAL card links it (`alsoPublished`) and
    does not ingest it, because the schema has no awards-only state. No champion is stated. In the
    2026 tournament `FieldHockey.htm` fills its bracket in with W/L marks and some scores (it marks
    "OT", never a shootout); the MCAL General Rules PDF
    (`https://www.mcalsports.org/Gen_rules/GeneralRules.pdf`, modified 2026-10-13, read 2026-10-29)
    is the source of the pennant rule (`citations.pennant`) and of playoff admission (Adults $10;
    students, children and seniors $5; pre-sale on GoFan); the final's street address as planned (700 Miller Ave, Mill
    Valley, CA 94941) came from the schools' HomeCampus calendars (`cifncshome.org/widget/calendar?school_id=…
    &ajax=1&start=…&end=…`, a JSON feed with facility, address, game type, ticket and streaming links; Tam
    1550, Redwood 1517; the NCS counterpart of the cifsshome.org widget of §1.2a, read 2026-10-29, not polled);
    `FieldHockey.htm`, read 2026-11-15, has the final "Moved to Redwood High School", which MaxPreps never
    reflected (it lists Tamalpais as host), so `finalSite` is Redwood and the fixture ledger’s host (lib/fixtures/) swaps
    the contest's sides (lib/results/host-correction.ts);
    the Field Hockey Handbook §9 is the source of the
    no-regular-season-overtime rule and the tournament's two-overtimes-then-shootout format. MaxPreps
    records a tournament shootout as a regulation score with the tally as goals (Tamalpais 3-1 Marin
    Catholic, Oct 28, 2026, was 0-0 after two overtimes: Marin IJ), hence `resultNotes`.
  - **EAL** — `unavailable` (checked 2026-10-04). The EAL published no 2025-26 final standings of
    its own, and we found no EAL league website. The CIF Northern Section's field hockey page
    (`https://www.cifns.org/sports/fh/index`: guidelines and announcements; its standings panel is
    empty) and its Playoff Center (`https://www.cifns.org/guidelines-playoffs-Divisions-archives/playoff-center/index`:
    the 2025-26 points and brackets list no field hockey) post none, and the umpires' site
    (`https://fieldhockeyumpires.org/`) has schedules and assignments, no standings. MaxPreps' 2025-26
    EAL table exists (7 teams, league `7ed47346-7496-472a-b778-74f097b4d629`, and it ordered
    6-4 Pleasant Valley above 7-5 Bella Vista, i.e. by win percentage) but is not a league document, and the
    site does not show standings from newspapers or third-party sites. No `alsoPublished`.
  - To change an `unavailable` entry to `available`: add a source reader like `lib/sources/bval-sheet.ts`,
    extend `scripts/build-history.ts`, and the schema (`lib/history/history-schema.ts`) already validates it against
    the league's own registry slugs and divisions (PCAL, MCAL and EAL are single-division).
- **2025 section playoff brackets** (`data/field-hockey/history-brackets-2025-26.json`, validated by
  `lib/history/history-brackets-schema.ts`, read by `lib/history/history.ts`, shown at the top of /history/2025-26, before any
  league: `#ccs` in NorCal, `#sds` and `#toc` in SoCal; 2026-11-16). Transcribed by hand on 2026-10-07 (the
  Tournament of Champions on 2026-11-03); nothing refreshes it. Each entry's `notes` say exactly what was
  read:
  - **CCS** — the two official bracket pages linked from `https://www.cifccs.org/sports/fh/index`
    ("Brackets & Results"): `…/sports/fh/2025-26/2025_Field_Hockey_Division_{1,2}_Bracket`. They are
    PrestoSports shells that draw a MaxPreps bracket widget client-side (tournament
    `864e7271-f44e-4a88-acdb-11af2b2f0a37`), so they were read in headless Chromium. Both finals (Los
    Gatos 3-0 Saint Francis at Los Altos HS; Valley Christian 1-0 Willow Glen at Gilroy HS) match the
    CCS Field Hockey History PDF (`/ccs_sports/sport_history/CCS_Field_Hockey_History.pdf`, CloudFront
    indirection as §1.4), which gives the sites. Willow Glen v Stevenson (D2 semifinal) is 1-1 with a
    "(W)" for Willow Glen; the shootout, 2-1, is the box score the bracket links.
  - **San Diego Section** — the Section's "2025 Championship Brackets" Google Sheet (the same sheet the
    City, North County and Metro cards link): Open Division (8), Division I (12, seeds 1-4 with byes)
    and Division II (12, an 11th-seed play-in, Helix Charter 2-1 Granite Hills). Read through the xlsx
    export; two scores the spreadsheet turned into dates (4/1/2025, 2/1/2025) read 4-1 and 2-1 in the
    CSV export. The sheet names champions but posts no final scores; the Open (Bishop's 3-0 Canyon
    Hills) and Division I (Mt. Carmel 2-2 La Costa Canyon, 3-2 shootout) finals come from the
    Section's Record Book (Google Doc, linked from the same page). Its Division II table stops at
    2024, so Eastlake's final win over Del Norte has no score.
  - The NCS, the Northern Section and the Southern Section held no 2025 field hockey playoffs, so
    MCAL and the EAL have no bracket block.
  - **Tournament of Champions** (`tournaments.toc`, shown as `#toc`; added
    2026-11-03) — the Sunset's and the LA independents' postseason, which no CIF section runs (§1.8). No
    bracket, pairings or seeds were published, so the bracket is assembled from the games and its sides
    carry `seed: null`: Harvard-Westlake's three games from the Harvard-Westlake Chronicle (Nov 15, 2025:
    5-1 Fountain Valley in the first round Oct 21, 2-1 Edison in the semifinals Oct 23, 4-0 Newport Harbor
    in the final Oct 25 at Ted Slavin Field), the other five from MaxPreps' 2025-26 schedules as
    `data/field-hockey/prior-season.json` holds them (every game between two Southern Section registry teams dated Oct
    21-25, 2025, asserted in tests/history-brackets.test.ts). Bonita 1-1 Newport Harbor in round 1 is
    `decidedBy: 'tiebreak-unreported'`: MaxPreps marks it a Bonita loss and Newport Harbor played on, but no
    source gives a shootout (MaxPreps' game page returned 403 on 2026-11-03). Huntington Beach 1-0 Edison on
    Oct 25, the two beaten semifinalists, is stored as `thirdPlace` (the 2026 format names a third-place
    game; no 2025 source does), drawn as a card under the final, as /playoffs draws the 2026 event's
    (2026-11-16). Each card's top side is MaxPreps' home team.
- **2025-26 CCS and CIF State brackets in the soccer, basketball and volleyball builds**
  (`data/<sport>/history-brackets-2025-26.json` `published`, `PublishedBracketsSchema`; read 2026-11-16). MaxPreps'
  tournament pages, read whole by `lib/sources/maxpreps-tournament.ts`: the 2025 Central Coast Section Girls
  Volleyball Championship, the CIF Central Coast Section 2026 Girls' Soccer Championships and the 2026 CIF Central
  Coast Section Boys' Basketball Championships (California), every division, and the CIF State divisions a team of
  ours played in. Found from last season's team schedules (a bracket game's `tournamentCanonicalUrl` under the prior
  `sportSeasonId`), each division read from its own page (`/tournament/<tournament>/<bracket>/….htm`, the two GUIDs
  in .NET byte order, base64url) one a minute: the site answers 403 to faster reads. The 2025 volleyball pages print
  no round headers; the round's name is its depth in the tree and its day the games' own dates (the `notes` list
  each round that borrowed another division's day). The boys basketball Open Division was pool play, not a bracket,
  and is not in the file.
- **No 2026-27 standings PDF exists yet** — poll the index for `/2026-27.*field hockey.*standings/i`
  rather than hardcoding a URL.

Rest of scval.com (legacy `fieldhockey_TR.html`, `schedules.html`, homepage ticker) is 9+ years
stale — dead weight, not used.

### 1.3a OFFICIAL — BVAL, PCAL and MCAL schedules (bundled, hash-checked)

BVAL, PCAL and MCAL publish their schedules as documents with no feed, so their league fixtures
were transcribed once (2026-10-02) and are **bundled** in `data/field-hockey/official/{bval,pcal,mcal}-2026.json`
(Zod-validated every time they load, in the cron and in tests). The files are written by
`pnpm build-official-fixtures` from the transcriptions in
`tests/fixtures/official/source/` and are never hand-edited. Each is a double round robin and is
checked as one: every ordered pair a@b exactly once (n·(n−1) fixtures), each team plays its
`gamesPerTeam`, no team twice on one date, every date inside the league-play window.

| League | Document (what the cron hashes) | Fixtures | Bundled sha256 (document bytes) | Revision marker |
|---|---|---|---|---|
| BVAL Mt. Hamilton | Google Doc `150BDI14JosnaB71NoTwYyLp1AFfXSVXb`, fetched as `drive.google.com/uc?export=download&id=…` | 30 | `2b0eb69347cdb0e6aa57da94213db50bd5eadeccfeed96370b5c8106ef2cb172` | Revised 9/20/26 |
| BVAL Santa Teresa | Google Doc `1CrK6oOd5_Lu91rHAfpIlMtqaxMhLxSwD`, same URL form | 30 | `5730fb6089f31d94abd2ebe7a3073114f3867eef731391c8dd113557b79d7303` | Revised 9/22/26 |
| PCAL | `pcalathletics.org/wp-content/pdf/PCAL-Field-Hockey.2026.FINAL_.pdf` | 42 | `6b99480a4a1b44b0eea2c352e81e93e14ca97e44cbcced0c131f188546b3d224` | none |
| MCAL | `mcalsports.org/Schedules/Fall/FieldHockey_26.pdf` | 72 | `aee4894e665be7aebbe37dcb9c14db37dcc5c177dfe7adca2586459eb4370319` | none |

- **BVAL:** 60 fixtures (30 per division, each team 10 games, 5 home). The Oct 31 CCS play-in line
  in the document is an *event* in the file, never a fixture. Default varsity start 5:00 PM with
  five override forms; `lib/official/bval-text.ts` parses the two document texts and
  `tests/bval-text.test.ts` proves the parse reproduces the bundled file. `WG` = Willow Glen.
- **PCAL:** 42 fixtures; the grid uses codes (`STE CAR HOL MON SAL GRE CAT`; `CAT/YOR` and `SCAT`
  are Santa Catalina; York plays JV only). Start time 4:00 PM.
- **MCAL:** 72 fixtures using the dates after the league's two approved changes (Marin Catholic v
  Lick-Wilmerding moved Oct 12 → Oct 15; Lick-Wilmerding v Berkeley moved Sep 24 → Sep 29), the
  original date kept. Those approved changes are posted on `mcalsports.org/Schedir.htm`, **not** in
  the schedule PDF, so the cron also hashes that page's "Girls Field Hockey:" cell. Codes: `AW R T B
  LW U MC CSH/CVS MA`.

**Revision checks (every run).** For each bundled division the cron downloads the document and
hashes its bytes (1 request each: 2 BVAL, 1 PCAL, 1 MCAL, plus 1 for the MCAL changes page). A
different hash is published as a `SourceStatus` row `official-revision-check` with status `stale`,
the league gets a reason (`<League> revised the <Division> schedule after our copy…`), the workflow
opens one issue, and **the bundled fixtures are still used** — a changed upstream document is
never applied automatically. A failed fetch is an `error` row and nothing else.

**Re-transcription runbook** (when a revision check fires, or at the start of a season):

1. Download the new document(s) from the URLs above and keep the files.
2. Update the transcription: for BVAL, convert both documents to text and run
   `pnpm build-official-fixtures --bval-text <MtHamilton.txt> <SantaTeresa.txt>`
   (the parser throws on any override form it does not know, so a surprise is loud); for PCAL and
   MCAL, edit `tests/fixtures/official/source/pcal-official-schedule-2026.json` or
   `mcal-fixtures-2026.json` to match the new document.
3. Run `pnpm build-official-fixtures` (add `--check` to only compare). It
   validates each division as a double round robin before writing anything.
4. **Review the diff** of `data/field-hockey/official/*.json` (`git diff`): only the fixtures that really moved
   may change.
5. Update `bundledSha256` and `revisedOn` for that division in its `lib/league-config/<league>.ts` (the sha256 of the
   new document's bytes: `sha256sum <file>`); for MCAL's changes cell update
   `officialChanges.sha256` to the hash of the cell text. Update the matching
   `official/revision/<division>.txt` (or `official/changes/mcal.txt`) in the test corpus so the
   "unchanged" case stays true.
6. `pnpm test`. Commit the data and config together.

SCVAL is the exception: its two schedule PDFs are read **live** every run (see §1.3) and parsed
with `pdftotext`; the carried-forward annotations (each contest's last stamp and the division's unmatched rows, from the
official claims, §4.2) keep a failed run from losing them.

**The EAL has no official schedule** (`official.mode: 'none'`; its league games are classified by
MaxPreps' league flag, as SCVAL's are; §3.1). The Section's Guidelines are its only document and
contain no schedule; the Section's field hockey page has empty Standings and Schedule widgets and
there is no league website. The one grid found is a Google Sheet linked only from the EAL/SRL
umpires' site (`https://fieldhockeyumpires.org/`, "Field Hockey Umpiring Info for Eastern Athletic
League/Sacramento River League / CIF-Northern Section Umpires"; sheet
`1afhaLmxcjKfwKJsX3gobKmqk_KS0E0IGR483YUpKL2g`). On 2026-10-04 its 30 league games equalled
MaxPreps' 30 (date, away team, home team, `contestType` 0). It is a **cross-check only**, never
called official: it is not an official league or Section document, its "Revised" cell (2025-04-29)
is stale while its change log runs 2026-04-29 to 2026-08-21, its times are JV start times, and its
export hash changes on every export, so it is never linked from a page or bundled. Chico at Bella
Vista on 2026-10-14 is the same date in the grid, both MaxPreps feeds and the umpire assignment
sheet.

Without fixtures, "a league result is missing" has its own definition (`missingOfficialResults`
in `lib/standings/missing.ts`, the single definition the pipeline and the pages share): a game MaxPreps
counts for the division, dated before today, that is `scheduled`, `live` or `score-pending` is
**missing**, and one that is `postponed` is listed as postponed. On 2026-10-04 there were two: the
2026-09-29 Pleasant Valley at Corning game (`a0350ae9-…`) and the 2026-10-01 Corning at Chico game
(`dcb840cb-…`), both ScoreNotReported at MaxPreps. The pipeline reports the count as
`missingLeaguePast` on the division's health row. A co-champion label waits for the regular phase
to end **and** no missing EAL result.

**League rules documents** (cited by the config; full text summarized in `docs/LEAGUE-RULES.md`):
the EAL's is the CIF Northern Section Field Hockey Guidelines 2026-28
(`https://www.cifns.org/guidelines-playoffs-Divisions-archives/26-28_Guidelines/Field_Hockey_Guidelines_26-28.pdf`,
an HTML viewer; the PDF bytes are at
`https://d2o2figo6ddd0g.cloudfront.net/l/b/9w43yw991y47ue/Field_Hockey_Guidelines_26-28.pdf`, sha256
`68e73674a1f29bb24d827e842e5ab2adc7f58364ff1a54cd4ea2789377646020`, PDF creation date 2026-06-10);
BVAL Field Hockey By-Laws (rev. 8/13/24, a Google Doc); PCAL Sports Rules — Field Hockey (Jan 2022)
and PCAL By-laws (rev. May 2025), both PDFs on pcalathletics.org; MCAL Field Hockey Handbook
(rev. 10/19/24), MCAL Tie-Breaking Criteria (rev. 3/26) and the 2026 play-off sheet, PDFs on
mcalsports.org; CCS Field Hockey Bylaws 2026-27 §4a (BVAL 4, PCAL 2, SCVAL 7, 3 at-large) and the
CCS Field Hockey Committee report of 2025-11-20 (PCAL reduced from 3 automatic berths to 2).

### 1.4 PLAYOFFS — CIF-CCS (cifccs.org, PrestoSports)

⚠️ **CloudFront indirection.** Every document path on cifccs.org returns 200/`text/html` (a ~31 KB
SPA shell), never the PDF directly. Fetch the cifccs.org page, regex
`https?://[a-z0-9]+\.cloudfront\.net/[^"'\s>)]*` out of the HTML, then fetch that — the CloudFront
path segments are content hashes that change on every re-upload; never hardcode them.

Human-facing paths: `https://www.cifccs.org/calendar/2026-27/2026-27_CCS_Playoff_Dates.pdf`,
`https://www.cifccs.org/sports/fh/field_hockey_bylaws_2026-27.pdf`.

**Verified playoff facts:** entries due Mon Nov 2 2026 noon; seeding meeting 1:00pm same day;
Quarterfinals Sat Nov 7; Semifinals Wed Nov 11; Finals Sat Nov 14; evaluation meeting Thu Nov 19
4:00pm. Single-elimination, two divisions of 8 (1-8 → D1, 9-16 → D2). Auto-qualifier allocation:
SCVAL 7, BVAL 4, PCAL 2, at-large 3 = 16 total. Sites per the 2026 CCS calendar: quarterfinals "at Home
Sites", semifinals "at Neutral Sites" [sic "Semfinals"], finals "at Neutral Site" (`CCS.highSeedHostsThrough:
'quarterfinals'`; in 2025 the semifinals were in fact at the higher seed's field, Los Gatos, St. Ignatius's
Fairmont Field in Pacifica and Los Altos, and the finals at Los Altos HS and Gilroy HS, so the site prints the
calendar's words and each game's own site, and `confirmKeyDates` logs a calendar whose site words disagree with
the config). (Selection
committee and at-large criteria are the **playoff** tiebreak, distinct from the league-standings
tiebreak in `docs/BYLAWS-2026-27.md`.)

**Machine-readable calendar:** `https://cifccs.org/calendar/Field_Hockey?print=ical` (⚠️ the
`?print=ical` query form is required — the bare `.ics` path 404s). Exactly 5 all-day VEVENTs
(Nov 2/7/11/14/19). ⚠️ Live typo: the semifinals SUMMARY reads **`"CCS Semfinals"`** — match on
the misspelling. RSS twin at `?print=rss`.

⚠️ **CCS bracket pages are not programmatically usable** — 0 `__NEXT_DATA__`, 0 ld+json, no API
URL; the page is rendered client-side by PrestoSports' RequireJS bundle. A headless browser would
be required. (Still true of cifccs.org on 2026-10-29; MaxPreps' tournament page, below, is the bracket
source, and its published form is server HTML.)

**The bracket source: MaxPreps' tournament page and the team feeds** (re-read 2026-10-29; this replaces
the untested plan the paragraph carried since the preseason).
- **The page.** `https://www.maxpreps.com/tournament/3jB4uWWtwk20vrdggAkzMA/field-hockey-26/2026-central-coast-section-field-hockey-championship.htm`
  (`CCS.bracketUrl`; tournament `b97830de-ad65-4dc2-b4be-b76080093330`, `CCS.tournament.id`), with one page per
  division: `…/3jB4uWWtwk20vrdggAkzMA/d4lAMGtGHkSsGhilz0g6pg/…division-1.htm` (bracket
  `30408977-466b-441e-ac1a-18a5cf483aa6`, `CCS.tournament.division1BracketId`) and
  `…/3jB4uWWtwk20vrdggAkzMA/h3nCud40WkG1mT2-yPHiPQ/…division-2.htm` (`b9c27987-34de-415a-b599-3dbec8f1e23d`,
  `division2BracketId`). A URL key is the base64url (no padding) of the GUID's sixteen bytes in .NET
  little-endian order; checked on the three 2026 ids and on the 2025 tournament (`864e7271-…` =
  `cXJOhk70iEqs2xGvKy8KNw`) **[V]**.
- **Unpublished today, read positively per division.** The page captured 2026-10-29 21:41Z (111,799 bytes,
  `tests/fixtures/ccs/tournament-2026-10-29-unpublished.html`) is one `<ul class="tournament-brackets">` holding
  TWO `<li id="bracket_<GUID>" data-size="8">` blocks, each an `<h2 class="bracket-name">` and a
  `<div class="not-published">` **[V]**. `readTournamentPage` (lib/sources/ccs.ts) calls a division published
  when its own block carries no `not-published`; a block runs to the next bracket `<li id>` or to the `</ul>`
  that closes the list, because each block's header holds its own `<ul class="links">` ahead of the marker
  (cutting at the first `</ul>` would have called Division 1 published on the unpublished page; a test pins
  it). A body under 2,000 bytes, or one with neither configured id (a WAF 403 body, an interstitial, a
  redesign, MaxPreps' San Diego shell), is not recognised: the bracket part is NOT READ, and the previous
  snapshot's `bracketPublished` and `divisionsPublished` are carried (log: `ccs bracket: page not recognised
  (<reason>) — carried bracket state from the previous snapshot`). The old absence test, `readBracketPublished`
  ("published when the marker is gone"), read every one of those as published and is gone.
- **The published page** is server-rendered HTML: round headers with dates, each team's seed numbered 1-8
  within its division, the score, `?c=<contestId>` links and the champion (MaxPreps' renderer,
  `asset.maxpreps.io/includes/js/tournament_renderer.compressed.20191017.js`, and its live pages for other
  sports) **[V selectors]**. No published field hockey page has been captured, so nothing parses it: the
  seeds come from the owner file below, and a parser is a follow-up.
- **The team feeds** carry the games. The 2025 Los Gatos `schedule-calculated` rows, read 2026-10-29 (quoted
  through WebFetch, since the sandbox's own GET was a 403, so
  `tests/fixtures/maxpreps/postseason-2025/sched-los-gatos-2025-ccs.json` is a transcription), carry on every
  CCS round, quarterfinal to final: `contest.tournamentId` `864e7271-f44e-4a88-acdb-11af2b2f0a37` (the 2025
  championship), `contest.tournamentBracketId` (`ba9db9fb-…`, Division 1), `calculatedFields.bracketName`
  `'Division 1'`, `bracketIsPublished` true, `tournamentName` "2025 Central Coast Section Field Hockey
  Championship", `tournamentCanonicalUrl`, `bracketMatchupID` (read on the quarterfinal), `contest.location`
  "@ Los Gatos HS", `goFanUrl` on the home-site games and `nfhsStreamUrl` on the final
  (`https://www.nfhsnetwork.com/events/cifccs/gamd457a295b4`) **[V]**. `bracketGameIndex` is 0 on every row
  and says nothing about the slot. Every 2026 crossover, Tournament of Champions and EAL row carries the
  all-zero GUID as `tournamentId` **[V]**.
- **What the pipeline does with them** (since 2026-10-29). `lib/pipeline/normalize.ts` sets `Game.bracket` only for a
  real `tournamentId` (`isRealGuid` refuses null and the all-zero id); when two feeds disagree on
  `bracketName` it warns and keeps the copy with `bracketIsPublished` true. `lib/classify.ts` rule 1c tags a
  game whose `bracket.tournamentId` is `CCS.tournament.id` (or whose tournament name says "Central Coast
  Section", in case MaxPreps re-creates the tournament) between CCS teams `{ kind: 'ccs', via:
  'maxpreps-bracket' }`. MaxPreps' contestType 4 makes a CCS game only from the quarterfinals' date (Nov 7):
  before it the flag proves nothing (MaxPreps typed the 2026 Valley Christian v Palo Alto crossover 4/4 and
  the 2025 SCVAL play-in 1). Rule 2b tags any two CCS-league teams from Nov 7 (`via: 'ccs-window'`), across
  leagues too, since 2025's rounds paired teams of two leagues. `playoffs.games` is derived, never kept by
  hand (`lib/postseason/ccs-bracket.ts ccsBracketGames`: tagged `ccs` and dated from the quarterfinals, or marked
  published by the feed, which is how the bracket's games show between the Nov 2 meeting and Nov 7).
- **Seeds** are in no feed field. After the Mon Nov 2 seeding meeting the owner copies the sixteen from the
  published MaxPreps page into `data/field-hockey/ccs-bracket-2026.json` (each division numbered 1-8; contract and
  rationale in `lib/postseason/ccs-bracket-schema.ts`; placeholder `{ "season": "2026-27", "retrievedOn": null, "source":
  null, "divisions": [] }`, so `getCcsSeeds()` is null and no seed is printed) and runs `pnpm test` before
  committing it: `tests/ccs-bracket-file.test.ts` refuses a wrong count, a repeated or non-CCS team, seeds
  9-16 or the divisions out of order, and the data cron's own Test step gates its commit on the suite.
- **Whole brackets, where the site names no CCS division of its own** (volleyball; read 2026-11-14). A
  published bracket block on a MaxPreps tournament page lists every matchup: each school's id, name and seed,
  each side's result, the contest's id, an unplayed game's start, and the ids of the matchup that feeds each
  side and of the one its winner goes to (the all-zero GUID is "none"); a bye is a matchup with one school.
  `lib/sources/maxpreps-tournament.ts` reads all of it and the pipeline stores it as `playoffs.brackets`: the
  CCS divisions from the tournament page above, and each CIF State division a registry team plays in from the
  page its games' `bracket.url` names (a `maxpreps.com/tournament/….htm` URL, checked before it is requested;
  source rows `cif bracket Division …`). The CIF State pages draw two regionals side by side; the tree is read
  from the ids, never from a round's place on the page. A page that fails, or a block that does not parse whole,
  keeps the previous snapshot's bracket.
The poll opened on `CCS.pollFrom`, Oct 25, and runs on every cron run (§5.6). Fallback: CCS posts results as
plain text on X/Twitter.

**Tickets** **[L]**: "GoFan will be used exclusively for mobile ticketing for ALL playoff contests … No
physical tickets will be sold at playoff venues" (CCS Athletics News, `https://cifccs.org/landing/headlines-featured`,
2026-04-29; `https://cifccs.org/Playoffs/fall_playoff_brackets_-_info`) is known from search snippets only: both
pages returned a CloudFront 403 to the research sandbox on 2026-10-29, so the site prints no "GoFan only"
sentence (plan item final-13, skipped until a person reads the page). A game's own GoFan link (MaxPreps
`goFanUrl`) is still its Tickets chip. GoFan's robots.txt is `Disallow: /`, so it is linked, never read. Its
public JSON (`https://api.gofan.co/v2/events/search?schoolId=<id>`; MCAL `CA23031`, Tamalpais `CA68035`; no MCAL
field hockey final was listed at 2026-10-29T21:48Z) is recorded here and not polled.

**Streams**: the NFHS Network's association pages `https://www.nfhsnetwork.com/associations/cifccs/field-hockey`
and `https://www.nfhsnetwork.com/associations/cifsds/field-hockey` (read 2026-10-29; section-hosted games stream
under the association slug, as the 2025 CCS final did) are recorded as link targets, not read. A game's own
`nfhsStreamUrl` is what the site prints.

**Access from the research sandbox on 2026-10-29**: cifccs.org, cifns.org and cifsds.org returned CloudFront
403s; MaxPreps' web pages answered once and then 403 (its WAF; the API was unaffected); fieldhockeyumpires.org's
TLS certificate had expired. The Actions runner is not blocked: its 2026-10-29 19:25Z run read the CCS calendar
and the MaxPreps tournament page `ok`/200 (the snapshot's source rows `ccs-ical` and `maxpreps-html`).

**The San Diego Section's playoffs** (read 2026-10-29): the round calendar is the San Diego Field Hockey
Officials Association's (`https://sdfhoa.weebly.com/calendar.html`, config `rounds`; unchanged since the
preseason); the Section posts its brackets on `https://www.cifsds.org/sports/fh/index` (config `bracketsPageUrl`),
in 2025 the link-shared Google Sheet "2025 CIFSDS Field Hockey Championships" (tabs Open Division, Division I,
Division II; `export?format=csv&gid=` answers without a login). The 2025 sheet is
`https://docs.google.com/spreadsheets/d/1P9J_VFYljarF0IxnE4SP8zHey9T6y97IHz6NZZbaBWg/htmlview` (tabs Open Division
`gid=53658003`, Division I `1795050195`, Division II `742825713`) **[V, 2026-10-29]**; its template is the one the
Section's 2026 flag football brackets use (`https://docs.google.com/spreadsheets/d/1-DdMsDTXiLZF3NIy5sE9PucJmp0eW8VoDZey6wvEqJ4/htmlview`,
"2026 CIFSDS Flag Football Championship Brackets", read 2026-10-29) **[V]**. The 2026 sheet's id is unknown until
published and cifsds.org returns a CloudFront 403 from the research sandbox, so the owner pastes it into
`bracketSheetUrl` (null until then) and the site links it. Since 2026-10-30 the owner also transcribes the placed
teams and round dates into `data/field-hockey/sds-brackets-2026.json` (about 20 minutes; contract and rationale in
`lib/postseason/sds-brackets-schema.ts`, which checks every school against the registry and the field sizes, the play-in,
the rounds inside Nov 2–14 and every Open Division school against `playoffDivisionOf`) and runs `pnpm test` before
committing it; the site then draws that published bracket with MaxPreps' results joined to it (`lib/postseason/sds-bracket.ts`,
DESIGN §31). The placed teams stay hand-entered; the RESULTS are read from the sheet on every run since
2026-11-06 (see "The San Diego Section's bracket sheet as a results source" below). MaxPreps' 2026 SDS tournament page (`AkXf4_tRkUCSmOSRZxp7DQ` = `e3df4502-51fb-4091-9298-e491671a7b0d`,
Open `494a605b-…`, Division I `a4ab20c1-…`, Division II `826dea99-…`) is an empty shell with no `not-published`
marker, and the 2025 pages never went live, so it is not read (`readTournamentPage` reports it not recognised:
it carries no CCS bracket id). The 2026-27 power rankings are plain HTML at
`https://www.cifsdshome.org/widget/power-rankings?sort-points-desc=1&year_id=176&sport_id=30` (divisions
`783` Division 1, `784` Division 2, `789` Open, empty until seeding); the Division 1 and 2 lists match
`playoffDivisionOf` school for school. The HomeCampus schedule-score widget's `game_type_id=5` rows carry a playoff
game's facility and time. Playoff overtime differs from the regular season (all goals in a first 10-minute
period count, then sudden victory, then a shootout; the 2025 sheet writes "1-1 (2-1 SO)").

**The San Diego Section's bracket sheet as a results source** (2026-11-06). MaxPreps does not get every San
Diego playoff game. On 2026-11-06 it had no contest at all for three the Section had posted: Mission Bay 3-2 (OT)
La Jolla Country Day (Division I first round, Nov 3), San Pasqual 5-0 Mira Mesa (Division II first round, Nov 4)
and Torrey Pines 4-0 Del Norte (Open quarterfinal, Nov 5); nor for the Nov 6 quarterfinals Clairemont v Poway,
San Dieguito Academy v Rancho Bernardo and San Marcos v Mission Bay. In 2025 it lacked four of 30 (the Division II
play-in, Bonita Vista v Westview, Rancho Buena Vista v Helix and Rancho Buena Vista v Olympian). Where else:
si.com listed the three 2026 pairs with no score; cifsshome.org's San Diego listing (§1.2a) did not have them;
the Section asks schools to report scores to SCORES@CIFSDS.ORG and writes them into the bracket sheet, the one
place every result reached **[V, 2026-11-06]**. So the pipeline reads it (step 09, `lib/pipeline/steps/sds-sheet.ts`):
- the 2026 sheet `https://docs.google.com/spreadsheets/d/1A8tsHqwGiRLD5EBSnCFoAAK5Qg13v6wQlen3HEGspeU/edit` has
  the 2025 sheet's tabs and `gid`s (Open Division `53658003`, Division I `1795050195`, Division II `742825713`;
  `SDS_BRACKET_SHEET_TABS`), each read as `export?format=csv&gid=<gid>` (public, ~1 KB, three requests a run from
  Nov 2 while a San Diego league is in the run) **[V, 2026-11-06]**;
- `lib/sources/sds-bracket-sheet.ts` reads the grid: row 2 dates each round's column, a column lists its teams two
  to a game, the winner is written into the next column between the two with the score under it, winner's
  goals first ("3-1", "3-2(OT)", "1-0 (2OT)", "1-1 (2-1 SO)"); "Game Moved to Wednesday, November 4th", "Game
  Time: 5:30 PM" and "@ Vista High School" between the two teams date, time and place the game. Both sheets'
  results are test fixtures (`tests/fixtures/sds/sheet-2025/`, `sheet-2026/`): 2026's eleven posted results and
  2025's 27 (every game but the three finals, whose scores the 2025 sheet never posted; every winner matches the
  Record Book). A cell it cannot place makes its column unread, with a warning, rather than risk a wrong pair;
- `lib/postseason/sds-sheet-results.ts` applies them with MaxPreps first: a MaxPreps final stands (a different
  score is a run-log warning); a MaxPreps contest with no score takes the sheet's (`provenance.sectionSheet.rule
  'score-pending'`); a game MaxPreps has no contest for within two days becomes `cifsds:<away>-at-<home>`
  (`'absent-game'`), the better-placed team hosting as "@ Higher Seed" says. Each carries `provenance.scores
  'cifsds-sheet'` and `urls.cifsds`, prints † "Score via the CIF San Diego Section", and says on its game page
  why. A tab not read keeps the results the previous publication showed from it for its division, read from the
  sheet's claims (§4.2); a `cifsds:` game MaxPreps posts
  later is superseded (`supersededGames`), and its page redirects to MaxPreps' game;
- the sheet's games with both teams known and no score yet ("fixtures": date, "Game Time", "@ <place>") give the
  times: a MaxPreps contest on the same date with no time takes the sheet's (`provenance.schedule
  'cifsds-sheet'`; one MaxPreps times keeps its own), and a game MaxPreps has not posted is listed as a scheduled
  `cifsds:` game (score pending once its day passes) that its result later turns final under the same id. On
  2026-11-06 that listed the Division I quarterfinals Clairemont v Poway (5 PM), San Dieguito Academy v Rancho
  Bernardo (5 PM) and San Marcos v Mission Bay (6 PM), and the Open semifinals.

**The EAL Super Regional's site and streams** (read 2026-10-29): the NFHS Network's CIFNS field hockey
page (`https://www.nfhsnetwork.com/associations/cifns/field-hockey`) lists two events at Pleasant Valley
High School, Chico, on Sat Oct 31: "2026 CIFNS Field Hockey Postseason Tournament - Part 1"
(`/events/pleasant-valley-high-school-chico-ca/gam320ba3745d`, 15:30Z = 8:30 AM PDT) and "- Part 2"
(`…/gamf48300713a`, 20:30Z = 1:30 PM PDT), both created 2026-10-27. Every cifns.org URL returned a
CloudFront 403 from the research sandbox, and fieldhockeyumpires.org's TLS certificate had expired, so
the site is attributed to the listing, not to the Section. The umpires' grid (cross-check only, §1.3a)
reads "Oct 31 Sat Super Regional — Top 6 teams only" and "Oct 30 Last day for games". si.com carries
placeholder "TBA" rows for Pleasant Valley (Oct 31) and Davis (Oct 30 and 31) at 23:59 that must never
become games. 2025's two MaxPreps rows (Davis 6-0 Bella Vista "Semi Final", Davis 2-1 Chico OT
"Championship Final", Nov 1 2025, contestType 5, homeAwayType 2, the all-zero tournament id, every bracket
field null) were entered the day after; they are a real capture in
`tests/fixtures/maxpreps/postseason-2025/sched-davis-2025-super-regional.json`. Since 2026-10-29 the
`/playoffs#eal` card lists the Super Regional's games by day once MaxPreps has them (the `league-postseason`
tag from the date window; the round word from `contest.location`, `lib/postseason/postseason-rounds.ts roundFromLocation`).

**The North Coast Section (MCAL) is not part of any of this.** The NCS and CIF hold no field hockey
championship, so MCAL has no CCS poll, no bracket page and no berths. MCAL's own six-team
tournament is published on its play-off sheet
(`https://www.mcalsports.org/Playoffs/FieldHockeyPlayoffs_26.pdf`) and its games arrive in the
MaxPreps team feeds like any other, dated Oct 23 or later.

**The Northern Section (EAL) is not part of any of this either, and nothing is polled for it.** The
Section's Field Hockey Guidelines 2026-28 name a "Post Season Tournament – 'Super Regional' (Varsity
Only)" for which "the top six (6) EAL/SRL schools will compete" (§III.E.1, §IV), and its "Northern
Section Championship Playoff Calendar" lists "Field Hockey … Post Season Tourney TBA Oct. 30, 31,
2026" (`https://www.cifns.org/meetings-calendars/calendars/26-27_Playoff_Schedule.pdf`); the
Guidelines give the NSCIF Post Season Tournament as Oct 30-31, 2026 (Fri-Sat), "held at an
alternative site" (§III.E.1), and mark NorCal and State qualification "Not Applicable" (§V, §VI). It is Section-sanctioned and league-run;
the format is set at the preseason tournament meeting (§IV) and none is published. The seeding text
(§III.E.1) is quoted verbatim in the config and never applied. The Section's Sport Dates sheet gives
a last contest of 26-Oct, which conflicts with the Guidelines' Oct 29 and the last scheduled league
game (Oct 28); the site uses the schedule. In 2025 the EAL tournament's games carried `contestType` 5
on both rows, with the round in `contest.location`.

### 1.5 SCHEDULE TIMES — VNN / PlayOn "Mascot Media Bolt" `.ics`

`https://mmboltapi.azurewebsites.net/api/v2/events/calendar/{siteId}/0/calendar.ics` (the `0`
means whole-school; team-scoped variants return an empty calendar).

Known siteIds: Palo Alto `2635290`, Los Gatos `2634860`. Discover others via the school's
athletics `/calendar` page, grepping for `mmboltapi.azurewebsites.net/api/v2/events/calendar/[0-9]+/[0-9]+/calendar.ics`
(the site root does not carry the link).

Corrected SUMMARY regex (the naive `Junior Varsity` pattern misses `JV`-worded events, ~42% loss):
```
/^(Girls (Varsity|JV) Field Hockey) (vs|at) (.+)$/
```
`DTSTART`/`DTEND` are UTC Zulu. `LOCATION` holds the venue. `UID` = `<eventId>@mmboltapi.azurewebsites.net`
(stable upsert key). Requires standard RFC 5545 line-unfolding before parsing. ⚠️ **No scores** —
schedule/venue/time only. Opponent-name formatting differs per school — normalize.

It carries JV events too, but the JV games are read from MaxPreps and si.com (§1.7); these feeds
are not used for JV.

### 1.7 JV games — MaxPreps JV feeds, supplemented by si.com JV pages (`data/field-hockey/jv.json`)

Built by `pnpm fetch-jv` (`scripts/fetch-jv.ts`), twice a day in season after the player stats
(`update-data.yml`, allowed to fail). Listed on team pages (`#jv`) and day pages (`#jv`), **kept apart
from varsity**: no varsity table, record, leader board, rating or postseason picture reads them. JV
tables of their own are computed (`lib/jv/jv-standings.ts`, last bullet). Read 2026-10-05 **[V]**.

- **MaxPreps.** The JV season has its own id: `__NEXT_DATA__.query` of
  `https://www.maxpreps.com/ca/field-hockey/jv/` gives `ssid` `fae4fc22-6de6-47ae-972d-e290b0ec31ef`,
  `teamLevel` `JV`, `teamlevel` `c083cdee-7526-423c-a9c8-4e6da6d6f4e2`, `allSeasonId`
  `d5b0e954-d53f-40cc-a3aa-c45b3a536618` (not used); the `ssid` is `jvSportSeasonId` in
  `lib/sports/field-hockey.ts`, exported as `JV_SPORT_SEASON_ID` by `lib/season.ts`. The team id is
  the school's own, so `schedule-calculated/v1?teamId=<registry id>&sportSeasonId=<JV ssid>` (§1.1b)
  is a school's JV schedule, same shape, each contest's `sportSeasonId` the JV one and its
  `teamCanonicalUrl` ending `/field-hockey/jv/`. All 49 answered 200: 260 non-deleted contests between
  Aug 18 and Oct 30, 91 final; Del Mar, Live Oak and Sobrato have no rows and Silver Creek only
  deleted ones. Every contest both registry feeds list agrees on score and state (246 of 246).
  Opponents outside the registry are names only (Stuart Hall 8 rows, York, Red Bluff, University
  Prep Academy). Rows go through `normalizeGames` with `level: 'jv'`, so a JV game is a `Game`, and
  `countsFor`/`postseason` stay null. `level: 'jv'` turns off one varsity rule: a level final MaxPreps
  flags W/L between two teams of a section with a shootout rule (Northern, San Diego) is never read as a
  shootout win, because both rules are varsity rules (the San Diego officials' procedures: "JV—No
  overtime"); the score stands as a tie and the flags are kept as a contradiction. No JV final had that
  shape on 2026-10-06 **[V]**.
- **MaxPreps' JV league flag is not usable.** Of 217 JV contests between two schools of one league,
  200 fall on the same day and pairing as a varsity game, and on 116 of those `contestType` disagrees
  with the varsity game's classification (every PCAL one). No JV game is tagged league or non-league.
- **No JV standings anywhere in season.** `leagues/{id}/standings/v1?sportseasonid=<JV ssid>`
  answers 200 with the **varsity** table, number for number (checked for De Anza, MCAL and PCAL):
  the parameter is ignored for JV. SCVAL publishes JV final standings and JV all-league awards only
  at season's end (§1.3; the 2025-26 ones are on `/history/2025-26`).
- **si.com.** Each varsity games page's level switcher (`level.name` "Junior Varsity", `webPath`)
  names the school's JV team page; the 48 NorCal paths are in `lib/jv/jv-teams.ts` (Marin Academy, which
  had no si.com page on 2026-10-05, has one since: JV 575146, varsity 575124, read 2026-11-03; its JV
  page's four finals all agree with MaxPreps, read live on 2026-11-03). The registry has the varsity ids
  since the same day (team 575124, school 257, `lib/registry/mcal.ts`): before, si.com's varsity Marin
  Academy rows resolved by name only (Marin Academy v Marin Catholic, Sep 8, `sbliveOnlyScored`). A JV side is one of ours only by those ids (`JV_SLUG_BY_SBLIVE_ID`), never by
  name or by the varsity resolver (which ignores Tamalpais JV and York on purpose). Kept: scored
  finals on `/california/field-hockey/games/` pages; the page must be the JV team asked for. On
  2026-10-05: 68 scored JV finals; no EAL JV page has a score. Matched against MaxPreps by pair and
  date, si.com agreed on 38 of 41 finals; the 3 disagreements include a reversed result
  (Los Altos–Homestead, Sep 14).
- **The merge** (`lib/jv/jv-merge.ts`, run at build time from the file): MaxPreps first. A si.com final
  of the same registry pair within ±1 day fills a MaxPreps game dated today or earlier that has no
  score (`provenance.scores: 'sblive'`, backfill rule `score-pending`, the †), and is recorded beside
  a MaxPreps final it disagrees with (`provenance.scoreConflict`; MaxPreps' score is shown). A si.com
  final of two registry schools with no MaxPreps JV contest of the pair within ±14 days becomes a
  `sblive:<id>` game (rule `absent-fixture`, host from si.com's `isHome`). Never used: a game two JV
  pages list with different scores, a row against a school outside the registry, two rows equally
  near one game. On 2026-10-05: 7 filled, 12 added (8 involve PCAL schools), 3 differ.
- **Audit of 2026-11-03: what the merge left out, and why.**
  - si.com rows unused: Edison v Harvard-Westlake twice on Sep 3 (1-0 and 4-0; `ambiguous`) and Edison v
    Fountain Valley on Sep 11, Oct 1 and Oct 15 (`maxpreps-pair-nearby`) are Edison-entered copies of
    other games under new dates (the 4-0 is the Oct 1 game at Harvard-Westlake; 11-0 and 7-0 are the
    varsity scores of Oct 9 and Sep 16; Edison cannot have played at Harvard-Westlake and at home to
    Fountain Valley on Oct 1). Archie Williams v Marin Catholic on Sep 9 is the MCAL schedule's original
    date of the Sep 16 game MaxPreps has (same score). All correctly unused.
  - `opponent-not-registry`: Marin Academy (no si.com path then; with it, the live read of 2026-11-03
    resolves all four finals on both pages, and they agree with MaxPreps) and York (below).
  - Uncounted (`no-varsity-counterpart`, 20): same-division games with no varsity game within ±3 days,
    mostly early-season or extra JV-only games (Edison v Newport Harbor Sep 24 and Oct 6, both
    "Non League" on si.com), and a few that may be a league fixture's JV leg played on another day (Los
    Gatos at Lynbrook Oct 26, Homestead at Los Altos Oct 26, Harvard-Westlake at Glendora Oct 19). No
    source says which, so they stay uncounted.
  - MaxPreps rows naming the wrong school, a reschedule's leftover row, and a stale Palomar row: left out
    or corrected in `lib/jv/jv-corrections.ts` (each entry names its evidence). Every correction is by
    contest id and reported unused once MaxPreps changes the row.
  - **York** (MaxPreps e9a91bc8, si.com JV 456850 "York Falcons Junior Varsity", Monterey, linking
    varsity 456851). PCAL's schedule PDF, Note 1: "Santa Catalina is Varsity only. York is JV only. They
    are paired together in this schedule as CAT/YOR. The V contest will take priority in event of time
    or site limitations." Its schools line: "Santa Catalina V only (SCAT) … York (YOR) - JV ONLY". So York
    is PCAL's JV member in Santa Catalina's slot: it holds the PCAL JV table row (`JV_OUTSIDE_TEAMS.jvFor`),
    the two MaxPreps rows (and si.com's Santa Catalina JV page, 458108, with the same two unscored Salinas
    games) filed under Santa Catalina are York's, and a York game takes Santa Catalina's varsity game of
    the day as its counterpart. York v Stevenson Sep 16 (the schedule's date; the varsity game moved to
    Sep 23) and Oct 30 (its Oct 16 home game is cancelled on si.com) are named league games
    (`leagueGames`). York's computed 4-0-1 is its si.com league record. York has no page of its own (it is
    not a registry school): since 2026-11-06 its JV games and JV table line are listed in Santa Catalina's
    JV section (`/teams/santa-catalina#jv`), each read from York's side, with its MaxPreps JV schedule
    (`/ca/monterey/york-falcons/field-hockey/jv/schedule/`) and si.com JV page linked, and its PCAL JV table
    row links there. Its MaxPreps JV roster page lists nobody and york.org's field hockey page is a
    schedule only (both read 2026-11-06), so it has no roster here.
  - **Cancelled Salinas games.** Salinas' si.com JV page marks six league games "Cancelled" (each game
    page read 2026-11-03: Stevenson Sep 11 and Oct 12, Greenfield Sep 18 and Oct 16, Carmel Oct 21,
    Hollister Oct 27); MaxPreps still lists them, unscored. They are left out, as a deleted MaxPreps row
    is. The JV si.com parser keeps scored finals only, so it does not read "Cancelled"; other schools'
    cancellations were not swept.
- **School athletics sites** (`lib/jv/jv-school-sites.ts`, transcribed 2026-11-03). A sweep of school,
  league and press sites for every past JV league game with no score found two that publish JV results:
  `sfhsathletics.com/sports/jv-field-hockey/schedule` (Saint Francis, Sidearm; also a text export at
  `/services/schedule_txt.ashx?schedule=1182`) and `siwildcats.com/sports/jv-field-hockey/schedule` (St.
  Ignatius, Sidearm, with forfeit and reschedule notes). Of their results MaxPreps or si.com also score,
  all agree but one (St. Ignatius at Homestead, Sep 21: 6-0 vs MaxPreps' 5-0); the two pages agree on
  both of their meetings. Schedules only, no results: Cupertino's PDF (chs.fuhsd.org), Mitty's Google
  Doc (from mitty.com), hbfieldhockey.com, mcalsports.org, BVAL's Google Docs, Leigh's site. Nothing
  found for BVAL, PCAL, the EAL or the San Diego and Southern Section schools (public-school
  Edlio/Finalsite calendars post schedules, not results); Valley Christian's Sidearm site
  (gowarriors.net) is the next one to try.
  Homestead's athletic director's weekly update (a Google Doc of the weekly emails, given by the owner on
  2026-11-15) is the third, read the same day: each issue lists the past week's varsity and JV results and the
  coming week's games with JV start times. Its JV scores agree with MaxPreps' on every game both score but Los
  Gatos at Homestead, Sep 2 (3-1 there, 3-2 on MaxPreps), and it adds two JV games no other source lists, at
  Leigh on Sep 15 and at Los Altos on Oct 7, both "Played" with no score: rows with `score: null`, listed as
  past games with no score and never used to fill or contradict one. Its "vs"/"@" on a JV result line is not
  reliable (the Oct 14 game at St. Ignatius reads "vs"), so each row's host and start are the issue's own
  schedule for that week. Left out: Aug 31 against "Saint Francis (Freshman)" (2-0; MaxPreps has a 1-0 against
  Saint Francis' JV), and results with no score (the Sep 21 loss to St. Ignatius, the Sep 25 win over Monta
  Vista). Its 2-1 JV loss to Cupertino on Fri Sep 11 moves MaxPreps' Sep 9 row there
  (`lib/jv/jv-corrections.ts` dateMoves).
  Fremont's athletics site (`fremonthsathletics.org/field-hockey#fhschedule`, given by the owner on 2026-11-15)
  is the fourth, read the same day: the page embeds a published Google Sheet ("FHS Field Hockey Schedule
  2026-2027") whose results column reads "Varsity / JV", winner's score first ("L 6-0 / L 4-0"). A second tab,
  the athletic office's own checklist (website, Facilitron, Arbiter, bussing), has no results and dates the
  last Homestead game Oct 26 where the results tab and MaxPreps have Oct 28. All 22 varsity scores match
  MaxPreps'; its "Playoffs, DA #4 or EC #4, Oct 30" line is the SCVAL play-in, which Los Altos played as De
  Anza #4. Its JV scores fill five MaxPreps rows with no score and add the Oct 2 game against Carmel. Two
  are left out because the opponent's page scores them differently: Sep 9 against Saint Francis (4-0 there, 5-0
  on sfhsathletics.com) and Sep 28 against St. Ignatius ("6-0" with no W/L there, 7-0 on siwildcats.com). With
  them its JV record reads 13-5-1 (league 4-5-1), the sheet's own totals, which count the two scrimmages.
  Santa Clara's athletics site (`schsathletics.com/lower/field-hockey-junior-varsity/schedule-results/`, Home
  Campus, given by the owner on 2026-11-16) is the fifth, read the same day. The list loads by script
  (`wp-admin/admin-ajax.php?action=load_schedule_results_full&level_id=10&sportID=30&school_id=905&year=2026-27`),
  so a plain fetch gets only the page shell. It scores all 13 JV games (0-12-1, league 0-9-1). MaxPreps agrees on
  11; on the other two si.com's game pages agree with Santa Clara's against MaxPreps: at Monta Vista Sep 10 (4-0;
  MaxPreps 3-0, si.com 6469093) and Los Gatos at Santa Clara Sep 15 (12-0 to Los Gatos; MaxPreps 7-2, si.com
  6469098). Those two MaxPreps rows are rescored in `lib/jv/jv-corrections.ts` (`scoreFixes`), only while MaxPreps
  still has the score the entry names.
- **Rosters** (shown since 2026-11-06, `lib/jv/jv-rosters.ts`): MaxPreps' `/jv/roster/` pages, read for
  all 102 schools by `pnpm fetch-rosters --level jv` into `data/field-hockey/jv-rosters.json` (the varsity parser,
  with the JV sport season id), list 508 players for 34 schools on 2026-11-06 (11 on 2026-10-05). Several
  carry the whole program: Marin Academy's lists all 18 varsity players with their varsity numbers,
  Clairemont's 19 of its 20 and Harvard-Westlake's 22 of its 25, and all 13 of Huntington Beach's are on
  its varsity roster; Hollister has one player under two career records, one on each page. So a player on
  the varsity roster the page shows is not repeated on the JV list, which counts them (MaxPreps rows match
  by career id or name). The 2026-27 JV lists the schools' own sites publish (or a page the school
  links as its roster) are transcribed in `data/field-hockey/jv-rosters-school-sites.json` (read 2026-11-06, each with
  its evidence for the season; 28 schools, 482 players): Saint Francis and St. Ignatius (Sidearm
  `/sports/jv-field-hockey/roster`, season selector); Los Gatos, Palo Alto, Helix and Bonita (5 Star:
  `/sport/RefreshRosterAthleteStyle2ViewComponent/<JV team id>?schoolYear=2026-2027`, the id from the
  page's level selector, `2025-2026` returning a different list or none); University City, La Jolla,
  Scripps Ranch, Point Loma, Clairemont, Mission Bay, Canyon Hills, Sage Creek, Mt. Carmel, Cathedral
  Catholic, Glendora, Leland, Monta Vista and Santa Clara (homecampus: the JV level is
  `/lower/field-hockey-junior-varsity/roster/?selected_year=2026`, not `/jv/…`, with "2026-27" selected);
  Fremont (the JV sheet of the Google Sheet fremontathletics.org's "2026–27" roster page reads), Branham
  (a Google Doc headed "BRANHAM GIRLS JV FIELD HOCKEY 2026-2027 ROSTER"), Cupertino (chs.fuhsd.org's JV
  tab: no season named, its Varsity tab matches MaxPreps' 2026-27 roster 15 of 15), Bishop's (Finalsite:
  no season named, classes of 2028-30), Lick-Wilmerding and Marin Catholic (Blackbaud, "2026 - 2027"
  selected; Lick-Wilmerding's m.lwhs.org serves http only), Great Oak (SportsEngine, "Junior Varsity
  Field Hockey 2026") and Poway (powayfieldhockey.com, the program's site, "JUNIOR VARSITY 2026"). Left
  out: Marin Academy's own JV page (first names and last initials; MaxPreps lists the same 19 in full)
  and Convent & Stuart Hall's Ballfrog page (its numbered list is the 2025 roster; the 2026 one names
  four people). Where both sources list a school, the page shows the one with more JV players once
  the varsity players are out, the school's on a tie, and names the other. Checked with no 2026-27 JV
  list: Homestead, Valley Christian, Los Altos, Mitty, Presentation (its 2026-27 PDF is varsity only),
  the homecampus JV pages of Granite Hills, Lynbrook, Salinas, Willow Glen, Marina and Mira Mesa (empty
  for 2026-27), Southwest and Saratoga (varsity only), Thousand Oaks, Berkeley (newest JV list 2025),
  Torrey Pines (last season's list), Canyon Crest Academy (2025 only), York, and most other schools'
  sites, which publish none. Not reachable: hw.com and Valley Center's district site (bot challenge),
  edisonfieldhockey.com and Monterey's site (the proxy cannot reach them); Bonita Vista has no athletics
  site we found. `/jv/stats/` (leaders for 4 schools on 2026-10-05) is still not read.
- **Official documents** list JV only as start times on the varsity fixtures (SCVAL "Varsity 4:00
  followed by JV"; BVAL a JV time per game; MCAL's change notes), and PCAL's `CAT/YOR` slot is York's
  JV in Santa Catalina's place. None is read for JV.
- **Cost:** 102 MaxPreps JSON calls through the MaxPreps client's gate and up to 102 si.com pages one at
  a time, 1 s apart (§1.2's client options); the 102 pages take at least 101 seconds of that spacing alone
  (about a minute in all when it was 49 calls and 48 pages). A failure is scoped to the school and the
  source: its previous rows are carried (`carried-forward`). The previous file is salvaged row by row,
  as fetch-rosters and fetch-player-stats salvage theirs: each team row, game and si.com row is held to
  its own schema, and one that fails costs only itself, named in the log. The whole-file schema fails
  whenever the registry grows, so before this a `--leagues` run over such a file sent every team
  outside the run to `pending`; now a team outside the run loses its games only when its own row is
  dropped (the run then exits 1).

- **JV standings** (`lib/jv/jv-standings.ts`, computed at build time from the file and the snapshot).
  A JV game takes its varsity counterpart's classification: the varsity game of the same pair within
  ±3 days, nearest (two equally near decide nothing), counts it for its division when the varsity game
  counts (`countsFor`), makes it non-league when the varsity game is, and leaves it uncounted when the
  varsity game is a postseason game; failing that, an official fixture no varsity contest matched
  (`snapshot.officialFixtures`), same pair, ±3 days, counts it. A pair from different divisions or
  outside the registry is non-league; a same-division pair with no counterpart is uncounted and named
  on the page. Tables order on the league's points (3-1-0, SCVAL's own JV order in 2025-26), level
  teams share a place (no JV tiebreak is published), and a table is shown only when at least 60% of
  the division's played JV league games (final, or dated before the file's day and not postponed)
  have a score. On 2026-10-05: 197 league (195 by varsity game, 2 by fixture), 70 non-league, 5
  uncounted; shown: El Camino (12 of 18), MCAL (36 of 45), EAL (13 of 16); not shown: De Anza (8 of
  16), Mt. Hamilton (0 of 4), PCAL (7 of 15, all from si.com); Santa Teresa has no JV league game.

### 1.7a Freshman games — MaxPreps freshman feeds (`data/soccer/freshman.json`, `data/basketball/freshman.json`)

Built by `pnpm fetch-jv --level freshman` (`scripts/fetch-jv.ts`), twice a day in season after the JV games
(`update-data-soccer.yml`, `update-data-basketball.yml`, allowed to fail); added 2026-11-25 for girls soccer and boys
basketball. The same `schedule-calculated/v1` call as the JV feed, with the school's registry id and the freshman
season id **[V]** (read 2026-11-25 from Saint Francis' season list in its team-context answer and the `ssid` of its
freshman schedule page): girls soccer "Girls Soccer Freshman Winter 26-27" `bd80f68e-f984-4c54-92c2-1845a8572f85`,
boys basketball "Boys Basketball Freshman Winter 26-27" `fcf13999-aa10-47ab-a353-c5d0f888eb63`. The fall sports'
(field hockey `4150d924-08c4-47d0-a177-e5287a6fd7ff`, girls volleyball `6d93cc95-77a0-485b-b4af-7f6a6555a86c`) are
noted, not read, until their 2027 season.

- MaxPreps only: si.com was not checked for freshman pages, and no school site or league document was found
  scheduling the level. Kept apart from varsity and the JV, with **no freshman tables** (owner decision).
- MaxPreps' human-facing page is the varsity team URL with `freshman/` before the season segment
  (`/soccer/girls/freshman/winter/`, `/basketball/freshman/`), as `jv/` is for the JV (`maxprepsLevelTeamUrl`).
- Placeholders: "Non Freshman Opponent" `505c1a99-e49f-4daa-8ec8-355baf311697` (a side MaxPreps does not name; the
  game is listed, `lib/cross-level.ts`); "Freshman Opponent" `b51244ab-a965-47e5-addb-4f44f26c49ed` (an opponent not
  set; the game is not listed, `lib/freshman/freshman.ts`).
- 2026-11-25: 42 soccer games for 20 of 123 schools, one final (St. Ignatius 10-0 against "Non Freshman Opponent",
  Nov 19); 453 basketball games for 75 of 133 schools, seven finals. Woodside's JV feed has Terra Nova at Woodside on
  Dec 8 with the venue "Freshman Team", and the freshman feeds list the same pair that day as a freshman game: both are
  kept as MaxPreps files them until a school says which levels played.

### 1.8 OUTSIDE TOURNAMENT — the Tournament of Champions (Southern Section, not CIF)

Found 2026-10-29 while asking what MaxPreps' two contestType-4 Huntington Beach games were. The Los Angeles
Field Hockey Association's Tournament of Champions ("TOC") is an eight-team end-of-season bracket for Southern
Section teams that CIF does not run: 2026 round 1 Thu Oct 22, semifinals Tue Oct 27, final and third-place game
Thu Oct 29 at Huntington Beach High School (third place at Miller Field). Config: `TOC` /
`SectionConfig.outsideTournament` in `lib/league-config/sections.ts`; tag `outside-tournament` (`lib/classify.ts` rule 1b, a
window Oct 22–29 over every game between two Southern Section registry teams, ahead of the contestType rule);
listed on `/playoffs#toc`, the tournament's own section, which holds the Sunset and LA independents cards. Sources, none official:
- `https://hwchronicle.com/114175/sports/field-hockey-concentrates-as-a-group/` (Aug 25 2026: "defending their
  title of the Los Angeles Field Hockey Association (LAFHA) Tournament of Champions") and
  `https://hwchronicle.com/112272/sports/field-hockey-wins-tournament-of-champions-2/` (Nov 15 2025: the 2025
  final, 4-0 over Newport Harbor, Oct 25, with its first-round and semifinal wins; the 2025 bracket on
  /history/2025-26 `#toc` is built from it and MaxPreps' 2025-26 schedules, see "2025 section playoff
  brackets" above). A 2023 story called it the "Sunset League Tournament of Champions".
- `https://www.hbfieldhockey.com/events` (Huntington Beach's program site): "TOC Playoff - Round 1" Oct 22,
  "Round 2" Oct 27, "Championship (HBHS)" and "3rd Playoff (Miller)" Oct 29.
- `https://www.bonitaathletics.org/sport/field%20hockey/girls/`: "TOC Round 1" Oct 22, "TOC Round 2" Oct 27,
  "Championship Game" Oct 29.
- MaxPreps carries no event name (`contest.name` null, empty tournament id, bracket fields null); only Huntington
  Beach's rows are contestType 4, the rest 1. si.com labels every TOC game "Playoffs" (`gameTypeLabel`), as does
  the CIF-SS widget's Game Type column (§1.2a); both stay cross-check only.
- No LAFHA website, bracket or seeding was found; the pairings are never inferred into seed copy (copy rule 5).
Data consequences: the two duplicate rows the event exposed are duplicate rows of their games’ fixtures in the ledger (`lib/fixtures/`; a second
Harvard-Westlake 6-0 Temecula Valley on Oct 23; a scoreless Newport Harbor at Glendora on Oct 22, the game having
moved to Oct 24). The third-place game (Newport Harbor v Edison, Oct 29) is not on MaxPreps. A Nov 7 all-star
game at Chaparral (hbfieldhockey.com) may surface as team rows inside the Southern Section's season window.

### 1.9 CLUB CALENDAR — organizers' and clubs' own pages (`data/field-hockey/club-events.json`)

Read by hand on 2026-11-13 for `/club-calendar` (DESIGN §34); nothing fetches it. Two sweeps ran in
parallel, one over the associations, tournaments and national bodies, one over the 15 Northern
California clubs of `data/field-hockey/clubs.json`; every quote kept in the file was then re-matched against its
live page (60 by script in Chromium, the other 9 by hand where the text sits in a page's meta
description, a calendar feed's markup or a tab the script does not open). What each source gave:

- **Stick Together community calendar** (`sticktogetherfh.com/calendar/`): an embedded Google
  Calendar whose public feed (`calendar.google.com/calendar/ical/c_c464…%40group.calendar.google.com/public/basic.ics`)
  held 74 events for 2026, none after mid-December 2026. The richest source for 2026, and the only
  non-social source for the USA Gold Cup (Tracy), the Bay Area Hawks Cup, Queens of the Turf (Chico)
  and the SSA Games. Its Nov 2026 post has the Cal 6s save-the-date (Mar 5–7, 2027).
- **SF Hawks' tournament list** (`sfyouthfieldhockey.com/tournaments/`) and **winter teams page**:
  the fullest dated list of the 2026-27 season, from local play days to the national indoor finals.
  Its pages disagree with each other on the U14 girls' indoor final (Feb 13–15, 14–15, 14–16); the
  file takes USA Field Hockey's (Feb 12–15).
- **NCFHA** (`ncfha.org/events`): its Squarespace calendar's JSON (`?format=json`) listed no upcoming
  event on 2026-11-13; `?format=ical` returns HTML, not a feed. The 2026 spring league's fixtures and
  scores are a Google Sheet linked from the home page.
- **BAFHA** (`bafha.org/schedule/matches/`): the 2026 men's season (Mar 22–May 9, Stanford) as an
  image; no results or standings since 2021; updates on Facebook only.
- **Cal Cup** (`calcup.com`, Wix, rendered in Chromium): 2026 only (May 22–25, Moorpark: Ventura
  County, though NCFHA calls it Northern California's). Results per division are on Playbook
  (`calcup.playbookapi.com/division/<id>/`), linked from `/standings`. The 2027 dates (May 29–31) are
  SF Hawks', so the event is `tentative`.
- **USA Field Hockey** (`/events-calendar`, `/events-beyond-calendar`, `/nexus/region-11-schedule`,
  the event pages): national dates, the Region 11 Nexus weekends and selection camp. Its sanctioning
  is paused, so there is no list of sanctioned California events. No West indoor qualifier in 2026-27.
- **Clubs**: Roseville FHC's league page (a script-rendered app: fixtures, scores and standings of its
  own league) and its tournament pages; D-City's tournaments page (the Stanford 6s 2027 dates); Fly
  FHC's programs page (tabs; its fall play days, Thunderstruck); Lightning's SportsEngine calendar
  (paged month by month in a browser); Infinity's Playpass pages (Spring Fling 2026 and its U19
  standings); San Jose Khalsa's events page and tournament app (no schedule or results posted for
  the 2026 Khalsa Cup by 2026-11-13); the Rippers' season pages. Pac Heights, Performance FH, Stryker
  (stops in 2022), Hayward Hawks, Lions (stops in 2024) and Chico Hotshots had little or nothing dated.
- **Not found**: a site of their own for the NorCal Sharks (Facebook only) or East Bay Field Hockey;
  dates or a host for Hockey Gobble; any NorCal indoor league.

Gotchas: a club's page is the only source for several 2027 dates, so those events are `tentative`
and their sentence says whose dates they are; a team name on another club's schedule ("Hayward
Black" on Roseville's Gold Cup page) does not put that club on the event; a month-only date ("April
2027") is never turned into a day: the event stays `expected`.

### 1.10 INSTAGRAM ACCOUNTS — teams' and clubs' official accounts (`data/field-hockey/instagram.json`)

Links, not a source: no fact on the site is read from an account, and `BANNED_HOSTS` (§1.1j2,
§1.1j3) still refuses social media as a source everywhere. Researched by hand on 2026-11-13 for the
102 field hockey teams and the 28 clubs of `data/field-hockey/clubs.json`. Handles were found where a page that is
not social media names or links them: a club's website (read by script, in Chromium where the links
are rendered by script), a school's athletics or team page, a student paper, a search result, the
site's owner. A handle the owner's own page links (a club's site, a school's or a program's) was taken
from that link. Any other rests on a search result whose profile name and bio are the field hockey
team's, a page naming it, a profile opened in a browser (a few, before Instagram's rate limit on
anonymous views stopped the checks), or the site owner's confirmation, each said in its `note`; never
the school's account for every sport, a booster club's, a club team's, a player's or a same-named
school's elsewhere (`stevenson.fieldhockey` is Adlai Stevenson's, in Illinois). JV teams' own accounts were searched the same way and are kept as
`level: "jv"` records beside the varsity program's. A page of the owner's own linking the account is not required
(owner decision, 2026-11-13). Handles are stored lower case, as Instagram stores usernames. A school or
club with no record had no account we could find and check on the day; it may still have one.

A second round on 2026-11-14 went back over the 64 teams and 9 clubs without a record: their schools'
athletics and team pages, program sites and student papers read by script, then web searches limited to
`instagram.com` (the only searches that return a profile's name and bio; open searches return MaxPreps
and school pages). It added Tamalpais (`tamfockey`: the program's Google Site embeds the feed through a
widget that never names the account, and one embedded post, opened in a browser, is that account's) and
two clubs, Lightning and the Huntington Beach Surfers, whose own sites link only Facebook. The 30
Southern California teams still without a record include 13 whose field hockey page was read and names
no account. Left out: `knights_fhc` (a club, not San Marcos High's team), `nighthawksfieldhockeyclub`
and `pantherfieldhockeyclub` (no school named), `clashcoastal` (a CrossFit event, not Coastal Clash).

The owner then gave four SCVAL accounts the round had missed (Los Altos `lahsfieldhockey`, Homestead
`homesteadvfhock`, Valley Christian `vchs_fieldhockey`, Lynbrook `lynbrookfockey`). Why it missed them:
no page of the school's or its paper's names them, and the web search tool's index does not hold these
profiles at all (a search for the exact handle `lynbrookfockey` returns no Instagram result). Google,
Bing and DuckDuckGo all answer a script or an automated browser with a robot check, and Instagram's own
search needs a login. So a small team account that no web page links can only be found by someone
signed in to Instagram, or by guessing handles. With the owner's leave, 361 likely handles for the 11
BVAL teams without a record (each school's name, initials or name-and-mascot with `fieldhockey`,
`fockey`, `fhockey`, `fh`, `vfhock` and the like) were then requested as public profile pages, and every
profile that exists was opened and read. Seven are the teams': Branham `branhamfh`, Gilroy
`gilroyfieldhockey`, Leigh `leighfieldhockey`, Leland `lelandfieldhockey`, Prospect
`prospectfieldhockey`, Silver Creek `silvercreekfieldhockey`, Sobrato `sobrato_fieldhockey`. Nothing
for Christopher, Willow Glen, Live Oak or Del Mar (`delmarfieldhockey` is Delmar, Delaware's). Initials
only ever hit other schools (`chsfockey` is Columbia's, `ghsfockey` Greenfield, Massachusetts's). The
same could be done for the other leagues and the other builds.

On 2026-11-15 the owner gave four San Diego Section accounts: San Marcos `smhs_fieldhockey` (profile opened:
"San Marcos High School Field Hockey", bio "San Marcos, CA 92078"), Poway `powayfieldhockey`, Bishop's
`tbsfhockey` and Canyon Hills `chhsfhock`. Instagram answered Poway's and Bishop's profiles with its login
page, and Canyon Hills' was not opened, so those three rest on the owner's word, as the note of each says. The owner also gave Archbishop Mitty's account, `amhsfh`, which replaces
`mittyfieldhockey` (found by search on 2026-11-13), on the owner's word.

**The other builds** (`data/soccer/`, `data/basketball/`, `data/volleyball/instagram.json`, 2026-11-14):
the same method and rule for that build's program, the girls soccer, boys basketball or girls
volleyball program's own account, or one the school's boys and girls teams share; a boys-only soccer
or volleyball account, or a girls-only basketball one, is not the team's. Found: 7 of 60 soccer, 11 of
41 basketball, 10 of 41 volleyball. Sources that worked: an athletics site's social media page (Los
Gatos, Independence), its sports menu (Gunn), a school's own sports pages (James Lick), the per-sport
Instagram setting embedded in a SIDEARM-style athletics site (St. Ignatius, Riordan, Saint Francis),
Viking Magazine's photo credits (Palo Alto), and searches limited to `instagram.com`. Every profile kept
was opened in a browser the same day; that check dropped James Lick's linked volleyball account
(`comet_volleyball`: "Profile isn't available") and `homestead.vb` (Fort Wayne, Indiana) and
`pioneergirlssoccer` (New York). Left out because the profile does not say which school it is and no
school page links it: `fremont.girls.soccer`, `fremont.vb`, `mvhs.girlssoccer`, `mvhs_girlsvball`,
`lahsboys_basketball`, `homesteadgsoccer`, `homesteadbasketball`, `schs.girlssoccer`,
`santa.teresavolleyball`, `silvercreekvb`, `schsbasketball`, `schsboysbasketball`, `oghoops`,
`oghs_basketball`; `wghs.bball` ("Willow Glen Varsity Boys Basketball") says "Not affiliated with
WGHS"; `wilcoxvarsitysoccer` links the boys' schedule. The site's owner can confirm any of these, as
for field hockey. The search allowance gave most schools one search for all their sports, so a school
with no record was often barely searched.

### 1.11 VOLLEYBALL RECRUITING — profiles, clubs and commitments (`data/volleyball/*.json`)

Research by hand on 2026-11-13 for the girls volleyball build's 41 SCVAL and BVAL schools (569 varsity rows, 322
JV rows on MaxPreps), under the rules of §1.1j (profiles), §1.1j2 (clubs) and §1.1j3 (commitments). One change of
place: rule (b) asks for the roster's class year plus a hometown in the school's own area (its city or a
neighbouring one in Santa Clara County), not just a California one. Each pass wrote its findings apart from the
others; the files were assembled from them once, then are kept by hand. README, "Girls volleyball: recruiting",
has the counts.

- **Hudl** (`hudl.com/api/public/graphql/query`, the public endpoint of §1.1j; queries `fanSearch`,
  `teamHeadersForSchool`, `teamHeader{seasons}`, `roster`, taken from the fan.hudl.com bundle since introspection
  is refused). 40 of the 41 schools matched to a Hudl school in the right city (Lynbrook is filed under Sunnyvale,
  MacDonald as "Kathleen MacDonald High School", Sobrato as "Ann Sobrato High School"; James Lick not found). 91
  team-season rosters (2026 and 2025) of every volleyball team that is not the boys': 1,324 member rows, 1,062 with
  a public profile. 23 schools have a non-empty girls volleyball roster; 9 have no girls volleyball team on Hudl
  (Cupertino, Homestead, Milpitas, Santa Teresa, Del Mar, Gunderson, Lincoln, Prospect, San Jose) and 8 an empty
  one. Each matched profile page (`hudl.com/profile/<id>`) was read from the data in the server's HTML
  (`window.__hudlEmbed`) and kept when its own team list has a volleyball team of the player's school and its
  class year, when shown, is the roster's: 276 pages (230 varsity, 46 JV). 75 rostered players have only private
  profiles. Hudl's "2025" rosters of several teams hold current and former members together, so the season label
  is no evidence; the class year is. A second reader fetched all 272 distinct pages again and kept every one.
  The class year sits in two places (`user.graduationYear`, or `about.overview.graduationYear` when that is null).
- **Hudl team lists as club sources.** A kept page's team list also names the player's club teams (team name,
  organization, sport, years). One tie per club from the latest entry present in both readers' reads; not a
  coaches' account, not an entry that ends before the player's sixth grade (one page lists a "15s" team for
  2017-2018 on a class-of-2027 player), not a school. The first reader's filter for school-like names dropped every
  "Academy Volleyball" entry; the assembly rebuilt the Hudl ties from both reads instead. A range such as
  "2020 - 2024" is partly the team's lifespan on Hudl, so a past tie's year is approximate, and "2025" on a team
  named "25-26" is the 2025-26 club season (kept `unknown`, since "2025" alone may also be 2024-25).
- **NCSA** (`ncsasports.org/womens-volleyball-recruiting/california/<city>/<school-slug>[/<first-last>[N]]`). The
  school slugs came from 13 city pages; 45 school pages cover the 38 schools with players (seven schools have two
  slugs). A school page lists its athletes' names without links, so each match's address was built and fetched:
  27 kept (each names the school, women's volleyball and the roster's class year), seven addresses not found
  (NCSA numbers slugs irregularly). On 2026-11-13 NCSA answered plain curl with server-rendered HTML, so the second
  reader took exact strings, twice. The club ties come from the page's dated "Club Information" lines, not its
  undated "Club" header field; event names in that list (qualifiers, championships) are not clubs.
- **SportsRecruits** (`my.sportsrecruits.com/athlete/<first>_<last>[N]`). An address probe for 870 rows (the bare
  slug and suffixes 2 to 4, continuing while pages kept turning up, to at most 30; 4,472 addresses, about 1.3 a
  second, no 429). 1,017 live pages (957 on `my.`, the rest on the lacrosse and field hockey subdomains); 739 are
  volleyball. The script-drawn parts (the TEAMS block with the high school, club and team, the hometown, a
  commitment) come from one JSON call the page makes itself with no login
  (`api.sportsrecruits.com/api/v2/resources/athletes/<data-user-id>?query[include][@fragments][]=athlete-profile:basics`);
  the kept pages were read four times, agreeing. 44 kept (38 name the school, 6 rest on class year plus hometown).
  406 live pages state a class year that disagrees with the roster and about 530 show at most a class year. The
  probe wrote a hyphenated surname without its underscore, so `emi_yu_yang3` was reached by the commitment sweep
  instead. The athlete directory search every page embeds a key for was not used. Club rosters on SportsRecruits
  (`my.sportsrecruits.com/organization/<slug>/embed/?type=players&teamid=all`) were found for Academy only
  (`academyvolleyballclub_girls`).
- **MaxPreps career pages.** Each varsity row's `careerUrl` read once (569 of 569, about 1.3 s apart), then the
  `/bio/` page of the 153 that were claimed or listed a club. `careerPlayerData.isClaimed` is true on 144, the same
  144 that render the Claimed badge; the `career-claimed` ad-targeting string is on 199 and is not a sign of a
  claim. `careerClubTeamsData` has no season field: a tie is `current` when the entry says year joined 2026 or
  later or was edited in 2026, `unknown` when last edited in 2025, `past` before that. Two pages show another
  person's name than the roster row (Palo Alto's Emi Yu-Yang, Lynbrook's Ashley Wilson); nothing is linked there.
  `careerCollegeInterestsData` lists colleges with no status, so it is interest, never a commitment.
- **FieldLevel** (`fieldlevel.com/app/profile/<first.last>/volleyballwomen`): 140 addresses at six schools, four
  live, none showing a school or class year in the served HTML; stopped.
- **Club registry.** ncva.com has no public club directory, so the candidates were the 84 club codes of the NCVA
  2025-26 Girls Power League points tables (15s to 18s), then every club a player's page names. Records were
  written from the clubs' own sites. With web search rationed, sites were found by guessing addresses; about 20
  Power League clubs' sites were not found. Same-named clubs elsewhere were ruled out by reading them (Pulse in
  Anaheim, Omni in Arizona, Prism in Washington, Prime in Orange County, Empire in Kansas; six Apex clubs in other
  states and Canada). Hudl's team location told which club of a name a player's entry is (The Edge: Lombard,
  Illinois). `visionvolleyballclub.net` is a Texas club, not San Jose's Vision (`visionvolleyball.com`).
- **Club rosters.** Mountain View Volleyball Club's 2026-27 LeagueApps rosters are public at
  `mvvclub.leagueapps.com/clubteams/<id>/teamRoster?teamId=<id>&ngmp_2023_iframe_transition=1` (the bare address
  is a script shell); Vision's 2025-26 teams and College Bound pages, NorCal's and Legend's team pages and
  Academy's SportsRecruits list were read too. All give names without schools. Most other clubs post no roster.
  NCVA league play is not on AES.
- **Prep Dig** (`prepdig.com/player/<first-last>/`, `/team/ca/<slug>/`, `/commitments/?state=california`; plain
  curl). A player page reads "<Name> ... attends <school> in California and plays club volleyball for <club>", the
  school linked to a team page whose title gives the city; that link is what tells Mountain View from the El
  Monte school of the name. `los-altos`, `mountain-view`, `independence`, `lincoln` and `live-oak` team slugs are
  namesake schools. The commitments list needs the state spelled out and ignores `class=`; its dates are entry
  dates and are not used as a commitment's date.
- **PrepVolleyball** (`prepvolleyball.com`): the master commitment list has no high-school column; article bodies
  are paywalled but list "Players featured"; player pages show club and high school together.
- **College releases.** 292 athletics sites' news feeds (D1 169, D2 41, D3 70, NAIA 12): 28,317 stories listed,
  2,745 dated 2026-11-11 or later opened, 73 women's or beach volleyball signing releases, one naming a rostered
  player (Cal's). Classic Sidearm feeds hold ten stories a sport; many D2, D3 and NAIA programs had posted nothing
  by the evening of 2026-11-13. Tulane's beach release of 2026-11-12 names five signees, none ours.
- **News.** Student papers were found for 15 of the 41 schools and read through their own WordPress search and
  post feeds (6,091 posts since 2025-08-01 in one pass; 309 quoted-name queries on 20 hosts in another), with the
  Los Gatan, Gilroy Dispatch, Morgan Hill Times, Silicon Valley Voice, Palo Alto Online, Mountain View Voice and
  Los Altos Town Crier. mercurynews.com's search does not match phrases and was discarded.
- **Web search.** The session's allowance (200 calls shared by every pass, refilling slowly) ran out within
  minutes, twice. Name-by-name searches reached 104 of the 386 seniors, juniors and ungraded players; one pass ran 94 queries for 47
  more players through another engine's result pages before it was stopped. Nothing rests on a search result
  alone: every finding is a page that was then read.
- **Blocked or failing hosts.** `absolutevb.com` (Cloudflare challenge), `cupertinotoday.com` and
  `milpitasbeat.com` (403), `bhsbearwitness.com` (522), `overfelt.esuhsd.org` (certificate mismatch),
  volleyballmag.com (403). `hhsepitaph.com` answers a browser User-Agent and refuses a bare one.
- **Checking.** Every Hudl and NCSA page: a second, independent reader (303 profiles kept of 303; of the 200 ties
  first claimed from them, 1 dropped and 8 corrected, then all rebuilt from both reads). Club-roster ties: the
  second page fetched raw by the pass that confirmed them. Commitments: every quote matched against its page as
  served by the pass that found it and again at assembly. SportsRecruits and MaxPreps findings were read several
  times by one reader, not by a second.

**Round of 2026-11-14.** The WCAL and WBAL joined the build on 2026-11-14 (19 schools, 307 varsity rows, 92 JV rows
on MaxPreps), and the first round's name searches had stopped early. The same rules, run again by separate passes,
then assembled onto the first round's files (each new tie or profile says it is from this round):

- **Hudl**, as above, for the 19 schools: 18 matched (Notre Dame San Jose not found); 41 girls' volleyball teams at
  16 schools, 77 team-season rosters, 59 with members. Eastside's only Hudl teams are boys' basketball, Presentation
  has none, and Harker's girls rosters hold classes of 2021 to 2027 only. 257 rows matched a roster member; 208
  public pages, each fetched in two separate passes with identical parsed records; 206 kept, 2 ruled out by class
  year, 52 matches private. A name that is a nickname or another spelling (Momo for Momoko, Chin for Chinn,
  Tuipulotu for Tuipolotu) is kept when school and class year agree, and its note says so. A row matched to two
  Hudl accounts keeps the one with the later team entry.
- **NCSA through a headless browser.** NCSA's pages now load only in a browser; headless Chromium read them, one
  page every 2.5 to 4 s, no login. Two findings changed the method: a school page's "Select an athlete" list gives
  each listed athlete's exact address (`…/caitlin-brown27`), so addresses need not be guessed; but the lists are
  incomplete, and the athlete slug is global (any city/school path ending in it redirects to that athlete's own
  page, whatever the sport or state). So every named varsity and JV row at all 60 schools was also looked up by
  name: `<first-last>`, suffixes 1 and 2, and 3 to 6 only where an earlier address was someone else's. 3,377 page
  loads, no block. 89 pages kept (two runs agreeing on each; four with a name spelled differently, two ungraded
  rows on the school alone), 11 of them in another sport; 15 not linked (10 name another school, one a Live Oak
  High School in Live Oak, CA, four a class year that disagrees). The club ties come from the dated "Club
  Information" lines, as before. `hometown` is not read from NCSA: its header gives the school's city.
- **SportsRecruits** probe, as above, for the 379 named WCAL and WBAL rows (hyphen to underscore or dropped, joined
  multi-word surnames, middle names dropped): 1,747 addresses, 465 live pages, each read through the page's own
  JSON call; 45 kept for 42 players (41 name the school with its city; two rest on rule (b), Menlo Park for Menlo
  and San Carlos for Notre Dame Belmont; two keep a school whose city is misspelled or a neighbouring one). A school
  name shared by schools elsewhere (Notre Dame, Saint Francis, St. Ignatius, Valley Christian, Presentation, Mercy,
  King's Academy, Pinewood) counts only with the city. 133 live pages state a class year that disagrees.
- **MaxPreps career pages** for the 307 rows, as above: 53 claimed.
- **Prep Dig and PrepVolleyball** for every named junior, senior and ungraded row at all 60 schools, and every
  WCAL and WBAL row: Prep Dig's 19 team pages (slugs guessed, city checked in the title; `notre-dame-2` is
  Belmont's, `valley-christian-1` San Jose's, `saint-francis` Mountain View's), its player pages (`-2`, `-3` while
  the page was someone else's), and its WordPress search as a finder only (the record carries contact data that
  was not stored; every quote is from the HTML page). PrepVolleyball's player search
  (`prepvolleyball.com/player-search?field_address_administrative_area=CA&combine=<name>`) needs no login. A Prep
  Dig page whose club link goes to a Vision club in another state is not used as a club source.
- **Club records.** Absolute (San Rafael; the site answered on 2026-11-14), Club 415, Rage Westside, SF Juniors and
  Kamikaze were written from their own sites. Apex and Frisco Bay still have none.
- **College releases**, from the NCAA directory's member list for women's volleyball and beach volleyball
  (`web3.ncaa.org/directory/api/directory/memberList?type=12&division=<I|II|III>&sportCode=WVB`, each program's
  `athleticWebUrl`; D1 348, D2 288, D3 415) plus 14 West Coast NAIA sites: about 890 feeds read from 2026-11-11 on.
  72 sites answered with a bot check (Incapsula) and were not read, among them Cal, UC Irvine, UC Riverside, Nevada
  and Tulane; six volleyball signing releases were listed but not opened for that reason (Bowling Green, Florida,
  Montana, Nevada, Southeast Missouri, Syracuse). No release named a rostered player. The college records added
  (Stanford, UC Irvine, Nevada, UC Riverside, Portland) cite the NCAA directory or the college's own Sidearm page
  metadata for division and conference.
- **News**, for the 19 schools: student papers found for 7 (Harker's Aquila and Harker News, Menlo's Coat of Arms,
  Castilleja's Counterpoint, Saint Francis's Lancer, Mitty's Monarch, Crystal Springs' Gryphon Gazette), Sacred
  Heart Prep's PDF issues, Saint Francis's athletics feed, schools' college-athletes pages, Palo Alto Online, The
  Almanac, the Mountain View Voice, Cal-Hi Sports and Bay Preps Insider. The other schools' news lists are drawn by
  script and gave no stories; the San Mateo Daily Journal (403), Los Altos Town Crier and SF Examiner (429) were not
  read.
- **Web search** by name: every senior at the 60 schools, 40 of the 271 juniors, no ungraded row; one standard
  query per player. Nothing rests on a search result alone.
- **The commitment round of 2026-11-25** covered all four builds and is described in §1.15. For volleyball it found
  Sophia Giles (The King's Academy) signed with Santa Clara in softball, from Santa Clara's own release of 2026-11-11
  ("Sophie Giles … The King's Academy", with her All-WBAL volleyball season); the 2026-11-22 round's exact-name match
  had missed the nickname. Prep Dig, PrepVolleyball, Vision and the other 35 club sites gave nothing new.
- **The commitment round of 2026-11-22**, over the 876 varsity rows and 473 JV players of all 60 schools, in five
  passes, every finding re-read at assembly. Sites that refuse a plain request were read in headless Chromium under
  its ordinary identity where it was shown the page (no CAPTCHA, login or paywall passed). *Found:* Stella Broshear
  (Mitty, class of 2028) to Loyola Marymount in beach volleyball, medium: Vision's College Bound page lists "Stella
  Broshear 16G, OH 5'10" LMU (Beach)" under its class of 2028 and names no school, and Prep Dig's page
  (`/player/regina-stella-broshear/`, missed by the `<first-last>` probe and found through Prep Dig's own search)
  ties her name, class and Vision to Archbishop Mitty; no one page states it all, so it rests on the name, the
  class and the club she is already tied to, as field hockey's club-table matches do. Eileen Pfeffer is `signed`:
  Nevada's release of 2026-11-11 ("Nevada Volleyball announces 2026 national signing day class") names her with
  Saint Ignatius College Preparatory. New sources: the Mercury News' story of 2026-11-07 for Chayse Courtney (its
  deck, "Stanford-bound junior star", and a photo caption naming her; the body is subscribers' text and is not
  quoted, nor the headline, which the page's address repeats and `assert:copy` would read as a leak), Vision's lines
  for Maura Hambly and Aanya Hotha. *College releases:* 1,070 athletics sites (356 Division I, 265 Division II, 431
  Division III, 18 NAIA), 950 with a parsable feed, 13,739 stories of Nov 10 to 22 opened and matched, 1,009 with
  signing titles, 139 of the 141 women's and beach volleyball signing releases opened. Cal's and Nevada's name
  their players; Penn, Cal Poly (indoor; its beach release of Nov 16 names five others), Hamilton, UC Riverside and
  Portland had posted none; no posted release omits a listed player. 76 sites refused and were not read; Santa
  Clara's answered a bot check after eight pages, so its volleyball signing story of Nov 11, its beach volleyball
  story of Nov 16 and its other sports' signing stories went unread. *Lists:* Prep Dig's California list (163
  rows, one new since Nov 13), team pages for 58 schools (none for Lincoln or Notre Dame San Jose), player pages
  probed for all 589 class-of-2027, class-of-2028 and ungraded varsity rows (132 live, 50 naming the school), 893
  posts since Oct 15; PrepVolleyball's master list (836 rows) and California database (1,050 players, 177
  committed); 36 of the 37 clubs' sites (seven through the browser), SportsRecruits' `/committed/<org>` lists for
  four clubs (first rows only); the Prep Network's softball, basketball, soccer and lacrosse lists, TopDrawerSoccer,
  MileSplit, ADVNC; the 83 linked NCSA pages of seniors, juniors and ungraded rows, in the browser (no commitment
  shown). All 17 Prep Dig, PrepVolleyball and Vision quotes in the file are still on their pages. *News:* 2,838
  posts on 29 student-paper sites (1,944 since Aug 1; new this round, The Catalyst at Notre Dame Belmont and The
  Halo Tribune at Santa Teresa), 3,887 posts of Nov 1 to 22 on 12 local sites (the Mercury News, the Embarcadero
  papers, the Los Gatan, the Gilroy Dispatch, the Morgan Hill Times and others), the Town Crier, the San Mateo
  Daily Journal and the SF Examiner by search, the 19 WCAL and WBAL schools' news and athletics pages and 35 of the
  41 public schools' home pages. The signing posts found name no rostered player (Saint Francis, Nov 12: 8 names;
  Menlo: 3; King's Academy: 1; St. Ignatius' recognition list of 19 seniors, with no volleyball player, so nothing
  there says Pfeffer signed or did not). *Web search:* 60, one each for class-of-2028 varsity players at 17 schools
  (Mitty 5, Saint Francis 5, St. Ignatius 11, Valley Christian 3, Sacred Heart Prep 5, Menlo 3, Palo Alto 5, Los
  Gatos 7, Los Altos 4, Mountain View 4, Christopher 2 and one each at six more), 12 by the list pass and 11 by the
  college pass; none found a commitment. Site searches by name: Palo Alto Online for 126 juniors and seniors at 13
  schools, the San Mateo Daily Journal for 86 at 9. *SportsRecruits:* all 94 linked profiles read twice (two show a
  commitment, both in the file); an address probe for all 512 class-of-2027 and class-of-2028 varsity and JV rows
  with no linked profile (2,673 addresses, 619 live, 23 with a commitment: 22 of older classes and one Pennsylvania
  namesake); the commits feed for program ids 1 to 112, 454 to 474 and 1,045 to 3,700 (ids 6 to 453 were read on
  2026-11-13 and 2026-11-14; 475 to 1,044 never for this build). *Not read:* the 76 college sites; subscribers' text at the
  Mercury News and the Chronicle; sfhs.com, sandsantacruz.com, STEPS Lacrosse and SwimCloud (a challenge in the
  browser too); The Bear Witness (no answer); 31 NCSA pages of freshmen and sophomores; Instagram. No student paper
  was found for 32 schools, and 208 juniors not in the file got no web search of their own.
- **Checking.** Every new profile, club source and commitment source was fetched again at assembly by a script
  separate from the passes: Hudl through `window.__hudlEmbed`, MaxPreps for the claimed flag, SportsRecruits for
  title and description, quotes piece by piece; NCSA pages re-read by headless Chromium. All agreed, except
  where a page spells the name another way (Chin, Tuipulotu, Thornton, which the notes already say; Dalessandro without its apostrophe).

### 1.12 HUDL TV BROADCASTS — schools' livestreams on Hudl's fan site (`data/field-hockey/hudl-streams.json`)

Links, not a source: no score, time or venue is read from Hudl. MaxPreps' schedule rows carry a game's NFHS
Network stream and GoFan tickets (§1.1 (b), `nfhsStreamUrl`, `goFanUrl`) but never a Hudl broadcast, and many
schools stream on Hudl TV instead. Researched on 2026-11-14 for every school of the four builds (135 schools):
each school's page on fan.hudl.com was opened in a headless browser, as a fan browses it, and the data the
page loads was kept: the school's team list (sport, gender, level), every past livestream (the "All Past
Livestreams" list, read back past 2026-08-01; for a long list the newest ~225 already reach back past that
date) and its schedule month by month, November 2026 to March 2027, where an event Hudl will stream is marked
`Upcoming`; a scheduled event's broadcast was read by opening the event on that schedule. Hudl's GraphQL
endpoint was not called directly. Two schools are not on the fan site's search (James Lick, Notre Dame San Jose).

A broadcast is matched to a game by the school's varsity team in the game's sport, the Pacific date and the
opponent; the file's `notes` give the rules, and a record whose opponent Hudl names differently says so in its
`note` (`match: "likely"` where the broadcast names no opponent: a venue camera's "Field Recording", a "vs EAL"
title, or Santa Clara v Mitty, dated a day off). One link per game, the home school's broadcast first. `url`
is the broadcast's watch page, `…/watch?b=` + base64 of `Broadcast<id>`: the live stream, then the replay.
`access` is Hudl's `requireLogin` (`no` free, `ppv` paid). A game with no record had no Hudl broadcast on a
covered school's page that day; an outside school's stream, or one scheduled later, is not in the file.

The file is research, written by a script run by hand (its `builtBy`); the data jobs do not rewrite it.
`lib/streams/hudl-streams.ts` validates it at import and lays each link on its game's `urls.hudl` where the site
reads the snapshot (`lib/data.ts`), so a data refresh keeps the links and the stored snapshot stays MaxPreps'.

### 1.13 LAST SEASON'S COMMITMENTS — soccer and basketball (`data/<sport>/prior-commits.json`)

Research by hand on 2026-11-18, for the 2025-26 varsity juniors and sophomores of the soccer and basketball
builds' 41 registry teams each. No page reads the files, which stay as this research's record: on 2026-11-21 the four
soccer players on a 2026-27 roster (Park, Bock, Cain, Neschleba) were copied into `data/soccer/commits.json`, which
the pages read, and the other four are on no 2026-27 roster (README, "Soccer and basketball: last season's
commitments"; §1.15).

- **Who was searched.** The registry's 2025-26 stints (MaxPreps stat sheets and all-league lists) plus each team's
  MaxPreps 2025-26 roster page (`<team URL>/25-26/roster/`), read once that day to list the players: girls soccer
  198 juniors and 166 sophomores, boys basketball 216 juniors, 64 sophomores and 7 ungraded Gunn rows. The roster
  pages were a research input only and are not stored; MaxPreps' edge answered some reads with 403 and the reads
  were retried slowly.
- **Name searches**: at least one web search per row, with the school, city or sport, by research agents working
  in batches; 35 soccer juniors got none after the session's web-search budget ran out.
- **Lists read whole**: TopDrawerSoccer's California girls commitment search for the classes of 2027 (221) and
  2028 (128), matched by name against every soccer row, then each match's profile and its college's commitments
  table; SoccerWire's monthly commitment lists (June to November 2026); Prep Hoops' NorCal commitments page (2023,
  no match). Prep Hoops' and Cal-Hi Sports' 2027 and 2028 basketball lists are behind a paywall.
- **Checked**: each kept quote against its page as served (curl) or rendered (headless Chromium, for PrepSoccer's
  and TopDrawerSoccer's script-filled pages); colleges' divisions and conferences from the NCAA directory's 2026-27
  women's soccer member lists; Santa Clara's signing release of 2026-11-12; Hawaii's and UC San Diego's women's
  soccer news feeds (no signing release naming a player here).
- **Refused or not reached**: calbears.com (Cal's signing release of 2026-11-12), Illinois' news feed, and every
  community college's PrestoSports site (West Valley, De Anza, San Jose City, Mission, Evergreen Valley, Gavilan);
  Foothill's site did not answer.
- **Rejected**: same-name players at other schools; TopDrawerSoccer rows with no high school and no hometown;
  "plans to play in college" without a college; a player's own social-media post; and the seniors the searches
  turned up, which are out of scope.

### 1.14 PRIMARY (the VAL build only) — the league's own TeamSideline site (`valleyal.org`)

The `val-soccer` build (the Valley Athletic League's middle school girls soccer, `SCVAL_SPORT=val-soccer`) reads no
MaxPreps data: MaxPreps carries none of the league's eleven middle schools (a school page such as
`maxpreps.com/ca/cupertino/cupertino-bears/` answers 404, 2026-11-21). Its primary source (`lib/sports/shape.ts`
`PrimarySourceId` 'teamsideline'; `lib/pipeline/primary.ts`) is the league's own site, valleyal.org, which runs on
TeamSideline and publishes one schedule page a program and level:

- `https://valleyal.org/schedule/731407/0/1/7th8th-grade` — girls soccer 2026-27, 7th/8th grade: the site's tables,
  schedule and playoffs (`lib/pipeline/steps/teamsideline.ts`, resource `teamsideline-schedule` level `main`).
- `https://valleyal.org/schedule/731408/0/1/6th7th-grade` — girls soccer 2026-27, 6th/7th grade: the second level, on
  the /jv pages (`scripts/fetch-jv.ts`, level `second`).

Each page is ASP.NET server HTML holding everything: the heading ("Girls' Soccer 26-27") and level ("7th/8th Grade"),
the league's standings grid (Place, Team, W, L, T, GB, GP, PCT, Streak, PTS), every regular-season game (day and month,
time, home and away team, each side's score once entered with the winner in bold, the field with a map link, and any
comment row such as "Moved to 1/13."), and the playoff schedule (Playoff Round 1-3, game labels G1-G5, seats such as
"4th" and "G1 Winner"). The grids are drawn twice, once for wide screens and once (`Mobile…`) for phones; the parser
(`lib/sources/teamsideline.ts`) reads the wide copy only, by the grids' own control ids. robots.txt allows every path.

What 2026-27 holds (read 2026-11-21): each level is a single round robin of the eleven schools, 55 games, ten a team,
Mon Dec 14 to Thu Jan 28, 4:00 PM on the home school's field; the two levels play the same pairs on the same days, each
with the other school at home (55 of 55). The playoffs are six teams: G1 4th v 5th and G2 3rd v 6th Mon Feb 1, G3 1st v
the G1 winner and G4 2nd v the G2 winner Tue Feb 2, G5 the final Thu Feb 4, every field "TBD". The league's rules are its
Girls Soccer rules page (`valleyal.org/content/8308/Girls-Soccer`), cited in `lib/league-config/val-soccer/val.ts`.

Budget: two requests a run (one a level), twice a day in season, with the site's polite User-Agent. A page that cannot
be read keeps the previous snapshot (the league freezes and, with one league, the run aborts); a page whose heading or
level is not the configured one is never read as it.

### 1.15 WINTER RECRUITING — girls soccer and boys basketball (`data/soccer/*.json`, `data/basketball/*.json`)

Research by hand on 2026-11-21 (the SportsRecruits probe ran past midnight UTC) for the two winter builds, over the
rosters MaxPreps had posted that day: girls soccer 32 of 82 teams (634 varsity rows, 704 JV rows), boys basketball
58 of 79 (782 varsity rows, 279 JV rows); many rows had no grade yet. The rules are §1.11's: those of §1.1j
(profiles), §1.1j2 (clubs) and §1.1j3 (commitments), with rule (b) asking for the roster's class year plus a hometown
in the school's own area. Each pass (Hudl, NCSA, SportsRecruits, MaxPreps, clubs, commitments; one set per sport,
the Hudl, NCSA and SportsRecruits passes each one run over both builds' rows) wrote its findings apart; one
assembler per sport built the files from them with a second read, and they are kept by hand from now on. README,
"Girls soccer and boys basketball: recruiting", has the counts.

- **Hudl** (the public GraphQL endpoint of §1.11, then `hudl.com/profile/<id>` read from `window.__hudlEmbed`; one
  request at a time, about 1 a second, no 403 or 429). The 70 schools with a roster in either sport were looked up.
  Soccer: 34 of the 35 schools with a soccer roster found (Notre Dame San Jose not: Hudl has Notre Dame High Schools
  in Belmont, Sherman Oaks and Riverside only); 51 girls soccer teams, 93 team-season rosters, 1,827 member rows
  (1,433 with a public profile); Homestead, Cupertino, Milpitas, Prospect and Terra Nova have no girls soccer team on
  Hudl and nine schools only empty rosters. Basketball: 57 of 58 found (Westmoor not); 139 boys basketball teams, 272
  team-season rosters, 7,641 member rows (6,994 public); Homestead, Cupertino and El Camino have no boys team there,
  and Monta Vista, Mt. Pleasant and Yerba Buena only empty rosters. Hand picks for namesakes: Los Altos, Mercy
  Burlingame, Serra (San Mateo), Sacred Heart Cathedral, St. Ignatius, King's Academy (Sunnyvale), Pinewood (filed
  under Los Altos) and Lynbrook (filed under Sunnyvale). A page is kept when its own team list has the school's team
  in the build's sport and its class year, when shown, is the roster's; a nickname or other spelling only when both
  agree. 867 public pages read for both builds; four redirect to fan.hudl.com and could not be read (all basketball
  matches). 79 soccer and 67 basketball matches are private. Every kept page was fetched a second time in a separate
  run (610 pages for both builds) and reduced to the same record: none disagreed. Club ties come from the page's
  team list as in §1.11 (Hudl's "AmFb Combine" entry, an event in Lincoln, Nebraska, is not a club).
- **NCSA** (`ncsasports.org/womens-soccer-recruiting/california/<city>/<school-slug>`,
  `/mens-basketball-recruiting/...`). On 2026-11-21 plain curl with a generic browser User-Agent got the
  server-rendered pages (HTTP 200), so no headless browser was needed (on 2026-11-14 one was); one request at a
  time, 2.5 to 3.2 s apart, no block. The athlete slug is global (§1.11), so every name lookup used one fixed path,
  `…/california/palo-alto/x/<first-last>[N]`, and recorded the address it redirected to. 3,621 athlete-address
  loads for both builds (866 live, 2,754 HTTP 404, 1 HTTP 410), about 49 city pages, about 100 school pages, and 170
  second reads of kept pages; 55 soccer and 71 basketball names from the schools' "Select an athlete" lists loaded at
  their exact addresses. Every varsity row's bare address was tried, then suffixes 1 and 2 (3 to 6 only where an
  earlier address was someone else's). The suffix-2 shortcut: from the 61st name on, suffix 2 was not tried where
  the bare address and suffix 1 were both missing (202 soccer and 503 basketball names); in the first 60 names, 9 of
  about 160 such names had a suffix page with no bare one. JV rows were looked up only as time allowed: 305 of 704
  in soccer, 62 of 279 in basketball. Kept when the page names the school with its city and a sport and its class
  year is the roster's (a row with no grade on the school alone); both loads agree on every field used. Club ties
  from the dated "Club Information" lines; KOPA basketball lines left out (not shown to be a travel program). No
  kept page states a commitment.
- **SportsRecruits** (`my.sportsrecruits.com/athlete/<first>_<last>[N]`). One probe for both builds, 2026-11-22
  00:32 to 02:34 UTC: the bare slug and suffixes 2 to 4, continuing while any of the last three answered, to at
  most 30 (suffix 1 not probed); hyphen, multi-word and nickname variants; about 1.3 requests a second, no 429, 403 or
  5xx. 10,736 addresses, 1,676 live pages (soccer rows 5,572 addresses and 815 pages, 222 of them soccer; basketball
  rows 5,164 and 855, 41 of them basketball). Each live page read through the JSON call the page makes (§1.11); every
  page passing the rule read three more times in separate runs, all agreeing. No page was opened in a browser and
  there was no second reader beyond the repeated reads. 356 soccer and 576 basketball row-page pairs were refused on
  a class year that disagrees. A commitment is the page's "Committed to …" value, dated by the profile entry.
- **MaxPreps career pages.** Each varsity row's `careerUrl` read once (1.3 s apart, no 403 or 429), then the `/bio/`
  page of each claimed or club-listing row; a second run re-read those and kept only what agreed. Soccer: 634 of 634
  read, 112 claimed (all linked), 31 bio pages with a club entry.
  Basketball: 772 of 782 read; Burlingame's 10 career addresses
  redirect to MaxPreps' "Inactive Careers" support article. 253 claimed on the first read (251 linked), 20 bio
  pages with a club entry. `careerCollegeInterestsData` is not a commitment and was not kept.
- **PrepSoccer, TopDrawerSoccer, SoccerWire** (soccer). Scouting and news sites, not the players' own pages: never
  linked as profiles, used as club-tie and commitment sources. PrepSoccer player pages
  (`prepsoccer.com/player/<first-last>[-N]/`) for the 634 varsity rows: 752 addresses, 63 live; a page counts only
  when its school link resolves to a team page in the right city (`team/ca/los-altos` is Hacienda Heights' Los Altos,
  ours `los-altos-1`; `mountain-view` is El Monte's; `central-catholic` Modesto's). TopDrawerSoccer's club-player
  search for all 634 rows (38 with matches, 35 profiles read; "High School" without a city) and its California girls
  commitment search for the classes of 2027 (225) and 2028 (128; 2029 and 2030 empty), matched against all 1,338
  rows. SoccerWire's commitment tracker (2027: 672, 116 in California; 2028: 244, 54). PrepSoccer's California list
  (167 rows), 1,704 posts since 2025-11-01 and 12 player pages. Pages drawn by script were read rendered in headless
  Chromium.
- **Prep Hoops, Prep Redzone, On3** (basketball). Not profiles, for the same reason; club-tie, commitment and
  stale-grade sources. Prep Hoops player pages (`prephoops.com/player/<first-last>[-N]/`) for every varsity row:
  1,036 addresses, 235 pages, 88 at our schools, 31 naming a club ("<Surname> attends <school> in Northern
  California and plays club basketball for <club>"); the commitments pass tried 1,238 Prep Hoops and 1,245 Prep
  Redzone addresses over all 1,061 rows (97 and 8 at the roster's school). The school is a link to a team page whose
  title gives the city, and that link decides: 304 team addresses tried, 71 answered, and the namesakes found
  include `los-altos` (Hacienda Heights), `junipero-serra` and its variants (Gardena: five Serra players' pages say
  "Junipero Serra-San Mateo" but link the Gardena team, and are not used), `valley-christian` (Cerritos),
  `st-francis` (San Luis Obispo), `fremont` (Oakland) and `el-camino` (Oceanside); King's Academy players' Prep
  Redzone pages link a King's Academy in Woodstock, Georgia. Prep Hoops' California article sitemap: 636 articles of
  2025-2026, 134 naming a rostered varsity player, whose evaluation cards repeat the profile (a second page, not an
  independent one); one article's 3SSB session roster dates the only current Prep Hoops tie. Prep Hoops'
  commitments list (`state=Northern+California`, 29 rows) and Prep Redzone's California list (the latest 200). On3's
  California class rankings, 2027 and 2028, basketball (38 and 25) and football (251 and 125). Prep Baseball
  Report's California commitments (319 rows, none ours). Article bodies on Prep Hoops and On3 are paywalled.
- **Club registries.** Soccer: the candidates were NorCal Premier's club directory (302 clubs, 73 in San Francisco,
  San Mateo, Santa Clara and Santa Cruz counties), Girls Academy's member lists and the Aspire directory, and Cal North
  District 2's list; about 270 club pages read, each record from the club's own site. Cal North District 1's list and
  ECNL's member list (drawn by script) were not read on 2026-11-21; ECNL membership is as each club's site says (the
  leagues' own team lists were read the next day: the next entry).
- **ECNL league rosters** (2026-11-22; `data/soccer/club-rosters.json`, `pnpm fetch-club-rosters`, README "Girls
  soccer: club rosters"). ECNL's schedule site is TotalGlobalSports' Athlete One: one public "event" per league and
  season, `https://app.athleteone.com/public/event/<id>/schedules-standings` (4267 ECNL Girls Northern Cal 2026-27,
  4307 ECNL RL Girls NorCal 2026-27; NorCal Premier's ECNL Regional League page links the second, and theecnl.com's
  own widget for the first answered nothing that day; 4300 ECNL RL Girls Golden State 2026-27, added 2026-11-24, see
  the next entry). The page loads its data from `api.athleteone.com/api/…`,
  which answers the loaded page only (403 to a plain request, with or without a browser's user agent), so the
  script reads it through the page in a local Chromium: `Event/get-event-schedule-or-standings-athleteone/<event>`
  (divisions and flights), `Event/get-standings-by-div-and-flight/<division>/<flight>/<event>` (the teams) and
  `Event/get-individual-event-team-info/<event>/<team>` (the team page: `teamStandingInfo`, `playerList` with first
  and last name, position, `gradYear`, `playerType` and `hideFromPublicTeamRoster`, and a staff list the script
  never keeps). About 210 requests, 0.3 s apart. The team page prints the roster under its Roster button as name,
  position, label and number; the class year is in the data only. 199 teams, 3,255 players of high school age kept,
  833 younger left out, none hidden; 3 teams showed no player. Compared with all 634 varsity and 415 other JV rows
  by `pnpm compare-club-rosters`: 157 rows share a name with a roster row, 94 pass the league-roster rule, and 96
  ties in `clubs.json` cite a roster (kind `league-roster`; two more by hand, each resting on another page too). A
  second script opened the 34 team pages involved, pressed Roster and matched every cited row on the dialog as
  displayed. Club sites post no
  girls' rosters and their commitment lists name no school. Basketball: no directory lists the boys' travel programs
  of any area (the Nike EYBL team list is an image, the Puma Pro16 address redirects to a script-drawn page,
  `madehoops.com` answers 403, `jamonit.com` an empty page); only the adidas 3SSB program directory was read whole.
  Records were written from the clubs' own sites, found by guessing about 100 hosts and by name searches;
  `baycitybasketball.com`'s Cloudflare check refuses a bare client with 403 and answers a browser's headers.
  Same-named clubs
  elsewhere were ruled out by reading them (Splash City is a Minnesota podcast; West Coast Elite a Los Angeles
  program; `norcalwildcats.com` is Davis'). A club named with no site or city found has no record, so its ties are
  not shown (`clubs.json`'s notes list them).
- **ECNL RL Golden State** (2026-11-24). The ECNL Regional League runs a second Northern California girls conference,
  Golden State, for the second teams of the ECNL Northern Cal clubs (De Anza Force's "About ECNL RL Golden State"
  page; leaguetables.soccer's 2026-27 conference list). Ties in `clubs.json` already named these teams ("09G
  ECNL-RL" at De Anza Force, MVLA's and Bay Area Surf's RL teams) with no roster behind them. No public page links
  its Athlete One event: theecnl.com's Regional League standings widget draws nothing in a headless browser, and the
  clubs' pages link none. With the owner's approval the event names of 4250-4300 were read, one request 0.3 s apart
  through the public page (`team/get-event-details-by-eventID/<id>`), stopping at 4300 "ECNL RL Girls Golden State
  2026-27"; the owner confirmed the id. Read the same way as the other two: 57 teams of the 12 ECNL clubs (Santa Rosa
  United GU14-16 only, California Odyssey GU14-17), 1,167 players of high school age kept, 322 younger left out.
  The other two leagues, re-read the same day, had lost one player and gained one class year. `pnpm
  compare-club-rosters` then listed 38 varsity rows the copy matches and `clubs.json` does not cite (33 new ties,
  5 ties another page had made), at MVLA, Bay Area Surf and De Anza Force; all 38 linked the same day (`clubs.json`
  notes), after a second script found each of the 40 cited rows on its team page's Roster dialog as displayed.
- **Hudl club team rosters** (2026-11-26; README "Girls soccer: club rosters"). A club's Hudl organization lists its
  teams (`teamHeadersForSchool`), each team its seasons (`teamHeader{seasons}`) and each season its roster (`roster`
  with the team's and the season's ids), through the public GraphQL endpoint of §1.11; the roster page
  (`fan.hudl.com/…/team/<id>/<slug>/roster`) shows the same rows, with a "Season 2026-2027" heading, a position, a
  jersey and often a "Class of". Organizations were found with `fanSearch` (types ORGANIZATION and CLUB) under each
  club's name, one request a second, no 403 or 429. Of the 53 clubs with a record and the eight GA Northwest clubs,
  Almaden FC (GA U13-U18) and OV Toros FC (U8-U15) keep rosters there that hold tracked players; the ECNL clubs' current
  Hudl teams are empty but for one. A team's GotSport Rankings roster, where the same team has one, shows only the
  players linked to it on GotSport and everyone it has carried, so the Hudl roster replaces it (`supersededBy`).
  GotSport Rankings' own search is an open API (`system.gotsport.com/api/v1/team_ranking_data`, with
  `search[team_country]`, `search[age]`, `search[gender]` and `search[team_or_club_name]`), and a team's rows are
  `api/v1/teams/<team_id>/members?role=player&public=true`, what the roster page loads.
- **Monterey Surf Soccer Club** (2026-11-26; README "Girls soccer: club rosters"). `montereysurf.com` (a Byga site)
  answers a plain request; it has no team or roster pages, only a Coaches page that lists the teams by age group and
  league, and a home page feed of the club's social media posts (no source for a club tie; cited in `commits.json` as the club's
  own commitment announcements, §1.15). Its GotSport club id is 13007: the
  N1 League's and the Fall League's club pages (`system.gotsport.com/org_event/events/54043/clubs/13007`,
  `…/54541/clubs/13007`) answer a plain request and list its teams; `team_ranking_data` under "Monterey Surf",
  Female, ages 13 to 19, finds five teams (N1 G2013/14, ECNL RL G2012/13, N1 G2010/11, G2009/10 and G2008/09) and no
  U15 or U18 team, nor the Fall League's U16G Academy I. The three N1 rosters of high school age were read from the
  `members` endpoint and again on `rankings.gotsport.com/teams/<id>/roster` in headless Chromium: 25, 9 and 4 rows,
  the same rows both ways. The three Athlete One ECNL events, every girls division's standings read through the page
  (18 requests), hold one Monterey Surf team (ECNL RL G2012/13, club 4178). On Hudl, `fanSearch` finds the club only
  with type CLUB (the result's `club` field; organization 190053): five girls ECNL RL teams, seasons 2025 and 2026,
  every roster empty. 13 GotSport API requests, 9 Hudl requests, 9 page reads, one a second, no 403 or 429.
- **The NorCal Premier club audit** (2026-11-26; README "Girls soccer: club rosters", "The clubs an audit found").
  The two events' club lists (`system.gotsport.com/org_event/events/54043/clubs` and `/54541/clubs`) answer a plain
  request, as each club page does; a club page names the club's website. A Rankings team is the event team when the
  club is the same and the name is (the event's name is the club's name and the Rankings team's; some Rankings names
  repeat the club's: "JSC 2011/12G White", "San Carlos United SC 12/13G Blue", "2009 SENTINELS GIRLS"). 90 rosters
  kept from `api/v1/teams/<id>/members?role=player&public=true` (1.2 s apart) and re-read on
  `rankings.gotsport.com/teams/<id>/roster`: one headless Chromium driven over DevTools, a page at a time, waiting
  for the table to hold still, about 25 s a page (the first nine with a fresh Chromium each, slower); 10 pages that
  never drew were read again, four of them with a fresh Chromium. Every page showed the rows the API gave, under the team's name as its heading. Club sites
  read for the new records: `hollistertremors.org`, `nvysl.net`, `siliconvalleyeagles.com`, `smcfootball.club` and
  `pleasantonrage.org` answer a plain request; `pacificaunited.org` is drawn by script (Sprocket Sports) and was read
  in Chromium. `prepsoccer.com` player and program pages are server-rendered. Surf Nation's announcement of April 3,
  2026 (`surfsoccernation.com`) places South Valley Surf in Bakersfield. Not read: Cal North's leagues, DPL, GA
  Aspire, NorCal's State Cup, and the sites of East San Jose FC (parked), Central Coast FC, Real Salinas, Lobitos
  and San Juan Bautista SC (none found).
- **College releases.** Soccer: 1,043 athletics hosts (the NCAA directory's women's soccer member lists, D1 349, D2
  261, D3 415, read through headless Chromium since the API answers curl with 403, and 19 NAIA sites), 947 with a
  feed that parsed: 12,387 stories listed, 6,237 opened (3,236 dated 2026-11-11 or later); one names a rostered
  player (Illinois' signing release of 2026-11-11); 96 hosts gave no feed. Basketball: 304 men's basketball news
  feeds (291 answered), 114 signing stories opened; only Oregon State's names a rostered player. The NCAA directory's
  API answered 403 to the basketball pass.
- **News.** Soccer: 12 student papers read whole and 8 local papers by their own search (15,706 posts); no student
  paper found for 20 of the 32 schools; the San Mateo Daily Journal, Los Altos Town Crier and Half Moon Bay Review not
  read. Basketball: the WordPress search of 29 student and local papers (2,957 posts), and the Saint Francis, Serra
  and Bellarmine athletics sites. The Campanile (Palo Alto) of 2026-11-06 is one of the stale-grade signs below.
- **Web search.** Rationed for the whole session, as in §1.11: the soccer commitments pass used 12 calls, basketball
  commitments 16, soccer clubs 1, basketball clubs 10 (the Hudl, NCSA, SportsRecruits and MaxPreps passes read
  addresses and endpoints directly). There was no name-by-name search of every row.
  Nothing rests on a search result alone.
- **Blocked or failing hosts.** 247Sports (a script shell), VerbalCommits (drawn by script), Perfect Game (403),
  SportsRecruits' organization pages, the NCAA directory API to plain requests (403), Prep Hoops' and On3's article
  bodies (paywall); `mvlasoccer.com`, `burlingamesoccer.org` and `sfeliteacademy.com` (no answer), `pasc.org` (401);
  the community colleges' sites were not read in basketball and not retried in soccer (§1.13: PrestoSports refused
  every read on 2026-11-18).
- **Grades that are last season's.** MaxPreps' 2026-27 rosters at several schools still carried the 2025-26 grades
  on 2026-11-21. The evidence: of the 187 basketball Hudl pages refused on class year, 183 state a class exactly one
  year earlier than the roster's, clustered at a few schools; Archbishop Mitty's roster has no grade-12 row, and
  four of its "juniors" are class of 2027 elsewhere; six Serra "seniors" are class of 2026 on Prep Hoops; The
  Campanile calls Palo Alto's Aadi Tripathi a senior where the roster says grade 11; 13 of the 14 Prep Hoops club
  players refused on class year were the same one-year gap; and `data/players.json` holds 7 Palo Alto and 9 Branham
  players with the same grade in their 2025-26 and 2026-27 varsity stints (Leland, for comparison, has 7 who moved
  up one). The owner decided on 2026-11-21 to accept these players. The rule (`lib/players/rosters-schema.ts`
  `RosterConflictSchema`, `lib/players/rosters.ts` `classYearAgrees`): a varsity row MaxPreps gives a grade may carry
  one grade conflict marked `rosterBehind`, with `other` exactly `kept` + 1 and a cited page (kind `hudl` for a
  hudl.com profile, `recruiting-profile` for NCSA or SportsRecruits, `scouting-site` for Prep Hoops, Prep Redzone,
  On3, PrepSoccer or TopDrawerSoccer, `news` for a paper); a profile, club-tie source or commitment source stating
  either class then passes. A record refused only for that one-year gap was accepted when the page itself names the
  right school (rule (a), the right city for a namesake; for Hudl, the profile's own team list has the school's
  team), and the assembler re-fetched each page and confirmed school, sport and class first. Never on rule (b), a
  two-year gap, a page a year later, a JV-list row, or a roster grade 12: 65 Hudl pages stating the class of 2026
  on grade-12 rows (last season's seniors still on MaxPreps' roster) were refused, as was a Serra senior's Cal State
  San Marcos commitment on a page of the class of 2026. Of the 183 Hudl pages, 107 were accepted, 65 refused on
  grade 12, 9 dropped as a second Hudl page for a player already linked, one on a JV-list row and one on a row that
  already had a page stating the roster's class. Result: 109 basketball rows (107 citing the Hudl profile, 2 an
  NCSA profile) and 2 soccer rows (one Hudl, one NCSA).
- **Checking.** A second reader at assembly, with scripts separate from the passes'. Soccer: 302 checks on 241
  URLs, every club-tie and commitment source (quotes on the page as served; Hudl and SportsRecruits through the data
  the page loads; script-drawn pages rendered in headless Chromium), both stale-grade pages, and samples of 40 of
  the 234 other kept Hudl and SportsRecruits pages and 15 of the 84 kept NCSA pages: no failure. Basketball: all 88
  club-tie and commitment quotes, every page let in by a grade conflict (116 Hudl pages, 21 NCSA, 9 Prep Hoops and
  the commitment lists), all 13 SportsRecruits pages twice, and samples of 40 kept Hudl and 15 kept NCSA pages: no
  failure. What was dropped at assembly is in each file's notes (second pages for a player, two soccer pages whose
  class disagrees, ties to clubs with no record).

- **Rows with no grade, 2026-11-25** (owner's decision that day: a row with no grade may take a page whose class year
  is any high school class this season, the school, a hometown in its own area or the club the player is tied to
  standing in for the grade; README "Girls soccer and boys basketball: recruiting"). The rows: 907 varsity and JV
  rows with no grade in soccer, basketball and volleyball. *Hudl:* each school found through the public GraphQL
  endpoint's `fanSearch` (a school in the right city whose name holds the roster's school name; a city alone matched
  KIPP San Jose Collegiate to San Jose High School, caught and refused), its teams in the sport through
  `teamHeadersForSchool`, the seasons of 2023 on through `teamHeader{seasons}`, and each season's `roster`; one request
  a second. 279 name matches (the same surname, and the same first name or one sharing its first three letters or a
  known short form), 47 not yet linked and public; each read from `hudl.com/profile/<id>` (`window.__hudlEmbed`) and
  kept when its own team list has the school's team in the sport, its class year is a high school class this season
  and agrees with any graded varsity row of the same player, and the player has no Hudl page linked already: 15.
  *SportsRecruits:* an address probe as 2026-11-22's (bare slug, suffixes 2 on while any of the last three answered,
  to 30; hyphen and multi-word variants; a page is live when its HTML carries `data-user-id`): 845 address stems,
  about 0.8 s apart from each of two workers, 466 live pages, each opened in headless Chromium and the
  `athlete-profile:basics` response the page itself loads kept (class year, city, state, ZIP, the high school, club
  and team entries with their organizations). 209 state a high school class; 7 kept, each read a second time in a
  separate run, agreeing. Refused: a hometown outside the school's area (most were Southern California and Central
  Valley namesakes), a state with no city, a class year that disagrees with a graded varsity row (Maya Onalfo,
  Milpitas: the page and her club roster say 2029, her grade 2028), a second page for a player linked already.
- **The PCAL and PSAL teams, 2026-11-25.** Added that day and never swept: 41 soccer and 54 basketball teams, 17 and
  39 of them with a roster (698 varsity and JV rows). The same two passes over every row, graded or not, under the
  2026-11-21 rules (rule (b) asking for the roster's class year plus a hometown in the school's own area) and the
  rows-with-no-grade rule above. *Hudl:* 459 name matches at the 13 schools Hudl lists teams for, 134 public and not
  linked, read; 111 kept, one page per player (the longest run on the school's team where a player has two or three
  accounts). 25 basketball rows (grades 9 to 11) take a `rosterBehind` grade conflict citing the page, under the
  2026-11-21 rule: the page is on the school's team and states the class exactly a year before MaxPreps' grade.
  Refused: 8 grade-12 rows whose page says 2026 (Soledad 3, Watsonville 5), two pages years off (a Watsonville
  senior's says 2030, a Thomas More freshman's 2025), a second account, and Sergun Serttunc (Pacific Grove; the page says "Sergen", on a stale grade too). *SportsRecruits:* 624 address
  stems not probed already, 444 live pages read as above; 4 kept, each read twice. *Not read:* NCSA (Cloudflare's
  403 to an automated read) and MaxPreps' career and roster pages (MaxPreps serves its 403 page here), so there is
  no NCSA or claimed-MaxPreps profile for these teams; SportsRecruits addresses that redirect (307) to another
  sport's subdomain were skipped.
- **The commitment round of 2026-11-25, all four builds** (field hockey, volleyball, soccer, basketball; §1.1j3 and
  §1.11 point here). Over each build's rosters as they stood that day: field hockey 1,775 varsity rows and 860 JV
  names, volleyball 876 and 473, soccer 876 and 815, basketball 1,212 and 320; the PCAL and PSAL soccer and
  basketball teams, added that day, had never had a commitment round. Seven passes, each on one source family, every
  kept page read twice and re-read at assembly; refusing sites read in headless Chromium, stopping at any challenge,
  login or paywall. *Rule change (owner, 2026-11-25: "club only leads are fine if they match the club"):* a page that ties
  a commitment to the player through her club alone (the club's own announcement, or a list or profile naming the
  club and not the school) counts when the roster row is already tied to that club in `clubs.json`; such commitments
  are medium. Monterey Surf's and MVLA's announcements are the clubs' own posts, shown on their own sites from their
  own accounts. Two colleges' levels come from their own news, not the page metadata, which is a season behind:
  Menlo College (NCAA Division II, CCAA, since 2026-27) and Azusa Pacific (moving to Division III and the SCIAC).
  *College releases:* 1,083 athletics hosts; classic Sidearm sites answer
  `/services/archives.ashx/stories?index=1&page_size=200&sport=0&season=0&search=` with their latest 200 stories of
  every sport (924 hosts answered); WMT sites (Stanford, SJSU, UCLA, SDSU and others) through `/sitemap.xml`. 8,036
  stories of Nov 9 to 25 opened on 635 hosts (2,288 dated Nov 20 or later; 1,395 signing releases from 320 hosts),
  matched against every build's rows, boys included, by exact name, school plus surname, and first-name prefix near a
  California mention. 62 of 70 hosts that refused curl rendered in Chromium; 8 did not (Cal Maritime, Willamette,
  Penn State Harrisburg, Delaware Valley, Colby, Elizabeth City State, Macalester's main site, St. Thomas Aquinas), and
  Harvard's story pages showed a bot check. Found: Sophia Giles (volleyball, The King's Academy) signed with Santa Clara
  in softball ("Sophie Giles", with the school, in Santa Clara's release of Nov 11).
  *SportsRecruits and linked profiles:* every linked SportsRecruits, MAX Field Hockey, FieldLevel and NCSA profile
  re-read for a commitment line; eleven field hockey players' own MAX pages and Kendall Gann's FieldLevel page cited
  (MAX answers curl with 403 and was read in Chromium); an address probe of rows new since the earlier probes linked
  two soccer pages (Mills). SportsRecruits' commits feed was then read whole, every program id from 1 to 2,270
  (64,254 records in the ids the 2026-11-22 round had skipped, 113 to 453 and 475 to 1,044; 24,188 re-read, 41 of
  them new since that round); the records carry no state, date or gender, so every record of the class of 2027 or
  later was matched by name against all four builds and each class-agreeing match opened (291 profiles). It found
  Sophia Giles' own softball page ("Sophie Giles", The King's Academy, "Committed to Santa Clara University on
  7/6/2026"), a second source for the commitment Santa Clara's release had given (added 2026-11-26, after the round's
  merge), and Kaia Gurdak's (Pacific Collegiate) to Carleton in soccer, a lead only, her school's rows being JV.
  Eight 502s were retried and read. Two linked pages are dead (Mission Vista's `lauren_bailey10`, Leland JV's
  `jenna_yiseer`).
  *Lists and clubs:* field hockey and volleyball as on 2026-11-22 (MAX's table, now 1,759 rows; FH College Path 2027
  348 and 2028 209; Prep Dig's California list 166; PrepVolleyball 837; all 36 volleyball and 27 field hockey club
  sites), with nothing new for a rostered player; two new MAX player pages linked as profiles (Grace Moniak,
  Huntington Beach; Arshpreet Ruprah, Fremont). Soccer: TopDrawerSoccer's California search (2027: 225, 2028: 128)
  and all-state search, 198 roundups and features from July 2025, SoccerWire's tracker, PrepSoccer's California list
  (168; the filter wants `?state=California`) and 1,736 posts, 113 pages on 33 club hosts; found Caelyn Dyer and
  Jasmine Vemuri (Notre Dame San Jose, roster new since 2026-11-21) and, under the club rule, Rebecca Iffla, Audrey
  Pfeiffer, Kenzie Willerer and Kaitlyn Gray, and Monterey Surf's three (Bailey Portillo, Samantha Torres, Sherlyn
  Farfan), tied once Monterey Surf's N1 rosters were kept. Basketball: Prep Hoops' commitment lists and 711 player
  pages, Prep Redzone's California list and 624 pages, On3/Rivals' California rankings and a by-name search of all
  1,483 names, Prep Baseball Report, Perfect Game and VerbalCommits (readable in a browser this time), TopDrawerSoccer
  and SoccerWire boys, Cal-Hi Sports (200 posts), SwimSwam (1,200 posts): no new commitment; VerbalCommits for
  Emmanuel Ahamefule and Prep Hoops' second page for Brady Clugage (now high).
  *News:* Bay Area and Monterey Bay: 65 WordPress hosts read whole for Aug 1 to Nov 25 (13,062 posts; 40 student and
  24 local papers, the first full read of the Pajaronian, BenitoLink, Free Lance, Rustler, Salinas Valley Tribune,
  Press Banner, Good Times, Gilroy Dispatch and Morgan Hill Times), headlines only at six paywalled papers, schools'
  own pages (Saint Francis' Nov 12 roundup read at last, in its print view); found Alina Decker (Menlo-Atherton) to
  Brandeis in track and field, medium because MaxPreps lists her as "Decker Alina", and the M-A Chronicle as a source
  for Juliana Pandolfo. Southern California and the EAL: 18 student-paper and athletics WordPress hosts for Nov 17 to
  25, local outlets, about 100 school and district pages; The Tower (Bishop's) for Lola Conway and Emerson Davis.
  *Not read:* the Salinas Californian (HTTP 402), Aragon Outlook, kehillah.org, Branham's Bear Witness, the OC
  Register's signing list (subscribers only), hw.com, sdprepinsider.com, scrippsranchnews.com; 247Sports (CAPTCHA),
  SwimCloud and Inside Lacrosse (Cloudflare), ESPN's recruiting database, FieldLevel's commitments page; Perfect Game's
  rows were checked by eye, not saved, and nothing from it is cited. Web search ran short of new pages: about 65 calls
  over the passes, almost none returning anything published in November 2026. Many winter rosters (soccer at Saint
  Francis, Carmel, Hollister, Monterey and Stevenson; basketball at Carmel, Monterey and King City) were still empty,
  so stories naming their players could not be matched; the passes' reports list such leads for when they post.

### 1.6 Rejected sources (one line each)

- MaxPreps statewide/league legacy scoreboard (`?leagueid=` silently ignored; grouped by CIF
  section, not league) — the researched replacement is §1.1(c) `contest-ids-grouped-by-date-by-context/v2`.
  The pipeline uses neither and reads each team's schedule feed.
- `team-standings/v1` — only a 3-row window; use `leagues/{id}/standings/v1`.
- `/ca/field-hockey/standings/`, `/ca/field-hockey/leagues/`, `/_next/data/{buildId}/…` — 404.
- SBLive league-scoped scoreboard — inherits the wrong league membership.
- SCVAL DigitalSports site (`78929.digitalsports.com`) — populated with nothing, all AJAX
  endpoints return empty state; SCVAL never used it for field hockey.
- CCS bracket pages (cifccs.org) — client-rendered, no server-side data at all. The bracket is read
  from MaxPreps' tournament page and the team feeds instead (§1.4).
- ArbiterLive — real API, but no valid entity id exists for any SCVAL school; carries no scores
  anyway.
- rSchoolToday / Monta Vista, newer Los Altos PlayOn build, assorted one-off school sites
  (Squarespace/Elementor/Finalsite with no feed).
- palyathletics.com schedule table — results column always blank; the ICS is strictly better.
- Palo Alto Online, Paly Voice, Prep2Prep, USA Field Hockey — no field-hockey content, editorial
  colour only, or out of scope.
- scval.com legacy HTML pages — years stale.
- MaxPreps' second PCAL table (the 0-team "Mission" sibling) — standings HTTP 400, no teams.
- Parsing BVAL's Google Docs live — the documents are Google Docs with no stable text export; the
  bundled transcription plus a hash check is the honest equivalent (§1.3a).


## 2. Verified constants for 2026-27

```ts
SEASON_YEAR        = "26-27"
SEASON_LABEL        = "Girls Varsity Field Hockey Fall 26-27"
SPORT_SEASON_ID      = "e302eb3e-1a32-4f2d-934b-6f9d454f721e"
ALL_SEASON_ID       = "bfacc9ec-145e-4659-ba7e-0824d163d5fc"
GENDER_SPORT       = "girls,fieldhockey"
TEAM_LEVEL         = "Varsity"
```

Defined once in `lib/sports/field-hockey.ts` (`FIELD_HOCKEY_GIRLS_2026`) and re-exported under these
names by `lib/season.ts`; re-asserted on every fetch run (§5), never hardcoded elsewhere (bar the
values `tests/sports.test.ts` pins). Everything that differs by league lives in `lib/league-config/`.

**Sections** (MaxPreps section ids, asserted against every league's metadata):

| Section | MaxPreps section id | Field hockey championship |
|---|---|---|
| `ccs` Central Coast Section | `d9a9ef9c-db12-4669-888b-40ac8462a575` | yes, 16 teams (SCVAL 7, BVAL 4, PCAL 2, 3 at-large) |
| `ncs` North Coast Section | `89ae2e0f-e108-4054-9df3-329f0579f86d` | none: the NCS and CIF hold no field hockey championship; MCAL's own six-team tournament is its postseason |
| `ns` Northern Section | `6249819d-12de-4bff-b0ab-38156006b001` | a Section-sanctioned, league-run Super Regional (top six EAL/SRL schools, Oct 30–31, site to be announced); no NorCal/State path |
| `ss` Southern Section | `8e11e7d4-d3fa-4e6f-827f-652c29439d27` | none: the CIF Southern Section holds no field hockey playoffs (Blue Book 2026-27 Bylaw 2011.1 and 3500.2) and CIF holds no state championship; last allowable contest Sat Oct 31 |
| `sds` San Diego Section | `bab8c451-e991-413d-93ac-ee77067952a3` | yes: Open 8, Division I 12, Division II 12, placed by the Section from its power rankings (Green Book 2026-27, Bylaw 2000.1), Nov 2–14, finals Nov 14 at La Jolla HS (round dates from the San Diego Field Hockey Officials Association's calendar) |

**The MaxPreps league tables** (one per division where MaxPreps has one; the id is what the cron
requests). Seven NorCal tables, then the eight SoCal divisions, seven of which have a table:

| League | Division | MaxPreps league id | MaxPreps table | Teams on MaxPreps / ours | Games a team | League play | What MaxPreps' table is trusted for |
|---|---|---|---|---|---|---|---|
| SCVAL | De Anza | `ea062dfe-9fb9-45c7-9839-0801993d6ac6` | Santa Clara Valley - De Anza | 7 / 7 | 12 | Sep 9 – Oct 28 | full cross-check |
| SCVAL | El Camino | `7bdfb2a7-8dde-4a21-88c9-832f1593554d` | Santa Clara Valley - El Camino | 8 / 8 | 14 | Sep 9 – Oct 28 | full cross-check |
| BVAL | Mt. Hamilton | `8ec791a6-463e-4313-86de-1bd02671054a` | Blossom Valley - Mount Hamilton | 6 / 6 | 10 | Sep 17 – Oct 30 | full cross-check |
| BVAL | Santa Teresa | `7c899b2d-07fa-4664-976c-a4f57d12eeec` | Blossom Valley - Santa Teresa | **5** / 6 | 10 | Sep 18 – Oct 30 | records only (Prospect is missing) |
| PCAL | PCAL (one division) | `50ac53cd-e46f-4df9-824b-5a954c583b95` | Pacific Coast - Gabilan (MaxPreps' internal table name) | 7 / 7 | 12 | Sep 2 – Oct 29 | informational only |
| MCAL | MCAL (one division) | `c15255d5-c2ad-49f5-9afb-cf4ba289875c` | Marin County | 9 / 9 | 16 | Aug 24 – Oct 22 | records only (MaxPreps orders by win pct) |
| EAL | EAL (one division) | `60959b47-b0cf-4d7d-b054-d8ea140870ef` | Eastern Athletic | **7** / 6 (the extra row is Red Bluff) | 10 | Aug 24 – Oct 28 | records only (MaxPreps orders by win pct) |
| Sunset | Sunset (one division) | `aa46adc4-c188-4e3b-b5fd-857064176297` | Sunset | **5** / 8 (the five Orange County schools are missing; Bonita and Chaminade are extra rows) | no fixed number in config (7: one league game a pair) | Sep 15 – Oct 31 | informational only |
| City | City Western | `35dc98fe-887a-475b-992c-0edfe7fc4c58` | City - Western | 6 / 6 | 10 | Sep 1 – Oct 30 | informational only |
| City | City Eastern | `6f9a29a0-78af-4d30-a087-cfa9feb91b89` | City - Eastern | 6 / 6 (Patrick Henry missing, Madison an extra 0-game row) | 10 | Sep 15 – Oct 30 | informational only |
| North County | Avocado | `75ed156b-09c9-4a0c-ac58-11a371443815` | Avocado | **4** / 6 (Mt. Carmel and Rancho Bernardo missing) | 10 | Sep 28 – Oct 30 | informational only |
| North County | Palomar | `e4a7e9c3-986b-446f-8547-8348be95e282` | Palomar | 7 / 7 | 12 | Sep 9 – Oct 30 | informational only |
| North County | Valley | none | MaxPreps publishes no table: its six schools have league id `0000…` | — / 6 | 10 | Sep 28 – Oct 30 | nothing: no table, so the cross-check is skipped |
| Metro | Metro Mesa | `6dfe5a12-b82f-45d7-b103-71a5c13c0093` | **Metro- South Bay** (MaxPreps' name, spelled so) | 5 / 5 | 8 | Sep 28 – Oct 30 | informational only |
| Metro | Metro South Bay | `ca8e2856-b13d-4aa7-8c15-37cb50a55c60` | **Grossmont** | **3** / 4 (Hilltop and Southwest missing, Santana an extra 0-game row) | 6 | Oct 7 – Oct 30 | informational only |

PCAL is one division on this site. MaxPreps' name for its table (the `Gabilan` in the row above)
is its own internal label, kept as data only; it is never shown anywhere on the site, which says
"PCAL". MaxPreps' other table in that league, "Pacific Coast - Mission"
(`6e1f97d4-5211-4d98-bf59-282cd754bc5c`), has no teams and answers its standings request with
HTTP 400; it is never configured and never requested.

The SoCal table names are MaxPreps' and are kept as data only. Two of them name the wrong thing:
MaxPreps' "Metro- South Bay" table holds the five Metro Mesa teams, and its "Grossmont" table holds
the Metro South Bay teams it lists (El Capitan, Granite Hills, and Santana, which has no varsity game).
The site says Metro Mesa and Metro South Bay, from the Section's 2026-27 League Alignment. For every
SoCal table the rule `maxprepsTeamCount + missing − extra = expectedTeams` holds (City Eastern
6 + 1 − 1, Metro South Bay 3 + 2 − 1, Sunset 5 + 5 − 2). The San Diego "Games a team" are a double
round robin, (teams − 1) × 2 [V: MaxPreps' schedules, 2026-10-06], with one pair short (§3.1); the
Sunset publishes no league schedule, so it has no fixed number in config (its teams play one league game a pair, seven each: docs/LEAGUE-RULES.md). Valley has no table, so it
makes no league-meta or standings request (never `/leagues/null/v1`) and its health says the
cross-check is skipped because "MaxPreps publishes no table for this division".

"Trusted for" is `reportedTrust` in the config and decides which MaxPreps columns the cross-check
compares: `full` = league record, overall record, league goals for and against, place and win pct;
`records-only` = league record, overall record, goals for and against; `informational` = league
record only. A division with a `knownCause` (below) shows the cause beside any difference instead
of an alarm.

**Known data gaps by league** (all published on `/about#health`):
- **SCVAL:** none beyond Wilcox (§3.2). MaxPreps' De Anza table lists 7 teams where the official
  grid lists 8; that is real.
- **BVAL:** MaxPreps' Santa Teresa table **leaves out Prospect** and counts four of Prospect's
  official league games as non-league, so its records differ from ours. The table here is computed
  from BVAL's official schedule.
- **PCAL:** MaxPreps is **missing some official league games** (on 2026-10-02, 8 of 42 fixtures
  have no MaxPreps contest) and dates others differently, so its PCAL records differ from ours.
  Some of those are the games si.com backfills (§5.2).
- **MCAL:** MaxPreps **orders the table by winning percentage** where MCAL orders by points, and
  after Oct 22 counts MCAL tournament games in its league records; ours never do.
- **EAL:** MaxPreps **orders the table by winning percentage** where the EAL decides its title on
  points and publishes no standings, so its places can differ from ours; its records and goals match ours
  (on 2026-10-04 every team's league W-L-T equals ours). The table also lists **Red Bluff**, a
  0-0-0 row with no games and a null `modifiedOn` (§3.2), which is the config's
  `maxprepsExtraRows`: 7 rows + 0 missing − 1 extra = 6 teams. Two league games had no score at
  MaxPreps on 2026-10-04 (§1.3a), and the Section's Sport Dates sheet disagrees with the Guidelines
  on the last contest (§1.4).
- **Sunset:** MaxPreps' Sunset table **lists three of the eight teams** (Great Oak, Temecula Valley,
  Chaparral), with Bonita and Chaminade (`maxprepsExtraRows`: the site lists them with the Southern
  Section independents, DESIGN §24.10), and orders them by winning percentage; the five Orange County
  schools (Edison, Fountain Valley, Huntington Beach, Marina, Newport Harbor) have no MaxPreps league for
  2026-27. si.com marks more games as league games than MaxPreps does, so its Sunset records differ
  from ours, and MaxPreps' league flag on Great Oak's Aug 27 win over Bonita counts for neither table
  here. No Sunset schedule, standings or rules document was found **[U]**; the eight members are eight
  of the ten in MaxPreps' 2024-25 and 2025-26 Sunset tables.
- **City:** MaxPreps counts Mission Bay's five games against City Eastern teams as league games (which
  is why MaxPreps shows Mission Bay 3-5-0 in its table on 2026-10-06); the alignment puts Mission Bay in City Western, so they count in neither
  table here. MaxPreps' City Eastern table leaves out Patrick Henry, marks none of its league games as
  league games, and lists Madison, which has no varsity game.
- **North County:** MaxPreps' Avocado table leaves out Mt. Carmel and Rancho Bernardo, and MaxPreps'
  league flag misses many North County league games (Mt. Carmel 4 of 10 flagged; in Valley, San
  Pasqual 3, Vista 4, Escondido 5). Valley has no MaxPreps table. The alignment sheet also lists Rancho
  Buena Vista under Valley; its league games are against Palomar teams. Two duplicate Palomar rows
  are excluded (the fixture ledger’s rejected and duplicate rows, `lib/fixtures/`: Poway–Fallbrook `c7dbdbcc…`, Mission Vista–Fallbrook
  `9c027452…`).
- **Metro:** MaxPreps files the five Metro Mesa teams under "Metro- South Bay", and El Capitan and
  Granite Hills under "Grossmont" with Santana; it lists no league for Hilltop or Southwest (Southwest:
  2 of 6 league games flagged). On 2026-10-05 (Pacific) Bonita Vista and Helix meet once, not twice (§3.1).
- **All four SoCal leagues:** no league publishes a schedule, standings or a points rule, so every
  SoCal division's cross-check is informational (league record only) and the order is this site's own
  3-1-0 points (`orderScope: 'site'`).

### 2.1 The 102 teams

Team identity is the MaxPreps GUID (`schoolId`/`teamId`), re-read from the live responses. Colors,
mascots and cities also come from MaxPreps; **slugs and abbreviations are ours** (kebab-case short
names, unique across all 102). The registry is
`lib/registry/{scval,bval,pcal,mcal,eal,sunset,city,north-county,metro,independents}.ts`, assembled by
`lib/teams.ts` in league order (the 49 NorCal teams first, unchanged, then the 48 SoCal league teams,
then the five independents), and a
test pins the 15 SCVAL slugs, abbreviations and GUIDs.

Each school has **one full name and one short name**, and every page prints one of the two. The
full name (`name`) is the school's name without "High School" or "College Preparatory" (so
"St. Ignatius", not MaxPreps' "St. Ignatius College Preparatory"). The short name (`shortName`,
at most 16 characters, for narrow rows and tiles) is the name the school goes by, as its league's
own documents write it: the full name itself, whole words of it, or one of the school's aliases,
never an abbreviation made up for width. Four differ from the full name: Archbishop Mitty → Mitty,
Ann Sobrato → Sobrato (the BVAL sheet), San Francisco University → SF University (an alias; MCAL's
bare "University" reads as a college outside an MCAL table) and Convent of the Sacred Heart →
Convent. In Southern California five more differ, each as the CIF San Diego Section's 2026-27 League
Alignment writes the school: Cathedral Catholic → Cathedral (whole words; deliberately not an alias,
since Cathedral of Los Angeles and Cathedral City are statewide namesakes), La Jolla Country Day →
LJCD and Rancho Buena Vista → RBV (both aliases), Canyon Crest Academy → Canyon Crest and San
Dieguito Academy → San Dieguito (whole words, and aliases). Local nicknames the leagues do not print (Paly, Tam, Lick, SI, Pres) are not used.
`lib/teams.ts` fails at load on any other short name, and the short name is display only: matching
keys on the name and the aliases, never on it, so bare "University" (also Irvine's on si.com) stays
out of the index. Source spellings ("ST. IGNATIUS",
"MItty", "Presentation HS", "St. Francis") are aliases for matching; the 2025-26 archive stores
them verbatim but prints the registry name. The si.com ids
are the numeric id on a team page URL (`/teams/{id}-{slug}`) and, where observed, the school id on
a school-logo URL; "—" means not observed and is never guessed.

Per division: De Anza 7, El Camino 8, Mt. Hamilton 6, Santa Teresa 6, PCAL 7, MCAL 9, EAL 6 = 49
in NorCal; Sunset 8, City Western 6, City Eastern 6, Avocado 6, Palomar 7, Valley 6, Metro Mesa 5,
Metro South Bay 4, independents 5 = 53 in SoCal; 102 in all.

| slug | abbr | league | division | MaxPreps team id (GUID) | name | si.com team id | si.com school id |
|---|---|---|---|---|---|---|---|
| st-ignatius | SI | scval | de-anza | `1dc4836b-4daf-4573-b525-27b474bd5366` | St. Ignatius | 456831 | — |
| saint-francis | SF | scval | de-anza | `de6d3780-e8f6-4a2a-93f2-b5d89499f9b0` | Saint Francis | 457982 | — |
| los-altos | LA | scval | de-anza | `0279f2de-d5ce-484d-b210-2286ded42058` | Los Altos | 458850 | 12174 |
| valley-christian | VC | scval | de-anza | `8a8c04d2-5606-44cf-9993-34db55474240` | Valley Christian | 480709 | 319 |
| fremont | FR | scval | de-anza | `a97c219c-2fbe-4fa4-9a0c-cc18502a8d24` | Fremont | 496836 | 11003 |
| cupertino | CU | scval | de-anza | `97ffffbe-54ba-4c25-86bb-41332627f64e` | Cupertino | 458665 | 11002 |
| homestead | HM | scval | de-anza | `738a2432-7acb-4ad6-b041-115ec0f331c2` | Homestead | 458667 | 11004 |
| mitty | MI | scval | el-camino | `0f63870a-34f3-4d5b-9dbf-653c8410f969` | Archbishop Mitty | 464806 | — |
| los-gatos | LG | scval | el-camino | `bdb0b593-ef7f-4c69-8c2a-e0a48c934ca7` | Los Gatos | 458802 | — |
| palo-alto | PA | scval | el-camino | `a38a628c-c65f-487f-a65e-7264b6804ce0` | Palo Alto | 480707 | — |
| presentation | PR | scval | el-camino | `e1db3a4f-3bcf-4281-a574-d313212296a1` | Presentation | 457986 | — |
| santa-clara | SC | scval | el-camino | `17fad4fb-c82b-4b5a-8a31-3ce13c0ede13` | Santa Clara | 496839 | 13089 |
| saratoga | SG | scval | el-camino | `12a470ab-e17d-4e5a-b74b-055d1f46d46b` | Saratoga | 458805 | — |
| lynbrook | LY | scval | el-camino | `d7c7f7a1-06be-44fb-a4a2-64599519aa4c` | Lynbrook | 458669 | — |
| monta-vista | MV | scval | el-camino | `405614ad-a015-4270-b527-18e899c90824` | Monta Vista | 458672 | — |
| branham | BR | bval | mt-hamilton | `c81780c9-d396-45a1-a7f9-0aae05905a97` | Branham | 458510 | — |
| christopher | CH | bval | mt-hamilton | `773e862d-e186-44aa-b268-461b4064ce52` | Christopher | 458687 | — |
| gilroy | GI | bval | mt-hamilton | `fa72c6cc-34dc-4bb4-a184-9c4efaa643d3` | Gilroy | 458690 | — |
| leigh | LE | bval | mt-hamilton | `bd6662e8-a2ee-45ca-b0e8-dd03dec005c9` | Leigh | 458515 | — |
| leland | LD | bval | mt-hamilton | `cb6e2cbf-71b1-4ef0-9c63-feef33010bf2` | Leland | 459053 | — |
| willow-glen | WG | bval | mt-hamilton | `e0d5f596-a80c-4142-9c2a-e2bee576fdc9` | Willow Glen | 459057 | — |
| del-mar | DM | bval | santa-teresa | `8c56113f-9229-43a2-a56e-4f8443494857` | Del Mar | 458513 | — |
| live-oak | LO | bval | santa-teresa | `a52c60ac-fbe9-438f-b052-c1eba43afacd` | Live Oak | 458848 | — |
| prospect | PS | bval | santa-teresa | `24d74484-a18f-450e-9f4a-ccbd5299bf1f` | Prospect | 458517 | — |
| silver-creek | SK | bval | santa-teresa | `30d65e43-1478-45b5-90de-fd69689344f8` | Silver Creek | 547018 | — |
| sobrato | SO | bval | santa-teresa | `01bf9fda-9b10-4f04-9eef-3195d7d501dc` | Ann Sobrato | 458846 | — |
| westmont | WM | bval | santa-teresa | `1959d651-408f-4764-94a5-144cea89c499` | Westmont | 458520 | — |
| carmel | CA | pcal | pcal | `91994f1e-57af-4fda-9fe0-45c923078af6` | Carmel | 458529 | 10223 |
| greenfield | GR | pcal | pcal | `0bb5dbd8-6792-415b-8118-196ee0132b56` | Greenfield | 458776 | 11486 |
| hollister | HO | pcal | pcal | `3f8f38fb-88f9-44ee-9af1-c1203fce437b` | Hollister | 459010 | 12876 |
| monterey | MO | pcal | pcal | `1ddbdf6d-84fd-4dfa-942f-f833193e2626` | Monterey | 458839 | — |
| salinas | SA | pcal | pcal | `1f152b3b-38dc-4d34-b260-9663dc3006a4` | Salinas | 459009 | 12870 |
| santa-catalina | CT | pcal | pcal | `c3f83b47-6bab-4e25-ba49-9c3ffda74be8` | Santa Catalina | 458109 | — |
| stevenson | ST | pcal | pcal | `e9a4a782-76c5-4b15-8dd6-f03b87464aa4` | Stevenson | 456854 | — |
| archie-williams | AW | mcal | marin-county | `5cbb07ea-6b9c-4286-81f6-2708253e1add` | Archie Williams | 487100 | — |
| redwood | RW | mcal | marin-county | `12616b84-157c-48d3-b353-434576d9df8d` | Redwood | 459143 | — |
| tamalpais | TM | mcal | marin-county | `7298608f-2310-4399-aa07-d6bc50df3f4e` | Tamalpais | 486964 | 13445 |
| berkeley | BK | mcal | marin-county | `6c68b5d2-1cab-449d-9140-bd7c8adb2791` | Berkeley | 458485 | — |
| lick-wilmerding | LW | mcal | marin-county | `527c7df0-94c7-4aa2-991c-ef86f4235d4e` | Lick-Wilmerding | 487098 | 263 |
| university-sf | UN | mcal | marin-county | `7ad2b4f5-955e-4a92-ac1f-a1acced4df4b` | San Francisco University | 456869 | 259 |
| marin-catholic | MC | mcal | marin-county | `69e24861-fa93-42a2-acb5-be60e01ee555` | Marin Catholic | 456834 | 163 |
| convent-sacred-heart | CS | mcal | marin-county | `d15d09d0-f8a6-463e-86d4-d998dbee7751` | Convent of the Sacred Heart | 512325 | 6922 |
| marin-academy | MA | mcal | marin-county | `9f489fa8-a23a-4924-a2a0-5c5cff3c0fdc` | Marin Academy | 575124 | 257 |
| bella-vista | BV | eal | eal | `204d6632-16ce-41fc-a733-dd11ec3af582` | Bella Vista | 459060 | 12991 |
| chico | CI | eal | eal | `041ef7b7-089b-4e7d-9c9c-9ff1f833f829` | Chico | 458564 | 10335 |
| corning | CR | eal | eal | `8f1a8024-2d40-4cab-bcba-3b9b367c6873` | Corning | 458585 | 10501 |
| davis | DV | eal | eal | `288ca10d-8448-41e9-b26e-463df226b8c8` | Davis (MaxPreps: Davis Sr.) | 458605 | 10575 |
| lassen | LS | eal | eal | `b4268b1c-b3df-4dd5-b52c-5355d8a48e42` | Lassen | 458783 | 11554 |
| pleasant-valley | PV | eal | eal | `8e01c2fa-4888-483f-8d26-6a45518c1bd8` | Pleasant Valley | 458566 | 10337 |
| chaparral | CP | sunset | sunset | `d9fa2972-0bc2-4d7b-baa4-aaa7d69c119e` | Chaparral | 459144 | 13456 |
| edison | ED | sunset | sunset | `c5a36b71-74a5-431f-94a3-8337d66dfbbb` | Edison | 458743 | 11313 |
| fountain-valley | FV | sunset | sunset | `79582922-a3b0-44a5-b210-8e51f3cfb731` | Fountain Valley | 458744 | 11314 |
| great-oak | GO | sunset | sunset | `a36c1c30-9183-4514-8cd6-26824a6d7c50` | Great Oak | 459145 | 13457 |
| huntington-beach | HB | sunset | sunset | `f60cf593-eddc-4900-b1c9-b6362f852856` | Huntington Beach | 458746 | 11316 |
| marina | MR | sunset | sunset | `96f0228e-b1db-4993-ad1e-5427b5592bcf` | Marina | 458748 | 11317 |
| newport-harbor | NH | sunset | sunset | `86009247-6ae1-40e1-acfa-58c200528743` | Newport Harbor | 458870 | 12274 |
| temecula-valley | TV | sunset | sunset | `8f350275-199e-4549-b574-2257e718069f` | Temecula Valley | 459147 | 13461 |
| bishops | BI | city | city-western | `9d14d198-9976-4ed2-872d-047b9f317035` | Bishop's | 456843 | 201 |
| canyon-hills | CN | city | city-western | `5bcd4caa-2727-404f-8ea0-627dc9d0b1b1` | Canyon Hills | 459034 | 12931 |
| cathedral-catholic | CC | city | city-western | `15c34e49-1a29-4298-8a84-00a2ec6ae36b` | Cathedral Catholic | 458202 | 6107 |
| la-jolla | LJ | city | city-western | `582fa2b1-19ed-467d-85af-fc6971dd5a71` | La Jolla | 459019 | 12915 |
| mission-bay | MB | city | city-western | `f2ec9dd0-0f24-4161-a2c3-2a9df393f220` | Mission Bay | 459025 | 12919 |
| scripps-ranch | SR | city | city-western | `7a80ea9f-8ed1-4b25-99cf-ad1b0fcd41a5` | Scripps Ranch | 459032 | 12930 |
| clairemont | CL | city | city-eastern | `50ebec25-d857-4178-9f5a-1a6241c43b85` | Clairemont | 459017 | 12896 |
| la-jolla-country-day | CD | city | city-eastern | `c24601db-aee8-4989-ba5d-bfbf0a91b927` | La Jolla Country Day | 456865 | 256 |
| mira-mesa | MM | city | city-eastern | `e551f0f0-28a3-4c13-8ade-1b9909ffa28c` | Mira Mesa | 459023 | 12918 |
| patrick-henry | PH | city | city-eastern | `e71f479e-b2c8-48da-a8b4-4f270c3afb92` | Patrick Henry | 464779 | 30661 |
| point-loma | PL | city | city-eastern | `91a74b43-700f-4e74-819e-d62b6dba12f7` | Point Loma | 459029 | 12921 |
| university-city | UC | city | city-eastern | `32f08693-bcfd-4a62-a463-77b91360f53b` | University City | 459037 | 12934 |
| canyon-crest-academy | CY | north-county | avocado | `91a207da-721f-4acf-a69c-cd7fa50a1f7a` | Canyon Crest Academy | 459041 | 12935 |
| la-costa-canyon | LC | north-county | avocado | `78ad824a-61a0-462b-aa6f-1d5f6fb1bd5f` | La Costa Canyon | 459043 | 12936 |
| mt-carmel | MT | north-county | avocado | `688ec7f8-2985-4e7e-900a-4d78f845b197` | Mt. Carmel | 458939 | 12670 |
| rancho-bernardo | RN | north-county | avocado | `132d806e-7fa4-4bce-b92a-9db38786cf7b` | Rancho Bernardo | 458945 | 12672 |
| san-marcos | SM | north-county | avocado | `ff3dcd2f-cdea-46e6-accf-fd929c0a4374` | San Marcos | 459066 | 13021 |
| torrey-pines | TP | north-county | avocado | `ad43e80f-2296-4b96-a0a9-44e6a8ea76f2` | Torrey Pines | 459049 | 12940 |
| del-norte | DN | north-county | palomar | `ddf384b8-3189-4276-8703-71106d47a4d5` | Del Norte | 458937 | 12669 |
| fallbrook | FB | north-county | palomar | `7453dc74-befb-4c36-92ec-35bf99c3c718` | Fallbrook | 458653 | 10923 |
| mission-vista | MS | north-county | palomar | `e9446588-3714-4a57-905e-cd9a097a48b0` | Mission Vista | 464852 | 31920 |
| poway | PW | north-county | palomar | `9adef103-5c38-4dc2-a6c4-b36ea4f5400c` | Poway | 458942 | 12671 |
| rancho-buena-vista | RV | north-county | palomar | `f1f0e644-5c98-4d70-bd3c-ae7fb8992410` | Rancho Buena Vista | 459174 | 13718 |
| san-dieguito-academy | SD | north-county | palomar | `a7064567-f2fe-442d-8200-34a28326d1b9` | San Dieguito Academy | 459047 | 12938 |
| valley-center | VE | north-county | palomar | `673c037d-ae98-4fa1-a388-b127758ac382` | Valley Center | 459167 | 13667 |
| escondido | ES | north-county | valley | `226ea389-d063-46bb-8ccb-ede6f10c2ca6` | Escondido | 458641 | 10872 |
| mission-hills | MH | north-county | valley | `643a8f19-47aa-42a2-b5a4-0f52421f80b9` | Mission Hills | 459063 | 13020 |
| sage-creek | SE | north-county | valley | `475c3bcb-9d28-457f-87b8-d979f9ff070f` | Sage Creek | 464866 | 31992 |
| san-pasqual | SP | north-county | valley | `a1109c06-7436-4b72-a30e-459eb6d00925` | San Pasqual | 458644 | 10874 |
| vista | VI | north-county | valley | `1f57d89b-3a6d-444a-9de1-2fba3f0017b6` | Vista | 464777 | 30660 |
| westview | WV | north-county | valley | `9ef67997-7f5d-4899-b500-2d0b5c758105` | Westview | 458949 | 12673 |
| bonita-vista | BT | metro | metro-mesa | `7f4d50f0-8690-493c-b4bc-262b512e8851` | Bonita Vista | 459119 | 13407 |
| eastlake | EL | metro | metro-mesa | `6aa8e46b-7aa9-4df3-9512-89a9d4827f7f` | Eastlake | 459128 | 13412 |
| helix | HX | metro | metro-mesa | `186dcece-fefd-4b67-b4c7-877b3e12beb2` | Helix | 458715 | 11156 |
| olympian | OL | metro | metro-mesa | `0465e8ea-3eb0-4619-a74a-183e70c697e2` | Olympian | 480708 | 13417 |
| otay-ranch | OR | metro | metro-mesa | `77e5b6a4-a166-4a88-b114-a38a9b28ccc4` | Otay Ranch | 459134 | 13419 |
| el-capitan | EC | metro | metro-south-bay | `15d5e874-4af2-4d24-8e6b-be895937cb8c` | El Capitan | 458711 | 11149 |
| granite-hills | GH | metro | metro-south-bay | `aa2f89a2-0150-4223-89b4-ac73cbf343e9` | Granite Hills | 458713 | 11152 |
| hilltop | HT | metro | metro-south-bay | `ec21ffde-b216-47cc-9923-6308e239e9e0` | Hilltop | 459131 | 13413 |
| southwest | SW | metro | metro-south-bay | `19409229-6768-4537-b8d7-4a7d2814aaad` | Southwest (MaxPreps: Southwest SD) | 459138 | 13422 |
| bonita | BN | independents | independents | `4c2dd7e8-2f3e-43aa-891b-9218932cdf9d` | Bonita | 458494 | 10097 |
| chaminade | CM | independents | independents | `742a32d0-2dc9-4aa8-ad92-8c4576f73a12` | Chaminade | 456824 | 141 |
| glendora | GL | independents | independents | `1228375e-e4c0-453e-aed4-d0b0693b3c52` | Glendora | 458698 | 11109 |
| harvard-westlake | HW | independents | independents | `9dc04c54-8c9d-4b30-a1d2-fcc167363342` | Harvard-Westlake | 458394 | 9623 |
| thousand-oaks | TO | independents | independents | `70a363e2-26b8-4ef5-8ad0-20979f66399a` | Thousand Oaks | 458583 | 10465 |

The EAL rows were read from MaxPreps' standings and team-context responses on 2026-10-04 (the team
GUID equals the standings row's `schoolId` for all seven rows; mascot and city come from team-context,
not standings) and are in alphabetical order. Chico and Corning share the acronym CHS and Lassen's LHS
joins an existing one, but BVHS, DSHS and PVHS are unique, so the expected acronym collisions are
unchanged. The EAL's six abbreviations collide with none of the other 43.

The 50 Southern California rows were read on 2026-10-06 from MaxPreps' team-context and standings
responses and si.com's league and team pages, and are transcribed by script from
`tests/fixtures/seeds/registry-seed-ss.json` (Sunset) and `registry-seed-sds.json` (City, North
County, Metro), which keep each value's provenance; they are alphabetical within each division.
Names are MaxPreps' `schoolName`, except Southwest, which MaxPreps and si.com call "Southwest SD"
(kept as an alias and in its MaxPreps path). Mascots are MaxPreps', except Mission Vista's
"Timberwolves", which neither MaxPreps nor si.com carries and which comes from the school's own site
(mvhs.vistausd.org, 2026-10-06); Canyon Hills' "Rattlers " is trimmed, and si.com's other mascots for
Clairemont (Chieftains) and Helix (Highlanders) are aliases. Colours come from the MaxPreps standings
row, or, for the 16 teams with no 2026-27 standings row (the five Orange County Sunset teams,
Mt. Carmel, Rancho Bernardo, Patrick Henry, Hilltop, Southwest and the Valley six), from
team-context's `schoolColor1`/`schoolColor2`, the same MaxPreps fields. Every si.com team id, slug
and school id was harvested (36 school ids from logo URLs, 14 from the team page's `school.id`),
never guessed; si.com's league buckets are stale and are never membership evidence.

The independents' rows were read on 2026-10-06 the same way and follow the Sunset's in
`tests/fixtures/seeds/registry-seed-ss.json` (transcribed by script into `lib/registry/independents.ts`).
Glendora, Harvard-Westlake and Thousand Oaks are each the only field hockey team in their MaxPreps league
for 2026-27 (Palomares; League B; Marmonte), and MaxPreps' 2025-26 standings for the same three leagues
list one row each; Bonita and Chaminade are rows of MaxPreps' Sunset table that the site lists with the
independents instead (owner decision, 2026-10-06; DESIGN §24.10), so the five are a group in no league,
with a table of their games against each other. Colours are the MaxPreps standings fields (Glendora and Harvard-Westlake CC0022/222222,
Thousand Oaks 00824B/FFFFFF); abbreviations GL, HW and TO collide with none of the other 99; si.com's
team search on 2026-10-06 found no second California team with any of the three names. Their si.com JV
pages are 481707 (Glendora), 482355 (Harvard-Westlake) and 482332 (Thousand Oaks).

Where the natural abbreviation was taken the SoCal seeds use MR (Marina; MA is Marin Academy), MT
(Mt. Carmel; MC is Marin Catholic), CN (Canyon Hills; CH is Christopher), CY (Canyon Crest Academy;
CC is Cathedral Catholic), VE (Valley Center; VC is Valley Christian), MS (Mission Vista; MV is Monta
Vista), BT (Bonita Vista; BV is Bella Vista), SE (Sage Creek), RN and RV (Rancho Bernardo and Rancho
Buena Vista; RB is held for Red Bluff) and CD (La Jolla Country Day). With 102 teams the shared
acronyms are BHS, BVHS, CHS, EHS, FHS, GHS, HHS, LHS, MCHS, MHS, MVHS, PHS, SCHS, SHS, VCHS and WHS.
Acronyms are display only and are indexed only while one school carries them, so seven NorCal
acronyms no longer resolve: BVHS (Bella Vista), FHS (Fremont), MCHS (Marin Catholic), MHS
(Monterey), MVHS (Monta Vista), VCHS (Valley Christian) and WHS (Westmont). No source this site reads
keys a team on an acronym, and each keeps its name, aliases, slug and GUID.

si.com's team search (§1.2 caveat 9), run on 2026-10-06 for the 50 names, found a second California
team named Westview (West Los Angeles, 464882), Del Norte (Crescent City, 458609), Marina (Marina,
500865), San Marcos (Santa Barbara, 459073), Mission Vista (480754, a second entry for "Vista, CA"),
Granite Hills (Porterville 554634 and Apple Valley 458466) and Southwest (El Centro, 583246; si.com
calls ours "Southwest SD"). Those seven names joined `STATEWIDE_AMBIGUOUS` (§5.3), so an si.com side
with one of them resolves to our team only by its si.com team or school id.

⚠️ **Do not use the Presentation HTML schedule page** — it 200s but serves Los Gatos data
(MaxPreps routing/canonical bug). This is the single strongest argument for keying everything on
the `teamId` GUID and the ghost API, never on slug URLs. (Santa Teresa is also a *division* id;
the school Santa Teresa High School fields no team. If it ever does, its slug must be
`santa-teresa-hs`.)

### 2.2 Schools that are not in the registry

| School | Why | Handling |
|---|---|---|
| Wilcox (SCVAL De Anza grid) | not fielding a team | in SCVAL's `withdrawnNames`; its 14 grid fixtures are dropped when the PDF is parsed; si.com id 485528 ignored |
| York (PCAL grid slot `CAT/YOR`) | plays JV field hockey only | in PCAL's `withdrawnNames`; the `CAT/YOR` token maps to Santa Catalina; si.com id 456851 ignored; team search answers "not covered". JV: PCAL's JV member in Santa Catalina's slot (the schedule's Note 1); matched by MaxPreps e9a91bc8 and si.com JV 456850 and shown in the PCAL JV table in Santa Catalina's place (`JV_OUTSIDE_TEAMS`, §1.7) |
| Red Bluff (EAL) `4d3da788-bbe2-4ab9-b854-d95aa9786cda` | not fielding a varsity team in 2026 (§3.2) | still a 0-0-0 row in MaxPreps' EAL table (`maxprepsExtraRows`, skipped silently); in the EAL's `withdrawnNames`; si.com ids 490259, 490260 and 635037 ignored; team search answers "not covered" |
| Del Norte (Crescent City) `8396a0d3-8021-458d-b592-a5cb2c4a366d` | a MaxPreps ghost team (no league, team size 0) | every contest with this side is dropped and listed in the snapshot's `dropped` list. si.com also has a Crescent City Del Norte (458609), which it shows playing Tamalpais and Davis on 2026-10-16, the games MaxPreps gives Del Norte of San Diego (a registry team since the SoCal amendment, §2.1); "Del Norte" is in `STATEWIDE_AMBIGUOUS`, so neither si.com row resolves by name |
| Irvington, Gunn, San Jose, North Monterey County, University Prep Academy | no 2026-27 varsity team | nothing to do |
| North Salinas, Notre Dame (Salinas) (Central Coast Section) | no 2026 varsity game on MaxPreps: each team's 2026-27 `schedule-calculated` read returned no game on 2026-10-06 | nothing to fetch; team search answers "not covered" (`DATA_QUALITY.notCovered`) |
| River Valley (Yuba City, Sac-Joaquin Section) | no 2026 varsity game on MaxPreps (its 2026-27 schedule read returned no game on 2026-10-06) | nothing to fetch; team search answers "not covered" |
| Marina (CCS) | no 2026-27 varsity team | nothing to do. si.com lists it (500865, no games); "Marina" now names the Sunset school, and is in `STATEWIDE_AMBIGUOUS` |
| Mayfair `988e6551-0eb6-440e-b231-99b2bcfb7a7c` (Southern Section) | no 2026 varsity game on MaxPreps, and not on the Southern Section's list of participating schools | nothing to fetch; team search answers "not covered" |
| Westlake, Los Alamitos (si.com's Sunset table) | 0-0 rows with no games on si.com; no 2026-27 MaxPreps team | nothing to do (si.com league buckets are never membership evidence) |
| Madison `fef1da70-bea2-4958-a60b-9962851f6a1d` (San Diego Section) | a 0-0-0 row in MaxPreps' City - Eastern table; no 2026 varsity game on MaxPreps or in the Section's power rankings, and not in the Section's 2026-27 field hockey alignment | City Eastern `maxprepsExtraRows` (skipped silently) and the City Conference's `withdrawnNames`; team search answers "not covered" |
| Santana `1125d6e8-e661-4190-a41d-5722364dee38` (San Diego Section) | a 0-0-0 row in MaxPreps' "Grossmont" table (Metro South Bay's El Capitan and Granite Hills); no 2026 varsity game on MaxPreps or in the Section's power rankings | Metro South Bay `maxprepsExtraRows` and the Metro Conference's `withdrawnNames`; team search answers "not covered" |
| Castle Park, Chula Vista, Montgomery, Sweetwater (San Diego Section) | no 2026 varsity game on MaxPreps or in the Section's power rankings | nothing to fetch; team search answers "not covered" |
| si.com's other Westview (West Los Angeles, 464882), San Marcos (Santa Barbara, 459073), Mission Vista (480754), Granite Hills (Porterville 554634, Apple Valley 458466) and Southwest (El Centro, 583246) | si.com teams that share a SoCal member's name (§2.1) | in `STATEWIDE_AMBIGUOUS`: never resolved by name, so their rows never join to ours |

Every other school that appears as an opponent (out-of-area, other sections) is a **non-member**:
its games are ordinary non-league games, modeled with `teamId: null` and a bare name, never given a
Team record, and shown as "Not one of the 102 teams this site follows" (the number is the registry's
size).

### 2.3 Name normalization

Every display name is an alias (MaxPreps `schoolName`, an official-schedule abbreviation or
ALL-CAPS grid name, prose, si.com name, ICS feed name) — the join key is always the MaxPreps GUID
(or, for si.com, the si.com team id, §5.3). The 2025-26 all-league PDF is inconsistent even within
itself (`St Ignatius` vs `Saint Ignatius`).

## 3. Division membership and which games count

### 3.1 Membership and classification, per league

Membership comes from each league's **official schedule**, never from MaxPreps' or si.com's
league buckets (both are wrong somewhere: §1.2, §2). The EAL has no official schedule (§1.3a): its
six teams are the ones MaxPreps lists in its EAL table, less Red Bluff, which is not fielding a
varsity team in 2026, and the two Sac-Joaquin Section schools among them (Davis, Bella Vista) are
members because they play the EAL schedule, whatever their CIF section. A game belongs to a division's table
(`Game.countsFor`) only when both teams are members of that same division **and** the league's
classification evidence says it is a league game. This is decided once, in the pipeline
(`lib/classify.ts`), and stored on the game.

| League | Evidence for "league game" | Excluded |
|---|---|---|
| SCVAL, EAL | MaxPreps `contestType === 0` (SCVAL: corroborated against the live PDF grid, any disagreement is logged; EAL: no official document exists to check against, and the umpire grid of §1.3a equalled it on 2026-10-04) | SCVAL: CCS section games only (postseason tag `ccs`). EAL: `contestType` 2, 4 and 5, and every game between two EAL teams on or after 2026-10-30 (postseason tag `league-postseason`, the Super Regional) |
| BVAL, PCAL, MCAL | the game matches a fixture on the league's **official schedule** for that division | `contestType` 2 and 4 (tournament / neutral), and every postseason game |
| Sunset | **membership** (`classification: 'membership'`, DESIGN §24.11): both sides are two of the eight Sunset teams and the game is dated Sep 15 to Oct 31, whatever MaxPreps' league flag says (the flag follows whichever scorekeeper entered the game); one league game a pair, seven a team | `contestType` 2 and 4 on either row, the earlier meeting of each of the seven pairs that met twice (`rules.nonLeagueGames`, by contest id: the later meeting is the one both schools list as a league game on cifsshome.org; docs/LEAGUE-RULES.md has the table), every game against a team outside the eight (Bonita at Great Oak, Aug 27, which MaxPreps flags), and every Tournament of Champions game (postseason tag `outside-tournament`: any game between two Southern Section teams dated Oct 22–29, §1.8) |
| City, North County, Metro | **membership** (`classification: 'membership'`): both sides are members of the division (the CIF-SDS 2026-27 League Alignment) and the game is dated inside its league play, whatever MaxPreps' league flag says | `contestType` 2 and 4 on either row, every San Diego Section playoff game (on or after Nov 2, or `contestType` 4), and every game outside the division's league-play dates |
| LA independents | **membership** (`classification: 'membership'`): both sides are two of the five independents (Bonita, Chaminade, Glendora, Harvard-Westlake, Thousand Oaks; this site's grouping, DESIGN §24.10) and the game is dated Sep 8 to Oct 31, whatever MaxPreps' league flag says (it flags only Bonita–Chaminade) | `contestType` 2 and 4 on either row, every game against a team outside the five (Bonita's Aug 27 game at Great Oak, which MaxPreps flags as a league game, counts for neither table), and every Tournament of Champions game (`outside-tournament`, §1.8) |

- The official-schedule matcher for BVAL, PCAL and MCAL runs three passes: same date and
  home/away order; same date, either order (records a host conflict); then **rescheduled** games
  (the same pair within ±14 days, the cap lifted when both sides are in the division), assigned
  globally by smallest date difference so an early unplayed fixture can never take a later moved
  leg. A same-division final that matches no fixture is published with the note "Not on the
  official <League> schedule; not counted." SCVAL keeps its own legacy matcher and its PDF grid.
- **MCAL postseason:** a game between two MCAL teams dated on or after **2026-10-23** is
  tournament play and never counts, unless its contest id is listed in
  `leagueGameOverrides` (a rescheduled league game). A league fixture whose only candidate is dated
  after the cut-off is published as a league reason telling a maintainer to add the override.
- **Prospect** (Santa Teresa): four of its official league games are typed non-league (`contestType`
  1) by MaxPreps; they count because they are on BVAL's official schedule.
- **Degraded mode:** if a league's bundled official file fails validation at cron time, its
  divisions fall back to MaxPreps' league flag (never membership alone), the league is `degraded`
  and says why.
- **PCAL** games between PCAL teams also count only when official; non-league games against BVAL or
  SCVAL opponents appear in the schedule but never in a table.
- **San Diego membership.** No San Diego Section league publishes a schedule, and MaxPreps' league
  flag misses many of their games (Patrick Henry 0 of 10 flagged), so these seven divisions count every
  game between two members inside league play (`lib/classify.ts`). The divisions are scheduled as a
  double round robin, but not every pair is: on 2026-10-05 (Pacific) MaxPreps shows **Metro Mesa with 19 of its
  20 meetings**, Bonita Vista and Helix meeting once (Oct 23, `b9d43b5d-5000-4bdc-a50e-00c22f1544c4`)
  **[V]: the 2026-10-06 SoCal corpus**. Whether the second meeting is missing from MaxPreps or was never
  scheduled is **[U]**. Under 'contest-type' or 'membership', a league-flagged game between two
  divisions of one league (Mission Bay's five against City Eastern teams) counts in neither table.

### 3.2 Withdrawn and non-fielding schools

1. SCVAL's official grid lists **8** De Anza teams including **Wilcox**; MaxPreps returns **7**
   rows (Wilcox is absent, not 0-0-0; its schedule page returns a valid season with no contests;
   si.com has 1 scheduled game, 0 played). Wilcox is not fielding a team in 2026, so it is not in
   the registry and De Anza has 7 teams. El Camino is 8 in both.
2. A team that **is** fielded but has no results still renders with an explicit "no results
   reported" state, named, listed last and never ranked by merit — **never** as 0-0-0.
3. The league absorbs five WCAL/private programs (St. Ignatius, Saint Francis, Valley Christian,
   Archbishop Mitty, Presentation) because CCS has too few field-hockey programs for separate
   leagues.
4. **Red Bluff (EAL) is not fielding a varsity team in 2026.** MaxPreps' EAL table still lists it
   (0-0-0, `standingsId` all zeros, `modifiedOn` null). Its 2026-27 varsity schedule has `data: []`
   (team `4d3da788-bbe2-4ab9-b854-d95aa9786cda`), its roster has 0 players and `teamSize` 0, and no
   other team schedules it. si.com shows its 12 original league fixtures as CANC under a placeholder
   team (§1.2 caveat 8). The umpire sheet's change log of 2026-04-29 still had "vs RB". The Red Bluff
   Daily News of 2026-08-22 reports "a couple from the field hockey program, which will not field a
   team this fall"
   (`https://www.redbluffdailynews.com/2026/08/22/girls-flag-football-is-coming-to-red-bluff/`).
   A Red Bluff **JV** game at Chico on 2026-09-14 exists, so the site's wording is only "not fielding
   a varsity team in 2026", never that the school has no program.

## 4. Data model

The normalized TypeScript model (`Team`, `Game`, `Standing`, `Snapshot`, `LeagueHealth`,
`SourceId` etc.) lives in `lib/types.ts`; the snapshot is Zod-validated in
`lib/snapshot/snapshot-schema.ts`, with the config cross-checks in `lib/snapshot/snapshot-invariants.ts` and the
load path in `lib/snapshot/snapshot-load.ts` (schema version 2; a version-1 single-league file migrates in memory, a
version-2 file written before a configured league existed gains that league on load, DESIGN §22.7, and a
version-2 file whose games no longer classify under the current rules or registry (a `countsFor`, a
`leagueDivision` or a `postseason` tag that differs from what the config gives today) is reclassified on load,
DESIGN §24.11, and a file whose `playoffs.games` differs from what `lib/postseason/ccs-bracket.ts` derives is rebuilt on load,
`needsPlayoffGames`, 2026-10-29).
Load-bearing rules baked into it:

- `Game.home`/`.away` carry `teamId: null` + a bare `name` for non-member opponents — every
  fixture is renderable without inventing a Team record.
- `Game.countsFor` is the division whose table the game belongs to (or `null`), set once by
  `lib/classify.ts`; `Game.postseason` tags CCS, SCVAL crossover, BVAL play-in, MCAL tournament,
  EAL Super Regional (`league-postseason`), San Diego Section playoff and Tournament of Champions
  (`outside-tournament`) games, which never count in a league table.
- `Game.bracket` (optional, since 2026-10-29) is MaxPreps' bracket context, set only when the row's
  `contest.tournamentId` is a real GUID: `{ tournamentId, bracketId, tournament, name, published, matchupId,
  url }` from `tournamentId`, `tournamentBracketId`, `tournamentName`, `bracketName` ('Division 1' /
  'Division 2' for the CCS), `bracketIsPublished`, `bracketMatchupID` and `tournamentCanonicalUrl` (§1.4).
  An ordinary row (the all-zero id) has none, so every file written before it stays valid.
- `snapshot.playoffs.games` is derived, never kept by hand: the same `Game` objects as `snapshot.games`
  that are tagged `ccs` and dated from the quarterfinals or marked published by the feed (`ccsBracketGames`).
  `playoffs.bracketPublished` is true when either division of the MaxPreps page is published, and
  `playoffs.divisionsPublished` (optional, since 2026-10-29) holds the per-division answer; both are
  carried from the previous snapshot when the page is not recognised (§1.4).
- The CCS seeds and the San Diego brackets are not in the snapshot: they are the owner files
  `data/field-hockey/ccs-bracket-2026.json` (`lib/postseason/ccs-bracket-schema.ts`) and `data/field-hockey/sds-brackets-2026.json`
  (`lib/postseason/sds-brackets-schema.ts`), bundled and validated at build time (a slip in either fails the build
  and `pnpm test`), placeholders until the sections publish.
- A level EAL final that MaxPreps flags `W` for one team and `L` for the other is a 1 v 1 win:
  `decider: 'SO'`, `shootout: null` (no tally is stored, §1.1b), and the flags decide the result in
  every W/L/T count. Shootout data exists only when the decider is `SO`. A level San Diego final
  outside a tournament that MaxPreps flags W and L gets `decider: 'SO'` too (the Section's rule,
  `SectionConfig.shootout`), but its inference is 'unverified': no tally is published anywhere, and
  si.com and the Section's power rankings record Mt. Carmel–Poway (Sep 11) as 2-0 where MaxPreps has
  0-0. The flags still decide the result; the pages print MaxPreps' score with no decider tag and say
  only that the team was credited with the win on a level score.
- `contestState === 1` rows are **dropped before** a `Game` is constructed (they are not
  "canceled" — one observed row is a scrimmage with a real 0-4 score; storing it would leak a
  scrimmage into the standings).
- `venue.text` (raw `contest.location`, often a note like `"Scrimmage"` or `"Too be rescheduled"`)
  is kept separate from `venue.name` (only ever populated from a game page's ld+json `Place`,
  fetched lazily, never in the sweep).
- `Game.provenance.scores` is `'maxpreps'` or `'sblive'`; a backfilled game also carries a
  `backfill` record (rule, si.com game id, MaxPreps' value) and, where si.com overrode MaxPreps,
  `scoreConflict`. A si.com-only game has the contest id `sblive:<si.com game id>`; its page, like every
  game's, is at its slug (`Game.slug`: `/game/<date>-<away>-at-<home>`, `lib/game-slug.ts`), and
  `Game.aliases` lists every other URL segment it was published at, each a redirect to the slug (README, "Game URLs").
- `Standing.computed` (ours, from game rows) is the display source of truth; `Standing.reported`
  (MaxPreps' own numbers) is kept for cross-check and freshness display — see §2,
  `docs/LEAGUE-RULES.md` and `docs/BYLAWS-2026-27.md` for the ordering rules.
- `leagueHealth` (one row per league: `fresh`, `partial`, `degraded` or `frozen`, with reasons),
  `dropped` (contests removed on purpose, with the reason) and `supersededGames` (a game no feed
  listed, later replaced by MaxPreps' own, which inherits its slug and aliases, so its old page redirects there: `lib/game-urls.ts`) are part of the snapshot and shown on `/about`.
### 4.1 The fixture ledger: this site's own record of a game

Every source is wrong now and then, so no source is the record of a game. Where a person has had to say what a
game was, it is said once, in the fixture ledger (`lib/fixtures/`: `shape.ts` the types, one file per sport,
`ledger.ts` the checks and the merge): one `CanonicalFixture` per game, stating its day, host and visitor, and under
`sources` which row of which source is that game. A game with no fixture is published as the sources have it. The
pipeline reads the ledger as one source among the others, the editor's: one claim per fixture, rebuilt from the
ledger every run (§4.2).

| In the fixture | Means | The pipeline then |
|---|---|---|
| `sources.maxpreps` | the MaxPreps contest that is this game | takes from it whatever the fixture does not state: start time, score, links |
| `sources.maxprepsDuplicates` | other MaxPreps rows for the same game, each with why | drops them (`dropped`, 'excluded-by-config') |
| `sources.official` | the league fixture that is this game, played on another day or at the other school | looks for si.com's score and lists the game on the ledger's day, at its host |
| `date` (a citation) | the fixture's day is not the one MaxPreps gives | publishes the fixture's day, time TBA; MaxPreps' date is kept in `provenance.dateCorrection` |
| `host` (a citation) | the fixture's host is the school MaxPreps lists as visitor | swaps the sides; MaxPreps' host is kept in `provenance.hostCorrection` |
| `result` (cited) | the goals in play, overtime and tally a better source records, or the winner alone | publishes it; MaxPreps' result is kept in `provenance.resultCorrection` (or `reportedWinner`) |
| `listing` (cited) | the game is on no feed: the source's own account of it | puts it on the schedule (`official:<date>-<away>-at-<home>`) until a feed lists the pair that day |

The ledger's `rejected` list holds MaxPreps rows that are no game at all (a scrimmage, a row for a game never
played); they are dropped and are no fixture's.

`assertLedger` runs at import: a fixture is two registry teams on a day of a season; a contest, a league fixture
and a (day, pair) are each in the ledger once; every fact is cited; a result names the fixture's own two teams.
`ledgerProblems` checks the other way, against the games a run (or the committed snapshot,
`tests/ledger.test.ts`) holds: a fixture whose linked contest is another pair, another day or another host than
it states is reported in the run log and not applied.

Who reads the ledger. The pipeline reads it once, as the editor's claims (`lib/claims/editor.ts`, the one module under
`lib/claims/` that imports `LEDGER`), and hands the slices of those claims (`EditorView`: `ledgerView` of them) to every
rule it calls: the rejected and duplicate rows to `matchMaxpreps`, the days and hosts to `resolveMaxprepsClaim`, the
result corrections to `finalizeResult`, the listings and `ledgerProblems` to the results step, the moves to the
official and si.com steps and to assembly. The rule modules' parameters still default to `LEDGER_VIEW` (and
`EXCLUSIONS`), which is what the snapshot loader (`lib/snapshot/snapshot-migrate.ts`), the site's own reads, the JV
script and the tests use; the pipeline never leaves one to its default. `tests/claims/empty-editor.test.ts` runs the
pipeline over an empty ledger and fails if any fact of the real one shows in the snapshot, and the frozen list in
`tests/claims/boundary.test.ts` keeps any other pipeline module from importing `LEDGER_VIEW`, `EXCLUSIONS` or
`LEDGER`.

The lists that are about a team or a league rather than one game stay in `DATA_QUALITY`
(`lib/league-config/data-quality.ts`): ghost teams, ignored si.com team ids, ignored MaxPreps leagues and the
schools search reports as not covered. JV games have their own corrections (`lib/jv/jv-corrections.ts`).

### 4.2 Claims: what each source says about a game

The pipeline does not edit a list of games. Every source's rows are kept as **claims**, one per row, each on the
**fixture** (our own record of one game) it is about, and the games a run publishes are folded from those claims
stage by stage (`lib/claims/`). `data/field-hockey/snapshot.json` is that fold, the derived and published output, and its schema is
unchanged. The claims are the pipeline's own working state: the site and the snapshot loader never read them, and
nothing under `lib/claims/` loads `lib/data.ts` (`tests/claims/boundary.test.ts`; no module of `app/`, `components/`,
`lib/data.ts`, `snapshot-load.ts` or `snapshot-migrate.ts` reaches `lib/claims/` or names `claims.json`).

**The file.** Each sport has a claims file beside its snapshot: `data/field-hockey/claims.json`, `data/soccer/claims.json`,
`data/basketball/claims.json`, `data/volleyball/claims.json`. A run writes it with the snapshot and its meta file
(`writeOutputs`); for an `--out` that is not named `snapshot.json` it is `<out minus .json>.claims.json`, as the meta
file is `<out minus .json>.meta.json` (`claimsPathOf`, `lib/claims/file.ts`). It is stable JSON, parsed against
`lib/claims/schema.ts` (a claim's game is checked against the snapshot's own `GameSchema`), about 2.3 MB for field
hockey; a run warns over `CLAIMS_WARN_BYTES` (3,000,000). Abridged, one fixture:

```jsonc
{
  "schemaVersion": 1,
  "sport": "field-hockey",
  "fetchedAt": "2026-11-15T12:28:58.170Z",   // the run that wrote it; equals the fetchedAt of the snapshot beside it
  "fixtures": [                               // sorted by id, code-unit order
    {
      "id": "2026-09-30-santa-catalina-at-salinas",   // our id, minted once, never published
      "claims": {                                     // keyed by source; sblive, cifss and vnn hold a list sorted by ref
        "maxpreps": { "ref": "1b7ee7fb-…", "game": { /* the contest as toGame built it */ } },
        "official": { "ref": "pcal:2026-10-01:santa-catalina@salinas",   // the league fixture's own id
                      "stamp": { /* … */ },
                      "lastMatch": { "contestId": "1b7ee7fb-…", "stamp": { /* … */ } } },
        "sblive":   [ { "ref": "contest:1b7ee7fb-…", "conflict": { /* … */ } } ]
      },
      "published": [ { "contestId": "1b7ee7fb-…" } ]  // every contest id the fixture's game was published under
    }
  ]
}
```

Every claim has a `ref` (the source's own key for the row) and a `seenAt`, the `fetchedAt` of the last run that saw
it. A `seenAt` equal to the file's `fetchedAt` is left out of the file, and so is a MaxPreps game's
`provenance.fetchedAt` (it equals the claim's `seenAt`), so a run over unchanged upstream changes the file's stamp and
nothing else; reading restores both. A fixture's `published` lists the contest ids its game has been published under, in
the order it first was (`PublishedUnder`): each with the `seenAt` of the last run that published it so, left out on
disk when it equals the file's `fetchedAt`, and, for an editor's listing (`official:`), the `builtAt` of the run that
first built it. The sources are `maxpreps`, `official`, `sblive`, `cifss`, `sdsSheet`, `vnn`,
`box` and `editor` (`ClaimSource`, `lib/claims/types.ts`). A fixture left with no claim is not written.

**Fixture identity** (`lib/claims/identity.ts`). A fixture's id is `<dateKey>-<away>-at-<home>`, each side by its
registry slug or, for a school outside the registry, by the name key the cross-source joins use (`name:` and the
letters and digits of the name, `sideJoinKey`), with `~2`, `~3` … for two games of one pair on one day, in minting
order. A fixture the ledger links to a MaxPreps contest is named by the ledger's `fixtureKey`, the same form. The id is
minted once, from the claim that creates the fixture, and never changes afterwards, not when a later run corrects the
day; an id (or an alias of a merged fixture) is never minted twice. Identity is by stored ref: a source row always
lands on the fixture that already holds its `(source, ref)`, so the same MaxPreps contest, league fixture or si.com
row is the same fixture run after run. When MaxPreps lists a game that si.com's rule 2, the San Diego sheet or an
editor's listing published first (`sblive:`, `cifsds:` or `official:`), the contest's claim, on a fixture created this
run, joins the fixture of that game (`joinSupersededFixtures`, `ClaimStore.merge`, `lib/claims/supersede.ts`): the new
fixture's id becomes an alias of the old one, whose id the game keeps, and `published` holds both contest ids. A claim
that evidence sources and write-backs keep about an already published game goes to the fixture that game is
(`lib/claims/published.ts`): a MaxPreps contest's, a `cifsds:` game's (found by its sheet claim), an `official:`
listing's (named by its `fixtureKey`) or an `sblive:` game's (found by its fill).

**The claims, source by source.** "Decides" is the cross-game rule (it reads the whole view and decides which game
each row is about; it changes no game), "applies" is the per-game function that writes one decision onto one game.
"Not read" is what a run that did not read the source does with the stored claims.

| Source (claim `ref`) | The claim holds | Collected | Decides | Applies | When the source is not read |
|---|---|---|---|---|---|
| `maxpreps` (the contest GUID) | the contest as `toGame` builds it with no ledger fact applied (`game`); on a seeded claim, `reconstructed` | step 06, `collectMaxprepsClaims` (`lib/claims/sources/maxpreps.ts`) over the rows of step 05 | `matchMaxpreps`: the editor's rejected rows and the ghost teams dropped, phantom pairs deduped, the carry | `resolveMaxprepsClaim`: the editor's day, then its host (`lib/claims/resolve.ts`) | a side's feed failed or was not fetched: the claim is carried while the contest is neither dropped nor reported Deleted, and the game is folded from the fixture's stored claims (caveat 2); a frozen league keeps the claims the run started with (`keepFrozenClaims`, `guards`) |
| `official` (the league fixture's id, `division:date:away@home`) | the document row as read (`fixture`), the stamp, and `lastMatch`: the contest and stamp the last publication showed, with the notes the game showed beside the stamp (`leagueFlagNote`, `hostNote`); a row no game matched sits on a fixture of its own | step 07, `lib/pipeline/steps/official.ts` (SCVAL's PDFs live, the bundled BVAL, PCAL and MCAL files) | `decideOfficialMatches` (`lib/official/match.ts`) | `applyOfficialDecision`: the stamp, its league-flag and host notes, or the classification note | a division not read (a grid failed or parsed empty, `--no-official`, a bundled file that failed validation): `carryOfficialFromClaims` gives each game of it the stamp its contest last showed, no notes, and brings the division's unmatched rows back; with the claims file alone, a league the run does not read is carried the same way with the notes (caveat 5) |
| `sblive` (the si.com row's game id; `contest:<id>` for a disagreement mark) | a fill (rule 2: the whole `sblive:` game as published; rules 3 and 4: the value written onto the contest), with the row when the run read it, or a disagreement (`conflict`) with the scores the game showed beside it | step 08, `lib/pipeline/steps/sblive.ts` | `decideBackfill` (rules 2 to 4 and the carry, rule 10, `lib/crosscheck/backfill.ts`) and `decideReconcile` (rule 5, `lib/crosscheck/crosscheck.ts`) | `applyBackfillDecision`, then `applyReconcile`; rule 2's games enter the view after the official stage, each on a fixture created from its row (`createSbliveFixtures`) | rule 10 re-applies the stored fills where still eligible (`storedFillsOf`) and a disagreement is kept while its game shows the scores it was published beside (`carriedConflicts`); the cross-check report is carried from the previous snapshot (caveat 4) |
| `vnn` (`<school>:contest:<id>`) | `applied`: the venue name and address and the confirmed start time the game showed when published, whatever wrote them | step 09, `stepVnn` in `lib/pipeline/steps/secondary.ts` | `decideVnn` over the events read; `decideVnnCarry` for a school whose calendar did not answer | `applyVnnStageDecision`: the events' decision, then the carry's | per school: the claims fill a hole with what the game last showed (`vnnPublishedFrom`); only with a previous snapshot. A claim never creates a fixture |
| `sdsSheet` (`<division>:<slugA>~<slugB>`, the pair sorted) | the sheet's result or its game to play as last published (the row without its host), the `host`, and, in `published`, the `contestId` and `dateLocal` of the game it was published on and, on a game the sheet scored or only the sheet has, the `fetchedAt` the game showed (the run that wrote the sheet's score, or built the game) | step 09, `lib/pipeline/steps/sds-sheet.ts` | `decideSdsSheet` (`lib/postseason/sds-sheet-results.ts`) | `applySdsSheetDecision`: the sheet's score (rule 2) or time (rule 4); a game only the sheet has (`cifsds:`, rules 3 and 5) enters the view on a fixture created from its row (`createSheetFixtures`) | per tab: the rows the previous publication showed, read back in its order (`storedSheetRows`) |
| `cifss` (`contest:<id>`) | the cross-check report's conflict row for the game: the cifsshome.org score and its link | step 11b, `lib/pipeline/steps/cifss.ts` (the report), recorded by `recordCifssClaims` | none: evidence only, handed to each game by `cifssEvidenceFrom` | `finalizeResult` (`withCifssScore`) at stage `results` | the report itself is carried over this run's games when a Section was not read in full; the claims are replaced every run by the report's rows (with the claims file alone and no report to carry, the stored claims stay) |
| `box` (the contest) | the sides' box-score entry of the player-stats file, by team slug | the run, from `<data dir>/player-stats.json` (none with `--fixtures`), recorded by `recordBoxClaims` | none: evidence only, handed over by `boxEvidenceOf` | `finalizeResult` (`withBoxScore`) at stage `results` | the results step leaves each game's box evidence as the game holds it, and the stored claims stay until the end of the run, when `writeBackBoxClaims` rewrites them from the published games, so a carried contest shows the box score it was last published with |
| `editor` (the ledger's `fixtureKey`) | the ledger's `CanonicalFixture` | `ledgerEditor` when the run's context is built, put on the store by `attachEditorClaims` | `matchMaxpreps` (rejected rows), the results step (listings, `ledgerProblems`), the official and si.com steps (moves) | `resolveMaxprepsClaim` (day and host), `finalizeResult` (result corrections) | never carried: rebuilt from the ledger every run, written to the file for information, discarded on read; a listing's fixture keeps its `published` history, which holds the stamp the listing was built with |

**The stage driver** (`lib/pipeline/run.ts`, `lib/claims/view.ts`, `lib/claims/resolve.ts`). The run keeps a view: the
fixtures it publishes, in order, and the decisions each stage has taken about them. At each game stage, in the order
`maxpreps`, `official`, `sblive`, `vnn`, `sdsSheet`, `classify`, `guards`, `results`, three things happen:

1. COLLECT. The step reads its source. A source not read this run is carried from its stored claims, as the table says.
2. MATCH. The step decides over `state.games`, the view resolved through the stage before: which game each row is
   about (by contest id), which games enter the view (si.com's rule-2 games, the sheet's games, the editor's
   listings), and the re-sort a step applies to its list. The view's order is never derived from the
   ids: several rules decide by list order (the official matcher takes the first game, the backfill keeps a used set,
   the sheet takes the first candidate).
3. RESOLVE. The run records the decisions in the view and assigns `state.games` to the view resolved through this stage:
   each fixture's claims folded with its decisions, stage by stage, by `applyStage`. `publish` in `runPipeline` is the
   one place `state.games` is assigned.

| Stage | Step | What the run records | What resolves it |
|---|---|---|---|
| `maxpreps` | 06 | the view's order; which contests and editor listings are carried | `resolveMaxprepsClaim`, or `resolveCarriedClaims` for a carried one |
| `official` | 07 | each contest's decisions, in the order taken | `applyOfficialDecision` |
| `sblive` | 08 | the rule-2 games entering; fills and disagreements by contest | `applyBackfillDecision`, `applyReconcile` |
| `vnn` | 09 | each contest's events and carry decisions | `applyVnnStageDecision` |
| `sdsSheet` | 09 | the sheet's decisions by contest; its games entering; the sheet's order | `applySdsSheetDecision` |
| `classify` | 10 | the official step's degraded divisions | `classifyGames`, then `settleLevelFinal` |
| `guards` | 11 | a frozen league's games leaving the view and its previous snapshot's games coming back (with the claims file alone, they stay, as carried from the claims) | the game as last published |
| `results` | 11c | the editor's listings entering; the cifss and box evidence by contest | `finalizeResult` with the editor's result corrections |

The cifsshome.org cross-check (11b) runs between `guards` and `results`; standings (12) and assembly (13) follow.
`resolveView` is pure: the claims file as a run wrote it, read back, with the run's decisions and view order, resolves
to the games the snapshot published before assembly gave them their URLs and content dates
(`tests/claims/resolve.test.ts`). The official and si.com steps are injectable (`PipelineSteps`) and keep a game-list
contract: their decisions come with their result or are read off the games they return
(`decisionsFromOfficialStep`, `decisionsFromSbliveStep`), and a step whose games cannot be read as decisions broke the
contract and is handled as one that threw (logged, the run goes on without its contribution).

**Where the implementation differs from "everything from claims".**

1. **Match and resolve alternate, stage by stage; they do not run once each.** A later stage's rule reads the games
   the stages before it produced: si.com's rule 2 consumes the official step's unmatched fixtures, the sheet's rules
   apply to the games as the earlier stages left them, and classification runs over the games the sheet added. So each
   stage decides over the view as resolved through the stage before, and only then is the next stage's input fixed.
   No rule decides from a game's claims alone.
2. **A MaxPreps contest or editor listing whose feed was not read is carried by identity and built from its
   fixture's stored claims.** When a side's feed failed or was not fetched, the stored claim stays on its fixture and
   the contest is carried: its game is folded by `resolveCarriedClaims` (`lib/claims/resolve.ts`) as the MaxPreps
   claim on the editor's day and host, then what the last publication showed from each other source, read from that
   source's claim on the fixture (the official step's league-flag note, si.com's fill or disagreement, a school
   calendar's venue and confirmed start time, the sheet's score or time, the cifsshome.org and box-score evidence, the
   editor's result corrections), with the classification cleared. It is recorded as the fixture's `carried`
   decision. Those claims are the last publication's, written back at the end of every run, so what the other sources
   added to the game stays for as long as its feed is not read, even where that source was read this run and would now
   decide otherwise; the later stages decide the classification again as they decide a fresh game's. An editor listing
   (`official:`) the last run published that touches an unread feed is carried the same way: it is rebuilt from the
   ledger with the stamp of the run that first built it, which its fixture keeps in `published` (`builtAt`), and then
   folded from the fixture's claims. No carried game is read from the previous snapshot. The carry's guards are in
   §5.1.
3. **The sheet, official, si.com, school-calendar and box claims are rewritten at the end of the run from what was
   published.** After assembly, `writeBackSbliveClaims`, `writeBackSheetClaims`, `writeBackOfficialClaims`,
   `writeBackVnnClaims` and `writeBackBoxClaims` replace those sources' claims with what `snapshot.games` and
   `snapshot.officialFixtures` show, in that order, because an `sblive:` game's fixture is found by its fill and a
   `cifsds:` game's by its sheet claim; `recordPublished` then adds each game's contest id to its fixture's
   `published`. They are the last publication, not a copy of the read: a claim keeps the row as read when the run read
   it, else the row it held, and is stamped `fetchedAt` unless its source (its division, tab, school or si.com row)
   was not read this run and it shows what it showed before, so `seenAt` says when it was last read; a box claim keeps
   its stored `seenAt` while it holds the same. The `maxpreps` claims are replaced when step 06 reads the feeds, and
   the `cifss` claims when the report is recorded.
4. **Run-history reads stay on the previous snapshot.** What is about the last run rather than about a game is not a
   claim: a frozen league's games, unmatched official fixtures and division classification (`guards`, a publication
   rule), and the MaxPreps claims seeded from those games when the stored claims lack one (`keepFrozenClaims`);
   `leagueHealth` and everything that reads it (the league's `lastFreshAt`, the finals regression, the 80% systemic
   check, each division's `previousCountedFinals`); the reported standings rows of a table that failed; the si.com and
   cifsshome.org cross-check reports and the CCS calendar and brackets that are carried; `carriedFrom` stamps; an
   empty feed read as a failure when the previous snapshot holds games for the team; whether a missing feed counts as
   carried; each game's slug and aliases; `contentRemovals` and the content dates (`contentChangedAt`); and the
   `supersededGames` entries carried from earlier runs or made from a league's own schedule. A carried contest is
   not read from the previous snapshot (caveat 2), and the `supersededGames` entries for an si.com, sheet or listing
   game that a MaxPreps contest took over are read from the fixtures' `published` history (`lib/claims/supersede.ts`).
5. **With no claims file, the claims are seeded from the previous snapshot; a claims file with no previous snapshot
   is used on its own.** `prepareRun` hands the context the file beside the previous snapshot only when it was written
   by the same run for the same sport (its `fetchedAt` equals the snapshot's and its `sport` matches); a missing,
   unparsable or mismatched file is logged (a warning when unparsable) and the claims are seeded by
   `claimsFromSnapshot` (`lib/claims/from-snapshot.ts`) from the loaded snapshot. `prepareRun` hands a run with no
   previous snapshot no file, so the store starts empty and nothing is carried, whatever file lies beside `--out`. A
   context given a claims file and no previous snapshot (`claimsAlone`) takes the file as its only record of the last
   publication and resolves the games published with it: every contest is carried and folded from its claims, the
   official step carries the divisions of a league the run does not read from the official claims with the notes
   each stamp came with, the si.com step re-applies the stored fills, the guards keep a league the run does not read
   as the claims give it, with its si.com rule-2 games from the si.com claims (where a run with a previous snapshot
   freezes it to that snapshot's games), and the results step weighs the stored cifsshome.org and box-score claims.
   `tests/claims/claims-alone.test.ts` compares every field of every game with the snapshot written with the file but
   `aliases` and `provenance.contentChangedAt`, which assembly derives from the previous snapshot. A seeded MaxPreps
   claim is the contest
   `toGame` built, recovered by undoing the later steps in reverse order; where a step's input is lost, the claim holds
   the merged value or a reconstruction and names the field in `reconstructed` (`dateUtc`, `isDateTba`, `isTimeTba`,
   `flags`, `decider`, `forfeit`, `resultConflict`, `status`, `venue`, `site`, `seenAt`, `shootout`). Each is a field
   that resolve writes again while the fact that merged it stands, and the next run that reads the team's feed
   replaces the claim with an exact one. The other sources' claims are seeded by the same write-back functions a run
   ends with, from the games they show.
6. **The ledger's defaults remain for everything that is not the pipeline.** The pipeline reads the ledger as the
   editor's claims and passes its slices to every rule explicitly; `LEDGER_VIEW` and `EXCLUSIONS` stay as the rule
   modules' default parameters for the snapshot loader, the site's reads, the JV script and the tests (§4.1).

**Seeding.** `pnpm claims-seed` (`pnpm tsx scripts/claims-seed.ts`) writes the claims file beside the committed
snapshot, seeded from it and stamped with its `fetchedAt`, so that the next scheduled run reads the file and does not
seed again; the editor's claims of the current ledger are included, as a run writes them. `SCVAL_SPORT=basketball pnpm
claims-seed` does it for another sport, and `--snapshot <path>` for the snapshot at that path. It reads no network. A
corpus (or a variant) whose manifest names a `previous` snapshot may name `previousClaims`, the claims file written
beside it; it is copied beside `--out` with the snapshot, and without one the run seeds from `previous`.

**Checking byte identity.** `pnpm claims-diff [--rev <rev>]` (`pnpm tsx scripts/claims-diff.ts`; dev only, not in CI)
runs every offline corpus, each variant over `all-2026-10-02`, each base corpus again over its own output and claims
file, and the si.com cases (not read, down, read whole after a run with fills, from that run and from the committed
snapshot and claims file; a rule-2 game MaxPreps lists later), through `scripts/fetch-data.ts` on a revision (default
`HEAD`, a temporary git worktree) and on the working tree. It prints one line per run and file and exits 1 when any
`snapshot.json` or `snapshot.meta.json` differs; the claims file is not compared.

The tests, in `tests/claims/`. `shadow.test.ts` (and `shadow-volleyball.test.ts` for the volleyball build) runs every
corpus, with and without a previous run (claims read from the file and seeded from the snapshot), every variant and
the carry cases with `SCVAL_STAGE_TRACE=1`, which has each stage record what it read and published (`StageTrace`,
`ctx.trace`; off in every real run). It compares five of those records with the rule the stage ran before the claims
existed, kept in `support/legacy.ts` and `support/shadow.ts`, over the same input and reading the previous snapshot
where the pipeline reads claims: at `maxpreps`, the games, their order and the contests carried against step 06 with
the previous snapshot's games carried (a game's slug, aliases and `contentChangedAt` left out); at `official`, each
division carried from the official claims against `carryOfficialForward` over the previous snapshot; at `sblive`, with
no si.com data read, the disagreements carried against the previous snapshot's; at `sdsSheet`, the rows of the tabs
not read or read with warnings against the rows read back from the previous snapshot's games; at `classify`, the view
against `classifyGames` and `settleLevelFinal` over the game list (the volleyball file checks the first four). Every
other comparison is of the view the run published against what the stage recorded, and the official and si.com stages
against the games their steps returned: the `vnn`, `guards` and `results` stages and si.com's fills (rules 2 to 4) are
compared with no earlier rule. That the pipeline publishes what it published before the claims rests on the tests that
predate them, which call the rules through the list forms in `tests/support/list-steps.ts` (used only by tests), and
on `pnpm claims-diff --rev <commit>`. `resolve.test.ts` holds the pure-resolve property; `claims-alone.test.ts` that a
run given only a claims file publishes the games written with it (caveat 5); `carry-fold.test.ts` that every MaxPreps
game of a snapshot is its fixture's claims folded; `frozen.test.ts` that a frozen league keeps its MaxPreps claims;
`supersede.test.ts` that a contest taking over another source's game joins its fixture; `empty-editor.test.ts` the
ledger boundary of §4.1; `boundary.test.ts` that the site and the snapshot loader do not reach `lib/claims/`; and
`committed.test.ts` that each committed claims file parses, is written as the pipeline writes it and is for its sport,
and, when its `fetchedAt` is its snapshot's, gives every MaxPreps game of the snapshot a claim.

**In the workflows.** The update-data workflows (`update-data.yml` and the soccer, basketball and volleyball ones)
commit the sport's claims file with its snapshot, and when only the run's timestamp moved they revert it with the
snapshot (`git checkout`, or `rm` when it is new and untracked); `deploy-cloudflare.yml` counts it among the data files
that `main` may change above the commit a deploy is built from.

## 5. Cron fetch plan

**Core sweep — 131 MaxPreps requests, run by `scripts/fetch-data.ts` (a thin CLI over
`lib/pipeline/`) from `.github/workflows/update-data.yml`:** 1 bootstrap page + 14 league-metadata
assertions + 14 league standings + 102 per-team schedule pulls (one per registry team, so Prospect,
Patrick Henry and every other team a MaxPreps table omits is fetched anyway) = every game, including
non-league fixtures, because the schedule feed is per-team, not per-league. The formula is 1 + 2 ×
(divisions with a MaxPreps table) + fetchable teams: of the 16 divisions, the San Diego Section's
Valley has no MaxPreps table (`maxprepsLeagueId: null`), so its two requests are never made (no
`/leagues/null/v1`) and its cross-check is reported as skipped, and neither has the Southern Section
independents' group, which no MaxPreps table gathers (two of its five sit in MaxPreps' Sunset table, three
alone in their own leagues), so only its five schedules are read.

**Player stats — 102 rollup requests, plus one per-game table per team with stats and a box score per
final changed since the last run, in a separate process:** the workflow then
runs `scripts/fetch-player-stats.ts` (one stats rollup per registry team, all nine leagues and the five independents, §1.1k) as a non-fatal step
(`continue-on-error`), so a stats outage never costs the day's scores, and commits
`data/field-hockey/player-stats.json` with the snapshot when its content changed. It is not part of the 131 below
and shares no abort scope with the pipeline.

### 5.0 Request budget per run

| Host | Requests | Notes |
|---|---|---|
| MaxPreps API | 131 | 1 bootstrap + 14 meta + 14 standings + 102 schedules; ≤3 concurrent, ≥500 ms spacing (about 30 s when it was 56 requests; the whole 2026-10-04 run of 64, every host, took about 46 s; the 2026-10-06 run's duration was not recorded) |
| scval.com | 3 | 2 schedule PDFs + the standings index |
| drive.google.com, pcalathletics.org, mcalsports.org | 5 | revision checks (BVAL ×2, PCAL, MCAL) + the MCAL `Schedir.htm` changes check |
| si.com | up to 15 + up to 30 + up to 8 | statewide scoreboards for dates in the trailing 14 days that have a game; league scoreboards only for a day the statewide page cut short (§1.2 caveat 10, newest day first, `SBLIVE_LEAGUE_SCOREBOARD_CAP`); targeted team-games pages only for backfill candidates the scoreboards did not cover (§5.2 rule 8) |
| VNN | 2 | the Palo Alto and Los Gatos calendars |
| cifccs.org + MaxPreps HTML | 2 | only from `CCS.pollFrom` (Oct 25) |
| cifsshome.org | ~45, growing through the season | every page of six Section listings, Aug 1 through the run's date (§1.2a); 1-2 runs a day, ≥500 ms spacing |

`--sblive-full` (all 102 si.com team pages) is a manual flag, never the cron default. The final
log line prints the counts per host, e.g. `requests maxpreps:131 sblive:… official:…`. The live run of
2026-10-04 made 64 MaxPreps, 20 si.com and 8 official-host requests, with no 403 or 429. The live
run of 2026-10-06 (99 teams) made 128 MaxPreps, 21 si.com and 8 official-host requests, and 163 of
its 165 source rows were ok. The live run of 2026-10-06 that added the independents (102 teams, the
committed snapshot, `fetchedAt` 2026-10-06T05:58Z) made 131 MaxPreps, 21 si.com and 8 official-host
requests, and 166 of its 168 source rows were ok (the other two are the CCS calendar and bracket
sources, skipped before Oct 25).

### 5.1 Order, aborts and freezes

Steps run in this order: window guard → bootstrap → league metadata ×14 → reported tables ×14 (the 15th
division, Valley, has no MaxPreps table and makes neither request, nor does the independents' group) → schedules ×102 → normalize (the MaxPreps claims) → official schedules → si.com → secondary (VNN, CCS, the San Diego bracket sheet) → classify →
guards → cifsshome.org cross-check (report only) → results → standings → assemble. Normalize, official, si.com,
secondary, classify, guards and results are the stages of the claims driver (§4.2): each reads its source, decides
over the games the stage before left, and the run resolves the fixtures through it. Failure has three scopes, so **one league never blocks the others**:

| Scope | Effect | Triggers |
|---|---|---|
| **Run abort** (exit 1, nothing written, previous snapshot and claims file stay) | the whole run is rejected | (1) the bootstrap's season ids differ from config; (2) the league/team config or registry fails its own invariants; (3) the assembled snapshot fails schema validation; (4) a systemic outage: published games under 80% of the previous snapshot, or 60% or more of the feeds attempted failed, or every league in the run ended frozen |
| **League freeze** (`state: frozen`) | that league's games between its own teams, and its unmatched official fixtures, come from the previous snapshot (the `guards` stage's `frozen` decision, a publication rule that reads the snapshot, not the claims: §4.2; its contests keep the MaxPreps claims the run started with, and a run given the claims file and no previous snapshot keeps the league as the claims give it, §4.2 caveat 5) and its table is recomputed from them, with the reasons published; other leagues publish fresh | (a) a division's metadata has the wrong season, year or section id; (b) 50% or more of the league's team feeds failed; (c) finals regression: counted finals in a division dropped by 3 or more against the previous run (1-2 vanished finals publish, each named in a warning) unless the league is passed to `--accept-regression`; (d) the league is not in `--leagues` |
| **Source stale** (`status: stale`, `carriedFrom`) | that source's previous contribution is carried and the league becomes `partial` | a MaxPreps standings table failing (0 rows, HTTP 400, schema error, network); a team feed failing (that team's MaxPreps claims stay on their fixtures and its contests are carried, guarded: never an `sblive:` game, never a contest another feed reported Deleted this run, the earlier classification cleared so the game is matched and classified again, and the phantom dedupe re-run over fresh plus carried games with the fresh row always winning; each carried contest is folded from its fixture's stored claims and so publishes as the previous run published it, and an editor listing the last run published that touches the feed is carried the same way, §4.2 caveat 2); an SCVAL PDF failing or parsing empty (the division's stamps and unmatched rows come from the official claims); an official-revision or MCAL changes check seeing a new hash (fixtures still used); an si.com page not read this run (a failed page, an item past the team-page cap, `--no-sblive`, nothing to read, or every request failing): the earlier si.com fills its data covered are re-applied from the si.com claims where still eligible, and a failed page's row is `stale` when something was carried in its place |

The **CCS calendar and bracket** are not a league source (no league changes state) and carry per
part: a part not read this run (`--no-ccs`, no CCS league in `--leagues` such as an MCAL-only
refresh, the season gate before `CCS.pollFrom`, a corpus without it, or a failed request) keeps the
previous snapshot's value (the calendar its `ccsCalendar` and `keyDatesConfirmed`, the bracket its
`bracketPublished`), so a run that never queried CCS cannot unpublish a live bracket or drop a
confirmed calendar; their source rows stay `skipped`/`error` and the run log names the carry. With
no previous snapshot the bracket is unpublished and there is no calendar.

A frozen league with no previous data cannot be carried: not in `--leagues` or a wrong-season
meta publishes it with no games; failed feeds or a finals regression publish the fresh rows with
state `degraded` and the reason. Reasons are rendered verbatim on the league pages and `/about`.
**A partial run still publishes** — each failed request becomes a `SourceStatus {status:"error"}`
row.

**Retries:** 429/5xx only, 3 attempts, exponential backoff 1s→2s→4s ±20% jitter, honor
`Retry-After`. Never retry another 4xx. Per-request timeout 15s. A descriptive User-Agent
identifies the site and a contact address on every request.

**Backfill of MaxPreps itself:** because `schedule-calculated` returns a team's entire season in
one request, every run **re-ingests all 102 feeds in full** and upserts on `contestId` — coaches
enter results by hand with real lag, and MaxPreps corrections do happen, so nothing is ever treated
as immutable.

**Conditional extras:** the two SCVAL schedule PDFs; the `scval.com/standings/`
poll; the two VNN `.ics` feeds (start times/venues/JV); CCS calendar + MaxPreps tournament page
(on every run from Oct 25, which is the cron's two runs a day: there is no extra game-day run, §5.6). Game venue addresses are fetched lazily, one
request per game, only from a game-detail route — never in the sweep.

**Normalization rules:** dedupe on `contest.contestId`; drop `contestState === 1` before anything
else; a row whose opponent is TBA (null or all-zero team id) is split off and recorded in `dropped`
so one TBA row never rejects a whole feed; a contest with a ghost team or in the excluded list is
dropped (§5.4); a final whose result flags contradict its own score is marked (evidence for rule
4a below); a missing score renders `pending`, **never `0-0`** (a genuine 0-0 final is
distinguishable because both scores are `0` *and* both results are `"T"`); home/away from
`teams[].homeAwayType` only (never `contestType`, never `scoreboard-contests-by-ids`' `teams[0]`
ordering); league membership per §3.1; store both naive-local and UTC timestamps; opponent
identity by GUID, display name by the alias table.

### 5.2 MaxPreps vs SBLive reconciliation

**Owner decision D2: MaxPreps is the primary source; si.com may backfill it, under rules that are
mechanical so the site never guesses.** This replaces the earlier rule that si.com
scores were only recorded and never published, everywhere. The rules are implemented as pure
functions in `lib/crosscheck/backfill.ts`; match games across sources on `(date, unordered pair of teams)`.
**Every rule needs both teams resolved by si.com id (§5.3), a si.com status of Final with integer
scores, and a si.com game that is not a junk row (rule 7).**

1. **MaxPreps is primary.** A MaxPreps final with a score is published as MaxPreps publishes it,
   unless rule 4 applies.
2. **No MaxPreps contest for an official fixture.** An official league fixture (any league,
   SCVAL included) dated before today, for which no non-deleted MaxPreps contest of the same
   pair exists within ±14 days of the fixture date (any type, status or postseason tag) that is
   not already matched to a different official fixture (the pair's other leg counts for its own
   fixture and does not block this one), and si.com has that pair as Final within ±1 day of the
   fixture date: **publish si.com's score** as a
   new game with `contestId: 'sblive:<si.com game id>'`, `provenance.scores: 'sblive'`, no MaxPreps
   URL, the si.com URL, counted in the league table exactly like a MaxPreps final, with home/away
   and `official` taken from the fixture. A league fixture that the fixture ledger links to a fixture of its own
   (`sources.official` in `lib/fixtures/`: a league game that another source, cited in the entry, shows was played on
   another date and maybe at the other school) is searched on the ledger's date instead, for both windows, and
   published with the ledger's host; `official.scheduledDate` keeps the league's date and the entry's source sentence
   is added to the backfill note. The ledger has had no such link since 2026-11-15. Its one, from 2026-10-22, moved SCVAL's Sep 9
   Homestead at Cupertino to Oct 13 at Homestead (si.com's Homestead 3-0 and an NFHS Network stream); MaxPreps then
   listed the pair's first meeting on Oct 29, a 5-5 tie, and Homestead's athletic director's weekly update has it
   on Fri Sep 11 "(OT)" and Oct 13 as a third meeting, "Played" with no varsity score and a 1-0 JV win MaxPreps
   files as non-league. The tie is one fixture in the ledger, dated Sep 11 (its `date` citation) and recorded as one
   period of overtime (its `result`). Oct 13 is another, listed as a non-league game (a `listing`, `nonLeague: true`), Homestead 3-0,
   from Homestead varsity's Instagram post of Oct 14 ("3-0 W v Cupertino!!", goals to Hailey and Gabby; the owner
   has two to #7, Gabrielle Moll, and one to #8, Hailey Cutler) and si.com's same 3-0. A si.com row that is the same game as an existing
   MaxPreps contest (same date, same pair: the cross-check's join) is never used to fill. If two
   or more candidates remain with different scores, nothing is filled and a warning is logged. (If MaxPreps *does* have the game but it is not
   counted, for example an MCAL league game it moved to Oct 23 or typed as a tournament game, the
   game is recorded as si.com-only with the reason and is **not** filled.) The UI marks the row's
   source ("score via si.com").
3. **MaxPreps has the contest but no score** (`score-pending`, contestState 5, dated before today,
   both teams registry teams) and si.com has the same game within ±1 day as Final: **publish
   si.com's score on that contest** (contest id kept, `provenance.scores: 'sblive'`, status
   becomes final, counted). If MaxPreps later posts a score, rules 1, 4 and 5 apply on that run.
   **No level fill in a 1 v 1 league:** when both sides are members of a league whose varsity
   games are decided on 1 v 1s (the EAL) and si.com's score is level, rules 3, 4a and 4b do not
   write it, because si.com does not say who won the 1 v 1s. Rule 3 records a skipped row with the
   note "si.com has a level score, but a varsity EAL game is decided on 1 v 1s and si.com does not say
   who won them, so it is not used." A decisive si.com score is used as for any league.
4. **"Clearly wrong" MaxPreps final** — only these three mechanically detectable cases, each logged
   with a note; si.com's score is published and the MaxPreps value and the reason are recorded in
   `provenance.scoreConflict`:
   - **4a contradictory result:** the two team rows' win/loss flags contradict the row's own score
     (the side with more goals is marked L), or the two rows disagree on the score. A level score
     flagged `W` for one EAL team and `L` for the other is not a contradiction: it is a 1 v 1 win
     (§4).
   - **4b off-schedule date:** the contest matched its official fixture only by the rescheduled
     pass more than 7 days from the official date, while si.com has the same pair as Final within
     ±1 day of the **official** date. The game keeps MaxPreps' date; the note names both.
   - **4c phantom tie:** a MaxPreps "final" 0-0 with both results T, si.com has a decided Final the
     same date for the same pair, **and the league plays no overtime in league play** (PCAL and
     MCAL only; in SCVAL and BVAL a 0-0 tie can be real after the sudden-victory period, so it falls
     to rule 5; the EAL decides a level game on 1 v 1s, so it is never a phantom tie there).
5. **Plain disagreement** (both sources have a score and no rule-4 condition holds): MaxPreps
   stays; the conflict is published on the game page and `/about`, never averaged or silently
   overwritten.
6. **Never from si.com:** division or league membership, `leagueRecord`, `gameTypeLabel`, standings
   order.
7. **Junk-row guards:** si.com rows whose `webPath` does not start with
   `/california/field-hockey/games/` are ignored; duplicates collapse on the si.com game id, then on
   (date, unordered pair) keeping the scored row; rows whose sides do not both resolve by id are
   ignored; rows with a side in the ignored team ids (York, Tamalpais JV, Wilcox, Red Bluff, Red Bluff
   JV, the Educational Outreach Academy placeholder) or a withdrawn name are dropped; statewide name
   collisions (`STATEWIDE_AMBIGUOUS`, §5.3: University, Los Altos, Santa Clara, Davis and seven SoCal
   names) never resolve by name.
8. **Budget:** the statewide daily scoreboard stays the cron default; si.com **team-games pages**
   are fetched only for teams with an eligible item (a past official fixture with no MaxPreps
   contest, a past score-pending contest between two registry teams, or a clearly-wrong final, per
   `eligibleItems`) that the scoreboard did not cover, as a greedy set cover capped at 8 per run;
   items past the cap wait for the next run and are logged.
9. **Transparency:** `/about` lists every si.com-sourced or si.com-overridden score with both
   values and the rule that applied (`#backfills`); the game page shows the source line ("Score
   via High School on SI (si.com)", with both links); a † on the standings row counts it;
   `SourceStatus` rows name each si.com page read.
10. **Supersede and carry-forward:** a MaxPreps contest that later matches a filled fixture wins;
    no `sblive:` game is emitted for it, a score difference becomes an ordinary conflict, and the
    fill's page is the MaxPreps game's from then on: it takes over the fill's slug, and the fill's old id URL
    is one of its aliases, a permanent (308) redirect (`supersededGames`, carried for the rest of the season). A contest new to the claims joins the fixture the fill was published on, so the game keeps its fixture (§4.2). An earlier si.com fill is decided again only by the si.com data that
    covers it (a scoreboard row of the pair near the date, or a team page of either side). Whenever
    this run did not read that data — its page failed (a partial failure is enough), the item was
    past the team-page cap or not planned, `--no-sblive`, nothing was read, or every request failed —
    the si.com claim of it (the game or the override as the last publication showed it) is re-applied
    where still eligible, and each failed page's source row is `stale` (rather than an error) when
    something was carried in its place. When no si.com page was read at all, the previous cross-check is carried
    too, keeping only the rows still true of this run's games (`carryCrossCheck` in `lib/crosscheck/crosscheck.ts`): a
    conflict whose game is gone or whose MaxPreps score has since changed, an si.com-only row whose
    game is now published or has changed status, and a fill that is no longer eligible all drop out.
    Separately, the step-06 team-feed carry never carries an `sblive:` game, so a fill always goes
    through this rule and is never counted twice.

The never-0-0 rule still holds for every non-final game. On the 2026-10-02 corpus the rules fill
exactly three games, all in PCAL (rule 2: Greenfield at Santa Catalina Sep 4 and Hollister at
Greenfield Sep 30; rule 3: Carmel at Stevenson Sep 29). The regenerated 2026-10-04 snapshot also
has 3 backfilled games, all PCAL, none in the EAL; its two score-pending EAL league games stay
unfilled and are listed as missing results (§1.3a); with `--no-sblive` the PCAL table is level
on points differently (see `docs/LEAGUE-RULES.md`).

### 5.3 si.com identity: id first

si.com team names are not safe keys (statewide collisions, JV teams, renamed schools). The resolver
in `lib/sources/sblive.ts` identifies each side in this order:

1. the si.com **team id** is in the ignored list → refused (`ignored-team`);
2. the team id equals a registry team's `sbliveTeamId` → that team (`team-id`);
3. the **school id** (from a school-logo URL) equals a registry team's `sbliveSchoolId` → that team
   (`school-id`);
4. the normalized name is `university`, `losaltos`, `santaclara`, `davis`, `westview`, `delnorte`,
   `marina`, `sanmarcos`, `missionvista`, `granitehills` or `southwest` (names shared with other
   schools statewide: §1.2 caveat 9; `STATEWIDE_AMBIGUOUS` in `lib/sources/sblive.ts`) → refused
   (`ambiguous-name`). The last seven come from si.com's team search for the 50 Southern California
   names on 2026-10-06 **[V]**: Westview (ours 458949, San Diego; 464882 is West Los Angeles's, which
   si.com shows playing Sage Creek); Del Norte (ours 458937, San Diego; 458609 is Crescent City's, the
   MaxPreps ghost in `DATA_QUALITY.ghostTeamIds`); Marina (ours 458748, Huntington Beach; 500865 is
   Marina's own, Monterey County, no games); San Marcos (ours 459066; 459073 is Santa Barbara's);
   Mission Vista (ours 464852, Oceanside; 480754 is a second entry whose games page serves si.com's
   index); Granite Hills (ours 458713, El Cajon; 554634 Porterville and 458466 Apple Valley); Southwest
   (583246 is El Centro's, no games; si.com names ours "Southwest SD", 459138, which still resolves
   by name). Every other name returned one team of that name;
5. a name match whose recorded id contradicts an id that **is** present → refused
   (`id-contradicts-name`);
6. a name match → the team (`name`) — usable for the cross-check display only, **never for a
   backfill**;
7. otherwise unknown.

The team id comes from `/teams/{id}-…` on a web path, else a raw id, else the `/uploads/production/
team/{id}-v…/` image path. League slugs used to harvest team pages are never used for membership.

### 5.4 What is dropped on purpose

All three lists are config (`DATA_QUALITY` in `lib/league-config/data-quality.ts`, the fixture ledger in `lib/fixtures/`
and each league's `withdrawnNames`) and everything dropped is published in the snapshot's `dropped` list and on `/about#dropped`.

- **Ghost teams** (`ghostTeamIds`): a MaxPreps team that is not a real team. Del Norte (Crescent
  City) `8396a0d3-8021-458d-b592-a5cb2c4a366d` has no league and team size 0; every contest with
  it is dropped.
- **Excluded contests** (the fixture ledger, §4.1: a fixture's `sources.maxprepsDuplicates`, a second MaxPreps row
  for a game that has one, and the ledger's `rejected` rows, which are no game): contests named by id with the reason. Two MCAL —
  `5b9ff911-a640-4947-b9fd-8a629e775b33` (Tamalpais vs the Crescent City ghost; duplicates
  Tamalpais vs Del Norte of San Diego) and `5cf5e3df-6e72-4f44-9b8d-e69da30b85c5` (Archie Williams
  at Marin Academy, Aug 18: not on the official schedule; a spurious unscored row); two Palomar
  duplicates, `c7dbdbcc-5f41-4192-b8b2-eb79cca2523a` (Poway vs Fallbrook, Oct 9) and
  `9c027452-e21e-4e47-9eac-d2e800bfb42c` (Mission Vista vs Fallbrook, Oct 30); and two Tournament of
  Champions rows, `0017b5bb-5319-4742-84df-e6585dcb7056` (a second row of Harvard-Westlake 6-0 Temecula
  Valley, Oct 23) and `3702e126-9414-4c0b-a13c-61e78ead2ed9` (Newport Harbor at Glendora's unscored
  Oct 22 row; the game was played Oct 24). An excluded id
  that no longer appears is logged once ("exclusion no longer needed").
- **Phantom duplicates:** two contests for the same pair on the same day inside one division keep
  the better one (final with a score over score-pending over scheduled, then contestType 0, then the
  later MaxPreps modification). Non-league doubleheaders are never touched.
- **Ignored si.com team ids** (`sbliveIgnoredTeamIds`): `456851` York (PCAL, JV only), `512156`
  Tamalpais JV, `485528` Wilcox (SCVAL, not fielding a team), `490259` Red Bluff (EAL, not fielding
  a varsity team in 2026), `490260` Red Bluff JV, and `635037` Educational Outreach Academy (a
  si.com placeholder carrying Red Bluff's original 2026 EAL fixtures, which si.com marks CANC, all
  without a score; §1.2 caveat 8).
- **Known non-member MaxPreps standings rows** (`maxprepsExtraRows`, per division, `{}` where there
  are none): the EAL's Red Bluff row `4d3da788-bbe2-4ab9-b854-d95aa9786cda`, a 0-0-0 row with no
  games; the Sunset's Bonita and Chaminade rows (listed with the LA independents here); City Eastern's
  Madison row; and Metro South Bay's Santana row. The reported-table step skips each without the
  "unknown school" warning, and a division's count rule is `maxprepsTeamCount +
  maxprepsMissing.length − extra rows = expectedTeams` (EAL 7 + 0 − 1 = 6; Sunset 5 + 5 − 2 = 8).
- **Ignored MaxPreps league id:** `6e1f97d4-5211-4d98-bf59-282cd754bc5c` (the 0-team PCAL sibling
  table, §2).
- **Withdrawn names** (never members): SCVAL — Wilcox and its variants; PCAL — York and its
  variants; EAL — Red Bluff and its variants (Red Bluff High School, Spartans, Union High School); City — Madison
  and its variants; Metro — Santana and its variants. Their fixtures are dropped silently when an official schedule is parsed.

### 5.5 Corpus and `--capture`

Tests and offline runs read a recorded **corpus**: a directory with a `manifest.json` (id,
`fetchedAt`, leagues, and a map from each logical resource such as `maxpreps/schedule/leigh`,
`sblive/scores/2026-09-30` or `scval/pdf-text/de-anza` to a file, or to an HTTP status number that
is served as that error) plus the files. `tests/fixtures/corpus/all-2026-10-02/` is a full run of
the four leagues of that date (SCVAL's schedules and PDF texts are the 2026-09-29 captures,
everything else 2026-10-02) and was **not extended**: under it the EAL is "not fetched in this
run" (frozen, no data), as BVAL, PCAL and MCAL are under the `scval` corpus. `tests/fixtures/corpus/eal-2026-10-04/`
is the EAL's own corpus, captured live with `--capture` (`--leagues eal`, si.com on, CCS, VNN and
the official sources off; `fetchedAt` 2026-10-04T07:19:05.777Z): 19 files for 9 MaxPreps and 9
si.com requests (1 bootstrap, 1 league meta, 1 standings, 6 schedules; 7 si.com scoreboards, for
2026-09-22, 09-24, 09-28, 09-29, 10-01, 10-02 and 10-03; and 2 si.com team-games pages), in which
75 schedule rows become 40 contests and 40 games, 30 of them league games. A replay over it asks for
nothing the capture lacks (no `FixtureMissing`). The pipeline asks only for scoreboard dates on which
MaxPreps or a fixture has a game, so the corpus has no 2026-09-30 scoreboard. It drives
`tests/pipeline/eal.test.ts`, the EAL view tests and a second copy-honesty pass, and
`tests/helpers.ts` exports its name as `EAL_CORPUS`. `tests/fixtures/maxpreps/manifest.json` is the
older SCVAL-only corpus; and `tests/fixtures/corpus/variants/` holds overlays for failure cases
(`pcal-standings-empty`, `bval-meta-wrong-season`, `leland-feed-503`, `mcal-postseason`,
`bval-revised`, `finals-regression`). The `finals-regression` overlay's `previous-snapshot.json` is
**frozen**: it stays a four-league version-2 file, so it keeps exercising the "league added" upgrade
a snapshot written before the EAL went through on load (DESIGN §22.7).

```bash
pnpm fetch-data --fixtures tests/fixtures/corpus/all-2026-10-02 --out /tmp/snap.json
pnpm fetch-data --fixtures tests/fixtures/corpus/all-2026-10-02 --variant tests/fixtures/corpus/variants/leland-feed-503 --dry-run
pnpm fetch-data --capture tests/fixtures/corpus/<new-name>     # live: also records every response
```

`--capture` is a normal live run (the full request budget, all the politeness limits) that wraps
the live transport in a recorder; it is the only way to make a new corpus, and the only reason to
run a live fetch by hand. Tests that assert league-specific values build their snapshot from the
corpus with `corpusSnapshotPath('all-2026-10-02')` (`tests/helpers.ts`); tests over the bundled
`data/field-hockey/snapshot.json` assert invariants only, since that file changes every run. An offline run
never touches the network. It writes the snapshot, its meta file and the claims file (§4.2) beside `--out`:
`/tmp/snap.json`, `/tmp/snap.meta.json` and `/tmp/snap.claims.json` for the first command above.

Two fixture directories are provenance, not test input. `tests/fixtures/maxpreps/ghosts/` holds
the two MaxPreps schedule captures (Del Norte of Crescent City and Del Norte of San Diego) behind the
Del Norte (Crescent City) entries in `DATA_QUALITY.ghostTeamIds` (`lib/league-config/data-quality.ts`) and among the fixture ledger's duplicate
rows (`lib/fixtures/field-hockey.ts`): the ghost's one contest, `5b9ff911`, duplicates Tamalpais vs Del Norte (San
Diego), `a05bedf5`. `tests/fixtures/sblive/pcal-1002/` is the research record for the PCAL si.com
fills of 2026-10-02: `fill-candidates.json` (how the pages were captured, the si.com team ids, the
fills, the rows dropped and the cross-check against MaxPreps) and `games-verified.json` (what each
game page shows), with the team and game pages they cite. No test, script or manifest reads these
files except `team-456851-york-falcons.html`, which `tests/backfill.test.ts` parses (York is JV
only, `DATA_QUALITY.sbliveIgnoredTeamIds`). Keep them when fixtures are refreshed.

**Postseason fixtures (2026-10-29/30).** No real 2026 bracket exists yet, so the CCS and San Diego bracket code is
held to 2025's:
- `tests/fixtures/ccs/tournament-2026-10-29-unpublished.html` (111,799 B, the live MaxPreps tournament page captured
  2026-10-29 21:41Z, both divisions `not-published`) and `tests/fixtures/ccs/tournament-403.html` (6,967 B, the WAF
  body the sandbox got on a later request): `tests/ccs.test.ts` and `tests/pipeline/ccs-carry.test.ts` read them.
- `tests/fixtures/maxpreps/postseason-2025/sched-los-gatos-2025-ccs.json`: Los Gatos's three 2025 CCS rows
  (`0de6848f` quarterfinal, `84992c1e` semifinal, `e6091e07` final), **transcribed, not captured** (values quoted
  through WebFetch on 2026-10-29; the envelope and row shape copied from the real Davis capture; its `_note` lists
  every transcribed and every nulled field). `sched-davis-2025-super-regional.json` beside it is the two real
  2025-11-01 Super Regional rows of Davis's feed, bytes unchanged. They live in the `postseason-2025/`
  subfolder because `tests/helpers.ts allScheduleRows()` sweeps every `sched-*.json` directly under
  `tests/fixtures/maxpreps/` into the SCVAL corpus (293 rows from 15 feeds, pinned).
- `tests/fixtures/ccs/bracket-2025.ts`: the 14 CCS games of `data/field-hockey/prior-season.json` rebuilt with the `game()`
  builder on Nov 7/11/14 2026, with `bracket` and the `ccs` tag, the sixteen 2025 seeds from
  `data/field-hockey/history-brackets-2025-26.json` (`seedsFromHistory`), the Stevenson–Willow Glen 1-1 (`4e75d107`) given Willow
  Glen's W as the history file records, and the finals' venue text from the history sites (`@ Los Altos HS`, `@
  Gilroy HS`). `tests/ui/bracket-model.test.ts`, `tests/ui/playoff-bracket.test.ts` and `tests/ui/playoff-view.test.ts`
  use it.
- `tests/fixtures/sds/brackets-2025.ts`: the 2025 San Diego brackets as an owner file (`seedsFromHistory('sds')`,
  window Nov 2–15 2025), the 26 SDS playoff rows of `data/field-hockey/prior-season.json` rebuilt with `game()` and tagged
  `section-playoffs` (three level rows given the W/L the sheet's winners imply) and a synthetic Helix 2-1 Granite
  Hills play-in (not on MaxPreps). 26 of the 30 bracket games have a MaxPreps row, so the join is asserted only
  where one exists. `tests/sds-bracket.test.ts` and `tests/ui/sds-bracket.test.ts` use it.

### 5.6 Playoff polling from Oct 25

Before the CCS poll window, the postseason sections render from the by-laws-derived dates and each
league's ladder, with no polling. From `CCS.pollFrom` (Oct 25, before BVAL's last league games on
Oct 30, its Oct 31 play-in and the Nov 2 entries deadline) every run fetches the CCS `?print=ical`
calendar (match the `"CCS Semfinals"` typo; `confirmKeyDates` also compares each round's site words with
the config) and reads the MaxPreps tournament page division by division (`readTournamentPage`, §1.4: an
unrecognised page is not read and the previous bracket state is carried), and the team
`schedule-calculated` calls read the bracket fields into `Game.bracket` (verified on 2025 rows read
2026-10-29, §1.4; `bracketGameIndex` is 0 and unused). Re-derive the CCS CloudFront PDF URLs each time;
never poll the CCS bracket page itself expecting data.

**Cadence (observed 2026-10-29).** There is no extra run on game days: the two crons (`0 14 * 8-11 *` and
`0 5 * 8-11 *`, 7 AM and 10 PM Pacific during PDT, 6 AM and 9 PM after Nov 1) are the only schedule, and
GitHub started them late every day of Oct 21–29 (the git log of `data/field-hockey/snapshot.meta.json`: the 05:00 UTC run
4.2–6.2 h late, the 14:00 UTC run 3.2–5.7 h late). In PST that is about 1–3 AM and 9–11:45 AM Pacific, so
nothing lands between about noon and 1 AM: a game played in the afternoon or evening is first on the site
the next night or morning, the Nov 2 1 PM seeding is first detectable on the early Nov 3 run, and fan copy
says "after the next update", never "that evening". Extra Nov 2–15 runs are an owner decision, not made
(`tests/workflows.test.ts` does not pin the cron).

**MCAL has no section playoff**: its tournament (play-in Fri Oct 23 if needed, quarterfinals Mon Oct 26,
semifinals Wed Oct 28, final Fri Oct 30 at Tamalpais) is read from MaxPreps games dated on or after Oct 23
between MCAL teams. **The EAL's Super Regional (Oct 30-31) is not polled either**: no source is read for it
and the site draws no bracket (§1.4). A game between two EAL teams on or after 2026-10-30, or typed
`contestType` 4 between them, is tagged `league-postseason` and never counts in the league table. 2025's two
Super Regional rows (Nov 1 2025, `contestType` 5 and `homeAwayType` 2 on both sides, the round in
`contest.location`, the all-zero tournament id, entered the day after; a real capture in
`tests/fixtures/maxpreps/postseason-2025/`) are what the window and the `/playoffs#eal` results list are
tested against. **The San Diego Section's brackets are not polled**: the owner transcribes the published sheet
into `data/field-hockey/sds-brackets-2026.json` (§1.4), and the Section's playoff games arrive in the team feeds like any
other, tagged `section-playoffs` from Nov 2. The sheet's RESULTS are read every run from Nov 2 (three CSV tabs,
§1.4 "as a results source"), for the games MaxPreps lacks or has no score for.

## 6. Legal / robots posture and attribution

`production.api.maxpreps.com/robots.txt` allows everything used here. `www.maxpreps.com/robots.txt`
disallows `/team/`, `/school/`, `/scores/` (with narrow `Allow:` carve-outs), among others — these
are root-anchored prefixes and do **not** match the paths this project uses (e.g.
`/ca/los-altos/los-altos-eagles/field-hockey/schedule/` is not under `/team/`). Field hockey is
not in the Googlebot sport-exclusion list. No `Crawl-delay` is published anywhere; the
≤3-concurrency / 500ms / once-or-twice-daily budget is entirely self-imposed. scval.com,
cifccs.org, si.com, mmboltapi, pcalathletics.org, mcalsports.org, cifns.org, fieldhockeyumpires.org
and the Google Drive download endpoint robots policies were not independently re-verified before
this build — check before a first production run. cifsshome.org's `robots.txt` was read on
2026-10-07: it disallows nothing. (The Section's Guidelines are read by hand, not
by the cron; the umpires' grid was read once, on 2026-10-04, as a cross-check, and nothing fetches
it.)

**Terms — robots is not a licence.** MaxPreps (CBS Interactive/Paramount) and SBLive/si.com both
restrict republishing and publish no reuse licence. Posture adopted: store our own **derived**
records (normalized scores, computed standings), not verbatim page copies; deep-link back to the
source page on every row; attribute visibly on every page that shows the data; keep the cron to
1-2 runs/day; send an identifying User-Agent with a contact address; cache aggressively and serve
the static snapshot, never proxy a live upstream request per visitor; honor a takedown request
immediately. The bundled official fixtures are our own transcription of public schedules (dates,
pairings and times), not copies of the documents.

**Attribution text**, rendered in the site footer (`components/layout/Attribution.tsx`) on every
page:

> Data from **MaxPreps** and **High School on SI (si.com)**; scores cross-checked against
> **cifsshome.org**. League alignment and rules from
> SCVAL, BVAL, PCAL and MCAL; EAL rules from the CIF Northern Section; Sunset: we found no published
> league rules; Southern Section rules from the CIF Southern Section; City, North and Metro: we
> found no published league rules; San Diego Section rules from the CIF San Diego Section.
> Unofficial; not affiliated with SCVAL, BVAL, PCAL, MCAL, EAL, Sunset, City, North, Metro,
> CIF-CCS, CIF-NCS, CIF-NS, CIF-SS, CIF-SDS, MaxPreps or SI. Records are computed from published game
> results and may differ from official standings. Last updated {fetchedAt}.

with the site's scope note beneath it (`SITE_SCOPE_NOTE`, components/layout/site.ts): "Covers the CIF
Central Coast Section (SCVAL, BVAL, PCAL), the North Coast Section’s MCAL, the Northern Section’s EAL,
the Southern Section’s Sunset field hockey league and the San Diego Section’s City, North and Metro
conferences, plus the Southern Section’s five independents (Bonita, Chaminade, Glendora, Harvard-Westlake
and Thousand Oaks), schools in no field hockey league. Other teams appear only as opponents." (The EAL is named in its own clause
because it has no league document: its rules come from the Section's Guidelines, and the clause links
the Section's field hockey page. The independents have no league, so the footer's lists of leagues
(the rules clause, "not affiliated with") name the nine leagues only. The SoCal leagues publish no rules we could find, so each is named
under its section's rules source, linked to the document they are in: the Southern Section's Blue Book
Article 200 and the San Diego Section's Green Book Bylaw 2000.1. tests/ui/attribution.test.ts pins the
rules clause.)

## 7. Known open risks (carried into README "Known limitations")

- **The Tournament of Champions is read from a date window, not from a source.** Nothing publishes its
  bracket; a game between two Southern Section teams dated Oct 22–29 is taken to be a tournament game
  (§1.8). A non-tournament game between two of those teams in that week would be mis-tagged, and the
  third-place game is listed only if MaxPreps adds it.

- MaxPreps' own De Anza standings arithmetic looked internally inconsistent at capture time
  (e.g. two teams reporting zero league goals scored *and* against across a full slate) — this
  project recomputes independently from game rows and prefers the computed values; `reported` is
  kept only for cross-check.
- The bundled BVAL, PCAL and MCAL fixture files are a **hand transcription** of documents their
  leagues can revise (BVAL's two documents were already revised once, 9/20 and 9/22). The hash
  check only tells us a document changed; a person must re-transcribe (§1.3a).
- MaxPreps' coverage of PCAL and Santa Teresa is incomplete (§2), so those tables depend on the
  official schedule and on si.com backfills; a si.com page change or outage degrades them to
  "missing result" lines, never to guesses.
- `dateCode` nonzero semantics and `contestState` 0 were never observed — treat any future occurrence
  as unverified territory. (`contestState` 3 was observed on 2026-10-05, and `homeAwayType` 2 (neutral)
  on both sides of 2025's EAL Super Regional rows and CCS Division 1 final, read 2026-10-29; §1.1(g).)
- **The CCS seeds and the San Diego brackets are typed in by hand.** `data/field-hockey/ccs-bracket-2026.json` (after the
  Mon Nov 2 seeding meeting, from the MaxPreps tournament page) and `data/field-hockey/sds-brackets-2026.json` (after the Sat
  Oct 31 meeting, from the Section's sheet) are transcriptions: the schemas refuse a wrong count, a repeated or
  out-of-league school, an impossible play-in or a round outside the playoffs' dates, but not a team typed into
  the wrong numbered place. Run `pnpm test` before committing either. No parser exists for the published MaxPreps
  page (never captured); the Section's sheet is parsed for results only, not for the placed teams (§1.4).
- **The San Diego bracket sheet's layout is the Section's to change.** The parser reads the 2025 and 2026 layout
  (§1.4); a new wording or a moved cell leaves that column unread with a run-log warning, so results stop arriving
  from it rather than arriving wrong, and the previous run's stay published.
- **The CCS bracket path is proven on 2025's rows, not on a live 2026 bracket.** The feed fields were read from
  Los Gatos's 2025 rows through WebFetch (a transcription, §5.5), and the tag and model tests run on 2025's games
  moved to 2026's dates. If MaxPreps names the 2026 divisions differently, a game whose division neither
  `bracketName` nor the seed file proves is drawn without a division name (`Bracket 1` / `Bracket 2`, or one
  `CCS bracket`) rather than guessed.
- **CCS tickets: GoFan-only is unverified.** The CCS pages that say so are unreachable from the research sandbox,
  so the site does not say it (§1.4, [L]).
- `scoreboard-contests-by-ids`' `teams[0]`-is-home assumption is unverified — never relied on.
- CCS CloudFront PDF hashes change on every re-upload — always re-derive at fetch time, never
  hardcode.
- MCAL's handbook (§8b) says the top four qualify for its tournament; the 2026 play-off sheet and
  the 2025 tournament use six. The site follows the 2026 sheet and says so.
- **EAL: MaxPreps' `modifiedOn` is null on a zero-game row** (Red Bluff's, 2026-10-04). It is
  handled (§1.1a), but any other null field in a standings row would reject that table, and the
  league would publish `partial` with the reason.
- **EAL: no official source.** The league's games are whatever MaxPreps marks as league games, and the
  only cross-check, the umpires' grid, is not official and is read by hand (§1.3a). A game MaxPreps
  mislabels, or a score it lacks (two on 2026-10-04), has no document to correct it, so the site
  lists such a game as a missing result rather than guessing. The Guidelines' Super Regional
  seeding text is ambiguous (four steps or five), and the coaches set the criteria, so it is quoted
  and never applied.
- **EAL: MaxPreps records 1 v 1 results inconsistently.** The 2026-09-28 Chico–Davis game is a level
  score with `W`/`L` flags (counted as a win), while the 2026-09-02 Pleasant Valley at Chico game is
  a 1-0 score with three overtime periods, which the Guidelines' one overtime period cannot produce
  and which may be a 1 v 1 win entered as a goal (a reading that rests on one newspaper report). The
  site shows each as MaxPreps has it, with a note, stores no tally (§1.1b) and cannot tell whether
  another level game that MaxPreps lacks flags for was a tie or a 1 v 1 result: it stays a tie and is
  logged.
- **EAL: the Elo fit is connected to the rest by 13 games.** Last season's finals link the EAL to
  other leagues only through Pleasant Valley (4), Chico (3), Bella Vista (3) and Davis (3); Corning
  and Lassen have none (§1.1l), so their ratings rest on their EAL games and the starting point
  alone.
- **EAL: no 2025-26 history.** The league published no final standings (§1.3), so
  `/history/2025-26` marks the EAL `unavailable` with the sources checked.
- No by-law ranks a team across leagues, and the CCS committee seeds by criteria we cannot compute,
  so the site shows no merged 1-16 order before CCS seeds.
- JV tables (§1.7) are computed, never copied: there is no in-season JV standings source and MaxPreps'
  JV league flag is unreliable, so a JV league game is identified by its varsity counterpart (or an
  unmatched official fixture), ordered on points with level teams sharing a place, and a table is shown
  only once 60% of its played league games have a score. JV scores are thin where coaches do not enter
  them (no MaxPreps score for any past BVAL or PCAL JV league game on 2026-10-05), si.com only partly
  fills that, and nothing says authoritatively which schools field a JV team. A day page exists only
  for a date with a varsity game, so a JV-only date is on the team pages alone.
- Rosters and player stats cover all 102 teams (§1.1j, §1.1k): the 43 teams of the four earlier leagues
  were read live on 2026-10-03 and the six EAL teams on 2026-10-04 (every page parsed, no team failed;
  Corning has no roster and no stats at MaxPreps), and all 99 again on 2026-10-05 Pacific (`fetchedAt`
  2026-10-06T02:26Z, `counts.errors` 0), the first read of the 50 SoCal teams (Bonita and Chaminade among them,
  then Sunset teams; independents since later that day, DESIGN §24.10); Glendora, Harvard-Westlake and
  Thousand Oaks were first read on 2026-10-06 (`--leagues independents`: Glendora 19 players, Harvard-Westlake
  25 and 18 with stats, Thousand Oaks 21; Glendora and Thousand Oaks publish no stats). The school-site and
  recruiting-page overlay covers the four earlier leagues (SCVAL 2026-10-02; BVAL, PCAL, MCAL
  2026-10-03, recall partial in each), with only recruiting profiles for the EAL (2026-10-04). The 53
  Sunset, City, North County, Metro and independent teams' overlay entries hold recruiting profiles only
  (2026-10-06): no school-athletics sweep was made for them (`data/field-hockey/rosters-enrichment.json` notes). A team's page that does
  not parse fails that team (carried forward, or `error`), never writes a wrong value; a team no run
  has covered is `pending`. No current-season public source lists positions for most programs, no
  BVAL, PCAL or MCAL roster source (school site, paper, MaxPreps JV or earlier-season page)
  publishes a height or a 2026-27 number MaxPreps lacks (some players' NCSA recruiting profiles do
  list a height, but a profile is only linked from the row and never fills a field), and 14 teams (Del
  Mar, Silver Creek, Sobrato, Monterey, Santa Catalina, Corning and eight Southern California teams)
  have no MaxPreps players at all (Marin Academy had none until 2026-10-07).
  How much a coach enters varies by program in every league.
- College commitments (§1.1j3), in any sport, were researched on 2026-10-03 and 2026-10-04 (the six
  EAL teams' schools on 2026-10-04, for field hockey and then every sport, with none found, though
  without SportsRecruits' athlete search or web searches for freshmen and sophomores) and, for the 53
  Southern California teams' schools, on 2026-10-06 (twelve found, one under the revised nickname rule;
  web searches for 840 of the 842 rows, no SportsRecruits athlete search), and nothing refreshes them:
  recall is partial (39 of the 1,775 varsity rows, at 23 of the 102 schools, on 2026-11-22; social
  media, where most are announced, counts only from an official account), a signing or decommitment after that date is not
  shown (one signing, Phoebe Miller's, was found by 2026-11-22), and a roster refetch that drops or respells a committed row fails the build until it is
  re-checked by hand.
- Club ties (§1.1j2) were researched on 2026-10-03 (the six EAL teams' schools on 2026-10-04, adding
  eight ties for five players at Davis and Pleasant Valley, and three club records), re-read from the
  linked recruiting profiles on 2026-10-05 (14 more ties), and swept for the 53 Southern California
  teams' schools on 2026-10-06 (twelve club records and 76 ties), with one more tie from the 2026-10-07
  sweep of the rows MaxPreps added, and nothing refreshes them: recall is
  partial (on 2026-10-07, 149 of the 1,673 varsity rows, at 48 of the 102 schools; the Los Angeles,
  Orange County and Ventura clubs publish no rosters), a `current` tie ages, and a roster refetch that
  drops or respells a tied row fails the build until the tie is re-checked by hand.
- Prior-season (2025-26) final standings exist in the repo for SCVAL and BVAL only (see §2 "2025-26
  history, by league"); PCAL, MCAL, the EAL and the four SoCal leagues are marked `unavailable` in
  `data/field-hockey/history-2025-26.json` (the CCS and San Diego Section 2025 playoff brackets are in
  `data/field-hockey/history-brackets-2025-26.json`),
  since a MaxPreps league URL's year segment is cosmetic. Last season's *games* are on MaxPreps for
  all nine leagues (§1.1 (l)) and seed the Elo rating, but they are coaches' entries like this
  season's, and nothing on the site prints them as a record or a standings table.
