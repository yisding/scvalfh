import type { Metadata } from 'next';
import Link from 'next/link';

import CollegeList from '../../components/commits/CollegeList';
import CommitList from '../../components/commits/CommitList';
import { buildCommitsView } from '../../components/commits/commit-view';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import { plural } from '../../components/words/plural';
import RecruitingTabs from '../../components/recruiting/RecruitingTabs';
import SectionHeader from '../../components/ui/SectionHeader';
import { getRosters } from '../../lib/players/rosters';
import { notFound } from 'next/navigation';
import { HAS_RECRUITING } from '../../lib/sports/current';

/** The page's title, and its og:title too: og:title never carries the site-name suffix (OG_BASE). */
const PAGE_TITLE = 'College commitments';

/**
 * /commits — "Who here has committed to play in college, and where?" (DESIGN §21.1, SPEC §1.1j3).
 *
 * The commitments of data/commits.json: players on the tracked varsity rosters that a public page
 * says have committed to (or signed with) a college team, in field hockey or any other sport.
 *
 * Under the title, the recruiting family's one tab row (components/recruiting/RecruitingTabs.tsx).
 *
 * Regions (DESIGN §21.8): each region's commitments sit in one `<div id="norcal|socal"
 * data-region-scope>`, so a reader sees their own half; without JavaScript both render, NorCal
 * first. Each block opens with the region's count sentence. The page has no region control of its
 * own (DESIGN §33): the footer and the More sheet carry it.
 *
 * Heading outline: the h1, then, in each region's block, one h2 per class year
 * (`#norcal-class-2027`, the earliest class first) and the h2 "Colleges" (`#norcal-colleges`, one row
 * per college, `#norcal-college-<slug>`). How commitments are matched is said once, on /about
 * (`/about#commits-matched`), which the last line links.
 * A team page's commitment line links the player's row (`#<team slug>-<athleteId>`,
 * components/commits/commit-view.ts commitAnchor), which opens its block when that region is hidden
 * (`:has(:target)`). A region with no commitment shows only its sentence. With no commitment in the
 * file, one plain line stands where the regions would be.
 *
 * Lists, not tables. The page is not in the nav (DESIGN §21.4): /teams, every team page's roster
 * where a player has a commitment, and /about link it. It takes the root OG card: there is no
 * commitments card. Neither the title nor the description names a player.
 */
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: `The colleges that players on the ${getRosters().teams.length} varsity rosters here have committed to play for, in field hockey and other sports, with a public source for every one. Unofficial and incomplete.`,
  alternates: { canonical: '/commits' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/commits' },
};

export default function CommitsPage() {
  // Field hockey's alone (college commitments): a soccer build renders this route as a 404 (lib/sports/current.ts HAS_RECRUITING).
  if (!HAS_RECRUITING) notFound();
  const view = buildCommitsView();

  return (
    <div className="pb-section-lg">
      <PageHeader title="College commitments">
        <RecruitingTabs current="commits" />
      </PageHeader>

      {view.playerCount === 0 ? (
        <p className="sx-empty mt-4">No commitment found yet.</p>
      ) : (
        view.regions.map((region) => (
          <div key={region.id} id={region.id} data-region-scope={region.id}>
            <p className="sx-note mt-4 max-w-prose">{region.summary}</p>
            {region.classes.map((group, i) => (
              <section key={group.id} aria-labelledby={group.id} data-first={i === 0 ? '' : undefined} className="sx-section">
                <SectionHeader id={group.id} kicker={group.heading} meta={group.meta} />
                <CommitList rows={group.rows} />
              </section>
            ))}
            {region.colleges.length > 0 ? (
              <section aria-labelledby={region.collegesId} className="sx-section">
                <SectionHeader id={region.collegesId} kicker="Colleges" meta={plural(region.colleges.length, 'college')} />
                <CollegeList colleges={region.colleges} />
              </section>
            ) : null}
          </div>
        ))
      )}

      <ul className="sx-linkrow mt-6">
        <li>
          <Link href="/about#commits-matched" prefetch={false} className="sx-action">
            How commitments are matched
          </Link>
        </li>
      </ul>
    </div>
  );
}
