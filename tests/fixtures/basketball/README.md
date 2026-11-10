# Basketball player-stat captures

MaxPreps' three stat responses for one boys basketball team, for `tests/basketball-stats.test.ts`
(`SCVAL_SPORT=basketball`). No SCVAL team had entered 2026-27 stats when the basketball build was made
(every team answered "No data was found"; the first contest is Nov 23), so these are Palo Alto's
**2025-26** responses, read on 2026-11-10 with the repo's own `MaxPrepsClient`, then:

- **restamped**: `sportSeasonId` is this season's (`a5dadf08-…`), so the parsers and
  `scripts/fetch-player-stats.ts --fixtures` read them as they will read this season's;
- **anonymised**: every player's name and career id is invented (`A. Alder` / `fixture01`, …); jersey
  numbers, class captions and every number are as MaxPreps served them;
- **trimmed**: only the fields the parsers read are kept, and the per-game table holds its first four games.

| File | Call | What it is |
|---|---|---|
| `stats-palo-alto.json` | `team-season-player-stats/rollup/v1` | the season sheet: groups Game Stats, Shooting (two subgroups), Totals, Misc Totals, Per 32; 16 players |
| `game-stats-palo-alto.json` | `team-season-game-stats/rollup/v1` | the per-game team table, four games |
| `box-palo-alto-00000000-0000-4000-8000-00000000b0c5.json` | `team-contest-player-stats/v1` | one game's box score (a 81-42 win in which the entries add up to 78 points) |
| `stats-gunn.json` | `team-season-player-stats/rollup/v1` | the HTTP 400 "No data was found" answer of a team with no stats |

The box score's contest id is a placeholder (`00000000-0000-4000-8000-00000000b0c5`), also in the first
row of the per-game table: the test swaps it for a Palo Alto game of the current
`data/basketball/snapshot.json`, which it stages as a final, so the fixtures do not depend on which
games a data refresh lists.
