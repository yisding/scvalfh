/**
 * The view order (§4.1, risk R1): the ordered list of fixture ids that mirrors the legacy `state.games` order at
 * each stage. Several rules decide by list order (the official matcher takes the first game, the backfill's used
 * set, the sheet's first candidate), so the order is kept exactly as the legacy steps build it: appended where they
 * append, and re-sorted where, and how, they sort. It is never derived from the fixture ids. Pure.
 */

import { byDateThenId } from '../format';
import type { Game } from '../types';
import type { FixtureId } from './types';

/** What a sort reads of each fixture's game at that stage. */
export type GameOf = (id: FixtureId) => Pick<Game, 'dateLocal' | 'dateKey' | 'contestId'>;

export class ViewList {
  private order: FixtureId[];

  constructor(ids: readonly FixtureId[] = []) {
    this.order = [...ids];
  }

  ids(): readonly FixtureId[] {
    return this.order;
  }

  has(id: FixtureId): boolean {
    return this.order.includes(id);
  }

  /** `ids` at the end (rule-2 fills, sheet games), in the order given. */
  append(...ids: FixtureId[]): void {
    this.order.push(...ids);
  }

  /** `id` at `index` (the end when `index` is past it). */
  appendAt(index: number, id: FixtureId): void {
    this.order.splice(Math.min(index, this.order.length), 0, id);
  }

  remove(id: FixtureId): void {
    this.order = this.order.filter((x) => x !== id);
  }

  /** lib/format.ts byDateThenId over each fixture's game: normalize, the step-06 carry, frozen leagues, editor listings. */
  sortByDateThenId(gameOf: GameOf): void {
    this.order = this.order
      .map((id) => ({ id, g: gameOf(id) }))
      .sort((a, b) => byDateThenId(a.g, b.g))
      .map(({ id }) => id);
  }

  /** The bracket sheet's order (lib/postseason/sds-sheet-results.ts): dateKey, then contest id by localeCompare. */
  sortSheet(gameOf: GameOf): void {
    this.order = this.order
      .map((id) => ({ id, g: gameOf(id) }))
      .sort((a, b) => a.g.dateKey.localeCompare(b.g.dateKey) || a.g.contestId.localeCompare(b.g.contestId))
      .map(({ id }) => id);
  }
}
