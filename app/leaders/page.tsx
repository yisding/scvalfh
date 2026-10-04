import type { Metadata } from 'next';
import Link from 'next/link';

import LeaderBoardTable from '../../components/leaders/LeaderBoardTable';
import { LEAGUE_COUNT, buildLeadersView } from '../../components/leaders/leaders-view';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site-url';
import DivisionTabs from '../../components/standings/DivisionTabs';
import SectionHeader from '../../components/ui/SectionHeader';
import { listWords } from '../../lib/format';
import { LEAGUES } from '../../lib/leagues';

/**
 * `/leaders` (DESIGN §16) — "Who leads the whole site?" Leaderboards across all five leagues: the
 * schools with the best records, the most goals per game, the fewest allowed, the most clean
 * sheets and the highest Elo rating (lib/ratings.ts, DESIGN §20), and the players with the most
 * points, assists, saves and clean sheets.
 *
 * One static page, built by components/leaders/leaders-view.ts from the two files every other page
 * reads (data/player-stats.json and data/snapshot.json), so a player's line is the one on their
 * team page and a school's record is the one in its standings row. Two sections, `#schools` and
 * then `#players` (DESIGN §23), each a grid of boards that is one column on a phone and two from
 * 1024px; every board has its own anchor (`#most-points`, `#best-record`, …). A player board shows
 * its top 10 and opens to 25 under the table.
 *
 * The player boards can only rank what coaches enter, so the page says so up front, every board
 * says how many teams it covers and which it leaves out, and the notes under the section name the
 * teams whose totals are behind the scores. The school boards cover every team.
 */

const SHORT_NAMES = listWords(LEAGUES.map((l) => l.shortName));

export const metadata: Metadata = {
  title: 'Season leaders',
  description: `Girls varsity field hockey leaders across ${SHORT_NAMES}, unofficial: the schools with the best records and highest Elo ratings, and the players with the most points, assists, saves and clean sheets.`,
  alternates: { canonical: '/leaders' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, url: '/leaders' },
};

const TABS = [
  { href: '#schools', label: 'Schools' },
  { href: '#players', label: 'Players' },
];

export default function LeadersPage() {
  const view = buildLeadersView();

  return (
    // The sticky table heads park under the 48px top bar plus the 48px jump bar on a phone
    // (6rem); from md the pills sit in the title row and do not stick (as on /history).
    <div className="pb-section-lg [--sx-sticky-top:6rem] md:[--sx-sticky-top:var(--spacing-topbar-lg)]">
      <PageHeader
        eyebrow={`All ${LEAGUE_COUNT} leagues`}
        title="Season leaders"
        description={
          <>
            The top schools and players across {SHORT_NAMES}. School records and Elo ratings are
            computed from every final on this site; player numbers are what each coach enters on
            MaxPreps.
          </>
        }
        aside={<DivisionTabs variant="inline" tabs={TABS} label="Jump to a leaderboard" />}
        asideClassName="hidden md:block"
      />

      <DivisionTabs variant="bar" tabs={TABS} label="Jump to a leaderboard" className="mt-4" />

      <section id="schools" aria-label="School leaders" className="mt-8 min-w-0 scroll-mt-24 md:mt-10">
        <SectionHeader
          size="lg"
          kicker="Schools"
          meta={view.resultsThrough ? `Every final through ${view.resultsThrough}` : 'No finals yet'}
        />
        <div className="mt-4 grid gap-y-section lg:grid-cols-2 lg:gap-x-10">
          {view.schools.map((board) => (
            <LeaderBoardTable key={board.id} board={board} />
          ))}
        </div>
        {view.schoolNotes.length > 0 ? (
          <div className="mt-section max-w-prose space-y-2 text-meta text-ink-3">
            {view.schoolNotes.map((note) => (
              <p key={note} className="m-0">
                {note}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section id="players" aria-label="Player leaders" className="mt-section min-w-0 scroll-mt-24 md:mt-section-lg">
        <SectionHeader
          size="lg"
          kicker="Players"
          meta={`${view.statTeams} of ${view.teamCount} teams enter player stats`}
        />
        <div className="mt-4 grid gap-y-section lg:grid-cols-2 lg:gap-x-10">
          {view.players.map((board) => (
            <LeaderBoardTable key={board.id} board={board} />
          ))}
        </div>
        <div className="mt-section max-w-prose space-y-2 text-meta text-ink-3">
          {view.playerNotes.map((note) => (
            <p key={note} className="m-0">
              {note}
            </p>
          ))}
        </div>
      </section>

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
