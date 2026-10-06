# League rules — how each league's table is computed

The five Northern California leagues this site covers agree on the points (3 for a win, 1 for a tie, 0
for a loss) and the ordering key (points; the EAL uses points to decide its title and publishes no
standings, so this site extends them to the table). Four of them can end a league game in a tie; the EAL
decides a level varsity game with 1 v 1s. The four Southern California leagues (the Sunset and the San
Diego Section's City, North County and Metro conferences) publish no points rule, no standings and no
schedule at all: this site orders their tables by its own 3-1-0 points and says so on every page
(`orderScope: 'site'`). They differ in the tiebreak chain, in how a tie among three or more teams is worked through, in how a division champion is
named and in what the postseason looks like. Every rule below is data in `lib/leagues.ts` with the
by-law citation beside it; one engine (`lib/standings.ts`) runs them, and `/about#rules-<league>`
prints them on the site. Where the documents say something this site cannot compute (a coin flip,
a blind draw, a play-in game), the teams **share a place** and the page says which rule decides it.
It never guesses an order.

Sources are the league's own documents as of 2026-10-02 (for the EAL, the CIF Northern Section's Field Hockey Guidelines, as of 2026-10-04; for the Sunset and the San Diego leagues, the Southern and San Diego Sections' documents and MaxPreps' schedules, as of 2026-10-06): see "Official sources" in each section and
`docs/DATA-SOURCES.md` for URLs, hashes and how the schedules are kept current. SCVAL's by-laws
are also quoted in `docs/BYLAWS-2026-27.md`.

## How the engine reads a tie

1. Teams are ordered by points; teams level on points form a *bucket*.
2. A bucket is resolved by walking the league's *chain* of stages in order. A stage that cannot
   separate the teams (all keys equal) is skipped; a stage that is *not applicable* (for example,
   head-to-head when two teams never met) is skipped too.
3. **Multi-team procedure.** The leagues differ here, and the difference changes results:
   - `partition-restart` (SCVAL, PCAL, EAL, Sunset, San Diego): a stage splits the bucket into a better and a worse group;
     each group restarts the chain from its first stage, using only its own members.
   - `seed-one-restart` (BVAL, MCAL): a stage picks the *one* best team for the current place; the
     chain then restarts among the rest for the next place.
4. A stage the site cannot compute (`coin-flip`, `ccs-points`, or a rule that does not exist,
   `no-rule`) ends the walk: the remaining teams share a place, listed by name, with the league's
   citation as the footnote.
5. Only games that count toward the division table are used: two teams of the same division, a
   league game by the league's own evidence (SCVAL, EAL and Sunset: MaxPreps' league flag; BVAL, PCAL
   and MCAL: it is on the official schedule; the San Diego divisions: any game between two members
   inside league play, whatever MaxPreps' flag says), never a tournament, neutral or postseason game.
6. A team with no results is named and listed last, never ranked by merit and never shown as 0-0-0.
7. A tie at the top is shown as "Level on points at the top" until the league's regular phase is
   over; only then does the league's co-champion label appear.

Places use standard competition ranking: two teams sharing 3rd are both 3rd and the next is 5th.

---

## SCVAL — Santa Clara Valley Athletic League (CCS)

**Divisions.** De Anza (7 teams, 12 league games each) and El Camino (8 teams, 14 league games each),
a double round robin inside each division; league play Sep 9 – Oct 28. Tables are per division.

**Points and order.** 3 for a win, 1 for a tie, 0 for a loss; standings are the order of points
(SCVAL Field Hockey By-Laws 2026-27, Article VI §2). Games between two members of the same division
are the only ones that count toward the division record (Article VI §1). Overtime is one 7-minute
sudden-victory period; still tied means the game ends in a tie (Article IV).

**Chain** (multi-team procedure: `partition-restart`; the chain restarts from the first stage once
any team is broken out):

| Stage | Rule | Citation |
|---|---|---|
| 1 | better head-to-head record among the tied teams | Article VI §3 |
| 2 | greater number of wins in division play | Article VI §4 |
| 3 | least goals given up between the tied teams | Article VI §5 |
| 4 | goal differential between the tied teams | Article VI §6 |
| 5 | coin flip (not computable; the teams share a place) | Article VI §7 |

If two tied teams never played each other, the head-to-head stage counts as zero for both and does
not separate them (the site's behaviour since launch, pinned by its golden tests).

**Co-champions.** A tie at the top of a division means co-champions (Article VI §2). The site's
label is "Co-champions".

**Postseason** (CCS ladder; SCVAL holds 7 of the 16 CCS berths): Article VII §2 — the first three
in each division are automatic qualifiers; fourth place plays in; the play-in loser and both
fifth-place teams are submitted for at-large consideration; 6th and below have no automatic path.
On **Fri Oct 30** the four De Anza places meet the four El Camino places (#1 v #1 … #4 v #4);
#1 to #3 help CCS ordering and #4 v #4 is the play-in for the 7th automatic berth. The CCS
championship follows (entries due Nov 2, quarterfinals Nov 7, semifinals Nov 11, final Nov 14).

**Official sources.** The two schedule grids as PDFs (De Anza and El Camino), read live every run and
parsed with `pdftotext`; the by-laws PDF; the standings index (polled for a 2026-27 standings
file). Membership comes from the grids.

**Known data gaps.** Wilcox is on De Anza's official grid but is not fielding a team in 2026, so De
Anza has 7 teams and its 14 grid fixtures are dropped. MaxPreps' De Anza table has 7 rows for the same
reason. MaxPreps' table is trusted for a full cross-check (record, goals, place and win percentage).
Scores MaxPreps lacks may be backfilled from si.com under the rules in `docs/DATA-SOURCES.md` (§5.2).

---

## BVAL — Blossom Valley Athletic League (CCS)

**Divisions.** Mt. Hamilton (6 teams: Branham, Christopher, Gilroy, Leigh, Leland, Willow Glen) and
Santa Teresa (6: Del Mar, Live Oak, Prospect, Silver Creek, Sobrato, Westmont); a home-and-home
double round robin inside each division, 10 league games each; league play Sep 17 – Oct 30.

**Points and order.** 3 for a win, 1 for a tie; division placement is the order of team points
(BVAL Field Hockey By-Laws, rev. 8/13/24, §6a). Overtime is one 7-minute 7v7 sudden-victory period;
still tied means a tie (§1a).

**Chain** (multi-team procedure: `seed-one-restart`; a stage that cannot be computed because two
teams never met is skipped):

| Stage | Rule | Citation |
|---|---|---|
| 1 | head-to-head; with three or more tied, a 3-1-0 mini-league among them | §6b |
| 2 | more division wins | §6c |
| 3 | head-to-head goal differential among the tied teams | §6d |
| 4 | fewest goals allowed in division play | §6e |
| 5 | coin flip (not computable; the teams share a place) | §6f |

**Co-champions.** "If there is a tie, both teams shall be declared Division Champions" (§6a). The
label is "Division co-champions".

**Postseason** (CCS ladder; BVAL holds 4 of the 16 CCS berths) — §7a:

| Division | Place | Outcome |
|---|---|---|
| Mt. Hamilton | 1st-3rd | BVAL #1-#3, automatic CCS qualifiers |
| Mt. Hamilton | 4th | plays at the Santa Teresa champion Sat Oct 31, 11 AM, for BVAL's 4th berth |
| Mt. Hamilton | 5th and lower | no automatic-berth route (at-large is the CCS committee's call) |
| Santa Teresa | 1st (the champion) | hosts Mt. Hamilton #4 on Oct 31 |
| Santa Teresa | 2nd and lower | no automatic-berth route |

BVAL's by-laws do not say whom it submits for at-large berths. The site never writes "eliminated";
places off the ladder read "No automatic-berth route".

**Official sources.** The two division schedules, Google Docs revised 9/20/26 (Mt. Hamilton) and
9/22/26 (Santa Teresa); 60 fixtures bundled in `data/official/bval-2026.json` and hash-checked every
run. The by-laws are a Google Doc. A league game counts when it matches a fixture; MaxPreps'
`contestType` 2 and 4 (tournament, neutral) never count.

**Known data gaps.** MaxPreps' Santa Teresa table leaves out **Prospect** (5 teams of 6) and counts
four of Prospect's official league games as non-league, so MaxPreps' records differ from ours for
that division; the cross-check there is records-only and shows the cause rather than an alarm. BVAL
revised both schedules after the research copy was made; a new revision is flagged but never
applied automatically.

---

## PCAL — Pacific Coast Athletic League (CCS)

**Division.** One division of 7 teams (Carmel, Greenfield, Hollister, Monterey, Salinas, Santa
Catalina, Stevenson), a double round robin in 2026, 12 league games each; league play Sep 2 – Oct 29
(the last allowed league date is Oct 31). The site shows no division picker and no division label;
its table is "League table". (York plays JV only and is not covered.)

**Points and order.** 3 for a win, 1 for a tie; standings are the order of points (PCAL Sports
Rules — Field Hockey, Jan 2022, §1.7). Overtime applies only to single round robin or bracket play,
so a league tie is one point either way (§1.6.4).

**Chain.** PCAL's by-laws (rev. May 2025) break ties only for the two automatic CCS berths (§23.3),
so the chain is keyed by **where the tied points bucket starts**:

| Bucket starts at | Chain |
|---|---|
| 1st (co-/tri-champions) | head-to-head (§23.3, three level: a three-way head-to-head, then a two-way among those still level); then the record against each lower-placed team in standings order, one team at a time (§23.3.1(b)); then the CCS-points step, a coin flip or a blind draw |
| 2nd | head-to-head; then the record against each higher-placed team from the champion down (§23.3.3); then the record against each lower-placed team (§23.3.3(c)); then the CCS-points step, a coin flip or a blind draw |
| 3rd or lower | none: PCAL defines no tiebreak, so the teams stay level, listed by name |

The CCS-points step applies only to sports seeded by CCS points, and the coin flip or blind draw is
drawn by the Commissioner; the site cannot compute either, so those teams share a place.

**A comparison with a placed team stops the chain when it cannot be made** (§23.3.1(b) /
§23.3.3(c) for the lower-placed step, §23.3.3 for the higher-placed one). The walk compares the
tied teams' points against one placed team at a time; if the tied teams have not all met that team,
or have not met it equally often (an unplayed fixture, mid-season), nothing is invented: the chain
stops there and the teams stay level, on the CCS-points / coin-flip / blind-draw step, sharing a
place. It does not move on to the next placed team or the next step.

**Multi-team procedure: `partition-restart`** (PCAL By-laws §23.3.2, a-b). Three teams level for
first: the three-way head-to-head places the best and the worst of the three, and the two still
level restart with a two-way head-to-head. (A seed-one restart would wrongly re-run the pair that
already played its way through the three-way table.) If two teams never met, the head-to-head
stage is skipped rather than invented; a record-vs-placed-team stage that cannot be made stops the
chain instead (above).

**Co-champions.** Two teams level at the top are co-champions and three are tri-champions (By-laws
§22.3); the label is "Co-champions (tri-champions when three are level)".

**Postseason** (CCS ladder; PCAL holds 2 of the 16 CCS berths, down from 3 by the CCS Field Hockey
Committee report of 2025-11-20 §IV) — Rules §1.8.1: the top two of the final standings are
automatic CCS qualifiers. 3rd and lower have no automatic-berth route and may apply for an at-large
berth (By-laws §23.4). There are no PCAL pairings; the next game is the CCS bracket.

**Official sources.** One PDF schedule (2026 FINAL); 42 fixtures bundled in
`data/official/pcal-2026.json` and hash-checked every run. The grid's codes `STE CAR HOL MON SAL GRE
CAT` map to the registry; `CAT/YOR` and `SCAT` are Santa Catalina. A game counts when it matches a
fixture, including a game MaxPreps moved by up to two weeks.

**Known data gaps.** MaxPreps' PCAL table is **informational only**: MaxPreps is missing some of PCAL's
official league games and dates others differently (on 2026-10-02, 8 of the 42 fixtures had no
MaxPreps contest), so its records differ from ours. The cross-check shows league record only. This is
the league where si.com backfills do the most good; each one is listed on `/about#backfills`.

---

## MCAL — Marin County Athletic League (NCS)

**Division.** One division of 9 teams (Archie Williams, Redwood, Tamalpais, Berkeley, Lick-Wilmerding,
San Francisco University, Marin Catholic, Convent of the Sacred Heart, Marin Academy), a double round
robin of 16 league games each (Handbook §8a); league play Aug 24 – Oct 22. No division picker or
label; the table is "League table".

**Points and order.** 3 for a win, 1 for a tie (MCAL Field Hockey Handbook, rev. 10/19/24, §7a);
"the MCAL placement will be the order of team points" (§7a). There is no regular-season overtime
(MCAL General Rules), so ties stand. If the season ends with games unplayed, the General Rules
replace points with winning percentage; the standings page notes this and will show that order if it
happens.

**Chain** (MCAL Tie-Breaking Criteria, rev. 3/26; multi-team procedure: `seed-one-restart`, "the
criteria will start over" for each next place):

| Stage | Rule | Notes |
|---|---|---|
| 1 | head-to-head winning percentage among the tied teams | skipped if any of the tied teams never met the others |
| 2 | record against the teams above the tie | skipped for a tie at the top, or if a team has no games against them |
| 3 | spring draw numbers, lowest wins: Archie Williams 1, Redwood 2, Tamalpais 3, Berkeley 4, Lick-Wilmerding 5, San Francisco University 6, Marin Catholic 7, Convent 8, Marin Academy 9 | draw numbers are distinct, so every place is decided except the last tournament place |

**The last tournament place (6th) is decided on the field.** The Criteria apply stages 1-3 to every
play-off position "except for the 6th place". For a points group that spans 6th and 7th:

- two teams, one of which won both meetings (2-0): the sweeper takes 6th;
- two teams that split, tied or have not both played: they share 6th (`play-in`) and a play-in game
  on **Fri Oct 23** decides it, hosted by the higher draw number;
- three teams tied on points for 5th-7th: draw numbers place the 5th seed and the other two share
  6th;
- a three-way or larger tie for 6th: stages 1-2 and then the draw number pick the two play-in
  teams; the remaining team is placed after them.

These last-place rules (the three-way 5th-7th draw and the play-in) are for teams tied **on
points** over those places. Inside a larger points tie, seeding one team at a time, a stage can
leave a subgroup level at its best mark (say three of five teams level on head-to-head); the
criteria then keep running among that subgroup alone to seed the one team ("the above criteria
will be used to break the tie, seeding one team"), and the last-place rules are not used for that
pick.

**Co-champions.** Equal points means co-MCAL Champions (§7a), labelled "MCAL co-champions". The
regular-season points leader is MCAL Champion; if a different team wins the tournament, it also
receives a pennant.

**Postseason** (a league tournament, not a section playoff; the NCS and CIF hold no field hockey
championship). Six teams qualify (the 2026 play-off sheet; the Handbook's §8b says four, and the
sheet and the 2025 tournament use six, so the site follows the sheet and says so):

| Seed | Outcome |
|---|---|
| 1-2 | semifinal bye (Wed Oct 28) |
| 3-6 | quarterfinal Mon Oct 26: 5 at 4 and 6 at 3 |
| 7th and lower | below the tournament line |

Play-in (only if needed) Fri Oct 23; quarterfinals Mon Oct 26; semifinals Wed Oct 28 (the
lowest-ranked remaining seed at #1, the highest-ranked remaining of seeds 3-6 at #2, confirmed by the
2025 bracket); final Fri Oct 30 at Tamalpais, all at 4:00 PM. A one-goal result of a tournament game
carries the shootout caveat. Games dated **Oct 23 or later** between MCAL teams are tournament play
and never count in the league table, unless a maintainer lists a rescheduled league game as an
override.

**Official sources.** The 2026 schedule PDF (72 fixtures, bundled in `data/official/mcal-2026.json`
and hash-checked every run); the Handbook; the Tie-Breaking Criteria; the 2026 play-off sheet. Approved
schedule changes (two so far) are posted on the league's schedule-changes page, not in the PDF, so
that page's field hockey cell is hashed every run too.

**Known data gaps.** MaxPreps **orders its MCAL table by winning percentage**, not points, so its
places differ from ours; after Oct 22 it also counts tournament games in its league records, ours
never do. Its table is trusted for records and goals only (no place, no win percentage). Two of
MaxPreps' contests carry dates that differ from the official schedule after approved changes; the
official date is kept as the scheduled date. A MaxPreps ghost team (Del Norte of Crescent City) and
one spurious unscored contest are dropped on purpose (`/about#dropped`). MCAL's spring draw numbers
and the Tie-Breaking Criteria revision (3/26) are the league's; a new revision would change the
config by hand.

## EAL — Eastern Athletic League (NS)

**Division.** One division of 6 teams (Bella Vista, Chico, Corning, Davis, Lassen, Pleasant Valley), a
double round robin of 10 league games each (Guidelines §III.A.1); league play Aug 24 – Oct 28. "All
participating schools are considered to be in the same division" (§I), so the site shows no division
picker and no division label; the table is "League table". Red Bluff is still a 0-0-0 row in MaxPreps'
table but is not fielding a varsity team in 2026, so it is not covered. The league is the Northern
Section's, but two of its teams are not Northern Section schools: Chico, Corning, Lassen and Pleasant
Valley are, and Davis and Bella Vista are Sac-Joaquin Section schools that play field hockey in the
EAL. Pages that list the teams under the league print that note.

**Points and order.** 3 points for a win, 1 for a tie, 0 for a loss, "to determine the League
Championship" (CIF Northern Section Field Hockey Guidelines 2026-28, §VII.C.2). The Guidelines give no
rule for ordering the league table (the §III.E.1 Super Regional seeding criteria are quoted below and
not applied here), and the EAL publishes no standings, so the order of this site's table is our
computation: the same points, applied to every place. The standings page says so.

**Ties in a game.** A varsity game that is level after regulation gets one 10-minute sudden-victory
period, then 1 v 1s until there is a winner (§VII.E.4), so a league game never ends level. MaxPreps
records a 1 v 1 win as a level score with a win flag for one team and a loss flag for the other (Chico
1, Davis 1, 2026-09-28: Chico W, Davis L, and MaxPreps' standings count it as a Chico win). The site
counts the flags: that game is a win for Chico, a loss for Davis, and its goals stay 1-1. It shows an
"SO" mark ("decided on 1 v 1s" to a screen reader). The 1 v 1 tally is not shown. A level final
without those flags stays a tie. MaxPreps' record of the 2026-09-02 Pleasant Valley at Chico game
(1-0, three overtime periods) cannot be a real overtime count under §VII.E.4 and may be a 1 v 1 win
entered as a goal, so the game page shows the score as MaxPreps has it, with a note, and no overtime
mark. §VII.E.4 governs a varsity game, so the JV pipeline (`pnpm fetch-jv`) never reads a level EAL JV
final as a 1 v 1 win: a level JV score stays a tie, and W/L flags on one are kept as a contradiction.

**Chain** (multi-team procedure: `partition-restart`; no stage separates a bucket, so it is never used):

| Stage | Rule | Citation |
|---|---|---|
| 1 | no rule: the Guidelines break no tie in the league table (not computable; the teams share a place) | §VII.C; §III.E.1 |

Teams level on points share a place and the footnote cites the two clauses. The Super Regional
seeding criteria (§III.E.1) belong to the coaches and are not a table tiebreak.

**Co-champions.** "In the case of a tie, duplicate awards will be given" (§VII.C), so equal points at
the top means co-champions; the Guidelines add that a team must play all its league games unless the
vote waives it (§VII.C.1). The label is "EAL co-champions". It appears only after the regular phase is over and no
EAL league result is missing.

**Postseason** (the Super Regional, a Section-sanctioned, league-run tournament; the site draws no
bracket). "The top six (6) EAL/SRL schools will compete" (§III.E.1, §IV), Oct 30-31, 2026 (Fri-Sat), at
"an alternative site" (§III.E.1); the Section's playoff calendar lists the same dates with the site "TBA". With six teams, every team is inside
the top six, which is our application of the rule, not a Guidelines statement. The Guidelines' seeding
text is quoted verbatim and **not applied here**: "Seeding will be based on League record, Head-to-Head
Goal differential (Capped at six (6) per game, Goal against, Coin flip." Its punctuation does not say
whether that is four steps or five, and the coaches "set the criteria" (§II). The format is set at the
preseason tournament meeting (§IV) and none is published. A school with any score unreported by noon the
day after the last contest of the season is not eligible (§VII.J); results are reported to MaxPreps under
a separate rule (§XI.D), so this site never says MaxPreps feeds the seeding. NorCal and State
qualification are "Not Applicable" (§V, §VI).

**Official sources.** The Section's Field Hockey Guidelines 2026-28, a PDF with a creation date of
2026-06-10 (sha256 `68e73674a1f29bb24d827e842e5ab2adc7f58364ff1a54cd4ea2789377646020`), linked from
the Section's field hockey page (cifns.org/sports/fh/index), whose standings and schedule panels are
empty. There is no league website and no official EAL schedule or standings: league games are the games
MaxPreps marks as league games (as for SCVAL). On 2026-10-04 all 30 of them equalled, by date, away
team, home team and league flag, the 2026 grid on the EAL/SRL umpires' site (fieldhockeyumpires.org).
That grid is a cross-check only: it is not an official league or Section document, it is not linked
or bundled, and its times are JV start times. A league result is "missing" when MaxPreps marks a league
game dated before today and has no counted result for it.

**Known data gaps.** MaxPreps **orders its EAL table by winning percentage** (in 2025-26 it placed
6-4 Pleasant Valley above 7-5 Bella Vista), not points, so its places can differ from ours; its table
is trusted for records and goals only. It also lists Red Bluff (0-0-0, no games), which the site leaves
out. On 2026-10-04 two league games had no counted score at MaxPreps (2026-09-29 Pleasant Valley at
Corning and 2026-10-01 Corning at Chico), and they are listed on `/standings/eal`. The Section's Sport
Dates sheet gives a last contest of Oct 26 while the Guidelines say Oct 29; the last scheduled league
game is Oct 28 (Davis at home against Pleasant Valley), and the site uses the schedule. Prior-season
standings are not available (`/history/2025-26`): the EAL published none.

---

## Sunset — Sunset Field Hockey League (CIF Southern Section)

Tags: **[V]** read on the page or document named, 2026-10-06; **[U]** not verified (the reason is given).

**What it is.** A field-hockey-only grouping of ten Southern Section schools in Orange, Los Angeles and
Riverside counties: Bonita (La Verne), Chaminade (West Hills), Chaparral, Great Oak and Temecula Valley
(Temecula), Edison, Huntington Beach and Marina (Huntington Beach), Fountain Valley (Fountain Valley)
and Newport Harbor (Newport Beach). It is **not** the all-sports Sunset League, an Orange County league with different
members (Los Alamitos and Corona del Mar among them) [U: from a search snippet, not a league document];
the site names it "Sunset Field Hockey League" and its copy never writes "Sunset League" except beside
"all-sports". The ten are exactly MaxPreps' 2024-25 (`c538c7d2-…`) and 2025-26 (`1ab67ce6-…`) Sunset
tables [V]. No Sunset website, bylaws, schedule or standings document exists that we could find [U: not
found, not proven absent]. For 2026-27, MaxPreps' Sunset table (`aa46adc4-…`) lists five (Great Oak,
Temecula Valley, Bonita, Chaminade, Chaparral) ordered by conference winning percentage, and gives the
five Orange County schools no league (a zero GUID) [V]; si.com's table, which the Section's own scores
site (scores.cifss.org) shows, lists eight of the ten plus two 0-0 rows (Westlake, Los Alamitos) and
files Chaparral and Temecula Valley under "Southwestern" [V].

**Which games count.** A game between two of the ten that MaxPreps marks as a league game (contestType 0
on either row), leaving out tournament (2) and postseason (4) rows: classification `contest-type`, as
for SCVAL and the EAL. League play runs Aug 18 (Bonita v Marina and Chaminade v Fountain Valley, the
first such games) to Oct 31, the Section's last allowable contest [V: 2026-27 Sports Calendar; Blue Book
Bylaw 2006]. There is **no round robin** [V: inventory 2026-10-06, the 45 pairs meet 2, 1 or 0 times:
9, 30 and 6 pairs], so `gamesPerTeam` is null: the site prints games played without "of N" and shows no
games-left or maximum-points column, and when teams' counts differ by two or more the standings say that
points favour teams that have played more. MaxPreps flags 2 to 7 games a team [V]; si.com marks more games
as league games than MaxPreps does [V], so its Sunset records differ from ours.

**Points and order.** No league document awards points or orders the table, so the order is this site's
own 3-1-0 points (`orderScope: 'site'`), and every page says so instead of citing a league rule.

**Ties in a game.** Blue Book Article 200 adopts the NFHS rules and says nothing on overtime [V]. Sunset
games have ended level (Bonita 1-1 Marina, Aug 18; Fountain Valley 1-1 Marina, Sep 11 [V]) and have been
decided in overtime (Great Oak 2-1 Temecula Valley, Oct 2, one overtime period [V]), so each game is
recorded as it is reported: `leagueOvertime: 'none'` (D2 rule 4c, a phantom si.com 0-0, applies). The
Southern Section has no shootout rule (`SectionConfig.shootout` null).

**Chain** (multi-team procedure: `partition-restart`; no stage separates a bucket):

| Stage | Rule | Citation |
|---|---|---|
| 1 | no rule: no Sunset document exists that we could find (not computable; the teams share a place) | — |

**Co-champions.** No published rule names a champion; teams level on points at the top are shown level,
labelled "Sunset co-leaders" once league play is over.

**Postseason.** None. "GIRL'S TEAM FIELD HOCKEY CHAMPIONSHIPS (No playoffs - See Bylaw 3500.2)" (Blue Book
2026-27 Bylaw 2011.1) and "No playoffs will be conducted by the CIF Southern Section Office when less than
20% of the membership field teams in that sport" (Bylaw 3500.2) [V]; the 2026-27 Sports Calendar lists
CIF-SS Preliminaries and Finals "N/A" and scores.cifss.org shows "No Brackets Found" [V]; CIF holds no
regional or state field hockey championship [V: cifstate.org]. The last Southern Section field hockey
championship was in 1984 [V: CIF-SS History #134]. The config's postseason kind is `no-postseason`: one
ladder rung for every place ("No section playoffs"), no ladder line and no band.

**Official sources.** The Blue Book 2026-27 Field Hockey excerpt (Article 200, PDF), the 2026-27 Sports
Calendar and the Season Preview, all linked from cifss.org/sports/field-hockey/ [V]. The Season Preview's
list of participating schools names Bonita, Chaparral, Edison, Fountain Valley, Glendora, Great Oak,
Huntington Beach, Marina, Newport Harbor, Temecula Valley and Thousand Oaks; it omits the private schools
Chaminade and Harvard-Westlake, which do field teams [V]. Harvard-Westlake, Thousand Oaks and Glendora are
each the only field hockey team in their all-sports MaxPreps league (League B, Marmonte, Palomares) with no
league-flagged game [V], so they appear only as opponents. Mayfair has a 2026-27 MaxPreps team but no game
and is not on the participating list [V].

**Known data gaps.** MaxPreps' Sunset table holds five of the ten and orders them by winning percentage;
its records are labelled informational. No 2025-26 Sunset standings document exists that we could find
[U], so `/history/2025-26` shows none.

---

## The San Diego Section — City, North County and Metro conferences (CIF-SDS)

Tags as above.

**Alignment.** From the Section's 2026-27 League Alignment workbook [V] (CITY tab "LAST UPDATE: September
10, 2026"; NORTH COUNTY "UPDATED 9/20/26"; METRO undated): City Western 6 (Bishop's, Canyon Hills,
Cathedral Catholic, La Jolla, Mission Bay, Scripps Ranch); City Eastern 6 (Clairemont, La Jolla Country
Day, Mira Mesa, Patrick Henry, Point Loma, University City); Avocado 6 (Canyon Crest Academy, La Costa
Canyon, Mt. Carmel, Rancho Bernardo, San Marcos, Torrey Pines); Palomar 7 (Del Norte, Fallbrook, Mission
Vista, Poway, Rancho Buena Vista, San Dieguito Academy, Valley Center); Valley 6 (Escondido, Mission
Hills, Sage Creek, San Pasqual, Vista, Westview); Metro Mesa 5 (Bonita Vista, Eastlake, Helix, Olympian,
Otay Ranch); Metro South Bay 4 (El Capitan, Granite Hills, Hilltop, Southwest). The sheet also lists
Rancho Buena Vista under Valley; its league games are against Palomar teams and MaxPreps' Palomar table
lists it, so it is Palomar's here [V]. The 40 are exactly the 40 programs with results in the Section's
power rankings [V]. The site's league is the conference (City, North County, Metro) and its divisions are
the Section's leagues; the division names are ours [U: the sheet labels them WESTERN, EASTERN, NC
AVOCADO, NC PALOMAR, NC VALLEY, MESA and SOUTH BAY].

**Which games count.** The divisions play a double round robin: every pair of division-mates is
scheduled to meet twice on MaxPreps' schedules (leaving out contestType 2 and 4) [V: inventory
2026-10-06], (teams − 1) × 2 games a team: 10, 10, 10, 12, 10, 8 and 6. One pair is short of that:
on 2026-10-06 MaxPreps shows Metro Mesa with 19 of its 20 meetings, Bonita Vista and Helix meeting once
(Oct 23, `b9d43b5d-5000-4bdc-a50e-00c22f1544c4`) [V: the 2026-10-06 SoCal corpus], so unless a second
meeting is added, Bonita Vista and Helix play 7 league games, not 8. No league schedule exists to say
whether the second meeting is missing from MaxPreps or was never scheduled [U]. MaxPreps' league flag misses many of them (Patrick Henry 0 of 10 flagged, San
Pasqual 3, Vista 4, Mt. Carmel 4, Escondido 5, Southwest 2 of 6) [V], so these divisions use
classification `membership`: a game counts for a division when both sides are its members, neither row is
contestType 2 or 4, and it is dated inside league play, whatever MaxPreps' flag says. A game MaxPreps flags
between two divisions of one conference (Mission Bay's five against City Eastern teams [V]) counts in
neither table. Two duplicate Palomar rows (Poway v Fallbrook on Oct 9 with no time, duplicating Oct 13;
Mission Vista v Fallbrook on Oct 30 with no time, duplicating Oct 29) are excluded in
`DATA_QUALITY.excludedContestIds`. League play starts at each division's first game between two members
(City Western Sep 1, City Eastern Sep 15, Palomar Sep 9, Avocado, Valley and Metro Mesa Sep 28, Metro South
Bay Oct 7) [V: inventory] and ends Oct 30, the Master Calendar's last contest [V]. **Conflict:** the San
Diego Field Hockey Officials Association's calendar ends the regular season on Thu Oct 29 [V]; the
Section's date is used.

**Points and order.** No conference or league document awards points, publishes standings or orders a
table that we could find [U: not found], so the order is this site's own 3-1-0 points (`orderScope:
'site'`). The Section's power rankings list each school's league record from game-type labels its schools
enter; they are not league standings and are not used.

**Ties in a game.** The Green Book leaves the tiebreaker procedure "for regular season and playoff contests"
to the preseason minutes (Bylaw 2000.1, special rule 3) [V], which are a Canva bulletin we could not read
[U]. The officials' association's 2026 Mercy & Overtime Procedures [V] are the operative text: varsity
regular season, a 10-minute 7 v 7 sudden-victory period, then a set of five 1 v 1 shootouts, then
sudden-victory shootouts; "a total of one goal is awarded for the winner of the set". So a varsity game
never ends level, across all three conferences. **MaxPreps often records such a win as a level score
marked W and L** (eight 2026 finals, all with overtimePeriodsPlayed 0: Clairemont–Eastlake Sep 1,
Escondido–El Capitan Sep 1, Canyon Crest–San Pasqual Sep 4, Mt. Carmel–Poway Sep 11, San Pasqual–San
Dieguito Sep 14, Canyon Crest–Cathedral Sep 22, University City–Rancho Bernardo Sep 22, Westview–San
Pasqual Oct 2) [V]; the Section's own power-rankings site is inconsistent ("W (0-0)" and "W (2-0)") [V].
The site counts the flags as a win and marks the game "SO", for any two San Diego teams: the rule is the
Section's (`SectionConfig.shootout`), not a conference's. How each source encodes a shootout in general
is [U]. The rule is a varsity rule: the same procedures say "JV—No overtime", and the officials'
association's game format says of JV and frosh games "Teams tied at the end of regulation, game over"
[V], so a level JV final stays a tie, and the JV pipeline (`pnpm fetch-jv`, `level: 'jv'` in
`lib/normalize.ts`) never reads one as a shootout win, whatever MaxPreps flags.

**Chain** (multi-team procedure: `partition-restart`):

| Stage | Rule | Citation |
|---|---|---|
| 1 | no rule: the Green Book leaves tiebreaks to the preseason minutes, which we could not read (the teams share a place) | Green Book 2000.1, special rule 3 |

**Co-champions.** The league designates its champion: "In case of a tie for first place, the league is to
designate its automatic qualifier" (Green Book, general playoff bylaws) [V]. The site shows teams level on
points as level and labels them "{conference} co-leaders" once league play is over; it never names the
champion.

**Postseason** (`section-playoffs`; no bracket drawn, no place projected). Green Book 2026-27 Bylaw 2000.1
[V]: "There will be 3 competitive divisions with 8 teams in the Open Division and 12 teams in Divisions I
and II qualifying for the playoffs. Designated league champions (not co-champions or tri-champions) will
be guaranteed entry into a play-in game in the CIFSDS playoffs." The Commissioner places teams from the
approved power rankings with input from the coaches' advisory committee, with no appeal [V]; the eight
Open Division teams are drawn from Division I at the end of the regular season [V: division-placement
bylaw]. (The bylaw's play-in sentence names a seed position and is paraphrased on the site, never quoted:
copy rule SEED_CLAIM.) The 2026 Divisions sheet (dated 2025-12-23) puts 20 of the 40 in Division I and 20
in Division II [V]; each team's division is `playoffDivisionOf` in config. Open 8 plus Division I 12 is
20 places for 20 Division I schools, so every Division I team may well play [U: our arithmetic; the
Championship Bulletin that would say so returns the site shell instead of a PDF]. Division II has 12
places for its 20. Dates: Master Calendar playoffs Nov 2–12, finals Nov 14 [V]; seeding meeting Oct 31,
10 AM, by Zoom [V: advisory calendar]. Round dates come only from the officials' association's calendar
[V page, not a Section document]: play-ins (if necessary) Mon Nov 2; first round Tue Nov 3 (Division II)
and Wed Nov 4 (Division I); quarterfinals Thu Nov 5 (Open), Fri Nov 6 (II), Sat Nov 7 (I); semifinals Tue
Nov 10 (Open and II), Wed Nov 11 (I); finals Sat Nov 14 at La Jolla HS, 1:00 (II), 3:30 (I), 6:00 (Open).
The site attributes them to the association in the same sentence. The ladder: 1st, "League champion: at
least a play-in" (the designated champion, which the league names, not this table); 2nd or lower, "No
league route" (badge "Selection only"). No CIF regional or state path [V: Master Calendar "N/A"].

**Official sources.** cifsds.org/sports/fh/index links the 2026 Divisions sheet, the League Alignment
workbook, the Green Book (a Google Doc, "Revised June 16, 2026"), the 2025 Championship Brackets sheet and
the power rankings [V]; the Championship Bulletin link is broken and the preseason and host-site
bulletins are unreadable Canva pages [U]. The overtime procedures and the round dates are the San Diego
Field Hockey Officials Association's (sdfhoa.weebly.com) [V].

**Known data gaps.** MaxPreps' tables do not follow the alignment [V]: its City - Eastern table leaves out
Patrick Henry and lists Madison (no 2026 varsity game); its Avocado table leaves out Mt. Carmel and Rancho
Bernardo; it has no Valley table at all (`maxprepsLeagueId: null`, the cross-check is skipped); its "Metro-
South Bay" table holds the five Metro Mesa teams; its "Grossmont" table holds El Capitan, Granite Hills
and Santana (no 2026 varsity game) and lists no league for Hilltop or Southwest. MaxPreps counts Mission
Bay's five games against City Eastern teams as league games, so its Mission Bay record (3-5-0 on Oct 6)
is not a City Western record. Every San Diego table is labelled informational. Madison, Santana, Castle
Park, Chula Vista, Montgomery and Sweetwater have a 2026-27 MaxPreps team but no game there or in the
power rankings [V]; search names each.

---

## At a glance

| | SCVAL | BVAL | PCAL | MCAL | EAL |
|---|---|---|---|---|---|
| Section | CCS | CCS | CCS | NCS | NS |
| Teams / divisions | 15 / 2 | 12 / 2 | 7 / 1 | 9 / 1 | 6 / 1 |
| League games a team | 12 or 14 | 10 | 12 | 16 | 10 |
| Points (W / T / L) | 3 / 1 / 0 | 3 / 1 / 0 | 3 / 1 / 0 | 3 / 1 / 0 | 3 / 1 / 0 (title only) |
| First tiebreak | head-to-head | head-to-head (3+: 3-1-0 mini-league) | head-to-head (only for places 1-2) | head-to-head winning percentage | none (no rule) |
| Multi-team ties | partition, restart | one place at a time | partition, restart | one place at a time | — |
| League evidence | MaxPreps league flag + PDF grid | official schedule | official schedule | official schedule | MaxPreps league flag |
| Last resort | coin flip | coin flip | CCS points, coin flip or blind draw | draw number; 6th place by play-in | teams share a place |
| Postseason | CCS: 7 berths (top 3 per division + play-in) | CCS: 4 berths | CCS: 2 berths | MCAL tournament: top 6, byes 1-2 | Super Regional: top 6, Oct 30-31, no bracket published |
| MaxPreps' table is trusted for | everything | everything (Santa Teresa: records only) | league record only | records and goals only | records and goals only |

| | Sunset | City | North County | Metro |
|---|---|---|---|---|
| Section | SS | SDS | SDS | SDS |
| Teams / divisions | 10 / 1 | 12 / 2 | 19 / 3 | 9 / 2 |
| League games a team | no fixed number (2 to 7 flagged) | 10 | 10 or 12 | 6 or 8 |
| Points (W / T / L) | this site's 3 / 1 / 0 (no league rule) | this site's 3 / 1 / 0 | this site's 3 / 1 / 0 | this site's 3 / 1 / 0 |
| First tiebreak | none (no rule) | none (no rule) | none (no rule) | none (no rule) |
| League evidence | MaxPreps league flag | division membership | division membership | division membership |
| Level games | stand as reported | Section shootout (a win) | Section shootout (a win) | Section shootout (a win) |
| Postseason | none (Blue Book 2011.1, 3500.2) | Section playoffs Nov 2–14: Open 8, I 12, II 12 | same | same |
| MaxPreps' table is trusted for | informational only | informational only | informational only (Valley: no table) | informational only |
