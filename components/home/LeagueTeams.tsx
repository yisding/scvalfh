import SectionHeader from '../ui/SectionHeader';

import type { LeagueTeamsView } from './home-data';
import PinTile from './PinTile';

/**
 * "Teams in <SHORT>" (SPEC §10.1): the league's teams as pin tiles, grouped by division (an h4
 * sub-label per division, only for a multi-division league), in today's four-column grid.
 *
 * Server-rendered once PER LEAGUE inside that league's panel, so the scope stylesheet shows the
 * right league's tiles before first paint and no client code decides "which league's tiles". The
 * whole block hides once a team is pinned (`html[data-pin]`), when the pinned card replaces it.
 */
export interface LeagueTeamsProps {
  view: LeagueTeamsView;
  className?: string;
}

const GRID = 'm-0 grid list-none grid-cols-4 gap-1.5 p-0 min-[360px]:gap-2';

export function LeagueTeams({ view, className }: LeagueTeamsProps) {
  const intro = view.singleDivision
    ? `Teams in ${view.shortName}.`
    : `Teams in ${view.shortName}, by division.`;
  return (
    <section className={`[html[data-pin]_&]:hidden${className ? ` ${className}` : ''}`}>
      <SectionHeader as="h3" kicker={`Teams in ${view.shortName}`} />
      <p className="sr-only">{intro} Choose one to pin it to the top of this page.</p>
      {view.groups.map((group, i) =>
        group.heading ? (
          <div key={group.id} className={i === 0 ? 'mt-0' : 'mt-4'}>
            <h4 className="m-0 mb-2 text-lead text-ink">{group.heading}</h4>
            <ul className={GRID}>
              {group.tiles.map((tile) => (
                <li key={tile.slug} className="min-w-0">
                  <PinTile tile={tile} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul key={group.id} className={GRID}>
            {group.tiles.map((tile) => (
              <li key={tile.slug} className="min-w-0">
                <PinTile tile={tile} />
              </li>
            ))}
          </ul>
        ),
      )}
    </section>
  );
}

export default LeagueTeams;
