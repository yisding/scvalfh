# League rules — how each league's table is computed

The four leagues this site covers agree on the points (3 for a win, 1 for a tie, 0 for a loss),
the ordering key (points) and that league games can end in a tie. They differ in the tiebreak
chain, in how a tie among three or more teams is worked through, in how a division champion is
named and in what the postseason looks like. Every rule below is data in `lib/leagues.ts` with the
by-law citation beside it; one engine (`lib/standings.ts`) runs them, and `/about#rules-<league>`
prints them on the site. Where the documents say something this site cannot compute (a coin flip,
a blind draw, a play-in game), the teams **share a place** and the page says which rule decides it.
It never guesses an order.

Sources are the league's own documents as of 2026-10-02: see "Official sources" in each section and
`docs/DATA-SOURCES.md` for URLs, hashes and how the schedules are kept current. SCVAL's by-laws
are also quoted in `docs/BYLAWS-2026-27.md`.

## How the engine reads a tie

1. Teams are ordered by points; teams level on points form a *bucket*.
2. A bucket is resolved by walking the league's *chain* of stages in order. A stage that cannot
   separate the teams (all keys equal) is skipped; a stage that is *not applicable* (for example,
   head-to-head when two teams never met) is skipped too.
3. **Multi-team procedure.** The leagues differ here, and the difference changes results:
   - `partition-restart` (SCVAL, PCAL): a stage splits the bucket into a better and a worse group;
     each group restarts the chain from its first stage, using only its own members.
   - `seed-one-restart` (BVAL, MCAL): a stage picks the *one* best team for the current place; the
     chain then restarts among the rest for the next place.
4. A stage the site cannot compute (`coin-flip`, `ccs-points`, or a rule that does not exist,
   `no-rule`) ends the walk: the remaining teams share a place, listed by name, with the league's
   citation as the footnote.
5. Only games that count toward the division table are used: two teams of the same division, a
   league game by the league's own evidence (SCVAL: MaxPreps' league flag; BVAL, PCAL and MCAL: it
   is on the official schedule), never a tournament, neutral or postseason game.
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

---

## At a glance

| | SCVAL | BVAL | PCAL | MCAL |
|---|---|---|---|---|
| Section | CCS | CCS | CCS | NCS |
| Teams / divisions | 15 / 2 | 12 / 2 | 7 / 1 | 9 / 1 |
| League games a team | 12 or 14 | 10 | 12 | 16 |
| Points (W / T / L) | 3 / 1 / 0 | 3 / 1 / 0 | 3 / 1 / 0 | 3 / 1 / 0 |
| First tiebreak | head-to-head | head-to-head (3+: 3-1-0 mini-league) | head-to-head (only for places 1-2) | head-to-head winning percentage |
| Multi-team ties | partition, restart | one place at a time | partition, restart | one place at a time |
| League evidence | MaxPreps league flag + PDF grid | official schedule | official schedule | official schedule |
| Last resort | coin flip | coin flip | CCS points, coin flip or blind draw | draw number; 6th place by play-in |
| Postseason | CCS: 7 berths (top 3 per division + play-in) | CCS: 4 berths | CCS: 2 berths | MCAL tournament: top 6, byes 1-2 |
| MaxPreps' table is trusted for | everything | everything (Santa Teresa: records only) | league record only | records and goals only |
