import Link from 'next/link';

import ExternalLink from '@/components/ui/ExternalLink';
import SectionHeader from '@/components/ui/SectionHeader';
import { getLeague, getSection, isIndependentLeague, regionOf } from '@/lib/config/leagues';
import { type UnavailableLeagueHistory, bracketSectionName, getHistoryBracketFor } from '@/lib/datasets/history';
import type { LeagueId } from '@/lib/model/ids';

export default function UnavailableLeague({
  leagueId,
  entry,
  season,
}: {
  leagueId: LeagueId;
  entry: UnavailableLeagueHistory;
  /** '2025-26'. */
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
  return (
    <section
      id={leagueId}
      data-region-scope={regionOf(leagueId)}
      aria-label={league.name}
      className="min-w-0"
    >
      <SectionHeader
        size="lg"
        kicker={`${league.shortName} · ${league.name}`}
        meta={<span className="whitespace-nowrap">{season}</span>}
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
