# Multi-sport: what is shared, what is field hockey's, and the road to a second sport

The owner wants the site to cover more California high school sports, with basketball and soccer first.
This note records how the code divides between sports (an audit of every layer, 2026-11-04) and the
order of work. The first step, the sport seam in `lib/sports/`, has landed, and so have a soccer
build, SCVAL girls soccer, 2026-27 ("Girls soccer: SCVAL" below), and a basketball build, SCVAL boys
basketball, 2026-27 ("Boys basketball: SCVAL" below). The rest is a plan.

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

The cost: `/clubs`, `/commits` and `/recruiting` exist only for field hockey today, so their presence
must become per sport. (`/jv` and `/history/2025-26` are every build's now.) A page that shows one school across several
sports would need links between origins.

## The seam: `lib/sports/`

| File | What it holds |
|---|---|
| `shape.ts` | Types only. `Sport` holds what all programs of a sport share: words, source identifiers, rating constants, stat lines. `SportSeason` holds one program's season and the MaxPreps ids it is read by. |
| `field-hockey.ts` | `FIELD_HOCKEY` and `FIELD_HOCKEY_GIRLS_2026`. Every value moved here unchanged from the literal it replaced, keeping its citation. |
| `current.ts` | `SPORT` and `SPORT_SEASON`, the build's one switch point, plus the derived words `GENDER_NAME` ('Girls'), `PROGRAM_WORDS` ('girls varsity') and `SPORT_AUDIENCE` ('girls varsity field hockey'). |

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
  short name, abbreviation, mascot, city, colors, address (`data/schools.json`), mascot tile, venue and
  si.com and VNN site ids carry nothing sport-specific. The sport is chosen by the MaxPreps
  `sportSeasonId`.
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
- **Official schedules.** `OFFICIAL_SOURCE_IDS`, `data/official/*`, the BVAL sheet ids and the SCVAL
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
   - Field hockey's files stay at `data/*` until the old paths are retired in one move.
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
  `lib/sports/current.ts` (`SPORT_ID`, `IS_FIELD_HOCKEY`, `DATA_DIR`, `HAS_HISTORY`, `HAS_RECRUITING`).
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
  archive (`history-2025-26.json`, SCVAL alone) is built by `scripts/build-history.ts` from SCVAL's standings
  PDF and a hand transcription of its all-league PDFs (`official/scval-all-league-2025-26.json`), and
  validated like field hockey's; clubs, commits and the bracket files (the 2025 history brackets included: a
  CCS bracket's other schools are not in this registry) are empty placeholders the loaders serve without field
  hockey's validation.
- **Pages.** /history/2025-26 shows SCVAL's two divisions (final standings, varsity and JV, and the
  all-league teams), and its jump pills go to the divisions. /clubs, /clubs/[slug], /commits and /recruiting render a 404 and are
  linked from nowhere; the region toggle is hidden; copy that named field hockey's leagues or counted
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
teams each. /history/2025-26 marks BVAL unavailable until its standings sheets are transcribed.

Not done yet: a refit of the rating constants on a finished basketball season; the CCS Basketball Bylaws'
allocation and MaxPreps' 2027 tournament page; MaxPreps' freshman season; the smoke and axe passes on the
basketball build.

**Mascot tiles (2026-11-11).** The five schools the winter registries added (Gunn, Mountain View, MacDonald,
Milpitas and Wilcox) have their tiles in `public/mascots/`, fetched with `SCVAL_SPORT=soccer pnpm fetch-mascots
--only <slug>`; `NO_MASCOT_TILE`, which drew their initials while MaxPreps' image host answered 403, is gone.
Gunn's and Milpitas' are MaxPreps'; the other three are `SOURCE_OVERRIDES` (README, "School mascots"),
Wilcox's a file in `scripts/mascot-sources/`, the owner's choice of logo.
`tests/mascots.test.ts` holds every sport's registry to its tiles from the one field hockey test run.

## Guards that must keep passing

- `tests/golden.test.ts` and `tests/golden-pipeline.test.ts`. They are byte equality on the standings
  copy and the pipeline output: fix the engine, never the golden.
- `tests/ui/client-boundary.test.ts` and `tests/build-only-boundary.test.ts`. A sport module a client
  can reach must stay a leaf.
- `tests/legacy-imports.test.ts`. No deleted `lib/season` name may come back.
- `tests/maxpreps-client.test.ts` and the si.com corpus fixtures, which hold exact URLs.
- `pnpm assert:prerender`, `assert:budgets` and `assert:copy` on the built site.
- First-load JS. Turbopack keeps a whole `as const` sport object once any of its fields is read,
  so client modules must not reach `lib/sports/` through a hot leaf. `lib/format` takes `TIME_ZONE`
  from `lib/time-zone.ts`, not from `lib/season.ts`, for this reason. Reaching the sport definition
  through `lib/format` put `/teams` 190 B over its budget.
