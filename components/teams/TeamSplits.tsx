import { EM_DASH, recordString } from '../../lib/format';
import type { TeamPageView } from './team-view';

/**
 * Home / away / neutral league splits (DESIGN §3.7, §12.5).
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
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
      <dl className="m-0 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {cells.map((cell) => (
          <div key={cell.label} className="flex items-baseline gap-2">
            <dt className="font-mono text-kicker font-semibold tracking-[0.10em] uppercase text-ink-3">
              {cell.label}
            </dt>
            <dd className="sx-num m-0 text-body text-ink">{cell.value}</dd>
          </div>
        ))}
      </dl>
      <span className="text-meta text-ink-3">League games only, won-lost-tied.</span>
    </div>
  );
}

export default TeamSplits;
