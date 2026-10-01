/**
 * One ratio against a limit → a meter (DESIGN §6.1, §7.10). Not a pie of two slices, and not a
 * bar chart of invented probabilities: there is no model, so the only number here is the real
 * allocation from By-Laws Article VII §1 — SCVAL 7 of the 16-team CCS field.
 *
 * Accent fill on an accent-wash track (5.19 light / 4.38 dark), 8px tall, and `7 / 16` printed,
 * so the value is never carried by the fill alone.
 *
 * Capped at the 62ch prose measure of DESIGN §4.3, like the sentence underneath it: the track is
 * `flex-1`, so in /playoffs' full-width `#berths` section it stretched to 1072px at 1280 and a
 * 7-of-16 ratio read as a progress bar someone was most of the way along. A meter is a ratio, not
 * a scale, and it belongs to the sentence beside it — so the two share one measure.
 */
export interface BerthMeterProps {
  claimed: number;
  total: number;
  /** The full sentence, used as the meter's accessible name. */
  label: string;
  className?: string;
}

export function BerthMeter({ claimed, total, label, className }: BerthMeterProps) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (claimed / total) * 100)) : 0;
  return (
    <div className={`max-w-[62ch]${className ? ` ${className}` : ''}`}>
      <div className="flex items-center gap-3">
        <div
          className="sx-meter-track relative h-2 flex-1 overflow-hidden rounded-full"
          /* The numeral beside it and the sentence below it are both real text, so the fill is
             decoration — giving it role="img" would read the label twice. */
          aria-hidden="true"
        >
          <div
            className="sx-meter-fill h-full"
            style={{ width: `${pct}%`, borderRadius: '0 4px 4px 0' }}
          />
        </div>
        <span className="sx-num shrink-0 text-meta font-semibold text-ink">
          {claimed} / {total}
        </span>
      </div>
      <p className="mt-2 mb-0 text-meta text-ink-2">{label}</p>
    </div>
  );
}

export default BerthMeter;
