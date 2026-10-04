import type { Metadata } from 'next';
import Link from 'next/link';

import PageHeader from '@/components/layout/PageHeader';
import { listWords } from '@/lib/format';
import { getAvailableHistoryLeagues } from '@/lib/history';
import { LEAGUES, getLeague } from '@/lib/leagues';

export const metadata: Metadata = {
  title: 'Page not found',
};

/** 'SCVAL, BVAL, PCAL, MCAL and EAL', from the config (never a literal list). */
const LEAGUE_LIST = LEAGUES.map((l) => l.shortName).reduce(
  (acc, name, i, all) => (i === 0 ? name : `${acc}${i === all.length - 1 ? ' and ' : ', '}${name}`),
  '',
);

const LINKS: Array<{ href: string; name: string; description: string }> = [
  { href: '/', name: 'Home', description: 'What just happened, and when the next game is' },
  { href: '/schedule', name: 'Schedule & results', description: 'Every league’s season' },
  { href: '/teams', name: 'Teams and standings', description: `Find your school; every ${LEAGUE_LIST} table` },
  { href: '/leaders', name: 'Season leaders', description: 'Top scorers, keepers and records, every league' },
  { href: '/playoffs', name: 'Playoffs', description: 'Who is in, and the key dates' },
  {
    href: '/history/2025-26',
    name: 'History',
    description: `Last season’s final ${listWords(getAvailableHistoryLeagues().map((l) => getLeague(l.id).shortName))} tables and awards`,
  },
  { href: '/about', name: 'About', description: 'Where this data comes from' },
];

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
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              prefetch={false}
              className="sx-card sx-lift block h-full min-h-11 p-4 no-underline"
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
