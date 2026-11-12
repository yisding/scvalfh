import { RECORD_HEAD, SCORE_UNITS } from '../../words/score-words';
import SectionHeader from '../../ui/SectionHeader';
import { isIndependentLeague } from '../../../lib/leagues';
import type { AboutCrossCheck } from '../about-view';
import CifssCrossCheckSummary from '../CifssCrossCheckSummary';
import CrossCheckTable from '../CrossCheckTable';
import SbliveCrossCheckSummary from '../SbliveCrossCheckSummary';

/**
 * /about#cross-check: the published cross-check log. Each league's disagreements with MaxPreps' tables
 * (those with a known cause listed apart, under the cause), then the si.com and cifsshome.org score
 * comparisons.
 */
export function CrossCheckSection({ crossCheck }: { crossCheck: AboutCrossCheck }) {
  const { perLeague, sbliveCross, cifssCross } = crossCheck;
  return (
    <section id="cross-check" className="sx-section">
      <SectionHeader kicker="Cross-check log" />
      <p className="sx-prose">
        {`MaxPreps’ own standings feed already carries its computed record, ${
          RECORD_HEAD === 'W-L' ? 'winning percentage' : 'points'
        }, ${SCORE_UNITS} ${
          RECORD_HEAD === 'W-L' ? 'scored ' : ''
        }and placement for every team, so checking our work is a direct comparison, not a reimplementation: for every team we compare our computed ${RECORD_HEAD}, ${SCORE_UNITS} and place against MaxPreps’ published numbers, field by field. Every disagreement is published here and flagged with † on the standings row — we always show our own computation and say so, rather than silently picking a side. Where a league’s MaxPreps table differs for a known reason, those rows are listed separately under the reason.`}
      </p>
      {/* No group with no table (the LA independents): there is nothing of theirs to compare. */}
      {perLeague.filter((l) => !isIndependentLeague(l.summary.id)).map((l) => (
        <div key={l.summary.id} data-region-scope={l.summary.region} className="mt-8">
          <div className="sx-strip mb-3 max-w-[47rem]">
            <h3 className="m-0 text-lead text-ink">
              {l.summary.shortName} vs. MaxPreps&rsquo; {l.summary.singleDivision ? 'table' : 'tables'}
            </h3>
          </div>
          <CrossCheckTable groups={l.plainGroups} teamCount={l.summary.teamCount} emptyText={l.emptyText} />
          {l.causeGroups.map((c) => (
            <div key={c.cause} className="mt-6">
              <h4 className="m-0 text-lead text-ink">Known difference</h4>
              <p className="mt-0 mb-3 max-w-prose text-cell text-ink-2">{c.cause}</p>
              <CrossCheckTable groups={c.groups} teamCount={l.summary.teamCount} />
            </div>
          ))}
        </div>
      ))}

      <div className="sx-strip mt-8 mb-3 max-w-[47rem]">
        <h3 className="m-0 text-lead text-ink">vs. si.com scores</h3>
      </div>
      {sbliveCross ? (
        <SbliveCrossCheckSummary cross={sbliveCross} />
      ) : (
        <p className="sx-empty max-w-prose">
          No si.com comparison in the most recent run. This step is optional and failure-tolerant; when it
          runs, every disagreement and every si.com-only score appears here.
        </p>
      )}

      <div className="sx-strip mt-8 mb-3 max-w-[47rem]">
        <h3 className="m-0 text-lead text-ink">vs. cifsshome.org scores</h3>
      </div>
      {cifssCross ? (
        <CifssCrossCheckSummary cross={cifssCross} />
      ) : (
        <p className="sx-empty max-w-prose">
          No cifsshome.org comparison yet. This step is optional and failure-tolerant; when it runs, every
          disagreement and every score MaxPreps lacks appears here.
        </p>
      )}
    </section>
  );
}

export default CrossCheckSection;
