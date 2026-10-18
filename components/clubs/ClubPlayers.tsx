import Link from 'next/link';

import EmptyState from '@/components/ui/EmptyState';
import ExternalLink from '@/components/ui/ExternalLink';
import GridRowFiller from '@/components/ui/GridRowFiller';
import SectionHeader from '@/components/ui/SectionHeader';
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
 *
 * From two columns each row is a subgrid of the list's rows, four per row of cells, one per line
 * above, so the lines of the cells side by side start level: when one cell's status wrapped, its
 * sources sat 20px below its neighbours'. The fillers span the same four.
 */

function PlayerRow({ row }: { row: ClubPlayerRow }) {
  return (
    <li className="sx-gridcell sm:row-span-4 sm:grid sm:grid-cols-[minmax(0,1fr)] sm:grid-rows-subgrid">
      <span className="block text-body text-ink">{row.name}</span>
      <span className="block text-meta text-ink-2">
        {/* `prefetch={false}`: one link per row, to a static team page (tests/ui/prefetch-policy). */}
        {/* Each dot sits inside the nowrap span of the item before it: the link is inline-flex, an
            atomic inline, so a no-break space after it would still let a line start with the dot. */}
        <span className="whitespace-nowrap">
          <Link href={row.school.href} prefetch={false} className="sx-action text-accent hover:underline">
            <span>
              {row.school.name}
              <span className="sr-only"> roster</span>
            </span>
          </Link>
          {row.facts.length > 0 ? <>&nbsp;&middot;</> : null}
        </span>
        {row.facts.map((fact, i) => (
          <span key={i}>
            {' '}
            <span className="whitespace-nowrap">
              {fact}
              {i < row.facts.length - 1 ? <>&nbsp;&middot;</> : null}
            </span>
          </span>
        ))}
      </span>
      <span className="block text-meta text-ink-2">{row.status}</span>
      <span className="block text-meta text-ink-2">
        <span className="text-ink-3">Sources:</span>&nbsp;
        {row.sources.map((source, i) => (
          <span key={source.url}>
            {i > 0 ? ' ' : null}
            <span className="whitespace-nowrap">
              <ExternalLink href={source.url} className="sx-action gap-1 whitespace-nowrap">
                <span>
                  <span className="sr-only">{row.name}: </span>
                  {source.label}
                </span>
              </ExternalLink>
              {i < row.sources.length - 1 ? <>&nbsp;&middot;</> : null}
            </span>
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
          <ul className="sx-card sx-flush sx-bleed my-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-3">
            {group.rows.map((row) => (
              <PlayerRow key={row.key} row={row} />
            ))}
            <GridRowFiller count={group.rows.length} columns={{ sm: 2, lg: 3 }} className="sm:row-span-4" />
          </ul>
        </div>
      ))}
    </div>
  );
}

export default ClubPlayers;
