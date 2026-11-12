import LeagueSwitcher, { RegionSwitcher, type LeagueSwitcherProps } from './LeagueSwitcher';
import { SINGLE_REGION } from './single-region';

/**
 * The league row under a page header (DESIGN §33): the league tabs, then the util part
 * (`.sx-scope-util`) = the region switch (multi-region builds) and the short "Updated 3:42 PM" stamp,
 * then an optional row of native selects (`end`).
 *
 * From 768 the util part sits at the row's end, reading "Updated 3:42 PM  [NorCal|SoCal]". Below 768
 * it is its own 44px line ABOVE the tabs (region first, then that region's leagues), switch at the
 * left and stamp at the right. The order is CSS (`order`, `row-reverse`); the DOM is tabs, switch,
 * stamp. The tabs wrap like text if they must; nothing scrolls sideways. This is the ONLY place the
 * region switch is drawn.
 *
 * A server component; the two switchers are the client ones. Nothing renders when there is nothing
 * to show: a one-region build with one league, no stamp and no `end`.
 */
export interface ScopeBarProps {
  /** Show the NorCal/SoCal switch (a one-region build never does). Default true. */
  region?: boolean;
  /** The league tabs' props, or none. A list of fewer than two leagues is not a choice and is dropped. */
  league?: LeagueSwitcherProps | null;
  /**
   * `<LastUpdated variant="time" … />`. Every page that renders a ScopeBar passes it, EXCEPT the
   * Scores page while it shows a live board (the board's head carries the stamp then).
   */
  stamp?: React.ReactNode;
  /** A row of native selects (team, division), under everything. */
  end?: React.ReactNode;
  className?: string;
}

export function ScopeBar({ region = true, league, stamp, end, className }: ScopeBarProps) {
  const showRegion = region && !SINGLE_REGION;
  const leagueProps = league && league.leagues.length > 1 ? league : null;
  if (!showRegion && !leagueProps && !stamp && !end) return null;
  return (
    <div className={['sx-scope sx-print-hide', className].filter(Boolean).join(' ')}>
      {leagueProps ? <LeagueSwitcher {...leagueProps} /> : null}
      {showRegion || stamp ? (
        <span className="sx-scope-util">
          {showRegion ? <RegionSwitcher /> : null}
          {stamp}
        </span>
      ) : null}
      {end ? <div className="sx-scope-end">{end}</div> : null}
    </div>
  );
}

export default ScopeBar;
