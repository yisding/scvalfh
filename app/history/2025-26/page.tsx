import type { Metadata } from 'next';
import Link from 'next/link';

import AvailableLeague from '@/components/history/AvailableLeague';
import SectionBracketBlock from '@/components/history/SectionBracketBlock';
import UnavailableLeague from '@/components/history/UnavailableLeague';
import { RegionSwitcher } from '@/components/layout/LeagueSwitcher';
import PageHeader from '@/components/layout/PageHeader';
import DivisionTabs from '@/components/standings/DivisionTabs';
import { getLeague, getSection, regionOf } from '@/lib/config/leagues';
import { buildHistoryPageView, historyPageMeta } from '@/views/history/history-view';
import { pageMetadata } from '@/views/site/page-metadata';

export const metadata: Metadata = pageMetadata(historyPageMeta());

/**
 * `/history/2025-26` (DESIGN §1.1, §3.9; SPEC §10.8) — last season's final standings, one section
 * per league (`#scval #bval #pcal #mcal #eal #sunset #city #north-county #metro`), each carrying its
 * region's `data-region-scope`, as do the jump pills (DESIGN-socal §2.4). The four Southern California
 * leagues are unavailable: no league published 2025-26 standings (data/history-2025-26.json says what
 * was checked). A league whose own end-of-season documents we could
 * read (SCVAL's two PDFs, BVAL's Google Sheet and all-league documents) shows both divisions'
 * record-only tables and the all-league awards; a league we found no official 2025-26 final
 * standings for (PCAL, MCAL, EAL) says so, with the reason, links any official document it did publish
 * (MCAL's all-league team), and shows no table in its place. Everything is
 * built once by `scripts/build-history.ts`. After each section's last league comes that section's
 * 2025 playoff bracket (`#ccs` after PCAL, `#sds` after Metro: data/history-brackets-2025-26.json,
 * transcribed from the sections' own pages), so SoCal, where no league published standings, still
 * has last season's results; the unavailable cards of those leagues point to it. MaxPreps cannot serve a prior season at all — the year
 * segment of its league URL is cosmetic and always returns the CURRENT table (SPEC §1.1h) — so this
 * page is the only place last season's numbers live, and it is not part of the snapshot the
 * scheduled update rebuilds.
 *
 * The leagues, divisions and notes all come from `data/history-2025-26.json` and lib/config/leagues.ts,
 * never from a literal list, so a league cannot be dropped or invented here. The header says only
 * what a reader needs before the tables in a short lede; provenance detail sits in each league's
 * source note. A long lede here pushed the first standings row under the phone tab bar.
 */
export default function HistoryPage() {
  const { season, title, leagues, brackets, bracketSections, available, unavailableSubject, groupsSentence } =
    buildHistoryPageView();
  // Each pill is region-scoped (DESIGN-socal §2.4): the reader's region's leagues only.
  // A section's bracket pill follows its last league's, as the block does.
  const tabs = leagues.flatMap(({ id }) => [
    { href: `#${id}`, label: getLeague(id).shortName, region: regionOf(id) },
    ...brackets.filter((b) => b.afterLeague === id).map((b) => ({
      href: `#${b.id}`,
      label: `${getSection(b.id).shortName} playoffs`,
      region: getSection(b.id).region,
    })),
  ]);

  return (
    // The sticky table heads park under the 48px top bar plus the 48px jump bar on a phone
    // (6rem); from md the pills sit in the title row (or wrap under the title) and do not stick.
    <div className="pb-section-lg [--sx-sticky-top:6rem] md:[--sx-sticky-top:var(--spacing-topbar-lg)]">
      <PageHeader
        eyebrow="Archive"
        title={title}
        description={
          <>
            Final standings and all-league awards for {available}, from each league&rsquo;s own documents,
            and the {bracketSections} playoff brackets.{' '}
            {unavailableSubject ? (
              <>
                {unavailableSubject} unavailable: we found no official {season} final standings.{' '}
              </>
            ) : null}
            {groupsSentence ? <>{groupsSentence} </> : null}
            This page doesn&rsquo;t change.
          </>
        }
        aside={<DivisionTabs variant="inline" tabs={tabs} label="Jump to a league" />}
        asideClassName="hidden md:block"
      />

      {/* The region control, its own row above the sticky jump bar (DESIGN-socal §2.4). */}
      <RegionSwitcher className="mt-4" />

      {/* Jump bar: a long page with a section per league to reach. Sticky under the top bar below
          md; from md the pills sit in the title row, or under the title when they do not fit
          beside it. */}
      <DivisionTabs variant="bar" tabs={tabs} label="Jump to a league" className="mt-4" />

      <div className="mt-8 grid gap-y-section md:mt-10 md:gap-y-section-lg">
        {leagues.flatMap(({ id, entry }) => [
          entry.status === 'available' ? (
            <AvailableLeague key={id} leagueId={id} entry={entry} season={season} />
          ) : (
            <UnavailableLeague key={id} leagueId={id} entry={entry} season={season} />
          ),
          ...brackets.filter((b) => b.afterLeague === id).map((b) => (
            <SectionBracketBlock key={b.id} id={b.id} bracket={b.bracket} season={season} />
          )),
        ])}
      </div>

      <p className="mt-section max-w-prose text-meta text-ink-3 md:mt-section-lg">
        Full attribution and update details are on the{' '}
        <Link href="/about" className="text-accent hover:underline">
          About &amp; sources
        </Link>{' '}
        page.
      </p>
    </div>
  );
}
