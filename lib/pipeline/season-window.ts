/**
 * The season-window guard shared by the pipeline (lib/pipeline/steps/window.ts) and the scoped fetch
 * scripts (scripts/fetch-player-stats.ts, scripts/fetch-jv.ts): outside the union of the sections'
 * season windows (lib/config/leagues.ts seasonWindowBounds) there is nothing to fetch, so a run logs
 * `outOfSeasonLine` and writes nothing — unless `--force`. `today` is always the run's
 * localDateKey(fetchedAt), never the wall clock.
 */

import { seasonWindowBounds } from '@/lib/config/leagues';
import { monthDay } from '@/lib/format/dates';

export function inSeasonWindow(today: string, bounds = seasonWindowBounds()): boolean {
  return today >= bounds.start && today <= bounds.end;
}

/** The one line a run prints when `today` is outside the season window (SPEC §7.4). */
export function outOfSeasonLine(today: string): string {
  const { start, end } = seasonWindowBounds();
  return (
    `out of season: ${today} is outside ${monthDay(start)} – ${monthDay(end)} Pacific. ` +
    'Nothing fetched, nothing written. Re-run with --force to override.'
  );
}
