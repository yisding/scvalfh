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

/** The pairing's purpose from its config label: the words after ' — ', sentence case. */
export function purposeOf(label: string): string | null {
  const at = label.indexOf(' — ');
  if (at < 0) return null;
  const tail = label.slice(at + 3).trim();
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
        // With a host, read "visitor at host": the visitor is listed first.
        const [a, b] = p.seats;
        const sides: [PlayInSide, PlayInSide] =
          p.connector === 'at' && a.host ? [toSide(b), toSide(a)] : [toSide(a), toSide(b)];
        return (
          <li key={p.id} className={single ? 'max-w-3xl' : undefined}>
            <PlayInCard
              title={p.title}
              when={{ dateKey: p.dateKey, dateLabel: p.dateLabel, timeLabel: p.timeLabel }}
              sides={sides}
              connector={p.connector}
              sentence={pairingSentence(p)}
              purpose={purposeOf(p.label)}
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
