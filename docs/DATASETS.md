# Datasets

The committed data files besides the snapshot: what each holds, which script or hand writes it, how it is
validated and where the site shows it. The snapshot itself is docs/DATA-PIPELINE.md "How data flows".

## Rosters

`data/rosters.json` holds every team's player list — name, jersey number, grade, position(s),
height and captain flag, whatever the coach entered on MaxPreps — built by `pnpm fetch-rosters`
from the 102 MaxPreps roster pages (every registry team, all nine leagues and the five independents; one entry per team) and
committed, like the history file, rather than refreshed by the cron (rosters change a few times a
season; run it by hand or weekly). The page encodes each athlete as a 37-element positional array, so
`lib/sources/maxpreps/roster.ts` decodes it with MaxPreps' own column list and cross-checks every
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
gathered by hand and joined on the MaxPreps athlete id. It has one entry per team (102): SCVAL was
swept on 2026-10-02 and BVAL, PCAL and MCAL on 2026-10-03; the six EAL entries (2026-10-04) hold
recruiting profiles only, with no coaches or sources, until someone sweeps the schools' athletics
sites; so do the 53 Southern California entries (2026-10-06), so those teams' pages say we have not
checked other public sources. On 2026-10-12 the schools with ungraded rows were swept for grades
alone (MaxPreps' career and earlier-season pages, then school athletics sites, papers and news);
heights, numbers, positions and coaches are still not swept there. On 2026-10-07 `data/rosters.json`
holds 1,702 players, on 88 of the 102 teams (BVAL and MCAL were re-read that day: Marin Academy's 18
players now appear on MaxPreps, Westmont gained 3 and Tamalpais lost one; 1,682 on 87 teams on
2026-10-06, when the three independents' were read: Glendora 19, Harvard-Westlake 25, Thousand Oaks 21). Every entry lists
what was looked at. What a team with no MaxPreps players may say about other sources is recorded
per team (`otherRosters`: `none`, or `partial` with what the source lists and a link, as for Marin
Academy's first-name-and-initial list); a team without it says "we have not checked other public
sources" rather than claim there are none. It only ever fills a blank; where a source disagrees
with MaxPreps, MaxPreps stays and the disagreement is recorded; where sources disagree with each
other on a grade MaxPreps leaves blank, the grade stays blank and each source is recorded the same
way, under the player's `conflicts`. Every value carries its source URL, kind and a confidence. `lib/datasets/rosters.ts` is the read API:
`getTeamRoster(slug)` is MaxPreps alone, `getEnrichedTeamRoster(slug)` the merged view with
per-field provenance, conflicts and coaches, `sortedPlayers(team)` the display order. Every team
page, in all nine leagues and the five independents, renders it in a Roster section (`components/teams/TeamRoster.tsx`,
built by `views/teams/roster.ts`): varsity only, a † on every value that did not come
from MaxPreps, the coaches, every recorded disagreement and a link to each source. A team with no
list says why instead of showing an empty card: MaxPreps lists no players, the last update failed
with nothing to fall back on, or no update has covered the team yet; its coaches and their sources
still show below.

The same overlay links players' own recruiting pages — NCSA, SportsRecruits, Hudl and FieldLevel
profiles (`profiles` on each record; 401 for 316 players as of 2026-10-07). NorCal: 134 for 114 (SCVAL 70
for 56, BVAL 14 for 14 (two of them Westmont's Kaylee and Lexi True, from the 2026-10-07 sweep of the rows MaxPreps added), PCAL 3 for 3, MCAL 14 for 12, EAL 33 for 29: Chico 16 for 13, Pleasant Valley 11
for 11, Davis 5 for 4, Lassen 1 for 1, none for Bella Vista or Corning; 25 NCSA, 58 SportsRecruits, 51
Hudl). Southern California, swept 2026-10-06: 267 for 202 (134 Hudl, 64 NCSA, 55 SportsRecruits, 14
FieldLevel), the most at Bishop's (37 for all 24 rows), Harvard-Westlake (25 for 22), Torrey Pines (24
for 13), San Dieguito Academy (18 for 16) and University City (16 for 13); 17 of the 53 teams have none,
eight of them because MaxPreps lists no players. Each SoCal page was re-read by a checker and,
separately, by a refuter, and kept only when both kept it. Since 2026-10-12 a profile in any sport is
linked, naming its sport ("SportsRecruits lacrosse profile"): that day's SportsRecruits address probe
in every sport, over all 1,673 rows, added 118
pages for 116 players (52 NorCal, 66 SoCal): 91 lacrosse, 15 softball, 6 field hockey, 5 soccer and 1 track
and field, so the file holds 519 for 410 players. A page is linked only when it names the player and a
sport and either names the school or shows the class year the roster shows plus a California hometown
(for the 2026-10-12 pages, a hometown in the school's own area), and a stated class year must
agree with the row's grade (checked at load). On 2026-10-13 every row's MaxPreps career page was
read for MaxPreps' own claimed flag (`isClaimed`, a page the player or a parent has claimed): the 260
claimed pages, on 73 teams, are linked as "MaxPreps profile" (`platform: "maxpreps"`, always the row's
own `careerUrl`, checked at load), 159 of them for players with no other profile, so the file holds
779 profiles for 569 players. The roster shows them as a line of links under the
player's facts. Recall is partial: see `docs/DATA-SOURCES.md` §1.1j, which also has the column map,
the per-school sources and the overlay's rules.

```bash
pnpm fetch-rosters                                      # live: 102 roster pages → data/rosters.json
pnpm fetch-rosters --leagues bval,pcal                  # only these leagues; the others keep their rows
pnpm fetch-rosters --fixtures tests/fixtures/maxpreps   # offline, from the captured pages (SCVAL's: add --leagues scval)
pnpm fetch-rosters --capture <dir>                      # live, and save each page read as <dir>/roster-<slug>.html
pnpm fetch-rosters --dry-run                            # parse and report, write nothing
```

## Player stats

All nine leagues and the five independents, like the rosters it joins to: `fetch-player-stats` iterates the 102-team registry,
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
California teams, 62 of the 99 (758 players); on 2026-10-06, with the three independents,
63 of the 102 (776 players; Harvard-Westlake's 18, Glendora and Thousand Oaks none); where MaxPreps answers "No data was found" the file says `status: "none"`, and a team no
run has covered yet is `status: "pending"`. `lib/datasets/player-stats.ts` loads it and `lib/queries/player-stats.ts` adds the game-note stats; each team page
renders it in a Player stats section (`components/teams/TeamPlayerStats.tsx`, built by
`views/teams/player-stats.ts`), which says when MaxPreps last updated and how many games
the team has played since. See `docs/DATA-SOURCES.md` §1.1k.

The same file feeds the player boards on `/leaders` (`views/leaders/player-boards.ts`): most
points, Elo-adjusted points (see docs/RATINGS.md "Elo-adjusted goals and points"), assists, saves and clean sheets
(MaxPreps' goalkeeper "shutouts"), one set of boards per region.
A player can only appear where the coach tracks that stat, so each board says how many teams it
covers and names the ones it leaves out, a 0 never makes a board, and the page names every team
with no stats and every team whose totals are behind its finals (the team page's "games since"
rule, shared through `gamesSinceUpdate`). The school boards on the same page come from the snapshot
instead and cover all 102 teams, again per region (the independents are on every SoCal school board, the league record included: their table is their league): overall and league records are the `Standing` rows the standings
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
(≤3 concurrent, ≥500 ms between starts): 102 small calls (about 25 seconds when it was 43).

```bash
pnpm fetch-player-stats                                      # live: 102 rollups → data/player-stats.json
pnpm fetch-player-stats --leagues bval,pcal                  # only these leagues; the others keep their rows
pnpm fetch-player-stats --fixtures tests/fixtures/maxpreps   # offline, from the captured JSON (SCVAL's: add --leagues scval)
pnpm fetch-player-stats --capture <dir>                      # live, and save each response body, as received, as <dir>/stats-<slug>.json
pnpm fetch-player-stats --dry-run                            # parse and report, write nothing
```

## JV games

Every team page has a "JV games" section (`#jv`) and every day page a JV block after the varsity
games: the school's junior varsity games, **kept apart from varsity**. No varsity standings table,
record, form strip, leader board, Elo rating or postseason picture reads them; they have JV tables
of their own on `/jv` (see "JV standings" below), and a team page's JV header names the team's JV
place when its table is shown and links it.

### JV standings

`lib/engine/jv/standings.ts` builds one JV table per division, in three steps, and `/jv` prints them, one
section per league (`app/jv/page.tsx`, `components/standings/JvStandings.tsx`, built by
`views/standings/jv.ts`). They are a page of their own, linked from each
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
  season id (`JV_SPORT_SEASON_ID` in `lib/config/season.ts`, read from `maxpreps.com/ca/field-hockey/jv/`)
  and the school's own registry id; each row becomes a `Game` through `lib/pipeline/reconcile/normalize.ts`, exactly
  as a varsity row does, except that a level JV final is never read as a shootout win (the San
  Diego shootout procedure is varsity only). On 2026-10-05: 260 games for 45 of the 49 schools, 91
  with a score (Del Mar, Live Oak, Sobrato and Silver Creek have none). On 2026-10-06, with the
  Southern California schools: 531 games for 91 of the 99, 208 of them final; with the three
  independents (Glendora 8 games, Harvard-Westlake 13, Thousand Oaks none), 533 games for 93 of the
  102, 209 of them final.
- **si.com** (`sblive`): each school's JV team page (101 schools; Marin Academy has no si.com page),
  scored finals only. A JV side is one of ours only by its si.com JV team id (`lib/registry/jv-teams.ts`,
  read from each varsity page's level switcher), never by name.

What the pages show is `mergeJv` (`lib/engine/jv/merge.ts`) over the two, decided again on every build
from the file's own `fetchedAt`. **MaxPreps comes first**; si.com only supplements it, for a game
between two registry schools matched by pair and date (±1 day): it fills a past game MaxPreps has no
score for, and adds a game MaxPreps does not list when MaxPreps has no JV game of that pair within
±14 days (both marked †, as a varsity backfill is); where the two disagree on a final, MaxPreps'
score stays and si.com's is noted under the row. A game si.com lists twice with different scores,
or two si.com games equally near one MaxPreps game, is never used. On 2026-10-05 si.com filled 7
scores, added 12 games (mostly PCAL, where MaxPreps had one JV score) and disagreed on 3.
`lib/datasets/jv.ts` loads it and `lib/queries/jv.ts` is the read API; `views/teams/jv.ts` builds both lists
(`components/teams/TeamJvGames.tsx`, `components/schedule/JvDayGames.tsx`).

`update-data.yml` runs it after `fetch-player-stats`, on the same terms: it may fail without
stopping the run, writes nothing outside the season window unless `--force`, leaves the file alone
when only its stamps would change, takes `--leagues`, and scopes failures to the team and the
source (a failed MaxPreps feed or si.com page keeps that school's previous rows, `carried-forward`).
The previous file is salvaged row by row, as for rosters and stats: each team row, game and si.com row
is held to its own schema and one that fails costs only itself, so a registry that grew (which fails
the whole-file schema) no longer sends every team outside a `--leagues` run to `pending`. Cost per run: 102 small MaxPreps calls through the MaxPreps client's gate and up to 101 si.com pages,
one at a time, 1 s apart (about a minute for the 48 NorCal pages; the 101 now take at least 101 seconds of that spacing alone). A day page exists only for a date with a varsity game, so
a JV-only date (Aug 18 in 2026) is on the team pages alone.

```bash
pnpm fetch-jv                                   # live: 102 MaxPreps JV feeds + 101 si.com JV pages → data/jv.json
pnpm fetch-jv --leagues bval,pcal               # only these leagues; the others keep their rows
pnpm fetch-jv --no-sblive                       # MaxPreps only; si.com rows are carried
pnpm fetch-jv --fixtures tests/fixtures/jv --leagues pcal   # offline, from the PCAL captures
pnpm fetch-jv --capture <dir>                   # live, and save every response as <dir>/jv-sched-<slug>.json / jv-sblive-<slug>.html
pnpm fetch-jv --dry-run                         # parse and report, write nothing
```

## Clubs

`data/clubs.json` holds the youth field hockey clubs around the 43 schools swept on 2026-10-03, plus any other club a
rostered player is tied to, plus three clubs met near the EAL teams' schools on 2026-10-04 (D-City in Davis and
Roseville FHC, in the Sacramento area, and Chico Hotshots, in the North State; neither area was searched for every
club), plus the twelve clubs around the 53 Southern California teams' schools swept on 2026-10-06, and the ties themselves: which players on the tracked varsity rosters
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
  that agrees with the roster grade together with a location in the school's half of the state,
  Northern or Southern California ("CA", or a hometown with no state, is not enough). A name alone
  never makes a match, and a class year that disagrees rules one out. A nickname or given-name
  form of the roster's first name counts when the page otherwise meets the rule and something
  beyond the name backs it (a second page, the player's own page naming the same club, or a club
  she is already tied to); such a match is medium confidence unless a page names the school
  (revised 2026-10-06; before, a nickname counted only on a page naming the school). Lacrosse, soccer and ice
  hockey clubs do not count.
- **Only players already on the tracked varsity rosters are named** (rows the overlay marks JV
  are out), each under the roster's own spelling. A club's own roster lists many more players; the
  club's page links that roster instead of naming them.
- **Quotes and bases are kept, never rendered.** A page shows each source as a link labelled by
  its kind and host ("SportsRecruits profile", "club roster", "Gilroy Dispatch").
  `pnpm assert:copy` fails the build if any built page shows a basis, a quote fragment, or an
  excerpt of one whose text is not just public names (`affiliationLeaks` in `scripts/ci/copy/copy-rules.ts`,
  with `scripts/ci/copy/public-terms.ts`), because both can name people who are not on the rosters.
- **No social media**: no source or website on Instagram, Facebook, TikTok, X (Twitter), Threads,
  YouTube, Snapchat or LinkedIn, or their short links (`BANNED_HOSTS` in `lib/schema/source-url.ts`),
  and every URL is https.
- **`unknown` is never called current.** A club a source names without saying whether the player
  is still with it reads "Listed by NCSA, 2025" (the date or season the source gives) on the club
  page and "Listed club" on the roster; a `past` one reads "Earlier".

Checked at load, so a bad file fails `pnpm test` and the build (`lib/schema/clubs.ts`, then the
join in `lib/datasets/clubs.ts`): club slugs are unique, every affiliation names a club, and
(team, athlete, club) is unique; https only, never social media; at least one source per club and
per affiliation; `asOf` is a date, a month, a year, a season (`2025-26`) or a range (`2015-2018`);
the file's `season` is `data/rosters.json`'s; every affiliation joins a row of that team under the
row's own `fullName`, and the row is not JV; every stated class year agrees with the row's grade
(MaxPreps', else the overlay's; a row with no grade has nothing to check).

Coverage, counted from the file: **28 clubs** and **171 affiliations for 149 of the 1,673 varsity rows, at
48 of the 102 schools** (2026-10-07). NorCal: 16 clubs (San Francisco 2, South Bay 7, East Bay 2, Marin 1, the
Sacramento area 2, the North State 1, and HTC, now filed under San Diego, where its California program
trains; none on the Peninsula or the Central Coast, both searched; the Sacramento area and the North
State were not searched for every club) and 94 affiliations for 80 of the 811 varsity rows, at 25 of the
49 NorCal schools, as swept; the 2026-10-07 sweep of the 21 rows MaxPreps added since (Marin Academy's 18,
three at Westmont) found one more, Kaylee True to Fly FHC. Southern California (2026-10-06): 12 more clubs (San Diego: RUSH, Coastal Clash, Myto
and the San Marcos Knights; Ventura County: the Ventura County Red Devils and Bulldogs; Los Angeles: West
Coast Riptide and the LA Tigers; Orange County: the Royals, the Huntington Beach Surfers, the SoCal
Strikers and the Orange County Field Hockey Club; none found in the Inland Empire, all five areas
searched) and 76 affiliations for 68 of the 842 varsity rows, at 23 of the 53 schools: HTC 28, RUSH 16,
Myto 15, Coastal Clash 7, VCRD 6, the Knights 3 and West Coast Riptide 1; 61 current, 6 past and 9
unknown; 63 high and 13 medium; seven players are tied to more than one club. One (Abigail Karlander,
Torrey Pines, to RUSH) rests on the revised nickname rule: both pages say "Abby". They rest on 173 source
entries on 117 URLs, most of them SportsRecruits athlete pages (80 entries) and MAX Field Hockey pages
(34). "Rush Devils" is a joint squad of RUSH and VCRD players, so a page that names only "Rush Devils"
ties a player to neither club. The 2026-10-03 sweep made 72 of them, for 66 of the 716 varsity rows at 22 of the 43 schools:
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
players: SF Hawks 32 (all current), NorCal Impact 25 (all current), Fly FHC 14, Infinity 9, Chico
Hotshots 5 (4 current), D-City 4 (none current), Lightning 3, HTC 2 (both current) and Golden Gate
Rippers 1 (past). The other seven (Pac Heights, Performance Field Hockey, San Jose Khalsa, Stryker,
Hayward Hawks, Lions and Roseville FHC) have a page with an empty state.

**It is research, not a script.** Like the roster overlay, it was gathered by hand from club
directories, the clubs' own sites, recruiting profiles, MaxPreps career pages, the NFHCA's high
school watchlists, MAX Field Hockey's club pages and local news. Every tie of the 2026-10-03 sweep
was checked twice that day: a checker re-opened each source, then an independent refuter tried to
break the match. The eight ties the 2026-10-04 EAL sweep added were each confirmed by two
independent checks that re-opened their sources, and so were the 14 ties of the 2026-10-05
recruiting-profile pass (the pass itself, then an independent refuter), the 76 ties of the 2026-10-06
Southern California sweep (a checker, then an independent refuter; only ties both kept) and its twelve
club records (each re-read from the club's own site).
Nothing refreshes it, and re-running it is research. Recall is partial: see `docs/DATA-SOURCES.md`
§1.1j2 for the sources, the gotchas and the count by school.

**When a roster refetch breaks it.** `lib/datasets/clubs.ts` throws at import if `pnpm fetch-rosters` drops
or respells a tied player's row, if the overlay marks that row JV, or if a season rollover moves
`data/rosters.json` to a season `data/clubs.json` is not for; `pnpm test` and the build then fail
with `clubs: <team> / <player> (<club>): <what>`. Re-check that affiliation's sources, then edit or
drop it by hand (on a rollover, redo the research for the new season). Never prune it
automatically.

`lib/datasets/clubs.ts` is the read API: `getClubs()` and `getClubSlugs()` in display order (region, then
most tied players, then name), `getClub(slug)`, `getClubAffiliations(slug)`
and `getPlayerClubs(team, athleteId)` (current, then listed, then
earlier). `views/clubs/club-view.ts` builds every view, and the modules beside it (`views/clubs/words.ts`
first) choose every word the pages say about a tie. The gates know the pages: `assert:prerender` and `assert-vinext-prerender.ts` expect
`clubs/<slug>` for exactly the file's slugs, `smoke-server.sh` counts them in the sitemap and
expects `/clubs/nope` to be a 404, and `a11y-axe.mjs` checks `/clubs`, the first club page and the
first club page with no tied player.

## College commitments

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
roster grade plus a location in the school's half of the state), the same privacy posture (only tracked varsity
rows, by the roster's spelling; quotes and bases kept, never rendered, and `pnpm assert:copy` fails
on a leak through `commitmentLeaks` in `scripts/ci/copy/copy-rules.ts`). Unlike the clubs, a social-media
post counts when an official account posted it (since 2026-10-12): a college's athletics or team
account, the player's high school's, or a club's, cited as an `official-social` source naming that
account and a non-social page proving it is the owner's. A player's own post never counts, which
costs recall: many commitments are announced only on a player's own Instagram, and those are not
listed. College
interests, offers, visits, camps and watchlists are not commitments, and neither is a place on a
college's club team. A commitment in another sport counts (since 2026-10-04): the site is about
field hockey, but its players commit to lacrosse, soccer and other college teams too, and every
page names the sport.

Checked at load (`lib/schema/commits.ts`, then the join in `lib/datasets/commits.ts`): college slugs are
unique, every commitment names a college that has a program in its sport, every college and every
program has a commitment, a college has one program per sport, one commitment per player; https only, never social media except an `official-social` source that is a post by the account it names; a source for every college and commitment; the file's
`season` is `data/rosters.json`'s; every commitment joins a non-JV row of that team under its own
`fullName`; every stated class year agrees with the row's grade, or, for a row with no grade, the
sources agree with each other on a class a high school roster of the season can hold.

Coverage on 2026-10-12, counted from the file: **31 commitments, 31 players at 18 of the 102 schools, to
24 colleges (27 programs).** The 2026-10-12 round (see below) added three. Two are from Northern California:
Shyla Paredes, Valley Christian, to Cal Baptist in softball (medium: her travel club Cal Nuggets'
commitment list and roster, tied to her by her own MaxPreps page naming the club), and Molly Waltz,
Archbishop Mitty, to UC Davis in lacrosse (high: ADVNC Lacrosse's commits page names her school, and
her own SportsRecruits profile shows the commitment). The third, from that day's SportsRecruits
probe in every sport, is Campbell Trocha, Cathedral Catholic, to Florida Tech (NCAA Division II) in
lacrosse (high: her own profile, with her NCSA field hockey page naming the school). Southern California's twelve, from the 2026-10-06 round over its 842 rows,
are ten in field hockey (Sami Lee, Canyon Hills, to Columbia; Dylan Rietti, Torrey Pines, to Richmond; Ava Hauer, Torrey Pines, to Johns
Hopkins; Lola Conway, Bishop's, to Michigan; Margaux Schlumberger, Harvard-Westlake, to Harvard;
Samantha Ippolito, Scripps Ranch, to Michigan State; Eva Allen, Canyon Hills, to Cal; Rylie Storm,
Canyon Hills, to Harvard; Reese Roldan, Canyon Hills, to UC Davis; Ella Rennie, San Dieguito Academy, to
Muhlenberg) and two in lacrosse (Emerson Davis, Bishop's, to Harvard; Lia Palecek, Cathedral Catholic,
to Oregon): seven from 2027 and five from 2028, ten to Division I and two to Division III (Johns Hopkins
and Muhlenberg). Nine are high confidence (each player's own SportsRecruits profile names the school and
the college) and three medium (Storm, Roldan and Lee: one FH College Path line plus the class year and
their San Diego club, RUSH; Lee's line and RUSH's page call her Samantha, and her own MaxPreps page
naming RUSH backs the match under the revised nickname rule). Four carry a date (Sep 22, 2025, Jun 19,
Jul and Sep 16, 2026). They rest on 38 source entries on 31 URLs. Harvard holds two programs (field hockey and lacrosse, both Ivy League), and
Cal gained a field hockey one (ACC). The NorCal figures that follow are as of 2026-10-04 (the six EAL
teams' schools were swept that day for field hockey commitments and then in the every-sport round, and
none was found): 16 commitments, 16 players at 9 of the 49 schools, to 14 colleges (15 programs). By sport, 7 in field hockey, 7
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
EAL recall is lower than the other leagues'. On 2026-10-06 the round was taken to the 53 Southern
California teams' schools (842 rows): SportsRecruits' field hockey college pages and the commits API
behind them (35,060 records), its lacrosse, soccer, volleyball, basketball, water polo and softball
college pages, FH College Path, Play College Field Hockey, the SoCal clubs' own pages, TopDrawerSoccer,
SoccerWire, ClubLax and other lists, the San Diego Union-Tribune, the OC Register and the student
papers that answered, a SportsRecruits profile probe in every sport for every row, and web searches for
840 of the 842 rows: one for each junior and ungraded row of the first pass and two for each senior, then
two for each of the freshmen and sophomores and 86 of the 88 ungraded rows it had not reached (a second
pass, 456 searches). The two rows never searched are Samantha Ippolito and Ella Rennie, whose commitments the list
sweeps had already found. A checker
and an independent refuter re-opened each of the eleven it found, and both kept all eleven (and, under
the revised nickname rule, a twelfth: Sami Lee to Columbia, kept by a fresh checker and refuter);
SportsRecruits' athlete search was not run for these rows. Recall is partial: see `docs/DATA-SOURCES.md` §1.1j3
for the sources, what was rejected and why, and the gaps.

**When a roster refetch breaks it.** `lib/datasets/commits.ts` throws at import, as `lib/datasets/clubs.ts` does, if
`pnpm fetch-rosters` drops or respells a committed player's row, if the overlay marks it JV, or if a
season rollover moves `data/rosters.json` to another season; `pnpm test` and the build then fail
with `commits: <team> / <player> (<college>): <what>`. Re-check the commitment's sources, then edit
or drop it by hand. On a rollover the seniors graduate: redo the research for the new season.

`lib/datasets/commits.ts` is the read API: `getCommitments()` in display order (class, then school, then
name), `getColleges()` (most players first), `commitProgram(commitment)` (its
college's team in its sport, with that team's level),
`getPlayerCommitment(team, athleteId)` and `commitClassOf(commitment)`.
`views/commits/commit-view.ts` builds the page and the roster line and chooses every word they
say. `/commits` is one static page (DESIGN §21): one section per class year, then the colleges, then
how commitments are matched; every team page with a committed player shows a commitment line under
that player's facts ("Committed: Colgate", or "Committed: St. Lawrence (soccer)" in another sport),
linking the player's row there. The gates know the
page: `assert:prerender`, `assert-vinext-prerender.ts` and `smoke-server.sh` expect it among the
fixed pages, and `a11y-axe.mjs` checks it.

## School mascots

Every team's tile is its MaxPreps mascot, self-hosted in `public/mascots/` (a square WebP per
school for every tile size at 1× and 2×, 20–128px, so none is resampled by the browser; DESIGN §12.4),
so no page loads an image from another site. Where MaxPreps'
mascot is too small or distorted to draw well, `SOURCE_OVERRIDES` in scripts/fetch-mascots.ts takes
the same mark from a better source instead: the school's own site for Monta Vista (whose MaxPreps
mascot is a 68px gif), Lassen, Mira Mesa, Redwood and Saratoga, plus Patrick Henry's crest (the
emblem the school uses on its site and social media), and SBLive/SI for Rancho Bernardo, La Costa
Canyon, Marina, Live Oak and Huntington Beach.
The files are committed, not refreshed by the cron. Run `pnpm fetch-mascots` when a team joins the
registry (`tests/data/mascots.test.ts` fails until its tiles exist) or a school changes its logo:

```bash
pnpm fetch-mascots                       # all 102 teams
pnpm fetch-mascots --only los-altos      # one team (repeatable)
pnpm fetch-mascots --dry-run             # fetch and process, write nothing
```

## Research artifacts under tests/fixtures

Four files under `tests/fixtures/` are TypeScript saved as `.ts.txt`: research drafts written before the
code they describe existed, kept as the provenance of what replaced them. Nothing compiles, imports or
runs them (the `.txt` suffix keeps tsc, ESLint and Vitest away), and like every fixture they are never
edited, so the module paths they quote are the names proposed at the time, not files of this repo.

| File | What it is | What replaced it |
|---|---|---|
| `tests/fixtures/mcal/reference/mcal-bracket.ts.txt` | The reference implementation of the MCAL six-team tournament (seeds by league points, the re-seeded semifinals, the fixed final site) | `lib/engine/postseason.ts`, which ports it onto `Standing[]` and `LeagueConfig.postseason` |
| `tests/fixtures/mcal/reference/mcal-bracket.test.ts.txt` | Its seven cases on the 2025 MCAL bracket | `tests/lib/engine/postseason-mcal-2025.test.ts` |
| `tests/fixtures/sblive/identity/proto-resolver.ts.txt` | A prototype of id-first si.com side resolution over the captured pages beside it | `lib/sources/sblive/identity.ts` |
| `tests/fixtures/sblive/identity/sblive-identity.test.draft.ts.txt` | Draft regression tests for that resolution (the statewide namesakes) | `tests/lib/sources/sblive/identity.test.ts`, run against the captured si.com pages in `tests/fixtures/sblive/identity/` |
