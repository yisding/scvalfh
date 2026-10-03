/**
 * The SERVER half of the schedule filter contract (SPEC §10.4): the registry-dependent writers of
 * the `data-*` attributes that `ScheduleFilters` reads. They moved here unchanged in behaviour
 * from `filter-data.ts`, so the client module never reaches lib/teams (SPEC §0.4 client boundary).
 */

import { getTeamBySlug } from '../../lib/teams';
import type { DivisionId, Game, TeamSlug } from '../../lib/types';

import { scheduleState, type GameFilterAttrs } from './filter-data';

export type { GameFilterAttrs } from './filter-data';

/** The divisions a contest touches. A cross-division (or cross-league) game touches both. */
export function gameDivisions(game: Game): DivisionId[] {
  const out: DivisionId[] = [];
  for (const side of [game.away, game.home]) {
    const team = side.slug ? getTeamBySlug(side.slug) : undefined;
    if (team && !out.includes(team.division)) out.push(team.division);
  }
  return out;
}

/** The `data-*` attributes to spread onto a game's list item. "League game" reads `countsFor`. */
export function gameFilterAttrs(game: Game): GameFilterAttrs {
  const slugs = [game.away.slug, game.home.slug].filter((s): s is TeamSlug => s !== null);
  return {
    'data-game': game.contestId,
    'data-slugs': ` ${slugs.join(' ')} `,
    'data-divisions': ` ${gameDivisions(game).join(' ')} `,
    'data-league': game.countsFor !== null ? '1' : '0',
    'data-state': scheduleState(game),
  };
}

/**
 * The `ScheduleFilters` props for one league (SPEC §10.4), from plain inputs: the league's teams
 * (short names; `divisionLabel` from the summary's `divisionHeading`, null in a one-table league)
 * and its divisions — `[]` for a single-division league, so no division select renders.
 */
export function scheduleFilterProps(
  league: {
    singleDivision: boolean;
    divisions: ReadonlyArray<{ id: DivisionId; label: string; heading: string | null }>;
  },
  teams: ReadonlyArray<{ slug: TeamSlug; shortName: string; division: DivisionId }>,
): {
  teams: Array<{ slug: string; name: string; division: string; divisionLabel: string | null }>;
  divisions: Array<{ id: string; label: string }>;
} {
  return {
    // shortName, not name: "St. Ignatius College Preparatory" is 31 characters in a 176px
    // control, and the short form is the one the standings table and every game row use.
    teams: teams.map((team) => ({
      slug: team.slug,
      name: team.shortName,
      division: team.division,
      divisionLabel: league.divisions.find((d) => d.id === team.division)?.heading ?? null,
    })),
    divisions: league.singleDivision ? [] : league.divisions.map((d) => ({ id: d.id, label: d.heading ?? d.label })),
  };
}
