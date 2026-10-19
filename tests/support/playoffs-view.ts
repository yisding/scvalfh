/**
 * The /playoffs modules on the offline all-2026-10-02 corpus snapshot (SPEC §13.6), shared by
 * tests/views/playoffs/*.test.ts: the module names assertion messages cite, the loaded modules, the live projection
 * rows of a division, rows with chosen statuses or outcomes, and the projection built from them.
 */

import type { PlayoffStatus } from '@/lib/model/standings';
import { getTeamById } from '@/lib/registry/teams';
import { useCorpusModules } from '@/tests/support/corpus-modules';
import { loadQueries } from '@/tests/support/queries';
import type { ProjectionRow } from '@/views/playoffs/projection';

export const VIEW = 'views/playoffs/projection.ts';

export const PAIRINGS = 'views/playoffs/pairings.ts';

export const KEY_DATES = 'views/playoffs/key-dates.ts';

export const PAGE = 'app/playoffs/page.tsx';

export const m = useCorpusModules('all-2026-10-02', {
  data: loadQueries,
  projection: () => import('@/views/playoffs/projection'),
  pairings: () => import('@/views/playoffs/pairings'),
  keyDates: () => import('@/views/playoffs/key-dates'),
  leagues: () => import('@/lib/config/leagues'),
  labels: () => import('@/lib/config/leagues/labels'),
  page: () => import('@/app/playoffs/page'),
});

export function liveRows(division: string): ProjectionRow[] {
  const league = m.leagues.leagueOfDivision(division).id;
  return m.data.getPlayoffProjection(league).byDivision[division].flatMap((row) => {
    const team = getTeamById(row.teamId);
    const standing = m.data.getStandingFor(row.teamId);
    if (!team || !standing) return [];
    return [{ team, standing, status: row.status, statuses: row.statuses, label: row.label, shared: row.shared }];
  });
}

/** The same rows with the statuses forced, which is what each by-law case turns on. */
export function withStatuses(division: string, statuses: PlayoffStatus[]): ProjectionRow[] {
  return liveRows(division).map((row, i) => ({
    ...row,
    status: statuses[i] ?? 'out',
    statuses: [statuses[i] ?? 'out'],
    shared: statuses[i] !== undefined && (statuses[i] === statuses[i - 1] || statuses[i] === statuses[i + 1]),
  }));
}

/** A row that straddles a by-law boundary carries BOTH statuses. */
export function withOutcomes(division: string, outcomes: PlayoffStatus[][]): ProjectionRow[] {
  return liveRows(division).map((row, i) => {
    const statuses = outcomes[i] ?? ['out'];
    return { ...row, status: statuses[0], statuses, shared: statuses.length > 1 };
  });
}

export function build(division: string, rows: ProjectionRow[]) {
  return m.projection.buildDivisionProjection(division, m.labels.divisionLabel(division), rows, m.projection.ladderFactsFor(division));
}
