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

## Legend

(Filled in by the last item of the refactor: what each directory holds, and how to read a citation.)
