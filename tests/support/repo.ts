/**
 * Where things are, and the files and temp directories tests read and write.
 *
 * Every test that needs the repo root, a fixture, a committed data file or a scratch directory goes
 * through here, so no test file spells `import.meta.dirname, '..', '..'` (which breaks the day the
 * file moves one directory deeper) or its own `mkdtempSync(path.join(tmpdir(), …))`.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll } from 'vitest';

import type { Snapshot } from '@/lib/model/snapshot';
import { loadSnapshot } from '@/lib/snapshot-schema';

/** The repository root: tests/support/ is two levels below it. */
export const REPO = path.resolve(import.meta.dirname, '..', '..');

/** The repo's tsx binary, which runs every scripts/*.ts CLI. */
export const TSX = path.join(REPO, 'node_modules', '.bin', 'tsx');

/** tests/fixtures: the frozen captures (read-only for tests). */
export const FIXTURES_ROOT = path.join(REPO, 'tests', 'fixtures');

/** The absolute path of a file or directory under tests/fixtures. */
export function fixturePath(...parts: string[]): string {
  return path.join(FIXTURES_ROOT, ...parts);
}

/** tests/golden: the committed byte-for-byte expectations. */
export const GOLDEN_ROOT = path.join(REPO, 'tests', 'golden');

/** The absolute path of a file under tests/golden. */
export function goldenPath(...parts: string[]): string {
  return path.join(GOLDEN_ROOT, ...parts);
}

/** The text of a file under tests/fixtures. */
export function readFixture(...parts: string[]): string {
  return readFileSync(fixturePath(...parts), 'utf8');
}

/** A JSON file by absolute path, parsed and left `unknown`-shaped for the caller to narrow or `as`. */
export function readJson<T = unknown>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

/** A snapshot file by absolute path, through the same schema gate the site loads it with. */
export function readSnapshot(file: string): Snapshot {
  return loadSnapshot(readJson(file));
}

/** The text of a repo file by repo-relative path (`components/layout/NavLink.tsx`). */
export function readRepoFile(rel: string): string {
  return readFileSync(path.join(REPO, rel), 'utf8');
}

// ---------------------------------------------------------------- scratch space

const scratch = new Set<string>();

// One cleanup per test file that imports this module: the hook registers while the file is being
// collected, so the directories below are removed once the file's tests are done.
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  scratch.clear();
});

/** A fresh `scvalfh-<prefix>-XXXXXX` directory under the OS temp dir, removed when the file's tests finish. */
export function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `scvalfh-${prefix}-`));
  scratch.add(dir);
  return dir;
}

/** The path `name` inside a fresh {@link tempDir} (the file itself is not created). */
export function tempFile(prefix: string, name: string): string {
  return path.join(tempDir(prefix), name);
}
