import type { Metadata } from 'next';
import Link from 'next/link';

import ClubList from '../../components/clubs/ClubList';
import { buildClubsIndexView } from '../../components/clubs/club-view';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import RecruitingTabs from '../../components/recruiting/RecruitingTabs';
import SectionHeader from '../../components/ui/SectionHeader';
import { getRosters } from '../../lib/players/rosters';
import { notFound } from 'next/navigation';
import { HAS_RECRUITING } from '../../lib/sports/current';

/** The page's title, and its og:title too: og:title never carries the site-name suffix (OG_BASE). */
const PAGE_TITLE = 'Club teams';

/**
 * /clubs — "Which clubs do players here play for?" (DESIGN §17.1, SPEC §1.1j2).
 *
 * The youth field hockey clubs of data/clubs.json — the clubs around the Bay Area and Central Coast
 * schools, three clubs met near the EAL teams' schools (D-City and Roseville FHC in the Sacramento
 * area, Chico Hotshots in the North State: areas not searched for every club, DESIGN §22.9), the
 * clubs around the Southern Section and San Diego Section schools (DESIGN §24.12), plus any other
 * club a tracked player is tied to — and, for each, how many
 * players on the tracked varsity rosters a public page ties to it, current and earlier stated
 * apart, and from which schools.
 *
 * Under the title, the recruiting family's one tab row (components/recruiting/RecruitingTabs.tsx).
 * Heading outline: the h1, then one h2 per region that has a club (San Francisco, the Peninsula,
 * the South Bay, the East Bay, Marin, the Central Coast, the Sacramento area, the North State,
 * Ventura County, Los Angeles, Orange County, the Inland Empire, San Diego, then the rest:
 * lib/players/clubs-schema.ts CLUB_REGIONS). Within a region, the clubs with the most tied players
 * come first (DESIGN §17.5, lib/players/clubs.ts), and the clubs with none are one line of names
 * (components/clubs/ClubList.tsx). How players are matched is said once, on /about
 * (`/about#clubs-matched`), which the last line links.
 *
 * Regions (DESIGN §24.12): each region's section carries its half of the site's `data-region-scope`
 * (lib/players/clubs-schema.ts CLUB_REGION_SITE_REGION), so a reader sees the clubs of their own
 * half; `elsewhere` shows under both, and without JavaScript every section renders, NorCal's first.
 * The page has no region control of its own (DESIGN §33): the footer and the More sheet carry it.
 *
 * Under the tabs, a link to /club-calendar (DESIGN §34): the clubs'
 * tournaments and leagues.
 *
 * The page is not in the nav; /teams, every team page's roster and /about link it. It takes the
 * root OG card: there is no clubs card (DESIGN §17.6).
 */
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: `The youth field hockey clubs that players on the ${getRosters().teams.length} varsity rosters here play for, or played for, with a public source for every tie. Unofficial and incomplete.`,
  alternates: { canonical: '/clubs' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/clubs' },
};

export default function ClubsPage() {
  // Field hockey's alone (club teams): a soccer build renders this route as a 404 (lib/sports/current.ts HAS_RECRUITING).
  if (!HAS_RECRUITING) notFound();
  const view = buildClubsIndexView();

  return (
    <div className="pb-section-lg">
      <PageHeader title="Club teams">
        <RecruitingTabs current="clubs" />
      </PageHeader>
      <ul className="sx-linkrow">
        <li>
          <Link href="/club-calendar" prefetch={false} className="sx-action">
            Club calendar: when and where NorCal club teams play
          </Link>
        </li>
      </ul>

      {view.regions.map((region, i) => (
        <section
          key={region.id}
          aria-labelledby={region.id}
          data-region-scope={region.siteRegion ?? undefined}
          data-first={view.regions.findIndex((r) => r.siteRegion === region.siteRegion) === i ? '' : undefined}
          className="sx-section"
        >
          <SectionHeader id={region.id} kicker={region.heading} meta={region.meta} />
          <ClubList clubs={region.clubs} />
        </section>
      ))}

      <ul className="sx-linkrow mt-6">
        <li>
          <Link href="/about#clubs-matched" prefetch={false} className="sx-action">
            How players are matched
          </Link>
        </li>
      </ul>
    </div>
  );
}
