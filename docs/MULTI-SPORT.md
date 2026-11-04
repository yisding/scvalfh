# Multi-sport: what is shared, what is field hockey's, and the road to a second sport

The owner wants the site to cover more California high school sports, with basketball and soccer first.
This note records how the code divides between sports (an audit of every layer, 2026-11-04) and the
order of work. The first step, the sport seam in `lib/sports/`, has landed. The rest is a plan.

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

The cost: `/clubs`, `/commits`, `/recruiting`, `/jv` and `/history/2025-26` exist only for field
hockey today, so their presence must become per sport. A page that shows one school across several
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
  - The standings accumulation and stage interpreter in `lib/standings.ts`. A league's points rule is
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
- **Goal vocabulary.**
  - The `h2h-goal-diff`, `h2h-goals-against` and `division-goals-against` tiebreak stages.
  - The GF/GA/GD columns, legend and "no goal differential" in `components/ui/StandingsTable.tsx`.
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
6. **The second sport.** Add soccer first: its rules are closest to field hockey's (ties, 3-1-0, goal
   difference, goalkeepers). Then basketball. Each needs its own `SportSeason` read by
   `scripts/discover-season.ts`, league configs with citations, a registry and copy rules.

## Guards that must keep passing

- `tests/golden.test.ts` and `tests/golden-pipeline.test.ts`. They are byte equality on the standings
  copy and the pipeline output: fix the engine, never the golden.
- `tests/ui/client-boundary.test.ts` and `tests/build-only-boundary.test.ts`. A sport module a client
  can reach must stay a leaf.
- `tests/legacy-imports.test.ts`. No deleted `lib/season` name may come back.
- `tests/maxpreps-client.test.ts` and the si.com corpus fixtures, which hold exact URLs.
- `pnpm assert:prerender`, `assert:budgets` and `assert:copy` on the built site.
