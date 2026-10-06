/**
 * The home page's serialized team views stay within budget (SPEC §10.1; raised for the Southern
 * California amendment, DESIGN-socal §2.4). All 99 pinned-card views ship in the page (the pin, and so
 * the league, is known only in the browser), so a view that grows a field grows every phone's download.
 *
 * The budget, measured 2026-10-06 (DESIGN-socal §2.4: measured × 1.12): before the amendment the 49
 * views were 50,569 bytes on data/snapshot.json against 60 KB. No snapshot with both regions' live
 * data existed when this was set, so the measurement is the sum of two halves, each from the snapshot
 * that has it: the NorCal 49 on data/snapshot.json (50,569 bytes; its SoCal teams have no games) and
 * the SoCal 50 on the pipeline's SoCal-only live run of 2026-10-06 (54,473 bytes), 105,042 in all.
 * × 1.12 = 117,647, rounded up to whole KiB: 115 KiB = 117,760. The corpus snapshot (NorCal games
 * only) measures 65,819. Re-measure on the first full live snapshot and record it here.
 *
 * The HARD budget is checked on the offline corpus snapshot (deterministic): a page-weight
 * regression in code fails here, in every run. The bundled data/snapshot.json (whatever the last
 * live fetch produced) is checked too, but it only FAILS where `CI_GATE` is set — ci.yml's test
 * step — and otherwise warns past 90 %: this suite also gates update-data.yml's commit, and a
 * view that grows with the season (link chips, form, postseason lines) must never stop the day's
 * scores from being published. Failures route to components/home/home-view.ts, which builds the
 * views.
 */

import { describe, expect, it, vi } from 'vitest';

import { corpusSnapshotPath } from '../helpers';

const BUDGET = 115 * 1024;
const WARN_AT = 0.9;

/** ci.yml sets CI_GATE on its test step; update-data.yml (which also sets CI) does not. */
function liveBudgetGates(env: Record<string, string | undefined>): boolean {
  return !!env.CI_GATE;
}

async function teamViewBytes(snapshotPath: string | undefined): Promise<{ bytes: number; count: number }> {
  vi.resetModules();
  if (snapshotPath) process.env.SCVAL_SNAPSHOT = snapshotPath;
  else delete process.env.SCVAL_SNAPSHOT;
  const { buildTeamViews } = await import('../../components/home/home-view');
  const views = buildTeamViews();
  return { bytes: Buffer.byteLength(JSON.stringify(views), 'utf8'), count: views.length };
}

describe('home team views weight (components/home/home-view.ts)', () => {
  it('stays ≤ 115 KiB on the corpus snapshot', async () => {
    const { bytes, count } = await teamViewBytes(corpusSnapshotPath('all-2026-10-02'));
    expect(count, 'components/home/home-view.ts: one view per team').toBe(99);
    expect(bytes, `components/home/home-view.ts: serialized teamViews are ${bytes} bytes`).toBeLessThanOrEqual(BUDGET);
  }, 600_000);

  it('stays ≤ 115 KiB on the bundled snapshot (fails only under CI_GATE; warns past 90 %)', async () => {
    const { bytes, count } = await teamViewBytes(undefined);
    expect(count, 'components/home/home-view.ts: one view per team').toBe(99);
    const message = `components/home/home-view.ts: serialized teamViews are ${bytes} bytes on the bundled snapshot (budget ${BUDGET})`;
    if (liveBudgetGates(process.env)) {
      expect(bytes, message).toBeLessThanOrEqual(BUDGET);
    } else if (bytes > BUDGET * WARN_AT) {
      console.warn(`warning: ${message}`);
    }
  });

  it('the bundled-snapshot budget gates only where CI_GATE is set (never the data cron)', () => {
    expect(liveBudgetGates({})).toBe(false);
    expect(liveBudgetGates({ CI: 'true' })).toBe(false);
    expect(liveBudgetGates({ CI_GATE: '1' })).toBe(true);
    expect(liveBudgetGates({ CI_GATE: '' })).toBe(false);
  });
});
