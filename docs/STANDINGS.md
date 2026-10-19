# How standings are computed

Every table is ordered by 3 points for a win, 1 for a tie and 0 for a loss. The five NorCal leagues
award those points themselves (the EAL uses them to decide its title and publishes no standings, so
this site extends them to the table and says so). The four Southern California leagues publish no
points rule, no standings and no table order that we could find, so the order is this site's own
3-1-0 points and every page says so (`orderScope: 'site'`). SCVAL, BVAL, PCAL, MCAL and the Sunset
can end a league game in a tie; the EAL and the San Diego Section decide a level varsity game by
1 v 1s or a shootout. They differ in the tiebreak chain, in how a tie among three or more
teams is worked through and in the postseason, so every rule is data in `lib/config/leagues.ts` (with the
by-law citation next to it) and one engine in `lib/engine/standings.ts` runs them. Only games that count
toward a division table count: a team's non-league and postseason games never do. The full rules,
with citations, are in `docs/LEAGUE-RULES.md`; the site prints them on `/about#rules-<league>`.

## League by league

Each league's points, tiebreak chain, co-champion label, postseason, official sources and known data
gaps are written once, with the by-law citations, in `docs/LEAGUE-RULES.md`:

- SCVAL (By-Laws 2026-27, Articles VI and VII; verified copy in `docs/BYLAWS-2026-27.md`):
  [docs/LEAGUE-RULES.md "SCVAL — Santa Clara Valley Athletic League (CCS)"](LEAGUE-RULES.md#scval--santa-clara-valley-athletic-league-ccs)
- BVAL (By-Laws rev. 8/13/24):
  [docs/LEAGUE-RULES.md "BVAL — Blossom Valley Athletic League (CCS)"](LEAGUE-RULES.md#bval--blossom-valley-athletic-league-ccs)
- PCAL (Sports Rules, Jan 2022; By-laws rev. May 2025):
  [docs/LEAGUE-RULES.md "PCAL — Pacific Coast Athletic League (CCS)"](LEAGUE-RULES.md#pcal--pacific-coast-athletic-league-ccs)
- MCAL (Handbook rev. 10/19/24; Tie-Breaking Criteria rev. 3/26):
  [docs/LEAGUE-RULES.md "MCAL — Marin County Athletic League (NCS)"](LEAGUE-RULES.md#mcal--marin-county-athletic-league-ncs)
- EAL (CIF Northern Section Field Hockey Guidelines 2026-28):
  [docs/LEAGUE-RULES.md "EAL — Eastern Athletic League (NS)"](LEAGUE-RULES.md#eal--eastern-athletic-league-ns)
- Sunset (no league document; this site's 3-1-0, membership):
  [docs/LEAGUE-RULES.md "Sunset — Sunset field hockey league (CIF Southern Section)"](LEAGUE-RULES.md#sunset--sunset-field-hockey-league-cif-southern-section)
- San Diego Section: City, North County and Metro (Green Book 2026-27; the officials' association's procedures):
  [docs/LEAGUE-RULES.md "The San Diego Section — City, North County and Metro conferences (CIF-SDS)"](LEAGUE-RULES.md#the-san-diego-section--city-north-county-and-metro-conferences-cif-sds)
- LA independents (no league; this site's 3-1-0, membership):
  [docs/LEAGUE-RULES.md "LA independents (CIF Southern Section)"](LEAGUE-RULES.md#la-independents-cif-southern-section)

How the engine walks a tie is [docs/LEAGUE-RULES.md "How the engine reads a tie"](LEAGUE-RULES.md#how-the-engine-reads-a-tie),
and every league side by side is [docs/LEAGUE-RULES.md "At a glance"](LEAGUE-RULES.md#at-a-glance).

## Computed, not copied

Standings are always **computed from individual game rows**, not read off MaxPreps' own
`conferenceStandingPlacement`/points fields — MaxPreps' own arithmetic has shown internal
inconsistencies (see `docs/DATA-SOURCES.md` §7). MaxPreps' reported row is kept on every
`Standing` for cross-check and shown as a flagged mismatch (⚑) when it disagrees with the
computed one; see `/about`. A division whose MaxPreps table is known to differ (Santa Teresa
leaves out Prospect; PCAL's is missing games; MaxPreps orders MCAL and the EAL by winning percentage
and lists Red Bluff in the EAL; its Sunset table lists three of the eight, with Bonita and Chaminade; its San Diego tables do not
follow the Section's alignment) shows
the known cause beside the comparison instead of an alarm.

## Official schedules decide which games count

For BVAL, PCAL and MCAL a MaxPreps game counts toward the league table only when it matches a
fixture on the league's official schedule (same date and home/away, or the same pair moved within
two weeks), and never when MaxPreps marks it a tournament or neutral game or it is postseason play.
SCVAL keeps its own rule: MaxPreps' league flag, corroborated by the official PDF grid. The EAL has
no official schedule, so MaxPreps' league flag alone decides (a tournament or postseason game never
counts). The Sunset and the San Diego divisions have none either, and there division membership
decides, not the flag (see "League by league" above). Official league games with no counted result yet are listed under the table as
"missing", never counted; for the EAL, which has no official games to list, that means a game
MaxPreps marks as a league game, dated before today, with no counted result.

## si.com backfill (owner decision D2)

MaxPreps is the primary source and is published as MaxPreps has it. High School on SI (si.com) may
fill in only these cases, each marked on the page ("score via si.com", with a † on the table row
that includes one) and listed on `/about#backfills` with both values and the rule that applied:

1. MaxPreps has no game at all for an official league fixture that has already passed, and si.com
   has that same game as a final.
2. MaxPreps has the game but no score (score not reported) and the date has passed, and si.com has
   a final for it.
3. MaxPreps' row is clearly wrong, in one of three mechanically detectable ways: its win/loss
   flags contradict its own score; its date is more than a week from the official one while si.com
   has the game final on the official date; or it shows a 0-0 tie in a league with no overtime
   while si.com has a decided final the same day. si.com's score is published and MaxPreps'
   value is recorded. A level si.com score between two EAL teams, or two San Diego Section teams,
   is never used for any of these, because si.com does not say who won the 1 v 1s or the shootout.

If both sources have a score and neither of those holds, MaxPreps stays and the disagreement is
published. si.com is never used for which division a team is in, for records or for standings
order, and a game counts only when both teams are matched by si.com's own team ids, never by name
alone. A MaxPreps game that later appears for a filled fixture takes over, and the old si.com game
page becomes a link to it. `--no-sblive` turns the whole thing off. The exact rules are in
`docs/DATA-SOURCES.md`.
