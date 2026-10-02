import { EM_DASH, ordinal, perGame, recordString, signedGd, streakString } from '../../lib/format';
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
 * PTS sits under the league record because it is the official ordering key in all four leagues —
 * 3 for a win, 1 for a tie — which is also why PLACE is the one hero figure here. GP and MAX are
 * counts, not scores: `0/12` GP is a true count for a team with nothing reported, while MAX is a
 * ceiling, never a projection. The counting rules sit in one labelled disclosure under the tiles
 * (brief §4.22).
 */
export function TeamStatTiles({ view }: { view: TeamPageView }) {
  const { standing, hasResults, context } = view;
  const league = hasResults && standing ? standing.computed : null;
  const overall = hasResults && standing ? standing.overall : null;
  const left = context ? context.remaining : null;

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatTile
          label="Place"
          value={league ? ordinal(league.place) : null}
          sub={placeSub(view)}
          emphasis="hero"
          variant="card"
        />
        <StatTile
          label="League"
          variant="card"
          value={league ? recordString(league) : null}
          sub={league ? `${league.pts} pts · ${league.gp} played` : 'league games only'}
        />
        <StatTile
          label="GP"
          variant="card"
          value={context ? `${context.counted}/${context.scheduled}` : null}
          sub={
            left === null
              ? 'league games counted'
              : left === 0
                ? 'no league games left'
                : `${left} league ${left === 1 ? 'game' : 'games'} left`
          }
        />
        <StatTile
          label="Max"
          variant="card"
          value={context ? context.maxPts : null}
          sub="points still reachable"
        />
        <StatTile
          label="Overall"
          variant="card"
          value={overall ? recordString(overall) : null}
          sub={overall ? `${plural(overall.gp, 'game')}, all opponents` : 'all opponents'}
        />
        <StatTile
          label="Streak"
          variant="card"
          value={league ? streakString(league.streak) : null}
          sub="league games"
        />
        <StatTile
          label="Goals F / A"
          variant="card"
          value={league ? `${league.gf} / ${league.ga}` : null}
          sub={league ? `${perGame(league.gf, league.gp)} scored per game` : 'league games only'}
        />
        <StatTile
          label="Goal diff"
          variant="card"
          value={league ? signedGd(league.gd) : null}
          sub={league ? `${perGame(league.ga, league.gp)} conceded per game` : 'league games only'}
        />
      </div>
      <details className="sx-disclosure mt-3">
        <summary>How these numbers are counted</summary>
        <p className="mt-1 mb-2 max-w-prose text-meta text-ink-2">
          {`League figures count only the games that count toward the ${view.scopeLabel} table: ${view.league.doubleRoundRobin}. GP is counted results out of the ${view.leagueScheduled} scheduled; MAX is the points total if every remaining game were won. `}
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
