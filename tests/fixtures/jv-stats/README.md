# JV box score captures (Monta Vista, 2026-11-27)

What MaxPreps answered on 2026-11-27 for Monta Vista's JV field hockey team (team id
`405614ad-a015-4270-b527-18e899c90824`, JV season id `fae4fc22-6de6-47ae-972d-e290b0ec31ef`), the input of
`tests/jv-box-scores.test.ts` (`pnpm fetch-jv --fixtures tests/fixtures/jv-stats --leagues scval --no-sblive`):

- `jv-sched-monta-vista.json`: `schedule-calculated/v1` with the JV season id, byte for byte.
- `jv-game-stats-monta-vista.json`: `team-season-game-stats/rollup/v1` with the JV season id (the per-game JV
  stats table), byte for byte.
- `jv-box-monta-vista-<contest id>.json`: `team-contest-player-stats/v1` for two of its JV finals, byte for byte.
  The table lists more games with stats; offline, a game with no capture is simply not read.
