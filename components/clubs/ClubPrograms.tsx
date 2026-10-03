import ExternalLink from '../ui/ExternalLink';
import type { ClubProgramRow, ClubProgramsSource } from './club-view';

/**
 * A club page's "Teams and programs" (DESIGN §16.1): what the club lists on its own pages, each
 * with the page it was read from. The heading is not the spec's "Teams the club runs" (DESIGN
 * §16.6): the lists include tournaments, camps, clinics and private lessons, which are not teams.
 *
 * The players' row pattern (components/clubs/ClubPlayers.tsx): the name, the detail when the club
 * gives one, then the source link on its own line. Most clubs list several programs on one page,
 * so that page is linked once, under the list ("Listed on the club’s site: Programs overview"), and
 * a row keeps a link only when it was read from another page (components/clubs/club-view.ts
 * `programsSource`). A row's link says what it opens ("club site"); its accessible name says which
 * program ("U19 Hawks Blue: SportsRecruits team page"), and the shared link's says which section
 * ("Teams and programs: Program overview"), so each link in the section has a name of its own and
 * the shared one is not read as the same-named link under "Pages about the club". The detail is
 * free text from the club's site and always wraps.
 */
export function ClubPrograms({ programs, shared }: { programs: ClubProgramRow[]; shared: ClubProgramsSource | null }) {
  return (
    <div>
      <ul className="sx-card sx-flush sx-bleed m-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-3">
        {programs.map((p) => (
          <li
            key={p.key}
            className="min-w-0 border-t border-divider px-gutter py-2.5 first:border-t-0 sm:px-4 sm:[&:nth-child(2)]:border-t-0 lg:[&:nth-child(3)]:border-t-0"
          >
            <span className="block text-body text-ink">{p.name}</span>
            {p.detail ? <span className="block text-meta text-ink-2">{p.detail}</span> : null}
            {p.source ? (
              <span className="block text-meta">
                <ExternalLink href={p.source.url} className="sx-action gap-1">
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
        <p className="mt-3 mb-0 max-w-prose text-meta text-ink-2">
          {shared.lead}:&nbsp;
          <ExternalLink href={shared.url} className="sx-action gap-1">
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
