import Link from 'next/link';

import BerthMeter from '../ui/BerthMeter';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { monthDay, shortDate } from '../../lib/format';

import type { PostseasonView } from './home-data';

/**
 * A league panel's postseason block (SPEC §10.1; replaces the SCVAL-only PlayoffsCard).
 *
 * - CCS leagues (SCVAL, BVAL, PCAL): the league's share of the 16-team CCS field as a meter — one
 *   ratio against a limit, so a meter, not a chart — its qualification sentence, the CCS dates and
 *   `CCS playoffs →` to the league's section of /playoffs. The meter is the allocation, not a
 *   projection: the CCS committee, not this site, assigns berths.
 * - A league tournament (MCAL, North Coast Section): NO meter and no CCS date or word at all — the
 *   NCS holds no field hockey championship. One line of rounds and dates, the section's note and
 *   `Bracket →` to /playoffs/<league>.
 */
export interface PostseasonCardProps {
  view: PostseasonView;
  className?: string;
}

const LINK = 'text-accent hover:underline';

export function PostseasonCard({ view, className }: PostseasonCardProps) {
  if (view.kind === 'league-tournament') {
    return (
      <section className={className}>
        <SectionHeader as="h3" kicker="Postseason" />
        <div className="sx-card sx-bleed p-5 md:p-6">
          <p className="m-0 text-body text-ink">{view.line}</p>
          {view.note ? <p className="mt-3 mb-0 max-w-prose text-meta text-ink-2">{view.note}</p> : null}
          <p className="mt-4 mb-0 text-meta">
            {/* Standalone action link: its own 24px box (`sx-action`, WCAG 2.5.8). */}
            <Link href={view.link.href} prefetch={false} className={`sx-action ${LINK}`}>
              {view.link.label} <span aria-hidden="true">&rarr;</span>
            </Link>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={className}>
      <SectionHeader as="h3" kicker="CCS playoffs" />
      <div className="sx-card sx-bleed p-5 md:p-6">
        <p className="m-0 text-meta text-ink-2">{view.intro}</p>
        <BerthMeter className="mt-4" claimed={view.meter.claimed} total={view.meter.total} label={view.meter.label} />
        <dl className="mt-5 mb-0 grid grid-cols-3 gap-3">
          {view.dates.map(({ term, date }) => (
            <div key={term} className="min-w-0">
              <dt className="text-micro font-medium text-ink-3">{term}</dt>
              {/* "Wed Nov 11": when a 3-up column is too narrow (320px) it breaks after the weekday,
                  never inside "Nov 11". Sans with tabular figures, not `.sx-num` mono: a date in a
                  sentence-like fact is not a column of numbers. */}
              <dd className="m-0 text-meta text-ink tabular-nums sm:text-body">
                {shortDate(date).slice(0, 3)} <span className="whitespace-nowrap">{monthDay(date)}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 mb-0 border-t border-divider pt-4 text-meta text-ink-3">
          Berths are assigned by the CCS committee. Nothing here is official until the seeding meeting.{' '}
          {view.bracket.published ? (
            <>
              <ExternalLink href={view.bracket.url}>Official bracket</ExternalLink>{' '}
            </>
          ) : null}
          {/* Kept on one line: it ends a wrapping sentence, and "CCS playoffs" stranded above
              its arrow (or the arrow alone on the next line) read as two things. */}
          <Link href={view.link.href} prefetch={false} className={`whitespace-nowrap ${LINK}`}>
            {view.link.label} <span aria-hidden="true">&rarr;</span>
          </Link>
        </p>
      </div>
    </section>
  );
}

export default PostseasonCard;
