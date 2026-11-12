import { recordString, streakString } from '../../lib/format';
import type { Record3 } from '../../lib/types';
import FormStrip from '../ui/FormStrip';
import { MissingValue } from '../ui/MissingValue';
import { plural } from '../words/plural';
import type { TeamPageView } from './team-view';

/**
 * The rail's "Last 5 games" block (DESIGN §33): the form strip (league games, oldest to newest),
 * then three plain rows: the streak, and the home and away league records. A neutral-site row is
 * added only for a team that has played a league game at one.
 *
 * A split with no games shows an em dash, spoken as "no home league games", never `0-0-0`: a record
 * of nothing played is not a record. A team with no league result has no strip and three dashes.
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

/** One row of a rail fact list: the label at the left, the figure at the right, a hairline under it. */
export const FACT_ROW = 'flex min-h-10 items-baseline justify-between gap-4 border-b border-hairline py-2';

export interface TeamSplitsProps {
  view: TeamPageView;
}

export function TeamSplits({ view }: TeamSplitsProps) {
  const league = view.hasResults && view.standing ? view.standing.computed : null;
  const neutral = splitValue(league?.neutralRecord ?? null);
  const cells: Array<{ label: keyof typeof NO_GAMES; value: string | null }> = [
    { label: 'Home', value: splitValue(league?.homeRecord ?? null) },
    { label: 'Away', value: splitValue(league?.awayRecord ?? null) },
    ...(neutral ? [{ label: 'Neutral' as const, value: neutral }] : []),
  ];
  return (
    <>
      {view.formEntries.length > 0 ? (
        <p className="m-0 flex min-h-11 items-center">
          <FormStrip
            entries={view.formEntries}
            size={24}
            label={`${view.team.name} last ${plural(view.formEntries.length, 'league game')}`}
          />
        </p>
      ) : null}
      <dl className="m-0 text-body text-ink">
        <div className={FACT_ROW}>
          <dt className="text-ink-2">Streak</dt>
          <dd className="sx-num m-0">
            {league?.streak ? streakString(league.streak) : <MissingValue words="no league results" />}
          </dd>
        </div>
        {cells.map((cell) => (
          <div key={cell.label} className={FACT_ROW}>
            <dt className="text-ink-2">{cell.label}</dt>
            <dd className="sx-num m-0">
              {cell.value ?? <MissingValue words={league ? NO_GAMES[cell.label] : 'not reported'} />}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export default TeamSplits;
