import { EM_DASH, recordString } from '../../lib/format';
import type { TeamPageView } from './team-view';

/**
 * Home / away / neutral league splits (DESIGN §3.7, §12.5): three mini cards, label over value,
 * in the stat tiles' card recipe (StatTile `variant="card"`: 12px padding on a phone, 16px from
 * 768px, the label over a bold value) so the team page has one tile look.
 *
 * The value is set exactly like a StatTile value: `sx-figure`, Sans with proportional figures,
 * 28px from 768px. DESIGN §4.3 reserves Mono + tabular for digits that STACK in a column (scores
 * in a list, standings columns); three records side by side in their own cards stack with
 * nothing, so they are "large standalone numbers", which §4.3 sets in Sans. In mono they read as a
 * second, unrelated tile style beside the League tile showing the same kind of record. Below 768px
 * the value stays `text-lead` (18px) and `whitespace-nowrap`, so "0-0-0" never breaks inside a
 * 3-up card at 320px.
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
          <div key={cell.label} className="sx-card p-3 md:p-4">
            <dt className="mb-0.5 text-meta font-medium text-ink-3 md:mb-1">{cell.label}</dt>
            <dd className="sx-figure m-0 text-lead leading-7 font-semibold whitespace-nowrap text-ink md:text-[1.75rem] md:leading-8 md:tracking-[-0.02em]">
              {cell.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 mb-0 text-meta text-ink-3">League games only, won-lost-tied.</p>
    </div>
  );
}

export default TeamSplits;
