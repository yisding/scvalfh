import type { Metadata } from 'next';
import Link from 'next/link';

import PageHeader from '@/components/layout/PageHeader';
import DivisionStandings from '@/components/standings/DivisionStandings';
import DivisionTabs from '@/components/standings/DivisionTabs';
import ExternalLink from '@/components/ui/ExternalLink';
import { OG_BASE } from '@/components/layout/site-url';
import { shortDate } from '@/lib/format';
import { DIVISION_LABELS, SOURCE_LINKS } from '@/lib/season';

import { getStandingsPageData } from './standings-data';

/**
 * /standings — "Where do we stand?" (DESIGN §3.2, amended by BYLAWS-ADDENDUM).
 *
 * Both divisions live on ONE page with `#de-anza` / `#el-camino` anchors: the page's job is
 * comparison, a tab that hides the other division would be a worse deal, and anchors work with
 * JavaScript off and are shareable (DESIGN §1.2).
 *
 * The phone fold, once the page title has scrolled away: 48px top bar + 48px division bar (both
 * sticky) + 40px section heading + 36px table head = 172px, then 68px two-line rows — about six
 * rows above the fold at 390×844. That is deliberate (brief §5.2): the rows got air, and the title
 * is a real `<h1>` again rather than a visually hidden one.
 *
 * Everything generic (the GD and PTS explanations, the qualifier-cut sentence, "this order is our
 * computation") is printed ONCE, in the "How these tables are computed" disclosure at the foot of
 * the page. Everything division-specific stays visible in that division's Notes block.
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
  const { views, notice } = getStandingsPageData();
  const tabs = views.map((view) => ({ href: `#${view.division}`, label: view.label }));

  // The page disclosure: the GD paragraph (stating every division's own maximum), the PTS
  // paragraph, then each generic per-division sentence once (they are identical when both
  // divisions cut after the same place).
  const gdMaxima = views
    .map((view) => `${DIVISION_LABELS[view.division]} |GD| max ${view.gdDomain}`)
    .join(', ');
  const legend = [
    `GD = league goals for minus goals against. Bars are scaled to each division alone (${gdMaxima}), so the two divisions' bars are not comparable to each other. A real 0 shows as 0; a score we do not have shows as an em dash. Forfeits count in W-L-T, not in GF / GA / GD.`,
    'PTS is the official ordering key: 3 points for a win, 1 for a tie (SCVAL By-Laws Article VI §2).',
    ...new Set(views.flatMap((view) => view.legendNotes)),
  ];

  return (
    /* The sticky table heads park under the sticky chrome: on phone the 48px top bar plus the 48px
       division bar (6rem); from md the division pills sit in the title row and do not stick, so
       only the 64px top bar. `.sx-table thead th` reads this variable, so it is declared once. */
    <div className="pb-section-lg [--sx-sticky-top:6rem] md:[--sx-sticky-top:var(--spacing-topbar-lg)]">
      <PageHeader
        title="Standings"
        description="2026 SCVAL girls varsity field hockey · league games only · computed from published results"
        aside={<DivisionTabs variant="inline" tabs={tabs} />}
        asideClassName="hidden md:block"
      />

      <DivisionTabs variant="bar" tabs={tabs} className="mt-4" />

      {notice ? (
        <div className="sx-inset mt-6 max-w-prose">
          <p className="m-0 text-body font-semibold text-ink">{notice.heading}</p>
          <p className="mb-0">{notice.body}</p>
        </div>
      ) : null}

      {views.map((view, index) => (
        <DivisionStandings
          key={view.division}
          view={view}
          className={index === 0 && !notice ? 'mt-8 md:mt-10' : 'mt-section md:mt-section-lg'}
        />
      ))}

      <details className="sx-inset sx-disclosure mt-section max-w-prose md:mt-section-lg">
        <summary>How these tables are computed ({legend.length} notes)</summary>
        {legend.map((note) => (
          <p key={note} className="mb-0">
            {note}
          </p>
        ))}
      </details>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/about#standings" prefetch={false} className="sx-pill">
          How standings are computed
        </Link>
        <ExternalLink href={SOURCE_LINKS.scvalBylaws} className="sx-pill">
          SCVAL field hockey by-laws 2026-27 (PDF)
        </ExternalLink>
      </div>
    </div>
  );
}
