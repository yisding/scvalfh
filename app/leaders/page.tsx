import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';

import LeaderSection from '../../components/leaders/LeaderSection';
import { buildLeadersView } from '../../components/leaders/leaders-view';
import { BUILD_INSTANT } from '../../components/layout/build-instant';
import LastUpdated from '../../components/layout/LastUpdated';
import PageHeader from '../../components/layout/PageHeader';
import ScopeBar from '../../components/prefs/ScopeBar';
import { OG_BASE, ROOT_OG_IMAGE, coveredLeagueWords } from '../../components/layout/site';
import DivisionTabs from '../../components/standings/DivisionTabs';
import { capitalized } from '../../components/words/capitalized';
import { getFetchedAt } from '../../lib/data';
import { SPORT, SPORT_AUDIENCE } from '../../lib/sports/current';

/**
 * `/leaders` (DESIGN §16, §23, §33) — "Who leads the whole site?" Leaderboards across every covered
 * league and the independents: the players with the most points (raw and Elo-adjusted:
 * lib/ratings/adjusted-scoring.ts), assists, saves and clean sheets, and the schools with the best
 * records, the most goals per game (raw and Elo-adjusted), the fewest allowed, the most clean
 * sheets and the highest Elo rating (lib/ratings/ratings.ts, DESIGN §20).
 *
 * One static page, built by components/leaders/leaders-view.ts from the two files every other page
 * reads (data/player-stats.json and data/snapshot.json), so a player's line is the one on their
 * team page and a school's record is the one in its standings row. Under the title, ONE tab row,
 * Players / Teams (anchors; the page's only control). Per region (DESIGN-socal §2.3, §2.4), two
 * sections, `#players` and then `#schools` (SoCal's `#players-socal`, `#schools-socal`, every board
 * id suffixed too, so both regions render on one page without a duplicate id), each carrying
 * `data-region-scope` so the reader's region shows. Each section (components/leaders/LeaderSection.tsx)
 * is a grid of top-five boards, every board visible at once.
 *
 * Who qualifies for a board, which teams enter no player stats and how the ratings are fitted are
 * on /about; the page links it once, at the end.
 */

const SHORT_NAMES = coveredLeagueWords();

/** The page's title, and its og:title too: og:title never carries the site-name suffix (OG_BASE). */
const PAGE_TITLE = 'Season leaders';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description:
    SPORT.stats.model === 'basketball'
      ? `${capitalized(SPORT_AUDIENCE)} leaders across ${SHORT_NAMES}, unofficial: the schools with the best records, the most points per game, the best average margins and the highest Elo ratings, and the players with the most points, rebounds and assists per game, steals, blocks and three-pointers.`
      : SPORT.stats.model === 'volleyball'
        ? `${capitalized(SPORT_AUDIENCE)} leaders across ${SHORT_NAMES}, unofficial: the schools with the best records, the best average margins and the highest Elo ratings, and the players with the most kills, aces, digs and assists per set, kills and solo blocks.`
      : `${capitalized(SPORT_AUDIENCE)} leaders across ${SHORT_NAMES}, unofficial: the schools with the best records, the most goals per game (raw and Elo-adjusted) and the highest Elo ratings, and the players with the most points (raw and Elo-adjusted), assists, saves and clean sheets.`,
  alternates: { canonical: '/leaders' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/leaders' },
};

export default function LeadersPage() {
  const view = buildLeadersView();
  // Each region's tabs go to its own suffixed anchors (DESIGN-socal §2.4): `#players`/`#schools` for
  // NorCal, as always, and `#players-socal`/`#schools-socal` for SoCal; the scope stylesheet shows the
  // reader's pair. With JS off all four show, so each carries its region in sr-only text ('Teams,
  // Southern California'): the same visible words go to different boards (review 2026-10-06).
  const tabs = view.regions.flatMap((region) => [
    { href: `#${region.playersId}`, label: 'Players', region: region.region, srSuffix: `, ${region.name}` },
    { href: `#${region.schoolsId}`, label: 'Teams', region: region.region, srSuffix: `, ${region.name}` },
  ]);

  return (
    // On a phone the tab row sticks under the 48px top bar, so anchors land below both (6rem).
    <div className="pb-section-lg [--sx-sticky-top:6rem] md:[--sx-sticky-top:var(--spacing-topbar-lg)]">
      <PageHeader title="Leaders" />

      {/* The region switch and the short stamp, as on Standings, Teams and Playoffs: every board below
          is one region's. A one-region build draws the stamp alone. */}
      <ScopeBar stamp={<LastUpdated at={getFetchedAt()} now={BUILD_INSTANT} variant="time" />} />

      {/* One tab row: the sticky bar on a phone, the static row from 768 (only one is displayed). */}
      <DivisionTabs variant="bar" tabs={tabs} label="Leaders" />
      <DivisionTabs variant="inline" tabs={tabs} label="Leaders" />

      {view.regions.map((region) => (
        <Fragment key={region.region}>
          <LeaderSection
            id={region.playersId}
            region={region.region}
            title="Players"
            label={`Player leaders, ${region.name}`}
            boards={region.players}
            className="mt-5"
          />
          <LeaderSection
            id={region.schoolsId}
            region={region.region}
            title="Teams"
            label={`Team leaders, ${region.name}`}
            boards={region.schools}
          />
        </Fragment>
      ))}

      <ul className="sx-linkrow mt-10">
        <li>
          <Link href="/about#ratings" prefetch={false} className="sx-action">
            How ratings are calculated
          </Link>
        </li>
      </ul>
    </div>
  );
}
