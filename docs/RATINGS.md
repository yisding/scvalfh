# Ratings

The two numbers on the site that come from a model rather than a count: the Elo rating and the
Elo-adjusted goals and points built on it. Both are estimates, never a status: they order no table,
berth or seed.

## How Elo ratings are computed

Each team's Elo rating (`lib/engine/ratings.ts`, DESIGN §20) is on its team page behind a closed "Elo
rating" disclosure under the stat tiles (`#elo`), kept low on purpose so a family checking its
team meets the record first, and the ten highest in each region are a board on `/leaders`
(`#elo-rating` for NorCal, `#elo-rating-socal` for SoCal). The ratings are on one scale across all
nine leagues and the five independents: there is one fit, over both regions, and each board takes its region's rows from it. It is in Elo points (1500 is the average
rated team, and a team 400 points higher is about a 10-to-1 favorite) but it is not computed game
by game: classic Elo moves two ratings after each game, which over one season of about ten games a
team leaves it mostly where it started. Instead every final between two of the 102 teams is fitted
at once, at every build, starting from last season's:

- **The fit.** The strengths for which `home − away + home edge ≈ goal margin` holds best over the
  whole season, by least squares, with each margin capped at 5 goals (a score run up past five
  earns nothing more). The home edge applies only where a game has a host. Because the season is
  fitted as a whole, a win over a strong team counts for more than the same win over a weak one,
  and a team's rating can move on a day it did not play, when an opponent's later results show it
  was stronger or weaker than it looked.
- **The start.** Each team starts the season from its rating over last season's finals
  (`data/prior-season.json`: every 2025-26 final between two of the 102 teams, 935 of them, from
  MaxPreps: 412 between NorCal teams, 512 between Southern California teams and 11 between the
  regions; 40 involve an independent. One MaxPreps row, a no-time duplicate of Helix's Oct 18 win
  over Patrick Henry, is left out by name: `PRIOR_EXCLUDED_CONTEST_IDS`), carried over in full. That start counts for one game: it decides the first weeks and
  fades as the season's own results come in. A team with no result yet this season is shown at its
  start, as "preseason".
- **How well it predicts.** (Measured over the 43 teams of the four leagues covered on 2026-10-02,
  before the EAL joined.) Replaying a season day by day, each day predicted from only the games
  before it: seeded from 2025-26, 2026 through Oct 2 picked the winner of 89% of the games that had
  one (79% unseeded) and missed the capped margin by 1.76 goals (2.37); 2025-26 seeded from 2024-25
  picked 88% (84%) and missed by 1.61 (1.97). Carrying 85-115% of last season over, at a weight of
  half a game to three, scored about the same; a team's strength over one full season and the next
  correlates at 0.89.
- **The scale.** Elo = 1500 + 175 × (strength in goals − the average). 175 points a goal is the
  value that best fits Elo's own expected-score curve over those 564 replayed predictions:
  favorites by 100-200 points scored 69% (Elo expects 70%), by 200-300 80% (81%), by 400-600 97%
  (95%).
- **What counts.** Every final between two of the 102 teams, league or not, postseason included,
  with its published score (a si.com backfill too). Forfeits, finals without a score and games
  against schools outside the nine leagues and the five independents are left out, last season's included. The fit uses goals,
  so an EAL game decided on 1 v 1s, or a level San Diego game MaxPreps marks W and L, counts as level
  there.
  The model's constants (the 5-goal cap, the one-game weight of last season, 175 points a goal) were
  set on NorCal seasons and have not been tested on Southern California's.
- **The board.** A team needs half the median team's counted games this season, in its own region,
  to be on that region's `/leaders` board, as the record boards do; below that its team page shows the rating as
  provisional. A team page names its place only when the board lists it (the top 10).
- **Known soft spot.** MCAL links to the three CCS leagues through few games (nine in 2025-26,
  five so far in 2026, as counted before the EAL joined), so how MCAL teams compare with the CCS
  leagues rests on those results and can move several dozen points with one more cross-league game.
  The EAL has the same problem: last season it linked to the other leagues through 13 games (8 of
  them against MCAL teams; Pleasant Valley 4, Chico 3, Bella Vista 3, Davis 3, none for Corning or
  Lassen), and this season, as of 2026-10-04, through 5 finals (Davis 2, Bella Vista, Chico and
  Pleasant Valley 1 each), so how EAL teams compare with the other leagues, and how Corning and
  Lassen compare with anyone outside the EAL, rests on very few results.
  The two regions have the same problem on a larger scale. As of 2026-10-06 they are linked by
  7 finals this season, all between NorCal and San Diego Section teams (City v SCVAL 3, North County
  v SCVAL 2, City v MCAL 2; 8 more are scheduled, on Oct 16-17), and by 11 last season
  (Leigh, Gilroy and Mitty against San Diego and Sunset teams). Inside Southern California the Sunset
  and the San Diego Section are linked by 38 finals this season. So a NorCal rating and a SoCal
  rating are on one scale, but how far apart the regions sit rests on a handful of games and can move
  with each new one; `/leaders` prints those two counts from the data at every
  build ("comparisons between NorCal and SoCal rest on 7 games between the regions this season and
  11 last season, so treat them as rough").

## Elo-adjusted goals and points

Two `/leaders` boards per region weigh scoring by the defenses it came against
(`lib/engine/adjusted-scoring.ts`, DESIGN §27), with the one Elo table at the core:

- **The defenses.** A Poisson goal model over every counted final: a side's expected goals are
  `exp(μ + h·host + a·s_team + u_team − (d·s_opp + v_opp))`, where `s` is a team's Elo strength in
  goals ((Elo − 1500) / 175) and `host` is +1 at home, −1 away, 0 at a neutral site. So a team's
  defense is what its Elo rating says plus a correction `v` for the goals it has actually allowed
  (its attack likewise, with `u`); the corrections are pulled toward 0 (a normal prior, standard
  deviation 0.3 in log goals: `RIDGE_SIGMA`), so Elo decides for a team with few games. This is the
  Maher (1982) / Dixon-Coles (1997) attack-defense model with Baio-Blangiardo-style (2010)
  shrinkage, anchored on Elo instead of shrunk toward zero. The two slopes have a weak prior too
  (`SLOPE_SIGMA`), so a season of a handful of games stays near no adjustment. One penalized Newton
  solve at every build, in slug order, about 0.2 s; if it ever failed to converge, nothing would be
  adjusted and both boards' notes would say so.
- **Most Elo-adjusted goals per game** (`#adjusted-goals`, `#adjusted-goals-socal`), after the raw
  goals board. Each game counts as `exp(−defense of the opponent + h·host)` games against an average
  defense at a neutral site, and a team's adjusted rate is its goals over those weighted games, with
  one game against an average defense added to both (`SHRINK_GAMES`), at the season's rate against
  one (its goals over its weighted games, about 1.5), so a short record cannot run to an extreme.
  Without that game it is the Poisson maximum-likelihood attack given the defenses: goals over the
  goals an average team would expect against the same opponents. It counts the games the Elo fit
  counts and has the Elo board's minimum; the board prints the raw rate over the same games beside it
  (Avg).
- **Most Elo-adjusted points** (`#adjusted-points`, `#adjusted-points-socal`), after the raw points
  board. Player stats are season totals with no game-by-game split, so a player's points are
  multiplied by the team's schedule factor (the × column): its counted games over its weighted games,
  with the same one game added to both, above 1 for a harder schedule than average. Adj is Pts times
  the × as printed. Only a player whose team is past the Elo board's minimum is ranked, and the board
  names any team that enters points but is not there yet.
- **How it was chosen.** Each candidate was replayed day by day, every day's goals predicted from
  only the games before it, over this season from Sep 20 (Elo seeded from 2025-26) and over 2025-26
  from Sep 25 (unseeded). Each side of a game was scored, when its team had at least 6 earlier
  games, by Poisson log-likelihood (mean per side, higher is better) and root-mean-square error in
  goals. Unless a row says otherwise, every candidate weighs a team's games by its opponents, with a
  home edge, and adds one game at the average:

  | Opponent rated by | 2026 log-lik. | 2026 RMSE | 2025-26 log-lik. | 2025-26 RMSE |
  |---|---|---|---|---|
  | Nothing (own raw rate, no shrinkage) | −2.526 | 2.96 | −2.128 | 2.36 |
  | Its Elo alone, goals tenfold per 1000 points (an earlier draft of these boards) | −1.609 | 2.26 | −1.449 | 1.61 |
  | Its Elo alone, tenfold per 1200 points | −1.599 | 2.05 | −1.461 | 1.54 |
  | An attack-defense model with no Elo (seeded from 2025-26 in 2026) | −1.584 | 2.08 | −1.432 | 1.50 |
  | **This model** | **−1.577** | 2.17 | **−1.427** | 1.58 |
  | This model without the shrinkage | −1.620 | 2.28 | −1.463 | 1.64 |

  This model has the best likelihood in both seasons on the board's teams (6 or more games). Scored
  on every side, the no-Elo attack-defense model is ahead in 2026 (−1.579 to −1.584) and behind in
  2025-26 (−1.440 to −1.427), and on RMSE it is ahead in both seasons, as is the Elo alone at 1200
  points: so the two attack-defense models are about level, and this one is used because it builds
  on the one Elo table the site already shows, which links the leagues' few cross-league games and
  carries last season over. On the board's teams, standard deviations of 0.25-0.4 and 0.5-2 games
  of shrinkage scored within 0.01 of the chosen pair; capping each game's weight at 3, 5 or 8 games scored worse. The
  Elo constants (`lib/engine/ratings.ts`) were tuned on these same two seasons, which flatters every Elo
  row a little.
- **What it does not know.** Ratings and defenses are today's, from every counted game, the one
  being weighed included: taking each top team's own games out of both fits keeps every board's top
  two, and can reorder teams close behind (on 2026-10-15 it swapped NorCal's 3rd and 5th, 0.06 apart). At the extremes it extrapolates: a game against the strongest defense counts as less than a
  tenth of an average one and against the weakest as more than fifteen, schedule factors run from
  about 0.2 to 3, and the multiplicative form over-predicts lopsided games, so a team that played only
  very weak or very strong opponents is the least certain number on the board. A player's points are
  assumed to be spread over the team's games like its goals, so a forward who scored only in the easy
  games is credited with the team's schedule; the factor covers every counted game even where a
  coach's totals lag behind them; and points from games against schools outside the covered leagues
  (no rating, so left out of the factor) are multiplied by it too.
- **Per-game box scores were tested, and are not used.** MaxPreps publishes each team's box score
  for each game whose stats a coach entered (an undocumented `team-contest-player-stats` endpoint,
  `?teamId=&contestId=`, the season rollup's shape, listing only players who recorded a stat). On
  2026-10-15 all 518 of them were read (63 teams, 1,846 scoring lines; 481 add up to their game's
  goals, 35 list no scorer at all), and each player's points in each game were predicted from their
  points in the team's earlier games, under the same defenses (mean Poisson log-likelihood per
  player-game, 4,743 predictions with at least 3 earlier games; 4,044 with at least 5):

  | A player's points weighed by | 3+ earlier games | 5+ earlier games |
  |---|---|---|
  | Nothing (raw points) | −1.181 | −1.132 |
  | Each game's own opponent (points ÷ that game's weight) | −1.003 | −0.971 |
  | The team's schedule, over the games with stats entered | −0.968 | −0.929 |
  | **The team's schedule, over every counted game (this board)** | **−0.964** | **−0.924** |

  Weighing each game by its own opponent is the worst of the three weightings (a single goal against
  the strongest defense counts about twelve times). Blends of the two, and a softened per-game
  weight, came within 0.002 of the schedule over entered games and never beat this board, and
  counting only the games a coach has entered did not help either (the same order holds with the 35
  scorer-less box scores left out). So players' scoring is not measurably concentrated against easy
  or hard opponents beyond what their team's schedule says, and the board keeps the team's schedule
  factor: the box scores would cost about 100 more MaxPreps calls a run and 0.5 MB of data for no
  better number. The endpoint is recorded here in case they are wanted for something else, such as
  player game logs.
