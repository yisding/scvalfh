import { EM_DASH, ordinal, perGame, recordString, signedGd, streakString } from '../../lib/format';
import StatTile from '../ui/StatTile';
import type { TeamPageView } from './team-view';
import { placeSub } from './team-view';

/**
 * The headline numbers (DESIGN §3.7, §7.7): six tiles, 3-up on a phone and 6-up from 768px.
 *
 * Every tile keeps its full footprint when the value is missing, so the row never reflows, and a
 * team with no reported results shows an em dash in every tile rather than a zero — `0` and
 * `null` are told apart everywhere on this site (DESIGN §5.3, §8). The genuine-zero teams
 * (Cupertino, Homestead and Monta Vista in league play) therefore read `0 / 23` and `0.0` scored
 * per game in full-strength ink: nothing is hidden because it is unflattering.
 *
 * PTS sits under the league record because it is the official ordering key — 3 for a win, 1 for a
 * tie (By-Laws Article VI §2), which is also why PLACE is the one hero figure here.
 *
 * Deviation from the §3.7 wireframe: it splits these six into two rows of three with LAST and NEXT
 * between them. They are kept together so the desktop row is one 6-up band, and the fold still
 * holds on a 390x664 phone: 44 top bar + 84 identity + 2x76 tiles + 100 LAST + 104 NEXT = 484 of
 * the 604px available, so LAST and NEXT are both still above the fold.
 */
export function TeamStatTiles({ view }: { view: TeamPageView }) {
  const { standing, hasResults } = view;
  const league = hasResults && standing ? standing.computed : null;
  const overall = hasResults && standing ? standing.overall : null;

  return (
    <div className="mt-4 border-t border-hairline pt-3">
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        <StatTile
          label="Place"
          value={league ? ordinal(league.place) : null}
          sub={placeSub(view)}
          emphasis="hero"
        />
        <StatTile
          label="League"
          value={league ? recordString(league) : null}
          sub={league ? `${league.pts} pts · ${league.gp} played` : 'league games only'}
        />
        <StatTile
          label="Overall"
          value={overall ? recordString(overall) : null}
          sub={overall ? `${overall.gp} games, all opponents` : 'all opponents'}
        />
        <StatTile
          label="Streak"
          value={league ? streakString(league.streak) : null}
          sub="league games"
        />
        <StatTile
          label="Goals F / A"
          value={league ? `${league.gf} / ${league.ga}` : null}
          sub={league ? `${perGame(league.gf, league.gp)} scored per game` : 'league games only'}
        />
        <StatTile
          label="Goal diff"
          value={league ? signedGd(league.gd) : null}
          sub={league ? `${perGame(league.ga, league.gp)} conceded per game` : 'league games only'}
        />
      </div>
      <p className="mt-3 mb-0 max-w-[62ch] text-meta text-ink-3">
        League figures count division games only (By-Laws Article VI §1). A real 0 shows as{' '}
        <span className="sx-num">0</span>; a number we do not have shows as{' '}
        <span aria-hidden="true">{EM_DASH}</span>
        <span className="sr-only">an em dash</span>. Forfeits count in W-L-T but not in goals.
      </p>
    </div>
  );
}

export default TeamStatTiles;
