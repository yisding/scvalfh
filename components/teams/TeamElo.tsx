import Link from 'next/link';

import { placeWords } from '../../lib/format';
import { plural } from '../words/plural';
import { FACT_ROW } from './TeamSplits';
import type { TeamEloView } from './team-view';

/**
 * The team's Elo rating (DESIGN §33): a rail section, `#elo` (the /leaders board links it), of two
 * plain rows and one link.
 *
 * Row one is the number, or "Not rated" for a team with neither a final this season nor a start
 * from last: never a 1500 it has not earned. Row two says where the number stands: the team's
 * place on its region's /leaders Elo board when the board lists it (its top 10; no team page names
 * a place below that), "Preseason, from 2025-26" for a team rated from last season alone,
 * "Provisional, 3 games" for one with fewer games than the board needs, otherwise how many games
 * the rating counts. How the number is worked out is said once, on the board the link goes to.
 */
export interface TeamEloProps {
  elo: TeamEloView;
  className?: string;
}

export function TeamElo({ elo, className }: TeamEloProps) {
  const { boardPlace } = elo;
  const second: { label: string; value: string } | null =
    elo.elo === null
      ? null
      : boardPlace
        ? { label: `${elo.boardRegion} Elo board`, value: placeWords(boardPlace.rank, boardPlace.tied) }
        : elo.preseason
          ? { label: 'Preseason', value: `from ${elo.seededFrom}` }
          : elo.provisional
            ? { label: 'Provisional', value: plural(elo.games, 'game') }
            : { label: 'Counted', value: plural(elo.games, 'game') };
  return (
    <section id="elo" aria-labelledby="elo-heading" className={['sx-section sx-target', className].filter(Boolean).join(' ')}>
      <h2 id="elo-heading">Rating</h2>
      <dl className="m-0 text-body text-ink">
        <div className={FACT_ROW}>
          <dt className="text-ink-2">Elo rating</dt>
          <dd className="sx-num m-0">{elo.elo === null ? 'Not rated' : elo.elo}</dd>
        </div>
        {second ? (
          <div className={FACT_ROW}>
            <dt className="text-ink-2">{second.label}</dt>
            <dd className="m-0">{second.value}</dd>
          </div>
        ) : null}
      </dl>
      <ul className="sx-linkrow">
        <li>
          <Link href={elo.boardHref} prefetch={false} className="sx-action">
            How it is computed
          </Link>
        </li>
      </ul>
    </section>
  );
}

export default TeamElo;
