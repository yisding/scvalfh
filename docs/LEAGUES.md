# Leagues and teams

| League | Region | Section | Divisions (teams) | Teams |
|---|---|---|---|---|
| SCVAL — Santa Clara Valley Athletic League | NorCal | CCS | De Anza (7), El Camino (8) | 15 |
| BVAL — Blossom Valley Athletic League | NorCal | CCS | Mt. Hamilton (6), Santa Teresa (6) | 12 |
| PCAL — Pacific Coast Athletic League | NorCal | CCS | one division (7) | 7 |
| MCAL — Marin County Athletic League | NorCal | NCS | one division (9) | 9 |
| EAL — Eastern Athletic League | NorCal | NS | one division (6) | 6 |
| Sunset — Sunset field hockey league | SoCal | SS | one division (8) | 8 |
| City — City Conference | SoCal | SDS | City Western (6), City Eastern (6) | 12 |
| North — North County Conference | SoCal | SDS | Avocado (6), Palomar (7), Valley (6) | 19 |
| Metro — Metro Conference | SoCal | SDS | Metro Mesa (5), Metro South Bay (4) | 9 |
| LA — LA independents | SoCal | SS | one table (5): Bonita, Chaminade, Glendora, Harvard-Westlake, Thousand Oaks | 5 |

102 teams in all, 49 in Northern California and 53 in Southern California, in nine leagues and one
group of independents. The North County Conference's short name is "North" (owner decision,
2026-10-06: "North County" made its chip too wide); where the short name would stand alone as a
control's target or a sentence's subject it reads "North County" (`standaloneName`), so it never reads
as a direction ("Jump to North County ↓"). The LA independents are not a league: five
Los Angeles-area Southern Section schools in no field hockey league, grouped by this site (short name "LA",
`independents: true` in `lib/config/leagues.ts`; the id and URL stay `independents`). Glendora, Harvard-Westlake and Thousand Oaks are each the
only field hockey team in their all-sports league on MaxPreps (the Palomares League, League B and the
Marmonte League); Bonita and Chaminade sit in MaxPreps' and si.com's Sunset tables, but MaxPreps marks
none of their games against the five Orange County Sunset teams as a league game and both play every
other independent home and away, so they are independents here (owner decision, 2026-10-06). The group
has a table of its members' games against each other (`classification: 'membership'`, ordered by this
site's 3-1-0 points; no ladder or postseason), and every count of leagues names it apart ("nine
leagues and five independents", never "ten leagues"). PCAL, MCAL, EAL and the
Sunset are single-division leagues, so the site shows no division picker and no division label for
them. A San Diego conference is a league here and the Section's leagues are its divisions (the
Section's 2026-27 League Alignment; the division names are ours). Every league fact (ids, MaxPreps
ids, rules, tiebreak chains with their citations, postseason ladders, official sources,
data-quality lists) lives in `lib/config/leagues.ts`, along with the regions (`REGIONS`, `regionOf`); the
teams live in `lib/registry/{scval,bval,pcal,mcal,eal,sunset,city,north-county,metro,independents}.ts`, assembled
by `lib/registry/teams.ts`. The CCS holds a 16-team championship fed by SCVAL (7 berths), BVAL (4), PCAL (2)
and three at-large berths; the NCS holds no field hockey championship, so MCAL's own six-team
tournament is its postseason; the Northern Section's EAL postseason is the Super Regional (Oct
30-31, the top six qualify, format and site not published), which the site describes and never
draws a bracket for. The Southern Section holds no field hockey playoffs, so a Sunset team's season
ends with its last game (Oct 31 at the latest); the San Diego Section playoffs (Nov 2-14, Open 8,
Division I 12, Division II 12) are placed by the Section from its power rankings, a designated league
champion is guaranteed at least a play-in, and the site states that rule and never projects a seed.
The independents have no postseason either, for the same Southern Section reason.
The 2025-26 history covers SCVAL (official PDFs) and BVAL (official
Google Sheet and all-league documents); PCAL, MCAL, EAL, the Sunset, City, North County and Metro are
marked unavailable on the page, with the reason (we found no official 2025-26 final standings: PCAL's
site stops at 2024-25, MCAL posts none of its own, the EAL posts none, no Sunset document exists that we
could find, and the San Diego Section's power rankings are not league standings), and nothing
third-party is shown in their place; the independents' card says they played as independents in
2025-26 too (MaxPreps' 2025-26 Palomares, League B and Marmonte tables each list one field hockey
team), so there was no table to publish. MCAL's card links the league's
official 2025 all-league team without reproducing it. The page also shows the 2025 section playoff brackets with
every result: the CCS's two divisions (from the CCS's own bracket pages and its field hockey history)
after PCAL, and the San Diego Section's Open, Division I and Division II (from the Section's bracket
sheet and Record Book) after Metro, so the SoCal half has last season's results even though no SoCal
league published standings. Rosters and player stats cover all 102 teams.

The EAL has no schedule or standings document of its own: its rules come from the CIF Northern
Section's Field Hockey Guidelines 2026-28, its league games are the games MaxPreps marks as league
games (as SCVAL's are), and Red Bluff, still a 0-0-0 row in MaxPreps' table, is not fielding a
varsity team in 2026 and is left out. Davis and Bella Vista are Sac-Joaquin Section schools that
play field hockey in the EAL, so the site prints that note wherever it lists the EAL's schools under a
league heading.

None of the four Southern California leagues publishes a schedule, standings or a points rule that we
could find, so the site orders their tables by its own 3-1-0 points and says so on every page. The
Sunset is a field-hockey-only grouping of eight Southern Section schools in Orange and
Riverside counties (not the all-sports Sunset League); its league games are every game between two of the
eight outside a tournament, whether or not MaxPreps marks them, and there is no round robin, so the site
shows games played without "of N". In the San
Diego Section every pair of division-mates is scheduled twice except, on 2026-10-05 (Pacific), Metro
Mesa's Bonita Vista and Helix, who meet once, and a game counts for a division when both sides are its
members, whatever MaxPreps' league flag says (the flag misses many of them). Under the Section's
officials' procedures a level varsity game outside a tournament goes to overtime and then a shootout;
MaxPreps records many of these as a level score marked W and L, and the site counts the flagged team's
win but prints no decider tag and never says a shootout decided it (no box score carries a tally, and
si.com and the Section's power rankings record some of these games with the shootout goal added). See
docs/STANDINGS.md "How standings are computed".

People pick what they want to see in three ways: a NorCal/SoCal switcher picks the region, the home
page remembers a league (chips and a "Show <league> here" button, applied before first paint, which
also sets its region), and a team finder searches all 102 schools by name, city or mascot and pins one.
