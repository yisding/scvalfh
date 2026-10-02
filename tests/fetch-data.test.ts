/** End-to-end: the real cron script against the offline fixtures. */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { parseSnapshot } from '../lib/snapshot-schema';
import type { Snapshot } from '../lib/types';
import { FIXTURE_DIR, REPO, buildFixtureSnapshot } from './helpers';

let out: string;
let snapshot: Snapshot;

beforeAll(() => {
  out = buildFixtureSnapshot();
  snapshot = parseSnapshot(JSON.parse(readFileSync(out, 'utf8')) as unknown);
});

describe('fetch-data --fixtures', () => {
  it('writes a snapshot that passes the schema', () => {
    expect(snapshot.fetchedAt).toBe('2026-09-29T15:00:00.000Z');
    expect(snapshot.teams.length).toBe(15);
    expect(snapshot.standings.length).toBe(15);
    expect(snapshot.games.length).toBe(158);
    expect(snapshot.counts.finals).toBe(80);
    expect(snapshot.counts.pending).toBe(3);
  });

  it('writes the meta file beside it', () => {
    const meta = path.join(path.dirname(out), 'snapshot.meta.json');
    expect(existsSync(meta)).toBe(true);
    const parsed = JSON.parse(readFileSync(meta, 'utf8')) as {
      fetchedAt: string;
      counts: { games: number };
    };
    expect(parsed.fetchedAt).toBe(snapshot.fetchedAt);
    expect(parsed.counts.games).toBe(snapshot.games.length);
  });

  it('records one source row per request, including the skipped ones', () => {
    const labels = snapshot.sources.map((s) => s.label);
    expect(labels).toContain('de-anza reported standings');
    expect(labels).toContain('el-camino reported standings');
    expect(labels.filter((l) => l.endsWith(' schedule')).length).toBe(15);
    expect(labels).not.toContain('wilcox schedule');
  });

  it('writes stable, key-sorted JSON so a re-run produces an identical file', () => {
    const again = buildFixtureSnapshot();
    expect(readFileSync(again, 'utf8')).toBe(readFileSync(out, 'utf8'));
    const text = readFileSync(out, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    const keys = Object.keys(JSON.parse(text) as Record<string, unknown>);
    expect(keys).toEqual([...keys].sort());
  });

  it('honours --dry-run by writing nothing', () => {
    const target = path.join(path.dirname(out), 'dry-run.json');
    execFileSync(
      path.join(REPO, 'node_modules', '.bin', 'tsx'),
      [
        path.join(REPO, 'scripts', 'fetch-data.ts'),
        '--fixtures',
        FIXTURE_DIR,
        '--out',
        target,
        '--dry-run',
      ],
      { cwd: REPO, stdio: 'pipe' },
    );
    expect(existsSync(target)).toBe(false);
  });

  it('fails loudly on an unknown flag', () => {
    expect(() =>
      execFileSync(
        path.join(REPO, 'node_modules', '.bin', 'tsx'),
        [path.join(REPO, 'scripts', 'fetch-data.ts'), '--nope'],
        { cwd: REPO, stdio: 'pipe' },
      ),
    ).toThrow();
  });

  it('computes the season window and the by-law dates', () => {
    expect(snapshot.season.year).toBe('26-27');
    expect(snapshot.season.window.firstGame).toMatch(/^2026-08-24/);
    expect(snapshot.playoffs.keyDates.crossover).toBe('2026-10-30');
    expect(snapshot.playoffs.keyDates.quarterfinals).toBe('2026-11-07');
    expect(snapshot.playoffs.format.autoQualifiers.scval).toBe(7);
    expect(snapshot.playoffs.bracketPublished).toBe(false);
  });

  it('never emits a 0-0 for a game that is not final', () => {
    for (const g of snapshot.games) {
      if (g.status === 'final') continue;
      expect(`${g.home.score}-${g.away.score}`).toBe('null-null');
    }
  });

  it('records every SECONDARY source as skipped on an offline run', () => {
    const skipped = snapshot.sources.filter((s) => s.status === 'skipped');
    const labels = skipped.map((s) => s.label);
    expect(labels).toContain('de-anza official schedule PDF');
    expect(labels).toContain('el-camino official schedule PDF');
    expect(labels).toContain('sblive score cross-check');
    expect(labels).toContain('palo-alto school calendar');
    expect(labels).toContain('los-gatos school calendar');
    expect(labels).toContain('ccs calendar');
    expect(labels).toContain('ccs bracket');
    // Nothing secondary contributed data, so the optional fields stay absent.
    expect(snapshot.sbliveCrossCheck).toBeUndefined();
    expect(snapshot.officialFixtures).toBeUndefined();
    expect(snapshot.games.every((g) => g.official === undefined)).toBe(true);
  });
});

/** Runs the script and returns its combined output (WARN lines go to stderr). */
function run(args: readonly string[]): string {
  const res = spawnSync(
    path.join(REPO, 'node_modules', '.bin', 'tsx'),
    [path.join(REPO, 'scripts', 'fetch-data.ts'), ...args],
    { cwd: REPO, encoding: 'utf8' },
  );
  if (res.status !== 0) {
    throw new Error(`fetch-data exited ${res.status}\n${res.stdout}${res.stderr}`);
  }
  return `${res.stdout}${res.stderr}`;
}

/** Runs the script expecting it to FAIL, and returns its combined output. */
function runExpectingFailure(args: readonly string[]): string {
  const res = spawnSync(
    path.join(REPO, 'node_modules', '.bin', 'tsx'),
    [path.join(REPO, 'scripts', 'fetch-data.ts'), ...args],
    { cwd: REPO, encoding: 'utf8' },
  );
  expect(res.status, `expected a non-zero exit\n${res.stdout}${res.stderr}`).not.toBe(0);
  return `${res.stdout}${res.stderr}`;
}

describe('fetch-data: the season-window guard', () => {
  const december = ['--fetched-at', '2026-12-15T20:00:00.000Z'];

  it('exits 0 with "out of season" and touches nothing outside Aug 1 - Nov 30', () => {
    const out = run([...december, '--fixtures', FIXTURE_DIR, '--out', '/tmp/should-not-exist.json']);
    expect(out).toMatch(/out of season/);
    expect(out).not.toMatch(/summary:/);
    expect(existsSync('/tmp/should-not-exist.json')).toBe(false);
  });

  it('runs anyway with --force', () => {
    const out = run([...december, '--force', '--fixtures', FIXTURE_DIR, '--dry-run']);
    expect(out).not.toMatch(/out of season/);
    expect(out).toMatch(/summary: teams 15/);
  });

  it('is in season through the whole league and playoff calendar', () => {
    for (const month of ['08', '09', '10', '11']) {
      const out = run([
        '--fetched-at',
        `2026-${month}-15T20:00:00.000Z`,
        '--fixtures',
        FIXTURE_DIR,
        '--dry-run',
      ]);
      expect(out, `month ${month}`).not.toMatch(/out of season/);
    }
  });

  it('is out of season in July and December', () => {
    for (const month of ['07', '12']) {
      const out = run([
        '--fetched-at',
        `2026-${month}-15T20:00:00.000Z`,
        '--fixtures',
        FIXTURE_DIR,
        '--dry-run',
      ]);
      expect(out, `month ${month}`).toMatch(/out of season/);
    }
  });
});

/** Copies the fixture directory's regular files (not subdirectories such as ghosts/, §12.1). */
function copyFixtureFiles(dir: string): void {
  for (const entry of readdirSync(FIXTURE_DIR, { withFileTypes: true })) {
    if (entry.isFile()) {
      copyFileSync(path.join(FIXTURE_DIR, entry.name), path.join(dir, entry.name));
    }
  }
}

describe('fetch-data: SPEC §5.2.1 abort conditions', () => {
  /** A league that answers with zero standings rows keeps the previous snapshot. */
  it('aborts the run rather than publishing when a league returns 0 rows', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-empty-standings-'));
    copyFixtureFiles(dir);
    writeFileSync(
      path.join(dir, 'da.json'),
      JSON.stringify({ status: 200, message: 'Success', data: [] }),
      'utf8',
    );
    const target = path.join(dir, 'snapshot.json');
    const output = runExpectingFailure(['--fixtures', dir, '--out', target]);
    expect(output).toMatch(/ABORT \(previous snapshot kept\)/);
    expect(output).toMatch(/0 rows/);
    expect(existsSync(target)).toBe(false);
  });

  /**
   * A 200 with an empty schedule array is legitimate for a school that has published nothing, so
   * the client does not throw for it — but for a team we already hold games for it is an upstream
   * blip, and taking it at face value would silently delete that team's non-league games.
   */
  it('treats an empty schedule feed for a team we already have games for as a failure', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-empty-schedule-'));
    copyFixtureFiles(dir);
    const target = path.join(dir, 'snapshot.json');
    // 1. a good run, so there is a previous snapshot with Cupertino's games in it.
    run(['--fixtures', dir, '--out', target, '--fetched-at', '2026-09-29T15:00:00.000Z']);
    const before = parseSnapshot(JSON.parse(readFileSync(target, 'utf8')) as unknown);
    const cupertino = before.teams.find((t) => t.slug === 'cupertino')!;
    const had = before.games.filter(
      (g) => g.home.teamId === cupertino.id || g.away.teamId === cupertino.id,
    ).length;
    expect(had).toBeGreaterThan(0);

    // 2. the same run with Cupertino's feed emptied.
    writeFileSync(
      path.join(dir, 'sched-cupertino.json'),
      JSON.stringify({ status: 200, message: 'Success', data: [] }),
      'utf8',
    );
    const output = run(['--fixtures', dir, '--out', target, '--fetched-at', '2026-09-29T16:00:00.000Z']);
    expect(output).toMatch(/WARN cupertino schedule failed: schedule feed returned 0 rows/);
    expect(output).toMatch(/carried forward \d+ game\(s\)/);

    const after = parseSnapshot(JSON.parse(readFileSync(target, 'utf8')) as unknown);
    expect(
      after.games.filter(
        (g) => g.home.teamId === cupertino.id || g.away.teamId === cupertino.id,
      ).length,
    ).toBe(had);
    expect(after.sources.find((s) => s.label === 'cupertino schedule')?.status).toBe('stale');
  });
});

describe('fetch-data: SPEC §5.3 never blank a section', () => {
  it('carries the official fixtures, cross-check and their game annotations forward', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-carry-'));
    const target = path.join(dir, 'snapshot.json');
    // The committed snapshot HAS the secondary sections; an offline run produces none of them.
    copyFileSync(path.join(REPO, 'data', 'snapshot.json'), target);
    const previous = parseSnapshot(JSON.parse(readFileSync(target, 'utf8')) as unknown);
    expect(previous.officialFixtures?.length).toBeGreaterThan(0);
    expect(previous.sbliveCrossCheck).toBeDefined();

    const output = run(['--fixtures', FIXTURE_DIR, '--out', target, '--fetched-at', '2026-09-29T15:00:00.000Z']);
    expect(output).toMatch(/carried forward \d+ official fixture\(s\)/);

    const next = parseSnapshot(JSON.parse(readFileSync(target, 'utf8')) as unknown);
    expect(next.officialFixtures?.length).toBe(previous.officialFixtures?.length);
    expect(next.sbliveCrossCheck?.compared).toBe(previous.sbliveCrossCheck?.compared);
    // The per-game annotations come back with it, for every contest still in the feed.
    const stillHere = new Set(next.games.map((g) => g.contestId));
    const wantOfficial = previous.games.filter((g) => g.official && stillHere.has(g.contestId));
    expect(wantOfficial.length).toBeGreaterThan(0);
    for (const g of wantOfficial) {
      expect(next.games.find((n) => n.contestId === g.contestId)?.official).toEqual(g.official);
    }
    // And the sources say "carried forward", not "current".
    const scval = next.sources.find((s) => s.label === 'de-anza official schedule PDF');
    expect(scval?.status).toBe('stale');
    expect(scval?.error).toMatch(/carried forward/);
  });
});

describe('fetch-data: the secondary-source flags', () => {
  it('honours --no-sblive / --no-scval / --no-ccs / --no-vnn', () => {
    // Offline already skips them; the flags must be accepted and must say so.
    const out = run([
      '--fixtures',
      FIXTURE_DIR,
      '--dry-run',
      '--no-sblive',
      '--no-scval',
      '--no-ccs',
      '--no-vnn',
    ]);
    expect(out).toMatch(/sblive: skipped \(--no-sblive\)/);
    expect(out).toMatch(/scval: skipped \(--no-scval\)/);
    expect(out).toMatch(/ccs: skipped \(--no-ccs\)/);
    expect(out).toMatch(/vnn: skipped \(--no-vnn\)/);
  });
});
