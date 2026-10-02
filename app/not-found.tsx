import type { Metadata } from 'next';
import Link from 'next/link';

import PageHeader from '@/components/layout/PageHeader';

export const metadata: Metadata = {
  title: 'Page not found',
};

const LINKS: Array<{ href: string; name: string; description: string }> = [
  { href: '/', name: 'Home', description: 'What just happened, and when the next game is' },
  { href: '/standings', name: 'Standings', description: 'Both divisions' },
  { href: '/schedule', name: 'Schedule & results', description: 'The whole season' },
  { href: '/teams', name: 'Teams', description: 'Find your school' },
  { href: '/playoffs', name: 'CCS playoffs', description: 'Who is in, and the key dates' },
  { href: '/history/2025-26', name: 'History', description: 'Last season’s final tables and awards' },
  { href: '/about', name: 'About', description: 'Where this data comes from' },
];

/**
 * Say what is true, say what to do next (DESIGN §8). No illustration, no dashed box, and the
 * links are the real navigation rather than a single "go home": one card per top-level page
 * (the six nav destinations plus the History archive), with its name over a one-line
 * description, so nothing is a sentence squeezed into a pill.
 *
 * The copy does not claim these seven are every page on the site — there are hundreds of team,
 * game and day pages — only that each of those is reachable from one of them, which is true.
 * Seven cards run two-up from sm and four-up from lg (a row of four, then three).
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
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              prefetch={false}
              className="sx-card sx-lift block min-h-11 p-4 no-underline"
            >
              <span className="block text-body font-semibold text-ink">{l.name}</span>
              <span className="mt-0.5 block text-meta text-ink-2">{l.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
