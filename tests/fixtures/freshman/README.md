# Freshman captures (girls soccer, WCAL, 2026-11-25)

What `SCVAL_SPORT=soccer pnpm fetch-jv --level freshman --capture <dir>` saved for the six WCAL schools on
2026-11-25, the input of `tests/freshman.test.ts` (`pnpm fetch-jv --level freshman --fixtures
tests/fixtures/freshman --leagues wcal`):

- `freshman-sched-<slug>.json`: MaxPreps' `schedule-calculated/v1` answer for the school with the
  freshman season id (`FRESHMAN_SPORT_SEASON_ID`), byte for byte.

The WCAL is the league with the most freshman soccer games that day, among them St. Ignatius' 10-0
final of Nov 19 against MaxPreps' "Non Freshman Opponent" placeholder (lib/cross-level.ts).
