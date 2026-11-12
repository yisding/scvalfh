import SectionHeader from '../../ui/SectionHeader';
import { plural, shortDate } from '../../../lib/format';
import type { DroppedContest } from '../../../lib/types';
import { DROP_REASON_WORDS } from '../about-view';

/**
 * /about#dropped: every contest the most recent update left out on purpose, with its reason.
 */
export function DroppedSection({ dropped }: { dropped: readonly DroppedContest[] }) {
  return (
    <section id="dropped" className="sx-section">
      <SectionHeader kicker="Dropped contests" meta={plural(dropped.length, 'contest', 'contests')} />
      <p className="sx-prose">
        Games we left out on purpose in the most recent update, listed so nothing disappears silently.
      </p>
      {dropped.length === 0 ? (
        <p className="sx-empty">Nothing was left out in the most recent update.</p>
      ) : (
        <ul className="sx-list mt-2 max-w-prose">
          {dropped.map((d) => (
            <li key={d.contestId} className="py-2 text-cell text-ink-2">
              <span className="flex flex-wrap items-baseline gap-x-3 text-body text-ink">
                <span>{d.teams.join(' vs ') || 'Unknown teams'}</span>
                {d.dateKey ? (
                  <time dateTime={d.dateKey} className="sx-num text-ink-2">
                    {shortDate(d.dateKey)}
                  </time>
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
