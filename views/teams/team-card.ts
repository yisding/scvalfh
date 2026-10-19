/**
 * What the per-team OG card (components/og/TeamCard.tsx; route:
 * app/teams/[slug]/opengraph-image.tsx) prints, from the team page's own view (SPEC §8.4): the
 * identity and place lines, the six stats, the last and next game lines, and the as-of footer.
 *
 * A team with no reported results is never placed and prints an em dash in every stat, never
 * `0-0-0` — a shared link is the most damaging place to get the never-0-0 rule wrong (DESIGN §5.3).
 * Both game lines come from `gameHeadline`, which is built on `describeGame`, so the card cannot
 * disagree with the page it belongs to.
 */

import { getFetchedAt } from '@/lib/datasets/snapshot';
import { ordinal, recordString, signedGd, streakString } from '@/lib/format/numbers';
import { EM_DASH } from '@/lib/format/words';
import type { StandingContext } from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';
import { nextOfficialFixture } from '@/views/shared/official-fixtures';
import { asOfLeagueGamesWords } from '@/views/site/og-theme';

import { type TeamPageView, gameHeadline, officialFixtureHeadline, placeScope } from './team-view';

/**
 * GP as the site prints it: `6/12`, or the bare count where the league has no fixed schedule (the
 * Sunset: no "of N"). The team page's GP tile (components/teams/TeamStatTiles.tsx) and the card.
 */
export function gamesPlayedText(context: Pick<StandingContext, 'counted' | 'scheduled'>): string {
  return context.scheduled === null ? `${context.counted}` : `${context.counted}/${context.scheduled}`;
}

export interface TeamCardModel {
  team: Pick<Team, 'name' | 'abbr' | 'colors'>;
  /** `Red-Tailed Hawks · MCAL · Mill Valley` */
  identityLine: string;
  /** `3rd of 8 in De Anza (tied)` | `No results reported yet` */
  placeLine: string;
  record: string;
  points: string;
  gp: string;
  goals: string;
  diff: string;
  streak: string;
  /** `L 0–7 vs Saint Francis` | `No results reported` */
  lastLine: string;
  /** The next contest, else the next official-schedule fixture, else `No games left on the published schedule`. */
  nextLine: string;
  /** `As of … · league games only · unofficial` */
  asOf: string;
}

export function teamCardModel(view: TeamPageView): TeamCardModel {
  const { team, standing, hasResults, last, next } = view;
  const known = hasResults && standing ? standing : null;
  // `<place> of <N> in <division heading or league short>`; a team with no results is never
  // placed (SPEC §8.4). A shared place is a real tiebreak outcome, so it says so.
  const placeLine = known
    ? `${ordinal(known.computed.place)} ${placeScope(view.divisionSize, view.scopeLabel)}${
        known.tiebreak.shared ? ' (tied)' : ''
      }`
    : 'No results reported yet';
  const upcomingFixture = next ? null : nextOfficialFixture(view.officialFixtures, view.today);
  return {
    team,
    identityLine: view.identityLine,
    placeLine,
    record: known ? recordString(known.computed) : EM_DASH,
    points: known ? `${known.computed.pts}` : EM_DASH,
    gp: view.context ? gamesPlayedText(view.context) : EM_DASH,
    goals: known ? `${known.computed.gf} / ${known.computed.ga}` : EM_DASH,
    diff: known ? signedGd(known.computed.gd) : EM_DASH,
    streak: known ? streakString(known.computed.streak) : EM_DASH,
    lastLine: last ? gameHeadline(last, team) : 'No results reported',
    nextLine: next
      ? gameHeadline(next, team)
      : upcomingFixture
        ? officialFixtureHeadline(upcomingFixture, team)
        : 'No games left on the published schedule',
    asOf: asOfLeagueGamesWords(getFetchedAt()),
  };
}
