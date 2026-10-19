/**
 * The biggest |goal difference| among `gds`, 0 when there is none. Not `getGoalDiffDomain`
 * (lib/queries/standings.ts), which floors at 1 so a bar never divides by zero: that floor is a scale, never a
 * fact to print. Every place that prints "biggest goal difference (N)" asks this first and leaves the
 * clause out when it is 0 (DivisionStandings, MiniStandings, the standings page's disclosure in
 * views/standings/standings-view.ts).
 */
export function biggestGoalDiff(gds: readonly number[]): number {
  return Math.max(0, ...gds.map((gd) => Math.abs(gd)));
}
