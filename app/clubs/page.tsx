import type { Metadata } from 'next';

import ClubList from '../../components/clubs/ClubList';
import { RegionSwitcher } from '../../components/layout/LeagueSwitcher';
import { buildClubsIndexView } from '../../components/clubs/club-view';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import SectionHeader from '../../components/ui/SectionHeader';
import { getRosters } from '../../lib/rosters';

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
 * apart, and from which schools. The lede answers the page's question in one paragraph; there is
 * no second line of bare counts.
 *
 * Heading outline: the h1, then one h2 per region that has a club (San Francisco, the Peninsula,
 * the South Bay, the East Bay, Marin, the Central Coast, the Sacramento area, the North State,
 * Ventura County, Los Angeles, Orange County, the Inland Empire, San Diego, then the rest:
 * lib/clubs-schema.ts CLUB_REGIONS), then the h2 "How players are matched"
 * (`#how-matched`, which every club page links). Within a region, the clubs with the most tied
 * players come first (DESIGN §17.5, lib/clubs.ts), so a reader meets the clubs that answer the
 * question before the ones that do not.
 *
 * Regions (DESIGN §24.12): each region's section carries its half of the site's `data-region-scope`
 * (lib/clubs-schema.ts CLUB_REGION_SITE_REGION), under the RegionSwitcher, so a reader sees the clubs
 * of their own half; `elsewhere` shows under both, and without JavaScript every section renders,
 * NorCal's first. The first section of each half gets the first section's top margin.
 *
 * A list, not a table (DESIGN §10.8): components/clubs/ClubList.tsx. The page is not in the nav
 * (the spec keeps the navigation unchanged); /teams, every team page's roster and /about link it.
 * It takes the root OG card: there is no clubs card (DESIGN §17.6).
 */
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: `The youth field hockey clubs that players on the ${getRosters().teams.length} varsity rosters here play for, or played for, with a public source for every tie. Unofficial and incomplete.`,
  alternates: { canonical: '/clubs' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/clubs' },
};

export default function ClubsPage() {
  const view = buildClubsIndexView();

  return (
    <div className="pb-section-lg">
      <PageHeader title="Club teams" description={view.lede} />

      <RegionSwitcher className="mt-4" />

      {view.regions.map((region, i) => (
        <section
          key={region.id}
          aria-labelledby={region.id}
          data-region-scope={region.siteRegion ?? undefined}
          className={
            view.regions.findIndex((r) => r.siteRegion === region.siteRegion) === i
              ? 'mt-8 md:mt-10'
              : 'mt-section md:mt-section-lg'
          }
        >
          <SectionHeader id={region.id} kicker={region.heading} meta={region.meta} />
          <ClubList clubs={region.clubs} />
        </section>
      ))}

      <section aria-labelledby="how-matched" className="mt-section md:mt-section-lg">
        <SectionHeader id="how-matched" kicker="How players are matched" />
        <div className="max-w-prose text-meta text-ink-2">
          <p className="m-0">
            Only players on the {view.trackedTeams} varsity rosters this site tracks are listed; rows
            a school marks JV are left out. A club&rsquo;s own roster names many more players. They
            are not named here: a club&rsquo;s page links its own roster where one is public.
          </p>
          <p className="mt-2 mb-0">
            A player is tied to a club only when a public page names the player and a field hockey
            club, and also either names the player&rsquo;s high school, or gives a class year that
            matches the player&rsquo;s grade along with a location in the school&rsquo;s half of
            the state, Northern or Southern California. A name alone
            never counts, and a class year that disagrees with the roster rules a match out. A
            nickname (Abby for Abigail) counts when the page otherwise meets that rule and a second
            page, or the player&rsquo;s own, backs the match.
            Social-media posts, and lacrosse, soccer and ice hockey clubs, do not count.
          </p>
          <p className="mt-2 mb-0">
            Most ties rest on one page that names the player, the club and the school. Some rest on a
            club roster&rsquo;s class-year heading plus the club&rsquo;s location, or on a school
            nickname in a news story. Every tie links the pages it rests on, and each was checked
            twice, in two separate passes, when it was added.
          </p>
          <p className="mt-2 mb-0">
            &ldquo;Current&rdquo; means a source from the {view.currentSeasons} club season: a page
            dated in one of them, a club&rsquo;s current-players page, or a live recruiting profile
            that lists the club. &ldquo;Earlier&rdquo; means an older date, an alumni list, or a club
            the player&rsquo;s own page lists for earlier years. &ldquo;Listed by&rdquo; means a
            source names the club without saying whether the player is still with it, such as a
            profile not updated since an earlier season, or one a newer page contradicts. The date
            shown is the date or season the sources give for that listing, and such a tie is never
            shown as current.
          </p>
          <p className="mt-2 mb-0">
            Recall is partial. A player with no public page that meets the rule is not listed,
            whatever club they play for, so a school with no one here may still have plenty of club
            players.{view.regionsWithoutClubsSentence ? ` ${view.regionsWithoutClubsSentence}` : ''}
            {view.regionsNotSearchedSentence ? ` ${view.regionsNotSearchedSentence}` : ''}
          </p>
        </div>
      </section>
    </div>
  );
}
