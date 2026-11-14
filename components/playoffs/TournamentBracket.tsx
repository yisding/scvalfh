import { shortDate } from '../../lib/format';
import { BracketView } from '../history/HistoryBracket';
import ExternalLink from '../ui/ExternalLink';

import type { TournamentBracketView } from './tournament-bracket-view';

/**
 * An event's bracket inside its league's /playoffs section (the EAL's Super Regional, `#eal`): the first round,
 * the semifinals and the final drawn by the shared drawer, then the third- and fifth-place games as cards of
 * their own, then where the pairings come from. The view model is tournament-bracket-view.ts's: a card shows who
 * went through even where no score is published, and prints no seed. A server component (the drawer reads the
 * registry).
 */
export interface TournamentBracketProps {
  view: TournamentBracketView;
  /** The event's name, for the bracket's accessible name: 'Super Regional'. */
  name: string;
  /** The league id ('eal'): prefixes the cards' ids. */
  idPrefix: string;
  source: { label: string; url: string; retrievedOn: string };
  className?: string;
}

export function TournamentBracket({ view, name, idPrefix, source, className }: TournamentBracketProps) {
  return (
    <div id={`${idPrefix}-bracket`} className={className}>
      <BracketView division={view.division} label={`${name} bracket`} anchorPrefix={`${idPrefix}-`} />
      {/* The placement games side by side, each the width of a bracket column, not the page's. */}
      {view.placement.length > 0 ? (
        <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {view.placement.map((p) => (
            <div key={p.card.key} className="min-w-0">
              <BracketView
                division={{ rounds: [{ key: p.card.key, name: p.name, dateLabel: '', cards: [p.card], byes: null }] }}
                label={`${name}, ${p.name.toLowerCase()}`}
                anchorPrefix={`${idPrefix}-`}
              />
            </div>
          ))}
        </div>
      ) : null}
      <p className="sx-note">
        {`Pairings, times and fields from the day’s game schedule (read ${shortDate(source.retrievedOn)}); results as the sources have them.`}{' '}
        <ExternalLink href={source.url}>{source.label}</ExternalLink>
      </p>
    </div>
  );
}

export default TournamentBracket;
