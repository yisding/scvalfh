import { GameList } from '../schedule/GameList';
import { plural } from '../../lib/format';

import type { UnbracketedResultsView } from './unbracketed-view';

/**
 * The results block inside an unbracketed league's /playoffs card (the EAL's Super Regional, `#eal`; view model
 * buildUnbracketedResults in unbracketed-view.ts): the games MaxPreps lists, by day, each day headed by the
 * round its rows name ('Semifinals', 'Final') or by its date alone, as the schedule page lists games
 * (`GameList tracks="fit"`: a row on a phone, a card from md, each linking its game page with its chips,
 * directions, stream and tickets), the shape of the Tournament of Champions block (OutsideTournament.tsx).
 * With no game yet, one sentence (DESIGN §8: a heading, a sentence, never a skeleton). No seed and no bracket:
 * the Section publishes neither, and SEED_CLAIM covers this card. Server component: it imports no lib/data.
 */
export interface UnbracketedResultsProps {
  view: UnbracketedResultsView;
  /** The league id ('eal'): prefixes each day heading's id, so the ids stay unique on /playoffs. */
  idPrefix: string;
  className?: string;
}

export function UnbracketedResults({ view, idPrefix, className }: UnbracketedResultsProps) {
  if (view.empty !== null) {
    return <p className={['mb-0 text-meta text-ink-2', className].filter(Boolean).join(' ')}>{view.empty}</p>;
  }
  const counts =
    view.toCome > 0
      ? `${plural(view.finals, 'final score')} · ${plural(view.toCome, 'game')} to come`
      : plural(view.finals, 'final score');
  return (
    <div className={className}>
      <p className="m-0 text-meta text-ink-3">{counts}</p>
      {view.days.map((day) => (
        <section key={day.dateKey} className="mt-4" aria-labelledby={`${idPrefix}-results-${day.dateKey}`}>
          <h3 id={`${idPrefix}-results-${day.dateKey}`} className="m-0 mb-2 text-body font-semibold text-ink">
            {day.label ? `${day.label} · ${day.dateLabel}` : day.dateLabel}
          </h3>
          <GameList games={day.games} tracks="fit" />
        </section>
      ))}
    </div>
  );
}

export default UnbracketedResults;
