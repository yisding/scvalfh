/**
 * update-data.yml and deploy-cloudflare.yml must agree on what a data commit is.
 *
 * deploy-cloudflare ships main's tip without a ci run of its own only when every commit above the
 * last ci-tested one is recognisably update-data's: by the bot, one parent, a message with one of
 * the gate's prefixes, and nothing but the gate's data files. Both halves live in YAML shell, so a
 * new data file or a reworded message on one side silently stops deploys (or, worse, widens what
 * ships untested). These read both files as text and hold them to each other.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getClubSlugs } from '../lib/clubs';
import { gameIdToParam } from '../lib/game-id';
import { LEAGUE_IDS, TOURNAMENT_LEAGUE_IDS } from '../lib/leagues';
import { loadSnapshot } from '../lib/snapshot-schema';
import { REPO, runScript } from './helpers';

const read = (name: string) => readFileSync(path.join(REPO, '.github', 'workflows', name), 'utf8');
const update = read('update-data.yml');
const deploy = read('deploy-cloudflare.yml');

/** Every path update-data stages: the arguments of its `git add` lines. */
const committedFiles = new Set(
  [...update.matchAll(/^\s*git add ([^\n]+)$/gm)].flatMap((m) => m[1].trim().split(/\s+/)),
);

/** The literal start of every message update-data commits with, up to its first `$`. */
const messagePrefixes = [...update.matchAll(/git commit -m "([^"$]+)/g)].map((m) => m[1]);

/** The prefixes the gate accepts, from its `startswith("…")` tests. */
const gatePrefixes = [...deploy.matchAll(/startswith\("([^"]+)"\)/g)].map((m) => m[1]);

/** The files the gate lets change above the ci-tested commit: the array its jq subtracts. */
const gateFiles = (() => {
  const m = /\[\.files\[\]\?\.filename\] - \[([^\]]+)\]/.exec(deploy);
  return new Set(m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : []);
})();

describe('the update-data commit and the deploy gate', () => {
  it('found what it reads in both files', () => {
    expect(committedFiles.size).toBeGreaterThan(0);
    expect(messagePrefixes.length).toBeGreaterThan(0);
    expect(gatePrefixes.length).toBeGreaterThan(0);
    expect(gateFiles.size).toBeGreaterThan(0);
  });

  it('commits only files the gate accepts, and the gate accepts nothing else', () => {
    expect([...committedFiles].sort()).toEqual([...gateFiles].sort());
    expect([...gateFiles].sort()).toEqual([
      'data/player-stats.json',
      'data/snapshot.json',
      'data/snapshot.meta.json',
    ]);
  });

  it('every commit message is one the gate recognises, and every prefix is used', () => {
    for (const msg of messagePrefixes) {
      expect(
        gatePrefixes.some((p) => msg.startsWith(p)),
        `"${msg}" matches none of ${JSON.stringify(gatePrefixes)}`,
      ).toBe(true);
    }
    for (const p of gatePrefixes) {
      expect(messagePrefixes.some((msg) => msg.startsWith(p)), `gate prefix "${p}" is never committed`).toBe(true);
    }
  });

  it('commits as the bot the gate looks for', () => {
    expect(update).toMatch(/git config user\.name {2}"github-actions\[bot\]"/);
    expect(deploy).toContain('(.author.login // "") == "github-actions[bot]"');
  });
});

describe('the player stats step', () => {
  const step = stepBody(update, 'Fetch player stats');

  it('runs the stats script, after the snapshot and before the tests', () => {
    expect(step).toContain('pnpm fetch-player-stats "${args[@]}"');
    const at = (s: string) => update.indexOf(s);
    expect(at('- name: Fetch data')).toBeLessThan(at('- name: Fetch player stats'));
    expect(at('- name: Fetch player stats')).toBeLessThan(at('- name: Test'));
  });

  it('can never fail the run: a stats outage must not cost the day’s scores', () => {
    expect(step).toMatch(/continue-on-error: true/);
  });

  it('passes the manual force and leagues inputs through env, as fetch-data does, validated', () => {
    expect(step).toContain("FORCE: ${{ github.event_name == 'workflow_dispatch' && inputs.force && '1' || '' }}");
    expect(step).toContain("LEAGUES: ${{ github.event_name == 'workflow_dispatch' && inputs.leagues || '' }}");
    expect(step).toContain('[ -n "$FORCE" ] && args+=(--force)');
    expect(step).toContain('[[ "$LEAGUES" =~ ^[a-z0-9,-]+$ ]]');
    expect(step).toContain('args+=(--leagues "$LEAGUES")');
    // Never interpolated into the script itself.
    expect(step.slice(step.indexOf('run: |'))).not.toContain('inputs.');
  });

  it('is not described as SCVAL-only: it covers every league', () => {
    expect(update).not.toMatch(/SCVAL[- ]only/i);
    expect(update).not.toMatch(/15 SCVAL teams/);
  });
});

/**
 * The Test step runs after the stats step, which is allowed to fail; a stats file the suite refuses
 * must not cost the snapshot commit either. The step's own shell runs here, in a scratch git repo
 * whose `pnpm test` fails whenever a data file says "bad".
 */
describe('the Test step never lets a stats file block the snapshot', () => {
  const step = stepBody(update, 'Test');
  const script = runBlock(step);
  const committed = '{"stats":"good"}\n';

  function repo(files: { stats?: string; snapshot?: string }) {
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-test-step-'));
    const git = (...args: string[]) => {
      const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: dir, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    };
    mkdirSync(path.join(dir, 'data'));
    writeFileSync(path.join(dir, 'data', 'player-stats.json'), committed);
    writeFileSync(path.join(dir, 'data', 'snapshot.json'), '{"snapshot":"good"}\n');
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
    // What this run's fetch steps wrote.
    if (files.stats) writeFileSync(path.join(dir, 'data', 'player-stats.json'), files.stats);
    if (files.snapshot) writeFileSync(path.join(dir, 'data', 'snapshot.json'), files.snapshot);
    const bin = path.join(dir, '.bin');
    mkdirSync(bin);
    // `pnpm test` passes unless a data file says "bad"; every call is logged.
    writeFileSync(
      path.join(bin, 'pnpm'),
      '#!/usr/bin/env bash\necho "pnpm $*" >> "$CALLS"\n! grep -q bad data/player-stats.json data/snapshot.json\n',
      { mode: 0o755 },
    );
    return { dir, bin };
  }

  function runStep(files: { stats?: string; snapshot?: string }) {
    const { dir, bin } = repo(files);
    const output = path.join(dir, '.github-output');
    const calls = path.join(dir, '.calls');
    writeFileSync(output, '');
    writeFileSync(calls, '');
    // GitHub's default shell for `run:` on ubuntu is `bash -e -o pipefail`.
    const res = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: output, CALLS: calls },
    });
    return {
      code: res.status,
      stats: readFileSync(path.join(dir, 'data', 'player-stats.json'), 'utf8'),
      output: readFileSync(output, 'utf8'),
      calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean),
    };
  }

  it('found the step and its script', () => {
    expect(step).toContain('id: test');
    expect(step).not.toMatch(/continue-on-error/);
    expect(script).toContain('git checkout -- data/player-stats.json');
  });

  it('passes as it is when the suite passes, keeping the new stats', () => {
    const r = runStep({ stats: '{"stats":"new"}\n' });
    expect(r.code).toBe(0);
    expect(r.stats).toBe('{"stats":"new"}\n');
    expect(r.calls).toEqual(['pnpm test']);
    expect(r.output).toBe('');
  });

  it('restores the committed stats file and passes when only the new one failed the suite', () => {
    const r = runStep({ stats: '{"stats":"bad"}\n' });
    expect(r.code).toBe(0);
    expect(r.stats).toBe(committed);
    expect(r.calls).toEqual(['pnpm test', 'pnpm test']);
    expect(r.output).toContain('stats_restored=true');
  });

  it('still fails when the suite fails with the committed stats file restored', () => {
    const r = runStep({ stats: '{"stats":"bad"}\n', snapshot: '{"snapshot":"bad"}\n' });
    expect(r.code).toBe(1);
    expect(r.stats).toBe(committed);
    expect(r.calls).toEqual(['pnpm test', 'pnpm test']);
  });

  it('fails at once, restoring nothing, when the stats file did not change', () => {
    const r = runStep({ snapshot: '{"snapshot":"bad"}\n' });
    expect(r.code).toBe(1);
    expect(r.calls).toEqual(['pnpm test']);
    expect(r.output).toBe('');
  });

  it('runs before the commit step, which reads the restored file as no stats change', () => {
    expect(update.indexOf('- name: Test')).toBeLessThan(update.indexOf('- name: Commit the data that changed'));
    expect(stepBody(update, 'Commit the data that changed')).toContain(
      'if git diff --quiet -- data/player-stats.json; then STATS=false; else STATS=true; fi',
    );
  });
});

/** The `run: |` block of a step, dedented: the shell GitHub runs. */
function runBlock(step: string): string {
  const lines = step.split('\n');
  const at = lines.findIndex((l) => /^\s*run: \|\s*$/.test(l));
  if (at < 0) return '';
  const body: string[] = [];
  let indent = -1;
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    const n = line.length - line.trimStart().length;
    if (indent < 0) indent = n;
    if (n < indent) break;
    body.push(line.slice(indent));
  }
  return `${body.join('\n').trimEnd()}\n`;
}

/** The body of one named step: from its `- name:` line to the next step (or the file's end). */
function stepBody(text: string, name: string): string {
  const start = text.indexOf(`- name: ${name}\n`);
  if (start < 0) return '';
  const rest = text.slice(start + 1);
  const next = rest.search(/\n\s*- (name|uses): /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('the teamViews budget gates ci, never the data cron', () => {
  it('ci.yml sets CI_GATE on its Test step', () => {
    const test = stepBody(read('ci.yml'), 'Test');
    expect(test).toContain('run: pnpm test');
    expect(test).toMatch(/env:\s*\n\s*CI_GATE: '1'/);
  });

  it('update-data.yml and deploy-cloudflare.yml never set CI_GATE', () => {
    expect(stepBody(update, 'Test')).toMatch(/^\s*pnpm test$/m);
    for (const text of [update, deploy]) expect(text).not.toMatch(/^\s*CI_GATE:/m);
  });
});

describe('the manual fetch inputs', () => {
  const fetch = stepBody(update, 'Fetch data');

  it('passes accept_regression as --accept-regression, through env and validated', () => {
    expect(update).toMatch(/^ {6}accept_regression:\n {8}description: /m);
    expect(fetch).toContain("ACCEPT_REGRESSION: ${{ github.event_name == 'workflow_dispatch' && inputs.accept_regression || '' }}");
    expect(fetch).toContain('[[ "$ACCEPT_REGRESSION" =~ ^[a-z0-9,-]+$ ]]');
    expect(fetch).toContain('args+=(--accept-regression "$ACCEPT_REGRESSION")');
    // Never interpolated into the script itself.
    expect(fetch.slice(fetch.indexOf('run: |'))).not.toContain('inputs.');
  });
});

describe('the Stage D gate runs the cloudflare job’s checks', () => {
  const ci = read('ci.yml');
  const gate = readFileSync(path.join(REPO, 'scripts', 'stage-gate-d.sh'), 'utf8');

  it('requires the Build Output config and fails on an env file in the Worker output', () => {
    for (const text of [ci, gate]) {
      expect(text).toContain('pnpm exec tsx scripts/assert-vinext-prerender.ts --cloudflare');
      expect(text).toContain('pnpm exec tsx scripts/assert-budgets.ts --worker-only');
      expect(text).toContain('test -f .cloudflare/output/v0/config.json');
      expect(text).toContain(`find .cloudflare/output \\( -name '.dev.vars*' -o -name '.env*' \\) -print`);
    }
  });
});

/**
 * scripts/assert-prerender.ts over a synthetic `.next/server/app` that holds exactly what the
 * build prerenders for data/snapshot.json and data/clubs.json, plus whatever a case adds. `next
 * start` caches the 404 of an unknown param's opengraph-image there (a 0-byte `.body` + a `.meta`
 * with status 404), so the assertion must still pass on a `.next` that has served the smoke script
 * or a crawler.
 */
describe('assert:prerender on a .next that has served traffic', () => {
  const SNAPSHOT = path.join(REPO, 'data', 'snapshot.json');
  // Loaded as the build (and the script) loads it: a file written before a league was added is upgraded.
  const snapshot = loadSnapshot(JSON.parse(readFileSync(SNAPSHOT, 'utf8')));
  const OK_META = JSON.stringify({ status: 200, headers: { 'content-type': 'image/png' } });
  const NOT_FOUND_META = JSON.stringify({ headers: {}, status: 404 });

  function tree(extra: Record<string, string>): string {
    const root = mkdtempSync(path.join(tmpdir(), 'scvalfh-prerender-'));
    const app = path.join(root, '.next', 'server', 'app');
    const put = (rel: string, body = '') => {
      mkdirSync(path.dirname(path.join(app, rel)), { recursive: true });
      writeFileSync(path.join(app, rel), body);
    };
    for (const p of ['index', 'about', 'standings', 'schedule', 'playoffs', 'teams', 'leaders', 'history/2025-26', 'clubs', 'commits']) {
      put(`${p}.html`);
    }
    put('opengraph-image.body');
    put('standings/opengraph-image.body');
    const families: Record<string, string[]> = {
      standings: [...LEAGUE_IDS],
      schedule: [...LEAGUE_IDS],
      playoffs: [...TOURNAMENT_LEAGUE_IDS],
      game: [
        ...snapshot.games.map((g) => gameIdToParam(g.contestId)),
        ...Object.keys(snapshot.supersededGames).map(gameIdToParam),
      ],
      scores: [...new Set(snapshot.games.map((g) => g.dateKey))],
      teams: snapshot.teams.map((t) => t.slug),
    };
    // A team page carries both sections on every team, in every league.
    const body = (family: string) =>
      family === 'teams' ? '<main><section id="player-stats"></section><section id="roster"></section></main>' : '';
    for (const [family, params] of Object.entries(families)) {
      for (const p of params) {
        put(`${family}/${p}.html`, body(family));
        put(`${family}/${p}/opengraph-image.body`, 'png');
        put(`${family}/${p}/opengraph-image.meta`, OK_META);
      }
    }
    // One page per club of data/clubs.json (DESIGN §17), and no OG card: the clubs pages take the
    // root one.
    for (const slug of getClubSlugs()) put(`clubs/${slug}.html`);
    for (const [rel, body] of Object.entries(extra)) put(rel, body);
    return root;
  }

  function run(root: string) {
    return runScript('scripts/assert-prerender.ts', [], { cwd: root, env: { ...process.env, SCVAL_SNAPSHOT: SNAPSHOT } });
  }

  const notFound = (rel: string) => ({ [`${rel}.body`]: '', [`${rel}.meta`]: NOT_FOUND_META });

  it('passes on the build alone', () => {
    const r = run(tree({}));
    expect(r.output).toContain('assert-prerender: ok');
    expect(r.status).toBe(0);
  });

  it('ignores the opengraph-image 404s next start cached for unknown params', () => {
    const r = run(
      tree({
        ...notFound('standings/nope/opengraph-image'),
        ...notFound('standings/__proto__/opengraph-image'),
        ...notFound('schedule/nope/opengraph-image'),
        ...notFound('playoffs/scval/opengraph-image'),
        ...notFound('scores/2026-01-01/opengraph-image'),
        ...notFound('teams/nope/opengraph-image'),
        ...notFound('game/sblive:1/opengraph-image'),
      }),
    );
    expect(r.output).toContain('ignoring 7 opengraph-image 404(s)');
    expect(r.output).toContain('assert-prerender: ok');
    expect(r.status).toBe(0);
  });

  it('fails a team page that lost its Roster or Player stats section, naming the team', () => {
    const slug = snapshot.teams[30].slug; // a BVAL/PCAL/MCAL team, not an SCVAL one
    const r = run(tree({ [`teams/${slug}.html`]: '<main><section id="roster"></section></main>' }));
    expect(r.output).toContain(`team page section(s) missing: ${slug} (#player-stats)`);
    expect(r.status).toBe(1);
  });

  it('fails a clubs page that is not a club of data/clubs.json, or a club with no page, naming it', () => {
    const extra = run(tree({ 'clubs/nope.html': '' }));
    expect(extra.output).toContain('FAIL clubs/: 1 unexpected page(s) prerendered: nope');
    expect(extra.status).toBe(1);

    const root = tree({});
    const slug = getClubSlugs()[0];
    rmSync(path.join(root, '.next', 'server', 'app', 'clubs', `${slug}.html`));
    const missing = run(root);
    expect(missing.output).toContain(`FAIL clubs/: 1 expected page(s) not prerendered: ${slug}`);
    expect(missing.status).toBe(1);
  });

  it('still fails on a served card without its page, with or without a .meta', () => {
    const extras: Array<Record<string, string>> = [
      { 'standings/nope/opengraph-image.body': 'png', 'standings/nope/opengraph-image.meta': OK_META },
      { 'standings/nope/opengraph-image.body': 'png' },
    ];
    for (const extra of extras) {
      const r = run(tree(extra));
      expect(r.output).toContain('FAIL standings/: opengraph-image without its page: standings/nope/opengraph-image');
      expect(r.status).toBe(1);
    }
  });
});

/**
 * scripts/assert-vinext-prerender.ts reports like the other build-output gates: a missing build is
 * one line and exit 1, never a stack trace.
 */
describe('assert-vinext-prerender before a vinext build', () => {
  it('fails in one line, naming the file it needs and the build that writes it', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'scvalfh-vinext-'));
    const res = runScript('scripts/assert-vinext-prerender.ts', [], { cwd: root });
    expect(res.stderr.trim()).toBe(
      'assert-vinext-prerender: dist/server/vinext-prerender.json does not exist; ' +
        'run `pnpm build:vinext` (or `pnpm build:cloudflare`) first',
    );
    expect(res.status).toBe(1);
  });
});
