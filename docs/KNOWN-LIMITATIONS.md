# Known limitations

- **Some schools are not covered.** Wilcox is not fielding a team this season: the official SCVAL
  De Anza grid still lists it, but it is not in the team registry, its 14 grid fixtures are
  dropped when the PDF is parsed, and De Anza is shown as 7 teams. York plays JV field hockey only
  (PCAL's grid slot `CAT/YOR` is Santa Catalina), so it has no varsity results. Both are in the
  `withdrawnNames` of their league in `lib/config/leagues.ts`, and the team search says so. Red Bluff is not
  fielding a varsity team in 2026 either (MaxPreps' EAL table still lists it as a 0-0-0 row; a JV
  game of its own exists, so the site says only "not fielding a varsity team in 2026").
  In Southern California, Madison, Santana, Castle Park, Chula Vista, Montgomery and Sweetwater have a
  2026-27 MaxPreps team but no varsity game there or in the San Diego Section's power rankings; Mayfair
  has no game and is not on the Southern Section's list of participating schools. Elsewhere in
  California, River Valley (Yuba City, Sac-Joaquin Section), North Salinas and Notre Dame (Salinas)
  have no 2026 varsity game on MaxPreps either (each team's schedule returned no game on 2026-10-06),
  so none has a page. The team search prints a sentence for each. Harvard-Westlake, Thousand Oaks and
  Glendora, each the only field hockey team in its all-sports league, are covered as the Southern
  Section independents: they have team pages and count in the Elo fit and the SoCal boards, and their
  table is this site's count of their games against each other, with no ladder (DESIGN §24.9, §24.10).
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
  Sunset table holds three of the eight (Great Oak, Temecula Valley, Chaparral), with Bonita and
  Chaminade, which this site lists with the independents, and gives the five Orange County schools no
  league at all. In San Diego it has no Valley table, its City
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
  `lib/config/leagues.ts`. The San Diego brackets are not drawn here at all.
- **MaxPreps' manual entry lags.** Coaches enter scores by hand; at times only a fraction of
  played games carry a score days after the fact, and MaxPreps occasionally corrects a
  previously-entered result. The fetch script re-ingests every team's entire season on every run
  (not just a trailing window) specifically so corrections and backfills are never missed.
- **SBLive's league buckets are wrong for SCVAL and the Sunset.** Its "De Anza" and "El Camino" pages
  misfile several SCVAL schools between divisions and omit Santa Clara entirely; its Sunset table
  lists six of the eight, Bonita and Chaminade (the independents here) and two 0-0 rows, and files
  Chaparral and Temecula Valley under "Southwestern". Statewide name collisions are common (University, Los Altos, Santa Clara, Davis,
  Westview, Del Norte, Marina, San Marcos, Mission Vista, Granite Hills and Southwest), and si.com
  sometimes puts one of our teams' games on a namesake's page (Westview v Sage Creek on West Los
  Angeles' Westview; Del Norte's Oct 16 games on Crescent City's), where they do not join.
- **si.com's statewide scoreboard is read only as far as its first page.** It server-renders the
  first 24 games of a day and loads the rest in the browser through an API the pipeline does not call,
  so on a busy day some si.com rows are not read. The parser warns ("si.com scoreboard lists N of M
  games"), and a row it did not read is never treated as an absent game. si.com is a cross-check and,
  under the narrow backfill rules of docs/STANDINGS.md "si.com backfill (owner decision D2)", a source of scores MaxPreps lacks or has plainly wrong;
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

  On 2026-10-12 MaxPreps' own career pages and its 2025-26 and 2024-25 field hockey rosters filled
  136 more grades (127 of them for Southern California teams, whose MaxPreps rosters mostly carry
  none), and a second pass over the schools' own athletics sites, school papers and local news filled
  113 (95 from school sites, 18 from papers; 100 in Southern California). Where sources disagree the
  grade stays blank with each one recorded (six rows that day), and 164 varsity rows still have no
  established grade.

  The overlay filled 215 grades, 14 positions and 23 heights (all heights are SCVAL's: no BVAL, PCAL
  or MCAL roster source publishes one, and the NCSA profiles that list a height are only linked,
  never used to fill a field; the overlay filled no jersey number in any league). Grades whose
  sources disagree are left blank: 9 in BVAL, PCAL and MCAL, each with its sources under conflicts
  except one whose single page contradicts itself. **Positions are the
  real gap**: no current-season public source lists them for most programs in any league. A
  position MaxPreps lists only for the 2025-26 roster is deliberately not filled, since positions
  change between seasons. Del Mar, Silver Creek, Sobrato, Monterey, Santa Catalina and Corning have
  no players on MaxPreps, so there is nothing to join to. Marin Academy had none either until its 18
  appeared on 2026-10-07; they agree with the school's own list (first names, last initials and class
  years) and were swept on 2026-10-07 (no profile, club or commitment found for any of them). Los Altos and Homestead publish no roster anywhere, and
  si.com's rosters were rejected as a source (names only, and often a different list of names).
- **Player stats exist only where a coach enters them.** Rosters and stats cover all 102 teams. The
  53 Southern California teams were read live on 2026-10-06 (with them, 1,682 players on 87 of the 102
  teams, and stats for 63; 1,702 on 88 after the 2026-10-07 BVAL and MCAL re-read); their overlay entries hold recruiting profiles only (swept 2026-10-06), so
  their pages say we have not checked other public sources. For the NorCal teams, the
  43 teams of the four earlier leagues were read live on 2026-10-03 (all 43 pages parse; SCVAL's rows
  matched the 2026-10-02 captures exactly; 6 BVAL/PCAL/MCAL teams had an empty roster on MaxPreps, 5 since Marin Academy's appeared on 2026-10-07, and
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
  rule, so on 2026-10-07 149 of the 1,673 varsity rows have a club line, and 54 of the 102 schools have
  none (14 of them list no players on MaxPreps at all). The Los Angeles, Orange County and Ventura clubs
  publish no player rosters, so schools there are nearly blank. A player with no club line may still play for a club. The ties
  were researched once, on 2026-10-03 (the six EAL teams' schools on 2026-10-04, which added eight ties for five players at Davis and
  Pleasant Valley, and three club records; on 2026-10-05 a re-read of the linked recruiting profiles
  added 14 ties for 13 players; the 53 Southern California teams' schools on 2026-10-06, 76 ties for 68
  players; the 21 rows MaxPreps added to Marin Academy and Westmont on 2026-10-07, one tie), and nothing
  refreshes them. See `docs/DATA-SOURCES.md` §1.1j2.
- **Commitment recall is partial, and the list does not update itself.** A commitment is listed
  only when a public page meets the linking rule, and social media counts only from an official account, so on 2026-10-12 31 of
  the 1,673 varsity rows have a commitment line (in any sport) and 84 of the 102 schools have none; a player with no
  line may still have committed. It was researched on 2026-10-03 and 2026-10-04 (the six EAL teams'
  schools on 2026-10-04, for field hockey and then every sport, with none found, though without
  SportsRecruits' athlete search or web searches for freshmen and sophomores): a later signing,
  decommitment or new commitment (the class of 2027's signing period is in November) is not shown
  until someone redoes it by hand. The 53 Southern California teams' schools were swept on 2026-10-06,
  in every sport, with at least one web search for 840 of the 842 rows (the other two are players whose
  commitments were already found) but without SportsRecruits' athlete search. See
  `docs/DATA-SOURCES.md` §1.1j3.
- JV tables are unofficial and computed: no league publishes JV standings in season, a JV league game
  is identified by its varsity counterpart, and a table is shown only once 60% of its division's played
  JV league games have a score (on 2026-10-05: El Camino, MCAL and the EAL). There are no JV leaders or
  ratings. JV scores
  are thin where coaches do not enter them (on 2026-10-05 MaxPreps had no score for any past BVAL or
  PCAL JV league game; si.com fills part of PCAL's), JV rosters are on MaxPreps for 11 schools and JV
  stats for 4, neither of which the site shows, and nothing says authoritatively which schools field a
  JV team (York, PCAL's JV-only member, appears only as an opponent). See docs/DATASETS.md "JV games".
- **The header wordmark is NorCal again, and its 2026-10-04 measurements apply.** The site name,
  wordmark, home h1 and manifest stay NorCal (owner decision, 2026-10-06; DESIGN §24.1), so the widths
  measured in Chromium on 2026-10-04 and recorded in `components/layout/SiteHeader.tsx` stand ("NorCal HS FH" 115 px with its padding below 1280 px, the full wordmark 193 px from
  1280 px). The home row with the region switcher was measured at 320, 360 and 390 px (DESIGN §24.3):
  it costs one 48 px row, and the §15.6 fold targets are missed.
- **axe-core is pinned to the 4.13 line in CI.** axe-core 4.14.0 (published 2026-10-05) widened its
  `label-content-name-mismatch` rule: it now compares the visible text of `aria-hidden` descendants
  and keeps the soft hyphens of the team-picker tiles, so it flags three patterns that predate this
  change and whose accessible names are deliberate sentences: the home pin tiles (`lib/shared/pin-label.ts`),
  the "Who we haven't beaten" rows and the pinned card's last-game link. With 4.13 the pass is clean
  (176 page loads, 0 serious or critical). Reworking those three names for 4.14 is a follow-up.
- MaxPreps' season-year URL segment is cosmetic (it always serves the current
  season, never a prior one); and a handful of MaxPreps/school-calendar start-time disagreements
  and si.com-only games that no official schedule lists are surfaced as warnings rather than
  silently resolved. See `docs/DATA-SOURCES.md` §7 for the full list of open risks.

## Open owner decisions

Choices the code makes on purpose today and leaves to the owner. Each is written down where the code
makes it, and changing any of them changes what a page prints or how a list is ordered, so none is made
in passing.

- **Should the Southern California postseason links name their document's format?** The EAL's card and
  `/about` link "Northern Section Field Hockey Guidelines (PDF)"; the Sunset, LA independents, City, North
  County and Metro links print the config's `sourceLabel` alone ("CIF-SS Blue Book 2026-27", "CIF-SDS
  Green Book 2026-27, Bylaw 2000.1"), with no "(PDF)" or "(Google Doc)" after it. Adding the format is a
  copy change on `/playoffs` and `/about` (`postseasonSourceLink` in `views/shared/postseason-source.ts`).
- **"a MCAL team" or "an MCAL team"?** Membership sentences choose their article in the `vowel` mode of
  `indefiniteArticle` (`lib/format/words.ts`), which reads a word by its first letter, so a division
  named like an acronym (MCAL) would read "a MCAL team"; the `letter-name` mode says "an MCAL". No
  division is named that way today.
- **Same-date game order.** A team's form and schedule, a head-to-head, a series, a schedule's days, the
  next games and the game-note walk sort with `byDateLocal` (`lib/shared/game.ts`): games on one date keep
  the order the snapshot lists them in. Switching those lists to `byDateThenId`, the canonical order the
  rest of the site uses, would make that order independent of how the pipeline built the array, but it
  reorders same-date rows on the pages that print them.
- **Add a LICENSE?** The repository has none, so it grants no reuse of its code or its hand-researched
  data files (`data/clubs.json`, `data/commits.json`, `data/rosters-enrichment.json`, the transcribed
  official fixtures). Whether to add one, and which, is the owner's call; what was read from the
  sources stays under their own terms whatever it says (`docs/DATA-SOURCES.md` §6).
