import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';

import { RegionSwitcher } from '@/components/layout/LeagueSwitcher';
import PageHeader from '@/components/layout/PageHeader';
import LeaderSection from '@/components/leaders/LeaderSection';
import DivisionTabs from '@/components/standings/DivisionTabs';
import { buildLeadersView } from '@/views/leaders/leaders-view';
import { AND_INDEPENDENTS_SHORT, LEAGUE_COUNT } from '@/views/leaders/scope';
import type { RegionLeadersView } from '@/views/leaders/types';
import { pageMetadata } from '@/views/site/page-metadata';
import { coveredLeagueWords } from '@/views/site/site';

/**
 * `/leaders` (DESIGN §16, §23, §28) — "Who leads the whole site?" Leaderboards across every covered
 * league and the independents: the schools with the best records, the most goals per game (raw and
 * Elo-adjusted), the fewest allowed, the most clean sheets and the highest Elo rating (lib/engine/ratings.ts,
 * DESIGN §20), and the players with the most points (raw and Elo-adjusted: lib/engine/adjusted-scoring.ts),
 * assists, saves and clean sheets.
 *
 * One static page, built by views/leaders/leaders-view.ts from the two files every other page
 * reads (data/player-stats.json and data/snapshot.json), so a player's line is the one on their
 * team page and a school's record is the one in its standings row. Per region (DESIGN-socal §2.3,
 * §2.4), two sections, `#schools` and then `#players` (DESIGN §23; SoCal's `#schools-socal`,
 * `#players-socal`, every board id suffixed too, so both regions render on one page without a
 * duplicate id), each carrying `data-region-scope` so the reader's region shows. Each section
 * (components/leaders/LeaderSection.tsx) opens with an index of its boards and closes with its notes.
 *
 * The player boards can only rank what coaches enter, so every board says how many teams it covers
 * and which it leaves out, and the Players notes name the teams with no stats and the teams whose
 * totals are behind the scores. The school boards cover every team.
 */

const SHORT_NAMES = coveredLeagueWords();

const PAGE_TITLE = 'Season leaders';

export const metadata: Metadata = pageMetadata({
  path: '/leaders',
  title: PAGE_TITLE,
  description: `Girls varsity field hockey leaders across ${SHORT_NAMES}, unofficial: the schools with the best records, the most goals per game (raw and Elo-adjusted) and the highest Elo ratings, and the players with the most points (raw and Elo-adjusted), assists, saves and clean sheets.`,
  ogTitle: PAGE_TITLE,
  card: 'root',
});

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
        title={PAGE_TITLE}
        description={
          // Two sentences before the first table (DESIGN §28): what is ranked and where the numbers
          // come from. How the Elo scale links the regions is the Elo board's to say.
          <>
            The top schools and players across {SHORT_NAMES}, ranked within each region. School
            records and ratings are computed from the scores on this site; player numbers are what
            each coach enters on MaxPreps.
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
          <LeaderSection
            id={region.schoolsId}
            region={region.region}
            title="Schools"
            label={`School leaders, ${region.name}`}
            meta={`${region.scopeWords} · ${
              region.resultsThrough ? `Every final score through ${region.resultsThrough}` : 'No final scores yet'
            }`}
            boards={region.schools}
            notesTitle="Who qualifies"
            notes={region.schoolNotes.length > 0 ? <Notes notes={region.schoolNotes} /> : null}
            className={i === 0 ? 'mt-8 md:mt-10' : 'mt-section md:mt-section-lg'}
          />
          <LeaderSection
            id={region.playersId}
            region={region.region}
            title="Players"
            label={`Player leaders, ${region.name}`}
            meta={`${region.scopeWords} · ${region.statTeams} of ${region.teamCount} teams enter player stats`}
            boards={region.players}
            notesTitle="Whose stats are here"
            notes={<PlayerNotes region={region} />}
            className="mt-section md:mt-section-lg"
          />
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

function Notes({ notes }: { notes: readonly string[] }) {
  return notes.map((note) => (
    <p key={note} className="m-0">
      {note}
    </p>
  ));
}

/**
 * Which teams have no stats and whose are carried forward, always shown; whose totals lag the scores,
 * a list that runs to twenty teams by midseason, behind a closed disclosure whose summary counts them.
 */
function PlayerNotes({ region }: { region: RegionLeadersView }) {
  const { lagging } = region;
  return (
    <>
      <Notes notes={region.playerNotes} />
      {lagging ? (
        <details className="sx-disclosure">
          <summary>{lagging.summary}</summary>
          <ul className="m-0 mt-1 list-none space-y-1 p-0">
            {lagging.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
