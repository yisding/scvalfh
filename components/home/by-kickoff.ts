/** The home page's kickoff order, shared by its day slates, its cross-league latest block and the pinned cards. */

import type { Game } from '../../lib/types';

/** Kickoff order, then away name, so a slate is stable between builds. */
export function byKickoff(a: Game, b: Game): number {
  return a.dateLocal.localeCompare(b.dateLocal) || a.away.name.localeCompare(b.away.name);
}
