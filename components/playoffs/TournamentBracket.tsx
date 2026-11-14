import { BracketView } from '../history/HistoryBracket';
import ExternalLink from '../ui/ExternalLink';

import type { TournamentBracketView } from './tournament-bracket-view';

/**
 * An event's bracket on /playoffs (the EAL's Super Regional, `#eal`; the Tournament of Champions, `#toc`), drawn
 * by the shared drawer as every other bracket is: the tree's rounds, with the third- and fifth-place games under
 * the final (they show with the final's tab on a phone), then one line saying what the bracket is drawn from.
 * The view model is tournament-bracket-view.ts's: a card shows who went through even where no score is
 * published, and prints no seed. A server component (the drawer reads the registry).
 */
export interface TournamentBracketProps {
  view: TournamentBracketView;
  /** The event's name, for the bracket's accessible name: 'Super Regional'. */
  name: string;
  /** The league or event id ('eal', 'toc'): prefixes the cards' ids. */
  idPrefix: string;
  /** What the bracket is drawn from, one sentence. */
  basis: string;
  /** The document the pairings come from, when there is one. */
  source?: { label: string; url: string } | null;
  className?: string;
}

export function TournamentBracket({ view, name, idPrefix, basis, source, className }: TournamentBracketProps) {
  return (
    <div id={`${idPrefix}-bracket`} className={['sx-target', className].filter(Boolean).join(' ')}>
      <BracketView division={view.division} label={`${name} bracket`} anchorPrefix={`${idPrefix}-`} />
      <p className="sx-note">
        {basis}
        {source ? (
          <>
            {' '}
            <ExternalLink href={source.url}>{source.label}</ExternalLink>
          </>
        ) : null}
      </p>
    </div>
  );
}

export default TournamentBracket;
