import StatTile from '../ui/StatTile';

import { keyDateRows, roundTiles, type KeyDateRow } from './playoff-view';
import type { PlayoffKeyDates } from '../../lib/types';

/**
 * The three round tiles of the DESIGN §3.8 wireframe, then every other published key date as a
 * real `<dl>`.
 *
 * Both halves read the SAME `playoffs.keyDates` record, so the tiles can never drift from the
 * list. Times are printed only where the source gives one (entries due 12:00 PM, seeding meeting
 * 1:00 PM, evaluation meeting 4:00 PM); the round dates are all-day in the CCS feed and are not
 * given an invented start time. Every date is a `<time datetime>` and every clock time is
 * labelled PT (DESIGN §10.11).
 */
export interface KeyDatesProps {
  keyDates: PlayoffKeyDates;
  /** true once the CCS iCal feed has corroborated the dates; undefined before the Oct 25 gate. */
  confirmed?: boolean;
  className?: string;
}

const TILE_KEYS = new Set(['quarterfinals', 'semifinals', 'finals']);

function DateItem({ row }: { row: KeyDateRow }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2">
      <dt className="sx-num w-24 shrink-0 text-meta text-ink">
        <time dateTime={row.dateKey}>{row.date}</time>
      </dt>
      <dd className="m-0 min-w-0 flex-1 text-meta">
        <span className="text-ink">{row.label}</span>
        {row.time ? (
          <>
            {' '}
            <span className="sx-num text-ink-2">{row.time}</span>
          </>
        ) : null}
        <span className="block text-ink-3">{row.detail}</span>
      </dd>
    </div>
  );
}

export function KeyDates({ keyDates, confirmed, className }: KeyDatesProps) {
  const tiles = roundTiles(keyDates);
  const rows = keyDateRows(keyDates);
  // The three rounds are the tiles; everything else is the list. Nothing is printed twice.
  const others = rows.filter((r) => !TILE_KEYS.has(r.key));

  return (
    <div className={className}>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <StatTile
            key={tile.key}
            value={tile.value}
            label={tile.label}
            sub={tile.sub}
            emphasis="default"
          />
        ))}
      </div>
      <dl className="mt-3 mb-0 divide-y divide-hairline border-t border-hairline">
        {others.map((row) => (
          <DateItem key={row.key} row={row} />
        ))}
      </dl>
      <p className="mt-2 mb-0 max-w-[62ch] text-meta text-ink-3">
        The higher seed hosts through the semifinals.{' '}
        {confirmed
          ? 'Every date above is corroborated by the CIF-CCS field hockey calendar.'
          : 'Dates from the CIF-CCS playoff-dates release and the two official SCVAL schedule PDFs. All times Pacific.'}
      </p>
    </div>
  );
}

export default KeyDates;
