import type { Metadata } from 'next';
import Link from 'next/link';

import { OG_BASE } from '../components/layout/site';
import { listWords, numberWord } from '../lib/format';
import { getAvailableHistoryLeagues } from '../lib/history/history';
import { LEAGUES_PROPER, getLeague } from '../lib/leagues';
import { IS_BASKETBALL } from '../lib/sports/current';

export const metadata: Metadata = {
  title: 'Page not found',
  // Stated, not inherited: an inherited og:title is the templated one, with the site-name suffix
  // that no og:title carries (components/layout/site.ts OG_BASE).
  openGraph: { ...OG_BASE, title: 'Page not found' },
};

/**
 * 'the nine leagues', from the config (never a literal count). It named every league ('SCVAL, BVAL, PCAL,
 * MCAL and EAL') while there were five; with nine across two regions the list outgrew a one-line
 * description, so the count stands in for it (the Teams page itself lists them, region by region). It counts
 * the leagues with a table: the LA independents have none (DESIGN §24.9), so "every table in
 * the nine leagues" stays exact.
 */
const LEAGUE_COUNT = LEAGUES_PROPER.length === 1 ? LEAGUES_PROPER[0].shortName : `the ${numberWord(LEAGUES_PROPER.length)} leagues`;

const LINKS: Array<{ href: string; name: string; description: string }> = [
  { href: '/', name: 'Home', description: 'What just happened, and when the next game is' },
  { href: '/schedule', name: 'Schedule & results', description: 'Every league’s season' },
  { href: '/teams', name: 'Teams and standings', description: `Find your school; every table in ${LEAGUE_COUNT}` },
  { href: '/leaders', name: 'Season leaders', description: IS_BASKETBALL ? 'Top scorers, records and ratings' : 'Top scorers, keepers and records, every league' },
  { href: '/playoffs', name: 'Playoffs', description: 'Who is in, and the key dates' },
  {
    href: '/history/2025-26',
    name: 'History',
    description: `Last season’s final ${listWords(getAvailableHistoryLeagues().map((l) => getLeague(l.id).shortName))} tables and awards`,
  },
  { href: '/about', name: 'About', description: 'Where this data comes from' },
];

/**
 * Say what is true, say what to do next (DESIGN §8). No illustration, and the links are the real
 * navigation rather than a single "go home": one row per top-level page, its name over a one-line
 * description, in ruled columns.
 *
 * The copy does not claim these seven are every page on the site — there are hundreds of team,
 * game and day pages — only that each of those is reachable from one of them, which is true.
 * No freshness stamp: nothing on this page is data.
 */
export default function NotFound() {
  return (
    <div className="pb-section-lg">
      <header className="sx-pagehead">
        <h1 className="m-0 text-h1 text-ink">That page is not here.</h1>
        <p className="sx-dateline">
          The link may be out of date, or that game or day isn’t in this season’s schedule. Every team, game and day
          is reachable from one of these:
        </p>
      </header>
      <ul className="sx-auto m-0 mt-6 list-none border-t-2 border-ink p-0">
        {LINKS.map((l) => (
          <li key={l.href} className="border-b border-hairline">
            <Link href={l.href} prefetch={false} className="block py-3 no-underline">
              <span className="block text-body font-bold text-ink">{l.name}</span>
              <span className="mt-0.5 block text-meta text-ink-2">{l.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
