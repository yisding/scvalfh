import type { Metadata } from 'next';
import Link from 'next/link';

import PageHeader from '@/components/layout/PageHeader';
import { LEAGUES } from '@/lib/leagues';

export const metadata: Metadata = {
  title: 'Page not found',
};

/** 'SCVAL, BVAL, PCAL and MCAL', from the config (never a literal list). */
const LEAGUE_LIST = LEAGUES.map((l) => l.shortName).reduce(
  (acc, name, i, all) => (i === 0 ? name : `${acc}${i === all.length - 1 ? ' and ' : ', '}${name}`),
  '',
);

const LINKS: Array<{ href: string; name: string; description: string }> = [
  { href: '/', name: 'Home', description: 'What just happened, and when the next game is' },
  { href: '/standings', name: 'Standings — every league', description: `${LEAGUE_LIST} tables` },
  { href: '/schedule', name: 'Schedule & results', description: 'Every league’s season' },
  { href: '/teams', name: 'Find a team', description: 'Search by school, city or mascot' },
  { href: '/playoffs', name: 'Playoffs', description: 'Who is in, and the key dates' },
  { href: '/about', name: 'About', description: 'Where this data comes from' },
];

/**
 * Say what is true, say what to do next (DESIGN §8). No illustration, no dashed box, and the
 * links are the real navigation rather than a single "go home": one card per page, with its
 * name over a one-line description, so nothing is a sentence squeezed into a pill.
 */
export default function NotFound() {
  return (
    <div className="pb-section-lg">
      <PageHeader
        eyebrow="404"
        title="That page is not here."
        description="The link may be old, or the game or date may not exist in this season’s data. Every page on this site is one of the links below."
      />
      <ul className="m-0 mt-8 grid list-none gap-3 p-0 sm:grid-cols-2 md:mt-10 lg:grid-cols-3">
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
