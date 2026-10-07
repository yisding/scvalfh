import type { Metadata } from 'next';
import Link from 'next/link';

import AwardsBlock from '../../../components/history/AwardsBlock';
import { divisionChampion, finalLine, sideName } from '../../../components/history/bracket-view';
import HistoryBracket from '../../../components/history/HistoryBracket';
import HistoryStandingsTable from '../../../components/history/HistoryStandingsTable';
import ExternalLink from '../../../components/ui/ExternalLink';
import { RegionSwitcher } from '../../../components/layout/LeagueSwitcher';
import PageHeader from '../../../components/layout/PageHeader';
import DivisionTabs from '../../../components/standings/DivisionTabs';
import TeamMonogram from '../../../components/ui/TeamMonogram';
import SectionHeader from '../../../components/ui/SectionHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../components/layout/site';
import { getTeamBySlug } from '../../../lib/data';
import {
  bracketSectionName,
  getAvailableHistoryLeagues,
  getHistoryBracketFor,
  getHistoryBrackets,
  getHistoryChampions,
  getHistoryDivisionChanges,
  getHistoryLeagues,
  getHistorySeason,
  getHistoryUnpublishedTies,
  getUnavailableHistoryLeagues,
  historySchoolName,
  type AvailableLeagueHistory,
  type BracketSectionId,
  type SectionBracket,
  type UnavailableLeagueHistory,
} from '../../../lib/history';
import { dateWithYear, listWords } from '../../../lib/format';
import { getDivision, getLeague, getSection, isIndependentLeague, regionOf } from '../../../lib/leagues';
import type { LeagueId } from '../../../lib/types';

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
 * The leagues, divisions and notes all come from `data/history-2025-26.json` and lib/leagues.ts,
 * never from a literal list, so a league cannot be dropped or invented here. The header says only
 * what a reader needs before the tables in a short lede; provenance detail sits in each league's
 * source note. A long lede here pushed the first standings row under the phone tab bar.
 */
const SEASON = getHistorySeason();
const HISTORY_LEAGUES = getHistoryLeagues();
const BRACKETS = getHistoryBrackets();
/** "the CCS and San Diego Section": the sections whose brackets the page shows. */
const BRACKET_SECTIONS = listWords(BRACKETS.map((b) => getSection(b.id).briefLabel));
const AVAILABLE = getAvailableHistoryLeagues();
const UNAVAILABLE = getUnavailableHistoryLeagues();
const short = (id: LeagueId) => getLeague(id).shortName;
/**
 * The unavailable leagues, and the groups of independents (the LA independents, DESIGN §24.9,
 * §24.10): "we found no official final standings" is said of the first only, since the group is this site's
 * grouping and nobody published a table of it.
 */
const UNAVAILABLE_LEAGUES = UNAVAILABLE.filter((l) => !isIndependentLeague(l.id));
const UNAVAILABLE_GROUPS = UNAVAILABLE.filter((l) => isIndependentLeague(l.id));
/** "PCAL, MCAL and EAL are", "MCAL is", or null when every league has its tables. */
const UNAVAILABLE_SUBJECT = UNAVAILABLE_LEAGUES.length
  ? `${listWords(UNAVAILABLE_LEAGUES.map((l) => short(l.id)))} ${UNAVAILABLE_LEAGUES.length === 1 ? 'is' : 'are'}`
  : null;
/** "The LA independents are this site’s grouping, so no table of them was published.", or null with no such group. */
const GROUPS_SENTENCE = UNAVAILABLE_GROUPS.length
  ? `${listWords(UNAVAILABLE_GROUPS.map((l) => `the ${getLeague(l.id).name}`)).replace(/^t/, 'T')} are this site’s grouping, so no table of them was published.`
  : null;

/** The page's title, and its og:title too: og:title never carries the site-name suffix (OG_BASE). */
const PAGE_TITLE = `${SEASON} final standings`;

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description:
    `Final ${listWords(AVAILABLE.map((l) => short(l.id)))} girls field hockey standings` +
    ` and all-league awards from the ${SEASON} season, from each league’s own documents, and the` +
    ` ${BRACKET_SECTIONS} playoff brackets.` +
    (UNAVAILABLE_SUBJECT
      ? ` ${UNAVAILABLE_SUBJECT} marked unavailable: we found no official ${SEASON} final standings.`
      : '') +
    (GROUPS_SENTENCE ? ` ${GROUPS_SENTENCE}` : ''),
  alternates: { canonical: '/history/2025-26' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/history/2025-26' },
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
              <p className="m-0 mt-0.5 text-lead text-ink sm:text-title">{historySchoolName(row.slug, row.name)}</p>
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
    <section id={leagueId} data-region-scope={regionOf(leagueId)} aria-label={league.name} className="min-w-0 scroll-mt-24">
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
                    kicker={`${label} · varsity all-league awards`}
                    className="mt-section"
                  />
                  <AwardsBlock awards={d.awards.varsity} levelLabel="Varsity" />
                </>
              ) : null}

              {hasJvAwards ? (
                <>
                  <SectionHeader as="h3" size="section" kicker={`${label} · JV all-league awards`} className="mt-section" />
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
            {listWords(unpublishedTies.map((r) => historySchoolName(r.slug, r.name)))}&rsquo;s record{unpublishedTies.length === 1 ? ' has' : 's have'} no
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

/** The source line of a section's bracket block, in that section's words. */
function BracketSources({ id, bracket }: { id: BracketSectionId; bracket: SectionBracket }) {
  const links = bracket.sources.map((doc, i) => (
    <span key={doc.url}>
      {i > 0 ? ' · ' : ''}
      <ExternalLink href={doc.url}>{doc.label}</ExternalLink>
    </span>
  ));
  const read = `Read on ${dateWithYear(bracket.retrievedOn)}.`;
  return id === 'ccs' ? (
    <p className="m-0">
      Source: the CCS&rsquo;s own pages &mdash; {links}. {read} The bracket pages draw their scores from
      MaxPreps; both finals match the CCS&rsquo;s field hockey history, which names each final&rsquo;s site.
      The Willow Glen&ndash;Stevenson shootout score is the game&rsquo;s box score, which the bracket links.
    </p>
  ) : (
    <p className="m-0">
      Source: the San Diego Section&rsquo;s own documents &mdash; {links}. {read} The bracket sheet names
      each champion but leaves the finals&rsquo; scores blank; the Open and Division I final scores are the
      Record Book&rsquo;s, which does not list the 2025 Division II final yet, so that score is not shown.
    </p>
  );
}

function SectionBracketBlock({ id, bracket }: { id: BracketSectionId; bracket: SectionBracket }) {
  const section = getSection(id);
  const name = bracketSectionName(id);
  return (
    <section id={id} data-region-scope={section.region} aria-label={`${name} playoffs`} className="min-w-0 scroll-mt-24">
      <SectionHeader
        size="lg"
        kicker={`${section.shortName} playoffs · ${name}`}
        meta={<span className="whitespace-nowrap">{SEASON}</span>}
      />
      <div className={`mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4 ${bracket.divisions.length > 2 ? 'lg:grid-cols-3' : ''}`}>
        {bracket.divisions.map((d) => {
          const { champion, final } = divisionChampion(d);
          const team = getTeamBySlug(champion.slug);
          return (
            <div key={d.id} className="sx-card grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 p-4 sm:p-5">
              {team ? <TeamMonogram team={team} size={40} /> : null}
              <div className="col-start-2 min-w-0">
                <p className="m-0 text-micro font-medium text-ink-3">{d.label} champion</p>
                <p className="m-0 mt-0.5 text-lead text-ink sm:text-title">{sideName(champion)}</p>
                <p className="m-0 mt-0.5 text-meta text-ink-2">{finalLine(final)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {bracket.divisions.map((d) => (
        <section key={d.id} id={`${id}-${d.id}`} aria-label={`${section.shortName} ${d.label}`} className="mt-section min-w-0 md:mt-section-lg">
          <SectionHeader
            as="h3"
            size="section"
            kicker={`${d.label} · bracket`}
            meta={<span className="whitespace-nowrap">{SEASON}</span>}
            className="mb-4"
          />
          <HistoryBracket division={d} label={`${name} ${d.label} bracket, ${SEASON}`} />
        </section>
      ))}

      <div className="mt-section max-w-prose space-y-3 text-meta text-ink-3 md:mt-section-lg">
        <BracketSources id={id} bracket={bracket} />
      </div>
    </section>
  );
}

function UnavailableLeague({ leagueId, entry }: { leagueId: LeagueId; entry: UnavailableLeagueHistory }) {
  const league = getLeague(leagueId);
  // A league with no website of its own (EAL) links its section's field hockey page instead.
  const ownSite = league.officialUrl !== getSection(league.sectionId).officialUrl;
  // A document a league with no site of its own links is its section's (the San Diego Section's 2025
  // bracket sheet for its three conferences), so the card names the section as its publisher.
  const publisher = ownSite ? league.shortName : `the ${getSection(league.sectionId).name}`;
  // The CCS and San Diego Section brackets are on this page: the card says where.
  const bracket = isIndependentLeague(leagueId) ? null : getHistoryBracketFor(leagueId);
  return (
    <section
      id={leagueId}
      data-region-scope={regionOf(leagueId)}
      aria-label={league.name}
      className="min-w-0 scroll-mt-24"
    >
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
            Official, from {publisher}:{' '}
            {entry.alsoPublished.map((doc, i) => (
              <span key={doc.url}>
                {i > 0 ? ' · ' : ''}
                <ExternalLink href={doc.url}>{doc.label}</ExternalLink>
              </span>
            ))}
            .
          </p>
        ) : null}
        {bracket ? (
          <p className="m-0 mt-3 max-w-prose text-body text-ink-2">
            The {bracketSectionName(bracket.id)}&rsquo;s 2025 playoff results are on this page:{' '}
            <a href={`#${bracket.id}`} className="text-accent hover:underline">
              {getSection(bracket.id).briefLabel} playoffs
            </a>
            .
          </p>
        ) : null}
        {/* `break-words`: the checked list quotes whole URLs, which would otherwise widen a
            320px page past the screen. */}
        <p className="m-0 mt-3 max-w-prose break-words text-meta text-ink-3">
          {/* A group of independents (DESIGN §24.10): its current table is this site's, under the group's name. */}
          {isIndependentLeague(leagueId) ? (
            <>
              Checked {entry.checkedOn}: {entry.checked.join('; ')}. This season&rsquo;s table of the {league.name} is on{' '}
              <Link href={`/standings/${leagueId}`} prefetch={false} className="text-accent hover:underline">
                the {league.name} page
              </Link>{' '}
              and their section&rsquo;s field hockey page is{' '}
            </>
          ) : (
            <>
              Checked {entry.checkedOn}: {entry.checked.join('; ')}. Current-season {league.shortName} standings are on{' '}
              <Link href={`/standings/${leagueId}`} prefetch={false} className="text-accent hover:underline">
                the {league.shortName} standings page
              </Link>{' '}
              and {ownSite ? 'its official site is' : `its section’s field hockey page is`}{' '}
            </>
          )}
          <ExternalLink href={league.officialUrl}>{league.officialUrl.replace(/^https?:\/\/(www\.)?/, '')}</ExternalLink>.
        </p>
      </div>
    </section>
  );
}

export default function HistoryPage() {
  // Each pill is region-scoped (DESIGN-socal §2.4): the reader's region's leagues only.
  // A section's bracket pill follows its last league's, as the block does.
  const tabs = HISTORY_LEAGUES.flatMap(({ id }) => [
    { href: `#${id}`, label: short(id), region: regionOf(id) },
    ...BRACKETS.filter((b) => b.afterLeague === id).map((b) => ({
      href: `#${b.id}`,
      label: `${getSection(b.id).shortName} playoffs`,
      region: getSection(b.id).region,
    })),
  ]);
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
            Final standings and all-league awards for {available}, from each league&rsquo;s own documents,
            and the {BRACKET_SECTIONS} playoff brackets.{' '}
            {UNAVAILABLE_SUBJECT ? (
              <>
                {UNAVAILABLE_SUBJECT} unavailable: we found no official {SEASON} final standings.{' '}
              </>
            ) : null}
            {GROUPS_SENTENCE ? <>{GROUPS_SENTENCE} </> : null}
            This page doesn&rsquo;t change.
          </>
        }
        aside={<DivisionTabs variant="inline" tabs={tabs} label="Jump to a league" />}
        asideClassName="hidden md:block lg:hidden"
      />

      {/* The region control, its own row above the sticky jump bar (DESIGN-socal §2.4). */}
      <RegionSwitcher className="mt-4" />

      {/* Jump bar: a long page with a section per league to reach. Sticky under the top bar below
          md; at md the pills sit in the title row; from lg they are not shown. */}
      <DivisionTabs variant="bar" tabs={tabs} label="Jump to a league" className="mt-4" />

      <div className="mt-8 grid gap-y-section md:mt-10 md:gap-y-section-lg">
        {HISTORY_LEAGUES.flatMap(({ id, entry }) => [
          entry.status === 'available' ? (
            <AvailableLeague key={id} leagueId={id} entry={entry} />
          ) : (
            <UnavailableLeague key={id} leagueId={id} entry={entry} />
          ),
          ...BRACKETS.filter((b) => b.afterLeague === id).map((b) => (
            <SectionBracketBlock key={b.id} id={b.id} bracket={b.bracket} />
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
