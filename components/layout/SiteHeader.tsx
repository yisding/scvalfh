import Link from 'next/link';

import { getSitePhase } from '../../lib/data';
import type { LeagueId, TeamSlug } from '../../lib/types';

import ThemeToggle from '../prefs/ThemeToggle';
import LastUpdated from './LastUpdated';
import { WORDMARK_SHORT, WORDMARK_TAIL, WORDMARK_TAIL_ABBR } from './site';
import TopNav from './TopNav';

/**
 * The masthead (DESIGN §33). One sticky row, 48px below 768 and 64px from 768, that holds exactly
 * three things: the wordmark (the home link), the nav and the theme button. Every one of them is a
 * fixed-width word or a 44px button; the wordmark and the button never shrink and the nav scrolls
 * inside its own box if it must, so nothing in the row can truncate or wrap at any width or text
 * scale. tests/ui/header-fit.test.ts holds the measured widths for all three sports.
 *
 * The freshness stamp is not here: it is a sentence in every page header (PageHeader → Dateline) and
 * in the footer. Only when the data is stale (and some league is still playing) does a yellow strip
 * appear under the bar. It is not sticky, so the sticky stack every offset is measured against
 * (--sx-sticky-top, html's scroll-padding-top) stays the 48/64px bar.
 *
 * The home link's accessible name always starts with its visible label (WCAG 2.5.3): at 768–1023 the
 * initials are visible and the full tail is visually hidden, so the name is "NorCal HS FH Field
 * Hockey"; elsewhere the initials are `display: none` and it is "NorCal HS Field Hockey".
 */
export interface SiteHeaderProps {
  /** ISO UTC instant — `snapshot.fetchedAt`. */
  snapshotAt: string;
  /** The instant staleness is measured against (the build instant). Omit to never show stale. */
  now?: string;
  /** `{ slug: league }` for every team, so the nav can follow the page's league (SPEC §8.3). */
  slugLeague?: Readonly<Record<TeamSlug, LeagueId>>;
}

export function SiteHeader({ snapshotAt, now, slugLeague }: SiteHeaderProps) {
  return (
    <>
      <header className="sx-chrome-top sx-mast">
        <div className="sx-mast-row">
          <Link href="/" prefetch={false} className="sx-wordmark">
            <span>{WORDMARK_SHORT}</span>
            <span className="sx-wordmark-abbr">
              {' '}
              {WORDMARK_TAIL_ABBR}
            </span>
            <span className="sx-wordmark-tail">
              {' '}
              {WORDMARK_TAIL}
            </span>
          </Link>
          <TopNav className="sx-mast-nav" slugLeague={slugLeague} />
          <span className="sx-mast-end">
            <ThemeToggle />
          </span>
        </div>
      </header>
      {/* Renders nothing unless the snapshot is over 36 hours old while a league is still playing. */}
      <LastUpdated variant="strip" at={snapshotAt} now={now} seasonComplete={getSitePhase() === 'complete'} />
    </>
  );
}

export default SiteHeader;
