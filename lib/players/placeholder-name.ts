/**
 * "Player #4": a line that names nobody.
 *
 * When a stat keeper enters a match on MaxPreps for a number that is not on the team's roster,
 * MaxPreps creates an athlete for that number on the spot: no first name, the last name
 * "Player #4", no grade, no position, a career page of its own (/athletes/player-4/). The athlete
 * then sits on the roster page beside the coach's own rows, and MaxPreps prints its name by
 * joining the two parts with the missing first name spelled out, "null Player #4" (Mitty, Milpitas,
 * Gilroy, St. Ignatius, King's Academy, Castilleja and Priory girls volleyball, 2026-10). Earlier
 * seasons' stat sheets carry the same placeholder as "Player 25" or "Player #25".
 *
 * It is a number that played, not a known person. The roster keeps the row under "Player #4", the
 * word "null" dropped (lib/sources/maxpreps-roster.ts), and its stat lines join to it as any row's
 * do; data/rosters-enrichment.json gives it a name where another source ties one to the number. Left
 * unnamed it is never a registry player: the number may be anyone's (Gilroy's "Player #11" and
 * "Player #12" were once joined into one person under "null Player #12").
 */
export const PLACEHOLDER_NAME = /^player\s*#?\s*\d*$/i;

/** "Player #4", "Player 25", "player": MaxPreps' name for an athlete nobody named. */
export function isPlaceholderName(name: string | null | undefined): boolean {
  return name !== null && name !== undefined && PLACEHOLDER_NAME.test(name.trim());
}

/** A roster row MaxPreps' stat entry created for a bare number: no first name, a "Player #N" last name. */
export function isPlaceholderRow(p: { firstName: string | null; lastName: string | null }): boolean {
  return p.firstName === null && isPlaceholderName(p.lastName);
}
