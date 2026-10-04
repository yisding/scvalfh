import { keyDateRows, type KeyDateRow, type LeagueKeyDate } from './playoff-view';
import type { CcsKeyDates } from '../../lib/types';

/**
 * Every published CCS key date, plus each CCS league's own postseason date (the SCVAL crossover and
 * 4th-place play-in, the BVAL play-in), as ONE chronological list in a card (brief §5.8). A league
 * date carries its league's short name as a label, so nobody reads the BVAL play-in as a CCS round.
 * The three round dates (quarterfinals, semifinals, final) are set in ink and semibold so the
 * tournament's own dates stand out from the administrative ones; nothing is printed twice and
 * nothing is dropped.
 *
 * Times are printed only where the source gives one (entries due 12:00 PM, seeding meeting 1:00 PM,
 * evaluation meeting 4:00 PM, the BVAL play-in 11 AM); the round dates are all-day in the CCS feed
 * and are not given an invented start time. A time sits UNDER its date in the 88px date column
 * ("12:00 PM PT" is 86px of 13px mono), not after the title, where it pushed "CCS seeding meeting
 * 1:00 PM PT" onto two lines at 390. Every date is a `<time datetime>` and every clock time is
 * labelled PT (DESIGN §10.11).
 *
 * On a phone the card is a full-bleed band (`sx-bleed`) and each row takes the 16px gutter as its
 * own padding, the same as every other row list on the site; from md it is a card again.
 */
export interface KeyDatesProps {
  keyDates: CcsKeyDates;
  /** League-owned dates from config pairings (crossover, play-in). */
  leagueDates?: readonly LeagueKeyDate[];
  /** true once the CCS iCal feed has corroborated the dates; undefined before the Oct 25 gate. */
  confirmed?: boolean;
  className?: string;
}

function DateItem({ row }: { row: KeyDateRow }) {
  return (
    <li className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3 px-gutter py-3 md:px-5">
      <span className={`sx-num text-cell ${row.isRound ? 'font-medium text-ink' : 'text-ink-2'}`}>
        <time dateTime={row.dateKey}>{row.date}</time>
        {row.time ? <span className="block whitespace-nowrap text-ink-2">{row.time}</span> : null}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {row.league ? <span className="sx-badge">{row.league}</span> : null}
          <span className={['text-body text-ink', row.isRound ? 'font-semibold' : null].filter(Boolean).join(' ')}>
            {row.label}
          </span>
        </span>
        {row.detail ? <span className="mt-0.5 block text-meta text-ink-2">{row.detail}</span> : null}
      </span>
    </li>
  );
}

export function KeyDates({ keyDates, leagueDates = [], confirmed, className }: KeyDatesProps) {
  const rows = keyDateRows(keyDates, leagueDates);

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
          ? 'Every CCS date above is corroborated by the CIF-CCS field hockey calendar; league dates come from the official league schedules.'
          : 'Dates from the CIF-CCS playoff-dates release and the official league schedules. All times Pacific.'}
      </p>
    </div>
  );
}

export default KeyDates;
