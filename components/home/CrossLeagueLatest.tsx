import Link from 'next/link';

import SectionHeader from '../ui/SectionHeader';
import { shortDate } from '../../lib/format';

import type { CrossLeagueLatest as CrossLeagueLatestView } from './home-data';
import { ResultRow } from './LatestScores';

/**
 * The first-visit "what just happened" (SPEC §10.1, `data-scope="none"`): the latest results day
 * across every league, at most two rows per league, each league under its short name, then
 * `All N →` to /scores/[date]. The day is always named.
 */
export interface CrossLeagueLatestProps {
  view: CrossLeagueLatestView | null;
  className?: string;
}

export function CrossLeagueLatest({ view, className }: CrossLeagueLatestProps) {
  return (
    <section data-scope="none" aria-labelledby="latest-every-league" className={className}>
      <SectionHeader
        id="latest-every-league"
        kicker="Latest from every league"
        meta={view ? shortDate(view.date) : undefined}
        action={view ? { href: `/scores/${view.date}`, label: `All ${view.total}` } : undefined}
      />
      {view && view.groups.length > 0 ? (
        view.groups.map((group, i) => (
          <div key={group.leagueId} className={i === 0 ? 'mt-0' : 'mt-5'}>
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
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </p>
            ) : null}
          </div>
        ))
      ) : (
        <p className="m-0 text-meta text-ink-2">No results yet. Scores appear here the morning after a game is played.</p>
      )}
    </section>
  );
}

export default CrossLeagueLatest;
