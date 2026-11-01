import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { GameList } from '../schedule/GameList';
import { plural } from '../../lib/format';

import type { OutsideTournamentView } from './playoff-view';

/**
 * A postseason tournament no CIF section runs, shared by the section's no-postseason leagues (DESIGN §24.13;
 * the Southern Section's Tournament of Champions, `#toc`: the postseason for both the Sunset and the LA
 * independents). It is one section of /playoffs of its own, not a part of either league's card, so it reads as
 * belonging to both:
 *
 * 1. the heading (the event's name, its dates and whose postseason it is) and the event's note (who runs it,
 *    its rounds, that CIF does not);
 * 2. `children`: the leagues' own cards side by side (`#sunset`, `#independents`), each saying which of its
 *    teams play in it;
 * 3. the games (`#toc-games`), by day with the round the schools' schedules give that day ('Round 1',
 *    'Semifinals', 'Final and third-place game'), as the schedule page lists games (`GameList`: a row on a
 *    phone, a card from md, each linking its game page with its chips, directions, stream and tickets), then
 *    the sources.
 *
 * No seed and no bracket: none is published, and the copy rules forbid a seed word on these pages. The sources
 * are named, because nothing official publishes the event.
 */
export interface OutsideTournamentProps {
  view: OutsideTournamentView;
  /** `toc`: the section's id, the target of the board row's and the team pages' links. */
  id: string;
  /** 'the Sunset and the LA independents': whose postseason it is, for the heading's meta. */
  whose: string;
  /** The leagues' cards, drawn between the note and the games. */
  children?: React.ReactNode;
  className?: string;
}

export function OutsideTournament({ view, id, whose, children, className }: OutsideTournamentProps) {
  const counts =
    view.toCome > 0
      ? `${plural(view.finals, 'final score')} · ${plural(view.toCome, 'game')} to come`
      : `${plural(view.finals, 'final score')}`;
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={className}>
      <SectionHeader id={`${id}-heading`} kicker={view.name} meta={`${view.dates} · the postseason for ${whose}`} />
      <p className="mt-2 mb-0 max-w-3xl text-body text-ink-2">{view.note}</p>
      {children ? <div className="mt-6 grid gap-4 md:grid-cols-2">{children}</div> : null}
      <div id={`${id}-games`} className="mt-6 sx-card p-5 md:p-6">
        <h3 className="m-0 text-lead text-ink">
          {`${view.name} games`} <span className="font-normal text-ink-2">· {view.dates}</span>
        </h3>
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
    </section>
  );
}

export default OutsideTournament;
