import type { Metadata } from 'next';
import Link from 'next/link';

import { NAV_LABELS, OG_BASE } from '../components/layout/site';

export const metadata: Metadata = {
  title: 'Page not found',
  // Stated, not inherited: an inherited og:title is the templated one, with the site-name suffix
  // that no og:title carries (components/layout/site.ts OG_BASE).
  openGraph: { ...OG_BASE, title: 'Page not found' },
};

/**
 * Say what is true, then the way on (DESIGN §33): a title, one sentence and three links. Every team, game and day
 * is reachable from Scores or Standings, and the header and footer above and below carry the rest of
 * the navigation. No freshness stamp: nothing on this page is data.
 */
export default function NotFound() {
  return (
    <div className="pb-section-lg">
      <header className="sx-pagehead">
        <h1 className="m-0 text-h1 text-ink">Page not found</h1>
      </header>
      <p className="m-0 text-body text-ink-2">Nothing on this site is at that address.</p>
      {/* The header above and the footer below carry the full navigation as buttons and links already:
          the way on is three plain links, not a second set of buttons. */}
      <ul className="sx-linkrow">
        <li>
          <Link href="/" prefetch={false} className="sx-action">
            {NAV_LABELS.scores}
          </Link>
        </li>
        <li>
          <Link href="/standings" prefetch={false} className="sx-action">
            {NAV_LABELS.standings}
          </Link>
        </li>
        <li>
          <Link href="/teams" prefetch={false} className="sx-action">
            Find a team
          </Link>
        </li>
      </ul>
    </div>
  );
}
