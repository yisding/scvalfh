import ExternalLink from '../ui/ExternalLink';
import type { ClubProgramRow, ClubProgramsSource } from './club-view';

/**
 * A club page's "Teams and programs" (DESIGN §33): what the club lists on its own pages, each
 * with the page it was read from. The heading is not "Teams the club runs": the lists include
 * tournaments, camps, clinics and private lessons, which are not teams.
 *
 * The players' entry (components/clubs/ClubPlayers.tsx): the name, the detail when the club
 * gives one, then the source link on its own line. Most clubs list several programs on one page,
 * so that page is linked once, under the list ("Listed on the club’s site: Programs overview"), and
 * a row keeps a link only when it was read from another page (components/clubs/club-view.ts
 * `programsSource`). A row's link says what it opens ("club site"); its accessible name says which
 * program ("U19 Hawks Blue: SportsRecruits team page"), and the shared link's says which section
 * ("Teams and programs: Program overview"), so each link in the section has a name of its own and
 * the shared one is not read as the same-named link under "Pages about the club". The detail is
 * free text from the club's site and always wraps.
 */
export interface ClubProgramsProps {
  programs: ClubProgramRow[];
  shared: ClubProgramsSource | null;
}

export function ClubPrograms({ programs, shared }: ClubProgramsProps) {
  return (
    <div>
      <ul className="sx-auto m-0 list-none p-0">
        {programs.map((p) => (
          <li key={p.key} className="min-w-0 border-b border-hairline py-1.5">
            <span className="block text-body font-semibold text-ink">{p.name}</span>
            {p.detail ? <span className="block text-cell text-ink-2">{p.detail}</span> : null}
            {p.source ? (
              <span className="block">
                <ExternalLink href={p.source.url} className="sx-action">
                  <span>
                    <span className="sr-only">{p.name}: </span>
                    {p.source.label}
                  </span>
                </ExternalLink>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {shared ? (
        <p className="sx-note max-w-prose">
          {shared.lead}:{' '}
          <ExternalLink href={shared.url}>
            <span>
              <span className="sr-only">Teams and programs: </span>
              {shared.label}
            </span>
          </ExternalLink>
        </p>
      ) : null}
    </div>
  );
}

export default ClubPrograms;
