/**
 * Builds `tests/fixtures/corpus/variants/finals-regression/previous-snapshot.json` (SPEC §7.3): a
 * previous snapshot of the all-2026-10-02 corpus in which three Santa Teresa league games the
 * corpus does NOT have as finals were final — the two 10/01 contests MaxPreps now lists as
 * score-pending (Del Mar–Prospect 3c691d2c, Live Oak–Ann Sobrato be7bd768) and Westmont–Del Mar
 * (1cc606d9). Run against the corpus, BVAL's Santa Teresa counted finals drop by 3: §7.5 trigger c.
 *
 * Built by running the real pipeline over the corpus plus a temporary overlay that turns those
 * three contests into finals, with the real official (B2) and si.com (B3) steps. Rebuild with
 * `B1_REBUILD_VARIANTS=1 pnpm exec vitest run tests/pipeline/variants.test.ts`.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { OfficialStep, SbliveStep } from '../../../lib/pipeline/contract';
import { SILENT_SINK } from '../../../lib/pipeline/ledger';
import { parseRunArgs, prepareRun, runPipeline } from '../../../lib/pipeline/run';
import { stableStringify } from '../../../lib/snapshot-schema';
import { REPO } from '../../helpers';

export const CORPUS_ALL = path.join(REPO, 'tests', 'fixtures', 'corpus', 'all-2026-10-02');
export const VARIANTS_DIR = path.join(REPO, 'tests', 'fixtures', 'corpus', 'variants');
export const FINALS_REGRESSION_DIR = path.join(VARIANTS_DIR, 'finals-regression');
export const FINALS_REGRESSION_PREVIOUS_AT = '2026-10-02T03:00:00.000Z';

/** contestId → [home score, away score] made final in the previous snapshot. */
export const REGRESSED_FINALS: Readonly<Record<string, readonly [number, number]>> = {
  '3c691d2c-7e22-46bf-9438-25db21df4640': [2, 1],
  'be7bd768-4ae2-42a7-b88c-b8e7930b2290': [3, 0],
  '1cc606d9-16f0-44dc-a574-76f2978f08dc': [1, 1],
};

const FEEDS = ['del-mar', 'prospect', 'live-oak', 'sobrato', 'westmont'];

interface RawTeam { score: number | null; result: string | null; homeAwayType: number }
interface RawRow { contest: { contestId: string; hasResult?: boolean; teams: RawTeam[] }; calculatedFields: { contestState: number } }

/** A temporary overlay turning the REGRESSED_FINALS contests into finals. Returns its directory. */
export function writeRegressionOverlay(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-regression-overlay-'));
  const files: Record<string, string> = {};
  for (const slug of FEEDS) {
    const rel = `maxpreps/schedule/${slug}.json`;
    const raw = JSON.parse(readFileSync(path.join(CORPUS_ALL, rel), 'utf8')) as { data: RawRow[] };
    for (const row of raw.data) {
      const scores = REGRESSED_FINALS[row.contest.contestId];
      if (!scores) continue;
      row.calculatedFields.contestState = 4;
      row.contest.hasResult = true;
      for (const team of row.contest.teams) {
        const mine = team.homeAwayType === 1 ? scores[1] : scores[0];
        const theirs = team.homeAwayType === 1 ? scores[0] : scores[1];
        team.score = mine;
        team.result = mine > theirs ? 'W' : mine < theirs ? 'L' : 'T';
      }
    }
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), JSON.stringify(raw), 'utf8');
    files[`maxpreps/schedule/${slug}`] = rel;
  }
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ id: 'regression-overlay', files }, null, 2), 'utf8');
  return dir;
}

/** Runs the pipeline over corpus + overlay and returns the previous snapshot's stable JSON. */
export async function buildFinalsRegressionPrevious(official: OfficialStep, sblive: SbliveStep): Promise<string> {
  const overlay = writeRegressionOverlay();
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-regression-')), 'snapshot.json');
  const args = parseRunArgs(
    ['--fixtures', CORPUS_ALL, '--variant', overlay, '--fetched-at', FINALS_REGRESSION_PREVIOUS_AT, '--out', out, '--dry-run'],
    { cwd: REPO, now: FINALS_REGRESSION_PREVIOUS_AT },
  );
  const { ctx } = prepareRun(args, SILENT_SINK);
  const result = await runPipeline(ctx, { official, sblive });
  if (!result) throw new Error('finals-regression: the pipeline did not run');
  return stableStringify(result.snapshot);
}

export async function writeFinalsRegressionVariant(official: OfficialStep, sblive: SbliveStep): Promise<void> {
  mkdirSync(FINALS_REGRESSION_DIR, { recursive: true });
  writeFileSync(path.join(FINALS_REGRESSION_DIR, 'previous-snapshot.json'), await buildFinalsRegressionPrevious(official, sblive), 'utf8');
  writeFileSync(
    path.join(FINALS_REGRESSION_DIR, 'manifest.json'),
    `${JSON.stringify(
      {
        id: 'finals-regression',
        note:
          'Starts from a previous snapshot (fetched 2026-10-02T03:00Z) in which three Santa Teresa league games were final ' +
          '(3c691d2c, be7bd768, 1cc606d9) that the corpus does not have as finals: BVAL counted finals drop by 3 (SPEC §7.5 trigger c).',
        previous: 'previous-snapshot.json',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}
