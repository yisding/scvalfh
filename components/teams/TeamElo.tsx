import Link from 'next/link';

import { ordinal } from '../../lib/format';
import { ELO_BASE, ELO_PER_GOAL } from '../../lib/ratings';
import { plural } from '../ui/plural';
import type { TeamEloView } from './team-view';

/**
 * The team's Elo rating (DESIGN §20): one wide card under the stat tiles, the figure on the left
 * and what it means beside it (under it on a phone). The rating is lib/ratings.ts's, fitted to
 * every final between two of the four leagues' teams; the sub-line is the team's place on the
 * /leaders Elo board when the board lists it (its top 10), "provisional" for a team with fewer
 * games than the board needs, and otherwise how many games the rating counts. No team page names
 * a place below the board's top 10.
 *
 * The figure and its sub-line are one `<dl>` group, labelled as the stat tiles are, and a team
 * with no counted final shows the site's dash, read as "not rated", never a 1500 it has not
 * earned. The link goes to the board, whose note says how the rating is computed.
 */
export function TeamElo({ elo, className }: { elo: TeamEloView; className?: string }) {
  const { boardPlace } = elo;
  const sub =
    elo.elo === null
      ? 'no counted results yet'
      : boardPlace
        ? `${boardPlace.tied ? 'tied for ' : ''}${ordinal(boardPlace.rank)} on the Elo board`
        : elo.provisional
          ? `provisional, from ${plural(elo.games, 'game')}`
          : `from ${plural(elo.games, 'game')}`;

  return (
    <div id="elo" className={['sx-card p-3 md:flex md:items-start md:gap-6 md:p-4', className].filter(Boolean).join(' ')}>
      <dl className="m-0 md:w-48 md:shrink-0">
        <dt className="mb-0.5 block text-meta font-medium text-ink-3 md:mb-1">Elo rating</dt>
        <dd className="sx-figure m-0 block text-[1.5rem] leading-7 font-semibold tracking-[-0.02em] text-ink md:text-[1.75rem] md:leading-8">
          {elo.elo === null ? (
            <>
              <span aria-hidden="true">&mdash;</span>
              <span className="sr-only">not rated</span>
            </>
          ) : (
            elo.elo
          )}
        </dd>
        <dd className="m-0 mt-0.5 block text-micro text-ink-2 md:mt-1 md:text-meta">{sub}</dd>
      </dl>
      <p className="mt-2 mb-0 max-w-prose text-meta text-ink-2 md:mt-0">
        {elo.elo === null
          ? 'A rating needs at least one final against another of the four leagues’ teams. '
          : `Fitted to every final between two of the four leagues’ teams this season, so the strength of each opponent counts as well as each goal margin: ${ELO_BASE} is an average team and ${ELO_PER_GOAL} points is about a goal. `}
        {elo.provisional
          ? `The Elo board waits for ${plural(elo.minGames, 'game')}, so this one is provisional. `
          : null}
        <Link href="/leaders#elo-rating" prefetch={false} className="text-accent hover:underline">
          How it is computed
        </Link>
      </p>
    </div>
  );
}

export default TeamElo;
