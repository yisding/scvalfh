/**
 * Step 02 (SPEC §7.4): the season bootstrap. The MaxPreps field hockey page's `sportSeasonId` and
 * `allSeasonId` must equal config; a genuine MISMATCH is a run abort (a half-migrated season is
 * never published). Not being able to READ the page is not evidence the season changed: a read
 * error only warns, and a corpus without the page records the row as skipped.
 */

import { ALL_SEASON_ID, BOOTSTRAP_URL, SPORT_SEASON_ID } from '../../season';
import { parseBootstrap } from '../../sources/maxpreps';
import { FixtureMissing, RunAbort, TransportError, type RunContext } from '../contract';

export async function stepBootstrap(ctx: RunContext): Promise<void> {
  const base = {
    id: 'maxpreps-html' as const,
    kind: 'bootstrap' as const,
    label: 'season bootstrap',
    url: BOOTSTRAP_URL,
    fetchedAt: ctx.fetchedAt,
  };
  let body: string;
  let httpStatus: number;
  try {
    const res = await ctx.transport.get({ kind: 'maxpreps-bootstrap' });
    body = res.body;
    httpStatus = res.httpStatus;
  } catch (err) {
    if (err instanceof FixtureMissing) {
      ctx.source({ ...base, status: 'skipped', error: 'not in corpus' });
      ctx.log('  bootstrap: skipped (not in corpus)');
      return;
    }
    ctx.warn(`bootstrap unreadable: ${(err as Error).message}`);
    ctx.source({
      ...base,
      status: 'error',
      ...(err instanceof TransportError && err.httpStatus !== null ? { httpStatus: err.httpStatus } : {}),
      error: (err as Error).message,
    });
    return;
  }

  let boot: ReturnType<typeof parseBootstrap>;
  try {
    boot = parseBootstrap(body);
  } catch (err) {
    ctx.warn(`bootstrap unreadable: ${(err as Error).message}`);
    ctx.source({ ...base, status: 'error', httpStatus, error: (err as Error).message });
    return;
  }
  if (boot.sportSeasonId && boot.sportSeasonId !== SPORT_SEASON_ID) {
    throw new RunAbort(`sportSeasonId changed: page says ${boot.sportSeasonId}, we expect ${SPORT_SEASON_ID}`);
  }
  if (boot.allSeasonId && boot.allSeasonId !== ALL_SEASON_ID) {
    throw new RunAbort(`allSeasonId changed: page says ${boot.allSeasonId}, we expect ${ALL_SEASON_ID}`);
  }
  ctx.source({ ...base, status: 'ok', httpStatus });
  ctx.log(`  bootstrap ok · ssid ${boot.sportSeasonId ?? '(absent)'}`);
}
