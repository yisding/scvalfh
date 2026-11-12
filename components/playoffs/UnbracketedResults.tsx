import { GameList } from '../schedule/GameList';
import SectionHeader from '../ui/SectionHeader';

import type { UnbracketedResultsView } from './unbracketed-view';

/**
 * The results block inside an unbracketed league's /playoffs card (the EAL's Super Regional, `#eal`; view model
 * buildUnbracketedResults in unbracketed-view.ts): the games MaxPreps lists, by day, each day headed by the
 * round its rows name ('Semifinals', 'Final') or by its date alone: a strip (the round at the left, the day at
 * its right end) over the site's game rows (`GameList`), the shape of the Tournament of Champions block
 * (OutsideTournament.tsx).
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
    return <p className={['sx-empty', className].filter(Boolean).join(' ')}>{view.empty}</p>;
  }
  return (
    <div className={className}>
      {view.days.map((day) => (
        <section key={day.dateKey} aria-labelledby={`${idPrefix}-results-${day.dateKey}`}>
          <SectionHeader
            strip
            id={`${idPrefix}-results-${day.dateKey}`}
            kicker={day.label ?? day.dateLabel}
            meta={day.label ? day.dateLabel : undefined}
          />
          <GameList games={day.games} />
        </section>
      ))}
    </div>
  );
}

export default UnbracketedResults;
