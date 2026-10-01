import Link from 'next/link';

import BerthMeter from '../ui/BerthMeter';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { shortDate } from '../../lib/format';
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
      <SectionHeader kicker="CCS playoffs" action={{ href: '/playoffs', label: 'bracket' }} />
      <p className="mt-0 mb-2 text-meta text-ink-2">
        {beforeCrossover
          ? `Crossover and the 4-vs-4 play-in ${shortDate(crossover.date)}. Seeding meeting ${shortDate(keyDates.seedingMeeting)}.`
          : phase === 'crossover'
            ? `League play is done. Crossover and the play-in are ${shortDate(crossover.date)}; the seeding meeting is ${shortDate(keyDates.seedingMeeting)}.`
            : `Seeding meeting ${shortDate(keyDates.seedingMeeting)}.`}
      </p>
      <BerthMeter
        claimed={format.autoQualifiers.scval}
        total={format.autoQualifiers.total}
        label={`SCVAL holds ${format.autoQualifiers.scval} of the ${format.autoQualifiers.total} CCS berths automatically: the top three in each division, plus the winner of the fourth-place play-in (By-Laws Article VII §1–2).`}
      />
      <p className="sx-num mt-2 mb-0 text-meta text-ink-2">
        QF {shortDate(keyDates.quarterfinals)} &middot; SF {shortDate(keyDates.semifinals)} &middot;
        Final {shortDate(keyDates.finals)}
      </p>
      <p className="mt-2 mb-0 max-w-[62ch] text-meta text-ink-3">
        Berths are assigned by the CCS committee. Nothing here is official until the seeding meeting.{' '}
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
    </section>
  );
}

export default PlayoffsCard;
