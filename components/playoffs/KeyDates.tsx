import Tag from '../ui/Tag';

import { keyDateRows, type KeyDateRow } from './playoff-view';
import type { PlayoffKeyDates } from '../../lib/types';

/**
 * Every published CCS key date as ONE chronological list in a card (brief §5.8). The three round
 * dates carry a "Round" tag; the rest are the same row without it, so nothing is printed twice and
 * nothing is dropped.
 *
 * `playoffs.keyDates` is the single source. Times are printed only where the source gives one
 * (entries due 12:00 PM, seeding meeting 1:00 PM, evaluation meeting 4:00 PM); the round dates are
 * all-day in the CCS feed and are not given an invented start time. Every date is a
 * `<time datetime>` and every clock time is labelled PT (DESIGN §10.11); the section header says
 * "all times PT".
 */
export interface KeyDatesProps {
  keyDates: PlayoffKeyDates;
  /** true once the CCS iCal feed has corroborated the dates; undefined before the Oct 25 gate. */
  confirmed?: boolean;
  className?: string;
}

const ROUND_KEYS = new Set(['quarterfinals', 'semifinals', 'finals']);

function DateItem({ row }: { row: KeyDateRow }) {
  return (
    <li className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3 px-5 py-3">
      <span className="sx-num text-cell text-ink-2">
        <time dateTime={row.dateKey}>{row.date}</time>
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-body text-ink">{row.label}</span>
          {ROUND_KEYS.has(row.key) ? <Tag>Round</Tag> : null}
          {row.time ? <span className="sx-num text-cell text-ink-2">{row.time}</span> : null}
        </span>
        {row.detail ? <span className="mt-0.5 block text-meta text-ink-2">{row.detail}</span> : null}
      </span>
    </li>
  );
}

export function KeyDates({ keyDates, confirmed, className }: KeyDatesProps) {
  const rows = keyDateRows(keyDates);

  return (
    <div className={className}>
      <ol className="sx-card sx-flush m-0 list-none divide-y divide-divider p-0">
        {rows.map((row) => (
          <DateItem key={row.key} row={row} />
        ))}
      </ol>
      <p className="mt-3 mb-0 max-w-prose text-meta text-ink-2">
        The higher seed hosts through the semifinals.{' '}
        {confirmed
          ? 'Every date above is corroborated by the CIF-CCS field hockey calendar.'
          : 'Dates from the CIF-CCS playoff-dates release and the two official SCVAL schedule PDFs. All times Pacific.'}
      </p>
    </div>
  );
}

export default KeyDates;
