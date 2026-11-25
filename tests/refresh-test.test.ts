/**
 * scripts/refresh-test.sh, the Test step of the soccer, basketball and volleyball refreshes: run in a scratch git
 * repository with a stand-in `pnpm` on PATH whose tests fail while a named file holds this run's content, so each
 * case can say which file group the tests refuse.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO } from './helpers';

const SCRIPT = path.join(REPO, 'scripts', 'refresh-test.sh');

/** A stand-in pnpm: `exec vitest` fails while any file named in $BAD (space-separated) still says "new". */
const FAKE_PNPM = `#!/usr/bin/env bash
echo "pnpm $*" >> "$CALLS"
for f in $BAD; do
  if grep -q new "$f"; then echo "FAIL because of $f"; exit 1; fi
done
exit 0
`;

const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};

const FILES = {
  jv: ['data/soccer/jv.json'],
  freshman: ['data/soccer/freshman.json'],
  stats: ['data/soccer/player-stats.json'],
  rosters: ['data/soccer/rosters.json', 'data/soccer/jv-rosters.json', 'data/players.json'],
};
type Group = keyof typeof FILES;

/**
 * A repository with every file committed as "old"; `changed` groups then hold "new", and the tests fail while any
 * file of `bad` still does (`always`: they fail whatever is restored).
 */
function run(changed: Group[], bad: string[] | 'always') {
  const dir = mkdtempSync(path.join(tmpdir(), 'refresh-test-'));
  const bin = path.join(dir, '.bin');
  mkdirSync(bin);
  mkdirSync(path.join(dir, 'data', 'soccer'), { recursive: true });
  writeFileSync(path.join(bin, 'pnpm'), FAKE_PNPM);
  chmodSync(path.join(bin, 'pnpm'), 0o755);
  writeFileSync(path.join(dir, 'always'), 'new\n');
  for (const f of Object.values(FILES).flat()) writeFileSync(path.join(dir, f), '"old"\n');
  writeFileSync(path.join(dir, '.gitignore'), '.bin/\ncalls\nout\nalways\n');
  git(dir, 'init', '-q');
  git(dir, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '.');
  git(dir, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'base');
  for (const g of changed) for (const f of FILES[g]) writeFileSync(path.join(dir, f), '"new"\n');
  const calls = path.join(dir, 'calls');
  const out = path.join(dir, 'out');
  writeFileSync(calls, '');
  writeFileSync(out, '');
  const res = spawnSync('bash', [SCRIPT, 'soccer', 'tests/soccer.test.ts', 'tests/jv-hub.test.ts'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CALLS: calls, GITHUB_OUTPUT: out, BAD: bad === 'always' ? 'always' : bad.join(' ') },
  });
  const read = (rel: string) => readFileSync(path.join(dir, rel), 'utf8');
  const isNew = (g: Group) => FILES[g].every((f) => read(f).includes('new'));
  return { ...res, read, isNew, runs: read('calls').trim().split('\n').filter(Boolean), outputs: read('out').trim().split('\n').filter(Boolean) };
}

describe('scripts/refresh-test.sh', () => {
  it('runs the named tests once, and restores nothing, when they pass', () => {
    const r = run(['jv', 'stats', 'rosters'], []);
    expect(r.status, r.stdout).toBe(0);
    expect(r.runs).toEqual(['pnpm exec vitest run tests/soccer.test.ts tests/jv-hub.test.ts']);
    expect(r.outputs).toEqual([]);
    expect(['jv', 'stats', 'rosters'].every((g) => r.isNew(g as Group))).toBe(true);
  });

  it('puts back only the rosters (with the registry) when they are what the tests refuse, and keeps the stats and JV games', () => {
    const r = run(['jv', 'stats', 'rosters'], ['data/soccer/rosters.json']);
    expect(r.status, r.stdout).toBe(0);
    expect(r.isNew('jv')).toBe(true);
    expect(r.isNew('stats')).toBe(true);
    for (const f of FILES.rosters) expect(r.read(f), f).toContain('old');
    expect(r.outputs).toEqual(['restored=true', 'restored_rosters=true']);
    expect(r.stdout).toContain("::warning::the soccer tests refused this run's rosters");
  });

  it('puts back only the stats file when it is the one refused, and keeps the rosters', () => {
    const r = run(['jv', 'stats', 'rosters'], ['data/soccer/player-stats.json']);
    expect(r.status, r.stdout).toBe(0);
    expect(r.isNew('jv')).toBe(true);
    expect(r.isNew('rosters')).toBe(true);
    expect(r.read('data/soccer/player-stats.json')).toContain('old');
    expect(r.outputs).toEqual(['restored=true', 'restored_stats=true']);
  });

  it('never tries a group this run did not change', () => {
    const r = run(['rosters'], ['data/soccer/rosters.json']);
    expect(r.status, r.stdout).toBe(0);
    expect(r.runs).toHaveLength(2);
    expect(r.outputs).toEqual(['restored=true', 'restored_rosters=true']);
  });

  it('puts every changed group back for a last run when no one group explains the failure', () => {
    const r = run(['jv', 'stats', 'rosters'], ['data/soccer/jv.json', 'data/soccer/rosters.json']);
    expect(r.status, r.stdout).toBe(0);
    expect(r.runs).toHaveLength(5);
    expect(['jv', 'stats', 'rosters'].some((g) => r.isNew(g as Group))).toBe(false);
    expect(r.outputs).toEqual(['restored=true', 'restored_jv=true', 'restored=true', 'restored_stats=true', 'restored=true', 'restored_rosters=true']);
  });

  it('puts back this run’s freshman games alone when they are what the tests refuse', () => {
    const r = run(['jv', 'freshman', 'stats'], ['data/soccer/freshman.json']);
    expect(r.status, r.stdout).toBe(0);
    expect(r.isNew('freshman')).toBe(false);
    expect(r.isNew('jv') && r.isNew('stats')).toBe(true);
    expect(r.outputs).toEqual(['restored=true', 'restored_freshman=true']);
  });

  it('fails when the tests fail on the committed files too (a bad snapshot), and when nothing it could restore changed', () => {
    expect(run(['jv', 'rosters'], 'always').status).toBe(1);
    const none = run([], 'always');
    expect(none.status).toBe(1);
    expect(none.stdout).toContain('::error::the soccer tests failed and none of the soccer stats, JV or freshman games or rosters changed in this run');
  });
});
