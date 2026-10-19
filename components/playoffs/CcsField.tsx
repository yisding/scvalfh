import BerthMeter from '@/components/ui/BerthMeter';
import SectionHeader from '@/components/ui/SectionHeader';
import type { PlayoffsPageView } from '@/views/playoffs/playoffs-view';

/**
 * The field: numbers only, ink only (no league hue). Each label names its unit, "berths" (not
 * "places", which on this page means league-table places). It keeps the "holds <n> of 16" shape that
 * scripts/ci/assert-copy.ts and the copy-honesty test match, so a meter that ever reached an MCAL page
 * would still be caught.
 */
export default function CcsField({ field }: Pick<PlayoffsPageView, 'field'>) {
  return (
    <section id="field" className="mt-section md:mt-section-lg">
      <SectionHeader kicker="The field" meta={`${field.total} teams`} />
      <div className="sx-card flex flex-col gap-6 p-5">
        {field.byLeague.map((l) => (
          <BerthMeter
            key={l.leagueId}
            claimed={l.auto}
            total={field.total}
            label={`${l.shortName} holds ${l.auto} of ${field.total} berths`}
          />
        ))}
      </div>
      <p className="mt-3 mb-0 max-w-prose text-meta text-ink-2">
        {`${field.atLarge} at-large berths, chosen by the CCS committee`}
      </p>
    </section>
  );
}
