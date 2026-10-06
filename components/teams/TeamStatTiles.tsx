import { EM_DASH, perGame, placeMark, placeWords, recordString, signedGd, streakString } from '../../lib/format';
import { plural } from '../ui/plural';
import StatTile from '../ui/StatTile';
import type { TeamPageView } from './team-view';
import { placeSub } from './team-view';

/**
 * The headline numbers (DESIGN §3.7, §7.7, SPEC §10.5): eight card tiles, 2-up on a phone and
 * 4-up from 768px — Place (`<place> of <N> in <division heading ?? league short>`), the league
 * record, GP (`<counted>/<scheduled>`) and MAX (the points ceiling, `pts + win × games left`, from
 * `getStandingContext`), then overall, streak and goals.
 *
 * Every tile keeps its full footprint when the value is missing, so the row never reflows, and a
 * team with no reported results shows an em dash in every tile rather than a zero — `0` and
 * `null` are told apart everywhere on this site (DESIGN §5.3, §8). The genuine-zero teams
 * (Cupertino, Homestead and Monta Vista in league play) therefore read `0 / 23` and `0.0` scored
 * per game in full-strength ink: nothing is hidden because it is unflattering.
 *
 * PTS sits under the league record because it orders the table in every league (3 for a win, 1
 * for a tie; the EAL uses points to decide its title and publishes no standings, so this site orders it
 * the same way) — which is also why PLACE is the one hero figure here. GP and MAX are
 * counts, not scores: `0/12` GP is a true count for a team with nothing reported, while MAX is a
 * ceiling, never a projection.
 *
 * Placement follows the §3.7 wireframe's priority: LAST and NEXT come first, then these tiles, as
 * one full-width band after the pair (the caller places them and passes `className` for the gap).
 * The place itself is not lost by moving them down: the identity card's second meta line states
 * it. The counting rules are generic boilerplate, so they sit in one labelled disclosure under the
 * tiles (brief §4.22).
 *
 * The tiles are a `<dl>` of StatTile groups: eight label/value pairs, announced as such. The two
 * values that only read well to the eye carry a spoken form: Streak "L5" is "5 losses in a row",
 * Goals F / A "0 / 52" is "0 for, 52 against".
 */
const STREAK_WORD = { W: ['win', 'wins'], L: ['loss', 'losses'], T: ['tie', 'ties'] } as const;

export interface TeamStatTilesProps {
  view: TeamPageView;
  className?: string;
}

export function TeamStatTiles({ view, className }: TeamStatTilesProps) {
  const { standing, hasResults, context } = view;
  const league = hasResults && standing ? standing.computed : null;
  const overall = hasResults && standing ? standing.overall : null;
  const left = context ? context.remaining : null;
  const streak = league?.streak ?? null;
  // A level place reads `T-7th` with "tied for 7th" spoken, exactly as the identity card says it.
  const sharedPlace = league !== null && (standing?.tiebreak.shared ?? false);
  const streakSpoken = streak
    ? `${plural(streak.count, STREAK_WORD[streak.result][0], STREAK_WORD[streak.result][1])} in a row`
    : undefined;

  return (
    <div className={className}>
      <dl className="m-0 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatTile
          label="Place"
          value={league ? placeMark(league.place, sharedPlace, 'pill') : null}
          srValue={league && sharedPlace ? placeWords(league.place, true) : undefined}
          sub={placeSub(view)}
          emphasis="hero"
        />
        <StatTile
          label="League"
          value={league ? recordString(league) : null}
          sub={league ? `${league.pts} pts · ${league.gp} played` : 'league games only'}
        />
        {/* A league with no fixed schedule (the Sunset, gamesPerTeam null) has no "of N": GP is the
            bare count, and MAX, a ceiling over the games left, has nothing to count (DESIGN-socal §2.1.7). */}
        <StatTile
          label="GP"
          value={context ? (context.scheduled === null ? context.counted : `${context.counted}/${context.scheduled}`) : null}
          sub={
            left === null
              ? 'league games counted'
              : left === 0
                ? 'no league games left'
                : `${plural(left, 'league game')} left`
          }
        />
        <StatTile
          label="Max"
          value={context ? context.maxPts : null}
          sub={context && context.maxPts === null ? 'no fixed league schedule' : 'points still reachable'}
        />
        <StatTile
          label="Overall"
          value={overall ? recordString(overall) : null}
          sub={overall ? `${plural(overall.gp, 'game')}, all opponents` : 'all opponents'}
        />
        <StatTile
          label="Streak"
          value={league ? streakString(league.streak) : null}
          srValue={streakSpoken}
          sub="league games"
        />
        <StatTile
          label="Goals F / A"
          srLabel="Goals for and against"
          value={league ? `${league.gf} / ${league.ga}` : null}
          srValue={league ? `${league.gf} for, ${league.ga} against` : undefined}
          sub={league ? `${perGame(league.gf, league.gp)} scored per game` : 'league games only'}
        />
        <StatTile
          label="Goal diff"
          value={league ? signedGd(league.gd) : null}
          sub={league ? `${perGame(league.ga, league.gp)} conceded per game` : 'league games only'}
        />
      </dl>
      <details className="sx-disclosure mt-3">
        <summary>How these numbers are counted</summary>
        <p className="mt-1 mb-2 max-w-prose text-meta text-ink-2">
          {`League figures count only the games that count toward the ${view.scopeLabel} table: ${view.league.doubleRoundRobin}. ${
            view.leagueScheduled === null
              ? 'GP is counted results; with no fixed number of league games there is no MAX. '
              : `GP is counted results out of the ${view.leagueScheduled} scheduled; MAX is the points total if every remaining game were won. `
          }`}
          A real 0 shows as{' '}
          <span className="sx-num">0</span>; a number we do not have shows as{' '}
          <span aria-hidden="true">{EM_DASH}</span>
          <span className="sr-only">an em dash</span>. Forfeits count in W-L-T but not in goals.
        </p>
      </details>
    </div>
  );
}

export default TeamStatTiles;
