import SectionHeader from '@/components/ui/SectionHeader';
import { shortDate } from '@/lib/format/dates';
import type { PlayoffsPageView } from '@/views/playoffs/playoffs-view';

/**
 * The CCS intro and the not-seeded state (the page header's description and field line before the
 * Southern California amendment).
 */
export default function CcsIntro({
  keyDates,
  fieldMeta,
  seeded,
}: Pick<PlayoffsPageView, 'fieldMeta' | 'seeded'> & { keyDates: PlayoffsPageView['playoffs']['keyDates'] }) {
  return (
    <section aria-labelledby="ccs-playoffs" className="mt-section md:mt-section-lg">
      <SectionHeader id="ccs-playoffs" kicker="CCS playoffs" meta={fieldMeta} />
      <p className="m-0 max-w-prose text-body text-ink-2">
        Central Coast Section championships, {shortDate(keyDates.quarterfinals)} to{' '}
        {shortDate(keyDates.finals)}. This page tracks each CCS league&rsquo;s share of the field
        and, once CCS seeds it, the bracket itself.
        {/* Before seeding, this ONE sentence replaces the accent-ruled "Not seeded yet" card
            that used to sit under the title and pushed everything below it most of a phone
            screen down. There is still no skeleton bracket: a greyed-out one would read as
            real data. */}
        {seeded ? null : (
          <>
            {' '}
            <span className="text-ink">Not seeded yet:</span> CCS sets the bracket at its
            seeding meeting on{' '}
            <time dateTime={keyDates.seedingMeeting.slice(0, 10)}>
              {shortDate(keyDates.seedingMeeting)}
            </time>
            , and it appears here that evening.
          </>
        )}
      </p>
    </section>
  );
}
