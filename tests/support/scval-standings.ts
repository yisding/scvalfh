/**
 * The SCVAL corpus (15 schedules, 2026-09-29) classified exactly as the pipeline does, and its computed standings.
 */

import { divisionsOf } from '@/lib/config/leagues';
import { classifyGames } from '@/lib/engine/classify';
import { computeStandings } from '@/lib/engine/standings';
import { normalizeGames } from '@/lib/pipeline/reconcile/normalize';

import { allScheduleRows } from './corpus';

/** The SCVAL corpus (15 schedules, 2026-09-29), classified exactly as the pipeline does. */
export const live = classifyGames(
  normalizeGames(allScheduleRows(), { fetchedAt: '2026-09-29T15:00:00.000Z' }).games,
);

export const liveStandings = computeStandings(live);

export const SCVAL_DIVISIONS = new Set(divisionsOf('scval').map((d) => d.id));

export const scvalStandings = liveStandings.filter((s) => SCVAL_DIVISIONS.has(s.division));
