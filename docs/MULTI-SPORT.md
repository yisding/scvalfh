# Multi-sport: what is shared, what is field hockey's, and the road to a second sport

The owner wants the site to cover more California high school sports, with basketball and soccer first.
This note records how the code divides between sports (an audit of every layer, 2026-11-04) and the
order of work. The first step, the sport seam in `lib/sports/`, has landed, and so have a soccer
build, SCVAL girls soccer, 2026-27 ("Girls soccer: SCVAL" below), and a basketball build, SCVAL boys
basketball, 2026-27 ("Boys basketball: SCVAL" below), and a volleyball build, SCVAL and BVAL girls
volleyball, 2026 ("Girls volleyball: SCVAL and BVAL" below), and a middle school build read from a league's own site,
the VAL's girls soccer, 2026-27 ("Middle school girls soccer: the VAL" below). The rest is a plan.

## Decision: one sport per build

A sport is chosen at build time. Each sport is a separate build and deploy of this one codebase, on its
own origin (a subdomain such as `soccer.` is a hosting choice on top of this). We chose this over a
`/[sport]/…` route prefix for these reasons:

- Every route is prerendered. `scripts/assert-prerender.ts` checks exact counts derived from one
  snapshot and one league config, and a prefix would turn every route family into sport × league.
- `scripts/assert-budgets.ts` holds each page to its Stage-0 weight. The Worker bundles its data, so
  every sport in one Worker would put every sport's snapshot in it. The root layout's blocking head
  script also embeds a slug→league map that would then hold every sport's teams.
- Preferences live in `localStorage`: `scvalfh.league`, `scvalfh.region`, `scvalfh.theme` and the
  pinned team's slug. The same school slug (`cupertino`) names a different team in each sport, so one
  origin would mix them up.
- The copy-honesty rules in `scripts/copy-rules.ts` state league facts that are true for field hockey
  and may be false for another sport (for example "EAL school", Red Bluff, the Sunset "field hockey
  league"), so they are per sport by nature.

The cost: `/clubs`, `/commits` and `/recruiting` existed only for field hockey at first, so their presence
is per sport (`HAS_RECRUITING`: field hockey, volleyball since 2026-11-13, and girls soccer and boys basketball since
2026-11-21, so every high school build; the VAL's middle school build, `val-soccer`, has none; `/club-calendar` is
still field hockey's alone, `HAS_CLUB_CALENDAR`).
(`/jv` and `/history/2025-26` are every build's now.) A page that shows one school across several
sports would need links between origins: since 2026-11-16 the footer links every other sport's site and a team
page links the same school's page on each other site that covers it (`lib/sports/sites.ts`,
`lib/schools/other-sports.ts`; README, "Links between the sport sites").

## The seam: `lib/sports/`

| File | What it holds |
|---|---|
| `shape.ts` | Types only. `Sport` holds what all programs of a sport share: words, source identifiers, rating constants, stat lines. `SportSeason` holds one program's season and the MaxPreps ids it is read by. |
| `field-hockey.ts` | `FIELD_HOCKEY` and `FIELD_HOCKEY_GIRLS_2026`. Every value moved here unchanged from the literal it replaced, keeping its citation. |
| `current.ts` | `SPORT_ID`, `SPORT` and `SPORT_SEASON`, the build's one switch point; `bySport`, the way every per-sport choice is made; `SPORT_FEATURES`, the pages a sport has beyond every build's (`HAS_RECRUITING`, `HAS_CLUB_CALENDAR`); `DATA_DIR` (`data/<sport>`); and the derived words `GENDER_NAME` ('Girls'), `PROGRAM_WORDS` ('girls varsity') and `SPORT_AUDIENCE` ('girls varsity field hockey'). |

**Choosing among sports.** A value that differs by sport is `bySport({ 'field-hockey': …, soccer: …, basketball: …,
volleyball: … })`. The record must name every `SportId`, so adding a sport to `SPORT_IDS` is a type error at each
choice that has no value for it, never a silent fall into another sport's value (until 2026-11-18 these were
`IS_FIELD_HOCKEY ? … : IS_BASKETBALL ? … : soccer's` chains, whose last branch caught any sport not named). The
`IS_*` flags stay for a check about one sport alone. The one exception is a bundled data file: its loader keeps a
literal `process.env.SCVAL_SPORT === 'basketball' ? … : … : field hockey's` chain, because the bundler folds that
and leaves the other sports' files out of the build, which a `bySport` record would not. `tests/sport-choices.test.ts`
holds both rules: no multi-way `IS_*` chain anywhere, and every data chain names every sport, each branch its own
file. Every sport's data is under `data/<sport>/` (field hockey's moved from `data/` on 2026-11-18); `data/` itself
holds only those folders and the cross-sport player registry (`data/players.json`, `data/player-identity.json`).

All three are leaves, importing nothing but each other, and they are on the client-safe allowlist in
`tests/ui/client-boundary.test.ts`. `lib/season.ts` derives its constants from the switch, keeping
their names and values. So do:

- the fetchers: `lib/teams.ts`, `lib/leagues.ts`, and in `lib/sources/` the files `sblive.ts`,
  `cifss.ts`, `ccs.ts`, `vnn-ics.ts` and `http.ts`
- `scripts/fetch-prior-season.ts`
- the rating constants: `lib/ratings/ratings.ts` and `adjusted-scoring.ts`
- the player-stat lines: `lib/players/player-stats-schema.ts` and `note-stats.ts`
- the site's sport words in `components/layout/site.ts`, `components/metadata/*`, the page
  descriptions and titles under `app/`, and the team, game and day views

`tests/sports.test.ts` pins each moved value to the literal it replaced. The built pages are
byte-identical to the build before the seam.

## What is already cross-sport (keep)

- **Schools.** A team id is MaxPreps' school id, so it is the same in every sport. A school's name,
  short name, abbreviation, mascot, city, colors, address (`data/field-hockey/schools.json`), mascot tile, venue,
  si.com school id and VNN site id carry nothing sport-specific. The sport is chosen by the MaxPreps
  `sportSeasonId`. A si.com TEAM id is per sport (Homestead, si.com school 11004 in all three: field hockey
  458667, girls soccer 364703, boys basketball 155793), so each sport's registry records its own.
- **Regions and sections.** `REGIONS` is fully generic. A section's id, names, region and MaxPreps
  section id are generic too.
- **The domain types.** These are in `lib/types.ts`: ids, `Team`, `Game` and its sides, status,
  provenance and venue, `Standing`, `TiebreakInfo`, the health and cross-check rows.
- **The engines.**
  - The standings accumulation and stage interpreter in `lib/standings/engine.ts`. A league's points rule is
    already config (`LeagueRules.points`).
  - The season-phase and window logic.
  - The least-squares rating fit in `lib/ratings/ratings.ts`. Its model is generic; only its constants
    are tuned to field hockey.
  - The date, time, place, streak and plural helpers in `lib/format.ts`.
  - `lib/game-id.ts`, `lib/schema-primitives.ts` and `lib/stable-json.ts`.
- **The pipeline machinery.** In `lib/pipeline/`: `contract.ts`, `ledger.ts`, the transports, the
  corpus manifest, `read.ts` and the step order in `run.ts`. The MaxPreps clients already take a
  `sportSeasonId`.
- **The postseason shapes.** The `PostseasonConfig` kinds (ladder, league tournament, unbracketed,
  none, section playoffs), the live-bracket types and the round labels.
- **The UI primitives.**
  - In `components/ui/`: the form strip, monograms, score glyph, result, status and place chips,
    tags, empty states and berth meter.
  - The bracket drawing, the schedule lists, day navigation and timeline rail.
  - All of `components/prefs/`, and the top and bottom navigation.

## What is field hockey's (to separate, sport by sport)

- **League membership.** Each registry seed (`lib/registry/*.ts`) ties a school to one field hockey
  league and division, along with its `/field-hockey/` MaxPreps path, si.com team id and slug, and some
  aliases. SCVAL's field hockey divisions are not its basketball divisions.
- **Every league and postseason fact in `lib/league-config/`.**
  - Divisions and MaxPreps league ids, games per team and league-play dates.
  - Official documents, tiebreak chains and citations, ladders, berths and pairings.
  - The CCS block (16 teams, D1/D2, key dates), the Tournament of Champions, the San Diego Open/D1/D2
    sizes and `DATA_QUALITY`.
  - Each section's field hockey overlay: `holdsFieldHockeyChampionship`, `rulesSource`, `shootout`,
    `seasonWindow`, `noChampionshipNote`, `outsideTournament`.
- **Official schedules.** `OFFICIAL_SOURCE_IDS`, `data/field-hockey/official/*`, the BVAL sheet ids and the SCVAL
  PDF grid year.
- **Ties and deciders.**
  - The `Outcome` 'T', `Decider` 'OT' | '2OT' | 'SO', the shootout override in `sideOutcome`, and the
    W-L-T record words.
  - Basketball has no ties and only overtime, with any number of periods. Soccer has ties and penalty
    kicks (shaped like 'SO', named differently).
  - Done (2026-11-13): `Sport.scoring.overtime` ('sudden-victory', 'two-halves', 'until-decided') and
    `Sport.scoring.tiebreak` (words and tag: 'a shootout' / 'SO', 'penalty kicks' / 'PK', none for
    basketball), mirrored in `lib/format.ts` for client modules. The stored decider stays 'SO' in every
    sport. A level final marked W and L in a game that must have a winner (any postseason game; any
    basketball game) is the marked side's win (`lib/postseason/level-final.ts`). Soccer's overtime is never
    counted ('OT'), basketball's always is ('3 OT'), and a coach's overtime note is believed on any score
    in both. docs/LEAGUE-RULES.md, "How a game's result is read", has the table.
  - Done (2026-11-13): `Game.result` and `lib/results/result.ts` are every sport's: the recorded winner, ending
    and certainty of each final, the reading of a second source's score, and cited corrections
    (the fixture ledger’s result, lib/fixtures/, one list per sport).
- **Goal vocabulary.**
  - The `h2h-goal-diff`, `h2h-goals-against` and `division-goals-against` tiebreak stages.
  - The GF/GA/GD columns, legend and "no goal differential" in `components/standings/standings-table/`.
  - `GoalDiffBar`, the goal-margin strips, and the leaders' goals-per-game boards.
  - The stored keys `gf`/`ga`/`gd` are really for/against and can stay; only their labels change.
- **Ratings.** The Elo-adjusted scoring model (`lib/ratings/adjusted-scoring.ts`) is a Poisson goal
  model, which fits low scores only. Basketball needs a margin model with a cap near 20 and about 25
  Elo per point, and a Gaussian or offense/defense rating in place of Poisson, so the model must
  become optional per sport.
- **Player stats.** The field and goalkeeper lines, the game-note regexes (goal, assist, save, hat
  trick) and the positions F/M/D/G. Basketball has points, rebounds, assists, steals, blocks and
  shooting percentages, and no goalkeeper group.
- **Calendar.** `SEASON_DISPLAY` is `<term> <first year>`, which is right for fall. A winter season
  spans "2026-27". `update-data.yml` runs only in August to December, and the cifsshome.org window
  opens Aug 1.
- **Copy.** Most of what remains is league or section prose: the /about sources and postseason
  sections, the /playoffs cards, the history cards, clubs, commits and recruiting. It belongs with the
  league data, not in a vocabulary object.

## Order of work

1. **The sport seam (done).** Sport identifiers, words, rating constants and stat lines are read from
   `lib/sports/current.ts`. No output changed.
2. **Schools apart from teams.**
   - Split `Seed` into a sport-agnostic `School` (in `lib/schools/`) and a per-sport team entry:
     league, division, coverage, si.com team, sport aliases.
   - `toTeam` joins the two into today's `Team`, so the snapshot does not change.
   - Store the MaxPreps school path and append `SPORT.maxpreps.slug` in `toTeam`.
   - Edit all 102 seeds and the seed fixtures (`tests/fixtures/seeds/*.json`) in the same PR.
3. **Per-sport folders.**
   - Move `lib/league-config/` (minus the generic section fields), `lib/registry/` and the postseason
     instances under `lib/sports/field-hockey/`.
   - Split `SectionConfig` into a generic section and a per-sport overlay.
   - Rename `holdsFieldHockeyChampionship` behind a snapshot schema migration (`schemaVersion` 3,
     `lib/snapshot/snapshot-migrate.ts`).
4. **Per-sport data.**
   - Put each new sport's files under `data/<sport>/` behind a static import map
     (`lib/sports/<sport>/bundled.ts`), because a Worker has no filesystem.
   - Add `--sport` to the pipeline's `RunArgs` and carry the definition on `RunContext`.
   - Make `update-data.yml`, `tests/workflows.test.ts` and the assert scripts take the sport.
   - Field hockey's files moved from `data/*` to `data/field-hockey/` on 2026-11-18, so every sport's data is under `data/<sport>/`.
5. **Rules that vary by sport.**
   - Add `allowsTies`, the decider kinds and their words, and the record format (W-L-T or W-L) to
     `Sport`, and wire them into `recordString`, `OUTCOME_WORDS` and `describe-game.ts`.
   - Make standings columns config: points tables or win percentage, and GF/GA/GD or PF/PA/PD.
   - Make `adjustedScoring` nullable and stat columns per sport.
   - Hold the golden files (`tests/golden/`) for field hockey to byte equality throughout.
6. **The second sport.** Soccer first (SCVAL girls soccer is built: see above): its rules are closest to field hockey's (ties, 3-1-0, goal
   difference, goalkeepers). Then basketball. Each needs its own `SportSeason` read by
   `scripts/discover-season.ts`, league configs with citations, a registry and copy rules.

## Girls soccer: SCVAL (2026-11-06)

The owner asked for a girls soccer site covering SCVAL only. It is built ahead of steps 2-5, by switching
whole modules on the sport rather than splitting them, so field hockey's build is unchanged: every
prerendered page has the same text and markup as before (compared page by page, script chunk names
aside), and the field hockey tests, golden files and asserts pass as they were.

- **The switch.** `SCVAL_SPORT` (unset or `field-hockey`, or `soccer`), read once in
  `lib/sports/current.ts` (`SPORT_ID`, `IS_FIELD_HOCKEY`, `DATA_DIR`, `HAS_HISTORY`, `HAS_RECRUITING`, `HAS_CLUB_CALENDAR`).
  `next.config.ts` (`env`) and `vite.config.ts` (`define`) inline it, so the browser, the prerender and a
  Worker agree.
- **The sport.** `lib/sports/soccer.ts` (`SOCCER`, `SOCCER_GIRLS_2026`), its MaxPreps ids read live.
  `SportSeason` gained `hubPath` (the girls' hub is `/ca/soccer/girls/`; `/ca/soccer/` is the boys') and
  `hubSportSeasonId` (the hub's ssid is not the team season's, so the bootstrap step accepts exactly the one
  observed). The rating constants are field hockey's, not refitted.
- **The league and registry.** `lib/league-config/soccer/scval.ts` (from the SCVAL Soccer By-Laws and the
  two 2026-27 girls schedules) and `lib/registry/soccer/scval.ts` (15 seeds; MaxPreps keeps Fremont in no
  league, so El Camino's table has seven rows and `maxprepsMissing: ['fremont']`). `lib/leagues.ts`,
  `lib/teams.ts`, `lib/league-config/sections.ts` (`SECTIONS`, `REGIONS`, `CCS`) and `data-quality.ts`
  pick the sport's entries.
- **The CCS block.** `lib/league-config/soccer/sections.ts`, from the CCS 2026-27 Playoff Calendar, the
  Soccer Committee report of March 11, 2026 and the 2026-27 league alignments. Division 1 plays its
  semifinals and final a day before Divisions 2-5, so `CcsKeyDates` gained optional `semifinalsLast` /
  `finalsLast`, and `ccsRoundDays()` / `ccsLastDay()` print a round's days. What none of those documents
  says is null: the field's size and at-large count (`autoQualifiers.atLarge` / `total`), who hosts
  (`highSeedHostsThrough`), and MaxPreps' tournament (`tournament`, `bracketUrl`). Those fields are nullable
  in `CcsConfig`, the snapshot schema and every reader.
- **Data.** Under `data/soccer/`: the snapshot, JV, rosters, player stats and last season's games come
  from the usual fetchers (README, "Girls soccer"); the official fixtures are transcribed; the 2025-26
  archive (`history-2025-26.json`) is built by `scripts/build-history.ts` from SCVAL's standings
  PDF and a hand transcription of its all-league PDFs (`official/scval-all-league-2025-26.json`), and BVAL's
  standings sheet (added 2026-11-16), and
  validated like field hockey's; clubs, commits and the bracket files (the 2025 history brackets included: a
  CCS bracket's other schools are not in this registry) were empty placeholders the loaders served without field
  hockey's validation (the clubs and commits files until 2026-11-21: "Recruiting, winter builds" below).
- **Pages.** /history/2025-26 shows SCVAL's two divisions (final standings, varsity and JV, and the
  all-league teams), and its jump pills go to the divisions. /clubs, /clubs/[slug], /commits and /recruiting rendered
  a 404 and were linked from nowhere until 2026-11-21, when the build got them;
  the region toggle is hidden; copy that named field hockey's leagues or counted
  "N leagues" reads from config.

Not done yet, for the owner to decide or schedule:

- **Deploy.** The soccer site is a second Vercel project on soccer.ncfh.net (README, "Deploy notes"):
  `SCVAL_SPORT=soccer`, its own `SITE_URL`, and `scripts/vercel-ignore-build.sh` as each project's Ignored
  Build Step. `update-data-soccer.yml` refreshes `data/soccer/` Nov–Mar, and ci's `soccer` job builds and
  asserts it. Each sport also has its own Cloudflare Worker (`cloudflare.config.ts` names it from
  `SCVAL_SPORT`: `scvalfh`, `scvalfh-soccer`, `scvalfh-basketball`), deployed by `deploy-cloudflare.yml`'s
  per-sport matrix once its `SITE_URL` variable is set (README, "Cloudflare Workers"), and ci's `soccer` and
  `basketball` jobs build and package it. Not done: the
  smoke and axe passes on the soccer build (`scripts/smoke-server.sh` and `scripts/a11y-axe.mjs` name field
  hockey's leagues and regions).
- **The CCS Soccer Bylaws' allocation and hosting rule**, read by a person, to fill the nulls above, and
  MaxPreps' 2027 CCS tournament page once it exists.
- **Steps 2-5 below** still stand; the soccer build's per-module switches are what they would replace.

## Boys basketball: SCVAL (2026-11-10)

The owner asked for a boys basketball site covering SCVAL, "the same as the other sites", with as much JV
data as possible. It is the third build (`SCVAL_SPORT=basketball`), switched module by module like soccer;
where soccer could reuse field hockey's rules, basketball could not, so parts of step 5 landed with it.

- **The sport.** `lib/sports/basketball.ts` (`BASKETBALL`, `BASKETBALL_BOYS_2026`), ids read live from the
  boys hub (`maxpreps.com/ca/basketball/`), Gunn's and Los Altos' season lists and both leagues. `current.ts`
  gained `IS_BASKETBALL`, and every `IS_FIELD_HOCKEY ? field hockey's : soccer's` data switch became
  three-way; `DATA_DIR` is `data/<sport>` for every sport but field hockey.
- **Step 5, partly.** `Sport.scoring` (`allowsTies`, the unit a team scores and the three column heads) is
  read by `components/words/score-words.ts`; `lib/format.ts` prints a record W-L for a sport with no ties
  (from the inlined `SCVAL_SPORT`, so the leaf still loads no sport definition). `LeagueRules.orderBy` gained
  `'win-pct'` (`lib/standings/order.ts` is the one place that knows the order column is PTS or PCT), the
  engine two tiebreak stages (`record-vs-placed`, the uncomputable `coaches-vote`) and `leagueOvertime`
  `'until-decided'`. `Sport.ratings.adjustedScoring` is nullable and null for basketball.
- **The league and registry.** `lib/league-config/basketball/scval.ts` (the SCVAL Basketball By-Laws and the
  two 2026-27 boys schedules) and `lib/registry/basketball/scval.ts` (the same 15 schools as soccer, in
  basketball's own divisions; MaxPreps' two tables hold all 15).
- **The official schedule and the JV schedule.** `scripts/build-scval-basketball-fixtures.ts` writes the
  bundle from the schedules' text; each fixture carries its JV game (`jv`), which `lib/jv/jv-official.ts`
  turns into a listed JV game wherever MaxPreps has none (README, "JV games from the league's own schedule").
- **The CCS block.** `lib/league-config/basketball/sections.ts`, from the CCS 2026-27 Playoff Calendar and the
  CCS basketball calendar feed. `CcsKeyDates.firstRound` and `ccsFirstDay()` carry a bracket that opens
  before the quarterfinals.
- **Data.** Under `data/basketball/`, from the usual fetchers; the roster parser accepts the Weight column
  basketball roster tables carry (and never stores it), and a deleted contest with no date is dropped before
  a schedule feed is held to its schema.
- **Deploy.** `update-data-basketball.yml`, ci's `basketball` job, the deploy gate and
  `scripts/vercel-ignore-build.sh` know the third sport. The hosting project and its domain are the owner's
  to create (README, "Deploy notes").

**BVAL (2026-11-13).** The owner asked for BVAL in both winter builds, so the ratings count SCVAL's games
against BVAL schools. Each sport has `lib/league-config/<sport>/bval.ts` and `lib/registry/<sport>/bval.ts`,
`LEAGUES` lists both leagues, the CCS block allocates BVAL's six automatic berths, and the BVAL schedules are
bundled by `scripts/build-bval-winter-fixtures.ts` (README, "BVAL in the winter builds"). The registries hold 41
teams each. /history/2025-26 shows BVAL's 2025-26 final standings from its sheets (owner, 2026-11-16; README,
"BVAL in the winter builds"), in the 2025-26 divisions, which `seasonAlignment` lets differ from 2026-27's.

**WCAL and WBAL, soccer only (2026-11-14).** The owner asked for the West Catholic and West Bay leagues on the
soccer site. `lib/league-config/soccer/{wcal,wbal}.ts` and `lib/registry/soccer/{wcal,wbal}.ts` add 19 teams (60 in
the soccer registry; basketball stays at 41, so `lib/teams.ts` counts each sport's own), the CCS block allocates the
WCAL's two berths and the WBAL's four, and league games are read by membership, since neither league's schedule is
a document that holds still (README, "WCAL and WBAL in the soccer build"). /history/2025-26 has both leagues' 2025-26
final standings and all-league teams from their own documents, transcribed 2026-11-16 (README, "WCAL and WBAL last
season").

**PAL and SCCAL in both winter builds; WCAL and WBAL in basketball (2026-11-21).** The owner asked for the Peninsula
Athletic League and the Santa Cruz Coast Athletic League on both winter sites, and the WCAL and the WBAL on the
basketball site too. `lib/league-config/{soccer,basketball}/{pal,sccal}.ts`, `lib/league-config/basketball/{wcal,wbal}.ts`
and their registries add 22 soccer teams (82) and 38 basketball teams (79); a basketball seed for a school the soccer
registry holds is that soccer seed on its basketball page (`lib/registry/basketball/from-soccer.ts`). Every new league
is read by membership. /history/2025-26 marks the new leagues unavailable until their documents are transcribed
(README, "PAL and SCCAL in the winter builds").

The PAL's 2025-26 standings (both sports) and the WCAL's and the WBAL's boys basketball standings were transcribed on
2026-11-21 (README, "PAL, WCAL and WBAL last season in the winter builds").

**PCAL and PSAL in both winter builds: every CCS league (2026-11-25).** The owner asked for the Pacific Coast Athletic
League and the Private School Athletic League on both winter sites, so each covers every league of the CCS.
`lib/league-config/{soccer,basketball}/{pcal,psal}.ts` and their registries add 41 soccer teams (123) and 54 basketball
teams (133), each league read by membership from its own 2026-27 schedules. Neither league publishes standings, so
/history/2025-26 marks both unavailable; a team page on any site now links the same school on every site whose
registry holds it, field hockey's PCAL schools included (README, "PCAL and PSAL in the winter builds").

Not done yet: a refit of the rating constants on a finished basketball season; the new leagues' 2025-26 all-league
teams; the CCS Basketball Bylaws'
allocation and MaxPreps' 2027 tournament page; the smoke and axe passes on the
basketball build. MaxPreps' freshman season is read since 2026-11-25, in this build and the soccer one (README,
"Freshman games").

**Mascot tiles (2026-11-11).** The five schools the winter registries added (Gunn, Mountain View, MacDonald,
Milpitas and Wilcox) have their tiles in `public/mascots/`, fetched with `SCVAL_SPORT=soccer pnpm fetch-mascots
--only <slug>`; `NO_MASCOT_TILE`, which drew their initials while MaxPreps' image host answered 403, is gone.
Gunn's and Milpitas' are MaxPreps'; the other three are `SOURCE_OVERRIDES` (README, "School mascots"),
Wilcox's a file in `scripts/mascot-sources/`, the owner's choice of logo.
`tests/mascots.test.ts` holds every sport's registry to its tiles from the one field hockey test run.

## Girls volleyball: SCVAL and BVAL (2026-11-14)

The owner asked for a volleyball site "like basketball and soccer", SCVAL and BVAL only, girls. It is the fourth
build (`SCVAL_SPORT=volleyball`), switched module by module like the other two, and the first of them made
with its season already played, so the postseason code ran on real results the day it was built.

- **The sport.** `lib/sports/volleyball.ts` (`VOLLEYBALL`, `VOLLEYBALL_GIRLS_2026`), ids read from the hub
  (`maxpreps.com/ca/volleyball/`, the girls'), team contexts and the six leagues. `current.ts` gained
  `IS_VOLLEYBALL`; every data switch is four-way. `Sport.scoring.overtime` gained `'none'` and
  `Sport.stats.model` `'volleyball'`.
- **The score is sets.** `gf` / `ga` hold sets won and lost, labelled SW / SL / SD. `lib/format.ts` reads a
  volleyball build as a sport with no ties and no sudden-victory overtime.
- **The leagues and registry.** `lib/league-config/volleyball/{scval,bval,sections}.ts` and
  `lib/registry/volleyball/{scval,bval}.ts` (the same 41 schools as basketball, in volleyball's divisions).
  The engine gained four tiebreak stages: `h2h-sets-won` and `h2h-set-ratio` (computed) and `set-points` and
  `second-meeting` (uncomputable terminals).
- **The official schedules.** `scripts/build-scval-volleyball-fixtures.ts` (the grid's bye cells are read and
  checked) and `scripts/build-bval-winter-fixtures.ts`, which now knows a third sport and passes over the
  play-in line of two BVAL documents.
- **The CCS block.** `CcsConfig.tournament` gained `otherBrackets`, so the tournament page is recognised and
  read as published where the championship has an Open Division and Divisions 3-5 as well; a build with no
  named divisions stores no `divisionsPublished`. `lib/classify.ts` rule 1d keeps CIF State bracket games out
  of the CCS.
- **The brackets, one per division (2026-11-14).** MaxPreps' tournament pages are server HTML that carries a
  whole bracket (every matchup, seed, result, and the ids that join one game to the next), so a build that names
  no CCS division of its own (`CCS.ccsDivisions` empty) reads them whole: `lib/sources/maxpreps-tournament.ts`
  parses a page, step 09 (`lib/pipeline/steps/secondary.ts` `stepBrackets`) stores every CCS division from the
  tournament page the bracket poll already reads, and one page per CIF State division a team of ours plays in
  (the `bracket.url` of its games; resource `tournament-bracket`, corpus path `maxpreps/tournament/<bracket id>`),
  as `playoffs.brackets`, each bracket carried from the previous snapshot when its page was not read. /playoffs
  draws one bracket per division with a team of ours in it (`components/playoffs/tournament-brackets-view.ts`,
  `TournamentBrackets.tsx`): the CIF State divisions first, each as the NorCal regional and the state final, then
  the CCS's Open Division and Divisions 1-3; Divisions 4 and 5 hold no SCVAL or BVAL team and are named in one
  line. A game's "Bracket" link lands on its own card, a CIF State game's included (`bracket-link.ts`). Basketball
  and soccer take the same path once MaxPreps publishes their brackets.
- **Stats.** The parser's column maps, the team tables, the box score and the player boards have a volleyball
  branch each, built on basketball's one-line-per-player model with rates per set played.
- **Data.** Under `data/volleyball/`, from the usual fetchers, and a corpus of the run
  (`tests/fixtures/corpus/volleyball-2026-11-14/`, captured with `--no-cifss`) that rebuilds the snapshot
  offline. `data/players.json` was rebuilt with the fourth sport.
- **JV rosters from the schools' sites** (added 2026-11-14). `data/volleyball/jv-rosters-school-sites.json`
  holds the 2026-27 JV lists 13 of the 41 schools publish themselves, found in a sweep of every school's
  site; README, "Girls volleyball", names each source and what was left out.
- **Deploy.** `update-data-volleyball.yml` (Aug–Nov, twenty minutes after field hockey's refresh; weekly, Saturday mornings, since 2026-11-21), ci's
  `volleyball` job, the deploy gate's matrix and `scripts/vercel-ignore-build.sh` know the fourth sport. The
  hosting project and its domain are the owner's to create.

**Recruiting (2026-11-13).** The owner asked for "a search for recruiting pages, commits, and clubs for
volleyball like we did for field hockey". The volleyball build now has /clubs, /clubs/[slug], /commits and
/recruiting (`HAS_RECRUITING`), from `data/volleyball/{clubs,commits,rosters-enrichment,jv-profiles,instagram}.json`
(README, "Girls volleyball: recruiting"; DATA-SOURCES §1.11). What made the pages every recruiting build's:

- A profile or a commitment in the build's own sport names no sport, whichever build it is
  (`lib/players/rosters-schema.ts` and `components/commits/commit-view.ts` compare with `SPORT_ID`, where they
  compared with `'field-hockey'`).
- `lib/players/clubs.ts` validates the file in every recruiting build; `SEARCHED_REGIONS` is per sport (volleyball:
  the Peninsula and the South Bay).
- /about#recruiting takes its sport words, and the few sentences about where the research looked, from the sport
  (`components/about/sections/RecruitingSection.tsx`).
- The copy rules: the tied-game pattern of a sport with no ties leaves a player's tie to a club
  (`CLUB_TIE_WORDS`), and a club's own description is data, so a club that also runs a boys' program is not the
  site naming another build's program.
- /club-calendar stays field hockey's (`HAS_CLUB_CALENDAR`): `data/field-hockey/club-events.json` is field hockey research.

**Recruiting, winter builds (2026-11-21).** The owner asked to "run the recruiting pages search for both soccer and
basketball". The soccer and basketball builds now have /clubs, /clubs/[slug], /commits and /recruiting
(`HAS_RECRUITING` is every high school build's; `val-soccer`, which lists no players, stays without them), from
`data/{soccer,basketball}/{clubs,commits,rosters-enrichment,jv-profiles}.json` (README, "Girls soccer and boys
basketball: recruiting"; DATA-SOURCES §1.15). The owner also asked that last season's soccer commitments of players
now on a roster be shown with no label of their own, that the two-year colleges' levels be added, and, when the
research found MaxPreps' winter rosters a season behind on grades, to "accept the players with outdated grades for
now". What made that possible:

- `SPORT_FEATURES` turns `recruiting` on for soccer and basketball. A file no round has filled (no `notes`, no
  records) is a placeholder (`isResearched` in `lib/schema-primitives.ts`): its pages name no searched area and
  print no research date, and a clubs file may hold no club (`lib/players/clubs-schema.ts`). `SEARCHED_REGIONS` is a
  `bySport` choice (soccer: San Francisco, the Peninsula and the South Bay; basketball: none, since no directory
  lists the boys' travel programs), and so are the /about recruiting section's sport words.
- The copy rules read a player's commitment in another sport (a basketball player's football commitment) as data
  about the player, not the site naming another build's program (`scripts/assert-copy.ts`); basketball, with no
  tied games, takes volleyball's exception for a player's tie to a club (`scripts/copy-rules.ts`).
- Last season's commitments: the four players of `data/soccer/prior-commits.json` on a 2026-27 roster were copied by
  hand into `data/soccer/commits.json` as ordinary commitments; the prior-commits files stay as the 2026-11-18
  record, and `tests/prior-commits.test.ts` no longer forbids pages naming them.
- `COLLEGE_DIVISIONS` gained `njcaa` and `cccaa` in every sport's `commits.json` (`lib/players/commits-schema.ts`),
  worded "NJCAA" and "CCCAA" on /commits ("a CCCAA program").
- Since 2026-11-26 what is known about a player beyond one roster row is filed under her registry id, once for every
  build: her recruiting pages in `data/player-accounts.json`, her college commitment in `data/commitments.json`, and
  her ties to a sport's clubs in that sport's `clubs.json` `memberships`. Each build finds the people on its rows
  through `data/<sport>/player-index.json`, which `pnpm build-players` writes, so a two-sport player's pages and
  commitment show on both builds' rosters from one record (README, "The player registry").
- Stale grades: a grade conflict in the roster overlay may be marked `rosterBehind` (`other` exactly `kept` + 1),
  and may cite a recruiting profile or a scouting site (`CONFLICT_KINDS`, `lib/players/rosters-schema.ts`). Profiles,
  club ties and commitments check a stated class year through one function, `classYearAgrees`
  (`lib/players/rosters.ts`, called by `lib/players/roster-join.ts`), which accepts the corrected class on a marked
  row. The roster keeps MaxPreps' grade and says MaxPreps shows last season's; /commits groups and labels the player
  by `effectiveGrade` / `effectiveClassOf`; the recruiting and club pages keep MaxPreps' grade. 109 basketball rows
  and 2 soccer rows carry the marker.

**WCAL and WBAL (2026-11-14).** The owner asked for the two leagues on the volleyball site too.
`lib/league-config/volleyball/{wcal,wbal}.ts` and `lib/registry/volleyball/{wcal,wbal}.ts` add the same 19 schools
as soccer, in volleyball's own WBAL divisions (60 teams); league matches are read by membership, the corpus was
recaptured with all four leagues, and a second recruiting round (2026-11-14) covered the new schools (README, "WCAL
and WBAL in the volleyball build", "Girls volleyball: recruiting").

Not done yet: a refit of the rating constants on finished seasons; the CCS Volleyball Bylaws' allocation;
BVAL's 2025-26 standings; "match" for "game" in the site's own copy; the
smoke and axe passes on the volleyball build; a volleyball club calendar; the volleyball programs' own Instagram
accounts.

## Middle school girls soccer: the VAL (2026-11-21)

The owner asked for a middle school soccer site covering the Valley Athletic League's season (valleyal.org), girls,
both levels, with MaxPreps no longer forced to be the primary source. It is the fifth build (`SCVAL_SPORT=val-soccer`),
and the first whose games are not MaxPreps': none of the VAL's eleven middle schools is on MaxPreps.

- **The primary source is the build's choice.** `SportSeason` is a union on `primary` (`lib/sports/shape.ts`): a
  `MaxprepsSportSeason` carries MaxPreps' season ids, a `TeamsidelineSportSeason` the league site's origin and its
  two levels' page ids. `lib/season.ts` derives the MaxPreps constants only for a MaxPreps season (`''` otherwise,
  read by no step that runs). The pipeline's first stage is `primary` (renamed from `maxpreps`): `lib/pipeline/primary.ts`
  runs MaxPreps' steps 02-06 unchanged, or `lib/pipeline/steps/teamsideline.ts`, which keeps one `teamsideline`
  claim a game (`lib/claims/types.ts`) and starts the view from them. Every later stage reads what `primary` published,
  whatever the source. The high school builds' pipeline output is unchanged (the pipeline, claims and golden suites).
- **The sport is soccer itself** (`lib/sports/val-soccer.ts` reuses `SOCCER`); what differs is league-shaped:
  `lib/league-config/val-soccer/{val,sections}.ts` and `lib/registry/val-soccer/val.ts`.
- **Config that was high-school-only became optional.** A section may be `none` (no CIF section, `maxprepsSectionId`
  null); `CCS` and the snapshot's `playoffs` are null in a build with no CCS block (`requireCcs()` for code that runs only
  for a CCS league); a division may meet once (`meetings: 1`); a league tournament may have a fixed bracket
  (`semifinals: 'fixed'`), no play-in (`lastSpot: null`), no fixed final site (`finalSite: null`) and its own shootout note.
- **Levels and players.** `components/words/level-words.ts` names the two levels ('JV'/'varsity' in every high school
  build, '6th/7th'/'7th/8th' here); `SPORT_LISTS_PLAYERS` keeps every player surface (rosters, stats, player boards, the
  cross-sport registry) out of the build.
- **Pages.** /about is `components/about/LeagueSiteAbout.tsx`; /playoffs shows the league's own tournament; recruiting,
  clubs and the club calendar are off; /history/2025-26 marks the league unavailable (it publishes no past standings).
- **Deploy.** `update-data-val-soccer.yml` (Nov 21 - Feb 11), ci's `val-soccer` job, the deploy gate's matrix
  (`SITE_URL_VAL_SOCCER`), `scripts/vercel-ignore-build.sh` and the Worker name `scvalfh-val-soccer`, served at
  https://mssoccer.ncfh.net since 2026-11-21.

Not done yet: comparing the league's own table with the computed one; the boys' season (Season #4); a smoke and axe pass
on this build.

## Guards that must keep passing

- `tests/golden.test.ts` and `tests/golden-pipeline.test.ts`. They are byte equality on the standings
  copy and the pipeline output: fix the engine, never the golden.
- `tests/ui/client-boundary.test.ts` and `tests/build-only-boundary.test.ts`. A sport module a client
  can reach must stay a leaf.
- `tests/legacy-imports.test.ts`. No deleted `lib/season` name may come back.
- `tests/sport-choices.test.ts`. Every choice among sports names every sport ("Choosing among sports" above).
- `tests/maxpreps-client.test.ts` and the si.com corpus fixtures, which hold exact URLs.
- `pnpm assert:prerender`, `assert:budgets` and `assert:copy` on the built site.
- First-load JS. Turbopack keeps a whole `as const` sport object once any of its fields is read,
  so client modules must not reach `lib/sports/` through a hot leaf. `lib/format` takes `TIME_ZONE`
  from `lib/time-zone.ts`, not from `lib/season.ts`, for this reason. Reaching the sport definition
  through `lib/format` put `/teams` 190 B over its budget.
