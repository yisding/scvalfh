/** The snapshot's size and source-row budgets (SPEC §7.11), shared by the assemble step, scripts/ci/assert-budgets.ts and tests/data/snapshot.test.ts. */

/**
 * SPEC §7.11 budgets, raised deliberately for the Southern California amendment (DESIGN-socal §2.2):
 * 49 teams in five leagues measured 980 KB with 101 source rows against 1.6 MB / 140. The 50 SoCal
 * teams roughly double the games, teams and standings rows (~1,700 B per game, ~1,140 B per team,
 * ~2,430 B per standings row, ~430 B per source row, measured on the 49-team file), so the snapshot
 * lands near 2.2-2.4 MB and the sources near 200 (1 bootstrap + 2 × 14 MaxPreps tables + 102 schedules
 * + the official, si.com, VNN and CCS rows). The caps below leave room for the rest of the season's
 * games; the measured numbers are recorded in DESIGN §24. Labels print from these constants
 * (budgetLabel), never from a literal.
 */
export const SNAPSHOT_MAX_BYTES = 3_200_000;
export const SNAPSHOT_WARN_BYTES = 2_400_000;
export const SOURCES_MAX = 280;

/** '3.2 MB' from 3_200_000: the human label of a byte budget (decimal megabytes, one decimal). */
export function budgetLabel(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
