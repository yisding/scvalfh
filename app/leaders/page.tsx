import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';

import LeaderBoardTable from '../../components/leaders/LeaderBoardTable';
import {
  AND_INDEPENDENTS_SHORT,
  LEAGUE_COUNT,
  buildLeadersView,
  type RegionLeadersView,
} from '../../components/leaders/leaders-view';
import { RegionSwitcher } from '../../components/layout/LeagueSwitcher';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE, coveredLeagueWords } from '../../components/layout/site';
import DivisionTabs from '../../components/standings/DivisionTabs';
import SectionHeader from '../../components/ui/SectionHeader';
import { numberWord } from '../../lib/format';

/**
 * `/leaders` (DESIGN §16) — "Who leads the whole site?" Leaderboards across all nine leagues and the five independents: the
 * schools with the best records, the most goals per game, the fewest allowed, the most clean
 * sheets and the highest Elo rating (lib/ratings.ts, DESIGN §20), and the players with the most
 * points, assists, saves and clean sheets.
 *
 * One static page, built by components/leaders/leaders-view.ts from the two files every other page
 * reads (data/player-stats.json and data/snapshot.json), so a player's line is the one on their
 * team page and a school's record is the one in its standings row. Per region (DESIGN-socal §2.3,
 * §2.4: components/leaders/leaders-view.ts builds each region's boards over its own teams), two
 * sections, `#schools` and then `#players` (DESIGN §23; SoCal's `#schools-socal`, `#players-socal`,
 * every board id suffixed too, so both regions render on one page without a duplicate id), each
 * carrying `data-region-scope` so the reader's region shows. The Elo numbers are one fit over every
 * team; the description says how few finals link the two regions (counted at build time). Each
 * section is a grid of boards that is one column on a phone and two from 1024px; every board has its
 * own anchor (`#most-points`, `#best-record`, …). A player board shows its top 10 and opens to 25
 * under the table.
 *
 * The player boards can only rank what coaches enter, so the page says so up front, every board
 * says how many teams it covers and which it leaves out, and the notes under the section name the
 * teams whose totals are behind the scores. The school boards cover every team.
 */

const SHORT_NAMES = coveredLeagueWords();

/** The page's title, and its og:title too: og:title never carries the site-name suffix (OG_BASE). */
const PAGE_TITLE = 'Season leaders';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: `Girls varsity field hockey leaders across ${SHORT_NAMES}, unofficial: the schools with the best records and highest Elo ratings, and the players with the most points, assists, saves and clean sheets.`,
  alternates: { canonical: '/leaders' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/leaders' },
};

export default function LeadersPage() {
  const view = buildLeadersView();
  // Each region's pills go to its own suffixed anchors (DESIGN-socal §2.4): `#schools`/`#players` for
  // NorCal, as always, and `#schools-socal`/`#players-socal` for SoCal; the scope stylesheet shows the
  // reader's pair. With JS off all four show, so each carries its region in sr-only text ('Schools,
  // Southern California'): the same visible words go to different boards (review 2026-10-06).
  const tabs = view.regions.flatMap((region) => [
    { href: `#${region.schoolsId}`, label: 'Schools', region: region.region, srSuffix: `, ${region.name}` },
    { href: `#${region.playersId}`, label: 'Players', region: region.region, srSuffix: `, ${region.name}` },
  ]);

  return (
    // The sticky table heads park under the 48px top bar plus the 48px jump bar on a phone
    // (6rem); from md the pills sit in the title row and do not stick (as on /history).
    <div className="pb-section-lg [--sx-sticky-top:6rem] md:[--sx-sticky-top:var(--spacing-topbar-lg)]">
      <PageHeader
        eyebrow={`All ${LEAGUE_COUNT} leagues${AND_INDEPENDENTS_SHORT}`}
        title="Season leaders"
        description={
          <>
            The top schools and players across {SHORT_NAMES}, ranked within each region. School
            records and Elo ratings are computed from the scores on this site; player numbers are
            what each coach enters on MaxPreps. {view.crossRegion.sentence}
          </>
        }
        aside={<DivisionTabs variant="inline" tabs={tabs} label="Jump to a leaderboard" />}
        asideClassName="hidden md:block"
      />

      {/* The region control, its own row above the sticky jump bar (DESIGN-socal §2.4). */}
      <RegionSwitcher className="mt-4" />

      <DivisionTabs variant="bar" tabs={tabs} label="Jump to a leaderboard" className="mt-4" />

      {view.regions.map((region, i) => (
        <Fragment key={region.region}>
          <section
            id={region.schoolsId}
            data-region-scope={region.region}
            aria-label={`School leaders, ${region.name}`}
            className={`${i === 0 ? 'mt-8 md:mt-10' : 'mt-section md:mt-section-lg'} min-w-0 scroll-mt-24`}
          >
            <SectionHeader
              size="lg"
              kicker="Schools"
              meta={`${regionLeagues(region)} · ${
                region.resultsThrough ? `Every final score through ${region.resultsThrough}` : 'No final scores yet'
              }`}
            />
            <div className="mt-4 grid gap-y-section lg:grid-cols-2 lg:gap-x-10">
              {region.schools.map((board) => (
                <LeaderBoardTable key={board.id} board={board} />
              ))}
            </div>
            {region.schoolNotes.length > 0 ? (
              <div className="mt-section max-w-prose space-y-2 text-meta text-ink-3">
                {region.schoolNotes.map((note) => (
                  <p key={note} className="m-0">
                    {note}
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          <section
            id={region.playersId}
            data-region-scope={region.region}
            aria-label={`Player leaders, ${region.name}`}
            className="mt-section min-w-0 scroll-mt-24 md:mt-section-lg"
          >
            <SectionHeader
              size="lg"
              kicker="Players"
              meta={`${regionLeagues(region)} · ${region.statTeams} of ${region.teamCount} teams enter player stats`}
            />
            <div className="mt-4 grid gap-y-section lg:grid-cols-2 lg:gap-x-10">
              {region.players.map((board) => (
                <LeaderBoardTable key={board.id} board={board} />
              ))}
            </div>
            <div className="mt-section max-w-prose space-y-2 text-meta text-ink-3">
              {region.playerNotes.map((note) => (
                <p key={note} className="m-0">
                  {note}
                </p>
              ))}
            </div>
          </section>
        </Fragment>
      ))}

      <p className="mt-section max-w-prose text-meta text-ink-3 md:mt-section-lg">
        Full attribution and update details are on the{' '}
        <Link href="/about" prefetch={false} className="text-accent hover:underline">
          About &amp; sources
        </Link>{' '}
        page.
      </p>
    </div>
  );
}

/** "NorCal’s five leagues" | "SoCal’s four leagues and five independents": a region section's scope, from config. */
function regionLeagues(region: RegionLeadersView): string {
  const independents = region.independentCount > 0 ? ` and ${numberWord(region.independentCount)} independents` : '';
  return `${region.shortName}’s ${numberWord(region.leagueCount)} leagues${independents}`;
}
