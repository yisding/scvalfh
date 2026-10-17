/**
 * How every /leaders board ranks and who qualifies (DESIGN §16.2, §23). Standard competition ranking
 * (1, 2, 2, 4): equal values share a place and tied rows are listed by name. A board shows the places
 * up to 10th, and every player or school tied for the last of them, however many; a player board goes
 * on to 25th the same way, behind a "Show N more" disclosure.
 */

/** The places a board shows. */
export const BOARD_PLACES = 10;
/** The places a player board shows once expanded. */
export const EXPANDED_PLACES = 25;

export interface Ranked<T> {
  item: T;
  rank: number;
  tied: boolean;
}

/**
 * Standard competition ranking over `sorted` (best first): neighbours that are `same` share a
 * place. Keeps the places up to `places`, with every row tied for the last of them, so the rows for
 * fewer places are always the first rows for more.
 */
export function rankBoard<T>(
  sorted: readonly T[],
  same: (a: T, b: T) => boolean,
  places = BOARD_PLACES,
): Ranked<T>[] {
  const groups: T[][] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && same(last[0], item)) last.push(item);
    else groups.push([item]);
  }
  const rows: Ranked<T>[] = [];
  let place = 1;
  for (const group of groups) {
    if (place > places) break;
    for (const item of group) rows.push({ item, rank: place, tied: group.length > 1 });
    place += group.length;
  }
  return rows;
}

export const byName = (a: string, b: string) => a.localeCompare(b);

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Half the median of the teams that have played, rounded up, and never below 1: a record or a rate
 * needs it, so a 1-0 team does not top a table of 10-game seasons.
 */
export function qualifyingMinimum(gamesPlayed: readonly number[]): { min: number; median: number } {
  const m = median(gamesPlayed.filter((gp) => gp > 0));
  return { min: Math.max(1, Math.ceil(m / 2)), median: m };
}
