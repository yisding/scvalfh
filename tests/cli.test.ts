/**
 * scripts/cli.ts: a CLI runs its `main` whenever it is the process's entry point, however the caller
 * spelled the path. Before runCliIfMain the team-file scripts ended with an unconditional
 * `runCli(main)`, so a symlinked checkout or `tsx scripts/<name>` without the extension still ran;
 * these tests pin that a script reached either way still runs (and fails loudly on a bad flag)
 * rather than exiting 0 having done nothing.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { isEntryPoint } from '../scripts/cli';
import { REPO, TSX } from './helpers';

const SCRIPT = path.join(REPO, 'scripts', 'fetch-rosters.ts');
const SCRIPT_URL = pathToFileURL(SCRIPT).href;

const tmp = mkdtempSync(path.join(tmpdir(), 'scvalfh-cli-'));
const link = path.join(tmp, 'repo');
symlinkSync(REPO, link, 'dir');
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function runTsx(scriptPath: string, ...args: string[]) {
  const res = spawnSync(TSX, [scriptPath, ...args], { cwd: REPO, encoding: 'utf8' });
  if (res.error) throw res.error;
  return res;
}

describe('isEntryPoint', () => {
  it('matches the script by its own path, without the extension and through a symlink', () => {
    expect(isEntryPoint(SCRIPT_URL, SCRIPT)).toBe(true);
    expect(isEntryPoint(SCRIPT_URL, SCRIPT.replace(/\.ts$/, ''))).toBe(true);
    expect(isEntryPoint(SCRIPT_URL, path.join(link, 'scripts', 'fetch-rosters.ts'))).toBe(true);
    expect(isEntryPoint(SCRIPT_URL, path.relative(process.cwd(), SCRIPT))).toBe(true);
  });

  it('does not match another script, a missing path or no argv[1]', () => {
    expect(isEntryPoint(SCRIPT_URL, path.join(REPO, 'scripts', 'fetch-jv.ts'))).toBe(false);
    expect(isEntryPoint(SCRIPT_URL, path.join(REPO, 'scripts', 'no-such-script.ts'))).toBe(false);
    expect(isEntryPoint(SCRIPT_URL, undefined)).toBe(false);
  });
});

describe('a CLI started by another spelling of its path still runs main', () => {
  it('runs by its exact path', () => {
    const r = runTsx(SCRIPT, '--bogus');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/FAILED: unknown flag: --bogus/);
  });

  it('runs without the .ts extension', () => {
    const r = runTsx(SCRIPT.replace(/\.ts$/, ''), '--bogus');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/FAILED: unknown flag: --bogus/);
  });

  it('runs through a symlinked checkout', () => {
    const r = runTsx(path.join(link, 'scripts', 'fetch-rosters.ts'), '--bogus');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/FAILED: unknown flag: --bogus/);
  });
});
