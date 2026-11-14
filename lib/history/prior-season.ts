/**
 * The read API for data/prior-season.json — last season's results (DESIGN §20.1). Bundled, because
 * a Worker has no project filesystem (lib/players/rosters.ts explains), and validated once at module scope
 * against lib/history/prior-season-schema.ts, so a bad file fails at import time rather than half-way
 * through a render. Kept apart from lib/history/prior-season-schema.ts so scripts/fetch-prior-season.ts,
 * which writes the file, never needs a valid one to run — the same split as lib/players/rosters-schema.ts /
 * lib/players/rosters.ts.
 */

import bundledFieldHockey from '../../data/prior-season.json';
import bundledBasketball from '../../data/basketball/prior-season.json';
import bundledVolleyball from '../../data/volleyball/prior-season.json';
import bundledSoccer from '../../data/soccer/prior-season.json';
import { validateData } from '../data-file';
import { PriorSeasonSchema, type PriorSeason } from './prior-season-schema';

/** This build's copy (data/ for field hockey, data/soccer/ for soccer, data/basketball/ for basketball: lib/sports/current.ts DATA_DIR). */
const bundled = process.env.SCVAL_SPORT === 'basketball' ? bundledBasketball : process.env.SCVAL_SPORT === 'volleyball' ? bundledVolleyball : process.env.SCVAL_SPORT === 'soccer' ? bundledSoccer : bundledFieldHockey;

function load(): PriorSeason {
  return validateData('prior-season', PriorSeasonSchema, bundled);
}

const priorSeason = load();

/** Last season's results, as data/prior-season.json holds them. */
export function getPriorSeason(): PriorSeason {
  return priorSeason;
}
