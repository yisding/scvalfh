/**
 * The guard every MaxPreps-only fetcher runs first: in a build whose season MaxPreps does not carry (the VAL's middle
 * school soccer, read from the league's own site: lib/sports/shape.ts PrimarySourceId), its MaxPreps ids are empty
 * (lib/season.ts), so the script says why and stops before it requests anything or writes a file.
 */

import { HAS_MAXPREPS, SPORT_ID } from '../../lib/sports/current';

/** null when the script may run; else the exit code to return, after one line saying why. */
export function requireMaxpreps(script: string): number | null {
  if (HAS_MAXPREPS) return null;
  console.log(`${script}: SCVAL_SPORT=${SPORT_ID} is not read from MaxPreps (its schools are not on MaxPreps), so there is nothing to fetch. Nothing written.`);
  return 0;
}
