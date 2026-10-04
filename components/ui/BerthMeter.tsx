/**
 * One ratio against a limit → a segmented meter (DESIGN §6.1, §7.10; brief §4.20). Not a pie of two
 * slices, and not a probability chart: the only numbers here are real allocations: a league's
 * automatic CCS berths from its own rules (lib/leagues.ts `postseason.autoBerths`, e.g. SCVAL 7,
 * BVAL 4, PCAL 2 of the 16-team field), or a division's automatic-qualifier count.
 *
 * One segment per berth, `claimed` of them filled. The figure and "/ total" are printed, so the
 * value is never carried by the fill alone, and the capped `max-w-prose` measure keeps the meter
 * with the sentence beneath it instead of stretching across a wide section.
 */
export interface BerthMeterProps {
  claimed: number;
  total: number;
  /** The full sentence, printed under the meter. */
  label: string;
  className?: string;
}

export function BerthMeter({ claimed, total, label, className }: BerthMeterProps) {
  return (
    <div className={['max-w-prose', className].filter(Boolean).join(' ')}>
      <p className="m-0 flex items-baseline gap-1.5">
        <span className="sx-figure text-figure text-ink">{claimed}</span>
        {/* Sans like the figure beside it (`tabular-nums`, not `.sx-num`): "7 / 16" is one
            number read as a pair, not a column of stacked digits, so it keeps one typeface. */}
        <span className="text-meta text-ink-2 tabular-nums">/ {total}</span>
      </p>
      {/* The numerals and the sentence are real text, so the segments are decoration. */}
      <div
        aria-hidden="true"
        className="mt-3 grid h-3 gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`rounded-[3px] ${i < claimed ? 'sx-meter-fill' : 'sx-meter-track'}`}
          />
        ))}
      </div>
      <p className="mt-3 mb-0 text-meta text-ink-2">{label}</p>
    </div>
  );
}

export default BerthMeter;
