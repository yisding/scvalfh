import { EM_DASH, recordString } from '../../lib/format';
import type { TeamPageView } from './team-view';

/**
 * Home / away / neutral league splits (DESIGN §3.7, §12.5): three mini cards, label over value.
 *
 * The NEUTRAL split ships even while it is `0-0-0` for every team: CCS games and some non-league
 * tournaments are at neutral sites, and a split that materialises in November would break the
 * reader's model of the page. It is honest, not padding.
 */
export function TeamSplits({ view }: { view: TeamPageView }) {
  const league = view.hasResults && view.standing ? view.standing.computed : null;
  const cells: Array<{ label: string; value: string }> = [
    { label: 'Home', value: league ? recordString(league.homeRecord) : EM_DASH },
    { label: 'Away', value: league ? recordString(league.awayRecord) : EM_DASH },
    { label: 'Neutral', value: league ? recordString(league.neutralRecord) : EM_DASH },
  ];
  return (
    // The caption sits OUTSIDE the <dl>: a <dl> may only contain dt/dd groups wrapped in div
    // (plus script/template), and a bare <span> in there is a real structure error that axe
    // flags as serious — it breaks the term/definition pairing assistive tech reads.
    <div>
      <dl className="m-0 grid grid-cols-3 gap-3">
        {cells.map((cell) => (
          <div key={cell.label} className="sx-card p-3">
            <dt className="text-micro font-medium text-ink-3">{cell.label}</dt>
            <dd className="sx-num m-0 mt-1 text-lead text-ink">{cell.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 mb-0 text-meta text-ink-3">League games only, won-lost-tied.</p>
    </div>
  );
}

export default TeamSplits;
