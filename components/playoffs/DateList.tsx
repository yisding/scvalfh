import type { KeyDateRow } from './playoff-view';

/**
 * One chronological list of dated rows in a card: the CCS key dates (KeyDates) and the San Diego Section's round
 * calendar (/playoffs, the SoCal block) share it, so a date reads the same wherever it appears. A row set in ink
 * and semibold (`isRound`) is a tournament round; the rest are administrative dates. A time sits UNDER its date in
 * the date column (88px on a phone, 104px from md); every date is a `<time datetime>` and every clock time is
 * labelled PT (DESIGN §10.11). On a phone the card is a full-bleed band (`sx-bleed`); from md a card again.
 */
export function DateItem({ row }: { row: KeyDateRow }) {
  return (
    <li className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3 px-gutter py-3 md:grid-cols-[6.5rem_minmax(0,1fr)] md:px-5">
      <span className={`sx-num text-cell ${row.isRound ? 'font-medium text-ink' : 'text-ink-2'}`}>
        <time dateTime={row.dateKey}>{row.dateLabel}</time>
        {row.time ? <span className="block whitespace-nowrap text-ink-2">{row.time}</span> : null}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={['text-body text-ink', row.isRound ? 'font-semibold' : null].filter(Boolean).join(' ')}>
            {row.label}
          </span>
          {row.leagueShort ? <span className="sx-badge">{row.leagueShort}</span> : null}
        </span>
        {row.detail ? <span className="mt-0.5 block text-meta text-ink-2">{row.detail}</span> : null}
      </span>
    </li>
  );
}

export function DateList({ rows, className }: { rows: readonly KeyDateRow[]; className?: string }) {
  return (
    <div className={className}>
      {/* `my-0`, not `m-0`: a margin shorthand would cancel `sx-bleed`'s negative inline margin. */}
      <ol className="sx-card sx-flush sx-bleed my-0 list-none divide-y divide-divider p-0">
        {rows.map((row) => (
          <DateItem key={row.key} row={row} />
        ))}
      </ol>
    </div>
  );
}

export default DateList;
