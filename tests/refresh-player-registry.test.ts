/**
 * scripts/refresh-player-registry.sh, the refresh workflows' player-registry step: run in a scratch git repository
 * with a stand-in `pnpm` on PATH, so the build and the registry tests can be made to pass or fail at will.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO } from './helpers';

const SCRIPT = path.join(REPO, 'scripts', 'refresh-player-registry.sh');

/** A stand-in pnpm: `build-players` writes a rebuilt registry or fails as the real one does; `exec vitest` passes or fails. */
const FAKE_PNPM = `#!/usr/bin/env bash
echo "pnpm $*" >> "$CALLS"
case "$*" in
  *build-players*)
    if [ "$FAKE_BUILD" = fail ]; then
      echo "build-players: soccer 26-27"
      echo 'FAILED: registry: data/player-identity.json sameAs ties "Jhayde Domingo" (macdonald) to MaxPreps career 36jirp6p2fr44, which no source lists'
      exit 1
    fi
    echo '{"rebuilt":true}' > data/players.json ;;
  *vitest*)
    if [ "$FAKE_TEST" = fail ]; then echo "AssertionError: sameAs: Mic Borgonia's career dkfpoh6hcdatd: expected false to be true"; exit 1; fi ;;
esac
exit 0
`;

const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};

/** A repository with committed soccer rosters and registry; `edit` changes the rosters before the step runs. */
function run(opts: { editRosters: boolean; build?: 'ok' | 'fail'; test?: 'ok' | 'fail' }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'refresh-registry-'));
  const bin = path.join(dir, '.bin');
  mkdirSync(bin);
  mkdirSync(path.join(dir, 'data', 'soccer'), { recursive: true });
  writeFileSync(path.join(bin, 'pnpm'), FAKE_PNPM);
  chmodSync(path.join(bin, 'pnpm'), 0o755);
  writeFileSync(path.join(dir, 'data', 'soccer', 'rosters.json'), '{"v":1}\n');
  writeFileSync(path.join(dir, 'data', 'soccer', 'jv-rosters.json'), '{"v":1}\n');
  writeFileSync(path.join(dir, 'data', 'players.json'), '{"committed":true}\n');
  writeFileSync(path.join(dir, '.gitignore'), '.bin/\ncalls\n');
  git(dir, 'init', '-q');
  git(dir, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '.');
  git(dir, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'base');
  if (opts.editRosters) writeFileSync(path.join(dir, 'data', 'soccer', 'rosters.json'), '{"v":2}\n');
  const calls = path.join(dir, 'calls');
  writeFileSync(calls, '');
  const res = spawnSync('bash', [SCRIPT, 'soccer'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CALLS: calls, FAKE_BUILD: opts.build ?? 'ok', FAKE_TEST: opts.test ?? 'ok' },
  });
  const read = (rel: string) => readFileSync(path.join(dir, rel), 'utf8');
  return { ...res, read, calls: read('calls').trim().split('\n').filter(Boolean), changed: git(dir, 'status', '--porcelain').trimEnd() };
}

describe('scripts/refresh-player-registry.sh', () => {
  it('does nothing when the roster fetch changed no roster', () => {
    const r = run({ editRosters: false });
    expect(r.status, r.stderr).toBe(0);
    expect(r.calls).toEqual([]);
    expect(r.stdout).toContain('the soccer rosters did not change');
  });

  it('rebuilds the registry without stamping the curated files, tests it, and leaves both for the commit', () => {
    const r = run({ editRosters: true });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.calls).toEqual(['pnpm -s build-players --no-stamp', 'pnpm exec vitest run tests/players-registry.test.ts']);
    expect(r.read('data/players.json')).toContain('"rebuilt"');
    expect(r.changed.split('\n').sort()).toEqual([' M data/players.json', ' M data/soccer/rosters.json']);
    expect(r.stdout).not.toContain('::error');
  });

  it('when the build refuses the new rosters: restores rosters and registry, names the entry in one error annotation, exits 1', () => {
    const r = run({ editRosters: true, build: 'fail' });
    expect(r.status).toBe(1);
    expect(r.calls).toEqual(['pnpm -s build-players --no-stamp']);
    expect(r.changed).toBe('');
    expect(r.read('data/players.json')).toBe('{"committed":true}\n');
    const errors = r.stdout.split('\n').filter((l) => l.startsWith('::error'));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^::error title=Player registry \(soccer rosters held back\)::pnpm build-players failed/);
    expect(errors[0]).toContain('"Jhayde Domingo" (macdonald) to MaxPreps career 36jirp6p2fr44');
  });

  it('when the registry tests fail: restores rosters and registry, says so in one error annotation, exits 1', () => {
    const r = run({ editRosters: true, test: 'fail' });
    expect(r.status).toBe(1);
    expect(r.calls).toHaveLength(2);
    expect(r.changed).toBe('');
    const errors = r.stdout.split('\n').filter((l) => l.startsWith('::error'));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('tests/players-registry.test.ts failed');
    expect(errors[0]).toContain("Mic Borgonia's career dkfpoh6hcdatd");
  });
});
