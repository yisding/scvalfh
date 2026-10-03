import { EM_DASH, ordinal, perGame, recordString, signedGd, streakString } from '../../lib/format';
import StatTile from '../ui/StatTile';
import type { TeamPageView } from './team-view';
import { placeSub } from './team-view';

/**
 * The headline numbers (DESIGN §3.7, §7.7): six card tiles, 2-up on a phone, 3-up from 768px and
 * one 6-up band from 1280px. (The brief's 6-up from 1024px left 151px tiles whose subs all wrapped
 * to two lines; two rows of three fit them on one.)
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
 * Placement follows the §3.7 wireframe's priority: LAST and NEXT come first, then these tiles. The
 * wireframe splits the six into two rows of three with LAST and NEXT between them; they are kept
 * together instead, after the pair, so the desktop row is one full-width 6-up band (`md:col-span-2`
 * in the team page's grid) rather than two half bands. The place itself is not lost by moving
 * them down: the identity card's meta line states it. The counting rules are generic
 * boilerplate, so they sit in one labelled disclosure under the tiles (brief §4.22).
 *
 * The tiles are a `<dl>` (StatTile `inList`): six label/value pairs, announced as such. The two
 * values that only read well to the eye carry a spoken form: Streak "L5" is "5 losses in a row",
 * Goals F / A "0 / 52" is "0 for, 52 against".
 */
const STREAK_WORD = { W: ['win', 'wins'], L: ['loss', 'losses'], T: ['tie', 'ties'] } as const;

export function TeamStatTiles({ view, className }: { view: TeamPageView; className?: string }) {
  const { standing, hasResults } = view;
  const league = hasResults && standing ? standing.computed : null;
  const overall = hasResults && standing ? standing.overall : null;
  const streak = league?.streak ?? null;
  const streakSpoken = streak
    ? `${streak.count} ${STREAK_WORD[streak.result][streak.count === 1 ? 0 : 1]} in a row`
    : undefined;

  return (
    <div className={className}>
      <dl className="m-0 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
        <StatTile
          label="Place"
          value={league ? ordinal(league.place) : null}
          sub={placeSub(view)}
          emphasis="hero"
          variant="card"
          inList
        />
        <StatTile
          label="League"
          variant="card"
          inList
          value={league ? recordString(league) : null}
          sub={league ? `${league.pts} pts · ${league.gp} played` : 'league games only'}
        />
        <StatTile
          label="Overall"
          variant="card"
          inList
          value={overall ? recordString(overall) : null}
          sub={overall ? `${overall.gp} games, all opponents` : 'all opponents'}
        />
        <StatTile
          label="Streak"
          variant="card"
          inList
          value={league ? streakString(league.streak) : null}
          srValue={streakSpoken}
          sub="league games"
        />
        <StatTile
          label="Goals F / A"
          srLabel="Goals for and against"
          variant="card"
          inList
          value={league ? `${league.gf} / ${league.ga}` : null}
          srValue={league ? `${league.gf} for, ${league.ga} against` : undefined}
          sub={league ? `${perGame(league.gf, league.gp)} scored per game` : 'league games only'}
        />
        <StatTile
          label="Goal diff"
          variant="card"
          inList
          value={league ? signedGd(league.gd) : null}
          sub={league ? `${perGame(league.ga, league.gp)} conceded per game` : 'league games only'}
        />
      </dl>
      <details className="sx-disclosure mt-3">
        <summary>How these numbers are counted</summary>
        <p className="mt-1 mb-2 max-w-prose text-meta text-ink-2">
          League figures count division games only (By-Laws Article VI §1). A real 0 shows as{' '}
          <span className="sx-num">0</span>; a number we do not have shows as{' '}
          <span aria-hidden="true">{EM_DASH}</span>
          <span className="sr-only">an em dash</span>. Forfeits count in W-L-T but not in goals.
        </p>
      </details>
    </div>
  );
}

export default TeamStatTiles;
