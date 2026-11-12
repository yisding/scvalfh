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
 * Say what is true, then the way on (DESIGN §33): a title and two buttons. Every team, game and day
 * is reachable from Scores or Standings, and the header and footer above and below carry the rest of
 * the navigation. No freshness stamp: nothing on this page is data.
 */
export default function NotFound() {
  return (
    <div className="pb-section-lg">
      <header className="sx-pagehead">
        <h1 className="m-0 text-h1 text-ink">Page not found</h1>
      </header>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/" prefetch={false} className="sx-btn">
          {NAV_LABELS.scores}
        </Link>
        <Link href="/standings" prefetch={false} className="sx-btn">
          {NAV_LABELS.standings}
        </Link>
      </div>
    </div>
  );
}
