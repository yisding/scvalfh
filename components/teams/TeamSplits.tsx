import { recordString } from '../../lib/format';
import type { Record3 } from '../../lib/types';
import { MissingValue } from '../ui/MissingValue';
import type { TeamPageView } from './team-view';

/**
 * Home / away / neutral league splits (DESIGN §3.7, §12.5): three mini cards, label over value,
 * in the stat tiles' card recipe (StatTile: 12px padding on a phone, 16px from
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
 * The NEUTRAL split ships even while no team has played a league game at a neutral site: CCS
 * games and some non-league tournaments are at neutral sites, and a split that materialises in
 * November would break the reader's model of the page. A split with no games shows an em dash,
 * spoken as "no neutral-site league games", never `0-0-0`: a record of nothing played is not a
 * record (the stat tiles above follow the same rule).
 */
const NO_GAMES = {
  Home: 'no home league games',
  Away: 'no away league games',
  Neutral: 'no neutral-site league games',
} as const;

function splitValue(record: Record3 | null): string | null {
  if (!record || record.w + record.l + record.t === 0) return null;
  return recordString(record);
}

export interface TeamSplitsProps {
  view: TeamPageView;
}

/** The same splits over all games, for a team that plays no league games (the Southern Section independents). */
const NO_GAMES_ALL = {
  Home: 'no home games',
  Away: 'no away games',
  Neutral: 'no neutral-site games',
} as const;

export function TeamSplits({ view }: TeamSplitsProps) {
  // A team with no league games (the Southern Section independents, DESIGN §24.9): its splits are all games.
  const independent = view.league.classification === 'independent';
  const league = independent
    ? view.standing && view.standing.overall.gp > 0
      ? view.standing.overall
      : null
    : view.hasResults && view.standing
      ? view.standing.computed
      : null;
  const noGames = independent ? NO_GAMES_ALL : NO_GAMES;
  const cells: Array<{ label: keyof typeof NO_GAMES; value: string | null }> = [
    { label: 'Home', value: splitValue(league?.homeRecord ?? null) },
    { label: 'Away', value: splitValue(league?.awayRecord ?? null) },
    { label: 'Neutral', value: splitValue(league?.neutralRecord ?? null) },
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
              {cell.value ?? <MissingValue words={league ? noGames[cell.label] : 'not reported'} />}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 mb-0 text-meta text-ink-3">
        {independent ? 'All games, won-lost-tied.' : 'League games only, won-lost-tied.'}
      </p>
    </div>
  );
}

export default TeamSplits;
