/**
 * Count copy with real plurals (SPEC §0.4): `plural(1, 'game')` → '1 game', `plural(3, 'game')` →
 * '3 games'. Client-safe (no imports), so a 'use client' card can use it too.
 */
export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The accessible name of a team's form strip: 'Del Mar last 1 league game' / '… last 5 league games'. */
export function formStripName(teamName: string, count: number): string {
  return `${teamName} last ${plural(count, 'league game')}`;
}
