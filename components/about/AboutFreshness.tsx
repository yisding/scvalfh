import SectionHeader from '@/components/ui/SectionHeader';
import { formatStamp } from '@/lib/format/dates';
import { plural } from '@/lib/format/words';
import type { AboutView } from '@/views/about/about-view';

/**
 * /about#freshness (anchor `#updates` too): the update cadence, why live scores are not collected, the
 * last update's stamp and the last run's sources by status.
 */
export type AboutFreshnessProps = Pick<
  AboutView,
  'fetchedAt' | 'sourceCounts' | 'erroring'
>;

export function AboutFreshness({
  fetchedAt,
  sourceCounts,
  erroring,
}: AboutFreshnessProps) {
  return (
    <section id="freshness" className="mt-16">
      <span id="updates" className="block" />
      <SectionHeader size="lg" kicker="How often this updates" />
      <div className="sx-prose">
        <p>
          Pages do not load live data. Instead, an automatic update re-reads MaxPreps (and, most
          times, si.com, the league documents and the CCS calendar) and republishes the whole
          site, roughly twice a day during the
          season &mdash; once in the late evening (about 10 PM) and once in the early morning
          (about 7 AM), Pacific time &mdash; between August and November. A game that finishes at
          7 PM Thursday appears that night if its score is entered by about 10 PM, otherwise Friday
          morning.
        </p>
        <p>
          <b className="font-semibold text-ink">Live scores are not collected.</b> A game MaxPreps
          marks as in progress is shown as scheduled, with no score and no &ldquo;live&rdquo; label,
          because a page published hours earlier cannot know whether the game is still being played.
        </p>
        <p>
          The data on this page was last updated {formatStamp(fetchedAt)}. If a page
          anywhere on the site shows a &ldquo;last updated&rdquo; stamp more than 36 hours old, that
          is this site telling you its own update may be failing &mdash; not a claim that nothing
          happened in the leagues since then. Per-league detail is under{' '}
          <a href="#health" className="text-accent hover:underline">
            data health
          </a>
          .
        </p>
        <h3>Most recent run, by source</h3>
        <p className="text-meta text-ink-2">
          {plural(sourceCounts.ok, 'source', 'sources')} ok &middot; {sourceCounts.stale} stale &middot;{' '}
          {sourceCounts.error} failed &middot; {sourceCounts.skipped} skipped (season-gated or optional steps,
          by design).
        </p>
        {erroring.length > 0 ? (
          <ul className="sx-list">
            {erroring.map((s) => (
              <li key={`${s.id}-${s.label}`} className="py-2 text-meta text-ink-2">
                <b className="font-semibold text-loss-ink">{s.label}</b>
                {s.error ? `: ${s.error}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-meta text-ink-3">No source failed outright in the most recent run.</p>
        )}
      </div>
    </section>
  );
}

export default AboutFreshness;
