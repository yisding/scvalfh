# Data sources — SCVAL girls field hockey (season "26-27")

Condensed from the build-time research spec. Confidence tags: **[V]** independently verified
against a live response or document; **[U]** claimed but not independently re-verified;
**[TODO]** open item. Values below were captured/verified 2026-09-28/29.

See also `docs/BYLAWS-2026-27.md` (standings/points/tiebreak authority, overrides anything
below that touches ordering) and `lib/season.ts` (the constants as shipped).

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
26-27 table. Historical seasons come only from scval.com PDFs or `teamContext.teamSeasonPickerData[]`.

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
- Budget: one 180–340 KB page per team, 15 requests, under the primary client's courtesy ceiling.
  Not in the twice-daily cron — rosters change a few times a season; run `pnpm fetch-rosters` by
  hand or weekly.

**si.com rosters (`.../teams/{id}-{slug}/players`, react class `teamPlayers/Index`)** were captured
alongside and **rejected as a source**: `query.team.teamPlayers.nodes[]` carries names only (no
jersey/position/class on any node for any SCVAL team), is paginated 24 at a time with a client-side
"load more" that the `?page=`/`?after=` query forms do not drive, 404s for Valley Christian, and on
several teams lists a **different set of names** from MaxPreps: the paginated lists for St.
Ignatius, Fremont, Palo Alto and Wilcox include male-typical names (0/24, 0/24, 3/24 overlap), and
Saint Francis's 24 names are exactly the school's **2025-26** roster. Useful only as a name
cross-check (17/17 for Los Altos, 13/13 for Cupertino).

**Beyond MaxPreps — school athletics sites (`data/rosters-enrichment.json`).** Where a coach left
MaxPreps blank, the school's own public roster often is not. A one-off sweep on 2026-10-02 (16
teams; official athletics sites, one roster PDF, two school papers, MaxPreps career and JV pages)
found these, all **[V]** against the page on that date:

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

Rules of the overlay, enforced by `lib/rosters-schema.ts` and re-checked against the base file in
`lib/rosters.ts` at load: it joins on `slug + athleteId` (MaxPreps rows only — a school-only name is
counted, never added); it fills a field **only where MaxPreps is null**; where a source disagrees
with MaxPreps (10 numbers, 1 position) MaxPreps stays and the disagreement is stored under
`conflicts`; every filled value carries `kind`, `source` URL and `confidence` (`high` = an official
2026-27 school roster or MaxPreps' own data for the same career; `medium` = a profile field that is
not season-dated, a school-paper statement, or a grade **derived** from a dated MaxPreps class year
plus the years elapsed, flagged `derived: true`; `low` = a profile field not tied to the season).
Net on 2026-10-02: 133 grades, 9 positions, 23 heights and the Los Gatos varsity/JV split added to
the 341 MaxPreps rows → 303 with a grade, 108 with a position, 49 with a height. Position coverage
is the real gap: **no current-season public source lists positions** for 8 of the 16 programs.
MaxPreps' per-level pages (`/jv/roster/`, `/freshman/roster/`) and prior-season pages
(`/25-26/roster/`) were empty for every team checked except Homestead JV (25), Palo Alto JV (25),
Monta Vista JV (12) and Los Gatos JV (2). This sweep is not a script: re-running it is research.

**Players' own recruiting pages (`profiles` in `data/rosters-enrichment.json`).** A second sweep on
2026-10-02 looked for each rostered player's own recruiting profile, in two passes the same day.
It found 70 for 56 players: 37 SportsRecruits, 27 Hudl and 6 NCSA. 67 are on varsity rows; Los
Gatos' three are JV and not shown. Every non-NCSA page was re-fetched and checked **[V]** that day.

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

**Recall is partial.** NCSA can only be found through search, and its pages cannot be fetched, so
a profile the search index does not surface stays unfound. Every school got NCSA sweeps by school,
class year and position. A name search (NCSA and Hudl together) ran for nearly every varsity player
on all 15 teams (a few who already had a link were skipped; JV rows, which the page does not show,
were not searched). Every player on every roster was looked up directly on SportsRecruits;
FieldLevel lookups covered six teams. An NCSA or Hudl profile for anyone else could exist and not
be linked.
Like the first sweep, this one is research, not a script.

**(k) Player stats** — `GET /gatewayweb/react/team-season-player-stats/rollup/v1?teamId=&sportSeasonId=`
on the ghost API (JSON; captured and verified 2026-10-02, all 15 teams). This is the call the team's
`/stats/` page makes from the browser (page `/team/stats`, function `eM` in that build); the page
itself server-renders only a top-3 `playerStatLeadersData` card, and the legacy print view
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
- Points are MaxPreps' 2 per goal + 1 per assist, on every row of every team.
- A player can be in one subgroup and not the other (Palo Alto lists two players in the overflow
  table only): their stats from the missing table are null, shown as a dash.
- `Goals` and `GamesPlayed` appear in both field subgroups and always agree; the parser throws if
  they ever do not.
- Coverage on 2026-10-02: 10 of 15 teams, 121 players, 13 goalkeepers. Every team with stats
  tracks games, goals and points; 8 track assists; shots / shots on goal, game-winning goals,
  steals and minutes are each tracked by two to three teams; goalkeeping ranges from saves only
  to the full ten columns (Valley Christian). Some teams stop entering: Presentation's last update
  was Sep 10, Monta Vista's Sep 12.
- Not found anywhere else: the Home Campus school sites (Saratoga, Lynbrook) have no stats pages,
  Los Gatos' VNN site has no stats tab, and si.com's team stats page carries no player stats.
- Budget: 15 calls of 0.2–35 KB, twice a day in season: `.github/workflows/update-data.yml` runs
  `pnpm fetch-player-stats` right after the core sweep (non-fatal) and commits
  `data/player-stats.json` with the snapshot when its content changed; the script leaves the file
  untouched when only its `fetchedAt` stamps would move.

### 1.2 SECONDARY — SBLive / Scorebook Live (now `si.com/high-school/stats`)

⚠️ All `scorebooklive.com` URLs now 301-redirect to `si.com` — target si.com directly (a
non-redirect-following fetch fails silently). ⚠️ The `data-react-props` payload's top-level keys
are `{query, variables, application}` — there is **no** top-level `props` key.

Extraction (uniform across pages): match `data-react-class="<CLASS>" ... data-react-props="([^"]*)"`,
decode HTML entities, `JSON.parse`.

| Purpose | URL form | React class | Path |
|---|---|---|---|
| Team schedule + results | `.../teams/{sbliveId}-{slug}/games` | `teams/Games` | `query.team.games.nodes[]`, `.standing` |
| League standings | `.../leagues/4242-santa-clara-valley-de-anza/standings`, `.../4243-...-el-camino/standings` | `organizations/Standings` | `query.organization.teamStandings[]` |
| Statewide daily scoreboard | `.../scores?date=YYYY-MM-DD` | `games/GenderSportIndex` | `query.scoreboardDate.games.nodes[]` (not `query.games.nodes[]`) |
| League-scoped scoreboard | `.../leagues/4242-.../scores` | `organizations/Scores` | `query.organization.scoreboardDate.games.nodes[]` |
| Single game detail | `.../games/{id}-{slug}` | `games/Show` | `query.game.{id,date,contest,gameTeams[]}` |

Game-node fields: `id`, `date` (ISO **with offset**, better than MaxPreps' naive local),
`featured.{locationDescriptor,isHome,result,scoreText,standing}`, `opponent.{scoreText,isHome,
team}`, `gameTypeLabel`, `statusId`/`shortStatusText` (`3`/`"F"` = final, `1` = upcoming).

**Caveats — why this is strictly secondary:**
1. ⚠️ **SBLive's league buckets are wrong for 2026-27.** Its "De Anza" (4242) holds only 5 teams
   (Mitty and Los Gatos misfiled in — they're El Camino); its "El Camino" (4243) misfiles 5 De
   Anza schools and omits Los Gatos, Mitty and Santa Clara entirely. Santa Clara appears in
   **neither** standings page. **Never take division membership or `leagueRecord` from SBLive.**
2. `gameTypeLabel` is unreliable — derive league-vs-non-league from MaxPreps `contestType` +
   the SCVAL PDF grid instead.
3. Wilcox has 1 scheduled game, 0 played — effectively no coverage.
4. `variables.level` is hardcoded `VARSITY` — no JV from this source.
5. Team slugs must be recovered from `teamStandings[].team.webPath` or `opponent.team.webPath` —
   never guessed.

**Role in this project:** score cross-check and a same-day scoreboard with timezone-correct
timestamps. Nothing else.

### 1.3 OFFICIAL — scval.com PDFs

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
- **No 2026-27 standings PDF exists yet** — poll the index for `/2026-27.*field hockey.*standings/i`
  rather than hardcoding a URL.

Rest of scval.com (legacy `fieldhockey_TR.html`, `schedules.html`, homepage ticker) is 9+ years
stale — dead weight, not used.

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

## 2. Verified constants for 2026-27

```ts
SEASON_YEAR        = "26-27"
SEASON_LABEL        = "Girls Varsity Field Hockey Fall 26-27"
SPORT_SEASON_ID      = "e302eb3e-1a32-4f2d-934b-6f9d454f721e"
ALL_SEASON_ID       = "bfacc9ec-145e-4659-ba7e-0824d163d5fc"
GENDER_SPORT       = "girls,fieldhockey"
TEAM_LEVEL         = "Varsity"
SECTION_ID (CCS)     = "d9a9ef9c-db12-4669-888b-40ac8462a575"
LEAGUE_IDS.deAnza     = "ea062dfe-9fb9-45c7-9839-0801993d6ac6"   (MaxPreps: 7 teams)
LEAGUE_IDS.elCamino    = "7bdfb2a7-8dde-4a21-88c9-832f1593554d"   (MaxPreps: 8 teams)
```

Shipped verbatim in `lib/season.ts`, re-asserted on every fetch run (§5), never hardcoded
elsewhere.

### 2.1 The 15 MaxPreps teams + Wilcox

Team identity is the MaxPreps GUID (`schoolId`/`teamId`), re-read directly from the live
standings responses — see `lib/teams.ts` for the full roster (id, slug, acronym, colors, SBLive
id). Team, division, colors and canonical URLs all come from the API; **slugs are ours**
(kebab-case short names).

⚠️ **Do not use the Presentation HTML schedule page** — it 200s but serves Los Gatos data
(MaxPreps routing/canonical bug). This is the single strongest argument for keying everything on
the `teamId` GUID and the ghost API, never on slug URLs.

### 2.2 Non-SCVAL opponents

Prospect, and Blossom Valley / out-of-area opponents (Branham, Christopher, Leland, Gilroy, Live
Oak, Willow Glen, Leigh, Stevenson, etc.) appear as fixtures but are **excluded from both
standings tables** — modeled as `division: null`, `isScvalMember: false`. Their GUIDs, where
harvested, are seeded in the alias table so fixtures render without inventing Team records.

### 2.3 Name normalization

Every display name is an alias (MaxPreps `schoolName`, SCVAL PDF grid ALL-CAPS abbreviation,
SCVAL prose, SBLive/si.com name, ICS feed name) — the join key is always the MaxPreps GUID. The
2025-26 all-league PDF is inconsistent even within itself (`St Ignatius` vs `Saint Ignatius`).

## 3. Division membership — official vs MaxPreps

**Official (SCVAL PDFs, the authority for alignment):**
- **De Anza — 8 teams:** Cupertino, Fremont, Homestead, Los Altos, Saint Francis, Saint Ignatius,
  Valley Christian, **Wilcox**.
- **El Camino — 8 teams:** Los Gatos, Lynbrook, Mitty, Monta Vista, Palo Alto, Presentation,
  Santa Clara, Saratoga.

**MaxPreps:** De Anza returns only **7** rows — Wilcox is absent, not 0-0-0. Wilcox's own MaxPreps
schedule page returns a valid season context but `contests === []` — zero games published.
SBLive's Wilcox has 1 scheduled game, 0 played.

**Resolution rules:**
1. Division membership comes **exclusively** from the two SCVAL PDFs — MaxPreps' 7-team De Anza
   and SBLive's (differently) wrong buckets are never authoritative for membership.
2. Wilcox is a De Anza member on paper but is **not fielding a team this season**, so it is not in
   the registry: its grid fixtures are dropped at parse time and De Anza has 7 teams
   (`WITHDRAWN_SCHOOL_NAMES` in `lib/teams.ts`). A team that IS fielded but has no results still
   renders with an explicit "no results reported" state — **never** as 0-0-0.
3. De Anza 8-vs-7 (official vs MaxPreps) is a real asymmetry, not a parsing artifact. El Camino
   is 8 in both.

The league absorbs five WCAL/private programs (St. Ignatius, Saint Francis, Valley Christian,
Archbishop Mitty, Presentation) because CCS has too few field-hockey programs for separate
leagues.

## 4. Data model

The normalized TypeScript model (`Team`, `Game`, `Standing`, `Playoffs`, `Snapshot`, `SourceId`
etc.) lives in `lib/types.ts`. Load-bearing rules baked into it:

- `Game.home`/`.away` carry `teamId: null` + a bare `name` for non-SCVAL opponents — every
  fixture is renderable without inventing a Team record.
- `contestState === 1` rows are **dropped before** a `Game` is constructed (they are not
  "canceled" — one observed row is a scrimmage with a real 0-4 score; storing it would leak a
  scrimmage into the standings).
- `venue.text` (raw `contest.location`, often a note like `"Scrimmage"` or `"Too be rescheduled"`)
  is kept separate from `venue.name` (only ever populated from a game page's ld+json `Place`,
  fetched lazily, never in the sweep).
- `Standing.computed` (ours, from game rows) is the display source of truth; `Standing.reported`
  (MaxPreps' own numbers) is kept for cross-check and freshness display — see §6 below and
  `docs/BYLAWS-2026-27.md` for the ordering rule itself.

## 5. Daily cron fetch plan

**Core sweep — 20 requests, run by `scripts/fetch-data.ts` / `.github/workflows/update-data.yml`:**
1 bootstrap page + 2 league-metadata assertions + 2 league standings + 15 per-team schedule
pulls (one per MaxPreps team) = every game, including non-league fixtures, because the schedule
feed is per-team, not per-league. 293 team-rows dedupe to ~174 unique contests (158 in the
current live snapshot, after the `contestState === 1` drop).

**Order:** bootstrap + assertions run first and sequentially; if `sportSeasonId`/`year` ever
changed, or a league returns 0 rows, the run **aborts and keeps the previous snapshot** — never
publish a half-migrated season. Standings pulls at concurrency 2. Team schedule pulls at
concurrency ≤3, ~500ms between request starts (~8s wall clock for 15 requests) — a deliberate
courtesy ceiling well below the parallelism observed to work without any 429/403.

**Retries:** 429/5xx only, 3 attempts, exponential backoff 1s→2s→4s ±20% jitter, honor
`Retry-After`. Never retry another 4xx. Per-request timeout 15s, whole-run budget 120s. A
descriptive User-Agent identifies the site and a contact address on every request. **A partial
run still publishes** — each failed request becomes a `SourceStatus {status:"error"}` row and the
previous snapshot's rows for that team carry forward.

**Backfill:** because `schedule-calculated` returns a team's entire season in one request, every
run **re-ingests all 15 feeds in full** and upserts on `contestId` — coaches enter results by
hand with real lag, and MaxPreps corrections do happen, so nothing is ever treated as immutable.

**Conditional/weekly extras** (not part of the core 20): score-only refresh via
`contest-ids-grouped-by-date` + `scoreboard-contests-by-ids` (hourly-scale, optional); si.com
score cross-check (weekly); the two SCVAL schedule PDFs + `Fall_index.html` (weekly, revision
detection); `scval.com/standings/` poll (weekly); the two VNN `.ics` feeds (weekly — start
times/venues/JV); CCS calendar + MaxPreps tournament page (**daily from Nov 2**, twice daily on
Nov 7/11/14). Game venue addresses are fetched lazily, one request per game, only from a
game-detail route — never in the sweep.

**Normalization rules:** dedupe on `contest.contestId`; drop `contestState === 1` before
anything else; a missing score renders `pending`, **never `0-0`** (a genuine 0-0 final is
distinguishable because both scores are `0` *and* both results are `"T"`); home/away from
`teams[].homeAwayType` only (never `contestType`, never `scoreboard-contests-by-ids`' `teams[0]`
ordering); league flag from `contestType === 0`, corroborated against the SCVAL PDF grid (log any
disagreement rather than silently picking one); store both naive-local and UTC timestamps;
opponent identity by GUID, display name by the alias table.

### MaxPreps vs SBLive reconciliation

**Rule: prefer MaxPreps. Flag disagreements; never average, never silently overwrite.** Match
games across sources on `(date, {home.teamId, away.teamId} unordered pair)` via the `Team.external`
map. On a numeric disagreement: keep MaxPreps' score, record the SBLive value + a note in
`provenance.scoreConflict`, surface a small "sources disagree" marker in the UI. On MaxPreps
`null` + SBLive scored: do **not** backfill from SBLive by default (it's a different manual-entry
pipeline, not a more-authoritative one) — record the value in `scoreConflict`, leave the game
`score-pending`. Never take `leagueRecord`, `gameTypeLabel` or division from SBLive.

### Playoff polling from Nov 2

Before Nov 2, render the playoff section from the by-laws-derived dates and the SCVAL-7
auto-qualifier allocation, no polling. From Nov 2 daily (twice daily on Nov 7/11/14): fetch the
CCS `?print=ical` calendar (match the `"CCS Semfinals"` typo), poll the MaxPreps tournament page
for `bracketPublished` flipping true, and continue the 15 `schedule-calculated` calls, watching
for populated `bracketName`/`bracketGameIndex`/`tournamentName` fields (untested — verify live on
Nov 7). Re-derive the CCS CloudFront PDF URLs each time; never poll the CCS bracket page itself
expecting data.

## 6. Legal / robots posture and attribution

`production.api.maxpreps.com/robots.txt` allows everything used here. `www.maxpreps.com/robots.txt`
disallows `/team/`, `/school/`, `/scores/` (with narrow `Allow:` carve-outs), among others — these
are root-anchored prefixes and do **not** match the paths this project uses (e.g.
`/ca/los-altos/los-altos-eagles/field-hockey/schedule/` is not under `/team/`). Field hockey is
not in the Googlebot sport-exclusion list. No `Crawl-delay` is published anywhere; the
≤3-concurrency / 500ms / once-or-twice-daily budget is entirely self-imposed. scval.com,
cifccs.org, si.com and mmboltapi robots.txt were not independently re-verified before this build —
check before a first production run.

**Terms — robots is not a licence.** MaxPreps (CBS Interactive/Paramount) and SBLive/si.com both
restrict republishing and publish no reuse licence. Posture adopted: store our own **derived**
records (normalized scores, computed standings), not verbatim page copies; deep-link back to the
source page on every row; attribute visibly on every page that shows the data; keep the cron to
1-2 runs/day; send an identifying User-Agent with a contact address; cache aggressively and serve
the static snapshot, never proxy a live upstream request per visitor; honor a takedown request
immediately.

**Attribution text**, rendered in the site footer and on every scores/standings page:

> Scores, schedules and standings via **MaxPreps** (maxpreps.com), with cross-checks from **High
> School on SI / Scorebook Live** (si.com/high-school). Division alignment and the official
> league schedule from the **Santa Clara Valley Athletic League** (scval.com). Playoff dates,
> format and qualifier allocation from **CIF Central Coast Section** (cifccs.org). Start times
> and venues for some schools from school athletics calendars (VNN / PlayOn). This is an
> unofficial fan site, not affiliated with SCVAL, CIF-CCS, MaxPreps or Sports Illustrated. Records
> are computed from published game results and may differ from official standings. Last updated
> {fetchedAt}.

## 7. Known open risks (carried into README "Known limitations")

- MaxPreps' own De Anza standings arithmetic looked internally inconsistent at capture time
  (e.g. two teams reporting zero league goals scored *and* against across a full slate) — this
  project recomputes independently from game rows and prefers the computed values; `reported` is
  kept only for cross-check.
- `dateCode` nonzero semantics, `contestState` 0/3, and `homeAwayType === 2` (neutral) were never
  observed in the wild — treat any future occurrence as unverified territory.
- `scoreboard-contests-by-ids`' `teams[0]`-is-home assumption is unverified — never relied on.
- CCS CloudFront PDF hashes change on every re-upload — always re-derive at fetch time, never
  hardcode.
- League-game-count-per-team (double round robin, 2 meetings per division mate) was not verified
  pairing-by-pairing — any "games remaining"/clinch logic should treat this as an assumption.
- JV is out of scope for v1: SCVAL JV membership differs from varsity, and no JV pipeline was
  verified end to end even though the VNN `.ics` feeds carry some JV events.
- Prior-season data has exactly one route (`teamSeasonPickerData[]`, unverified) besides the
  scval.com PDFs, since a MaxPreps league URL's year segment is cosmetic.
