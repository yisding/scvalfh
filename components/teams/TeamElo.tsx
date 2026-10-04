import Link from 'next/link';

import { ordinal } from '../../lib/format';
import { ELO_BASE, ELO_PER_GOAL } from '../../lib/ratings';
import { plural } from '../ui/plural';
import type { TeamEloView } from './team-view';

/**
 * The team's Elo rating (DESIGN §20.2), kept low on purpose: a closed disclosure under the stat
 * tiles, beside "How these numbers are counted", whose summary says only "Elo rating". A family
 * checking its team's page meets the record first and never a low number it did not ask for; the
 * rating is an estimate, not a result, so it waits one tap away. It is the one team-specific
 * figure the site keeps in a disclosure (app/globals.css explains the rule it is the exception
 * to). `#elo` is the `<details>` itself, so a link from the /leaders board lands on the summary in
 * every browser.
 *
 * Opened, it reads "<rating> points · <where it stands>": the team's place on the /leaders Elo
 * board when the board lists it (its top 10), "preseason" for a team rated from last season
 * alone, "provisional" for one with fewer games than the board needs, otherwise how many games the
 * rating counts. Then what the number means, and `How it is computed` → the board, whose note says
 * the rest. No team page names a place below the board's top 10, and a team with neither a final
 * this season nor a start from last reads "Not rated", never a 1500 it has not earned.
 */
export function TeamElo({ elo, className }: { elo: TeamEloView; className?: string }) {
  const { boardPlace } = elo;
  const sub =
    elo.elo === null
      ? 'no counted results yet'
      : boardPlace
        ? `${boardPlace.tied ? 'tied for ' : ''}${ordinal(boardPlace.rank)} on the Elo board`
        : elo.preseason
          ? `preseason, from ${elo.seededFrom}`
          : elo.provisional
            ? `provisional, from ${plural(elo.games, 'game')}`
            : `from ${plural(elo.games, 'game')}`;
  const scale = `${ELO_BASE} is an average team and ${ELO_PER_GOAL} points is about a goal. `;
  const about =
    elo.elo === null
      ? 'A rating needs at least one final against another of the four leagues’ teams. '
      : elo.preseason
        ? `No counted result this season yet, so this is where it starts: its ${elo.seededFrom} rating, fitted to last season’s finals. ${scale}`
        : `Fitted to every final between two of the four leagues’ teams this season, so each opponent’s strength counts as well as each goal margin.${
            elo.seeded
              ? ` It started the season from its ${elo.seededFrom} rating, which counts for one game.`
              : elo.seededFrom
                ? ` It played no ${elo.seededFrom} final against the four leagues’ teams, so it started from an average rating.`
                : ''
          } ${scale}`;

  return (
    <details id="elo" className={['sx-disclosure', className].filter(Boolean).join(' ')}>
      <summary>Elo rating</summary>
      <div className="mt-1 mb-2 max-w-prose text-meta text-ink-2">
        <p className="m-0">
          {elo.elo === null ? (
            <span className="text-ink">Not rated</span>
          ) : (
            <span className="text-ink">
              <span className="sx-num font-semibold">{elo.elo}</span> points
            </span>
          )}{' '}
          <span aria-hidden="true">&middot;</span> {sub}
        </p>
        <p className="mt-1 mb-0">
          {about}
          {elo.provisional
            ? `The Elo board waits for ${plural(elo.minGames, 'game')}, so this one is provisional. `
            : null}
          <Link href="/leaders#elo-rating" prefetch={false} className="text-accent hover:underline">
            How it is computed
          </Link>
        </p>
      </div>
    </details>
  );
}

export default TeamElo;
