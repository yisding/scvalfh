# Data sources — NorCal girls varsity field hockey (season "26-27")

Condensed from the build-time research spec and amended for the four-league site (SCVAL, BVAL and
PCAL in the CIF Central Coast Section; MCAL in the North Coast Section). Confidence tags: **[V]**
independently verified against a live response or document; **[U]** claimed but not independently
re-verified; **[TODO]** open item. Values below were captured/verified 2026-09-28 to 2026-10-02.

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

**(c) Contest ids grouped by date** — `GET /gatewayweb/react/contest-ids-grouped-by-date-by-context/v2?context=league&id={leagueId}&genderSport=girls,fieldhockey&level=Varsity&excludeTbaDate=true&nationalTeamCount=25`.
Cheap cron driver / same-day scoreboard. `data.contestIdsByDate[]`,
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
| | `3` | ContestInProgress (live) | **[U]** not observed |
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
lazily, one request per game, never in the nightly sweep).

**(j) Team rosters** — `GET https://www.maxpreps.com/<teamCanonicalUrl path>/roster/` (HTML; captured
and verified 2026-10-02). There is **no ghost-API roster endpoint**: `gatewayweb/react/team-roster/v1`,
`roster/v1` and `team-roster/v2` all 404 **[V]**. The page's `__NEXT_DATA__` → `props.pageProps` carries
`countData {teamId, sportSeasonId, athleteCount, staffCount}`, `schoolId`, `canonicalUrl` and
`athleteData`: an array of **37-element positional arrays**, one per athlete — the same tuple encoding
as the schedule page (1.1i), so it is pinned behind an adapter with loud assertions
(`lib/sources/maxpreps-roster.ts`, written by `scripts/fetch-rosters.ts` to `data/rosters.json`).

**Scope: every registry team, all four leagues (43).** The roster page is the same page for a team
of any league, so `scripts/fetch-rosters.ts` walks the whole registry (`TEAMS`), and
`data/rosters.json` (`lib/rosters-schema.ts`) holds exactly one entry per team, in registry order,
each carrying its registry id and division. Everything below that says "captured 2026-10-02" was
verified on the 15 SCVAL pages, the only ones captured then. All 43 pages were then read live on
2026-10-03 with the same adapter, unchanged: 37 teams ok (745 players), 6 empty (Del Mar, Silver
Creek, Sobrato, Monterey, Santa Catalina, Marin Academy: MaxPreps' own athleteCount is 0), 0
failed, and SCVAL's rows were identical to the 2026-10-02 ones. Seven of the 28 new pages are kept
as fixtures (`tests/fixtures/maxpreps/roster-{leigh,greenfield,del-mar,stevenson,monterey,
university-sf,marin-catholic}.html`, tested by `tests/maxpreps-leagues.test.ts`). The adapter
throws on any positional drift (a failed team keeps its previous rows or is
`error`, never a guessed row). A team's `status` says what its `players[]` are: `ok` (read this
run), `empty` (page read, MaxPreps lists nobody), `carried-forward` (this run failed; the previous
file's rows, with their own `fetchedAt`), `error` (failed, nothing to carry) or `pending` (no run
has covered the team: nothing fetched, nothing claimed). `pending` is the honest placeholder the
file was seeded with for BVAL, PCAL and MCAL (and what `--leagues` leaves for a team the file has
no row for) until a run read them; the team page says "has not been collected yet" for it.

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
- Budget: one 180–340 KB page per team, 43 requests (15 for SCVAL alone, `--leagues scval`), at
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
entry per registry team (43), joined on `slug + athleteId`; its rules below hold for every league.
SCVAL was swept on 2026-10-02 and BVAL, PCAL and MCAL on 2026-10-03 (the second sweep's tables
follow the SCVAL one). What a team page with no MaxPreps players says about other sources is
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
Audrey Dickerman and Eloise Tonderys). All four leagues together: 745 players, 443 → 658 with a
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

**Players' own recruiting pages (`profiles` in `data/rosters-enrichment.json`, all four leagues).** A second sweep on
2026-10-02 looked for each rostered SCVAL player's own recruiting profile, in two passes the same day.
It found 70 for 56 players: 37 SportsRecruits, 27 Hudl and 6 NCSA. 67 are on varsity rows; Los
Gatos' three are JV and not shown. Every non-NCSA page was re-fetched and checked **[V]** that day.
On 2026-10-03 the same rules found 29 more for 27 players: BVAL 12 for 12 (8 SportsRecruits, 4 NCSA:
Christopher 4, Gilroy 2, Leigh 3, Willow Glen 2, Westmont 1), PCAL 3 for 3 (1 NCSA, 2 Hudl: Hollister 1,
Stevenson 2), MCAL 14 for 12 (8 SportsRecruits, 6 NCSA: Tamalpais 4, University 5, Archie Williams 2,
Lick-Wilmerding 2, Convent 1). **All four leagues: 99 profiles for 83 players, 53 SportsRecruits,
29 Hudl and 17 NCSA.**

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

**(j2) Clubs and club affiliations** — `data/clubs.json` (`lib/clubs-schema.ts`, read by
`lib/clubs.ts`; shown on `/clubs`, `/clubs/[slug]` and in a club line on each team page's roster,
DESIGN §17). Research on 2026-10-03, not a script: nothing fetches or refreshes it. It holds 13
youth field hockey clubs and 72 affiliations, each a tie between a player on the 43 tracked varsity
rosters and a club, joined to `data/rosters.json` on team slug + MaxPreps athleteId as the overlay
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
named; each record was then read from the club's own site (71 club source entries, on 66 distinct
URLs). The ties rest on 229 source entries on 105 distinct URLs: an entry is one page backing one
tie, so a club roster, a watchlist or a news story that names several players is one page and
several entries. The counts are of URLs as the file spells them, and two pages are cited under two
URLs each, so the ties rest on 103 pages: Stick Together's 2025 all-league page, with its trailing
slash (`news` for five players, `other` for two) and without it (`news` for Olivia Taylor), and
Gabrielle Moll's MaxPreps career page, under the name slugs `gabby-moll` and `gabrielle-moll` (one
`careerid`). That one URL filed under two kinds is why the per-kind URL counts add up to 106.

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

The MaxPreps club-teams block was mined for all 716 varsity rows: 13 of the 17 entries (10 players)
quote a field hockey club from it, and the other 4 give only the page's class year and team. Every
tie it names was also found by another source except Yoyo Cai's Fly FHC tie, which rests on her
MaxPreps page alone. MAX Field Hockey's pages render their tables through an embedded database view,
so they were read by calling the embedded page directly. USA Field Hockey lists were searched too.
The club pages show each source as a link labelled by its kind and host, never by anything in its
URL path.

*The rule* is the recruiting-profile rule above, applied to clubs: a public page must name the
player and a field hockey club, and either name the player's high school, or give a class year
that agrees with the roster grade together with a Northern California location (the player's
hometown, or a club or team based in Northern California). A name alone never makes a match, and a
class year that disagrees with the roster grade rules one out (`lib/clubs.ts` refuses the file at
load otherwise: MaxPreps' grade, else the overlay's; Riya Mehrotra and Gabrielle Moll have no grade
anywhere, so theirs is not checked). A page may use a nickname when it names the school.
Lacrosse, soccer and ice hockey clubs do not count, and neither do social-media posts: no source or
website may be on instagram.com, facebook.com, tiktok.com, x.com or twitter.com. Only players
already on the tracked rosters are named, varsity rows only (no affiliation is on one of Los Gatos'
29 JV rows); a club's own roster names many more players, and the club page links it instead.

*Two passes.* Every affiliation was checked twice on 2026-10-03. A checker re-opened each source
and applied the rule; then an independent refuter re-opened the sources and tried to break the
match: another person of the same name, a quote not on the page, a misidentified club, a class
year that disagrees, a stale listing. Only ties that survived both are in the file.

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
  Nicknames are held to the same rule ("Maggie" Magnano is "Margaret" on her profile, "Evie"
  Ferrini "Genevieve" on the watchlist). The site prints the roster's spelling.
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
  created 2026-01-02, says she has recently switched to NorCal Impact: Fly is `unknown`. Brooklyn
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

*Recall is partial.* A player with no public page that meets the rule is not listed, whatever club
they play for. The 72 ties cover 66 of the 716 varsity rows at 22 of the 43 schools; five players
are tied to more than one club.

| League | Players | By school |
|---|---|---|
| SCVAL | 33 at 12 of 15 | St. Ignatius 14, Saint Francis 5, Mitty 3, Los Altos 2, Palo Alto 2, Cupertino 1, Fremont 1, Homestead 1, Los Gatos 1, Lynbrook 1, Monta Vista 1, Presentation 1 |
| BVAL | 16 at 6 of 12 | Christopher 6, Leigh 3, Willow Glen 3, Gilroy 2, Leland 1, Westmont 1 |
| PCAL | 0 of 7 | none |
| MCAL | 17 at 4 of 9 | Tamalpais 6, University 6, Convent of the Sacred Heart 3, Lick-Wilmerding 2 |

None at 21 schools: SCVAL's Valley Christian, Santa Clara and Saratoga; BVAL's Branham, Del Mar,
Live Oak, Prospect, Silver Creek and Sobrato; all seven PCAL schools; and MCAL's Archie Williams,
Redwood, Berkeley, Marin Catholic and Marin Academy. Six of these (Del Mar, Silver Creek, Sobrato,
Monterey, Santa Catalina, Marin Academy) list no players on MaxPreps, so there is no row to tie
anyone to. By club: SF Hawks 31 (all current), NorCal Impact 19 (all current), Fly FHC 10 (2
current, 4 past, 4 unknown), Infinity 8 (1, 6, 1), Lightning 3 (1, 1, 1) and HTC 1 (current). Seven
clubs have no tied player: Pac Heights, Performance Field Hockey, San Jose Khalsa, Stryker, Hayward
Hawks, Lions and Golden Gate Rippers. No club was found on the Peninsula or the Central Coast,
though both were searched. Four clubs publish a roster page the club page links (SF Hawks, NorCal
Impact, Lightning and HTC: 11 pages in all); the players on them who are not on the tracked rosters
are not named anywhere on the site.

*When a roster refetch breaks it.* The join is checked at load against the merged rosters. If
`pnpm fetch-rosters` drops or respells a tied player's row, if the overlay marks it JV, or if a
season rollover moves `data/rosters.json` to a season `data/clubs.json` is not for, `lib/clubs.ts`
throws at import, so `pnpm test` and the build fail with
`clubs: <team> / <player> (<club>): <what>`. Re-check that affiliation's sources and edit or drop
it by hand (on a rollover, redo the research for the new season). It is never pruned
automatically.

**(k) Player stats** —
`GET /gatewayweb/react/team-season-player-stats/rollup/v1?teamId=&sportSeasonId=` on the ghost API
(JSON; captured and verified 2026-10-02 on the 15 SCVAL teams, and 2026-10-03 on a sample of the
other three leagues; the rest of those were read live by the script). Like
the rosters it joins to, it covers every registry team, all four leagues (43): one call per team,
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
the same chunk, not used: `team-season-stats/rollup/v1`, `team-season-game-stats/rollup/v1`,
`team-leaderboard-leaders/v2`; a `leagueId=` parameter limits the rollup to league games.
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
- Budget: 43 calls of 0.2–35 KB (one per registry team), at the primary client's courtesy ceiling
  (≤3 concurrent, ≥500 ms between starts, about 25 s), twice a day in season:
  `.github/workflows/update-data.yml` runs `pnpm fetch-player-stats` right after the core sweep
  (non-fatal) and commits `data/player-stats.json` with the snapshot when its content changed; the
  script leaves the file untouched when only its `fetchedAt` stamps would move.

**(l) Last season's results** (the Elo rating's starting point, DESIGN §20.1) — `data/prior-season.json`
(`lib/prior-season.ts`, loaded by `lib/prior-season-data.ts`), built once a season by
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
- Cost: one `team-context/v1` read (about 0.55 MB) and 43 schedule reads (about 150 KB each),
  through the primary client's budget, once a season. The 2024-25 season (`c388901e-…`, 354
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
| League standings | `.../leagues/{id}-{slug}/standings` (SCVAL 4242 and 4243, BVAL 4175, PCAL 4231 and 4232, MCAL 4212) | `organizations/Standings` | `query.organization.teamStandings[]` |
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
4. `variables.level` is hardcoded `VARSITY` — no JV from this source, but a few **JV teams have
   their own team id** (York, Tamalpais JV): those ids are ignored by config (§5.4).
5. Team slugs must be recovered from `teamStandings[].team.webPath` or `opponent.team.webPath` —
   never guessed.
6. Some rows are junk: a Salinas–Stevenson game appears twice, once under a `/new-york/` path.
   Only rows whose `webPath` starts `/california/field-hockey/games/` are read.

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
  - To change an `unavailable` entry to `available`: add a source reader like `lib/sources/bval-sheet.ts`,
    extend `scripts/build-history.ts`, and the schema (`lib/history.ts`) already validates it against
    the league's own registry slugs and divisions (PCAL and MCAL are single-division).
- **No 2026-27 standings PDF exists yet** — poll the index for `/2026-27.*field hockey.*standings/i`
  rather than hardcoding a URL.

Rest of scval.com (legacy `fieldhockey_TR.html`, `schedules.html`, homepage ticker) is 9+ years
stale — dead weight, not used.

### 1.3a OFFICIAL — BVAL, PCAL and MCAL schedules (bundled, hash-checked)

BVAL, PCAL and MCAL publish their schedules as documents with no feed, so their league fixtures
were transcribed once (2026-10-02) and are **bundled** in `data/official/{bval,pcal,mcal}-2026.json`
(Zod-validated every time they load, in the cron and in tests). The files are written by
`pnpm exec tsx scripts/build-official-fixtures.ts` from the transcriptions in
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
   `pnpm exec tsx scripts/build-official-fixtures.ts --bval-text <MtHamilton.txt> <SantaTeresa.txt>`
   (the parser throws on any override form it does not know, so a surprise is loud); for PCAL and
   MCAL, edit `tests/fixtures/official/source/pcal-official-schedule-2026.json` or
   `mcal-fixtures-2026.json` to match the new document.
3. Run `pnpm exec tsx scripts/build-official-fixtures.ts` (add `--check` to only compare). It
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

**League rules documents** (cited by the config; full text summarized in `docs/LEAGUE-RULES.md`):
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

This is also the **only verified JV source** (MaxPreps has JV team pages but no JV pipeline was
tested end to end).

### 1.6 Rejected sources (one line each)

- MaxPreps statewide/league legacy scoreboard (`?leagueid=` silently ignored; grouped by CIF
  section, not league) — use `contest-ids-grouped-by-date-by-context/v2` instead.
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

**The six MaxPreps league tables** (one per division; the id is what the cron requests):

| League | Division | MaxPreps league id | MaxPreps table | Teams on MaxPreps / ours | Games a team | League play | What MaxPreps' table is trusted for |
|---|---|---|---|---|---|---|---|
| SCVAL | De Anza | `ea062dfe-9fb9-45c7-9839-0801993d6ac6` | Santa Clara Valley - De Anza | 7 / 7 | 12 | Sep 9 – Oct 28 | full cross-check |
| SCVAL | El Camino | `7bdfb2a7-8dde-4a21-88c9-832f1593554d` | Santa Clara Valley - El Camino | 8 / 8 | 14 | Sep 9 – Oct 28 | full cross-check |
| BVAL | Mt. Hamilton | `8ec791a6-463e-4313-86de-1bd02671054a` | Blossom Valley - Mount Hamilton | 6 / 6 | 10 | Sep 17 – Oct 30 | full cross-check |
| BVAL | Santa Teresa | `7c899b2d-07fa-4664-976c-a4f57d12eeec` | Blossom Valley - Santa Teresa | **5** / 6 | 10 | Sep 18 – Oct 30 | records only (Prospect is missing) |
| PCAL | PCAL (one division) | `50ac53cd-e46f-4df9-824b-5a954c583b95` | Pacific Coast - Gabilan (MaxPreps' internal table name) | 7 / 7 | 12 | Sep 2 – Oct 29 | informational only |
| MCAL | MCAL (one division) | `c15255d5-c2ad-49f5-9afb-cf4ba289875c` | Marin County | 9 / 9 | 16 | Aug 24 – Oct 22 | records only (MaxPreps orders by win pct) |

PCAL is one division on this site. MaxPreps' name for its table (the `Gabilan` in the row above)
is its own internal label, kept as data only; it is never shown anywhere on the site, which says
"PCAL". MaxPreps' other table in that league, "Pacific Coast - Mission"
(`6e1f97d4-5211-4d98-bf59-282cd754bc5c`), has no teams and answers its standings request with
HTTP 400; it is never configured and never requested.

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

### 2.1 The 43 teams

Team identity is the MaxPreps GUID (`schoolId`/`teamId`), re-read from the live responses. Colors,
mascots and cities also come from MaxPreps; **slugs and abbreviations are ours** (kebab-case short
names, unique across all 43). The registry is `lib/registry/{scval,bval,pcal,mcal}.ts`, assembled
by `lib/teams.ts`, and a test pins the 15 SCVAL slugs, abbreviations and GUIDs. The si.com ids
are the numeric id on a team page URL (`/teams/{id}-{slug}`) and, where observed, the school id on
a school-logo URL; "—" means not observed and is never guessed.

Per division: De Anza 7, El Camino 8, Mt. Hamilton 6, Santa Teresa 6, PCAL 7, MCAL 9 = 43.

| slug | abbr | league | division | MaxPreps team id (GUID) | name | si.com team id | si.com school id |
|---|---|---|---|---|---|---|---|
| st-ignatius | SI | scval | de-anza | `1dc4836b-4daf-4573-b525-27b474bd5366` | St. Ignatius College Preparatory | 456831 | — |
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
| Del Norte (Crescent City) `8396a0d3-8021-458d-b592-a5cb2c4a366d` | a MaxPreps ghost team (no league, team size 0) | every contest with this side is dropped and listed in the snapshot's `dropped` list |
| Irvington, North Salinas, Notre Dame (Salinas), Gunn, San Jose, North Monterey County, University Prep Academy, Marina (CCS) | no 2026-27 varsity team | nothing to do |

Every other school that appears as an opponent (out-of-area, other sections) is a **non-member**:
its games are ordinary non-league games, modeled with `teamId: null` and a bare name, never given a
Team record, and shown as "Not one of the 43 teams this site follows".

### 2.3 Name normalization

Every display name is an alias (MaxPreps `schoolName`, an official-schedule abbreviation or
ALL-CAPS grid name, prose, si.com name, ICS feed name) — the join key is always the MaxPreps GUID
(or, for si.com, the si.com team id, §5.3). The 2025-26 all-league PDF is inconsistent even within
itself (`St Ignatius` vs `Saint Ignatius`).

## 3. Division membership and which games count

### 3.1 Membership and classification, per league

Membership comes from each league's **official schedule**, never from MaxPreps' or si.com's
league buckets (both are wrong somewhere: §1.2, §2). A game belongs to a division's table
(`Game.countsFor`) only when both teams are members of that same division **and** the league's
classification evidence says it is a league game. This is decided once, in the pipeline
(`lib/classify.ts`), and stored on the game.

| League | Evidence for "league game" | Excluded |
|---|---|---|
| SCVAL | MaxPreps `contestType === 0` (corroborated against the live PDF grid; any disagreement is logged) | CCS section games only (postseason tag `ccs`) |
| BVAL, PCAL, MCAL | the game matches a fixture on the league's **official schedule** for that division | `contestType` 2 and 4 (tournament / neutral), and every postseason game |

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

## 4. Data model

The normalized TypeScript model (`Team`, `Game`, `Standing`, `Snapshot`, `LeagueHealth`,
`SourceId` etc.) lives in `lib/types.ts`; the snapshot is Zod-validated in
`lib/snapshot-schema.ts` (schema version 2; a version-1 single-league file migrates in memory).
Load-bearing rules baked into it:

- `Game.home`/`.away` carry `teamId: null` + a bare `name` for non-member opponents — every
  fixture is renderable without inventing a Team record.
- `Game.countsFor` is the division whose table the game belongs to (or `null`), set once by
  `lib/classify.ts`; `Game.postseason` tags CCS, SCVAL crossover, BVAL play-in and MCAL tournament
  games, which never count in a league table.
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

**Core sweep — 56 MaxPreps requests, run by `scripts/fetch-data.ts` (a thin CLI over
`lib/pipeline/`) from `.github/workflows/update-data.yml`:** 1 bootstrap page + 6 league-metadata
assertions + 6 league standings + 43 per-team schedule pulls (one per registry team, so Prospect is
fetched even though MaxPreps' Santa Teresa table omits it) = every game, including non-league
fixtures, because the schedule feed is per-team, not per-league.

**Player stats — 43 more MaxPreps requests, in a separate process:** the workflow then
runs `scripts/fetch-player-stats.ts` (one stats rollup per registry team, all four leagues, §1.1k) as a non-fatal step
(`continue-on-error`), so a stats outage never costs the day's scores, and commits
`data/player-stats.json` with the snapshot when its content changed. It is not part of the 56 below
and shares no abort scope with the pipeline.

### 5.0 Request budget per run

| Host | Requests | Notes |
|---|---|---|
| MaxPreps API | 56 | 1 bootstrap + 6 meta + 6 standings + 43 schedules; ≤3 concurrent, ≥500 ms spacing (about 30 s) |
| scval.com | 3 | 2 schedule PDFs + the standings index |
| drive.google.com, pcalathletics.org, mcalsports.org | 5 | revision checks (BVAL ×2, PCAL, MCAL) + the MCAL `Schedir.htm` changes check |
| si.com | up to 15 + up to 8 | scoreboards for dates in the trailing 14 days that have a game; targeted team-games pages only for backfill candidates (§5.2 rule 8) |
| VNN | 2 | the Palo Alto and Los Gatos calendars |
| cifccs.org + MaxPreps HTML | 2 | only from `CCS.pollFrom` (Oct 25) |

`--sblive-full` (all 43 si.com team pages) is a manual flag, never the cron default. The final
log line prints the counts per host, e.g. `requests maxpreps:56 sblive:… official:…`.

### 5.1 Order, aborts and freezes

Steps run in this order: window guard → bootstrap → league metadata ×6 → reported tables ×6 →
schedules ×43 → normalize → official schedules → si.com → secondary (VNN, CCS) → classify →
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
one request, every run **re-ingests all 43 feeds in full** and upserts on `contestId` — coaches
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
4. **"Clearly wrong" MaxPreps final** — only these three mechanically detectable cases, each logged
   with a note; si.com's score is published and the MaxPreps value and the reason are recorded in
   `provenance.scoreConflict`:
   - **4a contradictory result:** the two team rows' win/loss flags contradict the row's own score
     (the side with more goals is marked L), or the two rows disagree on the score.
   - **4b off-schedule date:** the contest matched its official fixture only by the rescheduled
     pass more than 7 days from the official date, while si.com has the same pair as Final within
     ±1 day of the **official** date. The game keeps MaxPreps' date; the note names both.
   - **4c phantom tie:** a MaxPreps "final" 0-0 with both results T, si.com has a decided Final the
     same date for the same pair, **and the league plays no overtime in league play** (PCAL and
     MCAL only; in SCVAL and BVAL a 0-0 tie can be real after the sudden-victory period, so it falls
     to rule 5).
5. **Plain disagreement** (both sources have a score and no rule-4 condition holds): MaxPreps
   stays; the conflict is published on the game page and `/about`, never averaged or silently
   overwritten.
6. **Never from si.com:** division or league membership, `leagueRecord`, `gameTypeLabel`, standings
   order.
7. **Junk-row guards:** si.com rows whose `webPath` does not start with
   `/california/field-hockey/games/` are ignored; duplicates collapse on the si.com game id, then on
   (date, unordered pair) keeping the scored row; rows whose sides do not both resolve by id are
   ignored; rows with a side in the ignored team ids (York, Tamalpais JV, Wilcox) or a withdrawn
   name are dropped; statewide name collisions (University, Los Altos, Santa Clara) never resolve
   by name.
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
Greenfield Sep 30; rule 3: Carmel at Stevenson Sep 29); with `--no-sblive` the PCAL table is level
on points differently (see `docs/LEAGUE-RULES.md`).

### 5.3 si.com identity: id first

si.com team names are not safe keys (statewide collisions, JV teams, renamed schools). The resolver
in `lib/sources/sblive.ts` identifies each side in this order:

1. the si.com **team id** is in the ignored list → refused (`ignored-team`);
2. the team id equals a registry team's `sbliveTeamId` → that team (`team-id`);
3. the **school id** (from a school-logo URL) equals a registry team's `sbliveSchoolId` → that team
   (`school-id`);
4. the normalized name is `university`, `losaltos` or `santaclara` (names shared with other
   schools statewide) → refused (`ambiguous-name`);
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
  Tamalpais JV, `485528` Wilcox (SCVAL, not fielding a team).
- **Ignored MaxPreps league id:** `6e1f97d4-5211-4d98-bf59-282cd754bc5c` (the 0-team PCAL sibling
  table, §2).
- **Withdrawn names** (never members): SCVAL — Wilcox and its variants; PCAL — York and its
  variants. Their fixtures are dropped silently when an official schedule is parsed.

### 5.5 Corpus and `--capture`

Tests and offline runs read a recorded **corpus**: a directory with a `manifest.json` (id,
`fetchedAt`, leagues, and a map from each logical resource such as `maxpreps/schedule/leigh`,
`sblive/scores/2026-09-30` or `scval/pdf-text/de-anza` to a file, or to an HTTP status number that
is served as that error) plus the files. `tests/fixtures/corpus/all-2026-10-02/` is a full run of
all four leagues (SCVAL's schedules and PDF texts are the 2026-09-29 captures, everything else
2026-10-02); `tests/fixtures/maxpreps/manifest.json` is the older SCVAL-only corpus; and
`tests/fixtures/corpus/variants/` holds overlays for failure cases (`pcal-standings-empty`,
`bval-meta-wrong-season`, `leland-feed-503`, `mcal-postseason`, `bval-revised`,
`finals-regression`).

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
from MaxPreps games dated on or after Oct 23 between MCAL teams.

## 6. Legal / robots posture and attribution

`production.api.maxpreps.com/robots.txt` allows everything used here. `www.maxpreps.com/robots.txt`
disallows `/team/`, `/school/`, `/scores/` (with narrow `Allow:` carve-outs), among others — these
are root-anchored prefixes and do **not** match the paths this project uses (e.g.
`/ca/los-altos/los-altos-eagles/field-hockey/schedule/` is not under `/team/`). Field hockey is
not in the Googlebot sport-exclusion list. No `Crawl-delay` is published anywhere; the
≤3-concurrency / 500ms / once-or-twice-daily budget is entirely self-imposed. scval.com,
cifccs.org, si.com, mmboltapi, pcalathletics.org, mcalsports.org and the Google Drive download
endpoint robots policies were not independently re-verified before this build — check before a
first production run.

**Terms — robots is not a licence.** MaxPreps (CBS Interactive/Paramount) and SBLive/si.com both
restrict republishing and publish no reuse licence. Posture adopted: store our own **derived**
records (normalized scores, computed standings), not verbatim page copies; deep-link back to the
source page on every row; attribute visibly on every page that shows the data; keep the cron to
1-2 runs/day; send an identifying User-Agent with a contact address; cache aggressively and serve
the static snapshot, never proxy a live upstream request per visitor; honor a takedown request
immediately. The bundled official fixtures are our own transcription of public schedules (dates,
pairings and times), not copies of the documents.

**Attribution text**, rendered in the site footer (`components/layout/Attribution.tsx`) and on the
standings and scores pages:

> Data from **MaxPreps** (maxpreps.com) and **High School on SI** (si.com/high-school). League
> alignment and rules from SCVAL, BVAL, PCAL and MCAL. Unofficial; not affiliated with SCVAL, BVAL,
> PCAL, MCAL, CIF-CCS, CIF-NCS, MaxPreps or SI. Records are computed from published game results
> and may differ from official standings. Last updated {fetchedAt}.

with the site's scope note beneath it: "Covers the CIF Central Coast Section (SCVAL, BVAL, PCAL)
and the North Coast Section's MCAL. Teams from other sections appear only as opponents."

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
- No by-law ranks a team across leagues, and the CCS committee seeds by criteria we cannot compute,
  so the site shows no merged 1-16 order before CCS seeds.
- JV is out of scope for v1: JV membership differs from varsity, and no JV pipeline was verified end
  to end even though the VNN `.ics` feeds carry some JV events.
- Rosters and player stats cover all 43 teams (§1.1j, §1.1k) and were read live on 2026-10-03 (every
  page parsed, no team failed), and the school-site and recruiting-page overlay covers all four leagues
  (SCVAL 2026-10-02; BVAL, PCAL, MCAL 2026-10-03, recall partial in each). A team's page that does
  not parse fails that team (carried forward, or `error`), never writes a wrong value; a team no run
  has covered is `pending`. No current-season public source lists positions for most programs, no
  BVAL, PCAL or MCAL roster source (school site, paper, MaxPreps JV or earlier-season page)
  publishes a height or a 2026-27 number MaxPreps lacks (some players' NCSA recruiting profiles do
  list a height, but a profile is only linked from the row and never fills a field), and 6 teams (Del
  Mar, Silver Creek, Sobrato, Monterey, Santa Catalina, Marin Academy) have no MaxPreps players at all.
  How much a coach enters varies by program in every league.
- Club ties (§1.1j2) were researched once, on 2026-10-03, and nothing refreshes them: recall is
  partial (66 of 716 varsity rows, none at 21 schools), a `current` tie ages, and a roster refetch
  that drops or respells a tied row fails the build until the tie is re-checked by hand.
- Prior-season (2025-26) final standings exist in the repo for SCVAL and BVAL only (see §2 "2025-26
  history, by league"); PCAL and MCAL are marked `unavailable` in `data/history-2025-26.json`,
  since a MaxPreps league URL's year segment is cosmetic. Last season's *games* are on MaxPreps for
  all four leagues (§1.1 (l)) and seed the Elo rating, but they are coaches' entries like this
  season's, and nothing on the site prints them as a record or a standings table.
