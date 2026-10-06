import Link from 'next/link';

import type { IndependentGroupView } from './standings-view';

/**
 * A group with no league table, drawn wherever a division's table would be (DESIGN §24.9): the Southern
 * Section independents (Glendora, Harvard-Westlake and Thousand Oaks), each the only field hockey team in its
 * all-sports league, play no league games, so there is nothing to rank. The block says so in the group's own
 * sentence (`DivisionConfig.official.note`) and links each team's page, where every game it plays is listed.
 *
 * No place, no PTS, no GP, no ladder line, no "league games only" caption: a table of three 0-0-0 rows would
 * claim a league that does not exist. `filterable` carries the /teams finder's row hook (`data-team-tile`) on
 * each team, as CompactStandingsTable does on its rows, so a search for "Glendora" filters this block too, and
 * hides the note while a search runs (`data-hide-while-searching`, as the ladder row is).
 */
export interface IndependentGroupProps {
  group: IndependentGroupView;
  /** Carry the TeamFinder filter hooks on the team items. */
  filterable?: boolean;
  /** `compact`: the home card's narrow column (smaller text, no card). */
  variant?: 'card' | 'compact';
  className?: string;
}

export function IndependentGroup({ group, filterable = false, variant = 'card', className }: IndependentGroupProps) {
  const compact = variant === 'compact';
  return (
    <div className={[compact ? null : 'sx-card p-4 md:p-5', className].filter(Boolean).join(' ')}>
      <p
        data-hide-while-searching={filterable ? '' : undefined}
        className={['m-0 max-w-prose', compact ? 'text-meta text-ink-2' : 'text-body text-ink-2'].join(' ')}
      >
        {group.note}
      </p>
      <ul className={['m-0 mt-3 flex list-none flex-col gap-1 p-0', compact ? 'text-meta' : 'text-body'].join(' ')}>
        {group.teams.map((team) => (
          <li
            key={team.slug}
            data-team-slug={team.slug}
            data-team-tile={filterable ? team.slug : undefined}
          >
            <Link href={team.href} prefetch={false} className="font-medium text-accent hover:underline">
              {/* As on a table row (CompactStandingsTable): the pinned team's item (its `data-team-slug`
                  gets `data-pinned`) says "your team" in words, not with the accent rule alone. */}
              <span className="sr-only">
                <span className="sx-pin-note">Your team. </span>
              </span>
              {team.name}
            </Link>
            <span className="text-ink-3"> &middot; {team.city}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default IndependentGroup;
