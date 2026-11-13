import { Fragment } from 'react';
import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import type { CalendarEventRow } from './calendar-view';

/**
 * A list of club events on /club-calendar (DESIGN §34): one entry per event, a hairline under each,
 * the roster's grid card like every other list on the club pages (DESIGN §17.5), so it reflows at
 * 320px and 400% zoom.
 *
 * An entry, in reading order: the name (its `id` is the anchor a club page links), the kind and the
 * dates (a `<time>` when there is a first day), the date note, the league days, where, who plays
 * and who runs it, the host club and the clubs whose pages say they enter (internal links to their
 * club pages), the one-sentence summary, then the links out (the event page, its fixtures and
 * results, registration) and the other pages it was read from.
 *
 * Every link written in the `.map()` carries `prefetch={false}` (tests/ui/prefetch-policy.test.ts).
 * Each external link's accessible name leads with the event, so a screen reader's link list never
 * holds six bare "Event page" links. Nothing long is nowrap: the names, venues and notes wrap.
 */
export interface ClubEventListProps {
  events: CalendarEventRow[];
  /** The heading level of each event's name: h3 under a month's h2. */
  as?: 'h3' | 'h4';
}

export function ClubEventList({ events, as: Heading = 'h3' }: ClubEventListProps) {
  return (
    <ul className="m-0 list-none p-0">
      {events.map((e) => (
        <li key={e.id} id={e.id} className="min-w-0 scroll-mt-24 border-b border-hairline py-3">
          <Heading className="m-0 text-body font-semibold text-ink">{e.name}</Heading>
          <p className="m-0 flex flex-wrap gap-x-3 text-cell text-ink">
            <span>{e.kind}</span>
            {e.dateTime ? <time dateTime={e.dateTime}>{e.when}</time> : <span>{e.when}</span>}
          </p>
          {e.dateNote ? <p className="m-0 text-cell text-ink-2">{e.dateNote}</p> : null}
          {e.sessions ? <p className="m-0 text-cell text-ink-2">{e.sessions}</p> : null}
          {e.where ? <p className="m-0 text-cell text-ink-2">{e.where}</p> : null}
          <p className="m-0 text-cell text-ink-2">
            {e.who} · Run by {e.organizer}
          </p>
          {e.host || e.clubs.length > 0 ? (
            <p className="m-0 text-cell text-ink-2">
              {e.host ? (
                <>
                  Host club:{' '}
                  <Link href={e.host.href} prefetch={false}>
                    {e.host.name}
                  </Link>
                  {e.clubs.length > 0 ? ' · ' : null}
                </>
              ) : null}
              {e.clubs.length > 0 ? (
                <>
                  {e.clubs.length === 1 ? 'Club entered' : 'Clubs entered'}, by their own pages:{' '}
                  {e.clubs.map((c, i) => (
                    <Fragment key={c.href}>
                      {i > 0 ? ', ' : null}
                      <Link href={c.href} prefetch={false}>
                        {c.name}
                      </Link>
                    </Fragment>
                  ))}
                </>
              ) : null}
            </p>
          ) : null}
          {e.summary ? <p className="mt-1 mb-0 max-w-prose text-cell text-ink">{e.summary}</p> : null}
          <ul className="sx-linkrow">
            {e.links.map((l) => (
              <li key={l.href}>
                <ExternalLink href={l.href} className="sx-action whitespace-normal">
                  <span>
                    <span className="sr-only">{e.name}: </span>
                    {l.label}
                  </span>
                </ExternalLink>
              </li>
            ))}
          </ul>
          {e.sources.length > 0 ? (
            <p className="m-0 text-cell text-ink-2">
              Also read from:{' '}
              {e.sources.map((s, i) => (
                <Fragment key={s.href}>
                  {i > 0 ? ' · ' : null}
                  <ExternalLink href={s.href}>
                    <span>
                      <span className="sr-only">{e.name}: </span>
                      {s.label}
                    </span>
                  </ExternalLink>
                </Fragment>
              ))}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default ClubEventList;
