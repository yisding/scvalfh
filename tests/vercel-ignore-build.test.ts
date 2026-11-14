/**
 * scripts/vercel-ignore-build.sh, run in a scratch git repo: each Vercel project skips a build whose only
 * changes are the other sport's data files, and builds on anything else or anything it cannot decide.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { REPO } from './helpers';

const SCRIPT = path.join(REPO, 'scripts', 'vercel-ignore-build.sh');
let dir: string;

const git = (...args: string[]) => {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

/** A commit changing `files` on top of the current one; returns its sha. */
const commit = (files: string[]): string => {
  for (const f of files) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFileSync(path.join(dir, f), `${f} ${Math.random()}\n`);
  }
  git('add', '-A');
  git('commit', '-q', '-m', files.join(' '));
  return git('rev-parse', 'HEAD');
};

/** The script's exit code for `sport` deploying `head` over a last deployment at `base` (null: none). */
const decide = (sport: string, base: string | null, head: string): number => {
  const env: NodeJS.ProcessEnv = { ...process.env, VERCEL_GIT_COMMIT_SHA: head };
  if (base === null) delete env.VERCEL_GIT_PREVIOUS_SHA;
  else env.VERCEL_GIT_PREVIOUS_SHA = base;
  const r = spawnSync('bash', [SCRIPT, sport], { cwd: dir, encoding: 'utf8', env });
  return r.status ?? -1;
};

const SKIP = 0;
const BUILD = 1;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'vercel-ignore-'));
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  commit(['README.md']);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('scripts/vercel-ignore-build.sh', () => {
  it('lets each project skip the other sport’s data refresh, and only that', () => {
    const base = git('rev-parse', 'HEAD');
    const soccerData = commit(['data/soccer/snapshot.json', 'data/soccer/snapshot.meta.json']);
    expect(decide('field-hockey', base, soccerData)).toBe(SKIP);
    expect(decide('soccer', base, soccerData)).toBe(BUILD);

    const hockeyData = commit(['data/snapshot.json', 'data/player-stats.json']);
    expect(decide('soccer', soccerData, hockeyData)).toBe(SKIP);
    expect(decide('field-hockey', soccerData, hockeyData)).toBe(BUILD);
    expect(decide('basketball', soccerData, hockeyData)).toBe(SKIP);

    const basketballData = commit(['data/basketball/snapshot.json', 'data/basketball/jv.json']);
    expect(decide('basketball', hockeyData, basketballData)).toBe(BUILD);
    expect(decide('field-hockey', hockeyData, basketballData)).toBe(SKIP);
    expect(decide('soccer', hockeyData, basketballData)).toBe(SKIP);
    // Two sports' refreshes since the last deployment: each project builds for its own.
    expect(decide('soccer', base, basketballData)).toBe(BUILD);
    expect(decide('basketball', base, basketballData)).toBe(BUILD);

    const volleyballData = commit(['data/volleyball/snapshot.json', 'data/volleyball/rosters.json']);
    expect(decide('volleyball', basketballData, volleyballData)).toBe(BUILD);
    for (const other of ['field-hockey', 'soccer', 'basketball']) expect(decide(other, basketballData, volleyballData), other).toBe(SKIP);
    expect(decide('volleyball', soccerData, basketballData)).toBe(SKIP);
  });

  it('builds both on a code change, even beside data', () => {
    const base = git('rev-parse', 'HEAD');
    const code = commit(['lib/leagues.ts', 'data/soccer/jv.json']);
    expect(decide('field-hockey', base, code)).toBe(BUILD);
    expect(decide('soccer', base, code)).toBe(BUILD);
    expect(decide('basketball', base, code)).toBe(BUILD);
    expect(decide('volleyball', base, code)).toBe(BUILD);
  });

  it('builds when it cannot decide: no previous deployment, an unknown commit, an unknown sport', () => {
    const head = git('rev-parse', 'HEAD');
    expect(decide('soccer', null, head)).toBe(BUILD);
    expect(decide('soccer', '0123456789abcdef0123456789abcdef01234567', head)).toBe(BUILD);
    expect(decide('lacrosse', head, head)).toBe(BUILD);
  });
});
