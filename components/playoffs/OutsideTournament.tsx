import ExternalLink from '../ui/ExternalLink';
import { GameList } from '../schedule/GameList';
import { plural } from '../../lib/format';

import type { OutsideTournamentView } from './playoff-view';

/**
 * A postseason tournament no CIF section runs, listed under a no-postseason league's card on /playoffs
 * (DESIGN §24.13; the Southern Section's Tournament of Champions, `#toc`): the event's note (who runs it,
 * its dates, that CIF does not), then its games by day with the round the schools' schedules give that
 * day ('Round 1', 'Semifinals', 'Final and third-place game'), as the schedule page lists games
 * (`GameList`: a row on a phone, a card from md, each linking its game page with its chips, directions,
 * stream and tickets). No seed and no bracket: none is published, and the copy rules forbid a seed word
 * on these pages. The sources are named, because nothing official publishes the event.
 */
export interface OutsideTournamentProps {
  view: OutsideTournamentView;
  /** `toc`: the block's id, the target of the LA card's pointer link. */
  id: string;
  className?: string;
}

export function OutsideTournament({ view, id, className }: OutsideTournamentProps) {
  const counts =
    view.toCome > 0
      ? `${plural(view.finals, 'final score')} · ${plural(view.toCome, 'game')} to come`
      : `${plural(view.finals, 'final score')}`;
  return (
    <div id={id} className={className}>
      <h3 className="m-0 text-lead text-ink">
        {view.name} <span className="font-normal text-ink-2">· {view.dates}</span>
      </h3>
      <p className="mt-2 mb-0 max-w-prose text-body text-ink-2">{view.note}</p>
      {view.rounds.length === 0 ? (
        <p className="mt-3 mb-0 text-meta text-ink-2">No tournament game is on MaxPreps yet.</p>
      ) : (
        <>
          <p className="mt-3 mb-0 text-meta text-ink-3">{counts}</p>
          {view.rounds.map((round) => (
            <section key={round.dateKey} className="mt-4" aria-labelledby={`${id}-${round.dateKey}`}>
              <h4 id={`${id}-${round.dateKey}`} className="m-0 mb-2 text-body font-semibold text-ink">
                {round.label ? `${round.label} · ` : ''}
                {round.dateLabel}
              </h4>
              <GameList games={round.games} tracks="fit" />
            </section>
          ))}
        </>
      )}
      <p className="mt-4 mb-0 flex flex-wrap gap-x-4 gap-y-1 text-meta">
        {view.sources.map((s) => (
          <ExternalLink key={s.href} href={s.href} className="sx-action gap-1">
            {s.label}
          </ExternalLink>
        ))}
      </p>
    </div>
  );
}

export default OutsideTournament;
