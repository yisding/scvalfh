import Link from 'next/link';
import { Fragment } from 'react';

import SectionHeader from '../ui/SectionHeader';
import { shortDate } from '../../lib/format';

import type { ThisWeekRow, ThisWeekView } from './this-week';

/**
 * "This week in the postseason" (view model buildThisWeek, this-week.ts): a region's postseason games and
 * dated events from two days back to a week ahead, by day. A working export that no page renders since the
 * refresh (/playoffs opens on the bracket, spec §5.6); its test stays.
 *
 * A day is a strip ('Today · Thu Oct 29', the view's words); a row is its start time, then one link whose
 * text is the matchup, the score sentence or the event, then its label ('MCAL final') at the row's end,
 * linked to the game's place in the bracket when it has one (bracket-link.ts; an sr-only tail tells the
 * many "CCS quarterfinal" links apart). The view's rows are sentences, not games, so they are plain rows
 * and not the site's game row. It carries no seed word, and the SoCal list no CCS word, because no label
 * has one. Past the cap, a last link goes to the schedule. Renders nothing when the window is empty.
 * Server component.
 */
export interface ThisWeekProps {
  view: ThisWeekView;
  /** 'this-week-norcal' | 'this-week-socal' */
  id: string;
  className?: string;
}

/** The start-time column: '4:00 PM PT', 'Time TBA' for a game with none, nothing for a final or an untimed event. */
function rowTime(row: ThisWeekRow): string | null {
  if (row.final) return null;
  if (row.time === null) return row.kind === 'game' ? 'Time TBA' : null;
  return row.time;
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
      {view.days.map((day) => (
        <Fragment key={day.dateKey}>
          <div className="sx-strip">
            <h3 className="m-0 text-lead text-ink">
              <time dateTime={day.dateKey}>{day.dateLabel}</time>
            </h3>
          </div>
          <ul className="sx-list">
            {day.rows.map((row, i) => (
              // Several events of one day share a title ("San Diego Section playoffs", one per game), so
              // the position completes the key.
              <li key={`${row.kind}:${row.key}:${i}`} className="flex min-h-11 flex-wrap items-center gap-x-3 px-2 py-1">
                <span className="sx-num w-24 shrink-0 text-body text-ink-2">{rowTime(row)}</span>
                {row.href ? (
                  <Link href={row.href} prefetch={false} className="sx-rowlink min-w-0 text-body font-medium text-ink">
                    {row.text}
                  </Link>
                ) : (
                  <span className="min-w-0 text-body font-medium text-ink">{row.text}</span>
                )}
                {row.label && row.bracket ? (
                  <Link href={`/playoffs#${row.bracket}`} prefetch={false} className="sx-link ml-auto text-cell">
                    {row.label}
                    <span className="sr-only"> in the bracket: {row.text}</span>
                  </Link>
                ) : row.label ? (
                  <span className="ml-auto text-cell text-ink-2">{row.label}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
      {view.more > 0 ? (
        <p className="sx-linkrow">
          <Link href="/schedule" prefetch={false} className="sx-action">
            {`+${view.more} more on the schedule`}
          </Link>
        </p>
      ) : null}
    </section>
  );
}

export default ThisWeek;
