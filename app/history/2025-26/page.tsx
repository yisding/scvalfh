import type { Metadata } from 'next';
import Link from 'next/link';

import AwardsBlock from '../../../components/history/AwardsBlock';
import HistoryStandingsTable from '../../../components/history/HistoryStandingsTable';
import ExternalLink from '../../../components/ui/ExternalLink';
import PageHeader from '../../../components/layout/PageHeader';
import DivisionTabs from '../../../components/standings/DivisionTabs';
import TeamMonogram from '../../../components/ui/TeamMonogram';
import SectionHeader from '../../../components/ui/SectionHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../components/layout/site';
import { getTeamBySlug } from '../../../lib/data';
import {
  getAvailableHistoryLeagues,
  getHistoryChampions,
  getHistoryDivisionChanges,
  getHistoryLeagues,
  getHistorySeason,
  getHistoryUnpublishedTies,
  getUnavailableHistoryLeagues,
  type AvailableLeagueHistory,
  type UnavailableLeagueHistory,
} from '../../../lib/history';
import { listWords } from '../../../lib/format';
import { getDivision, getLeague, getSection } from '../../../lib/leagues';
import type { LeagueId } from '../../../lib/types';

/**
 * `/history/2025-26` (DESIGN §1.1, §3.9; SPEC §10.8) — last season's final standings, one section
 * per league (`#scval #bval #pcal #mcal`). A league whose own end-of-season documents we could
 * read (SCVAL's two PDFs, BVAL's Google Sheet and all-league documents) shows both divisions'
 * record-only tables and the all-league awards; a league we found no official 2025-26 final
 * standings for (PCAL, MCAL) says so, with the reason, links any official document it did publish
 * (MCAL's all-league team), and shows no table in its place. Everything is
 * built once by `scripts/build-history.ts`. MaxPreps cannot serve a prior season at all — the year
 * segment of its league URL is cosmetic and always returns the CURRENT table (SPEC §1.1h) — so this
 * page is the only place last season's numbers live, and it is not part of the nightly snapshot.
 *
 * The leagues, divisions and notes all come from `data/history-2025-26.json` and lib/leagues.ts,
 * never from a literal list, so a league cannot be dropped or invented here. The header says only
 * what a reader needs before the tables in a short lede; provenance detail sits in each league's
 * source note. A long lede here pushed the first standings row under the phone tab bar.
 */
const SEASON = getHistorySeason();
const HISTORY_LEAGUES = getHistoryLeagues();
const AVAILABLE = getAvailableHistoryLeagues();
const UNAVAILABLE = getUnavailableHistoryLeagues();
const short = (id: LeagueId) => getLeague(id).shortName;
/** "PCAL and MCAL are", "MCAL is", or null when every league has its tables. */
const UNAVAILABLE_SUBJECT = UNAVAILABLE.length
  ? `${listWords(UNAVAILABLE.map((l) => short(l.id)))} ${UNAVAILABLE.length === 1 ? 'is' : 'are'}`
  : null;

export const metadata: Metadata = {
  title: `${SEASON} final standings`,
  description:
    `Final ${listWords(AVAILABLE.map((l) => short(l.id)))} girls field hockey standings` +
    ` and all-league awards from the ${SEASON} season, from each league’s own documents.` +
    (UNAVAILABLE_SUBJECT
      ? ` ${UNAVAILABLE_SUBJECT} marked unavailable: we found no official ${SEASON} final standings.`
      : ''),
  alternates: { canonical: '/history/2025-26' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, url: '/history/2025-26' },
};

/** `lg:grid-rows-[repeat(N,auto)]` for the subgrid, spelled out so Tailwind can see each class. */
const ROWS_CLASS: Record<number, string> = {
  2: 'lg:grid-rows-[repeat(2,auto)]',
  4: 'lg:grid-rows-[repeat(4,auto)]',
  6: 'lg:grid-rows-[repeat(6,auto)]',
  8: 'lg:grid-rows-[repeat(8,auto)]',
};
const SPAN_CLASS: Record<number, string> = {
  2: 'lg:row-span-2',
  4: 'lg:row-span-4',
  6: 'lg:row-span-6',
  8: 'lg:row-span-8',
};

function Champions({ leagueId }: { leagueId: LeagueId }) {
  const champions = getHistoryChampions(leagueId);
  if (champions.length === 0) return null;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4">
      {champions.map(({ division, row }) => {
        const team = row.slug ? getTeamBySlug(row.slug) : undefined;
        return (
          // Monogram on the left spanning three short lines, so the pair is ~190px tall on a
          // phone instead of ~300 and the first standings row stays near the first screen.
          <div
            key={division}
            className="sx-card grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 p-4 sm:p-5"
          >
            {team ? <TeamMonogram team={team} size={40} /> : null}
            <div className="col-start-2 min-w-0">
              <p className="m-0 text-micro font-medium text-ink-3">
                {getDivision(division)?.label ?? division} champion
              </p>
              <p className="m-0 mt-0.5 text-lead text-ink sm:text-title">{row.name}</p>
              <p className="m-0 mt-0.5 text-meta text-ink-2">{row.leagueRecord} league record</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AvailableLeague({ leagueId, entry }: { leagueId: LeagueId; entry: AvailableLeagueHistory }) {
  const league = getLeague(leagueId);
  const divisions = entry.divisions;
  // Which of the four blocks a division has is a property of the league: SCVAL has all four,
  // BVAL has varsity standings and varsity awards only. A league never shows an empty heading for
  // a block none of its divisions has.
  const hasJv = divisions.some((d) => d.standings.jv.length > 0);
  const hasVarsityAwards = divisions.some((d) => d.awards.varsity !== null);
  const hasJvAwards = divisions.some((d) => d.awards.jv !== null);
  const blocks = 1 + (hasJv ? 1 : 0) + (hasVarsityAwards ? 1 : 0) + (hasJvAwards ? 1 : 0);
  const rows = blocks * 2;
  const changes = getHistoryDivisionChanges(leagueId);
  const unpublishedTies = getHistoryUnpublishedTies(leagueId);
  const p = entry.provenance;

  return (
    <section id={leagueId} aria-label={league.name} className="min-w-0 scroll-mt-24">
      <SectionHeader
        size="lg"
        kicker={`${league.shortName} · ${league.name}`}
        meta={<span className="whitespace-nowrap">{SEASON}</span>}
      />
      <Champions leagueId={leagueId} />

      {/* From lg the divisions sit side by side and share the same row tracks (subgrid): each
          division's headings and blocks are its direct grid items, so the JV heading, the awards
          headings and the First/Second team labels line up across the pair even though one
          varsity table can have a row more than the other. Below lg the divisions simply stack. */}
      <div
        className={`mt-section grid gap-y-section md:mt-section-lg md:gap-y-section-lg lg:grid-cols-2 lg:gap-x-10 lg:gap-y-0 ${ROWS_CLASS[rows]}`}
      >
        {divisions.map((d) => {
          const label = d.label;
          return (
            <section
              key={d.division}
              className={`min-w-0 lg:grid lg:grid-rows-subgrid ${SPAN_CLASS[rows]}`}
              // A single-division league can share its id with that division (PCAL's division is
              // `pcal`): the league section already carries it, and an id must be unique.
              id={d.division === leagueId ? undefined : d.division}
              aria-label={`${league.shortName} ${label}`}
            >
              {/* `nowrap` on the season: a season identifier is one token, and as a shrinkable
                  flex child it broke at its own hyphen into "2025-" / "26" at 320px. */}
              <SectionHeader
                as="h3"
                size="section"
                kicker={`${label} · varsity final standings`}
                meta={<span className="whitespace-nowrap">{SEASON}</span>}
              />
              <HistoryStandingsTable
                rows={d.standings.varsity}
                caption={`${league.shortName} ${label} varsity final standings, ${SEASON}`}
                emptyLabel="No varsity standings were published for this division."
              />

              {hasJv ? (
                <>
                  <SectionHeader as="h3" size="section" kicker={`${label} · JV final standings`} className="mt-section" />
                  <HistoryStandingsTable
                    rows={d.standings.jv}
                    caption={`${league.shortName} ${label} JV final standings, ${SEASON}`}
                    emptyLabel="No JV standings were published for this division."
                  />
                </>
              ) : null}

              {hasVarsityAwards ? (
                <>
                  <SectionHeader
                    as="h3"
                    size="section"
                    kicker={`${label} · all-league awards, varsity`}
                    className="mt-section"
                  />
                  <AwardsBlock awards={d.awards.varsity} levelLabel="Varsity" />
                </>
              ) : null}

              {hasJvAwards ? (
                <>
                  <SectionHeader as="h3" size="section" kicker={`${label} · all-league awards, JV`} className="mt-section" />
                  <AwardsBlock awards={d.awards.jv} levelLabel="JV" />
                </>
              ) : null}
            </section>
          );
        })}
      </div>

      <div className="mt-section max-w-prose space-y-3 text-meta text-ink-3 md:mt-section-lg">
        {p.source === 'scval-pdf' ? (
          <p className="m-0">
            Source: scval.com &mdash;{' '}
            <ExternalLink href={p.standingsPdf}>{SEASON} final standings (PDF)</ExternalLink> and{' '}
            <ExternalLink href={p.allLeaguePdf}>{SEASON} all-league awards (PDF)</ExternalLink>. This page is built
            once from those PDFs, not from the live MaxPreps snapshot the rest of the site uses &mdash;
            MaxPreps only ever serves the current season. {league.shortName}&rsquo;s final PDFs list league
            records only; their overall-record column was empty for this season.
          </p>
        ) : (
          <p className="m-0">
            Source: bval.org &mdash;{' '}
            {/* `standingsSheet` is the CSV export the build reads; readers get the sheet itself. */}
            <ExternalLink href={p.standingsSheetView}>
              {SEASON} final standings (Google Sheet)
            </ExternalLink>
            {Object.entries(p.allLeagueDocs).map(([division, url], i, all) =>
              url ? (
                <span key={division}>
                  {i === 0 ? ' and the all-league documents: ' : ''}
                  <ExternalLink href={url}>{getDivision(division)?.label ?? division}</ExternalLink>
                  {i < all.length - 1 ? ' · ' : ''}
                </span>
              ) : null,
            )}
            . Read on {p.retrievedOn}. These are {league.shortName}&rsquo;s own documents, not the live MaxPreps
            snapshot the rest of the site uses &mdash; MaxPreps only ever serves the current season. Records are
            the sheet&rsquo;s league and overall records, written without the spaces it puts around each
            hyphen (its &ldquo;8 - 1 - 1&rdquo; is 8-1-1 here); a record it prints without a ties field stays
            W-L. It carries no points or goals, so none are shown or computed. JV is not shown: the sheet
            lists JV records but gives a JV place for one school only.
          </p>
        )}
        {unpublishedTies.length > 0 ? (
          <p className="m-0">
            {listWords(unpublishedTies.map((r) => r.name))}&rsquo;s record{unpublishedTies.length === 1 ? ' has' : 's have'} no
            ties field in the source ({unpublishedTies.map((r) => r.leagueRecord).join(', ')}), so{' '}
            {unpublishedTies.length === 1 ? 'it is' : 'they are'} shown as published; we do not assume zero ties.
          </p>
        ) : null}
        {changes.map((c) => (
          <p key={c.slug} className="m-0">
            {c.name} played in {getDivision(c.historyDivision)?.label ?? c.historyDivision} in {SEASON}, as the
            source lists it. {league.shortName}&rsquo;s current alignment on this site lists {c.name} in {getDivision(c.registryDivision)?.label ?? c.registryDivision}, so {c.name} moved.
          </p>
        ))}
      </div>
    </section>
  );
}

function UnavailableLeague({ leagueId, entry }: { leagueId: LeagueId; entry: UnavailableLeagueHistory }) {
  const league = getLeague(leagueId);
  // A league with no website of its own (EAL) links its section's field hockey page instead.
  const ownSite = league.officialUrl !== getSection(league.sectionId).officialUrl;
  return (
    <section id={leagueId} aria-label={league.name} className="min-w-0 scroll-mt-24">
      <SectionHeader
        size="lg"
        kicker={`${league.shortName} · ${league.name}`}
        meta={<span className="whitespace-nowrap">{SEASON}</span>}
      />
      <div className="sx-card mt-4 p-4 sm:p-5">
        <p className="m-0 text-lead text-ink">Unavailable</p>
        <p className="m-0 mt-2 max-w-prose text-body text-ink-2">{entry.reason}</p>
        {entry.alsoPublished?.length ? (
          <p className="m-0 mt-3 max-w-prose text-body text-ink-2">
            Official, from {league.shortName}:{' '}
            {entry.alsoPublished.map((doc, i) => (
              <span key={doc.url}>
                {i > 0 ? ' · ' : ''}
                <ExternalLink href={doc.url}>{doc.label}</ExternalLink>
              </span>
            ))}
            .
          </p>
        ) : null}
        {/* `break-words`: the checked list quotes whole URLs, which would otherwise widen a
            320px page past the screen. */}
        <p className="m-0 mt-3 max-w-prose break-words text-meta text-ink-3">
          Checked {entry.checkedOn}: {entry.checked.join('; ')}. Current-season {league.shortName} standings are on{' '}
          <Link href={`/standings/${leagueId}`} prefetch={false} className="text-accent hover:underline">
            the {league.shortName} standings page
          </Link>{' '}
          and {ownSite ? 'its official site is' : `its section’s field hockey page is`}{' '}
          <ExternalLink href={league.officialUrl}>{league.officialUrl.replace(/^https?:\/\/(www\.)?/, '')}</ExternalLink>.
        </p>
      </div>
    </section>
  );
}

export default function HistoryPage() {
  const tabs = HISTORY_LEAGUES.map(({ id }) => ({ href: `#${id}`, label: short(id) }));
  const available = listWords(AVAILABLE.map((l) => short(l.id)));

  return (
    // The sticky table heads park under the 48px top bar plus the 48px jump bar on a phone
    // (6rem); from md the pills sit in the title row and do not stick.
    <div className="pb-section-lg [--sx-sticky-top:6rem] md:[--sx-sticky-top:var(--spacing-topbar-lg)]">
      <PageHeader
        eyebrow="Archive"
        title={`${SEASON} final standings`}
        description={
          <>
            Final standings and all-league awards for {available}, from each league&rsquo;s own documents.{' '}
            {UNAVAILABLE_SUBJECT ? (
              <>
                {UNAVAILABLE_SUBJECT} unavailable: we found no official {SEASON} final standings.{' '}
              </>
            ) : null}
            This page doesn&rsquo;t change.
          </>
        }
        aside={<DivisionTabs variant="inline" tabs={tabs} label="Jump to a league" />}
        asideClassName="hidden md:block lg:hidden"
      />

      {/* Jump bar: a long page with a section per league to reach. Sticky under the top bar below
          md; at md the pills sit in the title row; from lg they are not shown. */}
      <DivisionTabs variant="bar" tabs={tabs} label="Jump to a league" className="mt-4" />

      <div className="mt-8 grid gap-y-section md:mt-10 md:gap-y-section-lg">
        {HISTORY_LEAGUES.map(({ id, entry }) =>
          entry.status === 'available' ? (
            <AvailableLeague key={id} leagueId={id} entry={entry} />
          ) : (
            <UnavailableLeague key={id} leagueId={id} entry={entry} />
          ),
        )}
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
