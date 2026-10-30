import ThisWeek from '../playoffs/ThisWeek';

import type { HomeView } from './home-view';

/**
 * The home page's "This week in the postseason" (plan final-11, 2026-10-30): the strip /playoffs prints for a
 * region (components/playoffs/ThisWeek.tsx, view model buildThisWeek), above `CrossLeagueLatest` and inside the
 * always-on scope, once per region. `data-scope="all"`, unlike the latest-results block it sits over: a reader
 * whose league is remembered sees that league's panel, but the week's postseason games are across leagues (the
 * MCAL final, the SCVAL play-in, the Super Regional, the CCS seeding meeting), and the owner's brief for this
 * week is "who plays tonight and tomorrow", so the strip shows whatever league is remembered.
 * `data-region-scope` follows the reader's region (both, NorCal first, without JS). The heading id is `this-week` for NorCal (the region's `idSuffix` is
 * '') and `this-week-socal`.
 *
 * It sits outside every league panel and league card, so the per-league copy bans do not reach it, and it
 * carries no seed word (the rows' wording is final-03's) and no CCS word on the SoCal copy. Nothing renders
 * when the window holds no postseason game or event (DESIGN §8: no empty-state box). Server component.
 */
export interface HomeThisWeekProps {
  view: HomeView['thisWeek']['norcal'];
  region: { id: 'norcal' | 'socal'; idSuffix: '' | '-socal' };
  className?: string;
}

export function HomeThisWeek({ view, region, className }: HomeThisWeekProps) {
  if (view.days.length === 0) return null;
  return (
    <div data-scope="all" data-region-scope={region.id}>
      <ThisWeek view={view} id={`this-week${region.idSuffix}`} className={className} />
    </div>
  );
}

export default HomeThisWeek;
