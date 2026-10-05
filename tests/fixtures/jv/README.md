# JV captures (PCAL, 2026-10-05)

What `pnpm fetch-jv --capture` saved for the seven PCAL schools on 2026-10-05, the input of
`tests/jv.test.ts` (`pnpm fetch-jv --fixtures tests/fixtures/jv --leagues pcal`):

- `jv-sched-<slug>.json`: MaxPreps' `schedule-calculated/v1` answer for the school with the JV
  season id (`JV_SPORT_SEASON_ID`), byte for byte.
- `jv-sblive-<slug>.html`: the school's si.com JV games page, trimmed to the one element the parser
  reads, the `<div data-react-class="teams/Games" data-react-props="…">` tag, copied verbatim. The
  rest of the page (navigation, scripts, ads) is dropped to keep the fixture small.

PCAL is the league where si.com matters most for JV: MaxPreps had a score for one of its JV games
that day, si.com for many more.
