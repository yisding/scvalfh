/**
 * The home page's serialized team views stay within budget (SPEC §10.1; raised for the Southern
 * California amendment, DESIGN-socal §2.4). All 102 pinned-card views ship in the page (the pin, and so
 * the league, is known only in the browser), so a view that grows a field grows every phone's download.
 *
 * The budget, measured 2026-10-06 (DESIGN §24.6: measured × 1.12, rounded up to whole KiB): on the
 * committed live snapshot (data/snapshot.json, fetched 2026-10-06T03:19Z, both regions' games) the 99
 * views serialize to 107,545 bytes — 52,868 for the 49 NorCal teams and 54,577 for the 50 SoCal
 * teams. × 1.12 = 120,450, so the budget is 118 KiB = 120,832 (89 % used). Before the amendment the
 * 49 views were 50,569 bytes against 60 KB; an interim 115 KiB, set from two half-snapshots before
 * the full live fetch existed, would have been 93 % used. The corpus snapshot (all-2026-10-02,
 * NorCal games only) measures 65,819 (54 %).
 *
 * Re-measured when the Southern Section independents joined (DESIGN §24.9, 2026-10-06, the snapshot fetched
 * 2026-10-06T05:58Z): the 102 views serialize to 110,556 bytes (the three independents' 2,916; NorCal's 49
 * 52,910). That is 91.5 % of 118 KiB, past the warning line, so by the same rule the budget is
 * 110,556 × 1.12 = 123,823 → 121 KiB = 123,904 (89 % used). The corpus measures 66,560 (the three add 875
 * bytes there): 89 % of its 73 KiB, which the corpus rule (× 1.12, rounded down to whole KiB: 72 KiB) would
 * not raise, so it stays.
 *
 * Two checks, and what each one catches:
 *  - The DETERMINISTIC check runs in every run on the offline corpus snapshot (all-2026-10-02, NorCal
 *    games only), against its own budget: CORPUS_BUDGET = 73 KiB = 74,752, the corpus's 65,819 × 1.12
 *    rounded down to whole KiB (88 % used). It catches a code change that grows every view by about
 *    12 % or more. Against BUDGET it would have let views grow by 84 % unnoticed (review 2026-10-06).
 *    It cannot catch growth that only SoCal games or later-season data produce: the corpus has neither.
 *  - The LIVE check runs on the bundled data/snapshot.json (whatever the last live fetch produced,
 *    both regions) against BUDGET. It only FAILS where `CI_GATE` is set — ci.yml's test step — and
 *    otherwise warns past 90 %: this suite also gates update-data.yml's commit, and a view that grows
 *    with the season (link chips, form, postseason lines) must never stop the day's scores from being
 *    published. So data-driven growth fails a CI run, never the data cron.
 * Failures route to components/home/home-view.ts, which builds the views.
 */

import { describe, expect, it, vi } from 'vitest';

import { corpusSnapshotPath } from '../helpers';

const BUDGET = 121 * 1024;
/** all-2026-10-02 measured 65,819 B on 2026-10-06; × 1.12 = 73,717, so 73 KiB = 74,752. */
const CORPUS_BUDGET = 73 * 1024;
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
  it('stays ≤ 73 KiB on the corpus snapshot (deterministic)', async () => {
    const { bytes, count } = await teamViewBytes(corpusSnapshotPath('all-2026-10-02'));
    expect(count, 'components/home/home-view.ts: one view per team').toBe(102);
    expect(
      bytes,
      `components/home/home-view.ts: serialized teamViews are ${bytes} bytes on the corpus (budget ${CORPUS_BUDGET})`,
    ).toBeLessThanOrEqual(CORPUS_BUDGET);
  }, 600_000);

  it('stays ≤ 121 KiB on the bundled snapshot (fails only under CI_GATE; warns past 90 %)', async () => {
    const { bytes, count } = await teamViewBytes(undefined);
    expect(count, 'components/home/home-view.ts: one view per team').toBe(102);
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
