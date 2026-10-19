/**
 * The read API for data/prior-season.json — last season's results (DESIGN §20.1). Bundled, because
 * a Worker has no project filesystem (lib/datasets/rosters.ts explains), and validated once at module scope
 * against lib/schema/prior-season.ts, so a bad file fails at import time rather than half-way
 * through a render. Kept apart from lib/schema/prior-season.ts so scripts/fetch-prior-season.ts,
 * which writes the file, never needs a valid one to run — the same split as lib/schema/rosters.ts /
 * lib/datasets/rosters.ts.
 */

import bundled from '@/data/prior-season.json';
import { failValidation } from '@/lib/schema/primitives';
import { type PriorSeason, PriorSeasonSchema } from '@/lib/schema/prior-season';

function load(): PriorSeason {
  const parsed = PriorSeasonSchema.safeParse(bundled);
  if (!parsed.success) failValidation('prior-season', parsed.error.issues);
  return parsed.data;
}

const priorSeason = load();

/** Last season's results, as data/prior-season.json holds them. */
export function getPriorSeason(): PriorSeason {
  return priorSeason;
}
