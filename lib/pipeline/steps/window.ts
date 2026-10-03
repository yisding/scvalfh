/**
 * Step 01 (SPEC §7.4): the season-window guard. Outside the union of the sections' season windows
 * (2026-08-01 … 2026-11-30) there is nothing to fetch, so the run logs, exits 0 and writes nothing —
 * rather than rewriting the snapshot's stamp every day — unless `--force`. `today` is the context's
 * localDateKey(fetchedAt), never the wall clock.
 */

import { monthDay } from '../../format';
import { seasonWindowBounds } from '../../leagues';
import type { RunContext } from '../contract';

export function inSeasonWindow(today: string, bounds = seasonWindowBounds()): boolean {
  return today >= bounds.start && today <= bounds.end;
}

/** true = run the pipeline; false = out of season (already logged). */
export function stepWindow(ctx: RunContext): boolean {
  if (ctx.args.force || inSeasonWindow(ctx.today)) return true;
  const { start, end } = seasonWindowBounds();
  ctx.log(
    `out of season: ${ctx.today} is outside ${monthDay(start)} – ${monthDay(end)} Pacific. ` +
      'Nothing fetched, nothing written. Re-run with --force to override.',
  );
  return false;
}
