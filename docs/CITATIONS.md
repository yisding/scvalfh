# Citations

Repo paths are quoted all over this repository: in README.md, in docs/, in code comments, in workflows, in tests. `tests/arch/citations.test.ts` fails when a quoted path names nothing, so a move or a rename must rewrite every citation in the same commit.

## Frozen-path table

Some committed files quote repo paths and cannot be edited: the data files in data/, the fixtures in tests/fixtures/ and the golden files in tests/golden/ record where their content came from, and rewriting them would change content keys and golden bytes. This table maps each such quoted path to the module that serves it today; the gate reads it, so a module that moves adds its row in the same commit.

| Quoted path | Current home | Item |
|---|---|---|

## Legend

(Filled in by the last item of the refactor: what each directory holds, and how to read a citation.)
