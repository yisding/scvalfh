import { Fragment } from 'react';
import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import TeamMonogram from '../ui/TeamMonogram';
import type { ClubPageView, ClubPlayerRow } from './club-view';

/**
 * A club page's players (DESIGN §33): only players on the tracked varsity rosters, each with the
 * public pages that tie them to the club. Current ties first, then earlier or merely listed ones;
 * by last name within each (then school, for two players of one name). One line above the list says
 * recall is partial, as the empty line does: under a count, a bare list otherwise reads as every
 * tracked player the club has.
 *
 * Privacy (DESIGN §17.2): a row is a roster row of this site, by its own spelling, and shows what
 * the team page already shows (name, school, grade) plus the club team, the status in words and
 * the links. The quotes, the basis and the confidence the data file keeps are not in the view at
 * all (components/clubs/club-view.ts), so nothing here can print them.
 *
 * An entry, in `sx-auto` columns with a hairline under each (the team roster's layout):
 *   - the name;
 *   - the school with its logo, linking that team's roster, then the grade and the club team, each
 *     its own element;
 *   - the status on its own line, never `nowrap`: "Listed by the Gilroy Dispatch, Jul 18, 2025"
 *     is about 300px wide;
 *   - ONE sources line, "Sources: A, B", each an off-site link whose accessible name leads with the
 *     player ("Storey Lewis: SportsRecruits profile"). ": " rather than "’s", because labels include
 *     "Gilroy Dispatch" and "NorCal Impact site".
 *
 * The two groups get an h3 each only when both exist: a lone "Current" over the only list adds a
 * heading level and no information, and every row states its own status.
 */

/** The link around a school in an entry (each caller writes the `<Link>`, so its href is in its own file). */
export const SCHOOL_LINK = 'sx-teamlink inline-flex min-h-7 items-center gap-2 text-ink pointer-coarse:min-h-11';

/** A school in an entry: its logo and name, inside the link to the team's roster. */
export function SchoolFace({ school }: { school: ClubPlayerRow['school'] }) {
  return (
    <>
      <TeamMonogram team={school} size={24} />
      <span>
        {school.name}
        <span className="sr-only"> roster</span>
      </span>
    </>
  );
}

/** "Sources: A, B": every page a row rests on, in one line. */
export function SourcesLine({ name, sources }: { name: string; sources: ClubPlayerRow['sources'] }) {
  return (
    <span className="block text-cell text-ink-2">
      Sources:{' '}
      {sources.map((source, i) => (
        <Fragment key={source.url}>
          {i > 0 ? ', ' : null}
          <ExternalLink href={source.url} arrow={false} className="sx-link">
            <span>
              <span className="sr-only">{name}: </span>
              {source.label}
            </span>
          </ExternalLink>
        </Fragment>
      ))}
    </span>
  );
}

function PlayerRow({ row }: { row: ClubPlayerRow }) {
  return (
    <li className="min-w-0 border-b border-hairline py-1.5">
      <span className="block text-body font-semibold text-ink">{row.name}</span>
      <span className="flex flex-wrap items-center gap-x-3 text-cell text-ink-2">
        {/* `prefetch={false}`: one link per row, to a static team page (tests/ui/prefetch-policy). */}
        <Link href={row.school.href} prefetch={false} className={SCHOOL_LINK}>
          <SchoolFace school={row.school} />
        </Link>
        {row.facts.map((fact, i) => (
          <span key={i}>{fact}</span>
        ))}
      </span>
      <span className="block text-cell text-ink-2">{row.status}</span>
      <SourcesLine name={row.name} sources={row.sources} />
    </li>
  );
}

export interface ClubPlayersProps {
  view: ClubPageView;
}

export function ClubPlayers({ view }: ClubPlayersProps) {
  if (view.groups.length === 0) {
    return (
      <p className="sx-empty max-w-prose">
        No player on this site&rsquo;s varsity rosters is tied to {view.name}. No public page we found ties
        one of them to this club; that does not mean none plays for it. Checked {view.checkedOn}.
      </p>
    );
  }
  const labelled = view.groups.length > 1;
  return (
    <div>
      <p className="sx-note mt-0 mb-2 max-w-prose">
        Only players on the {view.trackedTeams} varsity rosters this site tracks, each with the public
        pages that tie them to {view.name}. Recall is partial: a player not listed here may still play
        for {view.name}.
      </p>
      {view.groups.map((group, i) => (
        <div key={group.id} className={i > 0 ? 'mt-6' : undefined}>
          {labelled ? <h3 className="m-0 text-lead text-ink">{group.heading}</h3> : null}
          <ul className="sx-auto m-0 list-none p-0">
            {group.rows.map((row) => (
              <PlayerRow key={row.key} row={row} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default ClubPlayers;
