# TourneyMachine captures (2026 National Hockey Festival, 2026-11-26)

Three reads of TourneyMachine's whole-tournament feed on the festival's first morning, the input of
`tests/tourneymachine.test.ts` (DATA-SOURCES §1.16):

- `tournament-results-2026-11-26T1511Z.json`, `…T1518Z.json`, `…T1535Z.json`:
  `TournamentResults.aspx?IDTournament=h20260601141424398b290c0851f3e4c&nofile=true` at 15:11, 15:18 and
  15:35 UTC (the last is what `pnpm fetch-festival --capture` saved with the first committed
  `data/field-hockey/festival.json`), trimmed to three of the eight divisions. Every record of theirs is
  kept as received: `IDDivisions`, `IDGames`, `DivisionDictionary`, `PoolDictionary`, `TeamDictionary`
  and `GameDictionary` keep only Adult 7v7 (1), U-14 Girls 11v11 (9) and U-14 Girls 7v7 (14), and each
  field's `IDGames` only their games; every other key, all twelve fields and the complex are untouched.
  The whole feed is ~275 KB; each trimmed file is ~70 KB.
- `last-updated-2026-11-26T1535Z.json`: `TournamentResultsLastUpdated.aspx` read with the 15:35 capture,
  byte for byte: a JSON string with escaped slashes and a narrow no-break space (U+202F) before PM.

The three divisions cover what the parser has to get right: one pool with no placement games (Adult, a
double round robin of three teams), one pool feeding three placement games where 4th place plays twice
and B3 starts before B2 (U14 7v7), and four pools feeding ten crossovers in two bracket columns (U14
11v11). 15:11 and 15:18 differ only by every team's `Color`, which TourneyMachine re-randomizes on each
request; no result in these divisions changed between them. By 15:35 ten of their 69 games were final.
