import Link from 'next/link';

import EmptyState from '../ui/EmptyState';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import type { ClubPageView, ClubPlayerRow } from './club-view';

/**
 * A club page's players (DESIGN §17.1): only players on the tracked varsity rosters, each with the
 * public pages that tie them to the club. Current ties first, then earlier or merely listed ones;
 * school, then name, within each. The lede says recall is partial, as the empty state does: under
 * a count, a bare list otherwise reads as every tracked player the club has.
 *
 * Privacy (DESIGN §17.2): a row is a roster row of this site, by its own spelling, and shows what
 * the team page already shows (name, school, grade) plus the club team, the status in words and
 * the links. The quotes, the basis and the confidence the data file keeps are not in the view at
 * all (components/clubs/club-view.ts), so nothing here can print them.
 *
 * Each row is the team roster's row (components/teams/TeamRoster.tsx), the same card and grid:
 *   - the name;
 *   - the school, linking that team's roster, then the grade and the club team, each kept whole
 *     with a no-break space before its dot (the AwardsBlock rule);
 *   - the status on its own line, never `nowrap`: "Listed by the Gilroy Dispatch, Jul 18, 2025"
 *     is about 300px wide;
 *   - the sources, each an off-site link whose accessible name leads with the player
 *     ("Storey Lewis: SportsRecruits profile"). ": " rather than "’s", because labels include
 *     "Gilroy Dispatch" and "NorCal Impact site".
 * Every link stands alone in its row, so each carries the 24px `sx-action` box (WCAG 2.5.8), with
 * the sr-only name and the label in ONE span: `.sx-action` is inline-flex and would otherwise trim
 * the space between them.
 *
 * The two groups get an h3 each only when both exist (DESIGN §17.3): a lone "Current" over
 * the only list adds a heading level and no information, and every row states its own status.
 */

function PlayerRow({ row }: { row: ClubPlayerRow }) {
  return (
    <li className="min-w-0 border-t border-divider px-gutter py-2.5 first:border-t-0 sm:px-4 sm:[&:nth-child(2)]:border-t-0 lg:[&:nth-child(3)]:border-t-0">
      <span className="block text-body text-ink">{row.name}</span>
      <span className="block text-meta text-ink-2">
        {/* `prefetch={false}`: one link per row, to a static team page (tests/ui/prefetch-policy). */}
        <Link href={row.school.href} prefetch={false} className="sx-action text-accent hover:underline">
          <span>
            {row.school.name}
            <span className="sr-only"> roster</span>
          </span>
        </Link>
        {row.facts.map((fact, i) => (
          <span key={i}>
            &nbsp;&middot; <span className="whitespace-nowrap">{fact}</span>
          </span>
        ))}
      </span>
      <span className="block text-meta text-ink-2">{row.status}</span>
      <span className="block text-meta text-ink-2">
        <span className="text-ink-3">Sources:</span>&nbsp;
        {row.sources.map((source, i) => (
          <span key={source.url}>
            {i > 0 ? <>&nbsp;&middot; </> : null}
            <ExternalLink href={source.url} className="sx-action gap-1 whitespace-nowrap">
              <span>
                <span className="sr-only">{row.name}: </span>
                {source.label}
              </span>
            </ExternalLink>
          </span>
        ))}
      </span>
    </li>
  );
}

export interface ClubPlayersProps {
  view: ClubPageView;
}

export function ClubPlayers({ view }: ClubPlayersProps) {
  if (view.groups.length === 0) {
    return (
      <EmptyState heading={`No player on this site’s varsity rosters is tied to ${view.name}.`}>
        No public page we found ties one of them to this club; that does not mean none plays for
        it. Checked {view.checkedOn}.
      </EmptyState>
    );
  }
  const labelled = view.groups.length > 1;
  return (
    <div>
      <p className="mt-0 mb-3 max-w-prose text-meta text-ink-2">
        Only players on the {view.trackedTeams} varsity rosters this site tracks, each with the public
        pages that tie them to {view.name}. Recall is partial: a player not listed here may still play
        for {view.name}.
      </p>
      {view.groups.map((group, i) => (
        <div key={group.id} className={i > 0 ? 'mt-6' : undefined}>
          {labelled ? <SectionHeader as="h3" size="label" kicker={group.heading} /> : null}
          <ul className="sx-card sx-flush sx-bleed m-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-3">
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
