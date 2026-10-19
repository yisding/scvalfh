import AwardsBlock from '@/components/history/AwardsBlock';
import HistoryStandingsTable, { leagueHasOverall } from '@/components/history/HistoryStandingsTable';
import ExternalLink from '@/components/ui/ExternalLink';
import SectionHeader from '@/components/ui/SectionHeader';
import TeamMonogram from '@/components/ui/TeamMonogram';
import { getDivision, getLeague, regionOf } from '@/lib/config/leagues';
import {
  type AvailableLeagueHistory, getHistoryChampions, getHistoryDivisionChanges, getHistoryUnpublishedTies,
  historySchoolName,
} from '@/lib/datasets/history';
import { listWords } from '@/lib/format/words';
import type { LeagueId } from '@/lib/model/ids';
import { getTeamBySlug } from '@/lib/registry/teams';

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
    <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:gap-x-10">
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

export default function AvailableLeague({
  leagueId,
  entry,
  season,
}: {
  leagueId: LeagueId;
  entry: AvailableLeagueHistory;
  /** '2025-26'. */
  season: string;
}) {
  const league = getLeague(leagueId);
  const divisions = entry.divisions;
  // Which of the four blocks a division has is a property of the league: SCVAL has all four,
  // BVAL has varsity standings and varsity awards only. A league never shows an empty heading for
  // a block none of its divisions has.
  const hasJv = divisions.some((d) => d.standings.jv.length > 0);
  const hasVarsityAwards = divisions.some((d) => d.awards.varsity !== null);
  const hasJvAwards = divisions.some((d) => d.awards.jv !== null);
  // The Overall column too: every standings table of a league draws it or none does, so the
  // League and Overall columns sit at one x down the league's section and across its divisions.
  const hasOverall = leagueHasOverall(divisions.flatMap((d) => [d.standings.varsity, d.standings.jv]));
  const blocks = 1 + (hasJv ? 1 : 0) + (hasVarsityAwards ? 1 : 0) + (hasJvAwards ? 1 : 0);
  const rows = blocks * 2;
  const changes = getHistoryDivisionChanges(leagueId);
  const unpublishedTies = getHistoryUnpublishedTies(leagueId);
  const p = entry.provenance;

  return (
    <section id={leagueId} data-region-scope={regionOf(leagueId)} aria-label={league.name} className="min-w-0">
      <SectionHeader
        size="lg"
        kicker={`${league.shortName} · ${league.name}`}
        meta={<span className="whitespace-nowrap">{season}</span>}
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
              <SectionHeader as="h3" size="section" kicker={`${label} · varsity final standings`} />
              <HistoryStandingsTable
                rows={d.standings.varsity}
                caption={`${league.shortName} ${label} varsity final standings, ${season}`}
                emptyLabel="No varsity standings were published for this division."
                hasOverall={hasOverall}
              />

              {hasJv ? (
                <>
                  <SectionHeader as="h3" size="section" kicker={`${label} · JV final standings`} className="mt-section" />
                  <HistoryStandingsTable
                    rows={d.standings.jv}
                    caption={`${league.shortName} ${label} JV final standings, ${season}`}
                    emptyLabel="No JV standings were published for this division."
                    hasOverall={hasOverall}
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
            <ExternalLink href={p.standingsPdf}>{season} final standings (PDF)</ExternalLink> and{' '}
            <ExternalLink href={p.allLeaguePdf}>{season} all-league awards (PDF)</ExternalLink>. This page comes
            from those PDFs, not from the MaxPreps data the rest of the site uses &mdash;
            MaxPreps only ever serves the current season. {league.shortName}&rsquo;s final PDFs list league
            records only; their overall-record column was empty for this season.
          </p>
        ) : (
          <p className="m-0">
            Source: bval.org &mdash;{' '}
            {/* `standingsSheet` is the CSV export the build reads; readers get the sheet itself. */}
            <ExternalLink href={p.standingsSheetView}>
              {season} final standings (Google Sheet)
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
            . Read on {p.retrievedOn}. These are {league.shortName}&rsquo;s own documents, not the MaxPreps data
            the rest of the site uses &mdash; MaxPreps only ever serves the current season. Records are
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
            {c.name} played in {getDivision(c.historyDivision)?.label ?? c.historyDivision} in {season}, as the
            source lists it. {league.shortName}&rsquo;s current alignment on this site lists {c.name} in {getDivision(c.registryDivision)?.label ?? c.registryDivision}, so {c.name} moved.
          </p>
        ))}
      </div>
    </section>
  );
}
