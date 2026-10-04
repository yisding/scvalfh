/**
 * data/prior-season.json, loaded (DESIGN §20.1). Bundled, because a Worker has no project
 * filesystem (lib/rosters.ts explains), and validated once at module scope against
 * lib/prior-season.ts' schema, so a bad file fails at import time rather than half-way through a
 * render. Kept apart from lib/prior-season.ts so scripts/fetch-prior-season.ts, which writes the
 * file, never needs a valid one to run.
 */

import bundled from '../data/prior-season.json';
import { PriorSeasonSchema, type PriorSeason } from './prior-season';
import { failValidation } from './schema-primitives';

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
