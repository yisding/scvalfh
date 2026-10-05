import type { Metadata } from 'next';
import Link from 'next/link';

import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import JvStandings from '../../components/standings/JvStandings';
import { buildJvTablesView } from '../../components/standings/jv-standings-view';
import Arrow from '../../components/ui/Arrow';
import SectionHeader from '../../components/ui/SectionHeader';
import { listWords } from '../../lib/format';
import { LEAGUES } from '../../lib/leagues';

/**
 * `/jv` — "Where does our JV stand?" Every league's JV tables, computed (lib/jv-standings.ts) and
 * unofficial: one section per league (`#scval`, …), one block per division (`#de-anza`, …).
 *
 * Its own page rather than a section of `/standings/<league>`: those pages carry the varsity tables
 * at their weight budget, and the JV tables are a different kind of claim (no league publishes one
 * in season; a JV league game is identified by its varsity counterpart; a table appears only once
 * enough of its games have a score), which this page states once at the top. Each league standings
 * page links here (`/jv#<league>`), and a team page's JV header links its division (`/jv#<division>`).
 *
 * One static page, no params, nothing derived from `Date.now()`.
 */

const SHORT_NAMES = listWords(LEAGUES.map((l) => l.shortName));
const PAGE_TITLE = 'JV standings';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: `Girls junior varsity field hockey standings for ${SHORT_NAMES}, unofficial: computed from MaxPreps' JV results (si.com filling gaps), shown for each division once enough of its JV league games have a score.`,
  alternates: { canonical: '/jv' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/jv' },
};

export default function JvStandingsPage() {
  return (
    <div className="pb-section-lg">
      <PageHeader
        title={PAGE_TITLE}
        description="Junior varsity league games only · computed from published results · unofficial"
      />
      <p className="m-0 mt-4 max-w-prose text-body text-ink-2">
        No league publishes JV standings during the season, so these are computed: a JV game counts when
        its varsity counterpart (the same two schools within three days) counts for the varsity table, or
        when it matches a fixture on the league&rsquo;s official schedule. Teams are ordered on points (3 a
        win, 1 a tie), and teams level on points share a place. A division&rsquo;s table appears once enough
        of its JV league games played so far have a score.{' '}
        <Link href="/about#jv" prefetch={false} className="font-medium text-accent hover:underline">
          How JV tables are built <Arrow />
        </Link>
      </p>
      {LEAGUES.map((league, index) => (
        <section
          key={league.id}
          id={league.id}
          aria-labelledby={`${league.id}-heading`}
          className={index === 0 ? 'mt-8 scroll-mt-24 md:mt-10' : 'mt-section scroll-mt-24 md:mt-section-lg'}
        >
          <SectionHeader
            id={`${league.id}-heading`}
            kicker={`${league.shortName} JV`}
            action={{ href: `/standings/${league.id}`, label: 'Varsity table' }}
          />
          <JvStandings views={buildJvTablesView(league.id)} multi={league.divisions.length > 1} />
        </section>
      ))}
    </div>
  );
}
