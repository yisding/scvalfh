import { matchupJoiner } from '../../lib/format';
import { capitalized } from '../words/capitalized';

import PlayInCard, { type PlayInSide } from './PlayInCard';
import { pairingSentence, type PairingView, type SeatView } from './playoff-view';

/**
 * A CCS league's postseason pairings from config (SPEC §6.1, §10.7): SCVAL's four Oct 30 crossover
 * games (#4 v #4 is the play-in for the SCVAL 7th automatic berth) and BVAL's Oct 31 play-in, where
 * the Santa Teresa champion hosts Mt. Hamilton #4.
 *
 * Replaces the old SCVAL-only crossover component: seat labels come from config (`seatLabels`), there is
 * no "is this side El Camino" mirror test, and a hosting seat is marked `(host)` in words. Each
 * pairing is a row (PlayInCard.tsx): the site's game row once the game exists. Every seat follows the table, so the
 * pairings move with every result; a seat with more than one contender says so in words.
 */
export interface LeaguePairingsProps {
  pairings: readonly PairingView[];
  className?: string;
}

function toSide(seat: SeatView): PlayInSide {
  return {
    label: seat.label,
    contenders: seat.contenders.map((c) => ({ team: c.team, standing: c.standing })),
    host: seat.host,
  };
}

/**
 * The pairing's purpose from its config label: the words after ' — ', sentence case, without a
 * leading word that repeats the card's title ('play-in for BVAL’s 4th automatic CCS berth' under
 * 'Play-in' reads 'For BVAL’s 4th automatic CCS berth.'; 'crossover (helps CCS ordering)' under
 * 'Crossover · #1 v #1' reads 'Helps CCS ordering.').
 */
function purposeOf(label: string, title: string): string | null {
  const at = label.indexOf(' — ');
  if (at < 0) return null;
  let tail = label.slice(at + 3).trim();
  const titleWord = title.split(/\s/)[0].toLowerCase();
  const [first, ...rest] = tail.split(' ');
  if (rest.length > 0 && first.toLowerCase() === titleWord) tail = rest.join(' ').replace(/^\((.*)\)$/, '$1');
  return tail ? `${capitalized(tail)}.` : null;
}

/**
 * The pairing as MaxPreps lists its game, when it does and one seat holds the home team: seats in visitor-home order,
 * the game's joiner, and the host mark only where the config's host seat is the home side. Unchanged otherwise.
 */
export function asListed(p: PairingView): PairingView {
  const homeSlug = p.game?.home.slug ?? null;
  if (!p.game || homeSlug === null) return p;
  const holdsHome = (seat: SeatView) => seat.contenders.some((c) => c.team.slug === homeSlug);
  const [a, b] = p.seats;
  if (!holdsHome(a) && !holdsHome(b)) return p;
  const [away, home] = holdsHome(a) ? [b, a] : [a, b];
  const connector = matchupJoiner(p.game);
  return {
    ...p,
    connector,
    seats: [
      { ...away, host: false },
      { ...home, host: home.host && connector === 'at' },
    ],
  };
}

export function LeaguePairings({ pairings, className }: LeaguePairingsProps) {
  if (pairings.length === 0) return null;
  const single = pairings.length === 1;
  return (
    // Rows on hairlines; a set of pairings is two columns from 1024px, and a lone one keeps to one column's width.
    <ol className={['sx-list', single ? 'lg:max-w-[calc(50%-1.25rem)]' : 'lg:grid lg:grid-cols-2 lg:gap-x-10', className].filter(Boolean).join(' ')}>
      {pairings.map((p) => {
        const view = asListed(p);
        const [a, b] = view.seats;
        const sides: [PlayInSide, PlayInSide] =
          view.connector === 'at' && a.host ? [toSide(b), toSide(a)] : [toSide(a), toSide(b)];
        return (
          <li key={p.id} id={p.id} className="sx-target min-w-0 pb-2">
            {/* A lone play-in sits under a heading that already names it ('Play-in'), so its note
                carries no title. A lone crossover sits under 'Crossover and play-in', which does not,
                so it keeps its title (and its seeds); a set keeps every title to tell the games apart. */}
            <PlayInCard
              title={single && p.isPlayIn ? null : p.title}
              when={{ dateKey: p.dateKey, dateLabel: p.dateLabel, timeLabel: p.timeLabel }}
              sides={sides}
              connector={view.connector}
              sentence={pairingSentence(view)}
              purpose={purposeOf(p.label, p.title)}
              notes={p.notes}
              game={p.game}
            />
          </li>
        );
      })}
    </ol>
  );
}

export default LeaguePairings;
