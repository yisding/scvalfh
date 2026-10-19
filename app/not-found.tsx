import type { Metadata } from 'next';
import Link from 'next/link';

import PageHeader from '@/components/layout/PageHeader';
import { NAV_DESTINATIONS } from '@/views/site/nav-targets';
import { pageMetadata } from '@/views/site/page-metadata';

// No path: a 404 page has no canonical and no og:url of its own.
export const metadata: Metadata = pageMetadata({
  path: null,
  title: 'Page not found',
  ogTitle: 'Page not found',
  card: 'own',
});

/**
 * Say what is true, say what to do next (DESIGN §8). No illustration, no dashed box, and the
 * links are the real navigation rather than a single "go home": one card per top-level page
 * (the seven desktop nav destinations, the History archive among them, which covers the leagues
 * with a published 2025-26 table; the standings are on Teams, DESIGN §18), with its name over a
 * one-line description, so nothing is a sentence squeezed into a pill.
 *
 * The copy does not claim these seven are every page on the site — there are hundreds of team,
 * game and day pages — only that each of those is reachable from one of them, which is true.
 * Seven cards run two-up from sm and four-up from lg (a row of four, then three). Each card is
 * h-full so a row stays even when one description wraps in the narrower four-up column.
 */
export default function NotFound() {
  return (
    <div className="pb-section-lg">
      <PageHeader
        eyebrow="404"
        title="That page is not here."
        description="The link may be out of date, or that game or day isn’t in this season’s schedule. Every team, game and day is reachable from one of these:"
      />
      <ul className="m-0 mt-8 grid list-none gap-3 p-0 sm:grid-cols-2 md:mt-10 lg:grid-cols-4">
        {NAV_DESTINATIONS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              prefetch={false}
              className="sx-card sx-lift block h-full min-h-11 p-4 no-underline"
            >
              <span className="block text-body font-semibold text-ink">{l.cardName}</span>
              <span className="mt-0.5 block text-meta text-ink-2">{l.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
