import { keyDateRows, type KeyDateRow } from './playoff-view';
import type { PlayoffKeyDates } from '../../lib/types';

/**
 * Every published CCS key date as ONE chronological list in a card (brief §5.8). The three round
 * dates (quarterfinals, semifinals, final) are set in ink and semibold so the tournament's own dates
 * stand out from the administrative ones; nothing is printed twice and nothing is dropped.
 *
 * `playoffs.keyDates` is the single source. Times are printed only where the source gives one
 * (entries due 12:00 PM, seeding meeting 1:00 PM, evaluation meeting 4:00 PM); the round dates are
 * all-day in the CCS feed and are not given an invented start time. A time sits UNDER its date in
 * the 88px date column ("12:00 PM PT" is 86px of 13px mono), not after the title, where it pushed
 * "CCS seeding meeting 1:00 PM PT" onto two lines at 390. Every date is a `<time datetime>` and
 * every clock time is labelled PT (DESIGN §10.11); the section header says "all times PT".
 *
 * On a phone the card is a full-bleed band (`sx-bleed`) and each row takes the 16px gutter as its
 * own padding, the same as every other row list on the site; from md it is a card again.
 */
export interface KeyDatesProps {
  keyDates: PlayoffKeyDates;
  /** true once the CCS iCal feed has corroborated the dates; undefined before the Oct 25 gate. */
  confirmed?: boolean;
  className?: string;
}

const ROUND_KEYS = new Set(['quarterfinals', 'semifinals', 'finals']);

function DateItem({ row }: { row: KeyDateRow }) {
  const isRound = ROUND_KEYS.has(row.key);
  return (
    <li className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3 px-gutter py-3 md:px-5">
      <span className={`sx-num text-cell ${isRound ? 'font-medium text-ink' : 'text-ink-2'}`}>
        <time dateTime={row.dateKey}>{row.date}</time>
        {row.time && <span className="block whitespace-nowrap text-ink-2">{row.time}</span>}
      </span>
      <span className="min-w-0">
        <span className={`block text-body text-ink${isRound ? ' font-semibold' : ''}`}>
          {row.label}
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
      {/* `my-0`, not `m-0`: a margin shorthand would cancel `sx-bleed`'s negative inline margin. */}
      <ol className="sx-card sx-flush sx-bleed my-0 list-none divide-y divide-divider p-0">
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
