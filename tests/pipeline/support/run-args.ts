/**
 * The RunArgs a unit test hands a step's context: the CLI's own defaults (parseRunArgs with no
 * flags, its clock pinned), with a dry run to /dev/null, then the test's overrides. A new RunArgs
 * field gets its default here from the parser, not from a hand-written literal per test.
 */

import type { RunArgs } from '../../../lib/pipeline/contract';
import { parseRunArgs } from '../../../lib/pipeline/run';
import { REPO } from '../../helpers';

/** The pinned clock: a live run's default `fetchedAt` (2026-10-02, 8 AM Pacific). */
const TEST_RUN_AT = '2026-10-02T15:00:00.000Z';

export function testRunArgs(overrides: Partial<RunArgs> = {}): RunArgs {
  return { ...parseRunArgs([], { cwd: REPO, now: TEST_RUN_AT }), out: '/dev/null', dryRun: true, ...overrides };
}
