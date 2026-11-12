import type { KeyDateRow } from './playoff-view';

/**
 * One chronological list of dated rows, a plain `<dl>` on hairlines: the CCS key dates (KeyDates) and the San
 * Diego Section's round calendar (/playoffs, the SoCal block) share it, so a date reads the same wherever it
 * appears. A row set semibold (`isRound`) is a tournament round; the rest are administrative dates. A time sits
 * UNDER its date in the date column; every date is a `<time datetime>` and every clock time is labelled PT
 * (DESIGN §10.11). With `today` (the snapshot's Pacific day, never Date.now), a date already past is grey.
 */
export function DateItem({ row, today }: { row: KeyDateRow; today?: string }) {
  const past = today !== undefined && row.dateKey.slice(0, 10) < today;
  const ink = past ? 'text-ink-3' : 'text-ink';
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-t border-divider py-2 first:border-t-0">
      <dt className={`sx-num text-body ${past ? 'text-ink-3' : 'text-ink-2'}`}>
        <time dateTime={row.dateKey}>{row.dateLabel}</time>
        {row.time ? <span className="block whitespace-nowrap text-cell">{row.time}</span> : null}
      </dt>
      <dd className="m-0 min-w-0">
        <span className={[`text-body ${ink}`, row.isRound ? 'font-semibold' : null].filter(Boolean).join(' ')}>{row.label}</span>
        {row.leagueShort ? <span className={`ml-2 text-cell ${past ? 'text-ink-3' : 'text-ink-2'}`}>{row.leagueShort}</span> : null}
        {row.detail ? <span className={`block text-cell ${past ? 'text-ink-3' : 'text-ink-2'}`}>{row.detail}</span> : null}
      </dd>
    </div>
  );
}

export function DateList({ rows, today, className }: { rows: readonly KeyDateRow[]; today?: string; className?: string }) {
  return (
    <dl className={['m-0 max-w-prose', className].filter(Boolean).join(' ')}>
      {rows.map((row) => (
        <DateItem key={row.key} row={row} today={today} />
      ))}
    </dl>
  );
}

export default DateList;
