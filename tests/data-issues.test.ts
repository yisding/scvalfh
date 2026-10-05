/**
 * scripts/data-issues.ts: the cron's bookkeeping issues. One per official schedule revised upstream
 * (a stale official-revision-check row, titled by the league and, in a split league only, the
 * division) and one per league frozen in this run AND the previous one, never for a league frozen
 * only now.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { buildDataIssues, readPreviousMeta, type PreviousMeta } from '../scripts/data-issues';
import { loadSnapshot } from '../lib/snapshot-schema';
import type { Snapshot } from '../lib/types';
import { VARIANTS_DIR } from './helpers';

const base = loadSnapshot(
  JSON.parse(readFileSync(path.join(VARIANTS_DIR, 'finals-regression', 'previous-snapshot.json'), 'utf8')),
);
const META = { fetchedAt: '2026-10-03T14:00:00.000Z' };

/** The fixture with the revision checks of these divisions stale, and these leagues frozen. */
function snapshotWith(opts: { stale?: string[]; frozen?: string[] }): Snapshot {
  return {
    ...base,
    sources: base.sources.map((row) =>
      row.kind === 'official-revision-check' && opts.stale?.includes(row.scope?.division ?? '')
        ? { ...row, status: 'stale' as const, error: `${row.scope?.division} changed upstream.` }
        : row,
    ),
    leagueHealth: base.leagueHealth.map((h) =>
      opts.frozen?.includes(h.leagueId) ? { ...h, state: 'frozen' as const, reasons: ['MaxPreps did not answer.'] } : h,
    ),
  };
}

const previous = (frozen: string[]): PreviousMeta => ({
  leagues: base.leagueHealth.map((h) => ({ id: h.leagueId, state: frozen.includes(h.leagueId) ? 'frozen' : 'fresh' })),
});

describe('buildDataIssues', () => {
  it('opens nothing for the fixture as it is', () => {
    expect(buildDataIssues(base, META, null)).toEqual([]);
  });

  it('names the division of a split league, and only the league of a one-division league', () => {
    const issues = buildDataIssues(snapshotWith({ stale: ['mt-hamilton', 'pcal'] }), META, null);
    expect(issues.map((i) => i.title)).toEqual([
      'Official schedule revised: BVAL Mt. Hamilton',
      'Official schedule revised: PCAL',
    ]);
    expect(issues[0].body).toBe(
      'mt-hamilton changed upstream.\n\n'
        + 'Checked: https://drive.google.com/uc?export=download&id=150BDI14JosnaB71NoTwYyLp1AFfXSVXb\n'
        + 'Run: 2026-10-03T14:00:00.000Z',
    );
  });

  it('opens an issue for a league frozen in both runs, with its Pacific last-fresh stamp', () => {
    const issues = buildDataIssues(snapshotWith({ frozen: ['mcal'] }), META, previous(['mcal']));
    // The title keeps the format the workflow has always opened these issues with, because the gh
    // loop finds the open issue by its exact title. An ICU that writes a narrow no-break space
    // before "PM" writes it in the earlier titles too.
    expect(issues.map((i) => ({ ...i, title: i.title.replace(/\u202f/g, ' ') }))).toEqual([
      {
        title: 'MCAL frozen since Oct 1, 8:00 PM',
        body: 'MaxPreps did not answer.\n\nRun: 2026-10-03T14:00:00.000Z',
      },
    ]);
  });

  it('opens none for a league frozen only in this run, or with no previous meta', () => {
    const snapshot = snapshotWith({ frozen: ['mcal'] });
    expect(buildDataIssues(snapshot, META, previous([]))).toEqual([]);
    expect(buildDataIssues(snapshot, META, previous(['pcal']))).toEqual([]);
    expect(buildDataIssues(snapshot, META, null)).toEqual([]);
  });

  it('says "the start of the season" for a frozen league that was never fresh', () => {
    const snapshot = snapshotWith({ frozen: ['eal'] });
    expect(buildDataIssues(snapshot, META, previous(['eal'])).map((i) => i.title)).toEqual([
      'EAL frozen since the start of the season',
    ]);
  });
});

describe('readPreviousMeta', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'data-issues-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const file = (name: string, text: string) => {
    const p = path.join(dir, name);
    writeFileSync(p, text);
    return p;
  };

  it('reads the league states, and treats a missing, empty or broken file as none', () => {
    expect(readPreviousMeta(file('meta.json', JSON.stringify({ leagues: [{ id: 'mcal', state: 'frozen' }] })))).toEqual({
      leagues: [{ id: 'mcal', state: 'frozen' }],
    });
    expect(readPreviousMeta(file('empty.json', '{}'))).toBeNull();
    expect(readPreviousMeta(file('broken.json', '{'))).toBeNull();
    expect(readPreviousMeta(path.join(dir, 'missing.json'))).toBeNull();
  });
});
