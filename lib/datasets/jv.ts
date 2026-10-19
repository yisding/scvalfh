/**
 * The dataset loader for data/jv.json — every registry school's JV games (MaxPreps, supplemented by
 * si.com: lib/engine/jv/merge.ts), as the file holds them; the merge, classification and tables
 * over it are lib/queries/jv.ts.
 *
 * Built by `scripts/fetch-jv.ts`. Imported so the build bundles it, for the reason lib/datasets/rosters.ts
 * gives: a Worker has no project filesystem. Validated once at module scope, so a bad
 * file fails at import time rather than half-way through a render. `SCVAL_JV` swaps in another
 * file through node:fs (Node only; never set it on a Worker).
 */

import bundled from '@/data/jv.json';
import type { TeamSlug } from '@/lib/model/ids';
import { type JvFile, JvFileSchema, type JvTeam } from '@/lib/schema/jv';

import { readDataset } from './read';

const file = readDataset({
  env: 'SCVAL_JV',
  bundled,
  owner: 'lib/datasets/jv.ts',
  malformedOverride: 'cannot-read',
  label: 'jv',
  schema: JvFileSchema,
});
const TEAM_BY_SLUG = new Map<string, JvTeam>(file.teams.map((t) => [t.slug, t]));

export function getJvFile(): JvFile {
  return file;
}

/** One school's JV entry (its two sources' status and pages); undefined only for a non-registry slug. */
export function getJvTeam(slug: TeamSlug): JvTeam | undefined {
  return TEAM_BY_SLUG.get(slug);
}

/** When the JV file was read (ISO UTC). */
export function getJvFetchedAt(): string {
  return file.fetchedAt;
}
