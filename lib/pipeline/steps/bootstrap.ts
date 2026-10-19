/**
 * Step 02 (SPEC §7.4): the season bootstrap. The MaxPreps field hockey page's `sportSeasonId` and
 * `allSeasonId` must equal config; a genuine MISMATCH is a run abort (a half-migrated season is
 * never published). Not being able to READ the page is not evidence the season changed: a read
 * error only warns, and a corpus without the page records the row as skipped.
 */

import { ALL_SEASON_ID, BOOTSTRAP_URL, SPORT_SEASON_ID } from '@/lib/config/season';
import { parseBootstrap } from '@/lib/sources/maxpreps/bootstrap';
import { RunAbort, type RunContext } from '@/lib/pipeline/contract';
import { readResource, sourceBase, warnIfError } from '@/lib/pipeline/read';

export async function stepBootstrap(ctx: RunContext): Promise<void> {
  const base = sourceBase(ctx, { id: 'maxpreps-html', kind: 'bootstrap', label: 'season bootstrap', url: BOOTSTRAP_URL });
  const res = await readResource(ctx, { kind: 'maxpreps-bootstrap' });
  if ('failed' in res) {
    if (res.failed.status === 'skipped') {
      ctx.source({ ...base, ...res.failed });
      ctx.log('  bootstrap: skipped (not in corpus)');
      return;
    }
    warnIfError(ctx, res.failed, 'bootstrap unreadable');
    ctx.source({ ...base, ...res.failed });
    return;
  }
  const { body, httpStatus } = res.ok;

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
