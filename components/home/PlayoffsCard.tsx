import Link from 'next/link';

import BerthMeter from '../ui/BerthMeter';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { monthDay, shortDate } from '../../lib/format';
import type { Playoffs, SeasonPhase } from '../../lib/types';

/**
 * The CCS block (DESIGN §3.1, §7.10, §7.11).
 *
 * One ratio against a limit — SCVAL's 7 of the 16-team field, By-Laws Article VII §1 — so it is a
 * meter, not a chart. There are NO percentages and no projection model anywhere: every status on
 * /playoffs is a written word, and this card is capped by the sentence that says the committee, not
 * this site, assigns berths.
 */
export interface PlayoffsCardProps {
  playoffs: Playoffs;
  phase: SeasonPhase;
  /** The Oct 30 crossover / 4-vs-4 play-in (Article VII §2). */
  crossover: { date: string; pairings: string[] };
  className?: string;
}

export function PlayoffsCard({ playoffs, phase, crossover, className }: PlayoffsCardProps) {
  const { keyDates, format, bracketPublished, bracketUrl } = playoffs;
  const beforeCrossover = phase === 'preseason' || phase === 'regular';
  return (
    <section className={className}>
      <SectionHeader kicker="CCS playoffs" action={{ href: '/playoffs', label: 'Playoffs' }} />
      <div className="sx-card p-5 md:p-6">
        <p className="m-0 text-meta text-ink-2">
          {beforeCrossover
            ? `Crossover and the 4-vs-4 play-in ${shortDate(crossover.date)}. Seeding meeting ${shortDate(keyDates.seedingMeeting)}.`
            : phase === 'crossover'
              ? `League play is done. Crossover and the play-in are ${shortDate(crossover.date)}; the seeding meeting is ${shortDate(keyDates.seedingMeeting)}.`
              : `Seeding meeting ${shortDate(keyDates.seedingMeeting)}.`}
        </p>
        <BerthMeter
          className="mt-4"
          claimed={format.autoQualifiers.scval}
          total={format.autoQualifiers.total}
          label={`SCVAL holds ${format.autoQualifiers.scval} of the ${format.autoQualifiers.total} CCS berths automatically: the top three in each division, plus the winner of the fourth-place play-in (By-Laws Article VII §1–2).`}
        />
        <dl className="mt-5 mb-0 grid grid-cols-3 gap-3">
          {(
            [
              ['Quarterfinals', keyDates.quarterfinals],
              ['Semifinals', keyDates.semifinals],
              ['Final', keyDates.finals],
            ] as const
          ).map(([term, date]) => (
            <div key={term} className="min-w-0">
              <dt className="text-micro font-medium text-ink-3">{term}</dt>
              {/* "Wed Nov 11": when a 3-up column is too narrow (320px) it breaks after the
                  weekday, never inside "Nov 11". 14px below 640px so 390px keeps one line. */}
              <dd className="sx-num m-0 text-meta text-ink sm:text-body">
                {shortDate(date).slice(0, 3)}{' '}
                <span className="whitespace-nowrap">{monthDay(date)}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 mb-0 border-t border-divider pt-4 text-meta text-ink-3">
          Berths are assigned by the CCS committee. Nothing here is official until the seeding
          meeting.{' '}
          {bracketPublished ? (
            <ExternalLink href={bracketUrl}>Official bracket</ExternalLink>
          ) : (
            <>
              The official bracket is not posted yet.{' '}
              <Link href="/playoffs" className="text-accent hover:underline">
                What we know <span aria-hidden="true">&rarr;</span>
              </Link>
            </>
          )}
        </p>
      </div>
    </section>
  );
}

export default PlayoffsCard;
