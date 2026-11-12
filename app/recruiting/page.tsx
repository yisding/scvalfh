import type { Metadata } from 'next';
import Link from 'next/link';

import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import RecruitingList from '../../components/recruiting/RecruitingList';
import RecruitingTabs from '../../components/recruiting/RecruitingTabs';
import { buildRecruitingView } from '../../components/recruiting/recruiting-view';
import SectionHeader from '../../components/ui/SectionHeader';
import { getRosters } from '../../lib/players/rosters';
import { notFound } from 'next/navigation';
import { HAS_RECRUITING } from '../../lib/sports/current';

/** The page's title, and its og:title too: og:title never carries the site-name suffix (OG_BASE). */
const PAGE_TITLE = 'Recruiting';

/**
 * /recruiting — "Who here has a recruiting profile, a club or a college commitment?" (DESIGN §25).
 *
 * Every school's recruiting data on one page: the players' own recruiting profiles, the youth clubs
 * a public page ties them to and the colleges a public page says they have committed to. Each team
 * page's roster shows the same three lines for its own players; this page gathers them, built from
 * the same rows (components/recruiting/recruiting-view.ts), so the two never disagree. /clubs and
 * /commits stay the pages that cite the club and commitment sources, and the lines link them.
 *
 * Under the title, the recruiting family's one tab row (components/recruiting/RecruitingTabs.tsx).
 *
 * Regions (DESIGN-socal §2.4): each region's leagues sit in one `<div id="norcal|socal"
 * data-region-scope>`, so a reader sees their own half; without JavaScript both render, NorCal
 * first. The page has no region control and no league row of its own (DESIGN §33: one tab row a
 * page; the footer and the More sheet carry the region).
 *
 * Heading outline: the h1, then one h2 per league (`id=<league>`, as on /teams), and under it one
 * group strip per school with a listed player (an h3; `id=<team slug>`, its link the school's
 * roster). A school with nobody listed is not named or counted, and a league with no listed school
 * has no section: recall is partial, so an absence says nothing about a school or its players. How
 * the lists are gathered is said once, on /about (`/about#recruiting`), which the last line links.
 *
 * Lists, not tables. Not in the nav: /teams, the team rosters, /clubs and /commits link it. It
 * takes the root OG card. Neither the title nor the description names a player.
 */
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: `The recruiting profiles, youth clubs and college commitments of players on the ${getRosters().teams.length} varsity rosters here, school by school, with a public source for every one. Unofficial and incomplete.`,
  alternates: { canonical: '/recruiting' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/recruiting' },
};

export default function RecruitingPage() {
  // Field hockey's alone (recruiting): a soccer build renders this route as a 404 (lib/sports/current.ts HAS_RECRUITING).
  if (!HAS_RECRUITING) notFound();
  const view = buildRecruitingView();

  return (
    <div className="pb-section-lg">
      <PageHeader title="Recruiting">
        <RecruitingTabs current="recruiting" />
      </PageHeader>

      {view.regions.map((region) => (
        <div key={region.id} id={region.id} data-region-scope={region.id}>
          <p className="sx-note mt-4 max-w-prose">{region.summary}</p>
          {region.leagues.map((league, i) => (
            <section key={league.id} aria-labelledby={league.id} data-first={i === 0 ? '' : undefined} className="sx-section">
              <SectionHeader id={league.id} kicker={league.title.split(' — ')[0]} meta={[league.title.split(' — ')[1], league.meta].filter(Boolean).join(', ')} />
              {league.schools.map((school) => (
                <div key={school.slug} className="sx-subsection">
                  {/* The strip says how many players; what each has is on the rows under it. */}
                  <SectionHeader
                    strip
                    id={school.id}
                    kicker={school.name}
                    meta={school.meta.split(' · ')[0]}
                    action={{ href: school.href, label: 'Roster' }}
                  />
                  <RecruitingList rows={school.rows} />
                </div>
              ))}
            </section>
          ))}
        </div>
      ))}

      <ul className="sx-linkrow mt-6">
        <li>
          <Link href="/about#recruiting" prefetch={false} className="sx-action">
            How these lists are gathered
          </Link>
        </li>
      </ul>
    </div>
  );
}
