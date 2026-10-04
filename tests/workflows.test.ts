/**
 * update-data.yml and deploy-cloudflare.yml must agree on what a data commit is; update-people.yml
 * (at the end) must only ever propose, on its own branch.
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
import { getHistoryLeagues } from '../lib/history';
import { LEAGUE_IDS, TOURNAMENT_LEAGUE_IDS } from '../lib/leagues';
import { loadSnapshot } from '../lib/snapshot-schema';
import { REPO } from './helpers';

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
      expect(text).toContain('node scripts/assert-vinext-prerender.mjs --cloudflare');
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

  /** A league section for every league, a division anchor inside each available one. */
  function historyBody(omit: string[] = []): string {
    return getHistoryLeagues()
      .filter(({ id }) => !omit.includes(id))
      .map(({ id, entry }) =>
        `<section id="${id}">${
          entry.status === 'available' ? entry.divisions.map((d) => `<section id="${d.division}"></section>`).join('') : ''
        }</section>`,
      )
      .join('');
  }

  function tree(extra: Record<string, string>): string {
    const root = mkdtempSync(path.join(tmpdir(), 'scvalfh-prerender-'));
    const app = path.join(root, '.next', 'server', 'app');
    const put = (rel: string, body = '') => {
      mkdirSync(path.dirname(path.join(app, rel)), { recursive: true });
      writeFileSync(path.join(app, rel), body);
    };
    for (const p of ['index', 'about', 'standings', 'schedule', 'playoffs', 'teams', 'leaders', 'clubs', 'commits']) {
      put(`${p}.html`);
    }
    // The history page: a section per league, and a division anchor for every available league.
    put('history/2025-26.html', historyBody());
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
    const res = spawnSync(
      path.join(REPO, 'node_modules', '.bin', 'tsx'),
      [path.join(REPO, 'scripts', 'assert-prerender.ts')],
      { cwd: root, encoding: 'utf8', env: { ...process.env, SCVAL_SNAPSHOT: SNAPSHOT } },
    );
    if (res.error) throw res.error;
    return { status: res.status, output: `${res.stdout}${res.stderr}` };
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

  it('fails a history page that lost a league section, naming it', () => {
    const r = run(tree({ 'history/2025-26.html': historyBody(['pcal']) }));
    expect(r.output).toContain('FAIL history/2025-26: no section id="pcal"');
    expect(r.status).toBe(1);
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
 * update-people.yml: the weekly roster refresh that proposes, never commits to main
 * (docs/WEEKLY-PEOPLE.md). Its branch handling decides whether a week's research survives the next
 * roster run, so the two steps that touch the branch run here for real, against a bare remote in a
 * scratch directory, with a stub `gh` that answers the two PR lookups.
 */
describe('update-people.yml', () => {
  const people = read('update-people.yml');
  const doc = readFileSync(path.join(REPO, 'docs', 'WEEKLY-PEOPLE.md'), 'utf8');
  const branch = /^ {2}BRANCH: (\S+)$/m.exec(people)?.[1] ?? '';
  const title = /^ {2}PR_TITLE: '([^']+)'$/m.exec(people)?.[1] ?? '';

  it('names the branch and the PR title the research runbook names', () => {
    expect(branch).toBe('data/weekly-people');
    expect(doc).toContain(`**\`${branch}\`**`);
    expect(doc).toContain(`**"${title}"**`);
  });

  it('pushes only to its own branch, never to main', () => {
    const pushes = [...people.matchAll(/git push [^\n]+/g)].map((m) => m[0]);
    expect(pushes.length).toBeGreaterThan(0);
    for (const p of pushes) expect(p, p).toMatch(/^git push (--force )?origin "HEAD:refs\/heads\/\$BRANCH"( \|\| \{)?$/);
    expect(people).not.toMatch(/git push[^\n]*\bmain\b/);
  });

  it('commits only data/rosters.json, with a message the deploy gate never ships untested', () => {
    expect([...new Set([...people.matchAll(/^\s*git add ([^\n]+)$/gm)].map((m) => m[1].trim()))]).toEqual(['data/rosters.json']);
    const messages = [...people.matchAll(/git commit -m "([^"$]+)/g)].map((m) => m[1]);
    expect(messages).toEqual(['data: weekly rosters ']);
    for (const msg of messages) expect(gatePrefixes.some((p) => msg.startsWith(p)), msg).toBe(false);
  });

  it('is not a workflow the deploy follows, and the ci it dispatches can be dispatched', () => {
    expect(deploy).toMatch(/workflows: \[ci, update-data\]/);
    expect(read('ci.yml')).toMatch(/^ {2}workflow_dispatch:/m);
    expect(stepBody(people, 'Run ci on the branch')).toContain('gh workflow run ci.yml --ref "$BRANCH"');
  });

  it('passes the manual leagues input through env, validated, never interpolated into a script', () => {
    const fetch = stepBody(people, 'Fetch rosters');
    expect(fetch).toContain("LEAGUES: ${{ github.event_name == 'workflow_dispatch' && inputs.leagues || '' }}");
    expect(fetch).toContain('[[ "$LEAGUES" =~ ^[a-z0-9,-]+$ ]]');
    for (const m of people.matchAll(/run: \|\n((?: {10}[^\n]*\n|\n)+)/g)) expect(m[1]).not.toContain('inputs.');
  });

  /** A bare remote whose main holds a rosters file and a clubs file, and a clone of it, as checkout leaves it. */
  function remote() {
    const root = mkdtempSync(path.join(tmpdir(), 'scvalfh-people-'));
    const sh = (cwd: string, cmd: string) => {
      const r = spawnSync('bash', ['-e', '-c', cmd], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' },
      });
      if (r.status !== 0) throw new Error(`${cmd}: ${r.stderr}`);
      return r.stdout.trim();
    };
    sh(root, 'git init -q --bare -b main origin.git && git clone -q origin.git seed 2>/dev/null');
    const seed = path.join(root, 'seed');
    sh(seed, 'mkdir data && echo rosters-1 > data/rosters.json && echo clubs-1 > data/clubs.json && git add . && git commit -qm init && git push -q origin main');
    const bin = path.join(root, '.bin');
    mkdirSync(bin);
    writeFileSync(
      path.join(bin, 'gh'),
      [
        '#!/usr/bin/env bash',
        'case " $* " in',
        '  *" --state open "*) printf "%s\\n" "${OPEN_PR:-}" ;;',
        '  *" --state all "*) printf "%s\\n" "${SHOWN:-0}" ;;',
        '  *) echo "unexpected: gh $*" >&2; exit 2 ;;',
        'esac',
      ].join('\n'),
      { mode: 0o755 },
    );
    /** A clone, as actions/checkout with fetch-depth 0 leaves it, with update-people's env. */
    const checkout = () => {
      const dir = mkdtempSync(path.join(root, 'run-'));
      sh(dir, 'git clone -q ../origin.git . 2>/dev/null');
      return dir;
    };
    return { root, seed, bin, sh, checkout };
  }

  function runScript(script: string, cwd: string, bin: string, env: Record<string, string> = {}) {
    const output = path.join(cwd, '..', `${path.basename(cwd)}.out`);
    writeFileSync(output, '');
    const r = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: output, BRANCH: branch, ...env },
    });
    const outputs = Object.fromEntries(
      readFileSync(output, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    );
    return { code: r.status, log: `${r.stdout}${r.stderr}`, outputs };
  }

  describe('the branch it starts from', () => {
    const script = runBlock(stepBody(people, 'Start from the open pull request, or from main'));
    const file = (cwd: string, name: string) => readFileSync(path.join(cwd, 'data', name), 'utf8').trim();

    it('found the step', () => {
      expect(script).toContain('git merge --no-edit origin/main');
    });

    it('starts from main when the branch does not exist', () => {
      const r0 = remote();
      const dir = r0.checkout();
      const r = runScript(script, dir, r0.bin);
      expect(r.code, r.log).toBe(0);
      expect(r.outputs).toMatchObject({ continue: 'false', pr: '', remote: '' });
      expect(r0.sh(dir, 'git rev-parse HEAD')).toBe(r0.sh(dir, 'git rev-parse origin/main'));
    });

    it('builds on an open PR’s branch, merging main in, so last week’s research survives', () => {
      const r0 = remote();
      r0.sh(r0.seed, `git checkout -qb ${branch} && echo clubs-research > data/clubs.json && git commit -qam research && git push -q origin ${branch}`);
      r0.sh(r0.seed, 'git checkout -q main && echo other > other.txt && git add other.txt && git commit -qm main-moved && git push -q origin main');
      const dir = r0.checkout();
      const r = runScript(script, dir, r0.bin, { OPEN_PR: '42' });
      expect(r.code, r.log).toBe(0);
      expect(r.outputs).toMatchObject({ continue: 'true', pr: '42' });
      expect(file(dir, 'clubs.json')).toBe('clubs-research');
      expect(r0.sh(dir, 'cat other.txt')).toBe('other');
      expect(r0.sh(dir, 'git rev-parse --abbrev-ref HEAD')).toBe(branch);
    });

    it('takes main’s rosters on a rosters conflict, since the run rebuilds them', () => {
      const r0 = remote();
      r0.sh(r0.seed, `git checkout -qb ${branch} && echo rosters-branch > data/rosters.json && git commit -qam weekly && git push -q origin ${branch}`);
      r0.sh(r0.seed, 'git checkout -q main && echo rosters-main > data/rosters.json && git commit -qam by-hand && git push -q origin main');
      const dir = r0.checkout();
      const r = runScript(script, dir, r0.bin, { OPEN_PR: '42' });
      expect(r.code, r.log).toBe(0);
      expect(file(dir, 'rosters.json')).toBe('rosters-main');
      expect(r0.sh(dir, 'git status --porcelain')).toBe('');
    });

    it('stops on a conflict in research, leaving it for a person', () => {
      const r0 = remote();
      r0.sh(r0.seed, `git checkout -qb ${branch} && echo clubs-branch > data/clubs.json && git commit -qam research && git push -q origin ${branch}`);
      r0.sh(r0.seed, 'git checkout -q main && echo clubs-main > data/clubs.json && git commit -qam by-hand && git push -q origin main');
      const dir = r0.checkout();
      const r = runScript(script, dir, r0.bin, { OPEN_PR: '42' });
      expect(r.code).toBe(1);
      expect(r.log).toContain('conflicts in: data/clubs.json');
      expect(r0.sh(dir, 'git status --porcelain')).toBe('');
    });

    it('starts over from main once the PR’s branch is merged', () => {
      const r0 = remote();
      r0.sh(r0.seed, `git checkout -qb ${branch} && echo rosters-2 > data/rosters.json && git commit -qam weekly && git push -q origin ${branch}`);
      r0.sh(r0.seed, `git checkout -q main && git merge -q --no-ff -m merged ${branch} && git push -q origin main`);
      const dir = r0.checkout();
      const r = runScript(script, dir, r0.bin);
      expect(r.code, r.log).toBe(0);
      expect(r.outputs.continue).toBe('false');
      expect(r0.sh(dir, 'git rev-parse HEAD')).toBe(r0.sh(dir, 'git rev-parse origin/main'));
    });

    it('starts over when the tip is the head of a closed or squash-merged PR', () => {
      const r0 = remote();
      r0.sh(r0.seed, `git checkout -qb ${branch} && echo rosters-2 > data/rosters.json && git commit -qam weekly && git push -q origin ${branch}`);
      const dir = r0.checkout();
      const r = runScript(script, dir, r0.bin, { SHOWN: '1' });
      expect(r.code, r.log).toBe(0);
      expect(r.outputs.continue).toBe('false');
    });

    it('keeps commits no PR has shown, building on them', () => {
      const r0 = remote();
      r0.sh(r0.seed, `git checkout -qb ${branch} && echo clubs-orphan > data/clubs.json && git commit -qam research && git push -q origin ${branch}`);
      const dir = r0.checkout();
      const r = runScript(script, dir, r0.bin, { SHOWN: '0' });
      expect(r.code, r.log).toBe(0);
      expect(r.outputs.continue).toBe('true');
      expect(r.log).toContain('has commits no pull request has shown');
      expect(file(dir, 'clubs.json')).toBe('clubs-orphan');
    });
  });

  describe('the push', () => {
    const script = runBlock(stepBody(people, 'Push the branch'));

    function setup(onBranch: boolean) {
      const r0 = remote();
      if (onBranch) r0.sh(r0.seed, `git checkout -qb ${branch} && echo clubs-research > data/clubs.json && git commit -qam research && git push -q origin ${branch} && git checkout -q main`);
      const dir = r0.checkout();
      r0.sh(dir, `git config user.name t && git config user.email t@example.com && git checkout -qB ${branch} origin/${onBranch ? branch : 'main'}`);
      const tip = onBranch ? r0.sh(dir, `git rev-parse origin/${branch}`) : '';
      return { ...r0, dir, tip };
    }

    it('pushes nothing when nothing moved', () => {
      const fresh = setup(false);
      expect(runScript(script, fresh.dir, fresh.bin, { CONTINUE: 'false', REMOTE: '' }).outputs.pushed).toBe('false');
      const cont = setup(true);
      expect(runScript(script, cont.dir, cont.bin, { CONTINUE: 'true', REMOTE: cont.tip }).outputs.pushed).toBe('false');
    });

    it('force-pushes a restarted branch over the merged one', () => {
      const s = setup(true);
      s.sh(s.dir, 'git reset -q --hard origin/main && echo rosters-2 > data/rosters.json && git commit -qam weekly');
      const r = runScript(script, s.dir, s.bin, { CONTINUE: 'false', REMOTE: s.tip });
      expect(r.code, r.log).toBe(0);
      expect(r.outputs.pushed).toBe('true');
      expect(s.sh(s.seed, `git fetch -q origin && git rev-parse origin/${branch}`)).toBe(s.sh(s.dir, 'git rev-parse HEAD'));
    });

    it('takes research pushed meanwhile and pushes again, never over it', () => {
      const s = setup(true);
      s.sh(s.dir, 'echo rosters-2 > data/rosters.json && git commit -qam weekly');
      // The Routine pushes while this run is going.
      s.sh(s.seed, `git checkout -q ${branch} && echo commits-research > data/commits.json && git add data/commits.json && git commit -qm more && git push -q origin ${branch}`);
      const r = runScript(script, s.dir, s.bin, { CONTINUE: 'true', REMOTE: s.tip });
      expect(r.code, r.log).toBe(0);
      expect(r.outputs.pushed).toBe('true');
      s.sh(s.seed, `git pull -q origin ${branch}`);
      expect(s.sh(s.seed, 'cat data/commits.json data/rosters.json')).toBe('commits-research\nrosters-2');
    });
  });
});
