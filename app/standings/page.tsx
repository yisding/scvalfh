import type { Metadata } from 'next';
import Link from 'next/link';

import DivisionStandings from '@/components/standings/DivisionStandings';
import DivisionTabs from '@/components/standings/DivisionTabs';
import ExternalLink from '@/components/ui/ExternalLink';
import LastUpdated from '@/components/ui/LastUpdated';
import { OG_BASE } from '@/components/layout/site-url';
import { shortDate } from '@/lib/format';
import { SOURCE_LINKS } from '@/lib/season';

import { getStandingsPageData } from './standings-data';

/**
 * /standings — "Where do we stand?" (DESIGN §3.2, amended by BYLAWS-ADDENDUM).
 *
 * Both divisions live on ONE page with `#de-anza` / `#el-camino` anchors: the page's job is
 * comparison, a tab that hides the other division would be a worse deal, and anchors work with
 * JavaScript off and are shareable (DESIGN §1.2).
 *
 * The phone fold is budgeted, not hoped for: 44px top bar + 44px division bar + 28px kicker + 30px
 * table head = 146 of the 604px usable at 390×664, leaving 458px = 7.6 rows of 60px, so rows 1-7 of
 * De Anza's 8 are above the fold. That is the whole reason the `<h1>` is visually hidden on phone
 * (the sticky top bar already names the page) and the "as of" stamp rides in the division bar
 * instead of taking a row of its own — the same trade DESIGN §1.3 makes for the top bar.
 *
 * No `searchParams`, nothing derived from `Date.now()`: the page is fully static and every "as of"
 * label comes from `snapshot.fetchedAt` (DESIGN decision 7, BUILD-BRIEF).
 */
export function generateMetadata(): Metadata {
  const { views, leaders } = getStandingsPageData();
  const summary = leaders
    .map((line) =>
      line.teams.length === 0
        ? `${line.label}: no results yet`
        : `${line.label}: ${line.teams
            .map((team) => `${team.name} ${team.record}, ${team.pts} pts`)
            .join(' and ')}`,
    )
    .join('. ');
  const through = views[0]?.throughDate;
  const description = `Both divisions, ordered on points (3 a win, 1 a tie, By-Laws Article VI §2). ${summary}.${
    through ? ` League games through ${shortDate(through)}.` : ''
  } Computed from published results; unofficial.`;

  return {
    title: 'Standings',
    description,
    alternates: { canonical: '/standings' },
    openGraph: {
      ...OG_BASE,
      title: 'Standings — De Anza and El Camino',
      description,
      url: '/standings',
    },
  };
}

export default function StandingsPage() {
  const { asOf, views, notice } = getStandingsPageData();

  return (
    /* The sticky table heads sit under the sticky division bar: 44 + 44 on phone, 56 + 44 from md.
       `.sx-table thead th` reads this variable, so the offset is declared once, here. */
    <div className="[--sx-sticky-top:5.5rem] md:[--sx-sticky-top:6.25rem]">
      <div className="md:flex md:items-baseline md:gap-3 md:pt-6 md:pb-3">
        <h1 className="sr-only m-0 md:not-sr-only md:text-h1">Standings</h1>
        <p className="m-0 hidden text-meta text-ink-3 md:block">
          2026 SCVAL girls varsity field hockey &middot; league games only &middot; computed from
          published results
        </p>
      </div>

      <DivisionTabs
        tabs={views.map((view) => ({ href: `#${view.division}`, label: view.label }))}
        /* Phone only: the sticky top bar carries the same stamp from `sm` up, and two of them in
           two sticky bars would be the page telling the reader the same thing twice. */
        stamp={<LastUpdated at={asOf} variant="compact" className="sm:hidden" />}
      />

      {notice ? (
        <div className="mt-3 rounded-card border border-hairline bg-surface p-3">
          <p className="m-0 text-body font-semibold text-ink">{notice.heading}</p>
          <p className="mt-1 mb-0 max-w-[62ch] text-meta text-ink-2">{notice.body}</p>
        </div>
      ) : null}

      {views.map((view) => (
        <DivisionStandings key={view.division} view={view} />
      ))}

      {/* `sx-action` on both, like every other standalone action link on the site (the footer, the
          game sources, the team page's three external links). This row is a flex container, which
          BLOCKIFIES its children, so these two are not words inside a sentence and WCAG 2.5.8's
          inline exception does not reach them — they shipped as 18px boxes while the rule that
          exists for exactly this shape (app/globals.css `.sx-action`, a 24px floor) was applied
          everywhere else. `items-center` rather than `items-baseline` because a 24px box has no
          text baseline to align to. */}
      <p className="mt-6 mb-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline pt-3 text-meta text-ink-2">
        <Link href="/about#standings" prefetch={false} className="sx-action text-accent hover:underline">
          How standings are computed <span aria-hidden="true">&rarr;</span>
        </Link>
        <ExternalLink href={SOURCE_LINKS.scvalBylaws} className="sx-action">
          SCVAL field hockey by-laws 2026-27 (PDF)
        </ExternalLink>
      </p>
    </div>
  );
}
