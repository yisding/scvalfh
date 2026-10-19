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

## SCVAL

Per the **SCVAL Field Hockey By-Laws 2026-27, Article VI** (verified copy in
`docs/BYLAWS-2026-27.md`; implementation in `lib/engine/standings.ts`):

- **§1** — double round robin; only games between two members of the *same* division count
  toward the division record.
- **§2** — **3 points for a win, 1 point for a tie.** Standings order by total points. A tie at
  the top of a division means co-champions.
- **§3-§6** — if teams are tied on points, work through the tiebreakers **in order, restarting
  from §3 once any team is broken out**: (§3) better head-to-head record among the tied teams;
  (§4) more wins in division play; (§5) fewest goals allowed among the tied teams' head-to-head
  games; (§6) goal differential among those same head-to-head games.
- **§7** — if still tied, the by-laws call for a coin flip. This site cannot compute that, so
  those teams **share a place** with a footnote citing §7, rather than guessing an order.

**Article VII** governs CCS qualification: places 1-3 in each division are automatic qualifiers;
4th place plays a play-in game (Oct 30) for the SCVAL's 7th auto-qualifier slot; the play-in
loser and both divisions' 5th-place teams go to CCS for at-large consideration; 6th and below are
out. The `/playoffs` page labels every row with its by-law citation.

## BVAL

Per the **BVAL Field Hockey By-Laws (rev. 8/13/24)**: a home-and-home double round robin inside
each division (Mt. Hamilton and Santa Teresa, 10 league games a team), 3 points for a win and 1 for
a tie (§6a), standings in the order of points, and a tie at the top is co-champions of the
division. Ties on points: (§6b) head-to-head, and with three or more teams level a 3-1-0
mini-league among them; (§6c) more division wins; (§6d) head-to-head goal differential; (§6e)
fewest goals allowed in division play; (§6f) a coin flip, which this site cannot compute, so those
teams share a place. A multi-team tie is resolved one place at a time: the first place is decided,
then the chain restarts among the rest. The CCS ladder (§7a): Mt. Hamilton 1st-3rd are BVAL #1-#3;
Mt. Hamilton 4th plays at the Santa Teresa champion on Sat Oct 31 for BVAL's 4th berth; BVAL holds
4 of the 16 CCS berths. Which games count comes from BVAL's official schedule, not from MaxPreps'
league flag.

## PCAL

Per the **PCAL Sports Rules — Field Hockey (Jan 2022)** and the **PCAL By-laws (rev. May 2025)**:
one division, a double round robin in 2026, 3 points for a win and 1 for a tie (Rules §1.7),
standings in the order of points, two teams level at the top are co-champions and three are
tri-champions (By-laws §22.3). PCAL's by-laws break ties only for the two automatic CCS places
(§23.3): a tie whose points start at 1st or 2nd is worked through head-to-head (three level: the
three-way head-to-head, then a two-way among those still level), then, for 1st, the record against
each lower-placed team in standings order, and for 2nd the record against each higher-placed team
from the champion down and only then against each lower-placed team; what is left would be settled
by a coin flip or blind draw, which this site cannot compute. A tie for 3rd or lower has no rule and
is shown level. The top two are automatic CCS qualifiers (Rules §1.8.1; 3rd and lower may apply for
at-large under By-laws §23.4); PCAL holds 2 of the 16 CCS berths.

## MCAL

Per the **MCAL Field Hockey Handbook (rev. 10/19/24)** and the **MCAL Tie-Breaking Criteria
(rev. 3/26)**: one division, a double round robin of 16 league games a team (§8a), 3 points for a
win and 1 for a tie, "the MCAL placement will be the order of team points" (§7a), and equal points
at the top are co-MCAL champions. Ties on points: (1) head-to-head winning percentage; (2) record
against the teams above the tie; (3) the spring draw numbers, lowest first. The last tournament
place (6th) is decided on the field instead: a play-in on Fri Oct 23 unless one team swept the
head-to-head 2-0, so the site leaves it shared until then. MCAL has no regular-season overtime. The
top six make the MCAL tournament (seeds 1-2 get a bye to the Oct 28 semifinals, quarterfinals Mon
Oct 26, final Fri Oct 30 at Tamalpais). The North Coast Section holds no field hockey
championship, so this is not a section playoff and no MCAL page describes CCS berths. With an
incomplete schedule MCAL's General Rules rank by winning percentage instead of points; the
standings page notes that.

## EAL

Per the **CIF Northern Section Field Hockey Guidelines 2026-28**: one division of six teams (Bella
Vista, Chico, Corning, Davis, Lassen, Pleasant Valley; §I), a double round robin of ten league games
each (§III.A.1), Aug 24 - Oct 28. 3 points for a win, 1 for a tie and 0 for a loss, "to determine
the League Championship" (§VII.C.2); the Guidelines give no rule for ordering the league table (the
§III.E.1 Super Regional seeding criteria are not applied here), so this site orders the whole table by
the same points and says that it is our computation, not a league ruling. A tie for first
means co-champions ("In the case of a tie, duplicate awards will be given", §VII.C), labelled "EAL
co-champions" only after the regular phase and with no EAL result missing; any other tie is shown
level, because the Guidelines break none. A varsity game that is level gets a 10-minute
sudden-victory period and then 1 v 1s until there is a winner (§VII.E.4): MaxPreps records a 1 v 1
win as a level score with a win flag for one team and a loss flag for the other (Chico 1, Davis 1 on
2026-09-28), and the site counts the flags and marks the game "SO". It does not show the 1 v 1
tally, and it shows MaxPreps' three-overtime record of the 2026-09-02 Pleasant Valley at Chico game as
MaxPreps has it, with a note that the EAL plays one overtime period. The postseason is the Super
Regional, Oct 30-31 (top six EAL/SRL schools, format and site not published, no NorCal or State path;
§III.E.1, §IV-§VI). The Guidelines' seeding text is quoted on `/about` and never applied. See
`docs/LEAGUE-RULES.md` for the clauses and `docs/DESIGN.md` §22 for what the site does with them.

## Sunset

The Sunset (the site calls it the Sunset field hockey league; MaxPreps and si.com call it "Sunset") is
a field-hockey-only grouping of eight Southern Section schools
(Chaparral, Edison, Fountain Valley, Great Oak, Huntington Beach, Marina, Newport Harbor and Temecula
Valley), not the all-sports Sunset League, which has different members. MaxPreps' 2024-25 and 2025-26
Sunset tables list these eight and two more, Bonita and Chaminade, which the site lists with the
LA independents (owner decision, 2026-10-06, below). No Sunset website, schedule,
standings or rules document exists that we could find. **Which games count:** every game between two of
the eight, Aug 25 to Oct 31 (the Section's last allowable contest), outside tournaments, whether or not
MaxPreps marks it a league game (classification `membership`, as for the San Diego divisions; owner
decision, 2026-10-06). MaxPreps' flag follows whichever scorekeeper entered the game (it marks one of Great
Oak's two games with Temecula Valley, and none of the Orange County schools' games against each other
except Edison's), so MaxPreps' table, si.com's and a flag-based table disagreed on Great Oak's record (3-1,
2-2 and 2-1); every game counted, Great Oak is 4-2. There is no round robin (of the 28 pairs, 7 meet
twice and 21 once outside tournaments), so `gamesPerTeam` is null: GP is shown without "of N",
there is no games-left or maximum-points column, and when teams' counts differ by two or more the
table says points favour teams that have played more. **Points:** no league rule is published, so this
site applies its own 3-1-0. **A level game** stays level: the Southern Section's Blue Book adopts the
NFHS rules and says nothing on overtime. A game between Sunset teams has ended level (Fountain Valley
1-1 Marina, Sep 11; MaxPreps does not mark it as a league game) and a Sunset league game has been
decided in overtime (Great Oak 2-1 Temecula Valley, Oct 2), so each game is recorded as reported. **Tiebreaks:** none is published, so teams level on points share a place; teams
level at the top read "Sunset co-leaders" once league play is over. **Postseason:** none. The Southern
Section holds no field hockey playoffs (Blue Book 2026-27 Bylaws 2011.1 and 3500.2) and CIF holds no
regional or state championship, so a Sunset team's season ends with its last game. MaxPreps' 2026-27
Sunset table lists three of the eight with Bonita and Chaminade, ordered by winning percentage, and
si.com's lists six of the eight with Bonita, Chaminade and two 0-0 rows; both are shown as informational
only, and Great Oak's Aug 27 win over Bonita, which MaxPreps marks as a league game, is not counted
here.

## LA independents

Five Los Angeles-area Southern Section schools in no field hockey league, grouped by this site as "LA
independents" (short name "LA", `independents: true` in `lib/config/leagues.ts`; the id and URL stay
`independents`). Glendora,
Harvard-Westlake and Thousand Oaks are the only field hockey teams in their all-sports leagues (the
Palomares League, League B and the Marmonte League on MaxPreps' 2026-27 team pages; MaxPreps' 2025-26
tables for those three leagues each list one field hockey team too). Bonita and Chaminade sit in
MaxPreps' and si.com's 2026-27 Sunset tables (as in MaxPreps' 2024-25 and 2025-26 tables), but MaxPreps
marks none of their nine 2026 games against the five Orange County Sunset teams as a league game, and
each plays every other independent home and away, so the site lists them here (owner decision,
2026-10-06). **Which games count:** every game between two of the five, whether or not MaxPreps marks it
a league game (it marks only Bonita's two games with Chaminade), outside tournaments and inside Sep 8 to
Oct 31 (`classification: 'membership'`, as the San Diego divisions). Nine of the ten pairs meet home and
away and Chaminade–Thousand Oaks three times, so `gamesPerTeam` is null and GP is shown without "of N".
The one game MaxPreps flags between an independent and a Sunset team, Bonita at Great Oak on Aug 27,
counts for neither table. **Points, ties:** no league exists to publish a rule, so the table is this
site's own 3-1-0 and teams level on points share a place ("LA co-leaders" at the top once the
season is over). Every page that shows the table says it is this site's count of the five's games
against each other (the division's note). **Postseason:** none, for the Sunset's reason (Blue Book
2026-27 Bylaws 2011.1 and 3500.2), so each independent's season ends with its last game, Oct 31 at the
latest. No MaxPreps or si.com table groups the five; the site reads their team schedules, and si.com's
Sunset page and one-school league pages for backfill only. Their games count in the Elo fit and on the
SoCal school boards, the league-record board included: their table's games are their league record.

## San Diego Section: City, North County and Metro

The San Diego Section's 40 teams play in seven leagues, which the site shows as divisions of three
conferences (City: City Western, City Eastern; North County: Avocado, Palomar, Valley; Metro: Metro
Mesa, Metro South Bay), from the Section's 2026-27 League Alignment. No conference or league publishes
a schedule, standings or a points rule that we could find. **Which games count:** classification
`membership`. A game counts for a division when both sides are its members, neither row is a
tournament or postseason contest, and it falls inside league play (from each division's first game
between two members to Oct 30, the Section's last regular-season day), whatever MaxPreps' league flag
says. The flag misses many of them (Patrick Henry 0 of 10, San Pasqual 3, Vista 4, Mt. Carmel 4).
Every pair of division-mates is scheduled to meet twice on MaxPreps: 10, 10, 10, 12, 10, 8 and 6 games
a team. The exception, on 2026-10-05 (Pacific), is Metro Mesa's Bonita Vista and Helix, who meet once
(Oct 23), so unless a second meeting is added each plays a game short of the eight. A game
MaxPreps flags between two divisions of one conference (Mission Bay's five against City Eastern
teams) counts in neither table, with a note. **Points:** no league rule is published, so this site
applies its own 3-1-0. **A level game:** the San Diego Field Hockey Officials Association's 2026
procedures give a league, non-league or playoff varsity game a 10-minute 7 v 7 sudden-victory period,
then 1 v 1 shootouts, and credit the shootout winner one goal; they do not cover invitational
tournaments, and several tournament games between San Diego teams have ended level and stay level here.
MaxPreps often records a game outside a tournament as a level score marked W and L, with no tally. The
site counts the flagged team's win, for any two San Diego teams (the rule is the Section's, not a
conference's), shows MaxPreps' score with no decider tag, and never says a shootout decided the game:
no box score carries a tally, and si.com and the Section's power rankings both record Mt. Carmel–Poway
(Sep 11) as 2-0 where MaxPreps has 0-0 marked W and L (`SectionConfig.shootout.inference`
'unverified'; the EAL's is 'verified' by the 2026-09-28 Chico–Davis box score's "SO Win" column). The
rule is varsity only: a level JV game stays a tie. **Tiebreaks:** the Green Book leaves them to the Section's preseason
minutes, which are not published in a form we could read, so teams level on points share a place; the
league designates its own champion, and teams level at the top read "{conference} co-leaders" once
league play is over. **Postseason:** the San Diego Section playoffs, Nov 2-14, finals Nov 14 at La Jolla
HS (Green Book 2026-27 Bylaw 2000.1): Open 8, Division I 12 and Division II 12, placed by the Section
from its power rankings with no appeal. A designated league champion (not co-champions) is guaranteed
at least a play-in, and every other team's only route is selection. Round dates come from the
officials' association's calendar. Each team's playoff division (I or II) is from the Section's 2026
Divisions sheet; the site draws no bracket and projects no seed. MaxPreps' San Diego tables do not
follow the alignment (it has no Valley table, files Metro Mesa's five teams under "Metro- South Bay",
and its City Eastern, Avocado and "Grossmont" tables each leave out or add teams), so every San Diego table is
labelled informational and the known cause is printed beside the comparison.

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
decides, not the flag (see "Sunset" and "San Diego Section" above). Official league games with no counted result yet are listed under the table as
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
