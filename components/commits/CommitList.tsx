import Link from 'next/link';

import ExternalLink from '@/components/ui/ExternalLink';
import GridRowFiller from '@/components/ui/GridRowFiller';
import type { CommitRow } from '@/views/commits/commit-view';

/**
 * One class's commitments on /commits (DESIGN §21.1): each a player on the tracked varsity rosters,
 * the college, the status in words, and the public pages it rests on.
 *
 * Privacy (DESIGN §21.2, the clubs pages' posture): a row is a roster row of this site, by its own
 * spelling, and shows what the team page already shows (name, school, grade) plus the college, the
 * status and the links. The quotes, the basis and the confidence the data file keeps are not in the
 * view at all (views/commits/commit-view.ts), so nothing here can print them.
 *
 * Each row is the club page's player row (components/clubs/ClubPlayers.tsx), the same card and
 * row-major grid as the team roster:
 *   - the name;
 *   - the school, linking that team's roster, then the grade, kept whole with a no-break space
 *     before its dot (the AwardsBlock rule);
 *   - the college: its display name, the official name when that is a short one, the sport, and
 *     the division of the college's team in that sport, each part wrapping on its own;
 *   - the status on its own line;
 *   - the sources, each an off-site link whose accessible name leads with the player ("Pat
 *     Example: SportsRecruits profile").
 * The row's id is commitAnchor() (team slug + MaxPreps athleteId, never a name): a team page's
 * commitment line links it (html's scroll-padding keeps the target clear of the sticky header).
 * Every link stands alone in its row, so each carries the 24px `sx-action` box (WCAG
 * 2.5.8), with the sr-only name and the label in ONE span, as ClubPlayers explains.
 *
 * From two columns each row is a subgrid of the list's rows, five per row of cells, one per line
 * above, so the lines of the cells side by side start level: when one cell's college wrapped, its
 * status and sources sat 20px below its neighbours'. The fillers span the same five.
 */
function Row({ row }: { row: CommitRow }) {
  return (
    <li
      id={row.anchor}
      className="sx-gridcell sm:row-span-5 sm:grid sm:grid-cols-[minmax(0,1fr)] sm:grid-rows-subgrid"
    >
      <span className="block text-body text-ink">{row.name}</span>
      <span className="block text-meta text-ink-2">
        {/* `prefetch={false}`: one link per row, to a static team page (tests/arch/prefetch-policy). */}
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
      <span className="block text-meta text-ink-2">
        {/* Each dot glued to the item before it, so a wrapped line never starts with one. */}
        <span className="font-semibold text-ink">{row.college.name}</span>&nbsp;&middot;{' '}
        {row.college.fullName ? <>{row.college.fullName}&nbsp;&middot;{' '}</> : null}
        <span className="whitespace-nowrap">{row.college.sport}&nbsp;&middot;</span>{' '}
        <span className="whitespace-nowrap">{row.college.division}</span>
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

export interface CommitListProps {
  rows: CommitRow[];
}

export function CommitList({ rows }: CommitListProps) {
  return (
    <ul className="sx-card sx-flush sx-bleed my-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <Row key={row.key} row={row} />
      ))}
      <GridRowFiller count={rows.length} columns={{ sm: 2, lg: 3 }} className="sm:row-span-5" />
    </ul>
  );
}

export default CommitList;
