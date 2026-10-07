import Link from 'next/link';

import Arrow from '../ui/Arrow';
import EmptyState from '../ui/EmptyState';
import SectionHeader from '../ui/SectionHeader';
import { shortDate } from '../../lib/format';

import type { CrossLeagueLatest as CrossLeagueLatestView } from './home-view';
import { ResultRow } from './LatestScores';

/**
 * The first-visit "what just happened" (SPEC §10.1, `data-scope="none"`): the latest results day
 * across every league of one region, at most two rows per league, each league under its short name,
 * then `All N →` to /scores/[date]. The day is always named.
 *
 * Rendered once per region (DESIGN-socal §2.4): the section carries `data-region-scope`, so the scope
 * stylesheet shows the reader's region (both, NorCal first, without JS), and the SoCal copy's heading id
 * takes the `-socal` suffix (`latest-every-league-socal`) while NorCal keeps today's id.
 */
export interface CrossLeagueLatestProps {
  view: CrossLeagueLatestView | null;
  /** The region this block summarises: its `data-region-scope`, and the words of its kicker. */
  region: { id: 'norcal' | 'socal'; shortName: string; idSuffix: '' | '-socal' };
  className?: string;
}

export function CrossLeagueLatest({ view, region, className }: CrossLeagueLatestProps) {
  const headingId = `latest-every-league${region.idSuffix}`;
  return (
    <section data-scope="none" data-region-scope={region.id} aria-labelledby={headingId} className={className}>
      <SectionHeader
        id={headingId}
        kicker={`Latest from every ${region.shortName} league`}
        meta={view ? shortDate(view.date) : undefined}
        action={view ? { href: `/scores/${view.date}`, label: `All ${view.total}` } : undefined}
      />
      {view && view.groups.length > 0 ? (
        // Two-up from 768px: a full-width row put each score a thousand pixels from its team name.
        <div className="md:grid md:grid-cols-2 md:items-start md:gap-x-6 md:gap-y-6">
          {view.groups.map((group, i) => (
            <div key={group.leagueId} className={i === 0 ? 'mt-0' : 'mt-5 md:mt-0'}>
              <h3 className="m-0 mb-2 text-lead text-ink">{group.shortName}</h3>
              <div className="sx-card sx-flush sx-bleed">
                <ol className="sx-list">
                  {group.games.map((game) => (
                    <li key={game.contestId}>
                      <ResultRow game={game} />
                    </li>
                  ))}
                </ol>
              </div>
              {group.total > group.games.length ? (
                <p className="mt-2 mb-0 text-meta">
                  <Link href={`/scores/${view.date}`} prefetch={false} className="sx-action text-accent hover:underline">
                    {group.total - group.games.length} more {group.shortName}{' '}
                    {group.total - group.games.length === 1 ? 'game' : 'games'} that day{' '}
                    <Arrow />
                  </Link>
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        // The composition each league panel uses for the same state (LeaguePanel), pointed at the
        // cross-league schedule index rather than one league's.
        <EmptyState heading="No results yet." action={{ href: '/schedule', label: 'All schedules' }}>
          Scores appear here the morning after a game is played.
        </EmptyState>
      )}
    </section>
  );
}

export default CrossLeagueLatest;
