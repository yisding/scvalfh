import ExternalLink from '../ui/ExternalLink';
import type { ClubProgramRow } from './club-view';

/**
 * A club page's "Teams and programs" (DESIGN §16.1): what the club lists on its own pages, each
 * with the page it was read from. The heading is not the spec's "Teams the club runs" (DESIGN
 * §16.6): the lists include tournaments, camps, clinics and private lessons, which are not teams.
 *
 * The players' row pattern (components/clubs/ClubPlayers.tsx): the name, the detail when the club
 * gives one, then the source link on its own line. The link says what it opens ("club site"); its
 * accessible name says which program ("U16: club site"), so a links list of ten "club site"s still
 * tells them apart. The detail is free text from the club's site and always wraps.
 */
export function ClubPrograms({ programs }: { programs: ClubProgramRow[] }) {
  return (
    <ul className="sx-card sx-flush sx-bleed m-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-3">
      {programs.map((p) => (
        <li
          key={p.key}
          className="min-w-0 border-t border-divider px-gutter py-2.5 first:border-t-0 sm:px-4 sm:[&:nth-child(2)]:border-t-0 lg:[&:nth-child(3)]:border-t-0"
        >
          <span className="block text-body text-ink">{p.name}</span>
          {p.detail ? <span className="block text-meta text-ink-2">{p.detail}</span> : null}
          <span className="block text-meta">
            <ExternalLink href={p.source.url} className="sx-action gap-1">
              <span>
                <span className="sr-only">{p.name}: </span>
                {p.source.label}
              </span>
            </ExternalLink>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default ClubPrograms;
