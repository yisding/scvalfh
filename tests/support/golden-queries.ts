/**
 * The site read API (SPEC §13.3) loaded against the committed v1 golden snapshot migrated to v2 and written to a temp
 * file (useSnapshotModules): SCVAL has its real 2026-10-02 results; BVAL, PCAL and MCAL are registry teams with no
 * results and a degraded health row, and the EAL (which the v1 file predates) is added by loadSnapshot's league
 * upgrade. Every tests/lib/queries/*.test.ts that reads this snapshot imports `goldenQueries`; the suites that need a
 * snapshot with synthetic games build their own through withSnapshotModules.
 */

import { writeFileSync } from 'node:fs';

import { leaguesInRegion } from '@/lib/config/leagues';
import { combinedPhase } from '@/lib/engine/phase';
import type { RegionId } from '@/lib/model/ids';
import { loadSnapshot } from '@/lib/snapshot/load';

import { useSnapshotModules } from './corpus-modules';
import { loadQueries } from './queries';
import { tempFile, goldenPath, readJson } from './repo';

export const goldenQueries = useSnapshotModules(
  () => {
    const raw = readJson(goldenPath('snapshot-2026-10-02.v1.json')) as unknown;
    const file = tempFile('data', 'snapshot.json');
    writeFileSync(file, JSON.stringify(loadSnapshot(raw)));
    return file;
  },
  { data: loadQueries },
);

/** One region's phase on the day of `asOf`: `combinedPhase` over the phases of the region's leagues (NorCal and SoCal run on different calendars). */
export const regionPhase = (q: Pick<typeof goldenQueries.data, 'getSeasonPhase'>, region: RegionId, asOf: string) =>
  combinedPhase(leaguesInRegion(region).map((league) => q.getSeasonPhase(league.id, asOf)));
