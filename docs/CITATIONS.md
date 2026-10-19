# Citations

Repo paths are quoted all over this repository: in README.md, in docs/, in code comments, in workflows, in tests. `tests/arch/citations.test.ts` fails when a quoted path names nothing, so a move or a rename must rewrite every citation in the same commit.

## Frozen-path table

Some committed files quote repo paths and cannot be edited: the data files in data/, the fixtures in tests/fixtures/ and the golden files in tests/golden/ record where their content came from, and rewriting them would change content keys and golden bytes. This table maps each such quoted path to the module that serves it today; the gate reads it, so a module that moves adds its row in the same commit.

| Quoted path | Current home | Item |
|---|---|---|
| tests/helpers.ts | tests/support/cli.ts (buildFixtureSnapshot) | 06 |
| lib/teams.ts | lib/registry/teams.ts | 12 |
| lib/jv-teams.ts | lib/registry/jv-teams.ts | 12 |
| lib/clubs-schema.ts | lib/schema/clubs.ts | 13 |
| lib/commits-schema.ts | lib/schema/commits.ts | 13 |
| lib/standings.ts | lib/engine/standings.ts | 14 |
| lib/jv-merge.ts | lib/engine/jv/merge.ts | 14 |
| lib/jv-standings.ts | lib/engine/jv/standings.ts | 14 |
| lib/note-stats.ts | lib/engine/note-stats.ts | 14 |
| lib/clubs.ts | lib/datasets/clubs.ts | 16 |
| lib/rosters.ts | lib/datasets/rosters.ts | 16 |
| lib/sources/sblive.ts | lib/sources/sblive/games.ts (parseStandingsTeamRefs: lib/sources/sblive/harvest.ts; extractReactProps: lib/sources/sblive/props.ts; STATEWIDE_AMBIGUOUS: lib/sources/sblive/identity.ts) | 24 |
| lib/sources/http.ts | lib/sources/http/client.ts (CHROME_USER_AGENT) | 24 |
| lib/sources/scval-pdf.ts | lib/sources/scval/grid.ts (parseSchedulePdfText) | 26 |
| components/standings/standings-view.ts | views/standings/division.ts | 35 |
| components/history/history-view.ts | views/history/history-view.ts | 35 |

## Legend

How to read the citations in comments, tests and docs. What each directory holds is in
docs/ARCHITECTURE.md "The directory map".

### Paths and headings

- A repo path in a comment or a doc (`lib/engine/standings.ts`, `views/teams/`) names a file or a
  directory that exists today; the gate's check (A) fails otherwise. A path quoted inside `data/`,
  `tests/fixtures/` or `tests/golden/` may be the name a module had when that file was written: the
  frozen-path table above says where it lives now (check (D)).
- `docs/<FILE>.md "<Heading>"` (or `README "<Heading>"`) names a heading of that file; check (E) fails
  when the heading is renamed or removed. Written without backticks around the path, or the check
  cannot see it.

### Sections of documents in this repo

| Citation | Means |
|---|---|
| `DESIGN §n` | Section n of `docs/DESIGN.md`. Its "Sections" table gives every section's status: current, superseded by a later section, or historical. |
| `DATA-SOURCES §n` | Section n of `docs/DATA-SOURCES.md`. |
| `LEAGUE-RULES` | `docs/LEAGUE-RULES.md`, the league's own section. |
| `BYLAWS`, `Article VI §n` | The SCVAL by-laws excerpt in `docs/BYLAWS-2026-27.md`. |

New comments cite these, never the documents below.

### Build-time documents not kept in this repo

| Citation | Means | Where its content lives now |
|---|---|---|
| `SPEC §n` | The build-time research spec. | Its §1.x sections survive, condensed, as `docs/DATA-SOURCES.md` §1.x; every other section number does NOT match DATA-SOURCES' numbering, so treat it as historical. |
| `BUILD-BRIEF` | The build brief. Comments cite it for three rules: nothing new ships as a dependency, a build is reproducible (every "as of" comes from the snapshot's `fetchedAt`, never the clock), and no link prefetches speculatively. | The rules themselves, in the code that keeps them (`lib/datasets/snapshot.ts`, `components/layout/NavLink.tsx`, `tests/arch/prefetch-policy.test.ts`, the install-axe action). |
| `DESIGN-socal §n` | The design review of the Southern California amendment. | DESIGN §24 records what was built; the table below maps each cited section. |
| `design-review UI §n` | The UI review of the same amendment. Cited sections: §1 (the pinned card's region copy), §3 (both regions' lists; section names in link text), §5 (the region's precedence and what writes it), §6 (the `/teams` scoping), §7 (the region OG card). | DESIGN §24.3 ("The region toggle") holds the precedence, storage and scoping rules; there is no section-by-section equivalent. |
| `Stage 0`, `Stage A`, `Stage C`, `Stage D` | The build's stages. Stage 0 captured the inputs before any library change (`tests/golden/`, and the research transcriptions in `tests/fixtures/official/source/`). Stage A rewrote the library and the pipeline: the live resource map was frozen at its end, and the names it deleted stay deleted (`tests/arch/deleted-names.test.ts`). Stage C built the view models the pages render. Stage D was the final gate. Stage B is not cited. | Stage D's gate is `pnpm gate:all` (`scripts/ci/run-all.sh`). |

**DESIGN-socal sections and their DESIGN equivalents**, checked against DESIGN §24.1-§24.8:

| DESIGN-socal | What the citing code says it covers | DESIGN equivalent |
|---|---|---|
| §0 | The cross-region games that bridge the one Elo fit | §24.7, "Elo bridge" |
| §1 | The research: North County's Valley division has no MaxPreps league | §24.1, the `maxprepsLeagueId` row |
| §2.1 | The four leagues' configuration | §24.1; the rules are in `docs/LEAGUE-RULES.md` |
| §2.1.1 | Regions: NorCal and SoCal, a property of a section | §24.1, the regions and `cities` rows; §24.3 |
| §2.1.3 | si.com backfill for the San Diego shootout rule | §24.1, the section-based shootout row |
| §2.1.5 | Which leagues are SoCal (the `data-region` stamp) | §24.3, "Pre-paint stamp" |
| §2.1.6 | The San Diego divisions' official note, verbatim | No direct equivalent: the text is `SDS_OFFICIAL_NOTE` in `lib/config/leagues/sds.ts` |
| §2.1.7 | Site-ordered tables (`orderScope 'site'`), GP without "of N", no LEFT or MAX | §24.1, the `gamesPerTeam` and `orderScope` rows; §24.4 |
| §2.1.8 | The new league and division ids | §24.2 |
| §2.1.10 | Reading a snapshot written before the four leagues existed | §24.7, the snapshot bullet (schema version unchanged, region derived from config) |
| §2.2 | The raised page, snapshot and Worker budgets | §24.6 |
| §2.3 | One Elo fit over every team, boards per region | §24.7, "Elo bridge" |
| §2.4 | The region control and region-scoped blocks | §24.3 |
| §3 | What was not built (the school-site sweeps) | §24.8 |

### Research artifacts under tests/fixtures

Four fixtures are TypeScript saved as `.ts.txt`: research drafts kept as the provenance of the code that
replaced them. Nothing compiles, imports or runs them, and like every fixture they are never edited, so
the module paths they quote are the names proposed at the time. Check (D) scans them like any frozen
file. The proposed home of the MCAL reference implementation never existed, and the registry seed
fixture names an si.com module deleted before this refactor; those two are the gate's `KNOWN_DEAD`
list rather than rows of the table above. Each file and what replaced
it: docs/DATASETS.md "Research artifacts under tests/fixtures".
