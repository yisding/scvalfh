import SectionHeader from '@/components/ui/SectionHeader';
import { shortDate } from '@/lib/format/dates';
import { plural } from '@/lib/format/words';
import { type AboutView, DROP_REASON_WORDS } from '@/views/about/about-view';

/**
 * /about#dropped: every contest the last update left out on purpose, with its reason, so nothing
 * disappears silently.
 */
export function AboutDropped({ dropped }: Pick<AboutView, 'dropped'>) {
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

export default AboutDropped;
