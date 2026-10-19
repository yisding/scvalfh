import EmptyState from '@/components/ui/EmptyState';
import SectionHeader from '@/components/ui/SectionHeader';
import { isIndependentLeague } from '@/lib/config/leagues';
import type { AboutView } from '@/views/about/about-view';

import CifssCrossCheckSummary from './CifssCrossCheckSummary';
import CrossCheckTable from './CrossCheckTable';
import SbliveCrossCheckSummary from './SbliveCrossCheckSummary';

/**
 * /about#cross-check (DESIGN §9): each league's computed table against MaxPreps' own, with the rows of a
 * known cause listed apart under it, then the si.com and cifsshome.org score comparisons.
 */
export type AboutCrossCheckProps = Pick<
  AboutView,
  'perLeague' | 'sbliveCross' | 'cifssCross'
>;

export function AboutCrossCheck({
  perLeague,
  sbliveCross,
  cifssCross,
}: AboutCrossCheckProps) {
  return (
    <section id="cross-check" className="mt-16">
      <SectionHeader size="lg" kicker="Cross-check log" />
      <p className="sx-prose">
        MaxPreps&rsquo; own standings feed already carries its computed record, points, goals and
        placement for every team, so checking our work is a direct comparison, not a
        reimplementation: for every team we compare our computed W-L-T, goals and place against
        MaxPreps&rsquo; published numbers, field by field. Every disagreement is published here and
        flagged with &#9873; on the standings row &mdash; we always show our own computation and say
        so, rather than silently picking a side. Where a league&rsquo;s MaxPreps table differs for a
        known reason, those rows are listed separately under the reason.
      </p>
      {/* No group with no table (the LA independents): there is nothing of theirs to compare. */}
      {perLeague.filter((l) => !isIndependentLeague(l.summary.id)).map((l) => (
        <div key={l.summary.id} data-region-scope={l.summary.region} className="mt-section">
          <h3 className="m-0 mb-3 text-lead text-ink">
            {l.summary.shortName} vs. MaxPreps&rsquo; {l.summary.singleDivision ? 'table' : 'tables'}
          </h3>
          <CrossCheckTable groups={l.plainGroups} teamCount={l.summary.teamCount} emptyText={l.emptyText} />
          {l.causeGroups.map((c) => (
            <div key={c.cause} className="mt-stack">
              <h4 className="m-0 text-body font-semibold text-ink">Known difference</h4>
              <p className="mt-1 mb-3 max-w-prose text-meta text-ink-2">{c.cause}</p>
              <CrossCheckTable groups={c.groups} teamCount={l.summary.teamCount} />
            </div>
          ))}
        </div>
      ))}

      <h3 className="mt-section mb-3 text-lead text-ink">vs. si.com scores</h3>
      {sbliveCross ? (
        <SbliveCrossCheckSummary cross={sbliveCross} />
      ) : (
        <EmptyState heading="No si.com comparison in the most recent run.">
          This step is optional and failure-tolerant; when it runs, every disagreement and every
          si.com-only score appears here.
        </EmptyState>
      )}

      <h3 className="mt-section mb-3 text-lead text-ink">vs. cifsshome.org scores</h3>
      {cifssCross ? (
        <CifssCrossCheckSummary cross={cifssCross} />
      ) : (
        <EmptyState heading="No cifsshome.org comparison yet.">
          This step is optional and failure-tolerant; when it runs, every disagreement and every
          score MaxPreps lacks appears here.
        </EmptyState>
      )}
    </section>
  );
}

export default AboutCrossCheck;
