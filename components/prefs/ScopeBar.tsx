import LeagueSwitcher, { RegionSwitcher, type LeagueSwitcherProps } from './LeagueSwitcher';
import { SINGLE_REGION } from './single-region';

/**
 * The scope row under a page header (DESIGN §33): the region tabs, a divider, the league tabs, and an
 * optional trailing slot (a compact team finder, a "Today" link). One row at every width: it never
 * wraps, it scrolls sideways inside its own box with no scrollbar, and the region group comes first.
 * A server component; the two switchers are the client ones, unchanged, and each brings its selected
 * tab into view on mount.
 *
 * Nothing renders when there is nothing to choose: a one-region build with one league and no `end`.
 */
export interface ScopeBarProps {
  /** Show the NorCal/SoCal tabs (a one-region build never does). Default true. */
  region?: boolean;
  /** The league tabs' props, or none. A list of fewer than two leagues is not a choice and is dropped. */
  league?: LeagueSwitcherProps | null;
  /** A trailing control, pushed to the row's end. */
  end?: React.ReactNode;
  className?: string;
}

export function ScopeBar({ region = true, league, end, className }: ScopeBarProps) {
  const showRegion = region && !SINGLE_REGION;
  const leagueProps = league && league.leagues.length > 1 ? league : null;
  if (!showRegion && !leagueProps && !end) return null;
  return (
    <div className={['sx-scope sx-print-hide', className].filter(Boolean).join(' ')}>
      {showRegion ? <RegionSwitcher /> : null}
      {showRegion && leagueProps ? <span className="sx-scope-sep" aria-hidden="true" /> : null}
      {leagueProps ? <LeagueSwitcher {...leagueProps} /> : null}
      {end ? <div className="sx-scope-end">{end}</div> : null}
    </div>
  );
}

export default ScopeBar;
