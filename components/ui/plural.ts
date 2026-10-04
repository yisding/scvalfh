/**
 * Count copy with real plurals (SPEC §0.4): `plural(1, 'game')` → '1 game', `plural(3, 'game')` →
 * '3 games'. `plural` itself lives in lib/format (so lib/ and scripts/ share it) and is re-exported
 * here beside the form strip's name. lib/format is client-safe, so a 'use client' card can use both.
 */
import { plural } from '../../lib/format';

export { plural };

/** The accessible name of a team's form strip: 'Del Mar last 1 league game' / '… last 5 league games'. */
export function formStripName(teamName: string, count: number): string {
  return `${teamName} last ${plural(count, 'league game')}`;
}
