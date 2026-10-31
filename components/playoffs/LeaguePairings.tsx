import { matchupJoiner } from '../../lib/format';

import PlayInCard, { type PlayInSide } from './PlayInCard';
import { pairingSentence, type PairingView, type SeatView } from './playoff-view';

/**
 * A CCS league's postseason pairings from config (SPEC §6.1, §10.7): SCVAL's four Oct 30 crossover
 * games (#4 v #4 is the play-in for the SCVAL 7th automatic berth) and BVAL's Oct 31 play-in, where
 * the Santa Teresa champion hosts Mt. Hamilton #4.
 *
 * Replaces the old SCVAL-only crossover component: seat labels come from config (`seatLabels`), there is
 * no "is this side El Camino" mirror test, and a hosting seat is marked `(host)` in words. The
 * play-in card carries a 3px ink rule — a position, never a hue. Every seat follows the table, so the
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
  return tail ? `${tail[0].toUpperCase()}${tail.slice(1)}.` : null;
}

export function LeaguePairings({ pairings, className }: LeaguePairingsProps) {
  if (pairings.length === 0) return null;
  const single = pairings.length === 1;
  return (
    <ol
      className={[
        'm-0 list-none space-y-3 p-0',
        single ? null : 'lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {pairings.map((p) => {
        // Once the game exists the card reads as the game does (DESIGN §32.4): visitor first, then 'at' the home side
        // ('vs' at a neutral site), so "Santa Clara at Los Altos" on the card matches its own link. Before that, with a
        // host, "visitor at host"; with none, the config's seat order and 'vs'.
        const [a, b] = p.seats;
        const homeSlug = p.game?.home.slug ?? null;
        const holdsHome = (seat: SeatView) => homeSlug !== null && seat.contenders.some((c) => c.team.slug === homeSlug);
        const fromGame = p.game !== null && (holdsHome(a) || holdsHome(b));
        const sides: [PlayInSide, PlayInSide] = fromGame
          ? holdsHome(a)
            ? [toSide(b), toSide(a)]
            : [toSide(a), toSide(b)]
          : p.connector === 'at' && a.host
            ? [toSide(b), toSide(a)]
            : [toSide(a), toSide(b)];
        const connector = fromGame && p.game ? matchupJoiner(p.game) : p.connector;
        return (
          <li key={p.id} className={single ? 'max-w-3xl' : undefined}>
            {/* A lone play-in sits under a section header that already names it ('Play-in'), so
                it shows only its date and time. A lone crossover sits under 'Crossover and
                play-in', which does not, so it keeps its title (and its seeds); a set keeps every
                title to tell the games apart. */}
            <PlayInCard
              title={single && p.isPlayIn ? null : p.title}
              when={{ dateKey: p.dateKey, dateLabel: p.dateLabel, timeLabel: p.timeLabel }}
              sides={sides}
              connector={connector}
              sentence={pairingSentence(p)}
              purpose={purposeOf(p.label, p.title)}
              notes={p.notes}
              game={p.game}
              emphasis={p.isPlayIn && !single}
            />
          </li>
        );
      })}
    </ol>
  );
}

export default LeaguePairings;
