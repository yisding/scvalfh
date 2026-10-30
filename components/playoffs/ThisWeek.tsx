import Link from 'next/link';

import SectionHeader from '../ui/SectionHeader';
import { shortDate } from '../../lib/format';

import type { ThisWeekRow, ThisWeekView } from './this-week';

/**
 * "This week in the postseason" (view model buildThisWeek, this-week.ts): one strip per region on /playoffs,
 * `#this-week-norcal` after the CCS intro and `#this-week-socal` before the San Diego block, outside every
 * league card (the copy rules that cover a card do not reach it; it still carries no seed word, and the SoCal
 * strip no CCS word, because no SoCal label has one). A day is an `<h3>` ('Today · Thu Oct 29'); a row is one
 * link, its whole sentence one text node ('4:00 PM PT · Redwood at Tamalpais', or a final's score sentence),
 * then the label badge ('MCAL final'). No GameRow: its expanding panel would cost the page's weight budget
 * (/playoffs ≤ 43,224 B gzip, scripts/assert-budgets.ts), and the game page one tap away has everything. Past the
 * cap, a last row links the schedule. Renders nothing when the window is empty. Server component.
 */
export interface ThisWeekProps {
  view: ThisWeekView;
  /** 'this-week-norcal' | 'this-week-socal' */
  id: string;
  className?: string;
}

function rowText(row: ThisWeekRow): string {
  if (row.final) return row.text;
  if (row.time === null) return row.kind === 'game' ? `Time TBA · ${row.text}` : row.text;
  return `${row.time} · ${row.text}`;
}

export function ThisWeek({ view, id, className }: ThisWeekProps) {
  if (view.days.length === 0) return null;
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={className}>
      <SectionHeader
        id={`${id}-heading`}
        kicker="This week in the postseason"
        meta={`${shortDate(view.from)} – ${shortDate(view.to)}`}
      />
      <ol className="m-0 list-none space-y-4 p-0">
        {view.days.map((day) => (
          <li key={day.dateKey}>
            <h3 className="m-0 mb-1 text-meta text-ink-2">
              <time dateTime={day.dateKey}>{day.dateLabel}</time>
            </h3>
            <ol className="m-0 list-none space-y-1 p-0">
              {day.rows.map((row) => (
                <li key={`${row.kind}:${row.key}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {row.href ? (
                    <Link href={row.href} prefetch={false} className="sx-action text-body text-ink hover:underline">
                      {rowText(row)}
                    </Link>
                  ) : (
                    <span className="text-body text-ink">{rowText(row)}</span>
                  )}
                  {row.label ? <span className="sx-badge">{row.label}</span> : null}
                </li>
              ))}
            </ol>
          </li>
        ))}
        {view.more > 0 ? (
          <li>
            <Link href="/schedule" prefetch={false} className="sx-action text-meta text-accent hover:underline">
              {`+${view.more} more on the schedule`}
            </Link>
          </li>
        ) : null}
      </ol>
    </section>
  );
}

export default ThisWeek;
