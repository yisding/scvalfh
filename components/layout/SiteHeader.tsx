import Link from 'next/link';

import { getSitePhase } from '../../lib/data';
import type { LeagueId, TeamSlug } from '../../lib/types';

import { SearchGlyph } from '../ui/glyphs';
import LastUpdated from './LastUpdated';
import { WORDMARK_SHORT, WORDMARK_TAIL } from './site';
import TopNav from './TopNav';

/**
 * The header (DESIGN §33): a solid navy band, 48px below 768 and 64px from 768, that holds exactly
 * three things: the wordmark (the home link), the nav and the team search. The wordmark and the
 * search never shrink and the nav scrolls inside its own box if it must, so nothing in the row can
 * truncate or wrap at any width or text scale. tests/ui/header-fit.test.ts holds the measured widths
 * for all three sports. Every colour in it is a `--sx-band-*` token (app/globals.css `.sx-mast`).
 *
 * The team search is a plain GET form to /teams (`?q=`), so it works with no script: the finder on
 * /teams reads `q` and filters. From 1024 it is a field; below that a 44px magnifier link to /teams,
 * where the finder is the first thing on the page.
 *
 * There is no freshness stamp, theme control or region control here. "Updated 3:42 PM" is beside the
 * scores (the live board's head, else the league row) and in the footer. Only when the data is stale
 * (and some league is still playing) does a bordered notice appear under the band. It is not sticky,
 * so the sticky stack every offset is measured against (--sx-sticky-top, html's scroll-padding-top)
 * stays the 48/64px band.
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
            <span className="sx-wordmark-tail">
              {' '}
              {WORDMARK_TAIL}
            </span>
          </Link>
          <TopNav className="sx-mast-nav" slugLeague={slugLeague} />
          <span className="sx-mast-end">
            <form className="sx-mast-search" role="search" action="/teams" method="get">
              <label className="sr-only" htmlFor="mast-q">
                Find a team
              </label>
              <SearchGlyph size={15} />
              <input id="mast-q" type="search" name="q" placeholder="Find a team" autoComplete="off" />
            </form>
            <Link href="/teams" prefetch={false} className="sx-mast-find" aria-label="Find a team">
              <SearchGlyph size={18} />
            </Link>
          </span>
        </div>
      </header>
      {/* Renders nothing unless the snapshot is over 36 hours old while a league is still playing. */}
      <LastUpdated variant="strip" at={snapshotAt} now={now} seasonComplete={getSitePhase() === 'complete'} />
    </>
  );
}

export default SiteHeader;
