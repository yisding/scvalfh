import type { Metadata } from 'next';
import Link from 'next/link';

import LeagueSwitcher, { RegionSwitcher } from '../../components/layout/LeagueSwitcher';
import PageHeader from '../../components/layout/PageHeader';
import { leagueChips, leagueHrefs } from '../../components/layout/league-chips';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import RecruitingList from '../../components/recruiting/RecruitingList';
import { buildRecruitingView } from '../../components/recruiting/recruiting-view';
import SectionHeader from '../../components/ui/SectionHeader';
import { getRosters } from '../../lib/rosters';

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
 * Regions (DESIGN-socal §2.4): the RegionSwitcher sits under the header, and each region's leagues
 * sit in one `<div id="norcal|socal" data-region-scope>`, so a reader sees their own half; without
 * JavaScript both render, NorCal first. The anchor-mode league chips under it jump to `#<league>`
 * and are region-scoped by the switcher.
 *
 * Heading outline: the h1, then one h2 per league (`id=<league>`, as on /teams), one h3 per school
 * with a listed player (`id=<team slug>`, its action the school's roster), then the h2 "How this
 * page is built" (`#how-matched`). A school with nobody listed is not named or counted, and a league
 * with no listed school has no section and no chip: recall is partial, so an absence says nothing
 * about a school or its players.
 *
 * Lists, not tables (DESIGN §10.8). Not in the nav: /teams, the team rosters, /clubs and /commits
 * link it. It takes the root OG card. Neither the title nor the description names a player.
 */
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: `The recruiting profiles, youth clubs and college commitments of players on the ${getRosters().teams.length} varsity rosters here, school by school, with a public source for every one. Unofficial and incomplete.`,
  alternates: { canonical: '/recruiting' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/recruiting' },
};

export default function RecruitingPage() {
  const view = buildRecruitingView();
  const shown = new Set(view.regions.flatMap((r) => r.leagues.map((l) => l.id)));

  return (
    <div className="pb-section-lg">
      <PageHeader title="Recruiting" description={view.lede} />

      <RegionSwitcher className="mt-4" />

      <div className="mt-4">
        <LeagueSwitcher
          mode="anchor"
          label="Leagues"
          leagues={leagueChips().filter((c) => shown.has(c.id))}
          hrefs={leagueHrefs(null)}
        />
      </div>

      {view.regions.map((region) => (
        <div key={region.id} id={region.id} data-region-scope={region.id}>
          <p className="mt-6 mb-0 max-w-prose text-meta text-ink-2">{region.summary}</p>
          {region.leagues.map((league, i) => (
            <section
              key={league.id}
              aria-labelledby={league.id}
              className={i === 0 ? 'mt-8 md:mt-10' : 'mt-section md:mt-section-lg'}
            >
              <SectionHeader id={league.id} kicker={league.title} meta={league.meta} />
              {league.schools.map((school) => (
                <section key={school.slug} aria-labelledby={school.id} className="mt-6">
                  <SectionHeader
                    as="h3"
                    id={school.id}
                    kicker={school.name}
                    meta={school.meta}
                    action={{ href: school.href, label: 'Full roster' }}
                  />
                  <RecruitingList rows={school.rows} />
                </section>
              ))}
            </section>
          ))}
        </div>
      ))}

      <section aria-labelledby="how-matched" className="mt-section md:mt-section-lg">
        <SectionHeader id="how-matched" kicker="How this page is built" />
        <div className="max-w-prose text-meta text-ink-2">
          <p className="m-0">
            Only players on the {view.trackedTeams} varsity rosters this site tracks are listed, under
            the roster&rsquo;s own spelling; rows a school marks JV are left out. A player is listed
            when a public page shows at least one of three things for them, and each school&rsquo;s
            page shows the same lines on its roster, beside the rest of the player&rsquo;s facts and
            the sources they came from.
          </p>
          <p className="mt-2 mb-0">
            <strong className="font-semibold text-ink">Recruiting profiles</strong> are
            players&rsquo; own pages on NCSA, SportsRecruits, Hudl, FieldLevel and the like. A profile
            is linked only when it names the player and field hockey, and either names the school or
            shows the class year the roster shows along with a California hometown. They were last
            gathered on {view.profilesCheckedOn}.
          </p>
          <p className="mt-2 mb-0">
            <strong className="font-semibold text-ink">Club lines</strong> link the club&rsquo;s page
            on this site, which cites a source for each player it lists; see{' '}
            <Link href="/clubs#how-matched" prefetch={false} className="text-accent hover:underline">
              how players are matched to clubs
            </Link>
            . A &ldquo;listed club&rdquo; is one a source names without saying whether the player is
            still with it. The first club sweep was on {view.clubsCheckedOn}.
          </p>
          <p className="mt-2 mb-0">
            <strong className="font-semibold text-ink">Commitment lines</strong> link the
            player&rsquo;s entry on the college commitments page, which cites a source for each one;
            see{' '}
            <Link href="/commits#how-matched" prefetch={false} className="text-accent hover:underline">
              how commitments are matched
            </Link>
            . &ldquo;Signed&rdquo; appears only where a source says so, and a commitment in a sport
            other than field hockey names it. They were checked on {view.commitsCheckedOn}.
          </p>
          <p className="mt-2 mb-0">
            None of this is part of the twice-daily update: it is research done by hand, and social
            media is never used. Recall is partial, so a player who is not listed here may still have
            a profile, play for a club or have committed.
          </p>
        </div>
      </section>
    </div>
  );
}
