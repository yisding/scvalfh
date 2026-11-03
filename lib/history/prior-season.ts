/**
 * The read API for data/prior-season.json — last season's results (DESIGN §20.1). Bundled, because
 * a Worker has no project filesystem (lib/players/rosters.ts explains), and validated once at module scope
 * against lib/history/prior-season-schema.ts, so a bad file fails at import time rather than half-way
 * through a render. Kept apart from lib/history/prior-season-schema.ts so scripts/fetch-prior-season.ts,
 * which writes the file, never needs a valid one to run — the same split as lib/players/rosters-schema.ts /
 * lib/players/rosters.ts.
 */

import bundled from '../../data/prior-season.json';
import { PriorSeasonSchema, type PriorSeason } from './prior-season-schema';
import { failValidation } from '../schema-primitives';

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
