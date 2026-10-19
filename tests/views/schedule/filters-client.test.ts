/**
 * `matchesFilter` (views/schedule/filters-client.ts): the rule `/schedule/<league>`'s filters apply
 * to each server-rendered `[data-game]` row. Pure, so it runs on plain objects in node; the browser
 * hands it `row.dataset` (components/hooks/schedule-filter-dom.ts). The attribute values are the
 * ones `gameFilterAttrs` writes: slugs and division ids padded with a space either side.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FILTERS,
  matchesFilter,
  type FilterState,
  type GameFilterDataset,
} from '@/views/schedule/filters-client';

const ROW: GameFilterDataset = {
  slugs: ' los-altos mountain-view ',
  divisions: ' el-camino ',
  league: '1',
  state: 'final',
};

const filters = (patch: Partial<FilterState>): FilterState => ({ ...DEFAULT_FILTERS, ...patch });

describe('matchesFilter', () => {
  it('shows every row under the default filters, even one with no attributes', () => {
    expect(matchesFilter(ROW, DEFAULT_FILTERS)).toBe(true);
    expect(matchesFilter({}, DEFAULT_FILTERS)).toBe(true);
  });

  it('matches a team only as a whole slug', () => {
    expect(matchesFilter(ROW, filters({ team: 'los-altos' }))).toBe(true);
    expect(matchesFilter(ROW, filters({ team: 'mountain-view' }))).toBe(true);
    expect(matchesFilter(ROW, filters({ team: 'altos' }))).toBe(false);
    expect(matchesFilter(ROW, filters({ team: 'palo-alto' }))).toBe(false);
    expect(matchesFilter({}, filters({ team: 'los-altos' }))).toBe(false);
  });

  it('matches a division only as a whole id', () => {
    expect(matchesFilter(ROW, filters({ division: 'el-camino' }))).toBe(true);
    expect(matchesFilter(ROW, filters({ division: 'camino' }))).toBe(false);
    expect(matchesFilter({}, filters({ division: 'el-camino' }))).toBe(false);
  });

  it('splits league from non-league games by the 1 / 0 flag', () => {
    expect(matchesFilter(ROW, filters({ type: 'league' }))).toBe(true);
    expect(matchesFilter(ROW, filters({ type: 'non-league' }))).toBe(false);
    const nonLeague = { ...ROW, league: '0' };
    expect(matchesFilter(nonLeague, filters({ type: 'league' }))).toBe(false);
    expect(matchesFilter(nonLeague, filters({ type: 'non-league' }))).toBe(true);
    // A row with no flag is neither: it never matches a type filter.
    expect(matchesFilter({}, filters({ type: 'league' }))).toBe(false);
    expect(matchesFilter({}, filters({ type: 'non-league' }))).toBe(false);
  });

  it('matches the state exactly', () => {
    expect(matchesFilter(ROW, filters({ state: 'final' }))).toBe(true);
    expect(matchesFilter(ROW, filters({ state: 'upcoming' }))).toBe(false);
    expect(matchesFilter({ ...ROW, state: 'pending' }, filters({ state: 'pending' }))).toBe(true);
  });

  it('needs every active filter to accept the row', () => {
    expect(matchesFilter(ROW, filters({ team: 'los-altos', division: 'el-camino', type: 'league', state: 'final' }))).toBe(true);
    expect(matchesFilter(ROW, filters({ team: 'los-altos', division: 'el-camino', type: 'league', state: 'upcoming' }))).toBe(false);
    expect(matchesFilter(ROW, filters({ team: 'los-altos', division: 'other', type: 'league', state: 'final' }))).toBe(false);
  });
});
