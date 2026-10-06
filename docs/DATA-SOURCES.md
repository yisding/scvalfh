# Data sources — California girls varsity field hockey (season "26-27")

Condensed from the build-time research spec and amended for the nine-league site: in Northern
California SCVAL, BVAL and PCAL in the CIF Central Coast Section, MCAL in the North Coast Section and
EAL in the Northern Section; in Southern California the Sunset in the Southern Section, the City,
North County and Metro conferences in the San Diego Section, and the Southern Section's five
independents, Bonita, Chaminade, Glendora, Harvard-Westlake and Thousand Oaks, schools in no field hockey
league whose games against each other are the group's table (102 teams; DESIGN §24, §24.9, §24.10).
Confidence tags: **[V]** independently verified against a live response or document; **[U]**
claimed but not independently re-verified; **[TODO]** open item. Values below were
captured/verified 2026-09-28 to 2026-10-04; the EAL's captures, and every EAL line below, are
2026-10-04; the Southern California captures, and every Sunset and San Diego line below, are
2026-10-06 unless dated otherwise.

See also `docs/LEAGUE-RULES.md` (each league's points, tiebreak chain, postseason and the by-law
citations), `docs/BYLAWS-2026-27.md` (the verified SCVAL by-laws, which override anything below
that touches SCVAL ordering) and `lib/leagues.ts` (every league constant as shipped; the season
ids are in `lib/season.ts`).


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
| | `2` | neutral | **[U]** never observed |
| `teams[].contestType` | `0` | league/conference game | **[V]** 21/21 agreement with prose |
| | `1` | non-conference | **[V]** |
| `calculatedFields.contestState` | `0` | unknown | **[U]** not observed |
| | `1` | **Deleted** — `canonicalUrl` null, may still carry a real score (observed: a scrimmage with a 0-4 score) — **must be dropped before constructing a `Game`** | **[V]** |
| | `2` | Pregame / scheduled | **[V]** |
| | `3` | ContestInProgress (live): observed on three Southern California contests dated 2026-10-05, read that evening (~17:05 PT) while they were being played or had just ended: Otay Ranch at Eastlake `601ffe30-7e13-4bac-92f0-d03c53bac7ea`, Chaparral at Temecula Valley `37865d67-1dd6-480f-b1ca-e36d2bb275e9`, University City at Point Loma `c65dd446-70ac-4df9-9859-b6c62a81b091`. `lib/normalize.ts` reads it as `live` | **[V]** 3 contests, 2026-10-05 |
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
`athleteData`: an array of **37-element positional arrays**, one per athlete — the same tuple encoding
as the schedule page (1.1i), so it is pinned behind an adapter with loud assertions
(`lib/sources/maxpreps-roster.ts`, written by `scripts/fetch-rosters.ts` to `data/rosters.json`).

**Scope: every registry team, all nine leagues and the five independents (102).** The roster page is the same page for a team
of any league, so `scripts/fetch-rosters.ts` walks the whole registry (`TEAMS`), and
`data/rosters.json` (`lib/rosters-schema.ts`) holds exactly one entry per team, in registry order,
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

The previous file is salvaged row by row (`readPreviousFile` in `lib/fetch-scope.ts`): each row is
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

The column names are MaxPreps' own **[V]**: the roster page component (build `77480dfe-046b5bf4`,
`asset.maxpreps.io/_next/static/chunks/1x2mehrsrg-g8.js`, found via `_buildManifest.js` →
`/team/roster`) does `deserializeArray(GSSP_ROSTER_SERIALIZE_KEYS, athleteData)` with
`obj[KEYS[i]] = row[i]`. KEYS, verbatim:

```
 0 linkedAthlete       8 jersey            16 isCaptain          24 hasPhoto           32 formattedPositions
 1 linkedParents       9 heightInches      17 isDeleted          25 rosterId           33 formattedName
 2 canStartChat       10 heightFeet        18 photoUrl           26 schoolId           34 formattedHeight
 3 accountInformation 11 weight            19 secondaryPhotoUrl  27 sportSeasonId      35 calculatedHeight
 4 athleteId          12 position1         20 weightClass        28 sportSeasonName    36 formattedClassYear
 5 firstName          13 position2         21 isPlayerOfTheGame  29 careerProfileId
 6 lastName           14 position3         22 isFemale           30 createdOn
 7 classYear          15 hasStats          23 bio                31 canonicalUrl
```

Gotchas, all **[V]** on the 2026-10-02 captures (342 rows, 16 teams):
- `isDeleted` rows are soft-deleted: the public table hides them (`useRosterAthletes` →
  `.filter(a => !a.isDeleted)`) and `athleteCount` excludes them. **Drop them first.** One exists
  (Santa Clara: 17 rows, 16 shown).
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

**Beyond MaxPreps — school athletics sites (`data/rosters-enrichment.json`).** The overlay has one
entry per registry team (102), joined on `slug + athleteId`; its rules below hold for every league.
SCVAL was swept on 2026-10-02 and BVAL, PCAL and MCAL on 2026-10-03 (the second sweep's tables
follow the SCVAL one). The six EAL entries, added 2026-10-04, hold **recruiting profiles only** (the
"Players' own recruiting pages" sweep below, run the same day): no coaches or sources, and each
team's note says the school-athletics roster sweep has still not been done. They fill no MaxPreps
field, and a team page says nothing about other sources (`otherRosters` is absent, "not checked").
The 53 Southern California entries, swept 2026-10-06, are the same: recruiting profiles only. On the 2026-10-04 MaxPreps rows alone, the EAL's 95 players have 95 grades and
95 numbers, 56 positions and 7 heights. What a team page with no MaxPreps players says about other sources is
recorded per team, not inferred: `otherRosters` (validated in `lib/rosters.ts`) is `none` (looked,
no current roster anywhere: Del Mar, Silver Creek, Sobrato, Monterey, Santa Catalina), `partial`
(a source lists current players in a form that cannot be joined, with a link: Marin Academy's
school page, 18 players as first name, last initial and class year) or, when absent, not checked.
Only `none` lets the page say "no other public source we checked has a current roster". The
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
| Marin Academy | 0 | 0 | 0 | 0 | 0 | School list (18 players) is first name, last initial and class year only; MaxPreps has no rows to join |

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

Rules of the overlay, enforced by `lib/rosters-schema.ts` and re-checked against the base file in
`lib/rosters.ts` at load: it joins on `slug + athleteId` (MaxPreps rows only — a school-only name is
counted, never added); it fills a field **only where MaxPreps is null**; where a source disagrees
with MaxPreps (SCVAL: 9 numbers, 1 position, 1 grade; BVAL, PCAL and MCAL: 2 grades) MaxPreps stays and the disagreement is stored under
`conflicts`, which also hold, with `kept: null`, the sources of a grade left blank because they
disagree with each other (17 entries for 8 BVAL, PCAL and MCAL players); every filled value carries `kind`, `source` URL and `confidence` (`high` = an official
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

**Players' own recruiting pages (`profiles` in `data/rosters-enrichment.json`; swept for SCVAL on 2026-10-02, BVAL, PCAL and MCAL on 2026-10-03, the EAL on 2026-10-04 and the 53 Southern California teams on 2026-10-06).** A second sweep on
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
SportsRecruits, 87 NCSA and 14 FieldLevel.** Four sweeps ran in parallel (Sunset and the independents;
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
| EAL: Bella Vista, Corning | none found | Bella Vista's only near matches are another class year (Rosy Johnson) and lacrosse pages. |

The rule: a page is linked only when it names the player (or the school's spelling, `sourceName`)
and field hockey, and either names this school or shows the class year the roster shows plus a
California hometown. A stated class year must agree with the row's grade; `lib/rosters.ts` refuses
the file at load otherwise. Social media, news stories and profiles for other sports are not
linked; several rostered players have lacrosse or softball profiles on SportsRecruits, instead
of or beside a field hockey one.

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

EAL differences, all **[V]** on 2026-10-04: the six teams hold 95 players on `data/rosters.json` (Bella
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

**(j2) Clubs and club affiliations** — `data/clubs.json` (`lib/clubs-schema.ts`, read by
`lib/clubs.ts`; shown on `/clubs`, `/clubs/[slug]` and in a club line on each team page's roster,
DESIGN §17). Research on 2026-10-03, with an EAL sweep on 2026-10-04 and a re-read of the linked
recruiting profiles on 2026-10-05, and a Southern California sweep on 2026-10-06, not a script: nothing fetches or refreshes it. It holds 28 youth field hockey clubs (13 from 2026-10-03, 3 from
2026-10-04, 12 from 2026-10-06) and 170 affiliations (72 from 2026-10-03, 8 from 2026-10-04, 14 from 2026-10-05, 76 from 2026-10-06), each a tie between a player on the 102 tracked varsity rosters and a club, joined to `data/rosters.json` on team slug + MaxPreps athleteId as the overlay
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
class year that disagrees with the roster grade rules one out (`lib/clubs.ts` refuses the file at
load otherwise: MaxPreps' grade, else the overlay's; Riya Mehrotra and Gabrielle Moll have no grade
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
`data/rosters-enrichment.json`, `data/commits.json` or this file was re-read for the clubs it lists:
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
- **Fly FHC's team-roster page sits behind a SiteGround captcha.** Its lists give names only (no
  school, no class year) and could not be re-read, so none of its names, and none of its team
  labels, are used.
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
tied to more than one club). The sweep met three clubs near the EAL teams' schools, and all three were added on
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
Monterey, Santa Catalina, Marin Academy) list no players on MaxPreps, so there is no row to tie
anyone to. In the EAL, none at Bella Vista, Corning and Lassen (Corning lists no players on
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
`pnpm fetch-rosters` drops or respells a tied player's row, if the overlay marks it JV, or if a
season rollover moves `data/rosters.json` to a season `data/clubs.json` is not for, `lib/clubs.ts`
throws at import, so `pnpm test` and the build fail with
`clubs: <team> / <player> (<club>): <what>`. Re-check that affiliation's sources and edit or drop
it by hand (on a rollover, redo the research for the new season). It is never pruned
automatically.

*JV ties.* `jvAffiliations` holds ties for players on JV rows, kept apart from `affiliations`, which
list varsity rows only and are all the club pages, the club counts and the roster's club lines
show. They are the same records under the same rules, except that each must join to a row the
overlay marks JV (`lib/clubs.ts` refuses the file otherwise, and a player is in one list or the
other, never both); `getJvClubAffiliations()` serves them, and nothing renders them yet. They were
recorded on 2026-10-05 from the recruiting-profile re-read (a SportsRecruits page's CLUB and TEAMS
blocks, read in a browser because they are rendered by script): four ties for three Los Gatos JV
players, Casey Moorehouse (NorCal Impact and SF Hawks), Beatrix Monk (NorCal Impact U16) and Colette
Von Klemperer (NorCal Impact), each on her own profile with a class year that agrees with the roster
grade, and each current under the live-profile rule. Only the profiles the overlay links were read,
so other JV players may have club ties no page here records.

**(j3) College commitments** — `data/commits.json` (`lib/commits-schema.ts`, read by
`lib/commits.ts`; shown on `/commits` and in a commitment line on each committed player's team page
roster, DESIGN §21). Research on 2026-10-03 (field hockey) and 2026-10-04 (every sport, and a second
field hockey pass; and, for the six EAL teams' schools, a field hockey sweep and then the every-sport
round; and, on 2026-10-06, the every-sport round for the 53 Southern California teams' schools), not
a script: nothing fetches or refreshes it. It holds 28 commitments (17 in field hockey, 9 in lacrosse,
1 in soccer, 1 in basketball) and the 22 colleges they are to, with 25 programs (UC Davis, Cal and
Harvard hold two each: field hockey and lacrosse), each commitment a player on the tracked varsity
rosters (43 teams in both NorCal rounds; 49 with the EAL; 102 with Southern California), joined to `data/rosters.json` on team slug + MaxPreps
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
| Saint Francis | Carolyn Cordoni (2027) | Field hockey | Bates | NCAA Division III | Her own SportsRecruits profile, which names Saint Francis; SportsRecruits' Bates page, built from the same profile. Undated |
| Christopher | Alyssa Montejano (2027) | Field hockey | Maryville | NCAA Division II | Her own SportsRecruits profile (class of 2027, Gilroy, CA; no school named, so the class year plus a Gilroy hometown); SportsRecruits' Maryville college page, built from the same profile. Undated |
| Christopher | Ryan Hemeon (2028) | Field hockey | UC Davis | NCAA Division I | One line on FH College Path's class of 2028 list: name, CA, position, Infinity Sports Club. Medium: no school is named, so the class year plus a Gilroy club this row is already tied to (§1.1j2). Her own SportsRecruits profile shows no commitment, which is absence, not contradiction. Undated |
| Redwood | Claire Johnson (2027) | Lacrosse | Cal | NCAA Division I | The Marin IJ's Apr 23, 2026 girls lacrosse story ("Redwood’s Claire Johnson, a junior committed to play at Cal"; `asOf`); her own SportsRecruits lacrosse profile (names Redwood High School); STEPS California's commitments page |
| Redwood | Phoebe Miller (2027) | Lacrosse | San Diego State | NCAA Division I | The same Marin IJ story ("a junior committed to play at San Diego State"; `asOf`); her own SportsRecruits lacrosse profile (class of 2027, Larkspur, CA); STEPS California's commitments page (Redwood High School) |
| St. Ignatius | Sofie Stiefel (2027) | Lacrosse | Marist | NCAA Division I | Her own SportsRecruits lacrosse profile (listed under St. Ignatius's girls' lacrosse); STEPS California's commitments page. Undated |
| St. Ignatius | Catherine Cecchini (2027) | Lacrosse | Bucknell | NCAA Division I | Her own SportsRecruits lacrosse profile, as Cate (its bio names St. Ignatius College Prep and the class of 2027); STEPS California's page (Cate Cecchini, St. Ignatius College Prep). Undated |
| Marin Catholic | Gianna Rinaldi (2028) | Lacrosse | UC Davis | NCAA Division I | Her own SportsRecruits lacrosse profile (class of 2028, Novato, CA; no school in its text, so the class year plus a Marin hometown); SportsRecruits' UC Davis lacrosse page, built from it. Undated |
| Stevenson | Zola Ducker (2027) | Lacrosse | Trinity (Conn.) | NCAA Division III | Her own SportsRecruits lacrosse profile (class of 2027, Pacific Grove, CA, Verve Lacrosse); Lacrosse Masters' girls' commitment list ("Verve Lacrosse / Stevenson School - CA - 2027"); SportsRecruits' Trinity page. Undated |
| Berkeley | Violet Potts (2027) | Lacrosse | Vassar | NCAA Division III | Her own SportsRecruits lacrosse profile (class of 2027, Berkeley, CA, ADVNC Lacrosse); ADVNC Lacrosse's own commitments page (its 2027 class: "Violet Potts - Berkeley - Vassar"). Undated |
| St. Ignatius | Gigi Colant (2027) | Soccer | St. Lawrence | NCAA Division III | Her own SportsRecruits soccer profile, under her given name Gabriella (its bio names Saint Ignatius College Prep, the class of 2027 and "Gigi Colant"); SportsRecruits' St. Lawrence soccer page. Undated |
| Saratoga | Emma Williams (2027) | Basketball | Bryn Mawr | NCAA Division III | The Saratoga Falcon's Mar 20, 2026 story, "Junior commits to Division III basketball at Bryn Mawr College" (the paper is Saratoga High School's; she committed in late February, so `asOf` is 2026-02). One source |
| Torrey Pines | Dylan Rietti (2027) | Field hockey | Richmond | NCAA Division I | Her own SportsRecruits profile (names Torrey Pines); the Falconer's (Torrey Pines' student paper) Sep 22, 2026 story ("committed … in July"; `asOf` 2026-07) and Sep 16, 2026 commitments story; FH College Path's class of 2027 list; SportsRecruits' Richmond page |
| Torrey Pines | Ava Hauer (2027) | Field hockey | Johns Hopkins | NCAA Division III | Her own SportsRecruits profile; the Falconer's Sep 16, 2026 story (`asOf`); SportsRecruits' Johns Hopkins page |
| Bishop's | Lola Conway (2028) | Field hockey | Michigan | NCAA Division I | Her own SportsRecruits profile (TEAMS names The Bishop's School); FH College Path's class of 2028 list; SportsRecruits' Michigan page. Undated |
| Harvard-Westlake | Margaux Schlumberger (2027) | Field hockey | Harvard | NCAA Division I | Her own SportsRecruits profile (names Harvard Westlake High School); FH College Path's class of 2027 list; SportsRecruits' Harvard page. Undated |
| Scripps Ranch | Samantha Ippolito (2027) | Field hockey | Michigan State | NCAA Division I | Her own SportsRecruits profile; the San Diego Union-Tribune's Sep 22, 2025 athletes-of-the-week item (`asOf`); Scripps Ranch News (Oct 3, 2025 and Sep 21, 2026, dated from the site's WordPress API); FH College Path; RUSH's player page; SportsRecruits' Michigan State page. The row has no grade: every page says 2027 |
| Canyon Hills | Eva Allen (2028) | Field hockey | Cal | NCAA Division I | Her own SportsRecruits profile, as Eva Jo Allen (its bio names Canyon Hills High School); FH College Path's class of 2028 list; RUSH's player page; SportsRecruits' Cal page. Undated |
| Canyon Hills | Rylie Storm (2028) | Field hockey | Harvard | NCAA Division I | One line on FH College Path's class of 2028 list (name, CA, position, Rush FH). Medium: no school is named, so the class year plus a San Diego club this row is already tied to (§1.1j2). Her own profile shows no commitment, which is absence, not contradiction. Undated |
| Canyon Hills | Reese Roldan (2027) | Field hockey | UC Davis | NCAA Division I | One line on FH College Path's class of 2027 list (Rush FH); RUSH's player page, whose College Commitment field is a UC Davis logo linking to its field hockey page. Medium, on the same ground as Storm. Undated |
| San Dieguito Academy | Ella Rennie (2027) | Field hockey | Muhlenberg | NCAA Division III | Her own SportsRecruits profile (names San Dieguito Academy); Play College Field Hockey's sheet ("June 19, 2026" under Date Committed; `asOf`); SportsRecruits' Muhlenberg page. The row has no grade: every page says 2027 |
| Bishop's | Emerson Davis (2028) | Lacrosse | Harvard | NCAA Division I | Her own SportsRecruits lacrosse profile (TEAMS names The Bishops School); SportsRecruits' Harvard lacrosse page. Undated |
| Cathedral Catholic | Lia Palecek (2028) | Lacrosse | Oregon | NCAA Division I | Her own SportsRecruits lacrosse profile (names Cathedral Catholic High School); SportsRecruits' Oregon lacrosse page. The row has no grade: every page says 2028. Undated |

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
that disagrees with the roster grade rules a match out, and `lib/commits.ts` refuses the file at load
otherwise (for a row with no grade, the stated class years must agree with each other and be a class
a high school roster of the season can hold). Not a commitment: MaxPreps' "College Interests"
(`careerCollegeInterestsData` on a career `/bio/` page, which was empty for every in-scope player
anyway), offers, visits, camps, watchlists, all-league lists, and a place on a college's club team
(club lacrosse, for one). No
social media, as source or link: `BANNED_HOSTS` (shared with §1.1j2) refuses Instagram, Facebook,
TikTok, X, Threads, YouTube, Snapchat, LinkedIn and their short links.

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
  either, which is stale; since no quote can be checked against the page as served, it is not cited,
  and its hidden dates are not used.
- **SportsRecruits splits by sport, and draws some of its pages with a script.** A profile lives on
  one sport's subdomain (`nfhca.` field hockey, `iwlca.` lacrosse, `my.` soccer and others), and
  `sportsrecruits.com/athlete/<slug>` redirects there, so a probe must follow redirects. A college
  page shows only its first ten committed athletes, and its "See More Commits" call returns another
  sport's (lacrosse) entries. A club's `/committed/<club>` page and a profile's "Committed to … on
  M/D/YYYY" tooltip are drawn by a script: one rendered read saw the dates, no second read confirmed
  them, so neither the pages nor the dates are used.
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

*Recall is partial.* On 2026-10-06, 28 of the 1,653 varsity rows have a commitment, at 16 of the 102
schools: Southern California's 12 at 7 (Torrey Pines 2, Canyon Hills 4, Bishop's 2, Harvard-Westlake,
Scripps Ranch, San Dieguito Academy and Cathedral Catholic 1 each). Every one of the 842 rows had a
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
Corning has no roster rows to join to. A commitment announced only on social media, posted on a page
the sweeps could not read, or not yet public is not listed, and colleges may not publicize an
unsigned recruit, so a college's own site rarely shows a class of 2027 or 2028 commitment before the
November signing period. No source found said any player had signed. The class of 2027's signings
and the class of 2028's commitments are when a new sweep would change the file most.

*When a roster refetch breaks it.* As for §1.1j2: `lib/commits.ts` throws at import if a committed
player's row is dropped, respelled or marked JV, or if `data/rosters.json` moves to another season,
with `commits: <team> / <player> (<college>): <what>`. Re-check the commitment and edit or drop it by
hand; on a rollover, redo the research (the seniors will have graduated).

**(k) Player stats** —
`GET /gatewayweb/react/team-season-player-stats/rollup/v1?teamId=&sportSeasonId=` on the ghost API
(JSON; captured and verified 2026-10-02 on the 15 SCVAL teams, and 2026-10-03 on a sample of the
other three leagues; the rest of those were read live by the script, and the six EAL teams on
2026-10-04). Like the rosters it joins to, it covers every registry team, all nine leagues and the five independents (102): one
call per team,
and `data/player-stats.json` (`lib/player-stats-schema.ts`) holds exactly one entry per team in
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
the same chunk: `team-season-game-stats/rollup/v1` (the team's stats game by game, read only for a
team a game note credits; see "Stats in the game note" below), and, not used,
`team-season-stats/rollup/v1` and `team-leaderboard-leaders/v2`; a `leagueId=` parameter limits the
rollup to league games.
`lib/sources/maxpreps-player-stats.ts`, written by `scripts/fetch-player-stats.ts` to
`data/player-stats.json`.

Shape **[V]**: `data.groups[]` = "Field Stats" and "Goaltending Stats", each with `subgroups[]` (a
second "… (2)" subgroup carries the overflow columns), each a table: `stats.columns[]`
`{name, header, displayName, overallValue, columnType}` and `stats.rows[].columns[i]`
`{value, href, caption}` lined up with `stats.columns[i]`. The `Name` cell's `href` is the athlete's
career URL — its `?careerid=` joins to `data/rosters.json` (121/121 rows on 2026-10-02) — and its
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
  they ever do not.
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
  scored by Emery Borges" (Oct 5 vs Cupertino). `lib/note-stats.ts` reads such notes on **every**
  team's finals and adds what they credit to the MaxPreps numbers the team page and /leaders read:
  - **What it reads:** goals, assists and saves, in the forms coaches write them: a list after a
    lead-in ("goals scored (by) A, B", "goals: A (2), B", "scorers: …", "assists: …", a goal with its
    assist as "A from B" or "A (assist B)"), a statement per comma-separated piece ("A scored twice",
    "A 2 goals", "A had an assist", "A hat trick", "hat trick for A"), and saves ("Lacey … 7 saves",
    "7 saves by Lacey"). A piece that mentions goals, assists, saves or scoring but fits none of
    these is reported in the team's warnings, never guessed at.
  - **Names:** credited only when the name fits exactly one player on exactly one of the two
    rosters: the full name; a curated alias (`lib/name-aliases.ts`: Emery Borges = Emry Borges,
    confirmed by the site owner); a full name whose first name is a common nickname of the roster's
    (Gabby = Gabrielle), or whose first or last name is one letter off (Emery/Emry, Molly/Moll; 4+
    letters only), or whose last name is part of a longer one (Lacey Carattini = Lacey Sebastian
    Carattini); or a lone first or last name only one roster player has (Lacey).
  - **Not counting twice:** MaxPreps' game pages carry no box score, but the sibling
    `team-season-game-stats/rollup/v1` (same parameters) gives the TEAM's stats game by game **[V]**
    2026-10-06: Homestead's four sheet goals are entered on Lynbrook (3) and Los Altos (1, in a game
    Homestead lost 0-1), and Sep 28, Sep 30 and Oct 5 have 0 goals and 0 saves.
    `scripts/fetch-player-stats.ts` reads it (`lib/sources/maxpreps-game-stats.ts`, into the team's
    `gameTotals`) for each team a note credits — one call on 2026-10-06 — and a noted game whose
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
  - **Overtime.** A final MaxPreps records with 0 overtime periods counts as one period of
    overtime (two for "double OT" / "2OT") when its note says so: "OT" in capitals as a word of
    its own, or "overtime", never right after "no", "not", "without" or "never" (`overtimeFromNote` in `lib/normalize.ts`, the same
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
  (non-fatal) and commits `data/player-stats.json` with the snapshot when its content changed; the
  script leaves the file untouched when only its `fetchedAt` stamps would move.
  Each team a game note credits costs one more call, the per-game totals (above): one on 2026-10-06.

**(l) Last season's results** (the Elo rating's starting point, DESIGN §20.1) — `data/prior-season.json`
(`lib/prior-season-schema.ts`, loaded by `lib/prior-season.ts`), built once a season by
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
- Cost: one `team-context/v1` read (about 0.55 MB) and 102 schedule reads (about 150 KB each; 99 before the independents joined, 43 when
  measured), through the primary client's budget, once a season. The 2024-25 season (`c388901e-…`, 354
  games) was read the same way to test the starting point and is not kept.

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
   for a team page or waits for a later run; `lib/backfill.ts` `scoreboardCoverage` is positive-only),
   never a conclusion. **[V]** 2026-10-06.

**Role in this project (owner decision D2, §5.2):** a cross-check, a same-day scoreboard with
timezone-correct timestamps and — under ten mechanical rules, for official league fixtures
MaxPreps lacks, for past MaxPreps contests between two of our teams that have no score, and for
three mechanically detected wrong finals — a **backfill**: its score may be published where MaxPreps
has no game, no score, or a plainly wrong row. MaxPreps remains the primary source. A team on si.com
is identified **by id** (§5.3), never by bare name.

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
  Oct 26; EC Tue/Thu Sep 10 → Oct 27; plus the Fri Oct 30 crossover.
- **Standings PDF:** 4 stacked blocks (DeAnza V, El Camino V, DeAnza JV, El Camino JV), row regex
  `/([A-Za-z .]+?)\s{2,}(\d+-\d+(?:-\d+)?)\s*$/`. ⚠️ The "Overall record" column is empty in the
  25-26 file. 2025-26 varsity final: DA — St. Ignatius 11-0-1, St. Francis 10-1-1, Los Altos
  6-4-2, Valley Christian 6-5-1, Homestead 2-9-1, Fremont 2-10, Cupertino 1-9-2 (**7 teams — no
  Wilcox**). EC — Los Gatos 14-0, Mitty 11-2-1, Palo Alto 8-5-1, Saratoga 7-5-2, Presentation
  7-6-1, Santa Clara 4-9-1, Lynbrook 1-13, Monta Vista 1-13.
- **2025-26 history, by league** (`data/history-2025-26.json`, built by `pnpm build-history`; one
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
    does not ingest it, because the schema has no awards-only state. No champion is stated.
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
    extend `scripts/build-history.ts`, and the schema (`lib/history-schema.ts`) already validates it against
    the league's own registry slugs and divisions (PCAL, MCAL and EAL are single-division).
- **No 2026-27 standings PDF exists yet** — poll the index for `/2026-27.*field hockey.*standings/i`
  rather than hardcoding a URL.

Rest of scval.com (legacy `fieldhockey_TR.html`, `schedules.html`, homepage ticker) is 9+ years
stale — dead weight, not used.

### 1.3a OFFICIAL — BVAL, PCAL and MCAL schedules (bundled, hash-checked)

BVAL, PCAL and MCAL publish their schedules as documents with no feed, so their league fixtures
were transcribed once (2026-10-02) and are **bundled** in `data/official/{bval,pcal,mcal}-2026.json`
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
4. **Review the diff** of `data/official/*.json` (`git diff`): only the fixtures that really moved
   may change.
5. Update `bundledSha256` and `revisedOn` for that division in `lib/leagues.ts` (the sha256 of the
   new document's bytes: `sha256sum <file>`); for MCAL's changes cell update
   `officialChanges.sha256` to the hash of the cell text. Update the matching
   `official/revision/<division>.txt` (or `official/changes/mcal.txt`) in the test corpus so the
   "unchanged" case stays true.
6. `pnpm test`. Commit the data and config together.

SCVAL is the exception: its two schedule PDFs are read **live** every run (see §1.3) and parsed
with `pdftotext`; the carried-forward annotations keep a failed run from losing them.

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
in `lib/standings.ts`, the single definition the pipeline and the pages share): a game MaxPreps
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
SCVAL 7, BVAL 4, PCAL 2, at-large 3 = 16 total. High seed hosts through semifinals. (Selection
committee and at-large criteria are the **playoff** tiebreak, distinct from the league-standings
tiebreak in `docs/BYLAWS-2026-27.md`.)

**Machine-readable calendar:** `https://cifccs.org/calendar/Field_Hockey?print=ical` (⚠️ the
`?print=ical` query form is required — the bare `.ics` path 404s). Exactly 5 all-day VEVENTs
(Nov 2/7/11/14/19). ⚠️ Live typo: the semifinals SUMMARY reads **`"CCS Semfinals"`** — match on
the misspelling. RSS twin at `?print=rss`.

⚠️ **CCS bracket pages are not programmatically usable** — 0 `__NEXT_DATA__`, 0 ld+json, no API
URL; the page is rendered client-side by PrestoSports' RequireJS bundle. A headless browser would
be required.

**Preferred playoff bracket source once published:** MaxPreps' tournament page
(`https://www.maxpreps.com/tournament/3jB4uWWtwk20vrdggAkzMA/field-hockey-26/2026-central-coast-section-field-hockey-championship.htm`),
which currently shows `<div class="not-published">…`. **Best-supported plan:** once brackets
publish, playoff games should surface in each qualifying team's `schedule-calculated` feed via
`calculatedFields.bracketName/bracketGameIndex/bracketIsPublished/tournamentName/
tournamentCanonicalUrl` (untested — those fields are null in the regular season; verify on Nov 7).
Poll both from Nov 2. Fallback: CCS posts results as plain text on X/Twitter.

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

### 1.7 JV games — MaxPreps JV feeds, supplemented by si.com JV pages (`data/jv.json`)

Built by `pnpm fetch-jv` (`scripts/fetch-jv.ts`), twice a day in season after the player stats
(`update-data.yml`, allowed to fail). Listed on team pages (`#jv`) and day pages (`#jv`), **kept apart
from varsity**: no varsity table, record, leader board, rating or postseason picture reads them. JV
tables of their own are computed (`lib/jv-standings.ts`, last bullet). Read 2026-10-05 **[V]**.

- **MaxPreps.** The JV season has its own id: `__NEXT_DATA__.query` of
  `https://www.maxpreps.com/ca/field-hockey/jv/` gives `ssid` `fae4fc22-6de6-47ae-972d-e290b0ec31ef`,
  `teamLevel` `JV`, `teamlevel` `c083cdee-7526-423c-a9c8-4e6da6d6f4e2`, `allSeasonId`
  `d5b0e954-d53f-40cc-a3aa-c45b3a536618` (`JV_SPORT_SEASON_ID` in `lib/season.ts`). The team id is
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
  names the school's JV team page; the 48 paths (all but Marin Academy, which has no si.com page) are
  in `lib/jv-teams.ts`. A JV side is one of ours only by those ids (`JV_SLUG_BY_SBLIVE_ID`), never by
  name or by the varsity resolver (which ignores Tamalpais JV and York on purpose). Kept: scored
  finals on `/california/field-hockey/games/` pages; the page must be the JV team asked for. On
  2026-10-05: 68 scored JV finals; no EAL JV page has a score. Matched against MaxPreps by pair and
  date, si.com agreed on 38 of 41 finals; the 3 disagreements include a reversed result
  (Los Altos–Homestead, Sep 14).
- **The merge** (`lib/jv-merge.ts`, run at build time from the file): MaxPreps first. A si.com final
  of the same registry pair within ±1 day fills a MaxPreps game dated today or earlier that has no
  score (`provenance.scores: 'sblive'`, backfill rule `score-pending`, the †), and is recorded beside
  a MaxPreps final it disagrees with (`provenance.scoreConflict`; MaxPreps' score is shown). A si.com
  final of two registry schools with no MaxPreps JV contest of the pair within ±14 days becomes a
  `sblive:<id>` game (rule `absent-fixture`, host from si.com's `isHome`). Never used: a game two JV
  pages list with different scores, a row against a school outside the registry, two rows equally
  near one game. On 2026-10-05: 7 filled, 12 added (8 involve PCAL schools), 3 differ.
- **Rosters and stats** (not shown): MaxPreps' `/jv/roster/` lists players for 11 schools (Homestead
  25, Palo Alto 25, Monta Vista 12, Los Gatos 2, Leigh 18, Greenfield 3, Salinas 1, Tamalpais 22,
  Bella Vista 19, Davis 19, Lassen 15) and `/jv/stats/` has leaders for 4 (Monta Vista, Bella Vista,
  Davis, Lassen).
- **Official documents** list JV only as start times on the varsity fixtures (SCVAL "Varsity 4:00
  followed by JV"; BVAL a JV time per game; MCAL's change notes), and PCAL's `CAT/YOR` slot is York's
  JV in Santa Catalina's place. None is read for JV.
- **Cost:** 102 MaxPreps JSON calls through the MaxPreps client's gate and up to 101 si.com pages one at
  a time, 1 s apart (§1.2's client options); the 98 pages take at least 98 seconds of that spacing alone
  (about a minute in all when it was 49 calls and 48 pages). A failure is scoped to the school and the
  source: its previous rows are carried (`carried-forward`). The previous file is salvaged row by row,
  as fetch-rosters and fetch-player-stats salvage theirs: each team row, game and si.com row is held to
  its own schema, and one that fails costs only itself, named in the log. The whole-file schema fails
  whenever the registry grows, so before this a `--leagues` run over such a file sent every team
  outside the run to `pending`; now a team outside the run loses its games only when its own row is
  dropped (the run then exits 1).

- **JV standings** (`lib/jv-standings.ts`, computed at build time from the file and the snapshot).
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

### 1.6 Rejected sources (one line each)

- MaxPreps statewide/league legacy scoreboard (`?leagueid=` silently ignored; grouped by CIF
  section, not league) — the researched replacement is §1.1(c) `contest-ids-grouped-by-date-by-context/v2`.
  The pipeline uses neither and reads each team's schedule feed.
- `team-standings/v1` — only a 3-row window; use `leagues/{id}/standings/v1`.
- `/ca/field-hockey/standings/`, `/ca/field-hockey/leagues/`, `/_next/data/{buildId}/…` — 404.
- SBLive league-scoped scoreboard — inherits the wrong league membership.
- SCVAL DigitalSports site (`78929.digitalsports.com`) — populated with nothing, all AJAX
  endpoints return empty state; SCVAL never used it for field hockey.
- CCS bracket pages — client-rendered, no server-side data at all.
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

Shipped verbatim in `lib/season.ts`, re-asserted on every fetch run (§5), never hardcoded
elsewhere. Everything that differs by league lives in `lib/leagues.ts`.

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
| Sunset | Sunset (one division) | `aa46adc4-c188-4e3b-b5fd-857064176297` | Sunset | **5** / 10 (the five Orange County schools are missing) | no fixed number | Aug 18 – Oct 31 | informational only |
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
6 + 1 − 1, Metro South Bay 3 + 2 − 1, Sunset 5 + 5 − 0). The San Diego "Games a team" are a double
round robin, (teams − 1) × 2 [V: MaxPreps' schedules, 2026-10-06], with one pair short (§3.1); the
Sunset has no league schedule and no round robin, so it has no fixed number. Valley has no table, so it
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
  are excluded (`DATA_QUALITY.excludedContestIds`: Poway–Fallbrook `c7dbdbcc…`, Mission Vista–Fallbrook
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
| marin-academy | MA | mcal | marin-county | `9f489fa8-a23a-4924-a2a0-5c5cff3c0fdc` | Marin Academy | — | — |
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
| York (PCAL grid slot `CAT/YOR`) | plays JV field hockey only | in PCAL's `withdrawnNames`; the `CAT/YOR` token maps to Santa Catalina; si.com id 456851 ignored; team search answers "not covered" |
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
| Sunset | **membership** (`classification: 'membership'`, DESIGN §24.11): both sides are two of the eight Sunset teams and the game is dated Aug 25 to Oct 31, whatever MaxPreps' league flag says (the flag follows whichever scorekeeper entered the game) | `contestType` 2 and 4 on either row, and every game against a team outside the eight (Bonita at Great Oak, Aug 27, which MaxPreps flags) |
| City, North County, Metro | **membership** (`classification: 'membership'`): both sides are members of the division (the CIF-SDS 2026-27 League Alignment) and the game is dated inside its league play, whatever MaxPreps' league flag says | `contestType` 2 and 4 on either row, every San Diego Section playoff game (on or after Nov 2, or `contestType` 4), and every game outside the division's league-play dates |
| LA independents | **membership** (`classification: 'membership'`): both sides are two of the five independents (Bonita, Chaminade, Glendora, Harvard-Westlake, Thousand Oaks; this site's grouping, DESIGN §24.10) and the game is dated Sep 8 to Oct 31, whatever MaxPreps' league flag says (it flags only Bonita–Chaminade) | `contestType` 2 and 4 on either row, and every game against a team outside the five (Bonita's Aug 27 game at Great Oak, which MaxPreps flags as a league game, counts for neither table) |

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
`lib/snapshot-schema.ts` (schema version 2; a version-1 single-league file migrates in memory, a
version-2 file written before a configured league existed gains that league on load, DESIGN §22.7, and a
version-2 file whose games no longer classify under the current rules or registry is reclassified on load,
DESIGN §24.11).
Load-bearing rules baked into it:

- `Game.home`/`.away` carry `teamId: null` + a bare `name` for non-member opponents — every
  fixture is renderable without inventing a Team record.
- `Game.countsFor` is the division whose table the game belongs to (or `null`), set once by
  `lib/classify.ts`; `Game.postseason` tags CCS, SCVAL crossover, BVAL play-in, MCAL tournament and
  EAL Super Regional (`league-postseason`) games, which never count in a league table.
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
  `scoreConflict`. A si.com-only game has the contest id `sblive:<si.com game id>` (URL
  `/game/sblive-<id>`).
- `Standing.computed` (ours, from game rows) is the display source of truth; `Standing.reported`
  (MaxPreps' own numbers) is kept for cross-check and freshness display — see §2,
  `docs/LEAGUE-RULES.md` and `docs/BYLAWS-2026-27.md` for the ordering rules.
- `leagueHealth` (one row per league: `fresh`, `partial`, `degraded` or `frozen`, with reasons),
  `dropped` (contests removed on purpose, with the reason) and `supersededGames` (a si.com-only
  game later replaced by MaxPreps' own) are part of the snapshot and shown on `/about`.
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

**Player stats — 102 more MaxPreps requests, in a separate process:** the workflow then
runs `scripts/fetch-player-stats.ts` (one stats rollup per registry team, all nine leagues and the five independents, §1.1k) as a non-fatal step
(`continue-on-error`), so a stats outage never costs the day's scores, and commits
`data/player-stats.json` with the snapshot when its content changed. It is not part of the 131 below
and shares no abort scope with the pipeline.

### 5.0 Request budget per run

| Host | Requests | Notes |
|---|---|---|
| MaxPreps API | 131 | 1 bootstrap + 14 meta + 14 standings + 102 schedules; ≤3 concurrent, ≥500 ms spacing (about 30 s when it was 56 requests; the whole 2026-10-04 run of 64, every host, took about 46 s; the 2026-10-06 run's duration was not recorded) |
| scval.com | 3 | 2 schedule PDFs + the standings index |
| drive.google.com, pcalathletics.org, mcalsports.org | 5 | revision checks (BVAL ×2, PCAL, MCAL) + the MCAL `Schedir.htm` changes check |
| si.com | up to 15 + up to 8 | scoreboards for dates in the trailing 14 days that have a game; targeted team-games pages only for backfill candidates (§5.2 rule 8) |
| VNN | 2 | the Palo Alto and Los Gatos calendars |
| cifccs.org + MaxPreps HTML | 2 | only from `CCS.pollFrom` (Oct 25) |

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
division, Valley, has no MaxPreps table and makes neither request, nor does the independents' group) → schedules ×102 → normalize → official schedules → si.com → secondary (VNN, CCS) → classify →
guards → standings → assemble. Failure has three scopes, so **one league never blocks the others**:

| Scope | Effect | Triggers |
|---|---|---|
| **Run abort** (exit 1, nothing written, previous snapshot stays) | the whole run is rejected | (1) the bootstrap's season ids differ from config; (2) the league/team config or registry fails its own invariants; (3) the assembled snapshot fails schema validation; (4) a systemic outage: published games under 80% of the previous snapshot, or 60% or more of the feeds attempted failed, or every league in the run ended frozen |
| **League freeze** (`state: frozen`) | that league's games between its own teams, and its unmatched official fixtures, come from the previous snapshot and its table is recomputed from them, with the reasons published; other leagues publish fresh | (a) a division's metadata has the wrong season, year or section id; (b) 50% or more of the league's team feeds failed; (c) finals regression: counted finals in a division dropped by 3 or more against the previous run (1-2 vanished finals publish, each named in a warning) unless the league is passed to `--accept-regression`; (d) the league is not in `--leagues` |
| **Source stale** (`status: stale`, `carriedFrom`) | that source's previous contribution is carried and the league becomes `partial` | a MaxPreps standings table failing (0 rows, HTTP 400, schema error, network); a team feed failing (that team's games carry forward, guarded: never an `sblive:` game, never a contest another feed reported Deleted this run, the earlier classification cleared so the game is matched and classified again, and the phantom dedupe re-run over fresh plus carried games with the fresh row always winning); an SCVAL PDF failing or parsing empty; an official-revision or MCAL changes check seeing a new hash (fixtures still used); an si.com page not read this run (a failed page, an item past the team-page cap, `--no-sblive`, nothing to read, or every request failing): the earlier si.com fills its data covered are re-applied where still eligible, and a failed page's row is `stale` when something was carried in its place |

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

**Conditional extras:** the two SCVAL schedule PDFs + `Fall_index.html`; the `scval.com/standings/`
poll; the two VNN `.ics` feeds (start times/venues/JV); CCS calendar + MaxPreps tournament page
(**daily from Oct 25**, twice daily on Nov 7/11/14). Game venue addresses are fetched lazily, one
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
functions in `lib/backfill.ts`; match games across sources on `(date, unordered pair of teams)`.
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
   and `official` taken from the fixture. A si.com row that is the same game as an existing
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
   collisions (University, Los Altos, Santa Clara, Davis) never resolve by name.
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
    old `sblive:<id>` page stays as a stub linking the MaxPreps game (`supersededGames`, carried for
    the rest of the season). An earlier si.com fill is decided again only by the si.com data that
    covers it (a scoreboard row of the pair near the date, or a team page of either side). Whenever
    this run did not read that data — its page failed (a partial failure is enough), the item was
    past the team-page cap or not planned, `--no-sblive`, nothing was read, or every request failed —
    the previous snapshot's si.com game or override for it is re-applied where still eligible, and
    each failed page's source row is `stale` (rather than an error) when something was carried in
    its place. When no si.com page was read at all, the previous cross-check is carried too, keeping
    only the rows still true of this run's games (`carryCrossCheck` in `lib/crosscheck.ts`): a
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

All three lists are config (`DATA_QUALITY` in `lib/leagues.ts` and each league's `withdrawnNames`)
and everything dropped is published in the snapshot's `dropped` list and on `/about#dropped`.

- **Ghost teams** (`ghostTeamIds`): a MaxPreps team that is not a real team. Del Norte (Crescent
  City) `8396a0d3-8021-458d-b592-a5cb2c4a366d` has no league and team size 0; every contest with
  it is dropped.
- **Excluded contests** (`excludedContestIds`): two contests named by id with the reason, both
  MCAL — `5b9ff911-a640-4947-b9fd-8a629e775b33` (Tamalpais vs the Crescent City ghost; duplicates
  Tamalpais vs Del Norte of San Diego) and `5cf5e3df-6e72-4f44-9b8d-e69da30b85c5` (Archie Williams
  at Marin Academy, Aug 18: not on the official schedule; a spurious unscored row). An excluded id
  that no longer appears is logged once ("exclusion no longer needed").
- **Phantom duplicates:** two contests for the same pair on the same day inside one division keep
  the better one (final with a score over score-pending over scheduled, then contestType 0, then the
  later MaxPreps modification). Non-league doubleheaders are never touched.
- **Ignored si.com team ids** (`sbliveIgnoredTeamIds`): `456851` York (PCAL, JV only), `512156`
  Tamalpais JV, `485528` Wilcox (SCVAL, not fielding a team), `490259` Red Bluff (EAL, not fielding
  a varsity team in 2026), `490260` Red Bluff JV, and `635037` Educational Outreach Academy (a
  si.com placeholder carrying Red Bluff's original 2026 EAL fixtures, which si.com marks CANC, all
  without a score; §1.2 caveat 8).
- **Known non-member MaxPreps standings rows** (`maxprepsExtraRows`, per division, `{}` for the
  six earlier divisions): the EAL's Red Bluff row `4d3da788-bbe2-4ab9-b854-d95aa9786cda`, a 0-0-0
  row with no games. The reported-table step skips it without the "unknown school" warning, and the
  division's count rule is `maxprepsTeamCount + maxprepsMissing.length − extra rows =
  expectedTeams` (7 + 0 − 1 = 6).
- **Ignored MaxPreps league id:** `6e1f97d4-5211-4d98-bf59-282cd754bc5c` (the 0-team PCAL sibling
  table, §2).
- **Withdrawn names** (never members): SCVAL — Wilcox and its variants; PCAL — York and its
  variants; EAL — Red Bluff and its variants (Red Bluff High School, Spartans, Union High School). Their fixtures are dropped silently when an official schedule is parsed.

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
`data/snapshot.json` assert invariants only, since that file changes every run. An offline run
never touches the network.

Two fixture directories are provenance, not test input. `tests/fixtures/maxpreps/ghosts/` holds
the two MaxPreps schedule captures (Del Norte of Crescent City and Del Norte of San Diego) behind the
Del Norte (Crescent City) entries in `DATA_QUALITY.ghostTeamIds` and `excludedContestIds`
(`lib/leagues.ts`): the ghost's one contest, `5b9ff911`, duplicates Tamalpais vs Del Norte (San
Diego), `a05bedf5`. `tests/fixtures/sblive/pcal-1002/` is the research record for the PCAL si.com
fills of 2026-10-02: `fill-candidates.json` (how the pages were captured, the si.com team ids, the
fills, the rows dropped and the cross-check against MaxPreps) and `games-verified.json` (what each
game page shows), with the team and game pages they cite. No test, script or manifest reads these
files except `team-456851-york-falcons.html`, which `tests/backfill.test.ts` parses (York is JV
only, `DATA_QUALITY.sbliveIgnoredTeamIds`). Keep them when fixtures are refreshed.

### 5.6 Playoff polling from Oct 25

Before the CCS poll window, render the postseason sections from the by-laws-derived dates and each
league's ladder, with no polling. From `CCS.pollFrom` (Oct 25, before BVAL's last league games on
Oct 30, its Oct 31 play-in and the Nov 2 entries deadline) daily (twice daily on Nov 7/11/14):
fetch the CCS `?print=ical` calendar (match the `"CCS Semfinals"` typo), poll the MaxPreps
tournament page for `bracketPublished` flipping true, and continue the team `schedule-calculated`
calls, watching for populated `bracketName`/`bracketGameIndex`/`tournamentName` fields (untested —
verify live on Nov 7). Re-derive the CCS CloudFront PDF URLs each time; never poll the CCS bracket
page itself expecting data. **MCAL has no section playoff**: its tournament (play-in Fri Oct 23 if
needed, quarterfinals Mon Oct 26, semifinals Wed Oct 28, final Fri Oct 30 at Tamalpais) is read
from MaxPreps games dated on or after Oct 23 between MCAL teams. **The EAL's Super Regional (Oct
30-31) is not polled either**: no source is read for it and the site draws no bracket (§1.4). A game
between two EAL teams on or after 2026-10-30, or typed `contestType` 4 between them, is tagged
`league-postseason` and never counts in the league table; nothing of the kind had been observed
by 2026-10-04.

## 6. Legal / robots posture and attribution

`production.api.maxpreps.com/robots.txt` allows everything used here. `www.maxpreps.com/robots.txt`
disallows `/team/`, `/school/`, `/scores/` (with narrow `Allow:` carve-outs), among others — these
are root-anchored prefixes and do **not** match the paths this project uses (e.g.
`/ca/los-altos/los-altos-eagles/field-hockey/schedule/` is not under `/team/`). Field hockey is
not in the Googlebot sport-exclusion list. No `Crawl-delay` is published anywhere; the
≤3-concurrency / 500ms / once-or-twice-daily budget is entirely self-imposed. scval.com,
cifccs.org, si.com, mmboltapi, pcalathletics.org, mcalsports.org, cifns.org, fieldhockeyumpires.org
and the Google Drive download endpoint robots policies were not independently re-verified before
this build — check before a first production run. (The Section's Guidelines are read by hand, not
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

> Data from **MaxPreps** and **High School on SI (si.com)**. League alignment and rules from
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
- `dateCode` nonzero semantics, `contestState` 0/3, and `homeAwayType === 2` (neutral) were never
  observed in the wild — treat any future occurrence as unverified territory.
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
  (2026-10-06): no school-athletics sweep was made for them (`data/rosters-enrichment.json` notes). A team's page that does
  not parse fails that team (carried forward, or `error`), never writes a wrong value; a team no run
  has covered is `pending`. No current-season public source lists positions for most programs, no
  BVAL, PCAL or MCAL roster source (school site, paper, MaxPreps JV or earlier-season page)
  publishes a height or a 2026-27 number MaxPreps lacks (some players' NCSA recruiting profiles do
  list a height, but a profile is only linked from the row and never fills a field), and 6 teams (Del
  Mar, Silver Creek, Sobrato, Monterey, Santa Catalina, Marin Academy) have no MaxPreps players at all.
  How much a coach enters varies by program in every league.
- College commitments (§1.1j3), in any sport, were researched on 2026-10-03 and 2026-10-04 (the six
  EAL teams' schools on 2026-10-04, for field hockey and then every sport, with none found, though
  without SportsRecruits' athlete search or web searches for freshmen and sophomores) and, for the 53
  Southern California teams' schools, on 2026-10-06 (twelve found, one under the revised nickname rule;
  web searches for 840 of the 842 rows, no SportsRecruits athlete search), and nothing refreshes them:
  recall is partial (28 of the 1,653 varsity rows, at 16 of the 102 schools, on 2026-10-06; social
  media, where most are announced, never counts), a signing or decommitment after that date is not
  shown, and a roster refetch that drops or respells a committed row fails the build until it is
  re-checked by hand.
- Club ties (§1.1j2) were researched on 2026-10-03 (the six EAL teams' schools on 2026-10-04, adding
  eight ties for five players at Davis and Pleasant Valley, and three club records), re-read from the
  linked recruiting profiles on 2026-10-05 (14 more ties), and swept for the 53 Southern California
  teams' schools on 2026-10-06 (twelve club records and 76 ties), and nothing refreshes them: recall is
  partial (on 2026-10-06, 148 of the 1,653 varsity rows, at 48 of the 102 schools; the Los Angeles,
  Orange County and Ventura clubs publish no rosters), a `current` tie ages, and a roster refetch that
  drops or respells a tied row fails the build until the tie is re-checked by hand.
- Prior-season (2025-26) final standings exist in the repo for SCVAL and BVAL only (see §2 "2025-26
  history, by league"); PCAL, MCAL, the EAL and the four SoCal leagues are marked `unavailable` in
  `data/history-2025-26.json`,
  since a MaxPreps league URL's year segment is cosmetic. Last season's *games* are on MaxPreps for
  all nine leagues (§1.1 (l)) and seed the Elo rating, but they are coaches' entries like this
  season's, and nothing on the site prints them as a record or a standings table.
