import SectionHeader from '../../ui/SectionHeader';
import { plural, shortDate } from '../../../lib/format';
import type { DroppedContest } from '../../../lib/types';
import { DROP_REASON_WORDS } from '../about-view';

/**
 * /about#dropped: every contest the most recent update left out on purpose, with its reason.
 */
export function DroppedSection({ dropped }: { dropped: readonly DroppedContest[] }) {
  return (
    <section id="dropped" className="mt-16">
      <SectionHeader size="lg" kicker="Dropped contests" meta={plural(dropped.length, 'contest', 'contests')} />
      <p className="sx-prose">
        Games we left out on purpose in the most recent update, listed so nothing disappears silently.
      </p>
      {dropped.length === 0 ? (
        <p className="mt-stack max-w-prose text-body text-ink-2">Nothing was left out in the most recent update.</p>
      ) : (
        <ul className="sx-list mt-stack max-w-prose">
          {dropped.map((d) => (
            <li key={d.contestId} className="py-3 text-meta text-ink-2">
              <span className="block text-body text-ink">
                {d.teams.join(' vs ') || 'Unknown teams'}
                {d.dateKey ? (
                  <span className="text-meta text-ink-3">
                    {' '}
                    &middot; <time dateTime={d.dateKey}>{shortDate(d.dateKey)}</time>
                  </span>
                ) : null}
              </span>
              <span className="block">
                {DROP_REASON_WORDS[d.reason]}: {d.note}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default DroppedSection;
