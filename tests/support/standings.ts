/**
 * Shared tables of the standings suites (tests/lib/engine/standings*.test.ts and standings/*.test.ts): final
 * league games on distinct dates, a computed division table, a row by slug, the places of a slug list and the slugs
 * of one division in table order.
 */

import { computeStandings } from '@/lib/engine/standings';
import type { Game } from '@/lib/model/game';
import type { Standing } from '@/lib/model/standings';
import { game } from '@/tests/support/game-builder';

export type Spec = [home: string, away: string, hs: number, as: number];

let day = 0;

/** Final league games on distinct dates (Sep 1 onward), so order never depends on a date tie. */
export function finals(specs: readonly Spec[]): Game[] {
  return specs.map(([home, away, hs, as]) => {
    day += 1;
    const d = new Date(Date.UTC(2026, 8, 1 + (day % 45)));
    const date = d.toISOString().slice(0, 10);
    return game({ home, away, hs, as, date });
  });
}

export function table(games: readonly Game[], division: string): Standing[] {
  return computeStandings(games)
    .filter((r) => r.division === division)
    .sort((a, b) => a.computed.place - b.computed.place || a.slug.localeCompare(b.slug));
}

export function row(rows: readonly Standing[], slug: string): Standing {
  const found = rows.find((r) => r.slug === slug);
  if (!found) throw new Error(`no row for ${slug}`);
  return found;
}

export const places = (rows: readonly Standing[], slugs: readonly string[]) =>
  slugs.map((s) => row(rows, s).computed.place);

export function order(rows: readonly Standing[], division: string): string[] {
  return rows
    .filter((r) => r.division === division)
    .sort((a, b) => a.computed.place - b.computed.place || a.slug.localeCompare(b.slug))
    .map((r) => r.slug);
}
