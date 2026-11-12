import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { listWords } from '../../lib/format';
import {
  bracketSectionName,
  getHistoryBracketFor,
  getHistoryTournamentFor,
  type UnavailableLeagueHistory,
} from '../../lib/history/history';
import { TOC } from '../../lib/league-config/sections';
import { getLeague, getSection, isIndependentLeague, regionOf } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

export default function UnavailableLeague({
  leagueId,
  entry,
}: {
  leagueId: LeagueId;
  entry: UnavailableLeagueHistory;
  /** The archive's season ('2025-26'). */
  season: string;
}) {
  const league = getLeague(leagueId);
  // A league with no website of its own (EAL) links its section's field hockey page instead.
  const ownSite = league.officialUrl !== getSection(league.sectionId).officialUrl;
  // A document a league with no site of its own links is its section's (the San Diego Section's 2025
  // bracket sheet for its three conferences), so the card names the section as its publisher.
  const publisher = ownSite ? league.shortName : `the ${getSection(league.sectionId).name}`;
  // The CCS and San Diego Section brackets are on this page: the card says where.
  const bracket = isIndependentLeague(leagueId) ? null : getHistoryBracketFor(leagueId);
  // So is the Tournament of Champions, the Sunset's and the LA independents' postseason.
  const tournament = getHistoryTournamentFor(leagueId);
  return (
    <section
      id={leagueId}
      data-region-scope={regionOf(leagueId)}
      aria-label={league.name}
      className="sx-section sx-target min-w-0"
    >
      <SectionHeader kicker={isIndependentLeague(leagueId) ? league.name : league.shortName} />
      <p className="sx-empty">No standings available</p>
      <div className="max-w-prose">
        <p className="sx-note">{entry.reason}</p>
        {entry.alsoPublished?.length ? (
          <p className="sx-note">
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
          <p className="sx-note">
            The {bracketSectionName(bracket.id)}&rsquo;s 2025 playoff results are on this page:{' '}
            <a href={`#${bracket.id}`} className="sx-link">
              {getSection(bracket.id).briefLabel} playoffs
            </a>
            .
          </p>
        ) : null}
        {tournament ? (
          <p className="sx-note">
            The 2025 {TOC.name}, the postseason of{' '}
            {listWords(tournament.leagues.map((l) => `the ${getLeague(l).name}`))}, is on this page:{' '}
            <a href={`#${tournament.id}`} className="sx-link">
              {TOC.shortName} bracket
            </a>
            .
          </p>
        ) : null}
        {/* `break-words`: the checked list quotes whole URLs, which would otherwise widen a
            320px page past the screen. */}
        <p className="sx-note break-words">
          {/* A group of independents (DESIGN §24.10): its current table is this site's, under the group's name. */}
          {isIndependentLeague(leagueId) ? (
            <>
              Checked {entry.checkedOn}: {entry.checked.join('; ')}. This season&rsquo;s table of the {league.name} is on{' '}
              <Link href={`/standings/${leagueId}`} prefetch={false} className="sx-link">
                the {league.name} page
              </Link>{' '}
              and their section&rsquo;s field hockey page is{' '}
            </>
          ) : (
            <>
              Checked {entry.checkedOn}: {entry.checked.join('; ')}. Current-season {league.shortName} standings are on{' '}
              <Link href={`/standings/${leagueId}`} prefetch={false} className="sx-link">
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
