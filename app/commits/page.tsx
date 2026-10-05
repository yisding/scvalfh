import type { Metadata } from 'next';
import Link from 'next/link';

import CollegeList from '../../components/commits/CollegeList';
import CommitList from '../../components/commits/CommitList';
import { buildCommitsView } from '../../components/commits/commit-view';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import EmptyState from '../../components/ui/EmptyState';
import { plural } from '../../components/ui/plural';
import SectionHeader from '../../components/ui/SectionHeader';
import { getRosters } from '../../lib/rosters';

/** The page's title, and its og:title too: og:title never carries the site-name suffix (OG_BASE). */
const PAGE_TITLE = 'College commitments';

/**
 * /commits — "Who here has committed to play in college, and where?" (DESIGN §21.1, SPEC §1.1j3).
 *
 * The commitments of data/commits.json: players on the tracked varsity rosters that a public page
 * says have committed to (or signed with) a college team, in field hockey or any other sport. The
 * lede answers the page's question in one paragraph; there is no second line of bare counts.
 *
 * Heading outline: the h1, then one h2 per class year (`#class-2027`, the earliest class first),
 * then the h2 "Colleges" (`#colleges`, one row per college, `#college-<slug>`), then the h2 "How
 * commitments are matched" (`#how-matched`). A team page's commitment line links the player's row
 * (`#<team slug>-<athleteId>`, components/commits/commit-view.ts commitAnchor). With no commitment
 * in the file, one empty state stands where the classes would be and the colleges section is
 * left out.
 *
 * Lists, not tables (DESIGN §10.8). The page is not in the nav (DESIGN §21.4): /teams, every team
 * page's roster footnote where a player has a commitment, and /about link it. It takes the root OG
 * card: there is no commitments card. Neither the title nor the description names a player.
 */
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: `The colleges that players on the ${getRosters().teams.length} varsity rosters here have committed to play for, in field hockey and other sports, with a public source for every one. Unofficial and incomplete.`,
  alternates: { canonical: '/commits' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/commits' },
};

export default function CommitsPage() {
  const view = buildCommitsView();

  return (
    <div className="pb-section-lg">
      <PageHeader title="College commitments" description={view.lede} />

      {view.classes.length === 0 ? (
        <div className="mt-8 md:mt-10">
          <EmptyState heading="No commitment found yet.">
            No public page we found on {view.capturedOn} says a player on these rosters has committed
            to a college. That does not mean none has: see how commitments are matched, below.
          </EmptyState>
        </div>
      ) : (
        view.classes.map((group, i) => (
          <section
            key={group.id}
            aria-labelledby={group.id}
            className={i === 0 ? 'mt-8 md:mt-10' : 'mt-section md:mt-section-lg'}
          >
            <SectionHeader id={group.id} kicker={group.heading} meta={group.meta} />
            <CommitList rows={group.rows} />
          </section>
        ))
      )}

      {view.colleges.length > 0 ? (
        <section aria-labelledby="colleges" className="mt-section md:mt-section-lg">
          <SectionHeader id="colleges" kicker="Colleges" meta={plural(view.collegeCount, 'college')} />
          <CollegeList colleges={view.colleges} />
        </section>
      ) : null}

      <section aria-labelledby="how-matched" className="mt-section md:mt-section-lg">
        <SectionHeader id="how-matched" kicker="How commitments are matched" />
        <div className="max-w-prose text-meta text-ink-2">
          <p className="m-0">
            Only players on the {view.trackedTeams} varsity rosters this site tracks are listed; rows
            a school marks JV are left out, and so are graduates. Each is listed under the
            roster&rsquo;s own spelling, and their team&rsquo;s page shows the commitment beside
            their name.
          </p>
          <p className="mt-2 mb-0">
            A commitment is listed only when a public page says the player has committed to, or
            signed with, a college to play a sport on one of its teams, and the page also either
            names the player&rsquo;s high school, or gives a class year that matches the
            player&rsquo;s grade along with a Northern California location. Field hockey is this
            site&rsquo;s sport, but many players here also play another, and a commitment in any
            sport counts: each row names the sport. A name alone never counts, and a class year that
            disagrees with the roster rules a match out. A college a player is only interested in,
            has an offer from or has visited is not a commitment, and neither is a place on a
            college&rsquo;s club team.
          </p>
          <p className="mt-2 mb-0">
            Commitments are often announced only on social media. Social-media posts are never used
            here, so a commitment with no other public page is not listed. The pages used are
            players&rsquo; own recruiting profiles (SportsRecruits, NCSA and the like), commitment
            lists, club and school sites, and local news. Each commitment links the pages it rests
            on, and each was checked twice when it was found: once by re-opening every source, then
            by a separate pass that tried to break it. Every source was last re-opened on{' '}
            {view.capturedOn}.
          </p>
          <p className="mt-2 mb-0">
            &ldquo;Committed&rdquo; means a page says the player has committed, and no page we used
            says the player has signed. &ldquo;Signed&rdquo; appears only where a page says so. The
            date shown is the earliest date a source gives for the commitment, which may be the
            date of the page rather than the day the player decided. A commitment can change after
            that date; this list is not updated automatically.
          </p>
          <p className="mt-2 mb-0">
            Recall is partial. A player with no public page that meets the rule is not listed, so a
            school with no one here may still have players headed to a college team. The{' '}
            <Link href="/clubs" prefetch={false} className="text-accent hover:underline">
              club teams
            </Link>{' '}
            page uses the same matching rule.
          </p>
        </div>
      </section>
    </div>
  );
}
