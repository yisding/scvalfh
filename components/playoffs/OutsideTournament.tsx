import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { GameList } from '../schedule/GameList';

import type { OutsideTournamentView } from './playoff-view';

/**
 * A postseason tournament no CIF section runs, shared by the section's no-postseason leagues (DESIGN §24.13;
 * the Southern Section's Tournament of Champions, `#toc`: the postseason for both the Sunset and the LA
 * independents). It is one section of /playoffs of its own, not a part of either league's card, so it reads as
 * belonging to both:
 *
 * 1. the heading (the event's name, its dates beside it);
 * 2. the games (`#toc-games`): the event's bracket, drawn by the shared drawer as every other bracket on the
 *    page is (rounds, the final, the third-place game under it), when its config reads one off the results;
 *    otherwise by day under a strip naming the round the schools' schedules give that day
 *    ('Round 1', 'Semifinals', 'Final and third-place game') with the day at its right end, as the site's
 *    game rows (`GameList`);
 * 3. one note (whose postseason it is, then the event's own: who runs it, its rounds, that CIF does not) and
 *    the sources;
 * 4. `children`: the leagues' own sections (`#sunset`, `#independents`), each saying which of its teams play
 *    in it, after the tournament's.
 *
 * No seed: none is published, and the copy rules forbid a seed word on these pages. The sources are named,
 * because nothing official publishes the event.
 */
export interface OutsideTournamentProps {
  view: OutsideTournamentView;
  /** `toc`: the section's id, the target of the board row's and the team pages' links. */
  id: string;
  /** 'the Sunset and the LA independents': whose postseason it is, for the heading's meta. */
  whose: string;
  /** The event as a bracket (TournamentBracket), drawn in place of the games by day when its config has one. */
  bracket?: React.ReactNode;
  /** The leagues' sections, drawn after the tournament's. */
  children?: React.ReactNode;
  className?: string;
}

export function OutsideTournament({ view, id, whose, bracket, children, className }: OutsideTournamentProps) {
  return (
    <>
      <section id={id} aria-labelledby={`${id}-heading`} className={['sx-section', className].filter(Boolean).join(' ')}>
        <SectionHeader id={`${id}-heading`} kicker={view.name} meta={view.dates} />
        <div id={`${id}-games`} className="sx-target">
          {bracket ? (
            bracket
          ) : view.rounds.length === 0 ? (
            <p className="sx-empty">No tournament game is on MaxPreps yet.</p>
          ) : (
            view.rounds.map((round) => (
              <section key={round.dateKey} aria-labelledby={`${id}-${round.dateKey}`}>
                <SectionHeader
                  strip
                  id={`${id}-${round.dateKey}`}
                  kicker={round.label ?? round.dateLabel}
                  meta={round.label ? round.dateLabel : undefined}
                />
                <GameList games={round.games} />
              </section>
            ))
          )}
        </div>
        <p className="sx-note">{`The postseason for ${whose}. ${view.note}`}</p>
        <p className="sx-linkrow">
          {view.sources.map((s) => (
            <ExternalLink key={s.href} href={s.href} className="sx-action">
              {s.label}
            </ExternalLink>
          ))}
        </p>
      </section>
      {children}
    </>
  );
}

export default OutsideTournament;
