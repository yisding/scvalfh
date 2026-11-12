import SectionHeader from '../../ui/SectionHeader';
import { getFetchedAt } from '../../../lib/data';
import { formatStamp, plural } from '../../../lib/format';
import type { AboutFreshness } from '../about-view';

/**
 * /about#freshness (and `#updates`, the anchor a "last updated" stamp links): the update cadence, the
 * last update's time, and the most recent run by source.
 */
export function FreshnessSection({ freshness }: { freshness: AboutFreshness }) {
  const { counted, erroring } = freshness;
  return (
    <section id="freshness" className="sx-section">
      <span id="updates" className="block" />
      <SectionHeader kicker="How often this updates" />
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
          The data on this page was last updated {formatStamp(getFetchedAt())}. If a page
          anywhere on the site shows a &ldquo;last updated&rdquo; stamp more than 36 hours old, that
          is this site telling you its own update may be failing &mdash; not a claim that nothing
          happened in the leagues since then. Per-league detail is under{' '}
          <a href="#health">
            data health
          </a>
          .
        </p>
        <h3>Most recent run, by source</h3>
        <p>
          {plural(counted.ok, 'source', 'sources')} ok, {counted.stale} stale, {counted.error} failed, {counted.skipped}{' '}
          skipped (season-gated or optional steps, by design).
        </p>
        {erroring.length > 0 ? (
          <ul className="sx-list">
            {erroring.map((s) => (
              <li key={`${s.id}-${s.label}`} className="py-2 text-cell text-ink-2">
                <b className="font-semibold text-loss-ink">{s.label}</b>
                {s.error ? `: ${s.error}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>No source failed outright in the most recent run.</p>
        )}
      </div>
    </section>
  );
}

export default FreshnessSection;
