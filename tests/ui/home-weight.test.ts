/**
 * The home page's serialized team views stay within budget (SPEC §10.1: serialized `teamViews`
 * ≤ 60 KB). All 43 pinned-card views ship in the page (the pin, and so the league, is known only in
 * the browser), so a view that grows a field grows every phone's download.
 *
 * Checked on the offline corpus snapshot (deterministic) and on the bundled data/snapshot.json
 * (whatever the last live fetch produced — a budget is an invariant). Failures route to
 * components/home/home-data.ts, which builds the views.
 */

import { describe, expect, it, vi } from 'vitest';

import { corpusSnapshotPath } from '../helpers';

const BUDGET = 60 * 1024;

async function teamViewBytes(snapshotPath: string | undefined): Promise<{ bytes: number; count: number }> {
  vi.resetModules();
  if (snapshotPath) process.env.SCVAL_SNAPSHOT = snapshotPath;
  else delete process.env.SCVAL_SNAPSHOT;
  const { buildTeamViews } = await import('../../components/home/home-data');
  const views = buildTeamViews();
  return { bytes: Buffer.byteLength(JSON.stringify(views), 'utf8'), count: views.length };
}

describe('home team views weight (components/home/home-data.ts)', () => {
  it('stays ≤ 60 KB on the corpus snapshot', async () => {
    const { bytes, count } = await teamViewBytes(corpusSnapshotPath('all-2026-10-02'));
    expect(count, 'components/home/home-data.ts: one view per team').toBe(43);
    expect(bytes, `components/home/home-data.ts: serialized teamViews are ${bytes} bytes`).toBeLessThanOrEqual(BUDGET);
  }, 600_000);

  it('stays ≤ 60 KB on the bundled snapshot', async () => {
    const { bytes, count } = await teamViewBytes(undefined);
    expect(count, 'components/home/home-data.ts: one view per team').toBe(43);
    expect(bytes, `components/home/home-data.ts: serialized teamViews are ${bytes} bytes`).toBeLessThanOrEqual(BUDGET);
  });
});
