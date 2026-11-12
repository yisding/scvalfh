import Link from 'next/link';

import { buildLeadersView } from '../../leaders/leaders-view';
import SectionHeader from '../../ui/SectionHeader';

/**
 * /about#ratings: how the Elo rating and the figures built on it are worked out (DESIGN §20, §33).
 * /leaders and each team page's Rating section link here; neither repeats the method.
 *
 * The sentences are the boards' own (`LeaderBoard.note` and `.method`, components/leaders/), read
 * from the view /leaders is built from, so the number a board ranks on and the words that explain
 * it cannot drift apart. One block per board that has a method, from the first region's boards: the
 * fit is one fit over every team, and the cross-region sentence is part of the Elo board's method.
 */
export function RatingsSection() {
  const view = buildLeadersView();
  const region = view.regions[0];
  // The Elo board first: the other figures are built on its ratings.
  const isElo = (id: string) => id.startsWith('elo-rating');
  const boards = region
    ? [...region.schools, ...region.players]
        .filter((board) => board.method !== null)
        .sort((x, y) => Number(isElo(y.id)) - Number(isElo(x.id)))
    : [];
  if (boards.length === 0) return null;
  return (
    <section id="ratings" className="sx-section">
      <SectionHeader kicker="Ratings" />
      <div className="sx-prose">
        {boards.map((board) => (
          <div key={board.id}>
            <h3>{board.title}</h3>
            <p>{board.note}</p>
            <p>{board.method}</p>
          </div>
        ))}
        {/* Who can be on a board: /leaders prints no notes of its own, so the sentence that names the
            teams with no player stats, the games a team board needs and whose totals lag is here. */}
        <div>
          <h3>Who is on a board</h3>
          {view.regions.map((r) => (
            <div key={r.region}>
              {view.regions.length > 1 ? <h4>{r.shortName}</h4> : null}
              {[...r.playerNotes, ...r.schoolNotes].map((note) => (
                <p key={note}>{note.replace('cannot appear here', 'cannot appear on a player board')}</p>
              ))}
              {r.lagging ? (
                <p>
                  {r.lagging.summary}: {r.lagging.items.join('; ')}.
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <p>
          Every board is under{' '}
          <Link href="/leaders" prefetch={false}>
            Leaders
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

export default RatingsSection;
