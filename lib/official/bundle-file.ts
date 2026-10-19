/**
 * The bundled official-fixture files on disk (SPEC §7.8): which file a league's bundled divisions
 * share, and the loader the cron and the tests read them through. Parsing and the config checks are
 * lib/official/bundle.ts; this module only finds and reads the file. lib/pipeline/steps/official.ts
 * imports loadBundledFixtures from HERE, which is the seam tests/lib/official/match.test.ts mocks to
 * break a bundle at load.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { bundledDivisions } from '@/lib/config/leagues/official';
import type { OfficialFixture } from '@/lib/model/fixture';
import type { LeagueId } from '@/lib/model/ids';

import { type OfficialBundle, bundleToFixtures, parseOfficialBundle } from './bundle';

/** The one bundle file a league's bundled divisions share (repo-relative), or null when it has none. */
export function bundleFileOf(leagueId: LeagueId): string | null {
  const files = [...new Set(bundledDivisions(leagueId).map((d) => d.official.bundledFile))];
  if (files.length === 0) return null;
  if (files.length > 1 || files[0] === null) {
    throw new Error(`lib/official/bundle-file.ts: ${leagueId} bundled divisions do not share one bundledFile`);
  }
  return files[0];
}

/** Repo root, from this module's location (lib/official/). */
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Read and validate a league's bundle file (schema + config checks). Throws on any problem. */
export function readOfficialBundle(leagueId: LeagueId, root: string = REPO_ROOT): OfficialBundle {
  const file = bundleFileOf(leagueId);
  if (file === null) throw new Error(`official bundle for ${leagueId}: the league has no bundled division`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path.join(root, file), 'utf8')) as unknown;
  } catch (err) {
    throw new Error(`official bundle for ${leagueId}: cannot read ${file}: ${(err as Error).message}`);
  }
  return parseOfficialBundle(raw, leagueId);
}

/**
 * The league's bundled official fixtures, validated at load (schema and config checks; the
 * double-round-robin checks are `assertDoubleRoundRobin`). Throws when the file is missing or
 * invalid — the cron turns that into degraded divisions, never an abort.
 */
export function loadBundledFixtures(leagueId: LeagueId, root?: string): OfficialFixture[] {
  return bundleToFixtures(readOfficialBundle(leagueId, root));
}
