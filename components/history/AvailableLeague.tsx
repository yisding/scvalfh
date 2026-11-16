import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { listWords } from '../../lib/format';
import {
  getHistoryChampions,
  getHistoryDivisionChanges,
  getHistoryPastDivisions,
  getHistoryUnpublishedTies,
  historyPlaceShared,
  historySchoolName,
  type AvailableLeagueHistory,
} from '../../lib/history/history';
import { divisionHeading, getLeague, regionOf } from '../../lib/leagues';
import { SPORT } from '../../lib/sports/current';
import type { LeagueId } from '../../lib/types';

import AwardsBlock from './AwardsBlock';
import HistoryStandingsTable, { leagueHasOverall } from './HistoryStandingsTable';

/**
 * One link per all-league PDF, in division order: "De Anza" when one PDF covers both levels of a division,
 * "De Anza varsity" and "De Anza JV" when each level has its own.
 */
function allLeagueLinks(
  pdfs: Record<string, { varsity: string | null; jv: string | null }>,
  labelOf: (division: string) => string,
): Array<{ key: string; label: string; url: string }> {
  return Object.entries(pdfs).flatMap(([division, { varsity, jv }]) => {
    const label = labelOf(division);
    if (varsity && varsity === jv) return [{ key: division, label, url: varsity }];
    return [
      ...(varsity ? [{ key: `${division}-varsity`, label: `${label} varsity`, url: varsity }] : []),
      ...(jv ? [{ key: `${division}-jv`, label: `${label} JV`, url: jv }] : []),
    ];
  });
}

export default function AvailableLeague({
  leagueId,
  entry,
  season,
}: {
  leagueId: LeagueId;
  entry: AvailableLeagueHistory;
  /** The archive's season ('2025-26'). */
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
  const champions = new Set(getHistoryChampions(leagueId).map((c) => c.division));
  const changes = getHistoryDivisionChanges(leagueId);
  const unpublishedTies = getHistoryUnpublishedTies(leagueId);
  const sharedPlaces = divisions.some((d) =>
    [d.standings.varsity, d.standings.jv].some((rows) => rows.some((r) => historyPlaceShared(rows, r))),
  );
  const p = entry.provenance;
  const pastDivisions = getHistoryPastDivisions(leagueId);
  // A division's label as the season named it: the archive's, since it can be one the league no longer has.
  const labelOf = (division: string) => divisions.find((d) => d.division === division)?.label ?? division;
  // The source sentence's example: the league's first record, as the sheet prints it and as this page writes it.
  const sampleRecord = divisions[0]?.standings.varsity[0]?.leagueRecord ?? '';
  // Teams that moved within the league, grouped by where they came from and where they play now: one clause per
  // pair, so a league that realigned (BVAL girls volleyball moved 14 schools) gets one sentence, not a paragraph a
  // school. A school now in another league keeps its own note (below).
  const moves: Array<{ names: string[]; from: string; to: string }> = [];
  for (const c of changes.filter((c) => c.registryLeague === leagueId)) {
    const move = moves.find((m) => m.from === c.historyLabel && m.to === c.registryLabel);
    if (move) move.names.push(c.name);
    else moves.push({ names: [c.name], from: c.historyLabel, to: c.registryLabel });
  }

  // One strip heads a division's block: the division at the left, the level at its right end; a
  // single-division league whose division has no label of its own prints the level alone.
  const strip = (label: string, level: string) => <SectionHeader strip kicker={label} meta={level} />;

  return (
    <section id={leagueId} data-region-scope={regionOf(leagueId)} aria-label={league.name} className="sx-section sx-target min-w-0">
      <SectionHeader kicker={league.shortName} meta={league.name} />

      {/* Division pairs (`sx-two`), one pair per block: varsity standings, JV standings, varsity awards, JV
          awards. Each pair's two strips share a row from 768px, so the blocks line up across the divisions even
          though one table can have a row more than the other. Below that the divisions stack. A division's id
          sits on its varsity standings (a single-division league can share its id with that division, PCAL's
          `pcal`: the league section already carries it, and an id must be unique). */}
      <div className="sx-two">
        {divisions.map((d) => (
          <div key={d.division} id={d.division === leagueId ? undefined : d.division} className="sx-target min-w-0 pb-4">
            {strip(d.label, 'Varsity')}
            <HistoryStandingsTable
              rows={d.standings.varsity}
              caption={`${league.shortName} ${d.label} varsity final standings, ${season}`}
              emptyLabel="No varsity standings were published for this division."
              hasOverall={hasOverall}
              champion={champions.has(d.division)}
            />
          </div>
        ))}
      </div>

      {hasJv ? (
        <div className="sx-two">
          {divisions.map((d) => (
            <div key={d.division} className="min-w-0 pb-4">
              {strip(d.label, 'JV')}
              <HistoryStandingsTable
                rows={d.standings.jv}
                caption={`${league.shortName} ${d.label} JV final standings, ${season}`}
                emptyLabel="No JV standings were published for this division."
                hasOverall={hasOverall}
              />
            </div>
          ))}
        </div>
      ) : null}

      {hasVarsityAwards ? (
        <div className="sx-two">
          {divisions.map((d) => (
            <div key={d.division} className="min-w-0 pb-4">
              {strip(`${d.label} all-league`, 'Varsity')}
              <AwardsBlock awards={d.awards.varsity} levelLabel="Varsity" />
            </div>
          ))}
        </div>
      ) : null}

      {hasJvAwards ? (
        <div className="sx-two">
          {divisions.map((d) => (
            <div key={d.division} className="min-w-0 pb-4">
              {strip(`${d.label} all-league`, 'JV')}
              <AwardsBlock awards={d.awards.jv} levelLabel="JV" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="max-w-prose">
        {p.source === 'scval-documents' ? (
          <p className="sx-note">
            Source: scval.com &mdash;{' '}
            <ExternalLink href={p.standingsPdf}>{season} final standings (PDF)</ExternalLink> and the all-league
            awards (PDF):{' '}
            {allLeagueLinks(p.allLeaguePdfs, labelOf).map(({ key, label, url }, i, all) => (
              <span key={key}>
                <ExternalLink href={url}>{label}</ExternalLink>
                {i < all.length - 1 ? ' · ' : ''}
              </span>
            ))}
            . Read on {p.retrievedOn}. This page comes from those PDFs, not from the MaxPreps data the rest of the
            site uses &mdash; MaxPreps only ever serves the current season. {league.shortName}&rsquo;s final PDF
            lists league records only; its overall-record column was empty for this season.
          </p>
        ) : p.source === 'league-documents' ? (
          <p className="sx-note">
            Source: {p.publisher} &mdash;{' '}
            <ExternalLink href={p.standings.url}>
              {season} final standings ({p.standings.kind === 'pdf' ? 'PDF' : 'web page'})
            </ExternalLink>
            {p.allLeague ? (
              <>
                {' '}and{' '}
                <ExternalLink href={p.allLeague.url}>
                  {season} all-league teams ({p.allLeague.kind === 'pdf' ? 'PDF' : 'web page'})
                </ExternalLink>
              </>
            ) : null}
            . Read on {p.retrievedOn}. These are {league.shortName}&rsquo;s own documents, not the MaxPreps data the
            rest of the site uses &mdash; MaxPreps only ever serves the current season.{' '}
            {hasOverall
              ? 'Overall is the season record the standings print beside the league record.'
              : 'The standings print league records only.'}
            {sharedPlaces ? ` Teams ${league.shortName}’s table ranks level share a place, as it prints them.` : ''}
          </p>
        ) : p.source === 'scval-pdf' ? (
          <p className="sx-note">
            Source: scval.com &mdash;{' '}
            <ExternalLink href={p.standingsPdf}>{season} final standings (PDF)</ExternalLink> and{' '}
            <ExternalLink href={p.allLeaguePdf}>{season} all-league awards (PDF)</ExternalLink>. This page comes
            from those PDFs, not from the MaxPreps data the rest of the site uses &mdash;
            MaxPreps only ever serves the current season. {league.shortName}&rsquo;s final PDFs list league
            records only; their overall-record column was empty for this season.
          </p>
        ) : (
          <p className="sx-note">
            Source: bval.org &mdash;{' '}
            {/* `standingsSheet` is the CSV export the build reads; readers get the sheet itself. */}
            <ExternalLink href={p.standingsSheetView}>
              {season} final standings (Google Sheet)
            </ExternalLink>
            {Object.entries(p.allLeagueDocs).map(([division, url], i, all) =>
              url ? (
                <span key={division}>
                  {i === 0 ? ' and the all-league documents: ' : ''}
                  <ExternalLink href={url}>{labelOf(division)}</ExternalLink>
                  {i < all.length - 1 ? ' · ' : ''}
                </span>
              ) : null,
            )}
            . Read on {p.retrievedOn}. These are {league.shortName}&rsquo;s own documents, not the MaxPreps data
            the rest of the site uses &mdash; MaxPreps only ever serves the current season. Records are
            the sheet&rsquo;s league and overall records, written without the spaces it puts around each
            hyphen (its &ldquo;{sampleRecord.replace(/-/g, ' - ')}&rdquo; is {sampleRecord} here)
            {/* A sport whose games never end level (basketball, volleyball) has no ties or goals to speak of. */}
            {SPORT.scoring.allowsTies
              ? '; a record it prints without a ties field stays W-L. It carries no points or goals'
              : '. It carries no standings points or game scores'}
            , so none are shown or computed.
            {sharedPlaces ? ' Places are the sheet’s: schools it ranks level share a place, and the next place skips.' : ''}{' '}
            {p.jvNote}
          </p>
        )}
        {unpublishedTies.length > 0 ? (
          <p className="sx-note">
            {listWords(unpublishedTies.map((r) => historySchoolName(r.slug, r.name)))}&rsquo;s record{unpublishedTies.length === 1 ? ' has' : 's have'} no
            ties field in the source ({unpublishedTies.map((r) => r.leagueRecord).join(', ')}), so{' '}
            {unpublishedTies.length === 1 ? 'it is' : 'they are'} shown as published; we do not assume zero ties.
          </p>
        ) : null}
        {pastDivisions.length > 0 ? (
          <p className="sx-note">
            {listWords(pastDivisions.map((d) => d.label))} {pastDivisions.length === 1 ? 'was a division' : 'were divisions'} of{' '}
            {league.shortName}&rsquo;s {season} alignment, as the source lists {pastDivisions.length === 1 ? 'it' : 'them'};{' '}
            {league.shortName} no longer has {pastDivisions.length === 1 ? 'it' : 'them'}.
          </p>
        ) : null}
        {moves.length > 0 ? (
          <p className="sx-note">
            Teams that changed divisions since {season}, the source&rsquo;s division first and {league.shortName}&rsquo;s
            current alignment on this site second:{' '}
            {moves.map((m, i) => (
              <span key={`${m.from}-${m.to}`}>
                {listWords(m.names)} ({m.from} to {m.to}){i < moves.length - 1 ? '; ' : '.'}
              </span>
            ))}
          </p>
        ) : null}
        {changes
          .filter((c) => c.registryLeague !== leagueId)
          .map((c) => (
            <p key={c.slug} className="sx-note">
              {c.name} played in the {league.shortName} in {season}, as the source lists it, and is in the{' '}
              {getLeague(c.registryLeague).shortName}
              {divisionHeading(c.registryDivision) ? `’s ${divisionHeading(c.registryDivision)} division` : ''} now, so
              this site lists it there.
            </p>
          ))}
      </div>
    </section>
  );
}
